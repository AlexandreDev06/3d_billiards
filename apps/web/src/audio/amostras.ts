import type { ConfigAmostras } from '../config';
import type { PedidoDeSom } from './mapeamento';
import type { Gerador, SaidaDeSom, SomPreparado } from './motor-audio';

export type FormatoDeSom = 'ogg' | 'mp3';

/** Uma variação de um evento, como o manifesto (`public/sons/manifesto.json`) a descreve. */
export interface VariacaoDoManifesto {
  readonly id: string;
  readonly arquivos: Readonly<Record<FormatoDeSom, string>>;
  /** Multiplicador (0 a 1,5) aplicado antes do volume do pedido; as amostras já estão em ~−1 dBFS. */
  readonly ganho: number;
  readonly duracaoMs: number;
  /** Faixa de intensidade (0 a 1) em que ela é a certa; `null` = serve para qualquer uma (sons de interface). */
  readonly intensidade: readonly [number, number] | null;
}

export interface ManifestoDeSons {
  readonly eventos: Readonly<Record<string, readonly VariacaoDoManifesto[]>>;
}

const NOME_DE_ARQUIVO = /^[A-Za-z0-9_-]+\.(ogg|mp3)$/;
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function lerFaixa(bruto: unknown): readonly [number, number] | null | undefined {
  if (bruto === undefined) return null;
  if (!Array.isArray(bruto) || bruto.length !== 2) return undefined;
  const [minimo, maximo] = bruto as unknown[];
  if (typeof minimo !== 'number' || typeof maximo !== 'number') return undefined;
  if (!(minimo >= 0 && maximo <= 1 && minimo <= maximo)) return undefined;
  return [minimo, maximo];
}

function lerVariacao(bruta: unknown): VariacaoDoManifesto | null {
  if (!ehObjeto(bruta)) return null;
  const { id, ogg, mp3, ganho, duracaoMs } = bruta;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof ogg !== 'string' || !NOME_DE_ARQUIVO.test(ogg) || typeof mp3 !== 'string' || !NOME_DE_ARQUIVO.test(mp3)) return null;
  if (typeof ganho !== 'number' || !(ganho > 0 && ganho <= 1.5)) return null;
  if (typeof duracaoMs !== 'number' || !(duracaoMs > 0 && duracaoMs <= 10_000)) return null;
  const intensidade = lerFaixa(bruta['intensidade']);
  if (intensidade === undefined) return null;
  return { id, arquivos: { ogg, mp3 }, ganho, duracaoMs, intensidade };
}

/**
 * O manifesto vindo da rede, conferido (os arquivos ficam na mesma pasta dele; o campo `base` do JSON não é usado, para
 * funcionar sob qualquer `BASE_URL`): o que vier malformado (arquivo com caminho, ganho absurdo, faixa fora de 0–1)
 * sai da lista em vez de derrubar o som. `null` se nem a forma geral serve.
 */
export function lerManifesto(bruto: unknown): ManifestoDeSons | null {
  if (!ehObjeto(bruto) || !ehObjeto(bruto['eventos'])) return null;
  const eventos: Record<string, readonly VariacaoDoManifesto[]> = {};
  for (const [nome, lista] of Object.entries(bruto['eventos'])) {
    if (!Array.isArray(lista)) continue;
    const variacoes = lista.map(lerVariacao).filter((v): v is VariacaoDoManifesto => v !== null);
    if (variacoes.length > 0) eventos[nome] = variacoes;
  }
  return { eventos };
}

/** `ogg` quando o navegador toca Vorbis; senão `mp3` (Safari). */
export function formatoPreferido(tocaOgg: boolean): FormatoDeSom {
  return tocaOgg ? 'ogg' : 'mp3';
}

/** O navegador toca Ogg Vorbis? Sem elemento de áudio (ou com erro), não. */
export function navegadorTocaOgg(): boolean {
  try {
    return new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
  } catch {
    return false;
  }
}

function distanciaDaFaixa(variacao: Pick<VariacaoDoManifesto, 'intensidade'>, intensidade: number): number {
  const faixa = variacao.intensidade;
  if (faixa === null) return 0;
  if (intensidade < faixa[0]) return faixa[0] - intensidade;
  if (intensidade > faixa[1]) return intensidade - faixa[1];
  return 0;
}

/**
 * Qual variação toca para esta intensidade. As que têm a intensidade na faixa pesam 1; as que ficam até `folga` fora dela
 * pesam menos (0,5 na borda da faixa, 0 no fim da folga), e é sorteado entre todas, sem repetir `ultimaId` se houver outra
 * (dois choques seguidos de mesma força não soam iguais). Só uma variação possível: ela, mesmo repetida. `sortear` é um
 * número em [0, 1).
 */
