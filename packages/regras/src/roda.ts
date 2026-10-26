/** A roda que alterna as equipes `x` e `y`: X1, Y1, X2, Y2, sem quem não existe (no 2×1, X1, Y1, X2). */
export function intercalar<T>(x: readonly T[], y: readonly T[]): T[] {
  const roda: T[] = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (i < x.length) roda.push(x[i]!);
    if (i < y.length) roda.push(y[i]!);
  }
  return roda;
}
