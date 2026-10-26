import * as THREE from 'three';
import type { IdBola } from '@sinuca/fisica';

export interface OpcoesDosAneis {
  readonly raioBola: number;
  readonly cor: number;
  /** Quantos anéis existem (um por bola numerada possível). */
  readonly max?: number;
  /** Altura do anel acima do pano (m), para não brigar com ele na profundidade. */
  readonly alturaDoPano?: number;
  /** Opacidade com intensidade 1. */
  readonly opacidadeMax?: number;
  /** Raio de dentro e de fora do anel, em raios de bola. */
  readonly dentro?: number;
  readonly fora?: number;
}

type Posicao = { readonly position: { readonly x: number; readonly z: number }; readonly visible: boolean };

/**
 * Um anel chato no pano em volta de cada bola destacada: serve ao destaque do começo da vez (dourado) e à falta
 * (vermelho). Os anéis nascem escondidos e são reaproveitados (sem alocar por quadro); a opacidade é uma só para
 * todos, porque o destaque acende junto.
 */
export class AneisDeBolas {
  readonly grupo = new THREE.Group();
  private readonly anel: THREE.Mesh[] = [];
  private readonly geometria: THREE.RingGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly alturaDoPano: number;
  private readonly opacidadeMax: number;

  constructor(opcoes: OpcoesDosAneis) {
    const { raioBola, cor, max = 15, alturaDoPano = 0.0012, opacidadeMax = 0.85, dentro = 1.15, fora = 1.55 } = opcoes;
    this.alturaDoPano = alturaDoPano;
    this.opacidadeMax = opacidadeMax;
    this.geometria = new THREE.RingGeometry(raioBola * dentro, raioBola * fora, 56);
    this.geometria.rotateX(-Math.PI / 2);
    // Sem tonemapping e com um deslocamento de profundidade, para a cor ficar a escolhida e o anel não piscar no pano.
    this.material = new THREE.MeshBasicMaterial({
      color: cor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (let i = 0; i < max; i++) {
      const malha = new THREE.Mesh(this.geometria, this.material);
      malha.visible = false;
      malha.renderOrder = 2;
      malha.castShadow = false;
      malha.receiveShadow = false;
      this.anel.push(malha);
      this.grupo.add(malha);
    }
  }

  /**
   * Acende um anel em volta de cada bola de `ids` (as que a cena tem e mostra); esconde os que sobram. `intensidade`
   * de 0 a 1 vira a opacidade; `escala` aumenta ou encolhe o anel (o pulsar da falta).
   */
  mostrar(ids: readonly IdBola[], bolas: readonly (Posicao | undefined)[], intensidade: number, escala = 1): void {
    this.material.opacity = this.opacidadeMax * intensidade;
    let usados = 0;
    for (const id of ids) {
      const bola = bolas[id];
      if (!bola || !bola.visible || usados >= this.anel.length) continue;
      const malha = this.anel[usados++]!;
      malha.position.set(bola.position.x, this.alturaDoPano, bola.position.z);
      malha.scale.setScalar(escala);
      malha.visible = true;
    }
    for (let i = usados; i < this.anel.length; i++) this.anel[i]!.visible = false;
  }

  esconder(): void {
    for (const malha of this.anel) malha.visible = false;
  }

  dispose(): void {
    this.geometria.dispose();
    this.material.dispose();
  }
}
