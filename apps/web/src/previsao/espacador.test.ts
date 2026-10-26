import { describe, expect, it } from 'vitest';
import { Espacador } from './espacador';

const CFG = { espacoMinimoMs: 40, fatorCusto: 6 };

describe('Espacador', () => {
  it('libera o primeiro cálculo na hora', () => {
    expect(new Espacador(CFG).pode(0)).toBe(true);
  });

  it('depois de um cálculo barato espera o espaço mínimo', () => {
    const e = new Espacador(CFG);
    e.registrar(1000, 2);
    expect(e.pode(1039)).toBe(false);
    expect(e.pode(1040)).toBe(true);
  });

  it('cálculo caro espaça mais: o espaço é fatorCusto vezes o custo', () => {
    const e = new Espacador(CFG);
    e.registrar(1000, 12);
    expect(e.pode(1071)).toBe(false);
    expect(e.pode(1072)).toBe(true);
  });

  it('o custo conta desde o início do cálculo, não desde o fim', () => {
    const e = new Espacador(CFG);
    e.registrar(2000, 10);
    expect(e.pode(2059)).toBe(false);
    expect(e.pode(2060)).toBe(true);
  });

  it('o último cálculo é o que vale: um barato depois de um caro volta ao mínimo', () => {
    const e = new Espacador(CFG);
    e.registrar(0, 20);
    e.registrar(200, 1);
    expect(e.pode(239)).toBe(false);
    expect(e.pode(240)).toBe(true);
  });

  it('reiniciar libera de novo na hora', () => {
    const e = new Espacador(CFG);
    e.registrar(1000, 30);
    e.reiniciar();
    expect(e.pode(1001)).toBe(true);
  });
});
