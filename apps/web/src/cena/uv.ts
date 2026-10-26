import { Float32BufferAttribute, type BufferGeometry } from 'three';

export interface Vertice {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/** Dá a cada vértice o UV que `uvDe` escolhe, a partir da posição e da normal (a geometria já tem normais). */
export function atribuirUv(geometria: BufferGeometry, uvDe: (v: Vertice) => readonly [number, number]): BufferGeometry {
  const posicao = geometria.getAttribute('position');
  const normal = geometria.getAttribute('normal');
  const uv: number[] = [];
  for (let i = 0; i < posicao.count; i++) {
    uv.push(
      ...uvDe({
        x: posicao.getX(i),
        y: posicao.getY(i),
        z: posicao.getZ(i),
        nx: normal.getX(i),
        ny: normal.getY(i),
        nz: normal.getZ(i),
      }),
    );
  }
  geometria.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geometria;
}

/**
 * Pano (e qualquer superfície em ladrilho): de cima, o plano XZ; nas paredes, a distância ao longo da
 * parede e a altura. Sem isto as faces inclinadas da tabela esticam a textura em listras.
 */
export function uvLadrilho(lado: number): (v: Vertice) => [number, number] {
  return (v) => {
    if (Math.abs(v.ny) > 0.6) return [v.x / lado, v.z / lado];
    const aoLongo = Math.abs(v.nx) > Math.abs(v.nz) ? v.z : v.x;
    return [aoLongo / lado, v.y / lado];
  };
}
