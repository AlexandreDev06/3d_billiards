import { describe, expect, it } from 'vitest';
import { deltaEmMoedas, sinalDoSaldo, textoDeMoedas } from './moedas';

describe('textoDeMoedas', () => {
  it('conta no singular e no plural', () => {
    expect(textoDeMoedas(0)).toBe('0 moedas');
    expect(textoDeMoedas(1)).toBe('1 moeda');
    expect(textoDeMoedas(100)).toBe('100 moedas');
  });

  it('o saldo negativo usa o sinal de menos de verdade', () => {
    expect(textoDeMoedas(-30)).toBe('−30 moedas');
    expect(textoDeMoedas(-1)).toBe('−1 moeda');
  });
});

describe('deltaEmMoedas', () => {
  it('põe o sinal de quem ganhou e de quem perdeu', () => {
    expect(deltaEmMoedas(20)).toBe('+20');
    expect(deltaEmMoedas(-10)).toBe('−10');
    expect(deltaEmMoedas(0)).toBe('0');
  });
});

describe('sinalDoSaldo', () => {
  it('só o saldo abaixo de zero é negativo', () => {
    expect(sinalDoSaldo(-1)).toBe('negativo');
    expect(sinalDoSaldo(0)).toBe('zero');
    expect(sinalDoSaldo(50)).toBe('positivo');
  });
});
