import { describe, expect, it } from 'vitest';
import { apagarJson, gravarJson, lerJson, type ArmazenamentoMinimo } from './armazenamento';

function memoria(): ArmazenamentoMinimo & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => void dados.set(chave, valor),
    removeItem: (chave) => void dados.delete(chave),
  };
}

const quebrado: ArmazenamentoMinimo = {
  getItem() {
    throw new DOMException('bloqueado', 'SecurityError');
  },
  setItem() {
    throw new DOMException('cheio', 'QuotaExceededError');
  },
  removeItem() {
    throw new DOMException('bloqueado', 'SecurityError');
  },
};

describe('armazenamento seguro', () => {
  it('grava e lê de volta um objeto JSON', () => {
    const arm = memoria();
    expect(gravarJson('k', { a: 1, b: [true] }, arm)).toBe(true);
    expect(arm.dados.get('k')).toBe('{"a":1,"b":[true]}');
    expect(lerJson('k', arm)).toEqual({ a: 1, b: [true] });
  });

  it('chave que não existe lê como null', () => {
    expect(lerJson('nada', memoria())).toBeNull();
  });

  it('JSON corrompido lê como null, sem lançar', () => {
    const arm = memoria();
    arm.dados.set('k', '{quebrado');
    expect(lerJson('k', arm)).toBeNull();
  });

  it('apagar remove a chave', () => {
    const arm = memoria();
    gravarJson('k', 1, arm);
    expect(apagarJson('k', arm)).toBe(true);
    expect(arm.dados.has('k')).toBe(false);
  });

  it('armazenamento que lança (bloqueado, cheio) vira falha silenciosa', () => {
    expect(lerJson('k', quebrado)).toBeNull();
    expect(gravarJson('k', 1, quebrado)).toBe(false);
    expect(apagarJson('k', quebrado)).toBe(false);
  });

  it('sem armazenamento (null) nada funciona nem lança', () => {
    expect(lerJson('k', null)).toBeNull();
    expect(gravarJson('k', 1, null)).toBe(false);
    expect(apagarJson('k', null)).toBe(false);
  });

  it('valor impossível de serializar (ciclo) não grava e não lança', () => {
    const ciclo: Record<string, unknown> = {};
    ciclo.eu = ciclo;
    const arm = memoria();
    expect(gravarJson('k', ciclo, arm)).toBe(false);
    expect(arm.dados.size).toBe(0);
  });
});
