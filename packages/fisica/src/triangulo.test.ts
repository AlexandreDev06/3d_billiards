import { describe, expect, it } from 'vitest';
import { BOLA, MESA_BAR, type MedidasMesa, type Ponto2 } from './medidas';
import { FOLGA_TRIANGULO, posicoesTriangulo } from './triangulo';

const MESA_OFICIAL: MedidasMesa = { ...MESA_BAR, comprimento: 2.54, largura: 1.27 };

const distancia = (a: Ponto2, b: Ponto2) => Math.hypot(a.x - b.x, a.z - b.z);

describe.each([
  ['de bar', MESA_BAR],
  ['oficial', MESA_OFICIAL],
])('posicoesTriangulo na mesa %s', (_, mesa) => {
  const raio = BOLA.raio;
  const posicoes = posicoesTriangulo(mesa, raio);

  it('tem 15 posições', () => {
    expect(posicoes).toHaveLength(15);
  });

  it('põe o vértice na marca do pé', () => {
    expect(posicoes[0]!.x).toBeCloseTo(mesa.comprimento / 4, 12);
    expect(posicoes[0]!.z).toBeCloseTo(0, 12);
  });

  it('não sobrepõe bolas e deixa só a folga mínima entre vizinhas', () => {
    let menor = Infinity;
    for (let i = 0; i < posicoes.length; i++) {
      for (let j = i + 1; j < posicoes.length; j++) {
        menor = Math.min(menor, distancia(posicoes[i]!, posicoes[j]!));
      }
    }
    expect(menor).toBeGreaterThan(2 * raio);
    expect(menor).toBeCloseTo(2 * raio + FOLGA_TRIANGULO, 9);
    expect(FOLGA_TRIANGULO).toBeLessThanOrEqual(0.0002);
  });

  it('cada bola encosta (com a folga) em pelo menos duas outras', () => {
    for (const p of posicoes) {
      const vizinhas = posicoes.filter((q) => q !== p && distancia(p, q) < 2 * raio + 2 * FOLGA_TRIANGULO);
      expect(vizinhas.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('fica inteiro dentro da mesa', () => {
    for (const p of posicoes) {
      expect(Math.abs(p.x) + raio).toBeLessThan(mesa.comprimento / 2);
      expect(Math.abs(p.z) + raio).toBeLessThan(mesa.largura / 2);
    }
  });

  it('vira a base de 5 para a cabeceira +X', () => {
    const xMax = Math.max(...posicoes.map((p) => p.x));
    expect(posicoes.filter((p) => Math.abs(p.x - xMax) < 1e-9)).toHaveLength(5);
    expect(xMax).toBeGreaterThan(posicoes[0]!.x);
  });
});
