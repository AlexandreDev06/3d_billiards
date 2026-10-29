/**
 * O rosto de um personagem feito de formas (morph targets): quanto pesa cada cara, o piscar, a piscadinha e as pálpebras que seguem
 * o olhar. Só conta: quem desenha lê `pesos`, `piscar` e os outros valores e os põe nas formas de todas as malhas. Nada aloca
 * depois de montada.
 */
import { MolaAmortecida } from './mola';

const limitar = (v: number): number => Math.min(Math.max(v, 0), 1);
const suave = (t: number): number => t * t * (3 - 2 * t);
/** A cara que entra pode passar um pouco de 1 (a mola passa do alvo); mais que isso estoura a forma. */
const PESO_MAXIMO_DA_CARA = 1.2;

/** Anda a mola e, quando ela assentou, a para de vez (o peso fica exatamente no alvo, sem tremer na quinta casa). */
function passoDaMola(m: MolaAmortecida, dt: number): void {
  m.atualizar(dt);
  if (Math.abs(m.valor - m.alvo) < 5e-4 && Math.abs(m.velocidade) < 5e-3) m.forcar(m.alvo);
}

/**
 * Qual cara o personagem faz, com mistura entre elas, e o piscar por cima. O peso de cada cara anda para o seu alvo (1 para a
 * pedida, 0 para as outras) **por mola**: a cara nova chega ao alvo em `tempoDeTrocaS`, passa um pouco dele e assenta (o assentar
 * é o que a faz parecer feita por alguém, não uma rampa); as que saem nunca ficam abaixo de 0. O peso que sai é a cara vezes
 * `1 - piscar`, para o olho fechar sem a cara estragar o resto.
 */
export class MisturaDeCaras {
  /** O peso de cada cara, na ordem de `nomes`, já multiplicado por `1 - piscar` (de 0 a 1,2). */
  readonly pesos: Float64Array;
  /** De 0 (olho aberto) a 1 (fechado): o peso da forma `piscar`. */
  piscar = 0;
  /** De 0 a 1: quanto uma piscadinha (um olho só) está fechada; encolhe cada cara pelo seu `pesoNaPiscadinha`. */
  private piscadinha = 0;
  private readonly molas: MolaAmortecida[];
  /** Quanto de cada cara fica numa piscadinha inteira (1 = toda; a cara que mexe nas pálpebras fica menos). */
  private readonly pesoNaPiscadinha: Float64Array;
  private alvo: number;

  /**
   * @param tempoDeTrocaS em quanto a cara nova chega ao alvo pela primeira vez (s); 0 troca já
   * @param amortecimento de 0 a 1: quanto menor, mais a cara passa do alvo antes de assentar
   */
  constructor(
    readonly nomes: readonly string[],
    inicial: string,
    private readonly tempoDeTrocaS = 0.14,
    amortecimento = 0.6,
  ) {
    const z = Math.min(Math.max(amortecimento, 0.05), 0.95);
    // o primeiro pico da mola subamortecida vem em π / (ω √(1 − ζ²)): o tempo de troca
    const frequenciaHz = tempoDeTrocaS > 0 ? 1 / (2 * tempoDeTrocaS * Math.sqrt(1 - z * z)) : 1;
    this.molas = nomes.map(() => new MolaAmortecida(frequenciaHz, z, 0));
    this.pesos = new Float64Array(nomes.length);
    this.pesoNaPiscadinha = new Float64Array(nomes.length).fill(1);
    this.alvo = this.indice(inicial);
    this.forcarIndice(this.alvo);
  }

  private indice(nome: string): number {
    const i = this.nomes.indexOf(nome);
    if (i < 0) throw new Error(`cara "${nome}" não existe`);
    return i;
  }

  /** A cara existe? */
  tem(nome: string): boolean {
    return this.nomes.includes(nome);
  }

  /** A cara que está sendo feita (a pedida por último, mesmo que a troca ainda não tenha acabado). */
  get atual(): string {
    return this.nomes[this.alvo]!;
  }

  /** Passa a fazer a cara `nome`, a partir dos pesos e das velocidades de agora (sem salto). */
  ir(nome: string): void {
    this.alvo = this.indice(nome);
    if (this.tempoDeTrocaS <= 0) this.forcarIndice(this.alvo);
    else for (let i = 0; i < this.molas.length; i++) this.molas[i]!.alvo = i === this.alvo ? 1 : 0;
  }

  /** Passa a fazer a cara `nome` já, sem mistura. */
  forcar(nome: string): void {
    this.alvo = this.indice(nome);
    this.forcarIndice(this.alvo);
  }

  private forcarIndice(alvo: number): void {
    for (let i = 0; i < this.molas.length; i++) this.molas[i]!.forcar(i === alvo ? 1 : 0);
    this.compor();
  }

  /** Quanto o olho está fechado (0 a 1). */
  definirPiscar(valor: number): void {
    this.piscar = limitar(valor);
    this.compor();
  }

  /** Quanto uma piscadinha está fechada (0 a 1): as caras encolhem pelo peso que cada uma tem na piscadinha. */
  definirPiscadinha(valor: number): void {
    this.piscadinha = limitar(valor);
    this.compor();
  }

