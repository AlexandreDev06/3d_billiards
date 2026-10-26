import { describe, expect, it } from 'vitest';
import type { ArmazenamentoMinimo } from '../armazenamento';
import { QUALIDADE_PADRAO, gravarQualidade, lerQualidade, qualidadeDaUrl } from './preferencia';

function memoria(inicial: Record<string, string> = {}): ArmazenamentoMinimo & { dados: Map<string, string> } {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (c) => dados.get(c) ?? null,
    setItem: (c, v) => void dados.set(c, v),
    removeItem: (c) => void dados.delete(c),
  };
}

describe('lerQualidade / gravarQualidade', () => {
  it('sem nada guardado: automático, sem queda lembrada', () => {
    expect(lerQualidade(memoria())).toEqual(QUALIDADE_PADRAO);
    expect(lerQualidade(null)).toEqual(QUALIDADE_PADRAO);
  });

  it('o que se grava volta igual', () => {
    const arm = memoria();
    expect(gravarQualidade({ preferencia: 'auto', rebaixada: 'media' }, arm)).toBe(true);
    expect(lerQualidade(arm)).toEqual({ preferencia: 'auto', rebaixada: 'media' });
    gravarQualidade({ preferencia: 'baixa', rebaixada: null }, arm);
    expect(lerQualidade(arm)).toEqual({ preferencia: 'baixa', rebaixada: null });
  });

  it('dado corrompido ou de outra forma é ignorado campo a campo', () => {
    expect(lerQualidade(memoria({ 'sinuca.qualidade': '{quebrado' }))).toEqual(QUALIDADE_PADRAO);
    expect(lerQualidade(memoria({ 'sinuca.qualidade': '42' }))).toEqual(QUALIDADE_PADRAO);
    expect(lerQualidade(memoria({ 'sinuca.qualidade': '{"preferencia":"ultra","rebaixada":"media"}' }))).toEqual({ preferencia: 'auto', rebaixada: 'media' });
    expect(lerQualidade(memoria({ 'sinuca.qualidade': '{"preferencia":"alta","rebaixada":"nenhuma"}' }))).toEqual({ preferencia: 'alta', rebaixada: null });
  });

  it('armazenamento bloqueado não derruba: lê o padrão e grava false', () => {
    const bloqueado: ArmazenamentoMinimo = {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
      removeItem() {},
    };
    expect(lerQualidade(bloqueado)).toEqual(QUALIDADE_PADRAO);
    expect(gravarQualidade(QUALIDADE_PADRAO, bloqueado)).toBe(false);
  });
});

describe('qualidadeDaUrl', () => {
  it('aceita um nível ou auto', () => {
    expect(qualidadeDaUrl('?qualidade=baixa')).toBe('baixa');
    expect(qualidadeDaUrl('?semente=3&qualidade=media')).toBe('media');
    expect(qualidadeDaUrl('?qualidade=auto')).toBe('auto');
  });

  it('o resto é ignorado', () => {
    expect(qualidadeDaUrl('')).toBeNull();
    expect(qualidadeDaUrl('?qualidade=ultra')).toBeNull();
    expect(qualidadeDaUrl('?qualidade=')).toBeNull();
  });
});
