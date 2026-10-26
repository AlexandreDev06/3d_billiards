import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { projetarParaTela, type PontoNaTela } from './projecao';

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 50);
  c.position.set(0, 0, 1);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
const saida = (): PontoNaTela => ({ x: 0, y: 0, tamanho: 0 });

describe('projetarParaTela: onde um ponto da mesa cai na tela', () => {
  it('o ponto para onde a câmera olha cai no meio da tela', () => {
    const p = saida();
    expect(projetarParaTela(camera(), 0, 0, 0, 0.027, 1280, 720, p)).toBe(true);
    expect(p.x).toBeCloseTo(640, 3);
    expect(p.y).toBeCloseTo(360, 3);
  });

  it('à direita fica à direita; para cima fica para cima (y da tela cresce para baixo)', () => {
    const p = saida();
    projetarParaTela(camera(), 0.2, 0.1, 0, 0.027, 1280, 720, p);
    expect(p.x).toBeGreaterThan(640);
    expect(p.y).toBeLessThan(360);
  });

  it('o diâmetro em pixels da bola segue a distância: a 1 m de uma câmera de 50° e 720 px de altura são ~42 px, e a 2 m, metade', () => {
    const perto = saida();
    const longe = saida();
    projetarParaTela(camera(), 0, 0, 0, 0.027, 1280, 720, perto);
    projetarParaTela(camera(), 0, 0, -1, 0.027, 1280, 720, longe);
    expect(perto.tamanho).toBeCloseTo(41.7, 0);
    expect(longe.tamanho).toBeCloseTo(perto.tamanho / 2, 1);
  });

  it('o ponto atrás da câmera não tem lugar na tela', () => {
    expect(projetarParaTela(camera(), 0, 0, 5, 0.027, 1280, 720, saida())).toBe(false);
  });

  it('o tamanho da tela entra na conta (a mesma cena em outra janela)', () => {
    const p = saida();
    projetarParaTela(camera(), 0, 0, 0, 0.027, 1920, 1080, p);
    expect(p.x).toBeCloseTo(960, 3);
    expect(p.y).toBeCloseTo(540, 3);
    expect(p.tamanho).toBeCloseTo(62.5, 0);
  });
});
