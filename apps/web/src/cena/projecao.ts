import * as THREE from 'three';

/** Onde um ponto do mundo cai na tela (px da janela) e quantos px tem de diâmetro uma esfera dele. */
export interface PontoNaTela {
  x: number;
  y: number;
  tamanho: number;
}

const ponto = new THREE.Vector3();

/**
 * Projeta o ponto (`x`, `y`, `z`) na tela de `largura` × `altura` px e diz o diâmetro, em px, de uma esfera de `raio`
 * centrada nele. Falso se o ponto está atrás da câmera. Escreve em `saida` (não aloca); usa a matriz da câmera
 * como o último quadro a deixou.
 */
export function projetarParaTela(camera: THREE.PerspectiveCamera, x: number, y: number, z: number, raio: number, largura: number, altura: number, saida: PontoNaTela): boolean {
  ponto.set(x, y, z);
  const distancia = ponto.distanceTo(camera.position);
  ponto.project(camera);
  if (ponto.z > 1 || !Number.isFinite(ponto.x)) return false;
  saida.x = ((ponto.x + 1) / 2) * largura;
  saida.y = ((1 - ponto.y) / 2) * altura;
  const alturaVisivel = 2 * distancia * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  saida.tamanho = ((2 * raio) / alturaVisivel) * altura;
  return true;
}
