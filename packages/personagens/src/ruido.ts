/** Razões entre as frequências das ondas: números sem relação simples, para a soma nunca fechar um laço. */
const RAZOES = [1, 1.6180339887, 2.4142135624, 3.7320508076] as const;

/**
 * Um ruído suave e repetível, de -1 a 1: a soma de poucas senóides de frequências sem relação entre si, com fases e frequências
 * sorteadas pelo `sorteio` injetado (nunca `Math.random`). Serve para a deriva do personagem parado, que não pode parecer um
 * laço mecânico. `valor(t)` não guarda estado: o mesmo `t` dá sempre o mesmo número. Nada aloca depois de montado.
 */
export class RuidoSuave {
  private readonly frequencias: Float64Array;
  private readonly fases: Float64Array;
  private readonly amplitudes: Float64Array;

  /**
   * @param sorteio de 0 a 1
   * @param frequenciaHz a rapidez da onda mais lenta; as outras são mais rápidas e mais fracas
   * @param oitavas quantas ondas somar (de 1 a 4)
   */
  constructor(sorteio: () => number, frequenciaHz = 0.25, oitavas = 3) {
    const n = Math.min(Math.max(Math.round(oitavas), 1), RAZOES.length);
    this.frequencias = new Float64Array(n);
    this.fases = new Float64Array(n);
    this.amplitudes = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      this.frequencias[i] = 2 * Math.PI * frequenciaHz * RAZOES[i]! * (0.85 + 0.3 * sorteio());
      this.fases[i] = 2 * Math.PI * sorteio();
      this.amplitudes[i] = 1 / (1 + i * 0.7);
      total += this.amplitudes[i]!;
    }
    for (let i = 0; i < n; i++) this.amplitudes[i] = this.amplitudes[i]! / total;
  }

  /** O ruído no instante `tS` (s). */
  valor(tS: number): number {
    let v = 0;
    for (let i = 0; i < this.frequencias.length; i++) v += this.amplitudes[i]! * Math.sin(this.frequencias[i]! * tS + this.fases[i]!);
    return v;
  }
}
