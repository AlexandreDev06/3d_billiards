import { describe, expect, it } from 'vitest';
import { Flutuar, GelatinaDoCorpo, SeguidorDoCorpo } from './movimento-secundario';
import { sorteioDeTeste } from './para-testes';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from './alocacao-para-testes';

const graus = (g: number): number => (g * Math.PI) / 180;
const emGraus = (r: number): number => (r * 180) / Math.PI;

describe('SeguidorDoCorpo', () => {
  const novo = (o = {}): SeguidorDoCorpo => new SeguidorDoCorpo({ limiteDoOlharRad: graus(30), ...o });
  const assentar = (c: SeguidorDoCorpo, yaw: number, pitch = 0): void => {
    for (let i = 0; i < 600; i++) c.atualizar(1 / 60, yaw, pitch);
  };

  it('dentro do limite dos olhos o corpo gira só uma fração do ângulo', () => {
    const c = novo();
    assentar(c, graus(10));
    expect(emGraus(c.giro)).toBeCloseTo(3.5, 2);
  });

  it('passando do limite dos olhos o corpo gira mais (os olhos nunca precisam passar do limite)', () => {
    const c = novo();
    assentar(c, graus(50));
    // 0,35 × 50 + 0,65 × 20 = 30,5°: os olhos ficam com 19,5°, dentro dos 30°
    expect(emGraus(c.giro)).toBeCloseTo(30.5, 1);
    expect(50 - emGraus(c.giro)).toBeLessThan(30);
  });

  it('a curva é contínua no limite (sem degrau)', () => {
    const a = novo();
    const b = novo();
    assentar(a, graus(29.99));
    assentar(b, graus(30.01));
    expect(Math.abs(emGraus(a.giro) - emGraus(b.giro))).toBeLessThan(0.05);
  });

  it('o giro tem teto', () => {
    const c = novo({ giroMaximoRad: graus(40) });
    assentar(c, graus(170));
    expect(emGraus(c.giro)).toBeCloseTo(40, 3);
  });

  it('os olhos lideram: um quadro depois do salto do olhar o corpo mal saiu do lugar', () => {
    const c = novo();
    for (let i = 0; i < 5; i++) c.atualizar(1 / 60, graus(20), 0);
    expect(emGraus(c.giro)).toBeLessThan(7 * 0.25);
    assentar(c, graus(20));
    expect(emGraus(c.giro)).toBeCloseTo(7, 1);
  });

  it('a mola passa um pouco do alvo e assenta (nunca oscila sem parar)', () => {
    const c = novo();
    let maximo = 0;
    for (let i = 0; i < 600; i++) {
      c.atualizar(1 / 60, graus(20), 0);
      maximo = Math.max(maximo, c.giro);
    }
    expect(emGraus(maximo)).toBeGreaterThan(7.0);
    expect(emGraus(maximo)).toBeLessThan(7.0 * 1.2);
    expect(emGraus(c.giro)).toBeCloseTo(7, 2);
  });

  it('o ângulo negativo gira para o outro lado, igual', () => {
    const a = novo();
    const b = novo();
    assentar(a, graus(40), graus(15));
    assentar(b, graus(-40), graus(-15));
    expect(b.giro).toBeCloseTo(-a.giro, 9);
    expect(b.inclinacao).toBeCloseTo(-a.inclinacao, 9);
  });

  it('a inclinação (olhar para cima e para baixo) é menor que o giro', () => {
    const c = novo();
    assentar(c, graus(20), graus(20));
    expect(Math.abs(c.inclinacao)).toBeLessThan(Math.abs(c.giro) + 1e-9);
    expect(c.inclinacao).toBeGreaterThan(0);
  });

  it('quadro enorme não explode', () => {
    const c = novo();
    c.atualizar(60, graus(50), graus(10));
    expect(Number.isFinite(c.giro)).toBe(true);
    expect(emGraus(c.giro)).toBeCloseTo(30.5, 1);
  });

  it('reiniciar volta ao centro', () => {
    const c = novo();
    assentar(c, graus(40));
    c.reiniciar();
    expect(c.giro).toBe(0);
    expect(c.inclinacao).toBe(0);
  });
});

