import { describe, expect, it } from 'vitest';
import { criarRng } from '@sinuca/fisica';
import { Giz } from './giz';
import { REGRAS_GIZ_PADRAO, type RegrasGiz } from './regras-giz';

/** Um sorteio que devolve sempre o mesmo número em [0, 1). */
const fixo = (valor: number) => () => valor;

describe('Giz: desgaste por tacada', () => {
  it('começa fresco', () => {
    expect(new Giz(REGRAS_GIZ_PADRAO, fixo(0)).nivel).toBe(1);
  });

  it('o desgaste vai de desgasteMin (sorteio 0) a desgasteMax (sorteio perto de 1) e tira isso do nível', () => {
    const baixo = new Giz(REGRAS_GIZ_PADRAO, fixo(0));
    expect(baixo.consumir()).toBeCloseTo(0.1, 12);
    expect(baixo.nivel).toBeCloseTo(0.9, 12);
    const alto = new Giz(REGRAS_GIZ_PADRAO, fixo(0.999999));
    expect(alto.consumir()).toBeCloseTo(0.3, 5);
    expect(alto.nivel).toBeCloseTo(0.7, 5);
    const meio = new Giz(REGRAS_GIZ_PADRAO, fixo(0.5));
    expect(meio.consumir()).toBeCloseTo(0.2, 12);
  });

  it('o desgaste é uniforme: 20 mil tacadas ficam entre 10% e 30%, com média perto de 20% e os quatro quartos do intervalo parecidos', () => {
    const rng = criarRng(7);
    const giz = new Giz({ ...REGRAS_GIZ_PADRAO }, () => rng.proximo());
    const quartos = [0, 0, 0, 0];
    let soma = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const gasto = giz.consumir();
      expect(gasto).toBeGreaterThanOrEqual(0.1);
      expect(gasto).toBeLessThanOrEqual(0.3);
      soma += gasto;
      quartos[Math.min(3, Math.floor(((gasto - 0.1) / 0.2) * 4))]!++;
    }
    expect(soma / n).toBeCloseTo(0.2, 2);
    for (const q of quartos) expect(q / n).toBeCloseTo(0.25, 1);
  });

  it('não depende do efeito: só do sorteio e das regras', () => {
    const regras: RegrasGiz = { desgasteMin: 0.4, desgasteMax: 0.4, passada: 0.1, passadaS: 3 };
    const giz = new Giz(regras, fixo(0.123));
    expect(giz.consumir()).toBeCloseTo(0.4, 12);
  });

  it('nunca fica abaixo de zero', () => {
    const giz = new Giz(REGRAS_GIZ_PADRAO, fixo(0.9));
    for (let i = 0; i < 100; i++) giz.consumir();
    expect(giz.nivel).toBe(0);
  });

  it('as regras novas valem na próxima tacada', () => {
    const giz = new Giz(REGRAS_GIZ_PADRAO, fixo(0));
    giz.definirRegras({ ...REGRAS_GIZ_PADRAO, desgasteMin: 0.5, desgasteMax: 0.5 });
    expect(giz.consumir()).toBe(0.5);
  });
});

describe('Giz: passadas', () => {
  const gasto = (nivel: number): Giz => {
    const giz = new Giz({ ...REGRAS_GIZ_PADRAO, desgasteMin: 1 - nivel, desgasteMax: 1 - nivel }, fixo(0));
    giz.consumir();
    giz.definirRegras(REGRAS_GIZ_PADRAO);
    return giz;
  };

  it('uma passada soma 10% em 3 s, em linha reta', () => {
    const giz = gasto(0.4);
    expect(giz.passar()).toBe(true);
    expect(giz.passando).toBe(true);
    giz.atualizar(1.5);
    expect(giz.nivel).toBeCloseTo(0.45, 9);
    expect(giz.passando).toBe(true);
    giz.atualizar(1.5);
    expect(giz.nivel).toBeCloseTo(0.5, 9);
    expect(giz.passando).toBe(false);
  });

  it('a passada só termina no fim: atualizar com um dt grande não passa do alvo', () => {
    const giz = gasto(0.4);
    giz.passar();
    giz.atualizar(100);
    expect(giz.nivel).toBeCloseTo(0.5, 9);
    expect(giz.passando).toBe(false);
  });

  it('não começa outra passada durante uma, nem com o giz cheio', () => {
    const giz = new Giz(REGRAS_GIZ_PADRAO, fixo(0));
    expect(giz.passar()).toBe(false);
    giz.consumir();
    expect(giz.passar()).toBe(true);
    expect(giz.passar()).toBe(false);
  });

  it('a última passada para em 100% (não passa), mesmo com restos de ponto flutuante', () => {
    const giz = gasto(0.95);
    expect(giz.passar()).toBe(true);
    giz.atualizar(3);
    expect(giz.nivel).toBe(1);
    expect(giz.passar()).toBe(false);
  });

  it('dez passadas encadeadas levam do zero ao cheio exatamente, em 30 s', () => {
    const giz = new Giz({ ...REGRAS_GIZ_PADRAO, desgasteMin: 1, desgasteMax: 1 }, fixo(0));
    giz.consumir();
    giz.definirRegras(REGRAS_GIZ_PADRAO);
    expect(giz.nivel).toBe(0);
    let passadas = 0;
    let tempo = 0;
    while (giz.passar()) {
      passadas++;
      for (let i = 0; i < 30; i++) {
        giz.atualizar(0.1);
        tempo += 0.1;
      }
      expect(giz.passando).toBe(false);
    }
    expect(passadas).toBe(10);
    expect(tempo).toBeCloseTo(30, 6);
    expect(giz.nivel).toBe(1);
  });

  it('as regras novas valem na próxima passada; a que está em curso termina como começou', () => {
    const giz = gasto(0.4);
    giz.passar();
    giz.definirRegras({ ...REGRAS_GIZ_PADRAO, passada: 0.5, passadaS: 1 });
    giz.atualizar(3);
    expect(giz.nivel).toBeCloseTo(0.5, 9);
    giz.passar();
    giz.atualizar(1);
    expect(giz.nivel).toBeCloseTo(1, 9);
  });

  it('tacar no meio de uma passada a interrompe', () => {
    const giz = gasto(0.4);
    giz.passar();
    giz.atualizar(1);
    giz.consumir();
    expect(giz.passando).toBe(false);
    giz.atualizar(5);
    expect(giz.nivel).toBeLessThan(0.4);
  });
});
