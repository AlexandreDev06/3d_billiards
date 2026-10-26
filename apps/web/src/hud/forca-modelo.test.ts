import { describe, expect, it } from 'vitest';
import { modeloDaForca } from './forca-modelo';

describe('modeloDaForca', () => {
  it('barra vazia pede para puxar; abaixo do mínimo soltar cancela; acima, taca', () => {
    expect(modeloDaForca(0, 0.03)).toEqual({ percentual: 0, cancela: true, dica: 'Puxe o mouse para trás' });
    expect(modeloDaForca(0.02, 0.03)).toEqual({ percentual: 2, cancela: true, dica: 'Solte para cancelar' });
    expect(modeloDaForca(0.03, 0.03)).toEqual({ percentual: 3, cancela: false, dica: 'Solte para tacar' });
    expect(modeloDaForca(0.5, 0.03).percentual).toBe(50);
    expect(modeloDaForca(1, 0.03)).toEqual({ percentual: 100, cancela: false, dica: 'Solte para tacar' });
  });

  it('fora da barra ou sem número vale o limite', () => {
    expect(modeloDaForca(7, 0.03).percentual).toBe(100);
    expect(modeloDaForca(-1, 0.03).percentual).toBe(0);
    expect(modeloDaForca(NaN, 0.03).percentual).toBe(0);
  });
});
