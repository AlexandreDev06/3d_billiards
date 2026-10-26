import type { ObstaculosDaMesa } from '../controles/elevacao-do-taco';

/** O que há embaixo de um ponto da mesa onde uma mão poderia pousar. */
export type TipoDeApoio = 'pano' | 'borracha' | 'moldura' | 'ar';

/**
 * A altura (m, contada do pano) do que sustenta uma mão no ponto (`x`, `z`): o pano dentro da área de jogo, a borracha da tabela
 * logo além do nariz e a moldura depois dela; fora da moldura, ou dentro do vão de uma caçapa (o buraco não sustenta nada), não há
 * nada: `ar`, com altura `-Infinity`. As mesmas faixas que a elevação do taco usa para passar por cima da tabela.
 */
export function apoioEm(obst: ObstaculosDaMesa, x: number, z: number): { altura: number; tipo: TipoDeApoio } {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (noVaoDeCacapa(obst, x, z)) return AR;
  if (ax <= obst.semiX && az <= obst.semiZ) return PANO;
  const fora = Math.max(ax - obst.semiX, az - obst.semiZ);
  if (fora <= obst.larguraBorracha) return { altura: obst.alturaBorracha, tipo: 'borracha' };
  if (fora <= obst.larguraBorracha + obst.larguraMoldura) return { altura: obst.alturaMoldura, tipo: 'moldura' };
  return AR;
}

/** A altura de `apoioEm`, sem alocar: `-Infinity` onde não há nada. */
export function alturaDoApoioEm(obst: ObstaculosDaMesa, x: number, z: number): number {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (noVaoDeCacapa(obst, x, z)) return -Infinity;
  if (ax <= obst.semiX && az <= obst.semiZ) return 0;
  const fora = Math.max(ax - obst.semiX, az - obst.semiZ);
  if (fora <= obst.larguraBorracha) return obst.alturaBorracha;
  if (fora <= obst.larguraBorracha + obst.larguraMoldura) return obst.alturaMoldura;
  return -Infinity;
}

const AR = { altura: -Infinity, tipo: 'ar' as TipoDeApoio };
const PANO = { altura: 0, tipo: 'pano' as TipoDeApoio };

/** Dentro da garganta ou do círculo de queda de alguma caçapa: sem pano, sem borracha e sem madeira. */
function noVaoDeCacapa(obst: ObstaculosDaMesa, x: number, z: number): boolean {
  for (const v of obst.vaos) {
    const dx = x - v.bx;
    const dz = z - v.bz;
    const s = dx * v.ex + dz * v.ez;
    const t = -dx * v.ez + dz * v.ex;
    if (s >= 0 && s <= v.profundidade && Math.abs(t) < v.raio) return true;
    if (Math.hypot(x - v.cx, z - v.cz) < v.raio) return true;
  }
  return false;
}
