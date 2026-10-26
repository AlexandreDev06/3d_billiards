import { describe, expect, it } from 'vitest';
import { ALFABETO_CODIGO, TAMANHO_CODIGO } from '@sinuca/protocolo';
import { gerarCodigo } from './codigo';
import { criarRng } from './rng';

describe('gerarCodigo', () => {
  it('tem o tamanho do protocolo e só caracteres do alfabeto sem ambíguos', () => {
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigo();
      expect(c).toHaveLength(TAMANHO_CODIGO);
      for (const ch of c) expect(ALFABETO_CODIGO).toContain(ch);
    }
    for (const ambiguo of '01ILO') expect(ALFABETO_CODIGO).not.toContain(ambiguo);
  });

  it('usa o sorteio injetado: mesmo sorteio, mesmo código; índices cobrem o alfabeto', () => {
    expect(gerarCodigo(() => 0)).toBe(ALFABETO_CODIGO[0]!.repeat(TAMANHO_CODIGO));
    expect(gerarCodigo((max) => max - 1)).toBe(ALFABETO_CODIGO.at(-1)!.repeat(TAMANHO_CODIGO));
    const a = criarRng(5);
    const b = criarRng(5);
    expect(gerarCodigo((max) => Math.floor(a.proximo() * max))).toBe(gerarCodigo((max) => Math.floor(b.proximo() * max)));
  });

  it('o sorteio padrão varia', () => {
    const codigos = new Set(Array.from({ length: 50 }, () => gerarCodigo()));
    expect(codigos.size).toBeGreaterThan(40);
  });
});

describe('criarRng', () => {
  it('é determinístico por semente e fica em [0, 1)', () => {
    const a = criarRng(42);
    const b = criarRng(42);
    const c = criarRng(43);
    const xs = Array.from({ length: 100 }, () => a.proximo());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b.proximo()));
    expect(xs).not.toEqual(Array.from({ length: 100 }, () => c.proximo()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
