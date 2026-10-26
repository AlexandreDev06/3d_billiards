import { describe, expect, it } from 'vitest';
import { ancoraDaMatriz } from './ancora';
import { quadroVazio } from './alinhar';

// Matriz 4x4 em colunas (a ordem do three): colunas x, y, z e translação.
const matriz = (x: number[], y: number[], z: number[], p: number[]): number[] => [...x, 0, ...y, 0, ...z, 0, ...p, 1];

const perto = (a: number[], b: number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe('ancoraDaMatriz', () => {
  it('devolve a posição e a base do nó', () => {
    const q = quadroVazio();
    ancoraDaMatriz(matriz([1, 0, 0], [0, 1, 0], [0, 0, 1], [0.1, 0.2, 0.3]), q);
    expect([q.px, q.py, q.pz]).toEqual([0.1, 0.2, 0.3]);
    perto([q.xx, q.xy, q.xz, q.yx, q.yy, q.yz, q.zx, q.zy, q.zz], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('a escala do pai não vale: a base sai de comprimento 1, mesmo com escala diferente em cada eixo', () => {
    const q = quadroVazio();
    // nó girado 90° em torno de X (y → z, z → -y) dentro de um pai com escala (1,35 · 1,4 · 1,35)
    ancoraDaMatriz(matriz([1.35, 0, 0], [0, 0, 1.4], [0, -1.35, 0], [0, 0, 0]), q);
    expect(Math.hypot(q.xx, q.xy, q.xz)).toBeCloseTo(1, 9);
    expect(Math.hypot(q.yx, q.yy, q.yz)).toBeCloseTo(1, 9);
    expect(Math.hypot(q.zx, q.zy, q.zz)).toBeCloseTo(1, 9);
    perto([q.yx, q.yy, q.yz], [0, 0, 1]);
    perto([q.zx, q.zy, q.zz], [0, -1, 0]);
  });

  it('os três eixos ficam perpendiculares mesmo com a pele esticada em sentido torto', () => {
    const q = quadroVazio();
    ancoraDaMatriz(matriz([1, 0, 0], [0.3, 1, 0], [0, 0.2, 1], [0, 0, 0]), q);
    const x = [q.xx, q.xy, q.xz];
    const y = [q.yx, q.yy, q.yz];
    const z = [q.zx, q.zy, q.zz];
    const ponto = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(ponto(x, y)).toBeCloseTo(0, 9);
    expect(ponto(x, z)).toBeCloseTo(0, 9);
    expect(ponto(y, z)).toBeCloseTo(0, 9);
  });

  it('um eixo nulo não vira NaN (fica a identidade)', () => {
    const q = quadroVazio();
    ancoraDaMatriz(matriz([0, 0, 0], [0, 0, 0], [0, 0, 0], [1, 2, 3]), q);
    for (const v of [q.xx, q.xy, q.xz, q.yx, q.yy, q.yz, q.zx, q.zy, q.zz]) expect(Number.isFinite(v)).toBe(true);
    expect([q.px, q.py, q.pz]).toEqual([1, 2, 3]);
  });
});
