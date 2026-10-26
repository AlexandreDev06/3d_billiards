import { quaternioDoEixo } from './quaternios';

/**
 * A volta que leva o olho do eixo de repouso até a direção do alvo, com o ângulo cortado em `limiteRad`: o quaternion (`x`, `y`, `z`,
 * `w`) vai para `saida[so..]`. Eixo e direção estão no referencial do pai do olho; a direção não precisa vir normalizada, e uma
 * direção nula deixa o olho parado. Nada aloca.
 */
export function girarOlho(ex: number, ey: number, ez: number, dx: number, dy: number, dz: number, limiteRad: number, saida: Float64Array, so: number): void {
  const ne = Math.hypot(ex, ey, ez);
  const nd = Math.hypot(dx, dy, dz);
  if (ne < 1e-12 || nd < 1e-12) {
    quaternioDoEixo(0, 0, 1, 0, saida, so);
    return;
  }
  const ax = ex / ne;
  const ay = ey / ne;
  const az = ez / ne;
  const bx = dx / nd;
  const by = dy / nd;
  const bz = dz / nd;
  const angulo = Math.acos(Math.min(Math.max(ax * bx + ay * by + az * bz, -1), 1));
  if (angulo < 1e-9) {
    quaternioDoEixo(0, 0, 1, 0, saida, so);
    return;
  }
  let cx = ay * bz - az * by;
  let cy = az * bx - ax * bz;
  let cz = ax * by - ay * bx;
  let nc = Math.hypot(cx, cy, cz);
  if (nc < 1e-9) {
    // direção oposta: qualquer eixo perpendicular serve; o escolhido é o do eixo cardinal menos alinhado com o do repouso
    const menor = Math.abs(ax) <= Math.abs(ay) && Math.abs(ax) <= Math.abs(az) ? 0 : Math.abs(ay) <= Math.abs(az) ? 1 : 2;
    const ux = menor === 0 ? 1 : 0;
    const uy = menor === 1 ? 1 : 0;
    const uz = menor === 2 ? 1 : 0;
    cx = ay * uz - az * uy;
    cy = az * ux - ax * uz;
    cz = ax * uy - ay * ux;
    nc = Math.hypot(cx, cy, cz);
  }
  quaternioDoEixo(cx / nc, cy / nc, cz / nc, Math.min(angulo, Math.max(limiteRad, 0)), saida, so);
}
