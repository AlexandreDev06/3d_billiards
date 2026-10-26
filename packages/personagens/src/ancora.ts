import type { Quadro } from './alinhar';

/**
 * A posição e a orientação de um ponto de ancoragem (um nó do esqueleto onde se prende outra coisa: a mão do balão) a partir da
 * matriz de mundo dele (16 números, em colunas, como a do three), **sem a escala**: o corpo estufa e murcha, e o que se prende nele
 * não pode estufar junto. Os três eixos saem perpendiculares e de comprimento 1 (Gram-Schmidt a partir do `x` e do `y`).
 */
export function ancoraDaMatriz(m: ArrayLike<number>, saida: Quadro): void {
  saida.px = m[12]!;
  saida.py = m[13]!;
  saida.pz = m[14]!;
  let xx = m[0]!;
  let xy = m[1]!;
  let xz = m[2]!;
  const nx = Math.hypot(xx, xy, xz);
  if (nx < 1e-12) {
    xx = 1;
    xy = 0;
    xz = 0;
  } else {
    xx /= nx;
    xy /= nx;
    xz /= nx;
  }
  let yx = m[4]!;
  let yy = m[5]!;
  let yz = m[6]!;
  const d = yx * xx + yy * xy + yz * xz;
  yx -= d * xx;
  yy -= d * xy;
  yz -= d * xz;
  let ny = Math.hypot(yx, yy, yz);
  if (ny < 1e-12) {
    // sem eixo y aproveitável: qualquer um perpendicular ao x
    if (Math.abs(xx) < 0.9) {
      yx = 1;
      yy = 0;
      yz = 0;
    } else {
      yx = 0;
      yy = 1;
      yz = 0;
    }
    const e = yx * xx + yy * xy + yz * xz;
    yx -= e * xx;
    yy -= e * xy;
    yz -= e * xz;
    ny = Math.hypot(yx, yy, yz);
  }
  yx /= ny;
  yy /= ny;
  yz /= ny;
  saida.xx = xx;
  saida.xy = xy;
  saida.xz = xz;
  saida.yx = yx;
  saida.yy = yy;
  saida.yz = yz;
  saida.zx = xy * yz - xz * yy;
  saida.zy = xz * yx - xx * yz;
  saida.zz = xx * yy - xy * yx;
}