  /** Quanto de cada cara fica numa piscadinha inteira, na ordem de `nomes` (da meta do artista); o que falta fica em 1. */
  definirPesosNaPiscadinha(pesos: ArrayLike<number>): void {
    for (let i = 0; i < this.pesoNaPiscadinha.length; i++) this.pesoNaPiscadinha[i] = i < pesos.length ? limitar(pesos[i]!) : 1;
    this.compor();
  }

  /**
   * A soma, pelas caras que pesam agora, de `coeficientes` (um por cara, na ordem de `nomes`): é o quanto o olho está aberto
   * para as pálpebras que seguem o olhar, quando cada cara diz a sua abertura. Sem o piscar: é a cara, não a pálpebra fechada.
   */
  abertura(coeficientes: ArrayLike<number>): number {
    let total = 0;
    for (let i = 0; i < this.molas.length; i++) total += limitar(this.molas[i]!.valor) * (i < coeficientes.length ? coeficientes[i]! : 1);
    return limitar(total);
  }

  atualizar(dt: number): void {
    for (let i = 0; i < this.molas.length; i++) passoDaMola(this.molas[i]!, dt);
    this.compor();
  }

  private compor(): void {
    const abertura = 1 - this.piscar;
    for (let i = 0; i < this.pesos.length; i++) {
      const encolhe = 1 - this.piscadinha * (1 - this.pesoNaPiscadinha[i]!);
      this.pesos[i] = Math.min(Math.max(this.molas[i]!.valor, 0), PESO_MAXIMO_DA_CARA) * abertura * encolhe;
    }
  }
}

/** Como o personagem pisca: o intervalo entre piscadas (s), quanto dura cada uma e como é o par. */
export interface OpcoesDoPiscador {
  readonly minS: number;
  readonly maxS: number;
  readonly duracaoS: number;
  /** A chance (0 a 1) de uma piscada natural vir dupla. */
  readonly chanceDeDuplo: number;
  /** A pausa entre as duas piscadas de um par (s). */
  readonly pausaDoDuploS: number;
  /** Que fração da piscada é o olho fechando; o resto é abrindo (o olho fecha mais depressa do que abre). */
  readonly fracaoDeFechar: number;
  /**
   * O tempo mínimo (s) entre o fim de uma piscada (ou de um par) e o começo da próxima que alguém **pede** (`pedirPiscar`: a sacada
   * grande do olhar). Um pedido que cai dentro dele é recusado: o olho se mexe sem piscar. O par de uma piscada dupla é um evento só
   * e não conta como pedido. A piscada natural já espera `minS` desde o fim da anterior.
   */
  readonly intervaloMinimoS: number;
}

const PISCADOR_PADRAO: OpcoesDoPiscador = { minS: 2.5, maxS: 6, duracaoS: 0.28, chanceDeDuplo: 0.18, pausaDoDuploS: 0.09, fracaoDeFechar: 0.35, intervaloMinimoS: 2.5 };

/**
 * Pisca sozinho, de tempos em tempos (de 2,5 a 6 s desde o fim da anterior), às vezes duas vezes seguidas. O intervalo e a chance do par vêm do `sorteio`
 * injetado (de 0 a 1, nunca `Math.random` direto: assim o teste e a partida repetem). `valor` sobe de 0 a 1 em `fracaoDeFechar`
 * da duração e desce no resto, com curva de ease nos dois lados. Pedir uma piscada no meio de outra não a reinicia (nada estala).
 */
export class Piscador {
  /** Quanto o olho está fechado agora, de 0 a 1. */
  valor = 0;
  private espera: number;
  private decorrido = -1;
  /** A piscada em curso (se houver) abre um par: ao acabar, vem a segunda depois da pausa. */
  private duploPendente = false;
  /** A espera de agora é a pausa de um par, e a próxima piscada é a segunda dele. */
  private naSegunda = false;
  /** Há quanto tempo (s) a última piscada acabou; `Infinity` antes da primeira. */
  private desdeAUltima = Infinity;
  private readonly opcoes: OpcoesDoPiscador;

  constructor(
    private readonly sorteio: () => number,
    opcoes: Partial<OpcoesDoPiscador> = {},
  ) {
    this.opcoes = { ...PISCADOR_PADRAO, ...opcoes };
    this.espera = this.intervalo();
  }

  private intervalo(): number {
    const { minS, maxS } = this.opcoes;
    return minS + limitar(this.sorteio()) * Math.max(maxS - minS, 0);
  }

  /** Está no meio de uma piscada. */
  get piscando(): boolean {
    return this.decorrido >= 0;
  }

  /**
   * Começa uma piscada agora, a não ser que já esteja no meio de uma; `duplo` faz um par. É o jogo mandando (o susto) e **ignora** o
   * intervalo mínimo: o que o olhar pede passa por `pedirPiscar`.
   */
  piscarJa(duplo = false): void {
    if (this.piscando) return;
    this.decorrido = 0;
    this.valor = 0;
    this.duploPendente = duplo;
    this.naSegunda = false;
  }

