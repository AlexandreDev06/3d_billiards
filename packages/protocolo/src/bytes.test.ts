import { describe, expect, it } from 'vitest';
import { Escritor, Leitor, LeituraInvalida } from './bytes';
import { decodificarUtf8, codificarUtf8 } from './utf8';

describe('Escritor/Leitor', () => {
  it('ida e volta de inteiros sem sinal (varint) nas bordas de cada byte', () => {
    const valores = [0, 1, 127, 128, 16383, 16384, 2 ** 31, 2 ** 32 + 5, Number.MAX_SAFE_INTEGER];
    const e = new Escritor();
    for (const v of valores) e.varint(v);
    const l = new Leitor(e.pronto());
    expect(valores.map(() => l.varint())).toEqual(valores);
    expect(l.restante).toBe(0);
  });

  it('um varint pequeno ocupa um byte e 128 ocupa dois', () => {
    const a = new Escritor();
    a.varint(127);
    const b = new Escritor();
    b.varint(128);
    expect(a.pronto().length).toBe(1);
    expect(b.pronto().length).toBe(2);
  });

  it('ida e volta de inteiros com sinal (zigzag)', () => {
    const valores = [0, -1, 1, -63, 63, -64, 64, -100000, 100000, -(2 ** 40), 2 ** 40];
    const e = new Escritor();
    for (const v of valores) e.zigzag(v);
    const l = new Leitor(e.pronto());
    expect(valores.map(() => l.zigzag())).toEqual(valores);
  });

  it('zigzag de resíduo pequeno cabe em um byte', () => {
    for (const v of [-63, -1, 0, 1, 63]) {
      const e = new Escritor();
      e.zigzag(v);
      expect(e.pronto().length).toBe(1);
    }
  });

  it('f64, u8, u32 e bytes voltam iguais; o buffer cresce além do inicial', () => {
    const e = new Escritor(4);
    e.f64(Math.PI);
    e.f64(-0.1);
    e.u8(255);
    e.u32(0xdeadbeef);
    e.bytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const l = new Leitor(e.pronto());
    expect(l.f64()).toBe(Math.PI);
    expect(l.f64()).toBe(-0.1);
    expect(l.u8()).toBe(255);
    expect(l.u32()).toBe(0xdeadbeef);
    expect([...l.bytes(9)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(l.restante).toBe(0);
  });

  it('varint e zigzag recusam número negativo, fracionário ou fora do inteiro seguro', () => {
    const e = new Escritor();
    expect(() => e.varint(-1)).toThrow();
    expect(() => e.varint(1.5)).toThrow();
    expect(() => e.varint(2 ** 53)).toThrow();
    expect(() => e.zigzag(0.5)).toThrow();
    expect(() => e.zigzag(Number.NaN)).toThrow();
  });

  it('ler além do fim lança LeituraInvalida', () => {
    const l = new Leitor(Uint8Array.from([1]));
    l.u8();
    expect(() => l.u8()).toThrow(LeituraInvalida);
    expect(() => new Leitor(Uint8Array.from([1, 2])).f64()).toThrow(LeituraInvalida);
    expect(() => new Leitor(Uint8Array.from([1, 2])).bytes(3)).toThrow(LeituraInvalida);
  });

  it('varint que não termina em 8 bytes é inválido', () => {
    const l = new Leitor(new Uint8Array(12).fill(0x80));
    expect(() => l.varint()).toThrow(LeituraInvalida);
  });

  it('varint de 8 bytes acima do inteiro seguro é inválido', () => {
    const l = new Leitor(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]));
    expect(() => l.varint()).toThrow(LeituraInvalida);
  });
});

describe('UTF-8', () => {
  const conhecidos: readonly [string, readonly number[]][] = [
    ['', []],
    ['abc', [0x61, 0x62, 0x63]],
    ['ação', [0x61, 0xc3, 0xa7, 0xc3, 0xa3, 0x6f]],
    ['Zé 😀', [0x5a, 0xc3, 0xa9, 0x20, 0xf0, 0x9f, 0x98, 0x80]],
    ['日本', [0xe6, 0x97, 0xa5, 0xe6, 0x9c, 0xac]],
    ['a\u0000b', [0x61, 0x00, 0x62]],
    ['\u{10FFFF}', [0xf4, 0x8f, 0xbf, 0xbf]],
    ['\u07ff\u0800\uffff', [0xdf, 0xbf, 0xe0, 0xa0, 0x80, 0xef, 0xbf, 0xbf]],
  ];

  it('codifica e decodifica os bytes conhecidos do UTF-8', () => {
    for (const [t, bytes] of conhecidos) {
      expect([...codificarUtf8(t)], JSON.stringify(t)).toEqual(bytes);
      expect(decodificarUtf8(Uint8Array.from(bytes))).toBe(t);
    }
  });

  it('ida e volta de texto longo com todos os tamanhos de caractere', () => {
    const longo = 'aé日😀'.repeat(3000);
    expect(decodificarUtf8(codificarUtf8(longo))).toBe(longo);
  });

  it('substitui par substituto solto por U+FFFD (EF BF BD), como o padrão manda', () => {
    expect([...codificarUtf8('a\ud800b')]).toEqual([0x61, 0xef, 0xbf, 0xbd, 0x62]);
    expect([...codificarUtf8('\udc00')]).toEqual([0xef, 0xbf, 0xbd]);
    expect([...codificarUtf8('x\ud800')]).toEqual([0x78, 0xef, 0xbf, 0xbd]);
  });

  it('recusa byte inválido, sequência truncada, supérflua e substituto codificado', () => {
    const invalidos = [[0xff], [0xc3], [0xc0, 0x80], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0x80], [0xe2, 0x82], [0xf0, 0x9f, 0x98]];
    for (const b of invalidos) expect(() => decodificarUtf8(Uint8Array.from(b)), JSON.stringify(b)).toThrow(LeituraInvalida);
  });
});
