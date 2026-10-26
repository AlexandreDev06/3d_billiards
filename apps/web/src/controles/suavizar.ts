/** Fração do caminho até o alvo a percorrer em `dt` s, para amortecimento exponencial independente do quadro. */
export function fatorDeSuavizacao(taxa: number, dt: number): number {
  return 1 - Math.exp(-taxa * dt);
}

/** Menor rotação (rad, com sinal) que leva `de` a `para`. */
export function diferencaAngular(de: number, para: number): number {
  const dois = 2 * Math.PI;
  return ((((para - de + Math.PI) % dois) + dois) % dois) - Math.PI;
}
