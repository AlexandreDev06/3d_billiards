import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { atribuirUv, uvLadrilho } from './uv';

function triangulo(posicoes: number[], normais: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posicoes, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normais, 3));
  return g;
}

describe('uvLadrilho', () => {
  const uvDe = uvLadrilho(0.5);

  it('de cima usa o plano XZ', () => {
    expect(uvDe({ x: 1, y: 0.3, z: 2, nx: 0, ny: 1, nz: 0 })).toEqual([2, 4]);
  });

  it('parede virada para z anda em x e na altura', () => {
    expect(uvDe({ x: 1, y: 0.25, z: 2, nx: 0, ny: 0, nz: 1 })).toEqual([2, 0.5]);
  });

  it('parede virada para x anda em z e na altura', () => {
    expect(uvDe({ x: 1, y: 0.25, z: 2, nx: -1, ny: 0, nz: 0 })).toEqual([4, 0.5]);
  });

  it('face inclinada (normal mais para o lado que para cima) conta como parede', () => {
    const [u, v] = uvDe({ x: 1, y: 0.25, z: 2, nx: 0, ny: 0.5, nz: 0.86 });
    expect(u).toBe(2);
    expect(v).toBe(0.5);
  });
});

describe('atribuirUv', () => {
  it('escreve um UV por vértice a partir da posição e da normal', () => {
    const g = atribuirUv(triangulo([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 0, 0, 1, 0, 0, 1, 0]), (v) => [v.x + 10, v.z + 20]);
    const uv = g.getAttribute('uv');
    expect([uv.getX(1), uv.getY(1)]).toEqual([11, 20]);
    expect([uv.getX(2), uv.getY(2)]).toEqual([10, 21]);
  });
});
