import { describe, expect, it } from 'vitest';
import { sorteioDeTeste as semente } from './para-testes';
import { RuidoSuave } from './ruido';

describe('RuidoSuave', () => {
  it('o mesmo sorteio dá a mesma curva; outro sorteio, outra', () => {
    const a = new RuidoSuave(semente(7));
    const b = new RuidoSuave(semente(7));
    const c = new RuidoSuave(semente(8));
    let diferente = false;
    for (let t = 0; t < 20; t += 0.37) {
      expect(a.valor(t)).toBe(b.valor(t));
      if (a.valor(t) !== c.valor(t)) diferente = true;
    }
    expect(diferente).toBe(true);
  });

  it('fica entre -1 e 1 e usa a faixa toda ao longo do tempo', () => {
    const r = new RuidoSuave(semente(3), 0.3);
    let max = -Infinity;
    let min = Infinity;
    for (let t = 0; t < 600; t += 0.05) {
      const v = r.valor(t);
      expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-12);
      max = Math.max(max, v);
      min = Math.min(min, v);
    }
    expect(max).toBeGreaterThan(0.6);
    expect(min).toBeLessThan(-0.6);
  });

  it('é suave: dois instantes próximos dão valores próximos', () => {
    const r = new RuidoSuave(semente(11), 0.5);
    for (let t = 0; t < 60; t += 0.1) expect(Math.abs(r.valor(t + 0.01) - r.valor(t))).toBeLessThan(0.1);
  });

  it('não é um laço: o que se vê num intervalo não se repete adiante', () => {
    const r = new RuidoSuave(semente(5), 0.25);
    const amostra = (t0: number): number[] => Array.from({ length: 12 }, (_, i) => r.valor(t0 + i * 0.5));
    const base = amostra(0);
    for (const periodo of [2.6, 5.2, 7.8, 13, 26, 52, 104, 260]) {
      const outra = amostra(periodo);
      const igual = base.every((v, i) => Math.abs(v - outra[i]!) < 0.02);
      expect(igual, `período ${periodo}`).toBe(false);
    }
  });

  it('a frequência escala a rapidez', () => {
    const lento = new RuidoSuave(semente(2), 0.1);
    const rapido = new RuidoSuave(semente(2), 1);
    const variacao = (r: RuidoSuave): number => {
      let soma = 0;
      for (let t = 0; t < 30; t += 0.05) soma += Math.abs(r.valor(t + 0.05) - r.valor(t));
      return soma;
    };
    expect(variacao(rapido)).toBeGreaterThan(variacao(lento) * 5);
  });
});
