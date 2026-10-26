import { describe, expect, it } from 'vitest';
import { PANO_LEVE, panoLeveDe } from './pano-leve';

describe('panoLeveDe', () => {
  it('lê o que o material do pano guarda', () => {
    expect(panoLeveDe({ panoLeve: PANO_LEVE })).toBe(PANO_LEVE);
  });

  it('material sem a marca, ou com a marca torta, não é pano', () => {
    expect(panoLeveDe({})).toBeNull();
    expect(panoLeveDe({ panoLeve: 3 })).toBeNull();
    expect(panoLeveDe({ panoLeve: { fator: 'x', emissiva: [0, 0, 0] } })).toBeNull();
    expect(panoLeveDe({ panoLeve: { fator: 0.5, emissiva: [0, 0] } })).toBeNull();
  });

  it('o fator é o tom médio do mapa de cor do pano em luz linear (228/255 em sRGB)', () => {
    expect(PANO_LEVE.fator).toBeCloseTo(0.78, 2);
  });
});
