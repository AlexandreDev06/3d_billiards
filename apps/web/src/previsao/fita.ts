/** Floats por trecho: 4 vértices (dois de cada ponta) de 3 coordenadas. */
const FLOATS_POR_TRECHO = 12;

/**
 * Escreve a faixa de uma linha no plano XZ em `vertices`, um quadrado por trecho entre dois pontos
 * consecutivos de `pontos` (pares x, z), a altura `y` do pano e com `largura` em metros. Devolve
 * quantos trechos escreveu: pula os de comprimento zero e para onde `vertices` acaba.
 * Não aloca: a linha de previsão reescreve o mesmo buffer a cada cálculo.
 */
export function escreverFita(pontos: Float32Array, quantidade: number, largura: number, y: number, vertices: Float32Array): number {
  const capacidade = Math.floor(vertices.length / FLOATS_POR_TRECHO);
  const meia = largura / 2;
  let trechos = 0;
  for (let i = 0; i + 1 < quantidade && trechos < capacidade; i++) {
    const ax = pontos[2 * i]!;
    const az = pontos[2 * i + 1]!;
    const bx = pontos[2 * i + 2]!;
    const bz = pontos[2 * i + 3]!;
    const comprimento = Math.hypot(bx - ax, bz - az);
    if (comprimento === 0) continue;
    // Perpendicular à direita de quem anda de A para B (visto de cima): as faces olham para +y.
    const nx = ((bz - az) / comprimento) * meia;
    const nz = (-(bx - ax) / comprimento) * meia;
    const o = trechos * FLOATS_POR_TRECHO;
    vertices[o] = ax + nx;
    vertices[o + 1] = y;
    vertices[o + 2] = az + nz;
    vertices[o + 3] = ax - nx;
    vertices[o + 4] = y;
    vertices[o + 5] = az - nz;
    vertices[o + 6] = bx + nx;
    vertices[o + 7] = y;
    vertices[o + 8] = bz + nz;
    vertices[o + 9] = bx - nx;
    vertices[o + 10] = y;
    vertices[o + 11] = bz - nz;
    trechos++;
  }
  return trechos;
}

/** Índices dos triângulos de `trechos` quadrados feitos por `escreverFita`: dois por quadrado. */
export function indicesDaFita(trechos: number): Uint32Array {
  const indices = new Uint32Array(trechos * 6);
  for (let k = 0; k < trechos; k++) {
    const v = 4 * k;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], 6 * k);
  }
  return indices;
}
