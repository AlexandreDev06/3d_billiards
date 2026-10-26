/**
 * As carteiras (L22): saldo, skins do taco e a skin em uso, guardadas na memória e num arquivo JSON em disco.
 *
 * O código secreto que o navegador guarda só existe aqui por um instante: o armazém o troca por um resumo SHA-256 (o `id`),
 * e é o `id` que as salas, o arquivo e os testes manipulam. Achar uma carteira é achar o resumo num `Map`, então não há
 * comparação de texto cujo tempo conte quantos caracteres do código batem, e quem ler o disco não ganha a carteira de
 * ninguém. Nada aqui chega ao log com o código nem com o `id`.
 *
 * Tudo é síncrono e atômico dentro do processo (um único thread): a checagem de saldo e o desconto de uma compra não têm
 * `await` no meio, então duas compras ao mesmo tempo nunca gastam o mesmo dinheiro duas vezes. O disco acompanha a memória
 * com atraso curto (várias mudanças viram uma escrita) e `descarregar()` espera tudo chegar ao arquivo, para o encerramento.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SALDO_INICIAL,
  SKIN_PADRAO,
  diaDaMissao,
  ehCodigoDeCarteira,
  ehDiaDaMissao,
  ehIdDeMissao,
  ehSkinDeTaco,
  fimDoDia,
  missaoDoCatalogo,
  missoesDoDia,
  ordemDaSkin,
  precoDaSkin,
  premioDaMissao,
  type EstadoCarteira,
  type IdMissao,
  type MissoesDoDia,
  type SkinTaco,
} from '@sinuca/protocolo';
import type { ValoresDasMissoes } from './missoes';
import type { Logger } from './log';
import { pegarTrava, ErroDeTrava, type Trava } from './trava';

const VERSAO_DO_ARQUIVO = 1;
const NOME_DO_ARQUIVO = 'carteiras.json';
const ID_VALIDO = /^[0-9a-f]{64}$/;
const TEMPORARIO = /^carteiras\.json\.\d+\.tmp$/;
/** Depois de uma gravação que falhou, tenta de novo daqui a tanto (além de tentar a cada mudança e ao descarregar). */
const REPETIR_APOS_FALHA_MS = 5000;
const TENTATIVAS_AO_DESCARREGAR = 3;
const TENTATIVAS_DE_CODIGO = 8;

export interface OpcoesDoArmazem {
  /** Pasta do arquivo; `null` = só memória (testes e quem não quer persistir). Criada na primeira gravação. */
  readonly pasta: string | null;
  readonly maxCarteiras: number;
  /** Espera entre a primeira mudança e a gravação; as que vierem nesse intervalo entram na mesma escrita. */
  readonly atrasoMs: number;
  readonly relogio: () => number;
  readonly log: Logger;
  /** Sorteia o código; os testes injetam o seu. Padrão: 32 bytes aleatórios do sistema em base64url. */
  readonly gerarCodigo?: () => string;
}

/** O progresso das missões de UM dia (L31); virou o dia, o de antes não vale mais e o próximo registro o troca. */
interface ProgressoDasMissoes {
  dia: string;
  progresso: Partial<Record<IdMissao, number>>;
}

interface Guardada {
  saldo: number;
  skins: SkinTaco[];
  skin: SkinTaco;
  readonly criadaEm: number;
  /** Já esteve num lugar de partida ou levou/pagou uma aposta: nunca mais é reaproveitada no teto. */
  jogou: boolean;
  /** Ausente no arquivo de antes do L31 (e para quem nunca andou numa missão): zero em tudo. */
  missoes?: ProgressoDasMissoes;
}

/** O que `registrarMissoes` fez numa carteira que andou: o quadro de agora e as missões que fecharam (e pagaram) nesta chamada. */
export interface ResultadoDeMissoes {
  readonly missoes: MissoesDoDia;
  readonly cumpridas: readonly IdMissao[];
}

