import { describe, expect, it } from 'vitest';
import { PrazoDaVez } from './prazo';

describe('PrazoDaVez', () => {
  it('conta o tempo por tacada a partir do início e diz quanto falta', () => {
    const prazo = new PrazoDaVez(30, 1500);
    prazo.iniciar(10_000);
    expect(prazo.restanteMs(10_000)).toBe(30_000);
    expect(prazo.restanteMs(25_000)).toBe(15_000);
    expect(prazo.restanteMs(40_000)).toBe(0);
  });

  it('o que falta nunca fica negativo e sai em ms inteiros', () => {
    const prazo = new PrazoDaVez(15, 0);
    prazo.iniciar(1000.4);
    expect(prazo.restanteMs(100_000)).toBe(0);
    expect(Number.isInteger(prazo.restanteMs(1005.3))).toBe(true);
  });

  it('a vez só vence depois do prazo mais a folga', () => {
    const prazo = new PrazoDaVez(30, 1500);
    prazo.iniciar(0);
    expect(prazo.vencimento).toBe(31_500);
    expect(prazo.venceu(31_499)).toBe(false);
    expect(prazo.venceu(31_500)).toBe(true);
  });

  it('sem limite não há prazo, nem o que falta, nem vencimento', () => {
    const prazo = new PrazoDaVez(null, 1500);
    prazo.iniciar(0);
    expect(prazo.restanteMs(1e9)).toBeNull();
    expect(prazo.vencimento).toBeNull();
    expect(prazo.venceu(1e12)).toBe(false);
  });

  it('antes de iniciar e depois de parar não há prazo', () => {
    const prazo = new PrazoDaVez(30, 1500);
    expect(prazo.restanteMs(0)).toBeNull();
    expect(prazo.venceu(1e12)).toBe(false);
    prazo.iniciar(0);
    prazo.parar();
    expect(prazo.restanteMs(0)).toBeNull();
    expect(prazo.venceu(1e12)).toBe(false);
  });

  it('iniciar de novo recomeça a contagem', () => {
    const prazo = new PrazoDaVez(30, 1500);
    prazo.iniciar(0);
    prazo.iniciar(20_000);
    expect(prazo.restanteMs(20_000)).toBe(30_000);
    expect(prazo.venceu(31_500)).toBe(false);
    expect(prazo.venceu(51_500)).toBe(true);
  });
});

describe('PrazoDaVez — teto (L25: a vez que vale moeda)', () => {
  it('sem limite e com teto, o prazo é o teto', () => {
    const prazo = new PrazoDaVez(null, 1500);
    prazo.iniciar(10_000, 120_000);
    expect(prazo.restanteMs(10_000)).toBe(120_000);
    expect(prazo.vencimento).toBe(131_500);
    expect(prazo.venceu(131_499)).toBe(false);
    expect(prazo.venceu(131_500)).toBe(true);
  });

  it('com limite menor que o teto vale o limite; com limite maior vale o teto', () => {
    const curto = new PrazoDaVez(30, 1500);
    curto.iniciar(0, 120_000);
    expect(curto.restanteMs(0)).toBe(30_000);
    const longo = new PrazoDaVez(600, 1500);
    longo.iniciar(0, 120_000);
    expect(longo.restanteMs(0)).toBe(120_000);
  });

  it('sem teto nada muda: sem limite segue sem prazo e o limite segue valendo', () => {
    const livre = new PrazoDaVez(null, 1500);
    livre.iniciar(0, null);
    expect(livre.restanteMs(1e9)).toBeNull();
    livre.iniciar(0);
    expect(livre.vencimento).toBeNull();
    const cronometrado = new PrazoDaVez(30, 1500);
    cronometrado.iniciar(0, null);
    expect(cronometrado.restanteMs(0)).toBe(30_000);
  });

  it('cada iniciar() decide de novo: o teto de uma vez não gruda na seguinte', () => {
    const prazo = new PrazoDaVez(null, 1500);
    prazo.iniciar(0, 120_000);
    prazo.iniciar(200_000);
    expect(prazo.restanteMs(200_000)).toBeNull();
  });
});