export function escolherVariacao<V extends Pick<VariacaoDoManifesto, 'id' | 'intensidade'>>(
  variacoes: readonly V[],
  intensidade: number,
  ultimaId: string | null,
  sortear: () => number,
  folga: number,
): V {
  if (variacoes.length === 0) throw new RangeError('escolherVariacao: nenhuma variação');
  const medida = Number.isFinite(intensidade) ? Math.min(Math.max(intensidade, 0), 1) : 0.5;
  const candidatas: { variacao: V; peso: number }[] = [];
  for (const variacao of variacoes) {
    const d = distanciaDaFaixa(variacao, medida);
    if (d === 0) candidatas.push({ variacao, peso: 1 });
    else if (d < folga) candidatas.push({ variacao, peso: 0.5 * (1 - d / folga) });
  }
  if (candidatas.length === 0) {
    let melhor = variacoes[0]!;
    for (const variacao of variacoes) if (distanciaDaFaixa(variacao, medida) < distanciaDaFaixa(melhor, medida)) melhor = variacao;
    return melhor;
  }
  const semARepetida = candidatas.filter((c) => c.variacao.id !== ultimaId);
  const lista = semARepetida.length > 0 ? semARepetida : candidatas;
  const total = lista.reduce((soma, c) => soma + c.peso, 0);
  let alvo = sortear() * total;
  for (const c of lista) {
    alvo -= c.peso;
    if (alvo < 0) return c.variacao;
  }
  return lista[lista.length - 1]!.variacao;
}

/**
 * A velocidade de reprodução do toque: o tom do pedido (impacto forte = mais agudo) só em parte, mais um sorteio pequeno.
 * `ruido` em [0, 1).
 */
export function taxaDeReproducao(tom: number, ruido: number, cfg: Pick<ConfigAmostras, 'fatorTom' | 'variacaoDeTaxa'>): number {
  const bruta = 1 + (tom - 1) * cfg.fatorTom + (ruido - 0.5) * 2 * cfg.variacaoDeTaxa;
  return Math.min(Math.max(bruta, 0.5), 2);
}

/** O que o banco precisa do navegador; os testes passam falsos. */
export interface DependenciasDoBanco {
  /** Onde está o manifesto (URL absoluta ou da raiz). */
  readonly urlDoManifesto: string;
  readonly formato: FormatoDeSom;
  readonly buscarJson: (url: string) => Promise<unknown>;
  readonly buscarBytes: (url: string) => Promise<ArrayBuffer>;
  /** Só aceita um `AudioBuffer`; o falso dos testes devolve o que quiser. */
  readonly decodificar: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  readonly aviso?: (texto: string) => void;
}

export type EstadoDoBanco = 'ocioso' | 'carregando' | 'pronto' | 'falhou';

export interface VariacaoPronta {
  readonly variacao: VariacaoDoManifesto;
  readonly buffer: AudioBuffer;
}

/**
 * As amostras decodificadas, por evento. Carrega em segundo plano (manifesto, depois todos os arquivos do formato
 * escolhido ao mesmo tempo); o que falhar fica de fora e o evento cai na reserva sintetizada. Nunca lança.
 */
export class BancoDeAmostras {
  private readonly prontas = new Map<string, VariacaoPronta[]>();
  private estadoAtual: EstadoDoBanco = 'ocioso';
  private carga: Promise<void> | null = null;
  private falhas = 0;

  constructor(private readonly deps: DependenciasDoBanco) {}

  get estado(): EstadoDoBanco {
    return this.estadoAtual;
  }

  /** Arquivos que não carregaram (404, decodificação) ou 0. */
  get arquivosComFalha(): number {
    return this.falhas;
  }

  /** Quantas variações já estão decodificadas, em todos os eventos. */
  get quantasProntas(): number {
    let n = 0;
    for (const lista of this.prontas.values()) n += lista.length;
    return n;
  }

  /** As variações prontas do evento, na ordem do manifesto. */
  doEvento(evento: string): readonly VariacaoPronta[] {
    return this.prontas.get(evento) ?? EMPTY;
  }

  /** Começa a carregar (uma vez só: chamar de novo devolve a mesma promessa). A promessa nunca rejeita. */
  carregar(): Promise<void> {
    this.carga ??= this.executar();
    return this.carga;
  }

