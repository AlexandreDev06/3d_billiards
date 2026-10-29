import { Vector3, type PerspectiveCamera } from 'three';

const noPlano = new Vector3();
const direcao = new Vector3();

/**
 * Onde, no plano horizontal de altura `y` (o pano, na altura do centro da bola), cai o ponto da tela `(px, py)` (px do canvas,
 * origem em cima à esquerda): o raio do olho da câmera por ele até o plano. Vale com o `setViewOffset` da vista de cima (a
 * matriz de projeção já o leva). `false` se o raio não alcança o plano (olhando para cima ou paralelo a ele).
 */
export function pontoNaMesa(camera: PerspectiveCamera, px: number, py: number, largura: number, altura: number, y: number, saida: { x: number; z: number }): boolean {
  if (!(largura > 0) || !(altura > 0)) return false;
  camera.updateMatrixWorld();
  noPlano.set((px / largura) * 2 - 1, 1 - (py / altura) * 2, 0.5).unproject(camera);
  direcao.copy(noPlano).sub(camera.position);
  if (Math.abs(direcao.y) < 1e-9) return false;
  const t = (y - camera.position.y) / direcao.y;
  if (!(t > 0)) return false;
  saida.x = camera.position.x + direcao.x * t;
  saida.z = camera.position.z + direcao.z * t;
  return true;
}
