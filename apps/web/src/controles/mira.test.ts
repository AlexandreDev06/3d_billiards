import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { Mira } from './mira';

const cfg = CONFIG_WEB.mira;

describe('Mira', () => {
  it('mouse para a direita aumenta o ângulo (gira no sentido horário visto de cima)', () => {
    const mira = new Mira(cfg);
    mira.girar(100, false);
    expect(mira.angulo).toBeCloseTo(100 * cfg.radianosPorPixel, 9);
  });

  it('Shift usa 1/5 da sensibilidade', () => {
    const normal = new Mira(cfg);
    normal.girar(100, false);
    const fina = new Mira(cfg);
    fina.girar(100, true);
    expect(fina.angulo).toBeCloseTo(normal.angulo / 5, 9);
  });

  it('mantém o ângulo em [-π, π)', () => {
    const mira = new Mira(cfg);
    mira.girar((3 * Math.PI) / cfg.radianosPorPixel, false);
    expect(mira.angulo).toBeGreaterThanOrEqual(-Math.PI);
    expect(mira.angulo).toBeLessThan(Math.PI);
    expect(mira.angulo).toBeCloseTo(-Math.PI, 6);
  });

  it('ângulo inicial é respeitado', () => {
    expect(new Mira(cfg, 1.5).angulo).toBe(1.5);
  });

  it('definir coloca o ângulo, normalizado', () => {
    const mira = new Mira(cfg);
    mira.definir(0.7);
    expect(mira.angulo).toBeCloseTo(0.7, 9);
    mira.definir(2 * Math.PI + 0.3);
    expect(mira.angulo).toBeCloseTo(0.3, 9);
  });

  it('configurar troca a sensibilidade na hora: o próximo giro já usa a nova', () => {
    const mira = new Mira(cfg);
    mira.girar(100, false);
    const antes = mira.angulo;
    mira.configurar({ radianosPorPixel: cfg.radianosPorPixel * 2, fatorFino: 0.5 });
    mira.girar(100, false);
    expect(mira.angulo - antes).toBeCloseTo(100 * cfg.radianosPorPixel * 2, 9);
    mira.definir(0);
    mira.girar(100, true);
    expect(mira.angulo).toBeCloseTo(100 * cfg.radianosPorPixel * 2 * 0.5, 9);
  });
});