describe('GelatinaDoCorpo', () => {
  const dt = 1 / 60;
  /** Move o corpo na vertical com a aceleração `a` por `n` quadros; devolve o menor e o maior esticar vistos. */
  function acelerar(g: GelatinaDoCorpo, estado: { y: number; v: number }, a: number, n: number): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      estado.v += a * dt;
      estado.y += estado.v * dt;
      g.atualizar(dt, 0, estado.y, 0);
      min = Math.min(min, g.esticar);
      max = Math.max(max, g.esticar);
    }
    return { min, max };
  }

  it('parado não deforma nada', () => {
    const g = new GelatinaDoCorpo();
    for (let i = 0; i < 120; i++) g.atualizar(dt, 0.2, 0.3, -0.1);
    expect(g.escalaY).toBe(1);
    expect(g.escalaXZ).toBe(1);
    expect(g.inclinacaoX).toBeCloseTo(0, 12);
    expect(g.inclinacaoZ).toBeCloseTo(0, 12);
  });

  it('arrancar para cima achata; parar estica (e a mola passa do ponto antes de assentar)', () => {
    const g = new GelatinaDoCorpo();
    const e = { y: 0, v: 0 };
    for (let i = 0; i < 5; i++) g.atualizar(dt, 0, 0, 0);
    const subida = acelerar(g, e, 12, 8);
    expect(subida.min).toBeLessThan(-0.04);
    // anda com velocidade constante: a deformação se vai
    acelerar(g, e, 0, 90);
    expect(Math.abs(g.esticar)).toBeLessThan(0.01);
    // para de repente
    e.v = 0;
    const parada = acelerar(g, e, -10, 6);
    const depois = acelerar(g, e, 0, 20);
    expect(Math.max(parada.max, depois.max)).toBeGreaterThan(0.02);
    acelerar(g, e, 0, 200);
    expect(Math.abs(g.esticar)).toBeLessThan(0.005);
  });

  it('conserva o volume: escalaY × escalaXZ² = 1 sempre', () => {
    const g = new GelatinaDoCorpo();
    const e = { y: 0, v: 0 };
    for (let i = 0; i < 300; i++) {
      const a = 30 * Math.sin(i * 0.2);
      e.v += a * dt;
      e.y += e.v * dt;
      g.atualizar(dt, 0, e.y, 0);
      expect(g.escalaY * g.escalaXZ * g.escalaXZ).toBeCloseTo(1, 9);
    }
  });

  it('a deformação tem teto, mesmo com aceleração absurda', () => {
    const g = new GelatinaDoCorpo({ maximo: 0.18 });
    const e = { y: 0, v: 0 };
    const r = acelerar(g, e, 5000, 30);
    expect(r.min).toBeGreaterThanOrEqual(-0.18 - 1e-9);
    expect(r.max).toBeLessThanOrEqual(0.18 + 1e-9);
  });

  it('teletransporte (o balão surge em outro lugar) não é uma pancada', () => {
    const g = new GelatinaDoCorpo();
    for (let i = 0; i < 30; i++) g.atualizar(dt, 0, 0, 0);
    g.atualizar(dt, 5, 2, -3);
    g.atualizar(dt, 5, 2, -3);
    expect(Math.abs(g.esticar)).toBeLessThan(0.01);
    expect(Math.hypot(g.inclinacaoX, g.inclinacaoZ)).toBeLessThan(0.01);
  });

  it('o corpo pende para o lado contrário ao da aceleração (a parte de cima fica para trás)', () => {
    const g = new GelatinaDoCorpo();
    let x = 0;
    let v = 0;
    for (let i = 0; i < 8; i++) {
      v += 8 * dt;
      x += v * dt;
      g.atualizar(dt, x, 0, 0);
    }
    expect(g.inclinacaoX).toBeLessThan(-0.01);
    expect(Math.abs(g.inclinacaoZ)).toBeLessThan(1e-6);
  });

  it('quadro enorme ou quadro zero não deixam NaN', () => {
    const g = new GelatinaDoCorpo();
    g.atualizar(0, 1, 1, 1);
    g.atualizar(30, 2, 2, 2);
    g.atualizar(dt, 2.001, 2, 2);
    for (const v of [g.esticar, g.escalaY, g.escalaXZ, g.inclinacaoX, g.inclinacaoZ]) expect(Number.isFinite(v)).toBe(true);
  });

  it('reiniciar zera tudo', () => {
    const g = new GelatinaDoCorpo();
    const e = { y: 0, v: 0 };
    acelerar(g, e, 20, 6);
    g.reiniciar();
    expect(g.esticar).toBe(0);
    expect(g.escalaY).toBe(1);
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const g = new GelatinaDoCorpo();
    const passo = (i: number): void => g.atualizar(dt, Math.sin(i * 0.05) * 0.2, Math.cos(i * 0.11) * 0.1, 0);
    await provarSemAlocar(passo);
  }, TEMPO_DO_PERFILADOR_MS);
});

