import { Quaternion, Vector3, type Object3D } from 'three';

/**
 * Um osso que o motor mexe **por cima** da animação. O `AnimationMixer` só reescreve uma propriedade do osso quando o valor da
 * animação muda de um quadro para o outro; numa pose parada ele não reescreve nada, e o que se somou no quadro anterior ficaria
 * lá e se somaria de novo (o corpo girando um pouco mais a cada quadro). Por isso: `salvar` guarda o que a animação deixou, o motor
 * soma o que quiser, e `restaurar`, antes do próximo `mixer.update`, devolve o osso ao que a animação tinha deixado. Se o mixer
 * reescreve, escreve por cima; se não, o osso já está no valor certo. Nada aloca.
 */
export class OssoAditivo {
  private readonly posicao = new Vector3();
  private readonly giro = new Quaternion();
  private readonly escala = new Vector3(1, 1, 1);
  private salvo = false;

  constructor(readonly osso: Object3D) {}

  /** Guarda a posição, o giro e a escala de agora (o que a animação deixou). */
  salvar(): void {
    this.posicao.copy(this.osso.position);
    this.giro.copy(this.osso.quaternion);
    this.escala.copy(this.osso.scale);
    this.salvo = true;
  }

  /** Devolve o osso ao que `salvar` guardou, se algo foi guardado desde a última vez. */
  restaurar(): void {
    if (!this.salvo) return;
    this.osso.position.copy(this.posicao);
    this.osso.quaternion.copy(this.giro);
    this.osso.scale.copy(this.escala);
    this.salvo = false;
  }
}
