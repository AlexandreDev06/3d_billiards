import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { poseDaCameraDoFim, type EntradaDaCameraDoFim } from './camera-do-fim';
import { lugaresDoFim } from '../baloes/fim-da-partida';

const BASE: EntradaDaCameraDoFim = {
  semiX: 1.45,
  semiZ: 0.78,
  folga: 0.3,
  meiaLarguraDoBalao: 0.3,
  alturaDoBalao: 0.5,
  meiaAlturaDoBalao: 0.35,
  campoDeVisaoGraus: 50,
  aspecto: 16 / 9,
  elevacao: (30 * Math.PI) / 180,
  margem: 0.1,
};

function camera(e: EntradaDaCameraDoFim): PerspectiveCamera {
  const p = poseDaCameraDoFim(e);
  const c = new PerspectiveCamera(e.campoDeVisaoGraus, e.aspecto, 0.05, 50);
  c.position.set(p.x, p.y, p.z);
  c.lookAt(p.olharX, p.olharY, p.olharZ);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

function naTela(c: PerspectiveCamera, x: number, y: number, z: number): { x: number; y: number } {
  const v = new Vector3(x, y, z).applyMatrix4(new Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
  return { x: v.x, y: v.y };
}

describe('poseDaCameraDoFim', () => {
  it('fica do lado +Z, acima do pano, olhando para o fundo', () => {
    const p = poseDaCameraDoFim(BASE);
    expect(p.z).toBeGreaterThan(BASE.semiZ);
    expect(p.y).toBeGreaterThan(BASE.alturaDoBalao);
    expect(p.olharZ).toBeLessThanOrEqual(0);
    expect(p.x).toBe(0);
  });

  it.each([2, 3, 4])('com %i balões, todos cabem inteiros na tela, a 16:9 e a 4:3', (n) => {
    for (const aspecto of [16 / 9, 4 / 3, 21 / 9]) {
      const e = { ...BASE, aspecto };
      const c = camera(e);
      for (const l of lugaresDoFim(n, e.semiX, e.semiZ, e.folga)) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const q = naTela(c, l.x + dx * e.meiaLarguraDoBalao, e.alturaDoBalao + dy * e.meiaAlturaDoBalao, l.z);
          expect(Math.abs(q.x)).toBeLessThan(1);
          expect(Math.abs(q.y)).toBeLessThan(1);
        }
      }
    }
  });

  it('a mesa inteira aparece, de ponta a ponta', () => {
    const c = camera(BASE);
    for (const [x, z] of [[-BASE.semiX, BASE.semiZ], [BASE.semiX, BASE.semiZ], [-BASE.semiX, -BASE.semiZ], [BASE.semiX, -BASE.semiZ]] as const) {
      const q = naTela(c, x, 0, z);
      expect(Math.abs(q.x)).toBeLessThan(1);
      expect(Math.abs(q.y)).toBeLessThan(1);
    }
  });

  it('numa tela mais estreita a câmera se afasta', () => {
    const larga = poseDaCameraDoFim({ ...BASE, aspecto: 21 / 9 });
    const estreita = poseDaCameraDoFim({ ...BASE, aspecto: 4 / 3 });
    expect(estreita.z).toBeGreaterThan(larga.z);
  });

  it('reaproveita o objeto de saída', () => {
    const saida = { x: 0, y: 0, z: 0, olharX: 0, olharY: 0, olharZ: 0 };
    expect(poseDaCameraDoFim(BASE, saida)).toBe(saida);
  });
});
