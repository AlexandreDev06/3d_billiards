import { describe, expect, it } from 'vitest';
import { booleano, lista, literal, nulavel, numero, objeto, texto, validar } from './validacao';

describe('combinadores de validação', () => {
  it('número: faixa, inteiro e finitude', () => {
    const e = numero({ min: 0, max: 10, inteiro: true });
    expect(validar(e, 5)).toEqual({ ok: true, valor: 5 });
    for (const ruim of [-1, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined]) {
      expect(validar(e, ruim).ok, String(ruim)).toBe(false);
    }
    expect(validar(numero({}), Number.NaN).ok).toBe(false);
  });

  it('texto: tamanho em caracteres, caracteres de controle e padrão', () => {
    const e = texto({ min: 1, max: 5 });
    expect(validar(e, 'abcde').ok).toBe(true);
    expect(validar(e, '').ok).toBe(false);
    expect(validar(e, 'abcdef').ok).toBe(false);
    expect(validar(e, 'a\u0000b').ok).toBe(false);
    expect(validar(e, 'a\nb').ok).toBe(false);
    expect(validar(e, 5).ok).toBe(false);
    expect(validar(texto({ max: 9, padrao: /^[A-Z]+$/ }), 'abc').ok).toBe(false);
    expect(validar(texto({ max: 9, padrao: /^[A-Z]+$/ }), 'ABC').ok).toBe(true);
  });

  it('texto: conta pontos de código, não unidades UTF-16', () => {
    expect(validar(texto({ min: 1, max: 2 }), '😀😀').ok).toBe(true);
    expect(validar(texto({ min: 1, max: 2 }), '😀😀😀').ok).toBe(false);
  });

  it('literal, booleano e nulável', () => {
    expect(validar(literal('a', 'b'), 'b').ok).toBe(true);
    expect(validar(literal('a', 'b'), 'c').ok).toBe(false);
    expect(validar(booleano, true).ok).toBe(true);
    expect(validar(booleano, 1).ok).toBe(false);
    expect(validar(nulavel(numero({})), null)).toEqual({ ok: true, valor: null });
    expect(validar(nulavel(numero({})), 3)).toEqual({ ok: true, valor: 3 });
    expect(validar(nulavel(numero({})), undefined).ok).toBe(false);
  });

  it('lista: tamanho e itens, com o caminho do item ruim no erro', () => {
    const e = lista(numero({ inteiro: true }), { max: 3 });
    expect(validar(e, [1, 2, 3]).ok).toBe(true);
    expect(validar(e, [1, 2, 3, 4]).ok).toBe(false);
    expect(validar(e, 'abc').ok).toBe(false);
    const r = validar(e, [1, 2.5]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('[1]');
  });

  it('objeto: devolve cópia só com as chaves conhecidas e recusa chave extra, faltando ou objeto estranho', () => {
    const e = objeto({ a: numero({}) }, { b: texto({ max: 3 }) });
    expect(validar(e, { a: 1 })).toEqual({ ok: true, valor: { a: 1 } });
    expect(validar(e, { a: 1, b: 'xy' })).toEqual({ ok: true, valor: { a: 1, b: 'xy' } });
    expect(validar(e, { a: 1, c: 2 }).ok).toBe(false);
    expect(validar(e, {}).ok).toBe(false);
    expect(validar(e, [1]).ok).toBe(false);
    expect(validar(e, null).ok).toBe(false);
    expect(validar(e, { a: 1, b: undefined }).ok).toBe(false);
  });

  it('objeto: __proto__ e herança não passam por chave', () => {
    const e = objeto({ a: numero({}) });
    const r = validar(e, JSON.parse('{"a":1,"__proto__":{"x":1}}'));
    expect(r.ok).toBe(false);
    expect(validar(e, Object.create({ a: 1 })).ok).toBe(false);
    // chaves próprias certas, mas com um protótipo que não é o de objeto simples
    expect(validar(e, Object.assign(Object.create({ herdada: true }), { a: 1 })).ok).toBe(false);
    expect(validar(e, Object.assign(Object.create(null), { a: 1 })).ok).toBe(true);
  });

  it('erros vêm com caminho e nunca lançam', () => {
    const e = objeto({ x: objeto({ y: numero({ max: 1 }) }) });
    const r = validar(e, { x: { y: 2 } });
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('x.y') });
  });
});
