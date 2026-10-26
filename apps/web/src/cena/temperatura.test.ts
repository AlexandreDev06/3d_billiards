import { describe, expect, it } from 'vitest';
import { corDaTemperatura } from './temperatura';

const canais = (cor: number): [number, number, number] => [(cor >> 16) & 255, (cor >> 8) & 255, cor & 255];

describe('corDaTemperatura', () => {
  it('2700 K é laranja quente: vermelho cheio, verde médio, azul baixo', () => {
    const [r, g, b] = canais(corDaTemperatura(2700));
    expect(r).toBe(255);
    expect(g).toBeGreaterThanOrEqual(163);
    expect(g).toBeLessThanOrEqual(171);
    expect(b).toBeGreaterThanOrEqual(83);
    expect(b).toBeLessThanOrEqual(91);
  });

  it('3000 K é um pouco menos laranja que 2700 K', () => {
    const [r, g, b] = canais(corDaTemperatura(3000));
    expect(r).toBe(255);
    expect(g).toBeGreaterThanOrEqual(173);
    expect(g).toBeLessThanOrEqual(181);
    expect(b).toBeGreaterThanOrEqual(106);
    expect(b).toBeLessThanOrEqual(114);
  });

  it('luz do dia (6600 K) é quase branca', () => {
    const [r, g, b] = canais(corDaTemperatura(6600));
    expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(250);
  });

  it('quanto mais frio, mais verde e azul, sem passar de 255 nem ficar negativo', () => {
    let anterior: [number, number, number] = [0, 0, 0];
    for (const k of [1500, 2000, 2700, 3000, 4000, 5000, 6500]) {
      const cor = canais(corDaTemperatura(k));
      for (const c of cor) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
      expect(cor[2]).toBeGreaterThanOrEqual(anterior[2]);
      expect(cor[1]).toBeGreaterThanOrEqual(anterior[1]);
      anterior = cor;
    }
  });

  it('acima da luz do dia o vermelho cai: fica azulada', () => {
    expect(canais(corDaTemperatura(12000))[0]).toBeLessThan(210);
  });

  it('recusa temperatura fora de 1000–40000 K', () => {
    expect(() => corDaTemperatura(500)).toThrow(RangeError);
    expect(() => corDaTemperatura(50000)).toThrow(RangeError);
    expect(() => corDaTemperatura(Number.NaN)).toThrow(RangeError);
  });
});
