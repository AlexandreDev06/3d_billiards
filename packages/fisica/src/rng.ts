import type { Rng } from './tipos';

/** RNG semeado (mulberry32): mesma semente, mesma sequência. */
export function criarRng(semente: number): Rng {
  let estado = semente >>> 0;
  return {
    proximo() {
      estado = (estado + 0x6d2b79f5) >>> 0;
      let t = estado;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
