import type { MedidasMesa, Ponto2 } from './medidas';

/** Espaço entre bolas vizinhas no triângulo (m): encostadas sem se sobrepor. */
export const FOLGA_TRIANGULO = 0.0001;

/**
 * As 15 posições do triângulo: vértice na marca do pé (`x = comprimento / 4`,
 * `z = 0`) e base de 5 voltada para a cabeceira +X. Ordem: fileira a fileira a
 * partir do vértice; em cada fileira, de z− para z+. Qual bola vai em cada
 * posição é decisão das regras.
 */
export function posicoesTriangulo(mesa: MedidasMesa, raio: number, folga = FOLGA_TRIANGULO): Ponto2[] {
  const distancia = 2 * raio + folga;
  const entreFileiras = (distancia * Math.sqrt(3)) / 2;
  const vertice = mesa.comprimento / 4;
  const posicoes: Ponto2[] = [];
  for (let fileira = 0; fileira < 5; fileira++) {
    for (let j = 0; j <= fileira; j++) {
      posicoes.push({ x: vertice + fileira * entreFileiras, z: (j - fileira / 2) * distancia });
    }
  }
  return posicoes;
}
