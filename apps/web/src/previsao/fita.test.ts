import { describe, expect, it } from 'vitest';
import { escreverFita, indicesDaFita } from './fita';

const LARGURA = 0.004;
const Y = 0.002;

function vertices(segmentos: number): Float32Array {
  return new Float32Array(segmentos * 12);
}

function quad(v: Float32Array, k: number): { x: number; y: number; z: number }[] {
  return [0, 1, 2, 3].map((j) => ({ x: v[k * 12 + j * 3]!, y: v[k * 12 + j * 3 + 1]!, z: v[k * 12 + j * 3 + 2]! }));
}

describe('escreverFita', () => {
  it('um segmento ao longo de +x vira um retângulo de largura 4 mm, a 2 mm do pano', () => {
    const v = vertices(1);
    const n = escreverFita(new Float32Array([0, 0, 1, 0]), 2, LARGURA, Y, v);
    expect(n).toBe(1);
    const q = quad(v, 0);
    for (const p of q) expect(p.y).toBeCloseTo(Y, 6);
    expect(q.map((p) => p.x)).toEqual([0, 0, 1, 1].map((x) => expect.closeTo(x, 6)));
    expect(Math.max(...q.map((p) => p.z)) - Math.min(...q.map((p) => p.z))).toBeCloseTo(LARGURA, 6);
    expect(q[0]!.z + q[1]!.z).toBeCloseTo(0, 6);
  });

  it('o deslocamento é perpendicular à direção também na diagonal', () => {
    const v = vertices(1);
    escreverFita(new Float32Array([0, 0, 3, 4]), 2, LARGURA, Y, v);
    const q = quad(v, 0);
    const [a, b, c, d] = [q[0]!, q[1]!, q[2]!, q[3]!];
    const lado = { x: a.x - b.x, z: a.z - b.z };
    expect(Math.hypot(lado.x, lado.z)).toBeCloseTo(LARGURA, 6);
    expect(lado.x * 3 + lado.z * 4).toBeCloseTo(0, 6);
    // Os dois lados do segundo ponto têm a mesma largura e o mesmo sentido.
    expect(c.x - d.x).toBeCloseTo(lado.x, 6);
    expect(c.z - d.z).toBeCloseTo(lado.z, 6);
  });

  it('um quadrado por trecho do caminho, cada um com o seu par de pontos', () => {
    const v = vertices(2);
    const n = escreverFita(new Float32Array([0, 0, 1, 0, 1, 1]), 3, LARGURA, Y, v);
    expect(n).toBe(2);
    const q1 = quad(v, 1);
    expect(q1.map((p) => p.x).every((x) => Math.abs(x - 1) <= LARGURA)).toBe(true);
    expect(Math.min(...q1.map((p) => p.z))).toBeCloseTo(0, 6);
    expect(Math.max(...q1.map((p) => p.z))).toBeCloseTo(1, 6);
  });

  it('trecho de comprimento zero é pulado, sem NaN', () => {
    const v = vertices(2);
    const n = escreverFita(new Float32Array([0, 0, 0, 0, 1, 0]), 3, LARGURA, Y, v);
    expect(n).toBe(1);
    expect(Array.from(v.slice(0, 12)).every(Number.isFinite)).toBe(true);
  });

  it('menos de dois pontos não desenha nada', () => {
    expect(escreverFita(new Float32Array([5, 5]), 1, LARGURA, Y, vertices(1))).toBe(0);
    expect(escreverFita(new Float32Array(), 0, LARGURA, Y, vertices(1))).toBe(0);
  });

  it('só escreve até onde o buffer de vértices comporta', () => {
    const v = vertices(2);
    const n = escreverFita(new Float32Array([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]), 5, LARGURA, Y, v);
    expect(n).toBe(2);
  });

  it('usa só `quantidade` pontos, ignorando o resto do array', () => {
    const v = vertices(3);
    const n = escreverFita(new Float32Array([0, 0, 1, 0, 9, 9, 9, 9]), 2, LARGURA, Y, v);
    expect(n).toBe(1);
  });
});

describe('indicesDaFita', () => {
  it('dois triângulos por quadrado, cada quadrado com os seus 4 vértices', () => {
    const idx = indicesDaFita(2);
    expect(Array.from(idx)).toEqual([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
  });
});

describe('o sentido dos triângulos', () => {
  it('as faces olham para cima (+y) para um segmento em +x', () => {
    const v = vertices(1);
    escreverFita(new Float32Array([0, 0, 1, 0]), 2, LARGURA, Y, v);
    const idx = indicesDaFita(1);
    const p = (i: number): [number, number, number] => [v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!];
    const [a, b, c] = [p(idx[0]!), p(idx[1]!), p(idx[2]!)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    const normalY = u[2] * w[0] - u[0] * w[2];
    expect(normalY).toBeGreaterThan(0);
  });
});
