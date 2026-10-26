import type { EventoTacada } from '@sinuca/fisica';
import { gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';
import type { ConfigAudio } from '../config';
import { pedidoDeAviso, pedidoDoEvento, type NomeDoSom, type PedidoDeSom, type SomDeAviso } from './mapeamento';
import { LimitadorDeVozes, type Voz } from './vozes';

/** Onde os geradores ligam seus nós: o contexto, o destino (ganho geral) e um buffer de ruído branco. */
export interface SaidaDeSom {
  readonly ctx: BaseAudioContext;
  readonly destino: AudioNode;
  readonly ruido: AudioBuffer;
}

/** O que vai tocar para um pedido: já escolhido (variação, taxa de reprodução), ainda sem tocar. */
export interface SomPreparado {
  /** De onde veio: o id da variação da amostra, ou `sintetizado:<som>`. Só para contagem e diagnóstico. */
  readonly id: string;
  /** Quanto o som dura (s); o limitador usa para saber quando a vaga volta. */
  readonly duracaoS: number;
  /** Toca em `quandoS` (relógio do contexto). Devolve o corte antecipado. */
  tocar(saida: SaidaDeSom, quandoS: number): () => void;
}

/**
 * Um som do jogo. A fonte é trocável: amostra CC0 (§7) ou sintetizador de reserva, sem mexer em quem
 * despacha os eventos.
 */
export interface Gerador {
  /** Escolhe o que tocar para `pedido`; `null` = este gerador não tem o som agora (a amostra não carregou). */
  preparar(pedido: PedidoDeSom): SomPreparado | null;
}

export type Geradores = Readonly<Record<NomeDoSom, Gerador>>;

/** O contexto de áudio aberto, atrás de uma interface pequena (nos testes entra um falso). */
export interface Sessao {
  readonly saida: SaidaDeSom;
  agoraS(): number;
  rodando(): boolean;
  retomar(): void;
  /** Ganho geral (0–1) já com o mudo aplicado. */
  definirGanho(valor: number): void;
  fechar(): void;
}

export interface OpcoesMotorDeAudio {
  readonly cfg: ConfigAudio;
  readonly geradores: Geradores;
  /** Abre o contexto; só é chamada depois do primeiro gesto. `null`: sem Web Audio. */
  readonly abrir: () => Sessao | null;
  /** O contexto acabou de abrir (depois do primeiro gesto): hora de carregar as amostras em segundo plano. */
  readonly aoAbrir?: (sessao: Sessao) => void;
  readonly armazenamento?: ArmazenamentoMinimo | null;
}

export interface EstatisticasDeAudio {
  /** Todo evento da tacada recebido. */
  readonly eventos: number;
  /** Os que pedem som (sem parou nem fora-da-mesa) mais os avisos de interface. */
  readonly pedidos: number;
  /** Quantos dos pedidos foram avisos de interface (troca de vez, tempo esgotado). */
  readonly avisos: number;
  /** Pedidos que viraram voz. */
  readonly tocados: number;
  /** Pedidos abaixo do limite de audição. */
  readonly inaudiveis: number;
  readonly silenciados: number;
  /** Pedidos antes do contexto existir ou rodar. */
  readonly semContexto: number;
  /** Pedidos sem vaga. */
  readonly recusadas: number;
  /** Pedidos que nenhum gerador soube tocar (amostra sem carregar e sem reserva). */
  readonly semGerador: number;
  /** Quantas vezes cada variação (id da amostra, ou `sintetizado:<som>`) tocou. */
  readonly porId: Readonly<Record<string, number>>;
  /** Vozes cortadas para dar lugar a outras mais altas. */
  readonly roubadas: number;
  readonly picoDeVozes: number;
}

const CHAVE = 'sinuca.audio';

type Contadores = {
  eventos: number;
  pedidos: number;
  avisos: number;
  tocados: number;
  inaudiveis: number;
  silenciados: number;
  semContexto: number;
  semGerador: number;
};
const zerados = (): Contadores => ({ eventos: 0, pedidos: 0, avisos: 0, tocados: 0, inaudiveis: 0, silenciados: 0, semContexto: 0, semGerador: 0 });

/**
 * Despacha os eventos da tacada para os geradores de som, com limite de vozes,
 * volume geral e mudo. Só abre o contexto em `destravar` (depois de um gesto).
 */
export class MotorDeAudio {
  private sessao: Sessao | null = null;
  private tentouAbrir = false;
  private volumeAtual: number;
  private mudoAtual = false;
  private readonly limitador: LimitadorDeVozes;
  private contadores = zerados();
  private porId = new Map<string, number>();
  private readonly ouvintes: ((volume: number, mudo: boolean) => void)[] = [];
  private readonly armazenamento: ArmazenamentoMinimo | null | undefined;

  constructor(private readonly opcoes: OpcoesMotorDeAudio) {
    this.armazenamento = opcoes.armazenamento;
    this.limitador = new LimitadorDeVozes(opcoes.cfg.maxVozes);
    this.volumeAtual = opcoes.cfg.volumeGeral;
    const salvo = lerJson(CHAVE, this.armazenamento) as { volume?: unknown; mudo?: unknown } | null;
    if (typeof salvo?.volume === 'number' && salvo.volume >= 0 && salvo.volume <= 1) this.volumeAtual = salvo.volume;
    if (typeof salvo?.mudo === 'boolean') this.mudoAtual = salvo.mudo;
  }

  get volume(): number {
    return this.volumeAtual;
  }

  get mudo(): boolean {
    return this.mudoAtual;
  }

  /** O contexto existe e está tocando: não precisa mais de gesto. */
  get pronto(): boolean {
    return this.sessao?.rodando() ?? false;
  }

  /** Chamar num gesto do usuário (clique, tecla): abre o contexto na primeira vez e o retoma sempre. */
  destravar(): void {
    if (!this.tentouAbrir) {
      this.tentouAbrir = true;
      this.sessao = this.opcoes.abrir();
      this.aplicarGanho();
      if (this.sessao) this.opcoes.aoAbrir?.(this.sessao);
    }
    this.sessao?.retomar();
  }

  definirVolume(valor: number): void {
    if (!Number.isFinite(valor)) return;
    this.volumeAtual = Math.min(Math.max(valor, 0), 1);
    this.mudou();
  }

  definirMudo(mudo: boolean): void {
    this.mudoAtual = mudo;
    this.mudou();
  }

  alternarMudo(): void {
    this.definirMudo(!this.mudoAtual);
  }

  /** `ouvinte` roda a cada mudança de volume ou mudo; devolve a função que o remove. */
  aoMudar(ouvinte: (volume: number, mudo: boolean) => void): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      const i = this.ouvintes.indexOf(ouvinte);
      if (i >= 0) this.ouvintes.splice(i, 1);
    };
  }

  /** Ligar ao `aoEvento` do player de gravação: toca no instante em que o evento acontece. */
  aoEvento(evento: EventoTacada): void {
    this.contadores.eventos++;
    const pedido = pedidoDoEvento(evento, this.opcoes.cfg);
    if (pedido) this.despachar(pedido);
  }

  /** Um aviso de interface (a vez passou, o tempo acabou): passa pelo mesmo mudo, volume geral e limite de vozes dos impactos. */
  avisar(som: SomDeAviso): void {
    this.contadores.avisos++;
    this.despachar(pedidoDeAviso(som));
  }

  private despachar(pedido: PedidoDeSom): void {
    const c = this.contadores;
    c.pedidos++;
    const sessao = this.sessao;
    if (!sessao || !sessao.rodando()) {
      c.semContexto++;
      return;
    }
    if (this.mudoAtual) {
      c.silenciados++;
      return;
    }
    if (pedido.volume <= 0) {
      c.inaudiveis++;
      return;
    }
    const preparado = this.opcoes.geradores[pedido.som].preparar(pedido);
    if (!preparado) {
      c.semGerador++;
      return;
    }
    let parar: (() => void) | null = null;
    const voz: Voz = { duracaoS: preparado.duracaoS, volume: pedido.volume, parar: () => parar?.() };
    const agora = sessao.agoraS();
    if (!this.limitador.admitir(agora, voz)) return;
    parar = preparado.tocar(sessao.saida, agora);
    c.tocados++;
    this.porId.set(preparado.id, (this.porId.get(preparado.id) ?? 0) + 1);
  }

  estatisticas(): EstatisticasDeAudio {
    const { recusadas, roubadas, pico } = this.limitador.estatisticas();
    return { ...this.contadores, recusadas, roubadas, picoDeVozes: pico, porId: Object.fromEntries(this.porId) };
  }

  /** Zera os contadores e esquece as vozes ativas (sem cortá-las). */
  zerarEstatisticas(): void {
    this.contadores = zerados();
    this.porId = new Map();
    this.limitador.zerar();
  }

  dispose(): void {
    this.sessao?.fechar();
    this.sessao = null;
    this.ouvintes.length = 0;
  }

  private mudou(): void {
    this.aplicarGanho();
    gravarJson(CHAVE, { volume: this.volumeAtual, mudo: this.mudoAtual }, this.armazenamento);
    for (const ouvinte of [...this.ouvintes]) ouvinte(this.volumeAtual, this.mudoAtual);
  }

  private aplicarGanho(): void {
    this.sessao?.definirGanho(this.mudoAtual ? 0 : this.volumeAtual);
  }
}
