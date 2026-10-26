import type { EstadoMesa } from '@sinuca/fisica';
import type { AlvoBola } from '../player/player';

/**
 * Põe cada bola da cena onde o estado da mesa manda (posição, orientação,
 * presença, tamanho de depois de uma queda). Bola que o estado não tem fica escondida. `alvos` é indexado por `IdBola`.
 */
export function sincronizarBolas(alvos: readonly (AlvoBola | undefined)[], mesa: EstadoMesa): void {
  const vistas = new Set<number>();
  for (const bola of mesa.bolas) {
    const alvo = alvos[bola.id];
    if (!alvo) continue;
    vistas.add(bola.id);
    alvo.position.set(bola.posicao.x, bola.posicao.y, bola.posicao.z);
    alvo.quaternion.set(bola.orientacao.x, bola.orientacao.y, bola.orientacao.z, bola.orientacao.w);
    alvo.scale?.setScalar(1);
    alvo.visible = bola.naMesa;
  }
  alvos.forEach((alvo, id) => {
    if (alvo && !vistas.has(id)) alvo.visible = false;
  });
}
