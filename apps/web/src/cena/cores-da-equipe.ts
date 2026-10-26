/**
 * A cor de cada equipe (azul, laranja, verde e violeta): as mesmas de `--equipe-0` a `--equipe-3` do HUD, que colorem o nome no
 * placar e no chat. Os balões e as mãos usam as mesmas.
 */
export const COR_DA_EQUIPE: readonly number[] = [0x3aa0ff, 0xffb347, 0x5fd39a, 0xc58bff];

/** A cor da equipe `i` (de 0 a 3); fora disso, a de uma equipe que volta a girar pela lista. */
export function corDaEquipe(i: number): number {
  const n = COR_DA_EQUIPE.length;
  const k = Number.isFinite(i) ? Math.trunc(i) : 0;
  return COR_DA_EQUIPE[((k % n) + n) % n]!;
}
