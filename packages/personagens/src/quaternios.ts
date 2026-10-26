import type { Ponto } from './tipos';

/**
 * Contas de quaternion sobre `Float64Array`: cada quaternion são quatro posições seguidas (`x`, `y`, `z`, `w`) a partir de um
 * deslocamento. Escrevem na saída passada e nunca alocam.
 */

/** `saida[so..] = a[ao..] * b[bo..]` (aplica `b` primeiro). `saida` pode ser `a` ou `b`. */
export function multiplicarQuaternios(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, saida: Float64Array, so: number): void {
  const ax = a[ao]!;
  const ay = a[ao + 1]!;
  const az = a[ao + 2]!;
  const aw = a[ao + 3]!;
  const bx = b[bo]!;
  const by = b[bo + 1]!;
  const bz = b[bo + 2]!;
  const bw = b[bo + 3]!;
  saida[so] = aw * bx + ax * bw + ay * bz - az * by;
  saida[so + 1] = aw * by - ax * bz + ay * bw + az * bx;
  saida[so + 2] = aw * bz + ax * by - ay * bx + az * bw;
  saida[so + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** O vetor (`x`, `y`, `z`) girado pelo quaternion `q[o..]`. */
export function girarVetor(q: ArrayLike<number>, o: number, x: number, y: number, z: number, saida: Ponto): Ponto {
  const qx = q[o]!;
  const qy = q[o + 1]!;
  const qz = q[o + 2]!;
  const qw = q[o + 3]!;
  // t = 2 (q.xyz × v); v' = v + w t + q.xyz × t
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  saida.x = x + qw * tx + (qy * tz - qz * ty);
  saida.y = y + qw * ty + (qz * tx - qx * tz);
  saida.z = z + qw * tz + (qx * ty - qy * tx);
  return saida;
}

/** O quaternion de uma rotação de `angulo` (rad) em torno do eixo unitário (`x`, `y`, `z`). */
export function quaternioDoEixo(x: number, y: number, z: number, angulo: number, saida: Float64Array, so: number): void {
  const s = Math.sin(angulo / 2);
  saida[so] = x * s;
  saida[so + 1] = y * s;
  saida[so + 2] = z * s;
  saida[so + 3] = Math.cos(angulo / 2);
}

/** O quaternion da rotação cujas colunas são os eixos `(xx, xy, xz)`, `(yx, yy, yz)` e `(zx, zy, zz)`. */
export function quaternioDaBase(xx: number, xy: number, xz: number, yx: number, yy: number, yz: number, zx: number, zy: number, zz: number, saida: Float64Array, so: number): void {
  const tr = xx + yy + zz;
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = s / 4;
    x = (yz - zy) / s;
    y = (zx - xz) / s;
    z = (xy - yx) / s;
  } else if (xx > yy && xx > zz) {
    const s = Math.sqrt(1 + xx - yy - zz) * 2;
    w = (yz - zy) / s;
    x = s / 4;
    y = (yx + xy) / s;
    z = (zx + xz) / s;
  } else if (yy > zz) {
    const s = Math.sqrt(1 + yy - xx - zz) * 2;
    w = (zx - xz) / s;
    x = (yx + xy) / s;
    y = s / 4;
    z = (zy + yz) / s;
  } else {
    const s = Math.sqrt(1 + zz - xx - yy) * 2;
    w = (xy - yx) / s;
    x = (zx + xz) / s;
    y = (zy + yz) / s;
    z = s / 4;
  }
  saida[so] = x;
  saida[so + 1] = y;
  saida[so + 2] = z;
  saida[so + 3] = w;
}

/** As colunas da rotação do quaternion unitário `q[o..]`, nove números: o eixo `x` (`saida[0..2]`), o `y` (`3..5`) e o `z` (`6..8`). */
export function baseDoQuaternio(q: ArrayLike<number>, o: number, saida: Float64Array): void {
  const x = q[o]!;
  const y = q[o + 1]!;
  const z = q[o + 2]!;
  const w = q[o + 3]!;
  saida[0] = 1 - 2 * (y * y + z * z);
  saida[1] = 2 * (x * y + z * w);
  saida[2] = 2 * (x * z - y * w);
  saida[3] = 2 * (x * y - z * w);
  saida[4] = 1 - 2 * (x * x + z * z);
  saida[5] = 2 * (y * z + x * w);
  saida[6] = 2 * (x * z + y * w);
  saida[7] = 2 * (y * z - x * w);
  saida[8] = 1 - 2 * (x * x + y * y);
}
