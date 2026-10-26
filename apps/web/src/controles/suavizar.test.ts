import { describe, expect, it } from 'vitest';
import { diferencaAngular, fatorDeSuavizacao } from './suavizar';

describe('fatorDeSuavizacao', () => {
  it('é 0 sem tempo e tende a 1 com muito tempo', () => {
    expect(fatorDeSuavizacao(9, 0)).toBe(0);
    expect(fatorDeSuavizacao(9, 10)).toBeCloseTo(1, 9);
  });

  it('dar dois passos de dt dá o mesmo que um de 2·dt (independe do quadro)', () => {
    const um = fatorDeSuavizacao(9, 0.04);
    const dois = 1 - (1 - fatorDeSuavizacao(9, 0.02)) ** 2;
    expect(um).toBeCloseTo(dois, 12);
  });
});

describe('diferencaAngular', () => {
  it('pega o caminho curto através de ±π', () => {
    expect(diferencaAngular(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 9);
    expect(diferencaAngular(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2, 9);
  });

  it('é a diferença simples quando já é curta', () => {
    expect(diferencaAngular(0.5, 1.5)).toBeCloseTo(1, 9);
  });
});
