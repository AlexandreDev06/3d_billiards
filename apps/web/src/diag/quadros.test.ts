import { describe, expect, it } from 'vitest';
import { EstatisticasDeQuadros } from './quadros';

function rodar(e: EstatisticasDeQuadros, de: number, ate: number, intervaloMs: number): number {
  let t = de;
  for (; t <= ate; t += intervaloMs) e.registrar(t);
  return t - intervaloMs;
}

describe('EstatisticasDeQuadros', () => {
  it('FPS da janela recente: 60 quadros por segundo a 16,67 ms', () => {
    const e = new EstatisticasDeQuadros();
    const fim = rodar(e, 0, 5000, 1000 / 60);
    expect(e.fps(1000, fim)).toBeCloseTo(60, 0);
  });

  it('a janela só olha o que é recente: depois de ficar lento o FPS cai', () => {
    const e = new EstatisticasDeQuadros();
    const meio = rodar(e, 0, 3000, 1000 / 60);
    const fim = rodar(e, meio + 100, 6000, 100);
    expect(e.fps(1000, fim)).toBeCloseTo(10, 0);
    expect(e.fps(10000, fim)).toBeGreaterThan(10);
  });

  it('pior quadro: o maior intervalo da janela, e some quando sai dela', () => {
    const e = new EstatisticasDeQuadros();
    rodar(e, 0, 1000, 10);
    e.registrar(1250);
    const depois = rodar(e, 1260, 1500, 10);
    expect(e.piorQuadroMs(1000, depois)).toBeCloseTo(250, 0);
    const longe = rodar(e, depois + 10, depois + 3000, 10);
    expect(e.piorQuadroMs(1000, longe)).toBeLessThan(20);
    expect(e.piorQuadroMs(5000, longe)).toBeCloseTo(250, 0);
  });

  it('sem quadros: zeros, sem dividir por zero', () => {
    const e = new EstatisticasDeQuadros();
    expect(e.fps(1000, 5000)).toBe(0);
    expect(e.piorQuadroMs(1000, 5000)).toBe(0);
    expect(e.periodo()).toEqual({ quadros: 0, fpsMedio: 0, piorMs: 0 });
    e.registrar(100);
    expect(e.fps(1000, 100)).toBe(0);
  });

  it('o resumo do período acumula até ser zerado', () => {
    const e = new EstatisticasDeQuadros();
    rodar(e, 0, 2000, 20);
    e.registrar(2120);
    const r = e.periodo();
    expect(r.fpsMedio).toBeCloseTo(48, 0);
    expect(r.piorMs).toBeCloseTo(120, 0);
    e.zerarPeriodo();
    expect(e.periodo()).toEqual({ quadros: 0, fpsMedio: 0, piorMs: 0 });
    e.interromper();
    rodar(e, 2200, 3000, 10);
    expect(e.periodo().fpsMedio).toBeCloseTo(100, 0);
    expect(e.periodo().piorMs).toBeLessThanOrEqual(11);
  });

  it('o pior do período é o maior intervalo, não o último', () => {
    const e = new EstatisticasDeQuadros();
    e.registrar(0);
    e.registrar(300);
    rodar(e, 310, 1000, 10);
    expect(e.periodo().piorMs).toBe(300);
  });

  it('pausa longa (aba escondida) não conta como quadro lento', () => {
    const e = new EstatisticasDeQuadros();
    rodar(e, 0, 1000, 16);
    e.registrar(61000);
    rodar(e, 61016, 62000, 16);
    expect(e.periodo().piorMs).toBeLessThan(20);
    e.interromper();
    e.registrar(70000);
    e.registrar(70016);
    expect(e.periodo().piorMs).toBeLessThan(20);
  });

  it('o anel dá a volta sem perder a conta recente', () => {
    const e = new EstatisticasDeQuadros(64);
    const fim = rodar(e, 0, 20000, 10);
    expect(e.fps(500, fim)).toBeCloseTo(100, 0);
    expect(e.periodo().quadros).toBeGreaterThan(1900);
  });
});
