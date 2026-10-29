import { describe, expect, it } from 'vitest';
import { CordinhaSimulada, type OpcoesDaCordinha } from './cordinha';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from './alocacao-para-testes';

const ELOS = [0.018, 0.018, 0.018, 0.018];
const TOTAL = 0.072;

const nova = (o: Partial<OpcoesDaCordinha> = {}): CordinhaSimulada => new CordinhaSimulada(ELOS, o);
const p = (c: CordinhaSimulada, i: number): [number, number, number] => [c.pontos[i * 3]!, c.pontos[i * 3 + 1]!, c.pontos[i * 3 + 2]!];
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

function comprimentosErro(c: CordinhaSimulada): number {
  let pior = 0;
  for (let i = 0; i < ELOS.length; i++) pior = Math.max(pior, Math.abs(dist(p(c, i), p(c, i + 1)) - ELOS[i]! * c.escala) / ELOS[i]!);
  return pior;
}

/** Roda `segundos` com a âncora na trajetória `caminho(t)` (posição) e o eixo para baixo. */
function rodar(c: CordinhaSimulada, segundos: number, caminho: (t: number) => [number, number, number], dt = 1 / 60, t0 = 0): number {
  let t = t0;
  while (t < t0 + segundos - 1e-9) {
    t += dt;
    const [x, y, z] = caminho(t);
    c.atualizar(dt, x, y, z, 0, -1, 0);
  }
  return t;
}

