import { describe, expect, it } from 'vitest';
import { criarRng } from './rng';

const amostra = (semente: number, n: number) => {
  const rng = criarRng(semente);
  return Array.from({ length: n }, () => rng.proximo());
};

describe('criarRng', () => {
  it('mesma semente gera a mesma sequência', () => {
    expect(amostra(42, 100)).toEqual(amostra(42, 100));
  });

  it('sementes diferentes geram sequências diferentes', () => {
    expect(amostra(1, 10)).not.toEqual(amostra(2, 10));
  });

  it('fica em [0, 1) e se espalha pelo intervalo', () => {
    const valores = amostra(7, 10_000);
    for (const x of valores) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    const media = valores.reduce((s, x) => s + x, 0) / valores.length;
    expect(media).toBeCloseTo(0.5, 1);
  });
});
