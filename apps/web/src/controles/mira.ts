import type { ConfigMira } from '../config';

function normalizar(rad: number): number {
  const dois = 2 * Math.PI;
  return ((((rad + Math.PI) % dois) + dois) % dois) - Math.PI;
}

export class Mira {
  private anguloAtual: number;

  constructor(
    private cfg: ConfigMira,
    anguloInicial = 0,
  ) {
    this.anguloAtual = anguloInicial;
  }

  /** Troca as sensibilidades (configurações do jogador): vale no próximo movimento do mouse. */
  configurar(cfg: ConfigMira): void {
    this.cfg = cfg;
  }

  /** Direção da tacada no plano XZ (rad), na convenção de `ParametrosTacada.angulo`. */
  get angulo(): number {
    return this.anguloAtual;
  }

  girar(pixelsX: number, fino: boolean): void {
    const passo = pixelsX * this.cfg.radianosPorPixel * (fino ? this.cfg.fatorFino : 1);
    this.anguloAtual = normalizar(this.anguloAtual + passo);
  }

  definir(angulo: number): void {
    this.anguloAtual = normalizar(angulo);
  }
}