  private async executar(): Promise<void> {
    this.estadoAtual = 'carregando';
    const { aviso } = this.deps;
    let manifesto: ManifestoDeSons | null;
    try {
      manifesto = lerManifesto(await this.deps.buscarJson(this.deps.urlDoManifesto));
    } catch (erro) {
      aviso?.(`Sons: não consegui o manifesto (${descrever(erro)}). Fica o som sintetizado.`);
      manifesto = null;
    }
    if (!manifesto) {
      this.estadoAtual = 'falhou';
      return;
    }
    const pasta = this.deps.urlDoManifesto.slice(0, this.deps.urlDoManifesto.lastIndexOf('/') + 1);
    const tarefas: Promise<void>[] = [];
    const lotes = new Map<string, (VariacaoPronta | null)[]>();
    for (const [evento, variacoes] of Object.entries(manifesto.eventos)) {
      const lista: (VariacaoPronta | null)[] = variacoes.map(() => null);
      lotes.set(evento, lista);
      variacoes.forEach((variacao, i) => {
        const url = `${pasta}${variacao.arquivos[this.deps.formato]}`;
        tarefas.push(
          this.deps
            .buscarBytes(url)
            .then((bytes) => this.deps.decodificar(bytes))
            .then((buffer) => {
              lista[i] = { variacao, buffer };
            })
            .catch((erro: unknown) => {
              this.falhas++;
              aviso?.(`Sons: ${variacao.id} não carregou (${descrever(erro)}).`);
            }),
        );
      });
    }
    await Promise.all(tarefas);
    for (const [evento, lista] of lotes) {
      const boas = lista.filter((p): p is VariacaoPronta => p !== null);
      if (boas.length > 0) this.prontas.set(evento, boas);
    }
    this.estadoAtual = this.prontas.size > 0 ? 'pronto' : 'falhou';
  }
}

const EMPTY: readonly VariacaoPronta[] = [];

function descrever(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

const CORTE_S = 0.008;

/**
 * O gerador de um evento a partir das amostras do banco: escolhe a variação pela intensidade do pedido, sorteando sem
 * repetir a última, e toca com ganho do arquivo × volume do pedido e velocidade levemente variada. Sem nenhuma
 * variação pronta, `preparar` devolve `null` (quem usa o combina com a reserva).
 */
export function geradorDeAmostras(banco: BancoDeAmostras, evento: string, cfg: ConfigAmostras, sortear: () => number): Gerador {
  let ultimaId: string | null = null;
  return {
    preparar(pedido: PedidoDeSom): SomPreparado | null {
      const prontas = banco.doEvento(evento);
      if (prontas.length === 0) return null;
      const variacao = escolherVariacao(
        prontas.map((p) => p.variacao),
        pedido.intensidade,
        ultimaId,
        sortear,
        cfg.folgaDaFaixa,
      );
      const { buffer } = prontas.find((p) => p.variacao === variacao)!;
      ultimaId = variacao.id;
      const taxa = taxaDeReproducao(pedido.tom, sortear(), cfg);
      const atrasoS = (sortear() * cfg.atrasoMaxMs) / 1000;
      return {
        id: variacao.id,
        duracaoS: buffer.duration / taxa + atrasoS,
        tocar: (saida, quandoS) => tocarAmostra(saida, buffer, variacao.ganho * cfg.ganho * pedido.volume, taxa, quandoS + atrasoS),
      };
    },
  };
}

function tocarAmostra(saida: SaidaDeSom, buffer: AudioBuffer, ganho: number, taxa: number, quandoS: number): () => void {
  const { ctx, destino } = saida;
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  fonte.playbackRate.value = taxa;
  const g = ctx.createGain();
  g.gain.value = ganho;
  fonte.connect(g);
  g.connect(destino);
  fonte.onended = () => {
    fonte.disconnect();
    g.disconnect();
  };
  fonte.start(quandoS);
  return () => {
    const agora = ctx.currentTime;
    g.gain.cancelScheduledValues(agora);
    g.gain.setValueAtTime(g.gain.value, agora);
    g.gain.linearRampToValueAtTime(0, agora + CORTE_S);
    try {
      fonte.stop(agora + CORTE_S);
    } catch {
      // já parou sozinha
    }
  };
}

/** Toca o primeiro que souber: a amostra, e se ela não está pronta, a reserva. */
export function comReserva(primario: Gerador, reserva: Gerador): Gerador {
  return { preparar: (pedido) => primario.preparar(pedido) ?? reserva.preparar(pedido) };
}
