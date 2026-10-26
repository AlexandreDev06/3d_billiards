import { BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ponto2 } from '@sinuca/fisica';

/** Arestas mais abertas que isto ficam vivas; as outras (arco, chanfro) são suavizadas. */
const ANGULO_VIVO = (40 * Math.PI) / 180;

/**
 * Forma 2D com furos. A extrusão do three corre ao longo de +Z e `rotateX(-π/2)` leva (x, y, z) a
 * (x, z, -y): por isso o `y` da forma é o `-z` do mundo.
 */
export function formaDe(contorno: readonly Ponto2[], buracos: readonly (readonly Ponto2[])[] = []): Shape {
  const ponto = (p: Ponto2): Vector2 => new Vector2(p.x, -p.z);
  const forma = new Shape(contorno.map(ponto));
  for (const buraco of buracos) forma.holes.push(new Path(buraco.map(ponto)));
  return forma;
}

export interface OpcoesDeExtrusao {
  /** Altura (Y) da base. */
  readonly yBase: number;
  /** Altura total, do `yBase` ao topo. */
  readonly altura: number;
  /** Raio do arredondado das arestas de cima e de baixo; a parede fica no contorno e o topo encolhe. */
  readonly chanfro?: number;
}

/** Extrude a forma para cima com normais suaves nos arredondados e vivas nas quinas; sem UV (cada peça faz o seu). */
export function extrudar(forma: Shape, { yBase, altura, chanfro = 0 }: OpcoesDeExtrusao): BufferGeometry {
  const geometria = new ExtrudeGeometry(
    forma,
    chanfro > 0
      ? { depth: altura - 2 * chanfro, bevelEnabled: true, bevelThickness: chanfro, bevelSize: chanfro, bevelOffset: -chanfro, bevelSegments: 3, curveSegments: 1 }
      : { depth: altura, bevelEnabled: false, curveSegments: 1 },
  );
  geometria.rotateX(-Math.PI / 2);
  geometria.translate(0, yBase + chanfro, 0);
  geometria.deleteAttribute('uv');
  return toCreasedNormals(geometria, ANGULO_VIVO);
}
