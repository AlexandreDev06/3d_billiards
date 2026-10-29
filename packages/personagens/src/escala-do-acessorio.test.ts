import { describe, expect, it } from 'vitest';
import { escalaDoAcessorio } from './escala-do-acessorio';

/** A regra do `balao-meta.json`: largura segue 0,65 (piso 0,88, teto 1,32), altura segue 0,30 (piso 0,88, teto 1,14). */
const REGRA = { largura: { segue: 0.65, piso: 0.88, teto: 1.32 }, altura: { segue: 0.3, piso: 0.88, teto: 1.14 } };
const saida: [number, number, number] = [0, 0, 0];
const final = (no: [number, number, number], local: readonly number[]): number[] => no.map((s, i) => s * local[i]!);

describe('escalaDoAcessorio (a regra de escala do chapéu)', () => {
  it('nó sem escala: o chapéu fica como está', () => {
    escalaDoAcessorio([1, 1, 1], REGRA, saida);
    expect(saida).toEqual([1, 1, 1]);
  });

  it('a escala final no mundo é a da regra: largura pela média de x e z, altura por y', () => {
    const no: [number, number, number] = [1.42, 1.2, 1.42];
    escalaDoAcessorio(no, REGRA, saida);
    const [fx, fy, fz] = final(no, saida);
    expect(fx).toBeCloseTo(1 + 0.65 * 0.42, 9);
    expect(fz).toBeCloseTo(1 + 0.65 * 0.42, 9);
    expect(fy).toBeCloseTo(1 + 0.3 * 0.2, 9);
  });

  it('o nó que achata muito (altura 0,2): o piso segura o chapéu em 0,88', () => {
    const no: [number, number, number] = [0.94, 0.2, 0.94];
    escalaDoAcessorio(no, REGRA, saida);
    expect(final(no, saida)[1]).toBeCloseTo(0.88, 9);
    expect(final(no, saida)[0]).toBeCloseTo(1 - 0.65 * 0.06, 9);
  });

  it('o teto segura o estufar', () => {
    const no: [number, number, number] = [3, 3, 3];
    escalaDoAcessorio(no, REGRA, saida);
    expect(final(no, saida)).toEqual([1.32, 1.14, 1.32].map((v) => expect.closeTo(v, 9)));
  });

  it('x e z diferentes dão a mesma largura final nos dois eixos', () => {
    const no: [number, number, number] = [1.2, 1, 1.0];
    escalaDoAcessorio(no, REGRA, saida);
    const [fx, , fz] = final(no, saida);
    expect(fx).toBeCloseTo(fz!, 9);
  });

  it('escala do nó zero ou inválida não vira NaN (o acessório fica como está)', () => {
    escalaDoAcessorio([0, 1, 1], REGRA, saida);
    expect(saida.every(Number.isFinite)).toBe(true);
    escalaDoAcessorio([NaN, NaN, NaN], REGRA, saida);
    expect(saida).toEqual([1, 1, 1]);
  });
});
