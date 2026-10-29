import { AnimationClip, AnimationMixer, Bone, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { OssoAditivo } from './aditivo-de-osso';

/** Um osso cuja animação é uma pose parada (os dois quadros iguais): o mixer não reescreve nada depois do primeiro quadro. */
function ossoComPoseParada(): { osso: Bone; mixer: AnimationMixer } {
  const raiz = new Object3D();
  const osso = new Bone();
  osso.name = 'osso';
  raiz.add(osso);
  const parado = new AnimationClip('parado', 1, [
    new QuaternionKeyframeTrack('osso.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new VectorKeyframeTrack('osso.position', [0, 1], [0, 1, 0, 0, 1, 0]),
    new VectorKeyframeTrack('osso.scale', [0, 1], [1, 1, 1, 1, 1, 1]),
  ]);
  const mixer = new AnimationMixer(raiz);
  mixer.clipAction(parado).play();
  mixer.update(0);
  return { osso, mixer };
}

const GIRO = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.05);

describe('OssoAditivo', () => {
  it('sem restaurar, o que se soma por cima de uma pose parada se soma de novo a cada quadro (o motivo de existir)', () => {
    const { osso, mixer } = ossoComPoseParada();
    for (let i = 0; i < 40; i++) {
      mixer.update(1 / 60);
      osso.quaternion.premultiply(GIRO);
    }
    expect(osso.quaternion.angleTo(new Quaternion())).toBeGreaterThan(1.5);
  });

  it('restaurando antes do mixer, o osso fica no que a animação deixou mais um giro só', () => {
    const { osso, mixer } = ossoComPoseParada();
    const aditivo = new OssoAditivo(osso);
    for (let i = 0; i < 40; i++) {
      aditivo.restaurar();
      mixer.update(1 / 60);
      aditivo.salvar();
      osso.quaternion.premultiply(GIRO);
      osso.position.y += 0.1;
      osso.scale.multiplyScalar(1.1);
    }
    expect(osso.quaternion.angleTo(new Quaternion())).toBeCloseTo(0.05, 6);
    expect(osso.position.y).toBeCloseTo(1.1, 6);
    expect(osso.scale.x).toBeCloseTo(1.1, 6);
  });

  it('restaurar sem ter salvado não faz nada, e restaurar duas vezes é o mesmo que uma', () => {
    const { osso } = ossoComPoseParada();
    const aditivo = new OssoAditivo(osso);
    osso.quaternion.premultiply(GIRO);
    aditivo.restaurar();
    expect(osso.quaternion.angleTo(new Quaternion())).toBeCloseTo(0.05, 6);
    aditivo.salvar();
    osso.quaternion.premultiply(GIRO);
    aditivo.restaurar();
    aditivo.restaurar();
    expect(osso.quaternion.angleTo(new Quaternion())).toBeCloseTo(0.05, 6);
  });
});