/** `encerrado`: o armazém já fechou (o servidor está saindo) e não aceita mais mudança. */
export type ErroDeLoja = 'carteira-invalida' | 'skin-invalida' | 'ja-tem' | 'saldo-insuficiente' | 'nao-tem' | 'encerrado';
export type ResultadoDeLoja = { readonly ok: true; readonly estado: EstadoCarteira } | { readonly ok: false; readonly erro: ErroDeLoja };

export interface Variacao {
  readonly id: string;
  readonly delta: number;
}

/** Quem quer saber que uma carteira mudou; `origem` é o que quem mudou passou (para não avisar a si mesmo). */
export type OuvinteDeCarteira = (id: string, origem?: unknown) => void;

const resumo = (codigo: string): string => createHash('sha256').update(codigo).digest('hex');

const codigoAleatorio = (): string => randomBytes(32).toString('base64url');

const CHAVES_DA_CARTEIRA = ['saldo', 'skins', 'skin', 'criadaEm', 'jogou', 'missoes'];

/**
 * O progresso guardado das missões, ou `undefined` se não presta. Diferente do saldo, aqui o que não presta não derruba a
 * carteira: é um dado do dia, sem dinheiro, e perdê-lo custa no máximo recomeçar as missões de hoje. Missão que saiu do
 * catálogo é descartada e o que passa da meta volta a ela.
 */
function missoesValidas(valor: unknown): ProgressoDasMissoes | undefined {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return undefined;
  const { dia, progresso } = valor as Record<string, unknown>;
  if (!ehDiaDaMissao(dia) || typeof progresso !== 'object' || progresso === null || Array.isArray(progresso)) return undefined;
  const lido: Partial<Record<IdMissao, number>> = {};
  for (const [id, n] of Object.entries(progresso)) {
    if (!ehIdDeMissao(id) || !Number.isSafeInteger(n) || (n as number) < 0) continue;
    lido[id] = Math.min(n as number, missaoDoCatalogo(id).meta);
  }
  return { dia, progresso: lido };
}

function guardadaValida(valor: unknown): Guardada | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  // `jogou` veio no L25 e `missoes` no L31: o arquivo de antes vale como carteira já usada, sem missões, porque não há como saber o contrário
  if (!Object.keys(v).every((k) => CHAVES_DA_CARTEIRA.includes(k))) return null;
  for (const k of ['saldo', 'skins', 'skin', 'criadaEm']) if (!(k in v)) return null;
  const { saldo, skins, skin, criadaEm } = v;
  const jogou = 'jogou' in v ? v.jogou : true;
  if (typeof jogou !== 'boolean') return null;
  if (!Number.isSafeInteger(saldo) || typeof criadaEm !== 'number' || !Number.isFinite(criadaEm)) return null;
  if (!Array.isArray(skins) || skins.length < 1 || !skins.every(ehSkinDeTaco) || new Set(skins).size !== skins.length) return null;
  if (!skins.includes(SKIN_PADRAO) || !ehSkinDeTaco(skin) || !skins.includes(skin)) return null;
  const missoes = 'missoes' in v ? missoesValidas(v.missoes) : undefined;
  return { saldo: saldo as number, skins: [...skins].sort((a, b) => ordemDaSkin(a) - ordemDaSkin(b)), skin, criadaEm, jogou, ...(missoes ? { missoes } : {}) };
}

export class ArmazemDeCarteiras {
  private readonly carteiras = new Map<string, Guardada>();
  private readonly ouvintes = new Set<OuvinteDeCarteira>();
  private readonly arquivo: string | null;
  /** Conta as mudanças; o disco sabe até qual já recebeu. */
  private versao = 0;
  private gravadaAte = 0;
  private temporizador: NodeJS.Timeout | null = null;
  private emCurso: Promise<boolean> | null = null;
  private readonly trava: Trava | null;
  private fechando: Promise<void> | null = null;
  /** A trava da pasta já saiu: outro servidor pode estar gravando ali, então este não escreve mais nada. */
  private travaSolta = false;
  private avisouPastaSemFsync = false;

