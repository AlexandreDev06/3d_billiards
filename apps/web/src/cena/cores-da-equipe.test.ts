import { describe, expect, it } from 'vitest';
import { COR_DA_EQUIPE, corDaEquipe } from './cores-da-equipe';

describe('cores da equipe', () => {
  it('são quatro cores diferentes, azul, laranja, verde e violeta (as de --equipe-0 a --equipe-3 do HUD)', () => {
    expect(COR_DA_EQUIPE).toEqual([0x3aa0ff, 0xffb347, 0x5fd39a, 0xc58bff]);
    expect(new Set(COR_DA_EQUIPE).size).toBe(4);
    const [azul, laranja, verde, violeta] = COR_DA_EQUIPE.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const);
    expect(azul![2]).toBeGreaterThan(azul![0]);
    expect(laranja![0]).toBeGreaterThan(laranja![2]);
    expect(verde![1]).toBeGreaterThan(verde![0]);
    expect(violeta![2]).toBeGreaterThan(violeta![1]);
  });

  it('o índice fora de 0 a 3 gira pela lista, sem lançar', () => {
    expect(corDaEquipe(0)).toBe(COR_DA_EQUIPE[0]);
    expect(corDaEquipe(3)).toBe(COR_DA_EQUIPE[3]);
    expect(corDaEquipe(4)).toBe(COR_DA_EQUIPE[0]);
    expect(corDaEquipe(-1)).toBe(COR_DA_EQUIPE[3]);
    expect(corDaEquipe(Number.NaN)).toBe(COR_DA_EQUIPE[0]);
  });
});