describe('Flutuar', () => {
  const rodar = (f: Flutuar, segundos: number, peso = 1): number[] => {
    const v: number[] = [];
    for (let t = 0; t < segundos; t += 0.1) {
      f.atualizar(0.1, peso);
      v.push(f.y, f.x, f.giroZ);
    }
    return v;
  };

  it('o mesmo sorteio deriva igual; outro sorteio, diferente', () => {
    expect(rodar(new Flutuar(sorteioDeTeste(1)), 30)).toEqual(rodar(new Flutuar(sorteioDeTeste(1)), 30));
    expect(rodar(new Flutuar(sorteioDeTeste(1)), 30)).not.toEqual(rodar(new Flutuar(sorteioDeTeste(2)), 30));
  });

  it('fica dentro da amplitude e usa boa parte dela', () => {
    const f = new Flutuar(sorteioDeTeste(3), { amplitudeM: 0.004, amplitudeRad: 0.03 });
    let ymax = 0;
    let zmax = 0;
    for (let t = 0; t < 300; t += 0.1) {
      f.atualizar(0.1, 1);
      ymax = Math.max(ymax, Math.abs(f.y));
      zmax = Math.max(zmax, Math.abs(f.giroZ));
    }
    expect(ymax).toBeLessThanOrEqual(0.004 + 1e-12);
    expect(ymax).toBeGreaterThan(0.002);
    expect(zmax).toBeLessThanOrEqual(0.03 + 1e-12);
  });

  it('o peso desliga a deriva (outra ação por cima) e a traz de volta sem salto', () => {
    const f = new Flutuar(sorteioDeTeste(3));
    rodar(f, 10);
    f.atualizar(0.016, 0);
    expect(f.y).toBe(0);
    expect(f.x).toBe(0);
    f.atualizar(0.016, 0.05);
    expect(Math.abs(f.y)).toBeLessThan(0.05 * 0.004 + 1e-12);
  });

  it('o ritmo varia em volta de 1 (a parada nunca repete igual)', () => {
    const f = new Flutuar(sorteioDeTeste(4), { variacaoDoRitmo: 0.15 });
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 120; t += 0.1) {
      f.atualizar(0.1, 1);
      min = Math.min(min, f.ritmo);
      max = Math.max(max, f.ritmo);
    }
    expect(min).toBeGreaterThanOrEqual(0.85 - 1e-9);
    expect(max).toBeLessThanOrEqual(1.15 + 1e-9);
    expect(max - min).toBeGreaterThan(0.05);
  });

  it('não é um laço: o que aconteceu num trecho não se repete adiante', () => {
    const f = new Flutuar(sorteioDeTeste(6));
    const tudo: number[] = [];
    for (let t = 0; t < 400; t += 0.5) {
      f.atualizar(0.5, 1);
      tudo.push(f.y);
    }
    const trecho = tudo.slice(0, 16);
    for (let deslocamento = 4; deslocamento + 16 <= tudo.length; deslocamento += 4) {
      const outro = tudo.slice(deslocamento, deslocamento + 16);
      expect(trecho.every((v, i) => Math.abs(v - outro[i]!) < 0.0002), `deslocamento ${deslocamento}`).toBe(false);
    }
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const f = new Flutuar(sorteioDeTeste(7));
    await provarSemAlocar((i) => f.atualizar(1 / 60, (i % 100) / 100));
  }, TEMPO_DO_PERFILADOR_MS);
});
