export interface ConfigEspacador {
  /** Menor intervalo entre dois cálculos (ms). */
  readonly espacoMinimoMs: number;
  /** O intervalo cresce com o custo do último cálculo: `fatorCusto` vezes ele, para a previsão ocupar no máximo 1/(fatorCusto + 1) do tempo. */
  readonly fatorCusto: number;
}

/** Teto de frequência da previsão: o próximo cálculo só sai depois de `max(espacoMinimoMs, fatorCusto × custo)` do início do anterior. */
export class Espacador {
  private liberaEmMs = -Infinity;

  constructor(private readonly cfg: ConfigEspacador) {}

  pode(agoraMs: number): boolean {
    return agoraMs >= this.liberaEmMs;
  }

  registrar(inicioMs: number, custoMs: number): void {
    this.liberaEmMs = inicioMs + Math.max(this.cfg.espacoMinimoMs, this.cfg.fatorCusto * custoMs);
  }

  reiniciar(): void {
    this.liberaEmMs = -Infinity;
  }
}
