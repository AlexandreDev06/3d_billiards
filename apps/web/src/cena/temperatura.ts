const limitar = (v: number): number => Math.round(Math.min(255, Math.max(0, v)));

/**
 * Cor sRGB (0xRRGGBB) de um corpo negro a `kelvin`, pela aproximação de Tanner Helland.
 * 2700–3000 K é a lâmpada incandescente de bar; 6500 K é a luz do dia.
 */
export function corDaTemperatura(kelvin: number): number {
  if (!(kelvin >= 1000 && kelvin <= 40000)) throw new RangeError(`temperatura de cor fora de 1000–40000 K: ${kelvin}`);
  const t = kelvin / 100;
  const vermelho = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const verde = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const azul = t >= 66 ? 255 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return (limitar(vermelho) << 16) | (limitar(verde) << 8) | limitar(azul);
}
