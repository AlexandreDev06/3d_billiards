/**
 * Como o pano se desenha sem textura nos níveis de materiais leves (Lambert): a cor do material vezes `fator` (o
 * tom médio do mapa de cor, 228/255 em sRGB, em luz linear) e uma luz própria fraca que faz as vezes do que o
 * brilho do feltro (sheen) e o reflexo de sala davam e tira o verde puro. Fica em `userData.panoLeve` do material.
 */
export interface PanoLeve {
  readonly fator: number;
  /** RGB linear de `emissive`. */
  readonly emissiva: readonly [number, number, number];
}

export const PANO_LEVE: PanoLeve = { fator: (228 / 255) ** 2.2, emissiva: [0.03, 0.04, 0.016] };

export function panoLeveDe(userData: Record<string, unknown>): PanoLeve | null {
  const p = userData.panoLeve as Partial<PanoLeve> | undefined;
  return p && typeof p.fator === 'number' && Array.isArray(p.emissiva) && p.emissiva.length === 3 ? (p as PanoLeve) : null;
}