  /**
   * Pede uma piscada (a sacada grande do olhar). Só vale se não está no meio de uma e se a última acabou há pelo menos
   * `intervaloMinimoS`: senão é recusada e o olho se mexe sem piscar. Devolve se piscou.
   */
  pedirPiscar(duplo = false): boolean {
    if (this.piscando || this.desdeAUltima < this.opcoes.intervaloMinimoS) return false;
    this.piscarJa(duplo);
    return true;
  }

  atualizar(dt: number): void {
    let passo = Math.max(dt, 0);
    if (this.decorrido < 0) {
      this.desdeAUltima += passo;
      this.espera -= passo;
      if (this.espera > 0) return;
      passo = -this.espera;
      this.decorrido = 0;
      if (this.naSegunda) this.duploPendente = false;
      else this.duploPendente = limitar(this.sorteio()) < this.opcoes.chanceDeDuplo;
    }
    this.decorrido += passo;
    const { duracaoS, fracaoDeFechar, pausaDoDuploS } = this.opcoes;
    if (this.decorrido >= duracaoS) {
      const sobra = this.decorrido - duracaoS;
      this.desdeAUltima = sobra;
      if (this.duploPendente) {
        this.naSegunda = true;
        this.duploPendente = false;
        this.espera = Math.max(pausaDoDuploS - sobra, 0);
      } else {
        this.naSegunda = false;
        this.espera = Math.max(this.intervalo() - sobra, 0);
      }
      this.decorrido = -1;
      this.valor = 0;
      return;
    }
    const fecha = Math.min(Math.max(fracaoDeFechar, 0.05), 0.95) * duracaoS;
    this.valor = this.decorrido < fecha ? suave(this.decorrido / fecha) : suave(1 - (this.decorrido - fecha) / (duracaoS - fecha));
  }
}

/**
 * A piscadinha: um olho só fecha, segura um instante e abre (a forma `piscar_esq` ou `piscar_dir`, quando a cara a tem). Uma por vez:
 * pedir outra no meio da primeira não faz nada.
 */
export class Piscadinha {
  /** Quanto o olho está fechado agora, de 0 a 1. */
  valor = 0;
  private decorrido = -1;
  private duracaoS = 0.5;

  get ativa(): boolean {
    return this.decorrido >= 0;
  }

  disparar(duracaoS = 0.5): void {
    if (this.ativa) return;
    this.duracaoS = Math.max(duracaoS, 0.05);
    this.decorrido = 0;
  }

  atualizar(dt: number): void {
    if (this.decorrido < 0) return;
    this.decorrido += Math.max(dt, 0);
    const u = this.decorrido / this.duracaoS;
    if (u >= 1) {
      this.decorrido = -1;
      this.valor = 0;
    } else this.valor = u < 0.22 ? suave(u / 0.22) : u < 0.65 ? 1 : suave(1 - (u - 0.65) / 0.35);
  }
}

/** Em que ângulo do olhar cada pálpebra chega a 1, e a mola dela. */
export interface OpcoesDasPalpebras {
  /** O olhar para cima (graus) em que a pálpebra de cima chega a 1. */
  readonly cimaGrausPara1: number;
  /** O olhar para baixo (graus) em que a pálpebra de baixo chega a 1. */
  readonly baixoGrausPara1: number;
  readonly frequenciaHz?: number;
  readonly amortecimento?: number;
}

/**
 * As pálpebras que acompanham o olhar na vertical (as formas `palpebra_cima` e `palpebra_baixo`): sobem quando o olho olha para
 * cima, descem quando olha para baixo, com um pequeno atraso de mola (a pálpebra vem depois do olho). `cima` e `baixo` vão de 0 a 1.
 */
export class PalpebrasDoOlhar {
  cima = 0;
  baixo = 0;
  private readonly molaCima: MolaAmortecida;
  private readonly molaBaixo: MolaAmortecida;
  private readonly cimaRad: number;
  private readonly baixoRad: number;

  constructor(opcoes: OpcoesDasPalpebras) {
    this.cimaRad = Math.max((opcoes.cimaGrausPara1 * Math.PI) / 180, 1e-6);
    this.baixoRad = Math.max((opcoes.baixoGrausPara1 * Math.PI) / 180, 1e-6);
    this.molaCima = new MolaAmortecida(opcoes.frequenciaHz ?? 9, opcoes.amortecimento ?? 0.85);
    this.molaBaixo = new MolaAmortecida(opcoes.frequenciaHz ?? 9, opcoes.amortecimento ?? 0.85);
  }

  /** `pitchRad`: a elevação do olho (positiva para cima) em relação à cabeça. */
  atualizar(dt: number, pitchRad: number): void {
    this.molaCima.alvo = suave(limitar(pitchRad / this.cimaRad));
    this.molaBaixo.alvo = suave(limitar(-pitchRad / this.baixoRad));
    passoDaMola(this.molaCima, dt);
    passoDaMola(this.molaBaixo, dt);
    this.cima = limitar(this.molaCima.valor);
    this.baixo = limitar(this.molaBaixo.valor);
  }
}
