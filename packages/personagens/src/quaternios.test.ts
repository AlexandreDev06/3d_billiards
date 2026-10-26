import { describe, expect, it } from 'vitest';
import { girarVetor, multiplicarQuaternios, quaternioDaBase, quaternioDoEixo } from './quaternios';
import { pontoVazio } from './tipos';

const q = (x: number, y: number, z: number, ang: number): Float64Array => {
  const s = new Float64Array(4);
  quaternioDoEixo(x, y, z, ang, s, 0);
  return s;
};

describe('quaternios', () => {
  it('uma volta de 90° em torno de z leva x a y', () => {
    const v = girarVetor(q(0, 0, 1, Math.PI / 2), 0, 1, 0, 0, pontoVazio());
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it('o produto aplica o da direita primeiro, e pode escrever sobre um dos fatores', () => {
    const a = q(0, 0, 1, Math.PI / 2);
    const b = q(1, 0, 0, Math.PI / 2);
    const s = new Float64Array(4);
    multiplicarQuaternios(a, 0, b, 0, s, 0);
    // b leva y a z; depois a (em torno de z) deixa z onde está
    const v = girarVetor(s, 0, 0, 1, 0, pontoVazio());
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(1);
    const dentro = Float64Array.from(a);
    multiplicarQuaternios(dentro, 0, b, 0, dentro, 0);
    expect(Array.from(dentro)).toEqual(Array.from(s));
  });

  it('a base das colunas dá a rotação que leva cada eixo à coluna dele', () => {
    // colunas: x → y, y → z, z → x
    const s = new Float64Array(4);
    quaternioDaBase(0, 1, 0, 0, 0, 1, 1, 0, 0, s, 0);
    const x = girarVetor(s, 0, 1, 0, 0, pontoVazio());
    const y = girarVetor(s, 0, 0, 1, 0, pontoVazio());
    const z = girarVetor(s, 0, 0, 0, 1, pontoVazio());
    expect([x.x, x.y, x.z].map((n) => Math.round(n))).toEqual([0, 1, 0]);
    expect([y.x, y.y, y.z].map((n) => Math.round(n))).toEqual([0, 0, 1]);
    expect([z.x, z.y, z.z].map((n) => Math.round(n))).toEqual([1, 0, 0]);
  });

  it('a base das colunas acerta nos quatro ramos da conversão (traço, x, y e z maiores)', () => {
    const casos: [number, number, number, number][] = [
      [0, 0, 1, Math.PI], // 180° em z: traço negativo, x maior
      [1, 0, 0, Math.PI],
      [0, 1, 0, Math.PI],
      [0.3, 0.5, 0.8, 2.4],
    ];
    for (const [ex, ey, ez, ang] of casos) {
      const n = Math.hypot(ex, ey, ez);
      const original = q(ex / n, ey / n, ez / n, ang);
      const x = girarVetor(original, 0, 1, 0, 0, pontoVazio());
      const y = girarVetor(original, 0, 0, 1, 0, pontoVazio());
      const yy = girarVetor(original, 0, 0, 1, 0, pontoVazio());
      const z = girarVetor(original, 0, 0, 0, 1, pontoVazio());
      const refeito = new Float64Array(4);
      quaternioDaBase(x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z, refeito, 0);
      const v = girarVetor(refeito, 0, 0.2, -0.7, 0.4, pontoVazio());
      const w = girarVetor(original, 0, 0.2, -0.7, 0.4, pontoVazio());
      expect(v.x).toBeCloseTo(w.x, 6);
      expect(v.y).toBeCloseTo(w.y, 6);
      expect(v.z).toBeCloseTo(w.z, 6);
      expect(yy.y).toBeCloseTo(y.y);
    }
  });
});
