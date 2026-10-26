import { describe, expect, it } from 'vitest';
import { girarOlho } from './olhar';

const saida = new Float64Array(4);
const graus = (g: number): number => (g * Math.PI) / 180;
const anguloDe = (q: Float64Array): number => 2 * Math.acos(Math.min(1, Math.abs(q[3]!)));

describe('girarOlho', () => {
  it('olhar para onde já olha é a identidade', () => {
    girarOlho(0, 0, 1, 0, 0, 5, graus(30), saida, 0);
    expect([...saida]).toEqual([0, 0, 0, 1]);
  });

  it('gira o eixo de repouso para a direção dentro do limite', () => {
    girarOlho(0, 0, 1, 1, 0, 1, graus(60), saida, 0);
    expect(anguloDe(saida)).toBeCloseTo(graus(45), 6);
    // +Z girado 45° para +X em torno de +Y
    expect(saida[1]).toBeCloseTo(Math.sin(graus(45) / 2), 6);
    expect(saida[0]).toBeCloseTo(0, 9);
  });

  it('não passa do limite: o ângulo é cortado', () => {
    girarOlho(0, 0, 1, 1, 0, 0, graus(30), saida, 0);
    expect(anguloDe(saida)).toBeCloseTo(graus(30), 6);
  });

  it('a direção não precisa vir normalizada', () => {
    const a = new Float64Array(4);
    girarOlho(0, 0, 1, 0.2, 0.1, 1, graus(30), a, 0);
    girarOlho(0, 0, 1, 2, 1, 10, graus(30), saida, 0);
    for (let i = 0; i < 4; i++) expect(saida[i]).toBeCloseTo(a[i]!, 9);
  });

  it('direção oposta (sem eixo único) ainda dá uma volta do tamanho do limite', () => {
    girarOlho(0, 0, 1, 0, 0, -1, graus(30), saida, 0);
    expect(anguloDe(saida)).toBeCloseTo(graus(30), 6);
    expect(Math.hypot(saida[0]!, saida[1]!, saida[2]!, saida[3]!)).toBeCloseTo(1, 9);
  });

  it('direção nula não vira NaN', () => {
    girarOlho(0, 0, 1, 0, 0, 0, graus(30), saida, 0);
    expect([...saida]).toEqual([0, 0, 0, 1]);
  });

  it('escreve a partir do deslocamento pedido', () => {
    const dois = new Float64Array(8);
    girarOlho(0, 0, 1, 1, 0, 1, graus(60), dois, 4);
    expect([...dois.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(dois[7]).toBeCloseTo(Math.cos(graus(45) / 2), 6);
  });
});
