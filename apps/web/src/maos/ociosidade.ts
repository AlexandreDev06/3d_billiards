import type { ConfigMaos } from '../config';

/** Quanto a mira tem de mudar para contar como mexida: abaixo disso é o tremor do mouse parado. */
const MUDANCA_MINIMA = 1e-3;

/**
 * Há quanto tempo a mira está parada com as mãos em cena (L29). Passados `vida.ocio.aposS` s sem tacada e sem ninguém mexer a
 * mira (o ângulo, o recuo, o efeito), a mão de trás tamborila no taco, até a mira mexer ou as mãos saírem de cena. Só conta.
 */
export class Ociosidade {
  /** Há quanto tempo está parada (s). */
  segundos = 0;
  /** Já passou do tempo: a mão de trás tamborila. */
  tamborilando = false;
  private angulo = NaN;
  private recuo = 0;
  private lateral = 0;
  private vertical = 0;

  constructor(private readonly cfg: ConfigMaos['vida']['ocio']) {}

  /** Uma vez por quadro. `ativa`: as mãos estão em cena, na mira (com o taco à mão). */
  atualizar(dt: number, ativa: boolean, angulo: number, recuo: number, lateral: number, vertical: number): void {
    const mexeu =
      !Number.isNaN(this.angulo) &&
      (Math.abs(angulo - this.angulo) > MUDANCA_MINIMA ||
        Math.abs(recuo - this.recuo) > MUDANCA_MINIMA ||
        Math.abs(lateral - this.lateral) > MUDANCA_MINIMA ||
        Math.abs(vertical - this.vertical) > MUDANCA_MINIMA);
    if (!ativa || mexeu || Number.isNaN(this.angulo)) {
      this.angulo = angulo;
      this.recuo = recuo;
      this.lateral = lateral;
      this.vertical = vertical;
    }
    if (!ativa || mexeu) this.segundos = 0;
    else this.segundos += Math.max(dt, 0);
    this.tamborilando = ativa && this.segundos >= this.cfg.aposS;
  }
}
