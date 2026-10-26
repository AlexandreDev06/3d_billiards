import { describe, expect, it } from 'vitest';
import { LimitadorDeVozes, type Voz } from './vozes';

function voz(duracaoS: number, volume: number): Voz & { paradas: number } {
  const v = {
    duracaoS,
    volume,
    paradas: 0,
    parar() {
      v.paradas++;
    },
  };
  return v;
}

describe('LimitadorDeVozes', () => {
  it('aceita até o máximo de vozes ao mesmo tempo', () => {
    const limite = new LimitadorDeVozes(2);
    expect(limite.admitir(0, voz(1, 0.5))).toBe(true);
    expect(limite.admitir(0, voz(1, 0.5))).toBe(true);
    expect(limite.ativas(0)).toBe(2);
  });

  it('recusa a voz nova quando está cheio e ela não é mais forte que nenhuma ativa', () => {
    const limite = new LimitadorDeVozes(2);
    limite.admitir(0, voz(1, 0.5));
    limite.admitir(0, voz(1, 0.7));
    const fraca = voz(1, 0.5);
    expect(limite.admitir(0, fraca)).toBe(false);
    expect(limite.ativas(0)).toBe(2);
  });

  it('cheio, a voz mais forte toma o lugar da mais fraca, que é parada', () => {
    const limite = new LimitadorDeVozes(2);
    const fraca = voz(1, 0.2);
    const media = voz(1, 0.5);
    limite.admitir(0, fraca);
    limite.admitir(0, media);
    const forte = voz(1, 0.9);
    expect(limite.admitir(0, forte)).toBe(true);
    expect(fraca.paradas).toBe(1);
    expect(media.paradas).toBe(0);
    expect(limite.ativas(0)).toBe(2);
  });

  it('vozes que já acabaram liberam vaga', () => {
    const limite = new LimitadorDeVozes(1);
    limite.admitir(0, voz(0.5, 0.5));
    expect(limite.ativas(0.49)).toBe(1);
    expect(limite.ativas(0.5)).toBe(0);
    expect(limite.admitir(0.5, voz(0.5, 0.1))).toBe(true);
  });

  it('a voz que acabou sozinha não é parada quando alguém a "rouba"', () => {
    const limite = new LimitadorDeVozes(1);
    const velha = voz(0.1, 0.9);
    limite.admitir(0, velha);
    limite.admitir(1, voz(1, 0.1));
    expect(velha.paradas).toBe(0);
  });

  it('empate de volume recusa a nova: a antiga já está tocando', () => {
    const limite = new LimitadorDeVozes(1);
    limite.admitir(0, voz(1, 0.5));
    expect(limite.admitir(0, voz(1, 0.5))).toBe(false);
  });

  it('entre duas vozes igualmente fracas, rouba a que acaba primeiro', () => {
    const limite = new LimitadorDeVozes(2);
    const longa = voz(2, 0.2);
    const curta = voz(0.5, 0.2);
    limite.admitir(0, longa);
    limite.admitir(0, curta);
    limite.admitir(0.1, voz(1, 0.8));
    expect(curta.paradas).toBe(1);
    expect(longa.paradas).toBe(0);
  });

  it('conta aceitas, recusadas, roubadas e o pico de vozes simultâneas', () => {
    const limite = new LimitadorDeVozes(2);
    limite.admitir(0, voz(1, 0.5));
    limite.admitir(0, voz(1, 0.6));
    limite.admitir(0, voz(1, 0.1));
    limite.admitir(0, voz(1, 0.9));
    limite.admitir(2, voz(1, 0.5));
    expect(limite.estatisticas()).toEqual({ aceitas: 4, recusadas: 1, roubadas: 1, pico: 2 });
  });

  it('o pico não passa do máximo mesmo numa rajada de impactos', () => {
    const limite = new LimitadorDeVozes(4);
    for (let i = 0; i < 100; i++) limite.admitir(i * 0.001, voz(0.3, (i % 10) / 10));
    expect(limite.estatisticas().pico).toBe(4);
    expect(limite.ativas(0.1)).toBeLessThanOrEqual(4);
  });

  it('zerar limpa vozes e contadores', () => {
    const limite = new LimitadorDeVozes(2);
    const v = voz(5, 0.5);
    limite.admitir(0, v);
    limite.zerar();
    expect(limite.ativas(0)).toBe(0);
    expect(limite.estatisticas()).toEqual({ aceitas: 0, recusadas: 0, roubadas: 0, pico: 0 });
    expect(v.paradas).toBe(0);
  });

  it('máximo inválido é erro', () => {
    expect(() => new LimitadorDeVozes(0)).toThrow(RangeError);
    expect(() => new LimitadorDeVozes(1.5)).toThrow(RangeError);
  });
});
