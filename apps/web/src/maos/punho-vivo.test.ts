import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { PunhoVivo } from './punho-vivo';

const vida = CONFIG_WEB.maos.vida;
const PASSO = 1 / 60;

/** Puxa o taco a `v` m/s (positivo = para trás) por `s` segundos, a partir de `recuo`; devolve o recuo no fim. */
function mover(p: PunhoVivo, recuo: number, v: number, s: number): number {
  for (let t = 0; t < s - 1e-9; t += PASSO) {
    recuo += v * PASSO;
    p.atualizar(PASSO, recuo);
  }
  return recuo;
}

describe('PunhoVivo: o pulso balança com o recuo', () => {
  it('parado, o pulso e o aperto ficam em zero', () => {
    const p = new PunhoVivo(vida);
    mover(p, 0.03, 0, 1);
    expect(p.pulso).toBe(0);
    expect(p.aperto).toBe(0);
  });

  it('puxando o taco para trás o pulso fica para trás: o ângulo segue a velocidade, na medida do ganho', () => {
    const p = new PunhoVivo(vida);
    mover(p, 0.03, 0.2, 1);
    expect(p.pulso).toBeGreaterThan(0);
    expect(p.pulso).toBeCloseTo(vida.pulso.ganho * 0.2, 2);
  });

  it('nunca passa do máximo, por mais rápido que o taco ande', () => {
    const p = new PunhoVivo(vida);
    mover(p, 0.03, 5, 1);
    expect(p.pulso).toBeLessThanOrEqual(vida.pulso.maximo + 1e-9);
    const q = new PunhoVivo(vida);
    mover(q, 0.5, -5, 0.05);
    expect(q.pulso).toBeGreaterThanOrEqual(-vida.pulso.maximo - 1e-9);
  });

  it('parando de repente o pulso passa do zero (pêndulo) e assenta', () => {
    const p = new PunhoVivo(vida);
    const fim = mover(p, 0.03, 0.4, 0.6);
    let menor = Infinity;
    for (let t = 0; t < 2; t += PASSO) {
      p.atualizar(PASSO, fim);
      menor = Math.min(menor, p.pulso);
    }
    expect(menor).toBeLessThan(0);
    expect(Math.abs(p.pulso)).toBeLessThan(1e-3);
  });

  it('um quadro longo (dt de 1 s) não explode', () => {
    const p = new PunhoVivo(vida);
    p.atualizar(PASSO, 0.03);
    p.atualizar(1, 0.25);
    expect(Number.isFinite(p.pulso)).toBe(true);
    expect(Math.abs(p.pulso)).toBeLessThanOrEqual(vida.pulso.maximo + 1e-9);
  });

  it('dt zero não muda nada nem dá NaN', () => {
    const p = new PunhoVivo(vida);
    mover(p, 0.03, 0.3, 0.3);
    const antes = p.pulso;
    p.atualizar(0, 0.5);
    expect(p.pulso).toBe(antes);
  });
});

describe('PunhoVivo: o aperto na batida', () => {
  it('o taco indo à bola rápido: a mão aperta em `subidaS`', () => {
    const p = new PunhoVivo(vida);
    const recuo = mover(p, 0.25, 0, 0.2);
    mover(p, recuo, -3, vida.aperto.subidaS + PASSO);
    expect(p.aperto).toBeCloseTo(1, 6);
  });

  it('o aperto sobe aos poucos, não de uma vez', () => {
    const p = new PunhoVivo(vida);
    const recuo = mover(p, 0.25, 0, 0.1);
    mover(p, recuo, -3, PASSO);
    expect(p.aperto).toBeGreaterThan(0);
    expect(p.aperto).toBeLessThan(1);
  });

  it('segue o taco por `seguirS` depois de a batida acabar e então relaxa em `soltaS`', () => {
    const p = new PunhoVivo(vida);
    let recuo = mover(p, 0.25, 0, 0.1);
    recuo = mover(p, recuo, -3, 0.1);
    expect(p.aperto).toBe(1);
    // O taco parou: a mão ainda aperta por seguirS...
    recuo = mover(p, recuo, 0, vida.aperto.seguirS - 2 * PASSO);
    expect(p.aperto).toBe(1);
    // ...e depois relaxa, sem pular.
    mover(p, recuo, 0, 2 * PASSO + vida.aperto.soltaS / 2);
    expect(p.aperto).toBeGreaterThan(0.2);
    expect(p.aperto).toBeLessThan(0.8);
    mover(p, recuo, 0, vida.aperto.soltaS);
    expect(p.aperto).toBe(0);
  });

  it('indo devagar para a bola (a mira, o ajuste) não aperta', () => {
    const p = new PunhoVivo(vida);
    mover(p, 0.25, -vida.aperto.velocidadeMinima * 0.5, 0.2);
    expect(p.aperto).toBe(0);
  });

  it('puxando para trás nunca aperta', () => {
    const p = new PunhoVivo(vida);
    mover(p, 0.03, 3, 0.08);
    expect(p.aperto).toBe(0);
  });

  it('reiniciar zera tudo e o salto do recuo na vez seguinte não vira velocidade', () => {
    const p = new PunhoVivo(vida);
    const recuo = mover(p, 0.25, 0, 0.1);
    mover(p, recuo, -3, 0.1);
    p.reiniciar();
    expect(p.aperto).toBe(0);
    expect(p.pulso).toBe(0);
    p.atualizar(PASSO, 0.03);
    p.atualizar(PASSO, 0.03);
    expect(p.pulso).toBe(0);
    expect(p.aperto).toBe(0);
  });
});
