import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { pontoNaMesa } from './ponto-na-mesa';

const L = 1280;
const A = 720;

function deCima(): PerspectiveCamera {
  const c = new PerspectiveCamera(40, L / A, 0.01, 50);
  c.position.set(0, 2.2, 0);
  c.up.set(0, 0, -1);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}

/** A tela onde o ponto do mundo aparece (o inverso do que `pontoNaMesa` faz). */
function paraATela(c: PerspectiveCamera, p: Vector3): { px: number; py: number } {
  c.updateMatrixWorld();
  const n = p.clone().project(c);
  return { px: (n.x * 0.5 + 0.5) * L, py: (0.5 - n.y * 0.5) * A };
}

describe('pontoNaMesa', () => {
  it('o centro da tela, olhando de cima, é o centro da mesa', () => {
    const s = { x: 9, z: 9 };
    expect(pontoNaMesa(deCima(), L / 2, A / 2, L, A, 0.027, s)).toBe(true);
    expect(s.x).toBeCloseTo(0, 6);
    expect(s.z).toBeCloseTo(0, 6);
  });

  it('+X vai para a direita da tela e -Z para cima (a vista de cima do jogo)', () => {
    const c = deCima();
    const direita = { x: 0, z: 0 };
    pontoNaMesa(c, L / 2 + 200, A / 2, L, A, 0.027, direita);
    expect(direita.x).toBeGreaterThan(0.1);
    expect(direita.z).toBeCloseTo(0, 6);
    const cima = { x: 0, z: 0 };
    pontoNaMesa(c, L / 2, A / 2 - 150, L, A, 0.027, cima);
    expect(cima.z).toBeLessThan(-0.05);
    expect(cima.x).toBeCloseTo(0, 6);
  });

  it('é o inverso da projeção: um ponto do pano projetado volta ao mesmo ponto', () => {
    const c = deCima();
    for (const [x, z] of [[0.7, 0.3], [-0.9, -0.5], [0.1, 0.55], [1.0, -0.2]] as const) {
      const { px, py } = paraATela(c, new Vector3(x, 0.027, z));
      const s = { x: 0, z: 0 };
      expect(pontoNaMesa(c, px, py, L, A, 0.027, s)).toBe(true);
      expect(s.x).toBeCloseTo(x, 5);
      expect(s.z).toBeCloseTo(z, 5);
    }
  });

  it('vale com o deslocamento do desenho (setViewOffset) que a vista de cima usa', () => {
    const c = deCima();
    const aspecto = L / A;
    c.setViewOffset(aspecto, 1, -0.12 * aspecto, 0, aspecto, 1);
    for (const [x, z] of [[0.7, 0.3], [-0.5, -0.4]] as const) {
      const { px, py } = paraATela(c, new Vector3(x, 0.027, z));
      const s = { x: 0, z: 0 };
      expect(pontoNaMesa(c, px, py, L, A, 0.027, s)).toBe(true);
      expect(s.x).toBeCloseTo(x, 5);
      expect(s.z).toBeCloseTo(z, 5);
    }
  });

  it('de tacada (câmera baixa, olhando de lado) também acha o pano', () => {
    const c = new PerspectiveCamera(40, L / A, 0.01, 50);
    c.position.set(-1.6, 0.9, 0);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    const { px, py } = paraATela(c, new Vector3(0.3, 0.027, 0.2));
    const s = { x: 0, z: 0 };
    expect(pontoNaMesa(c, px, py, L, A, 0.027, s)).toBe(true);
    expect(s.x).toBeCloseTo(0.3, 5);
    expect(s.z).toBeCloseTo(0.2, 5);
  });

  it('o céu (acima do horizonte) não acha pano; tela de tamanho zero também não', () => {
    const c = new PerspectiveCamera(40, L / A, 0.01, 50);
    c.position.set(-1.6, 0.3, 0);
    c.lookAt(0, 0.3, 0);
    expect(pontoNaMesa(c, L / 2, 2, L, A, 0.027, { x: 0, z: 0 })).toBe(false);
    expect(pontoNaMesa(c, 10, 10, 0, A, 0.027, { x: 0, z: 0 })).toBe(false);
  });
});