  /**
   * Abre as carteiras da pasta e pega a trava exclusiva dela: se outro processo (ou outro armazém deste) a segura, lança
   * `ErroDeTrava`. Quem precisa esperar o dono sair usa `ArmazemDeCarteiras.abrir`.
   */
  constructor(private readonly opcoes: OpcoesDoArmazem) {
    this.arquivo = opcoes.pasta === null ? null : join(opcoes.pasta, NOME_DO_ARQUIVO);
    this.trava = opcoes.pasta === null ? null : pegarTrava(opcoes.pasta, opcoes.log);
    try {
      this.limparTemporariosOrfaos();
      this.carregar();
    } catch (e) {
      this.trava?.soltar();
      throw e;
    }
  }

  /**
   * Como o construtor, mas espera até `esperaMs` o dono da trava sair (o `reiniciar-sala.sh` sobe o servidor novo assim que a
   * porta do antigo solta). Só a trava é esperada: qualquer outro erro sobe na hora. Passado o prazo, lança o `ErroDeTrava`.
   */
  static async abrir(opcoes: OpcoesDoArmazem, espera: { readonly esperaMs: number; readonly passoMs?: number } = { esperaMs: 0 }): Promise<ArmazemDeCarteiras> {
    const limite = Date.now() + espera.esperaMs;
    let avisou = false;
    for (;;) {
      try {
        return new ArmazemDeCarteiras(opcoes);
      } catch (e) {
        if (!(e instanceof ErroDeTrava) || Date.now() >= limite) throw e;
        if (!avisou) {
          avisou = true;
          opcoes.log('carteiras-trava-esperando', { pid: e.pid ?? 'desconhecido', esperaS: Math.round(espera.esperaMs / 1000) });
        }
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(espera.passoMs ?? 200, limite - Date.now()))));
      }
    }
  }

  get total(): number {
    return this.carteiras.size;
  }

  /** `true` desde o começo do `fechar()`: nenhuma mudança entra mais. */
  get encerrado(): boolean {
    return this.fechando !== null;
  }

  // ---------------------------------------------------------------- achar e criar

  /**
   * Cria uma carteira nova. No teto de carteiras ela toma o lugar da nunca usada mais velha (saldo inicial, só o clássico,
   * nunca num lugar de partida); sem nenhuma assim, `null`. O código sai daqui uma única vez.
   */
  criar(): { readonly codigo: string; readonly id: string } | null {
    if (this.recusaPorEncerrado()) return null;
    if (this.carteiras.size >= this.opcoes.maxCarteiras && !this.reaproveitarUma()) {
      this.opcoes.log('carteiras-cheio', { maximo: this.opcoes.maxCarteiras });
      return null;
    }
    const gerar = this.opcoes.gerarCodigo ?? codigoAleatorio;
    for (let tentativa = 0; tentativa < TENTATIVAS_DE_CODIGO; tentativa++) {
      const codigo = gerar();
      const id = resumo(codigo);
      if (this.carteiras.has(id)) continue;
      this.carteiras.set(id, { saldo: SALDO_INICIAL, skins: [SKIN_PADRAO], skin: SKIN_PADRAO, criadaEm: this.opcoes.relogio(), jogou: false });
      this.opcoes.log('carteira-criada', { carteiras: this.carteiras.size });
      this.mudou();
      return { codigo, id };
    }
    this.opcoes.log('carteiras-codigo-repetido');
    return null;
  }

  /** Tira a carteira nunca usada mais velha para dar lugar a uma nova; `false` se todas estão em uso. */
  private reaproveitarUma(): boolean {
    let velha: [string, Guardada] | null = null;
    for (const par of this.carteiras) {
      const c = par[1];
      const nunca = !c.jogou && c.saldo === SALDO_INICIAL && c.skins.length === 1 && c.skin === SKIN_PADRAO;
      if (nunca && (velha === null || c.criadaEm < velha[1].criadaEm)) velha = par;
    }
    if (velha === null) return false;
    this.carteiras.delete(velha[0]);
    this.opcoes.log('carteira-reaproveitada', { carteiras: this.carteiras.size });
    return true;
  }

  /**
   * Estas carteiras estão num lugar de uma partida que começou: deixam de ser "nunca usadas". Não é uma mudança que alguém
   * veja (nenhum ouvinte é avisado), só vai ao disco. Id que não existe é ignorado.
   */
  registrarPartida(ids: readonly string[]): void {
    if (this.recusaPorEncerrado()) return;
    let mudou = false;
    for (const id of ids) {
      const c = this.carteiras.get(id);
      if (c && !c.jogou) {
        c.jogou = true;
        mudou = true;
      }
    }
    if (mudou) this.mudou();
  }

  /** O `id` da carteira deste código, ou `undefined` se a forma está errada ou ela não existe. */
  resolver(codigo: unknown): string | undefined {
    if (!ehCodigoDeCarteira(codigo)) return undefined;
    const id = resumo(codigo);
    return this.carteiras.has(id) ? id : undefined;
  }

  /** O que a carteira tem agora (uma cópia), com as missões do dia de agora, ou `undefined` se o `id` não existe. */
  ler(id: string): EstadoCarteira | undefined {
    const c = this.carteiras.get(id);
    return c && { saldo: c.saldo, skins: [...c.skins], skin: c.skin, missoes: this.quadroDeMissoes(c) };
  }

  /** As 3 missões de hoje com o que esta carteira já andou nelas; o progresso de outro dia não conta. */
  private quadroDeMissoes(c: Guardada): MissoesDoDia {
    const dia = diaDaMissao(this.opcoes.relogio());
    const andado = c.missoes?.dia === dia ? c.missoes.progresso : {};
    return {
      dia,
      fimMs: fimDoDia(dia),
      itens: missoesDoDia(dia).map((m) => {
        const progresso = Math.min(andado[m.id] ?? 0, m.meta);
        return { id: m.id, progresso, meta: m.meta, cumprida: progresso >= m.meta };
      }),
    };
  }

  // ---------------------------------------------------------------- mexer

  /** Compra uma skin: só com saldo para o preço inteiro (o saldo nunca fica abaixo de zero por uma compra). Não a coloca em uso. */
  comprar(id: string, skin: string, origem?: unknown): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    if (!ehSkinDeTaco(skin)) return { ok: false, erro: 'skin-invalida' };
    if (c.skins.includes(skin)) return { ok: false, erro: 'ja-tem' };
    const preco = precoDaSkin(skin);
    if (c.saldo < preco) return { ok: false, erro: 'saldo-insuficiente' };
    c.saldo -= preco;
    c.skins.push(skin);
    c.skins.sort((a, b) => ordemDaSkin(a) - ordemDaSkin(b));
    this.opcoes.log('carteira-comprou', { skin, preco });
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /** Põe em uso uma skin que a carteira tem. */
  usar(id: string, skin: string, origem?: unknown): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    if (!ehSkinDeTaco(skin)) return { ok: false, erro: 'skin-invalida' };
    if (!c.skins.includes(skin)) return { ok: false, erro: 'nao-tem' };
    c.skin = skin;
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /**
   * Soma as variações aos saldos, que podem ficar negativos sem limite. Tudo ou nada: se uma só está errada — carteira que
   * não existe, o mesmo `id` duas vezes, delta que não é inteiro ou que tiraria o saldo do que um número conta sem perder
   * unidade — nenhuma é aplicada e devolve `false`. `true` = todas foram aplicadas.
   */
  aplicar(variacoes: readonly Variacao[], origem?: unknown): boolean {
    if (this.recusaPorEncerrado()) return false;
    const alvos: { carteira: Guardada; id: string; delta: number }[] = [];
    const vistos = new Set<string>();
    for (const { id, delta } of variacoes) {
      const carteira = this.carteiras.get(id);
      if (!carteira || vistos.has(id)) {
        this.opcoes.log('carteiras-variacao-recusada', { motivo: carteira ? 'carteira-repetida' : 'carteira-inexistente' });
        return false;
      }
      vistos.add(id);
      if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(carteira.saldo + delta)) {
        this.opcoes.log('carteiras-variacao-recusada', { delta: Number.isFinite(delta) ? delta : 'invalido' });
        return false;
      }
      alvos.push({ carteira, id, delta });
    }
    for (const { carteira, delta } of alvos) {
      carteira.saldo += delta;
      carteira.jogou = true; // dinheiro que mexe é dinheiro de quem jogou, mesmo que o saldo volte a 100
    }
    for (const { id } of alvos) this.mudou(id, origem);
    return true;
  }

  /**
   * Soma o que uma tacada (ou o fim de uma partida) vale às missões de hoje desta carteira e paga o prêmio do nível (`premioDaMissao`) de cada
   * uma que chegar à meta. Síncrono e tudo ou nada, como `aplicar`: o progresso e o prêmio entram juntos, e a missão que já
   * chegou à meta no dia não paga de novo, venha de onde vier (duas abas, duas salas, a mesma tacada repetida). Só vale o
   * que for das 3 missões do dia; valor que não é inteiro positivo recusa tudo. Virou o dia, o progresso de ontem some.
   *
   * Devolve o quadro novo e as missões que fecharam agora; `null` se nada andou (carteira que não existe, nenhum valor das
   * missões de hoje, tudo já cumprido) ou se o valor era inválido. Só o prêmio avisa as outras salas da carteira (o saldo
   * mudou); progresso sem prêmio vai só ao disco. `origem` é a sala que pagou, para ela não se reavisar.
   */
  registrarMissoes(id: string, valores: ValoresDasMissoes, origem?: unknown): ResultadoDeMissoes | null {
    if (this.recusaPorEncerrado()) return null;
    const c = this.carteiras.get(id);
    if (!c) return null;
    for (const v of Object.values(valores)) {
      if (!Number.isSafeInteger(v) || (v as number) <= 0) {
        this.opcoes.log('carteiras-missao-recusada', { valor: Number.isFinite(v) ? v : 'invalido' });
        return null;
      }
    }
    const dia = diaDaMissao(this.opcoes.relogio());
    const antes = c.missoes?.dia === dia ? c.missoes.progresso : {};
    const progresso: Partial<Record<IdMissao, number>> = { ...antes };
    const cumpridas: IdMissao[] = [];
    let andou = false;
    for (const m of missoesDoDia(dia)) {
      const valor = valores[m.id];
      const atual = antes[m.id] ?? 0;
      if (valor === undefined || atual >= m.meta) continue;
      const novo = Math.min(m.meta, m.acumulo === 'soma' ? atual + valor : Math.max(atual, valor));
      if (novo === atual) continue;
      progresso[m.id] = novo;
      andou = true;
      if (novo >= m.meta) cumpridas.push(m.id);
    }
    if (!andou) return null;
    const premio = cumpridas.reduce((soma, m) => soma + premioDaMissao(m), 0);
    if (!Number.isSafeInteger(c.saldo + premio)) {
      this.opcoes.log('carteiras-missao-recusada', { motivo: 'saldo-no-limite' });
      return null;
    }
    c.missoes = { dia, progresso };
    c.saldo += premio;
    if (premio > 0) c.jogou = true; // dinheiro que mexe é dinheiro de quem jogou
    if (premio > 0) this.mudou(id, origem);
    else this.mudou();
    return { missoes: this.quadroDeMissoes(c), cumpridas };
  }

  /** Avisa sempre que uma carteira existente muda (compra, uso, variação). Devolve como cancelar. */
  aoMudar(ouvinte: OuvinteDeCarteira): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  // ---------------------------------------------------------------- disco

  /** Espera o que está na memória chegar ao arquivo (o encerramento chama isto). Falha de disco é logada, não lançada. */
  async descarregar(): Promise<void> {
    this.cancelarTemporizador();
    if (this.arquivo === null) return;
    for (let tentativa = 0; tentativa < TENTATIVAS_AO_DESCARREGAR && (this.emCurso || this.gravadaAte < this.versao); tentativa++) {
      await (this.emCurso ?? this.gravar());
    }
    // uma gravação que acabou durante o laço pode ter agendado outra (mudança no meio dela, ou falha). Se tudo já está no disco,
    // ou se o armazém está fechando, ela não tem mais o que fazer; só a repetição depois de falha de um descarregar() solto fica.
    if (this.gravadaAte >= this.versao || this.fechando !== null) this.cancelarTemporizador();
  }

  /**
   * Encerra: desde esta chamada nenhuma mudança entra (o retrato que vai ao disco é o último), espera tudo chegar ao arquivo
   * e solta a trava da pasta. O servidor chama isto antes de soltar a porta, então quem sobe em seguida acha a trava livre.
   * Pode ser chamado mais de uma vez.
   */
  fechar(): Promise<void> {
    this.fechando ??= this.descarregar().finally(() => {
      this.travaSolta = true;
      this.trava?.soltar();
    });
    return this.fechando;
  }

  private cancelarTemporizador(): void {
    if (!this.temporizador) return;
    clearTimeout(this.temporizador);
    this.temporizador = null;
  }

  private recusaPorEncerrado(): boolean {
    if (this.fechando === null) return false;
    this.opcoes.log('carteiras-encerrado');
    return true;
  }

  private mudou(id?: string, origem?: unknown): void {
    this.versao++;
    this.agendar(this.opcoes.atrasoMs);
    if (id === undefined) return;
    for (const ouvinte of [...this.ouvintes]) {
      try {
        ouvinte(id, origem);
      } catch (e) {
        this.opcoes.log('carteiras-ouvinte-falhou', { erro: e instanceof Error ? e.message : 'desconhecido' });
      }
    }
  }

  private agendar(ms: number): void {
    if (this.arquivo === null || this.temporizador) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.gravar();
    }, ms);
    this.temporizador.unref();
  }

  /** Uma gravação por vez; o retrato do que vai ao disco é tirado de uma vez, antes de qualquer espera. Depois de a trava sair, recusa (`false`). */
  private gravar(): Promise<boolean> {
    if (this.travaSolta) return Promise.resolve(false);
    if (this.emCurso) return this.emCurso;
    const alvo = this.versao;
    const texto = this.serializar();
    this.emCurso = this.escrever(texto)
      .then(
        () => {
          this.gravadaAte = alvo;
          return true;
        },
        (e: unknown) => {
          this.opcoes.log('carteiras-gravacao-falhou', { erro: e instanceof Error ? e.message : 'desconhecido' });
          return false;
        },
      )
      .then((deuCerto) => {
        this.emCurso = null;
        if (this.gravadaAte < this.versao) this.agendar(deuCerto ? this.opcoes.atrasoMs : REPETIR_APOS_FALHA_MS);
        return deuCerto;
      });
    return this.emCurso;
  }

  private serializar(): string {
    const carteiras: Record<string, Guardada> = {};
    for (const [id, c] of this.carteiras) carteiras[id] = c;
    return JSON.stringify({ versao: VERSAO_DO_ARQUIVO, carteiras });
  }

  /** Arquivo temporário na mesma pasta, escrito até o disco, e `rename` por cima: quem lê vê o antigo inteiro ou o novo inteiro. */
  private async escrever(texto: string): Promise<void> {
    const pasta = this.opcoes.pasta!;
    await mkdir(pasta, { recursive: true, mode: 0o700 });
    const temporario = join(pasta, `${NOME_DO_ARQUIVO}.${process.pid}.tmp`);
    const f = await open(temporario, 'w', 0o600);
    try {
      await f.writeFile(texto);
      await f.sync();
    } finally {
      await f.close();
    }
    try {
      await rename(temporario, this.arquivo!);
    } catch (e) {
      await rm(temporario, { force: true }).catch(() => undefined);
      throw e;
    }
    await this.sincronizarPasta(pasta);
  }

  /** O `rename` só fica de pé numa queda de energia depois do fsync da pasta. Sistemas que não abrem pasta seguem sem isso (avisa uma vez). */
  private async sincronizarPasta(pasta: string): Promise<void> {
    try {
      const dir = await open(pasta, 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } catch (e) {
      if (this.avisouPastaSemFsync) return;
      this.avisouPastaSemFsync = true;
      this.opcoes.log('carteiras-pasta-sem-fsync', { erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }

  /** Sobra de temporário de quem morreu no meio de uma gravação. Só quem tem a trava chega aqui, então nenhum é de gravação viva. */
  private limparTemporariosOrfaos(): void {
    let nomes: string[];
    try {
      nomes = readdirSync(this.opcoes.pasta!);
    } catch {
      return;
    }
    const orfaos = nomes.filter((n) => TEMPORARIO.test(n));
    for (const nome of orfaos) {
      try {
        unlinkSync(join(this.opcoes.pasta!, nome));
      } catch {
        // sumiu enquanto isso
      }
    }
    if (orfaos.length > 0) this.opcoes.log('carteiras-temporarios-removidos', { quantos: orfaos.length });
  }

  /**
   * Lê o arquivo ao subir. Sem arquivo, começa vazio. Arquivo que não se entende (JSON quebrado, versão ou forma errada), ou
   * com carteiras que não valem: o original é GUARDADO (renomeado para `carteiras.corrompido-<instante>.json`, nunca
   * sobrescrito) antes de qualquer outra coisa, o problema é logado e o servidor segue só com o que se salvou. Se nem
   * guardar o original dá, lança: seguir em cima dele destruiria o único exemplar.
   */
  private carregar(): void {
    if (this.arquivo === null) return;
    let bruto: string;
    try {
      bruto = readFileSync(this.arquivo, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new Error(`carteiras: não consegui ler ${this.arquivo}: ${e instanceof Error ? e.message : 'erro desconhecido'}`, { cause: e });
    }
    const lidas = this.interpretar(bruto);
    for (const [id, c] of lidas.carteiras) this.carteiras.set(id, c);
    if (lidas.descartadas === 0) return;
    const copia = this.guardarOEstragado();
    this.opcoes.log('carteiras-corrompidas', { copia, mantidas: lidas.carteiras.size, descartadas: lidas.descartadas });
    if (lidas.carteiras.size > 0) {
      this.versao++;
      this.agendar(0);
    }
  }

  private interpretar(bruto: string): { carteiras: Map<string, Guardada>; descartadas: number } {
    const vazio = { carteiras: new Map<string, Guardada>(), descartadas: 1 };
    let dado: unknown;
    try {
      dado = JSON.parse(bruto);
    } catch {
      return vazio;
    }
    if (typeof dado !== 'object' || dado === null || Array.isArray(dado)) return vazio;
    const { versao, carteiras } = dado as Record<string, unknown>;
    if (versao !== VERSAO_DO_ARQUIVO || typeof carteiras !== 'object' || carteiras === null || Array.isArray(carteiras)) return vazio;
    const lidas = new Map<string, Guardada>();
    let descartadas = 0;
    for (const [id, valor] of Object.entries(carteiras)) {
      const c = ID_VALIDO.test(id) ? guardadaValida(valor) : null;
      if (c) lidas.set(id, c);
      else descartadas++;
    }
    return { carteiras: lidas, descartadas };
  }

  private guardarOEstragado(): string {
    const pasta = this.opcoes.pasta!;
    const base = `carteiras.corrompido-${this.opcoes.relogio()}`;
    for (let n = 0; n < 1000; n++) {
      const nome = n === 0 ? `${base}.json` : `${base}-${n}.json`;
      const destino = join(pasta, nome);
      if (existsSync(destino)) continue; // só este processo escreve ali, então conferir antes basta para nunca sobrescrever uma cópia
      try {
        renameSync(this.arquivo!, destino);
        return nome;
      } catch (e) {
        throw new Error(`carteiras: não consegui guardar o arquivo estragado em ${destino}: ${e instanceof Error ? e.message : 'erro desconhecido'}`, { cause: e });
      }
    }
    throw new Error('carteiras: cópias demais do arquivo estragado; confira a pasta de dados');
  }
}
