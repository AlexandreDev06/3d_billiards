import { describe, expect, it } from 'vitest';
import { GizDosJogadores } from './giz-jogadores';
import { REGRAS_GIZ_PADRAO, type RegrasGiz } from './regras-giz';

/** 10% por tacada e passadas de 10% em 1 s: contas redondas. */
const REGRAS: RegrasGiz = { desgasteMin: 0.1, desgasteMax: 0.1, passada: 0.1, passadaS: 1 };
const sorteio = () => 0.5;

describe('GizDosJogadores', () => {
  it('cada jogador gasta só o seu giz', () => {
    const gizes = new GizDosJogadores(2, REGRAS, sorteio);
    gizes.consumir();
    gizes.consumir();
    expect(gizes.nivel).toBeCloseTo(0.8, 9);
    gizes.definirVez(1);
    expect(gizes.nivel).toBe(1);
    gizes.consumir();
    expect(gizes.nivel).toBeCloseTo(0.9, 9);
    gizes.definirVez(0);
    expect(gizes.nivel).toBeCloseTo(0.8, 9);
    expect(gizes.nivelDe(1)).toBeCloseTo(0.9, 9);
  });

  it('passar o giz recupera o nível só de quem tem a vez', () => {
    const gizes = new GizDosJogadores(2, REGRAS, sorteio);
    gizes.consumir();
    gizes.definirVez(1);
    gizes.consumir();
    expect(gizes.passar()).toBe(true);
    expect(gizes.passando).toBe(true);
    gizes.atualizar(1);
    expect(gizes.nivel).toBe(1);
    expect(gizes.nivelDe(0)).toBeCloseTo(0.9, 9);
  });

  it('reiniciar devolve o giz fresco a todos e a vez ao primeiro', () => {
    const gizes = new GizDosJogadores(2, REGRAS, sorteio);
    gizes.definirVez(1);
    gizes.consumir();
    gizes.reiniciar();
    expect(gizes.nivel).toBe(1);
    gizes.definirVez(0);
    expect(gizes.nivelDe(1)).toBe(1);
    gizes.consumir();
    gizes.reiniciar();
    expect(gizes.nivel).toBe(1);
  });

  it('as regras da sala valem para todos os jogadores, inclusive os que já existiam', () => {
    const gizes = new GizDosJogadores(2, REGRAS, sorteio);
    gizes.definirRegras({ desgasteMin: 0.3, desgasteMax: 0.3, passada: 0.2, passadaS: 1 });
    expect(gizes.consumir()).toBeCloseTo(0.3, 9);
    gizes.definirVez(1);
    gizes.consumir();
    expect(gizes.nivel).toBeCloseTo(0.7, 9);
    gizes.reiniciar();
    expect(gizes.regrasAtuais.desgasteMin).toBe(0.3);
    gizes.consumir();
    expect(gizes.nivel).toBeCloseTo(0.7, 9);
  });

  it('usa as regras padrão quando a sala não manda nada', () => {
    const gizes = new GizDosJogadores(1, REGRAS_GIZ_PADRAO, () => 0);
    expect(gizes.consumir()).toBeCloseTo(0.1, 9);
  });

  it('recusa jogador que não existe', () => {
    const gizes = new GizDosJogadores(2, REGRAS, sorteio);
    expect(() => gizes.definirVez(2)).toThrow(RangeError);
    expect(() => gizes.definirVez(-1)).toThrow(RangeError);
  });
});
