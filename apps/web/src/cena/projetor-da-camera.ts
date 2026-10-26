import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import type { PontoProjetado, Projetor } from '../maos/projetor';

/**
 * A câmera de verdade como `Projetor` das mãos. Usa as matrizes que a câmera tem agora: chame `atualizar()` depois de movê-la no
 * quadro (ela só calcula a inversa da matriz ao desenhar). Reaproveitável e sem alocar por chamada.
 */
export class ProjetorDaCamera implements Projetor {
  aspecto = 1;
  escala = 1;
  private readonly p = new Vector3();

  constructor(private readonly camera: PerspectiveCamera) {
    this.atualizar();
  }

  /** Relê a posição, o aspecto e o campo de visão da câmera. */
  atualizar(): void {
    this.camera.updateMatrixWorld();
    this.aspecto = this.camera.aspect;
    this.escala = 1 / Math.tan(MathUtils.degToRad(this.camera.fov / 2));
  }

  projetar(x: number, y: number, z: number, saida: PontoProjetado): boolean {
    const p = this.p.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
    // A câmera olha para -z: à frente dela, z é negativo.
    const profundidade = -p.z;
    if (profundidade <= this.camera.near) return false;
    saida.profundidade = profundidade;
    saida.x = (p.x * this.escala) / (profundidade * this.aspecto);
    saida.y = (p.y * this.escala) / profundidade;
    return true;
  }
}