describe('CordinhaSimulada', () => {
  it('começa esticada ao longo do eixo, com os comprimentos certos', () => {
    const c = nova();
    c.atualizar(0, 1, 2, 3, 0, -1, 0);
    expect(p(c, 0)).toEqual([1, 2, 3]);
    expect(p(c, 4)[1]).toBeCloseTo(2 - TOTAL, 9);
    expect(comprimentosErro(c)).toBeLessThan(1e-9);
  });

  it('pendura pela gravidade: parada a âncora, a cordinha cai reta para baixo', () => {
    const c = nova();
    rodar(c, 4, () => [0, 1, 0]);
    for (let i = 1; i <= 4; i++) expect(p(c, i)[1]).toBeLessThan(p(c, i - 1)[1]);
    expect(Math.hypot(p(c, 4)[0] - 0, p(c, 4)[2] - 0)).toBeLessThan(TOTAL * 0.1);
    expect(p(c, 4)[1]).toBeGreaterThan(1 - TOTAL - 1e-6);
    expect(p(c, 4)[1]).toBeLessThan(1 - TOTAL * 0.97);
  });

  it('o que sai na horizontal cai com a gravidade (sem rigidez na base)', () => {
    const c = nova({ rigidezDaBase: 0 });
    c.atualizar(0, 0, 1, 0, 1, 0, 0);
    for (let i = 0; i < 180; i++) c.atualizar(1 / 60, 0, 1, 0, 1, 0, 0);
    expect(p(c, 4)[1]).toBeLessThan(1 - TOTAL * 0.8);
  });

  it('a base rígida segura o primeiro elo perto do eixo de saída', () => {
    const angulo = (rigidez: number): number => {
      const c = nova({ rigidezDaBase: rigidez });
      c.atualizar(0, 0, 1, 0, 1, 0, 0);
      for (let i = 0; i < 180; i++) c.atualizar(1 / 60, 0, 1, 0, 1, 0, 0);
      const [x, y] = p(c, 1);
      return Math.atan2(1 - y, x);
    };
    expect(angulo(0.5)).toBeLessThan(angulo(0));
  });

  it('segue o corpo com atraso: a ponta fica para trás na saída e alcança depois', () => {
    const c = nova();
    rodar(c, 1, () => [0, 1, 0]);
    // desliza 0,3 m em 0,3 s
    const t = rodar(c, 0.3, (t) => [Math.min((t - 1) / 0.3, 1) * 0.3, 1, 0], 1 / 60, 1);
    expect(0.3 - p(c, 4)[0]).toBeGreaterThan(0.008);
    rodar(c, 3, () => [0.3, 1, 0], 1 / 60, t);
    expect(Math.abs(p(c, 4)[0] - 0.3)).toBeLessThan(TOTAL * 0.1);
  });

  it('os comprimentos ficam exatos, quadro a quadro, com a âncora se mexendo à toa', () => {
    const c = nova();
    let pior = 0;
    for (let i = 0; i < 1200; i++) {
      const t = i / 60;
      c.atualizar(1 / 60, 0.4 * Math.sin(t * 7), 1 + 0.2 * Math.sin(t * 11), 0.3 * Math.cos(t * 5), Math.sin(t), -1, Math.cos(t * 2));
      pior = Math.max(pior, comprimentosErro(c));
    }
    expect(pior).toBeLessThan(1e-9);
  });

  it('não explode nem estica: âncora chicoteando a 6 Hz, quadros normais e quadros lentos', () => {
    for (const dt of [1 / 60, 1 / 30, 0.1, 0.5]) {
      const c = nova();
      let pior = 0;
      for (let i = 0; i < 400; i++) {
        const t = i * dt;
        c.atualizar(dt, 2 * Math.sin(t * 2 * Math.PI * 6), 1 + Math.sin(t * 9), 0, 0, -1, 0);
        const [ax, ay, az] = p(c, 0);
        for (let k = 1; k <= 4; k++) {
          const d = dist(p(c, k), [ax, ay, az]);
          expect(Number.isFinite(d), `dt ${dt}`).toBe(true);
          pior = Math.max(pior, d);
        }
        expect(comprimentosErro(c), `dt ${dt}`).toBeLessThan(1e-9);
      }
      expect(pior).toBeLessThanOrEqual(TOTAL + 1e-9);
    }
  });

  it('teletransporte leva a cordinha junto, com a mesma forma (sem chicote)', () => {
    const c = nova();
    rodar(c, 1, (t) => [0.05 * Math.sin(t * 5), 1, 0]);
    const antes = [0, 1, 2, 3, 4].map((i) => {
      const a = p(c, 0);
      const q = p(c, i);
      return [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    });
    c.atualizar(0, 10, 3, -4, 0, -1, 0);
    for (let i = 0; i <= 4; i++) {
      const a = p(c, 0);
      const q = p(c, i);
      expect(q[0] - a[0]).toBeCloseTo(antes[i]![0]!, 6);
      expect(q[1] - a[1]).toBeCloseTo(antes[i]![1]!, 6);
      expect(q[2] - a[2]).toBeCloseTo(antes[i]![2]!, 6);
    }
    expect(p(c, 0)).toEqual([10, 3, -4]);
  });

  it('passo fixo e no máximo N subpassos: um quadro enorme não trava nem acelera o tempo', () => {
    const c = nova({ maxSubpassos: 5 });
    c.atualizar(5, 0, 1, 0, 0, -1, 0);
    c.atualizar(5, 0, 1, 0, 0, -1, 0);
    expect(c.passos).toBeLessThanOrEqual(5);
    const d = nova();
    d.atualizar(0, 0, 1, 0, 0, -1, 0);
    let total = 0;
    for (let i = 0; i < 60; i++) {
      d.atualizar(1 / 60, 0, 1, 0, 0, -1, 0);
      total += d.passos;
    }
    expect(Math.abs(total - 120)).toBeLessThanOrEqual(1);
  });

  it('não depende do quadro: o mesmo movimento a 60 e a 30 quadros por segundo dá quase o mesmo', () => {
    const caminho = (t: number): [number, number, number] => [0.1 * Math.sin(t * 3), 1, 0];
    const a = nova();
    const b = nova();
    rodar(a, 2, caminho, 1 / 60);
    rodar(b, 2, caminho, 1 / 30);
    expect(dist(p(a, 4), p(b, 4))).toBeLessThan(TOTAL * 0.2);
  });

  it('a escala dos comprimentos acompanha o balão (aparecendo, estufando)', () => {
    const c = nova();
    rodar(c, 1, () => [0, 1, 0]);
    c.escala = 2;
    rodar(c, 2, () => [0, 1, 0], 1 / 60, 1);
    expect(dist(p(c, 0), p(c, 1))).toBeCloseTo(ELOS[0]! * 2, 9);
    expect(comprimentosErro(c)).toBeLessThan(1e-9);
  });

  it('o mesmo movimento dá a mesma cordinha (nada aleatório)', () => {
    const rodada = (): number[] => {
      const c = nova();
      rodar(c, 3, (t) => [0.2 * Math.sin(t * 4), 1, 0.1 * Math.cos(t * 3)]);
      return [...c.pontos];
    };
    expect(rodada()).toEqual(rodada());
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const c = nova();
    const passo = (i: number): void => c.atualizar(1 / 60, Math.sin(i * 0.1) * 0.3, 1, Math.cos(i * 0.07) * 0.2, 0, -1, 0);
    await provarSemAlocar(passo);
  }, TEMPO_DO_PERFILADOR_MS);

  it('lança sem elos ou com elo de comprimento zero', () => {
    expect(() => new CordinhaSimulada([])).toThrow();
    expect(() => new CordinhaSimulada([0.1, 0])).toThrow();
  });
});
