import { describe, expect, it } from 'vitest';
import { SEM_VARIACAO, aplicarTom, misturar, variacaoDaSemente } from './variacao-da-semente';

describe('variacaoDaSemente', () => {
  it('é determinística: a mesma semente dá sempre a mesma variação', () => {
    for (const s of [0, 1, 347, 999]) expect(variacaoDaSemente(s)).toEqual(variacaoDaSemente(s));
  });

  it('sem semente, ou com uma fora de 0 a 999, é o taco de fábrica', () => {
    for (const s of [null, undefined, -1, 1000, 3.5, Number.NaN]) expect(variacaoDaSemente(s)).toBe(SEM_VARIACAO);
    expect(SEM_VARIACAO).toMatchObject({ semente: null, rolo: 0, deslocamento: 0, giro: 0, escala: 1, tom: { matiz: 0, claridade: 1 } });
  });

  it('cada número cai na faixa que o contrato diz, para todas as 1000 sementes', () => {
    for (let s = 0; s < 1000; s++) {
      const v = variacaoDaSemente(s);
      expect(v.semente).toBe(s);
      expect(v.rolo).toBeGreaterThanOrEqual(0);
      expect(v.rolo).toBeLessThan(1);
      expect(v.deslocamento).toBeGreaterThanOrEqual(0);
      expect(v.deslocamento).toBeLessThan(1);
      expect(Math.abs(v.giro)).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(v.escala).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(v.escala).toBeLessThanOrEqual(1.25 + 1e-9);
      expect(Math.abs(v.tom.matiz)).toBeLessThanOrEqual(10 + 1e-9);
      expect(v.tom.claridade).toBeGreaterThanOrEqual(0.95);
      expect(v.tom.claridade).toBeLessThanOrEqual(1.05);
    }
  });

  it('sementes diferentes dão tacos diferentes (quase nunca o mesmo rolo)', () => {
    const rolos = new Set<number>();
    for (let s = 0; s < 1000; s++) rolos.add(variacaoDaSemente(s).rolo);
    expect(rolos.size).toBeGreaterThan(990);
    expect(variacaoDaSemente(346)).not.toEqual(variacaoDaSemente(347));
  });
});

describe('misturar', () => {
  it('é determinística, de 0 a 1, e muda com qualquer dos três números', () => {
    expect(misturar(1, 2, 3)).toBe(misturar(1, 2, 3));
    for (let i = 0; i < 200; i++) {
      const x = misturar(i, i * 7, 11);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(misturar(1, 2, 3)).not.toBe(misturar(2, 2, 3));
    expect(misturar(1, 2, 3)).not.toBe(misturar(1, 3, 3));
    expect(misturar(1, 2, 3)).not.toBe(misturar(1, 2, 4));
  });
});

describe('aplicarTom', () => {
  it('o tom neutro devolve a mesma cor', () => {
    expect(aplicarTom(0x3a64e6, { matiz: 0, claridade: 1 })).toBe(0x3a64e6);
  });

  it('o cinza e o preto quase não mudam com o giro de matiz; a cor viva muda', () => {
    const tom = { matiz: 10, claridade: 1 };
    const canal = (c: number, k: number): number => (c >> k) & 255;
    const cinza = aplicarTom(0x808080, tom);
    for (const k of [0, 8, 16]) expect(Math.abs(canal(cinza, k) - 0x80)).toBeLessThanOrEqual(2);
    expect(aplicarTom(0x000000, tom)).toBe(0);
    expect(aplicarTom(0xd32ce6, tom)).not.toBe(0xd32ce6);
  });

  it('a claridade escurece ou clareia, sem passar de 0 a 255', () => {
    expect(aplicarTom(0x808080, { matiz: 0, claridade: 1.05 }) & 255).toBeGreaterThan(0x80);
    expect(aplicarTom(0x808080, { matiz: 0, claridade: 0.95 }) & 255).toBeLessThan(0x80);
    expect(aplicarTom(0xffffff, { matiz: 0, claridade: 1.05 })).toBe(0xffffff);
  });
});
