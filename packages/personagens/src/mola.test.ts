import { describe, expect, it } from 'vitest';
import { MolaAmortecida } from './mola';

/** Anda `total` s em passos de `dt` e devolve o maior valor visto. */
function andar(m: MolaAmortecida, total: number, dt: number): { max: number; min: number } {
  let max = -Infinity;
  let min = Infinity;
  for (let t = 0; t < total - 1e-9; t += dt) {
    m.atualizar(dt);
    max = Math.max(max, m.valor);
    min = Math.min(min, m.valor);
  }
  return { max, min };
}

describe('MolaAmortecida', () => {
  it('chega ao alvo e para', () => {
    const m = new MolaAmortecida(4, 0.6, 0);
    m.alvo = 1;
    andar(m, 3, 1 / 60);
    expect(m.valor).toBeCloseTo(1, 4);
    expect(Math.abs(m.velocidade)).toBeLessThan(1e-3);
  });

  it('subamortecida passa um pouco do alvo e assenta', () => {
    const m = new MolaAmortecida(4, 0.4, 0);
    m.alvo = 1;
    const { max } = andar(m, 3, 1 / 120);
    expect(max).toBeGreaterThan(1.05);
    expect(max).toBeLessThan(1.4);
    expect(m.valor).toBeCloseTo(1, 3);
  });

  it('amortecimento crítico não passa do alvo', () => {
    const m = new MolaAmortecida(4, 1, 0);
    m.alvo = 1;
    const { max } = andar(m, 3, 1 / 120);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('superamortecida também não passa e chega', () => {
    const m = new MolaAmortecida(4, 2.5, 0);
    m.alvo = 1;
    const { max } = andar(m, 6, 1 / 120);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    expect(m.valor).toBeCloseTo(1, 3);
  });

  it('dá o mesmo resultado em passos pequenos e num passo grande (solução exata)', () => {
    for (const z of [0.3, 1, 2]) {
      const a = new MolaAmortecida(3, z, 0);
      const b = new MolaAmortecida(3, z, 0);
      a.alvo = b.alvo = 2;
      a.velocidade = b.velocidade = 1.5;
      for (let i = 0; i < 100; i++) a.atualizar(0.01);
      b.atualizar(1);
      expect(b.valor, `ζ=${z}`).toBeCloseTo(a.valor, 6);
      expect(b.velocidade, `ζ=${z}`).toBeCloseTo(a.velocidade, 6);
    }
  });

  it('estável com quadro enorme: nunca explode, venha de onde vier', () => {
    for (const dt of [0.5, 5, 50, 1e4]) {
      const m = new MolaAmortecida(12, 0.2, 100);
      m.alvo = -3;
      m.velocidade = 1e3;
      m.atualizar(dt);
      expect(Number.isFinite(m.valor)).toBe(true);
      expect(Math.abs(m.valor + 3)).toBeLessThan(1e3);
    }
  });

  it('dt zero ou negativo não mexe', () => {
    const m = new MolaAmortecida(4, 0.5, 1);
    m.alvo = 2;
    m.velocidade = 3;
    m.atualizar(0);
    m.atualizar(-1);
    expect(m.valor).toBe(1);
    expect(m.velocidade).toBe(3);
  });

  it('empurrar soma à velocidade; forcar para a mola no valor', () => {
    const m = new MolaAmortecida(4, 0.5, 0);
    m.empurrar(2);
    m.empurrar(1);
    expect(m.velocidade).toBe(3);
    m.forcar(5);
    expect(m.valor).toBe(5);
    expect(m.alvo).toBe(5);
    expect(m.velocidade).toBe(0);
  });

  it('frequência zero congela a mola no valor (sem NaN)', () => {
    const m = new MolaAmortecida(0, 0.5, 1);
    m.alvo = 3;
    m.atualizar(1);
    expect(Number.isFinite(m.valor)).toBe(true);
  });
});
