/**
 * Uma esfera no quadro da mão (m): é com elas que a conta confere se a mão tapa uma bola, sem tocar na malha. Quem as faz é a
 * `MaoCalibrada.esferas`, que cobre a mão do arquivo (`@sinuca/personagens`) com algumas esferas por osso.
 */
export interface Esfera {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}
