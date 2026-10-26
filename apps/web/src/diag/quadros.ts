/** Um intervalo entre quadros maior que isto é a aba parada ou o computador suspenso: não entra nas contas. */
const PAUSA_MS = 5000;

export interface ResumoDeQuadros {
  readonly quadros: number;
  /** Média no período: quadros / tempo. 0 sem quadros. */
  readonly fpsMedio: number;
  /** O maior intervalo entre dois quadros (ms). */
  readonly piorMs: number;
}

/**
 * Estatística dos quadros sem alocar: um anel com o instante e o intervalo de cada quadro (para o FPS e o
 * pior quadro de uma janela recente) e acumuladores para o resumo de um período mais longo.
 */
export class EstatisticasDeQuadros {
  private readonly instantes: Float64Array;
  private readonly intervalos: Float64Array;
  private proximo = 0;
  private quantidade = 0;
  private ultimo = -1;
  private periodoQuadros = 0;
  private periodoTempoMs = 0;
  private periodoPiorMs = 0;

  constructor(capacidade = 2048) {
    this.instantes = new Float64Array(capacidade);
    this.intervalos = new Float64Array(capacidade);
  }

  /** Uma vez por quadro, com o relógio do quadro (ms). */
  registrar(agoraMs: number): void {
    const anterior = this.ultimo;
    this.ultimo = agoraMs;
    if (anterior < 0) return;
    const intervalo = agoraMs - anterior;
    if (intervalo <= 0 || intervalo > PAUSA_MS) return;
    this.instantes[this.proximo] = agoraMs;
    this.intervalos[this.proximo] = intervalo;
    this.proximo = (this.proximo + 1) % this.instantes.length;
    if (this.quantidade < this.instantes.length) this.quantidade++;
    this.periodoQuadros++;
    this.periodoTempoMs += intervalo;
    if (intervalo > this.periodoPiorMs) this.periodoPiorMs = intervalo;
  }

  /** FPS dos quadros dos últimos `janelaMs`; 0 se não houve nenhum. */
  fps(janelaMs: number, agoraMs: number): number {
    const limite = agoraMs - janelaMs;
    const capacidade = this.instantes.length;
    let quadros = 0;
    let tempo = 0;
    for (let k = 1; k <= this.quantidade; k++) {
      const i = (this.proximo - k + capacidade) % capacidade;
      if (this.instantes[i]! < limite) break;
      quadros++;
      tempo += this.intervalos[i]!;
    }
    return tempo > 0 ? (quadros * 1000) / tempo : 0;
  }

  /** O maior intervalo entre quadros nos últimos `janelaMs` (ms); 0 se não houve nenhum. */
  piorQuadroMs(janelaMs: number, agoraMs: number): number {
    const limite = agoraMs - janelaMs;
    const capacidade = this.instantes.length;
    let pior = 0;
    for (let k = 1; k <= this.quantidade; k++) {
      const i = (this.proximo - k + capacidade) % capacidade;
      if (this.instantes[i]! < limite) break;
      if (this.intervalos[i]! > pior) pior = this.intervalos[i]!;
    }
    return pior;
  }

  /** Quadros, FPS médio e pior quadro desde o último `zerarPeriodo` (ou desde o começo). */
  periodo(): ResumoDeQuadros {
    return {
      quadros: this.periodoQuadros,
      fpsMedio: this.periodoTempoMs > 0 ? (this.periodoQuadros * 1000) / this.periodoTempoMs : 0,
      piorMs: this.periodoPiorMs,
    };
  }

  zerarPeriodo(): void {
    this.periodoQuadros = 0;
    this.periodoTempoMs = 0;
    this.periodoPiorMs = 0;
  }

  /** A aba voltou de uma pausa: o próximo quadro não tem intervalo com o anterior. */
  interromper(): void {
    this.ultimo = -1;
  }
}
