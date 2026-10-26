import type { ConfigTacada } from '../config';

/** Velocidade do taco (m/s) para uma velocidade bruta do movimento do mouse (m/s): convexa, com mínimo e teto. */
export function curvaDeForca(brutaMs: number, cfg: ConfigTacada): number {
  const normalizada = Math.min(Math.max(brutaMs / cfg.velocidadeEntradaMax, 0), 1);
  return cfg.velocidadeMin + (cfg.velocidadeMax - cfg.velocidadeMin) * normalizada ** cfg.expoenteForca;
}
