/** Um ponto ou vetor mutável: as contas escrevem nele em vez de alocar um novo a cada chamada. */
export interface Ponto {
  x: number;
  y: number;
  z: number;
}

export function pontoVazio(): Ponto {
  return { x: 0, y: 0, z: 0 };
}

/** Três números como vêm dos arquivos de dados: um ponto ou uma direção, no referencial do personagem. */
export type Trio = readonly [number, number, number];

/** Um quaternion `[x, y, z, w]`, na ordem do glTF. */
export type Quarteto = readonly [number, number, number, number];
