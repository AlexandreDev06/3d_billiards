/**
 * O rosto de um personagem feito de formas (morph targets): quanto pesa cada cara e o piscar. Só conta: quem desenha lê `pesos` e
 * `piscar` e os põe nas formas de todas as malhas. Nada aloca depois de montada.
 */

const limitar = (v: number): number => Math.min(Math.max(v, 0), 1);
const suave = (t: number): number => t * t * (3 - 2 * t);

/**
 * Qual cara o personagem faz, com mistura suave entre elas, e o piscar por cima. Cada cara anda para o seu alvo (1 para a pedida, 0
 * para as outras) em `tempoDeTrocaS`; o peso que sai é a cara vezes `1 - piscar`, para o olho fechar sem a cara estragar o resto.
 */
export class MisturaDeCaras {
  /** O peso de cada cara, na ordem de `nomes`, já multiplicado por `1 - piscar`. */
  readonly pesos: Float64Array;
  /** De 0 (olho aberto) a 1 (fechado): o peso da forma `piscar`. */
  piscar = 0;
  private readonly bruto: Float64Array;
  private alvo: number;

  constructor(
    readonly nomes: readonly string[],
    inicial: string,
    private readonly tempoDeTrocaS = 0.12,
  ) {
    this.pesos = new Float64Array(nomes.length);
    this.bruto = new Float64Array(nomes.length);
    this.alvo = this.indice(inicial);
    this.bruto[this.alvo] = 1;
    this.compor();
  }

  private indice(nome: string): number {
    const i = this.nomes.indexOf(nome);
    if (i < 0) throw new Error(`cara "${nome}" não existe`);
    return i;
  }

  /** A cara que está sendo feita (a pedida por último, mesmo que a troca ainda não tenha acabado). */
  get atual(): string {
    return this.nomes[this.alvo]!;
  }

  /** Passa a fazer a cara `nome`, a partir dos pesos de agora. */
  ir(nome: string): void {
    this.alvo = this.indice(nome);
    if (this.tempoDeTrocaS <= 0) {
      this.bruto.fill(0);
      this.bruto[this.alvo] = 1;
      this.compor();
    }
  }

  /** Passa a fazer a cara `nome` já, sem mistura. */
  forcar(nome: string): void {
    this.alvo = this.indice(nome);
    this.bruto.fill(0);
    this.bruto[this.alvo] = 1;
    this.compor();
  }

  /** Quanto o olho está fechado (0 a 1). */
  definirPiscar(valor: number): void {
    this.piscar = limitar(valor);
    this.compor();
  }

  atualizar(dt: number): void {
    const passo = this.tempoDeTrocaS > 0 ? Math.max(dt, 0) / this.tempoDeTrocaS : 1;
    for (let i = 0; i < this.bruto.length; i++) {
      const alvo = i === this.alvo ? 1 : 0;
      const b = this.bruto[i]!;
      this.bruto[i] = b < alvo ? Math.min(b + passo, 1) : b > alvo ? Math.max(b - passo, 0) : b;
    }
    this.compor();
  }

  private compor(): void {
    const abertura = 1 - this.piscar;
    for (let i = 0; i < this.pesos.length; i++) this.pesos[i] = suave(this.bruto[i]!) * abertura;
  }
}

/** Como o personagem pisca: o intervalo entre piscadas (s) e quanto dura cada uma. */
export interface OpcoesDoPiscador {
  readonly minS: number;
  readonly maxS: number;
  readonly duracaoS: number;
}

const PISCADOR_PADRAO: OpcoesDoPiscador = { minS: 2.5, maxS: 5.5, duracaoS: 0.28 };

/**
 * Pisca sozinho, de tempos em tempos. O intervalo vem do `sorteio` injetado (de 0 a 1, nunca `Math.random` direto: assim o teste e a
 * partida repetem). `valor` sobe de 0 a 1 na primeira metade da piscada e desce na segunda.
 */
export class Piscador {
  /** Quanto o olho está fechado agora, de 0 a 1. */
  valor = 0;
  private espera: number;
  private decorrido = -1;
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

  /** Começa uma piscada agora (o gesto que pede, ou o susto). */
  piscarJa(): void {
    this.decorrido = 0;
    this.valor = 0;
  }

  atualizar(dt: number): void {
    let passo = Math.max(dt, 0);
    if (this.decorrido < 0) {
      this.espera -= passo;
      if (this.espera > 0) return;
      passo = -this.espera;
      this.decorrido = 0;
    }
    this.decorrido += passo;
    const { duracaoS } = this.opcoes;
    if (this.decorrido >= duracaoS) {
      this.espera = Math.max(this.intervalo() - (this.decorrido - duracaoS), 0);
      this.decorrido = -1;
      this.valor = 0;
      return;
    }
    this.valor = 1 - Math.abs((2 * this.decorrido) / duracaoS - 1);
  }
}
