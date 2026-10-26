import { describe, expect, it } from 'vitest';
import type { ArmazenamentoMinimo } from '../armazenamento';
import { ModeloDaAjuda } from './ajuda-modelo';

function memoria(inicial: Record<string, string> = {}): ArmazenamentoMinimo & { dados: Map<string, string> } {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (c) => dados.get(c) ?? null,
    setItem: (c, v) => void dados.set(c, v),
    removeItem: (c) => void dados.delete(c),
  };
}

describe('ModeloDaAjuda', () => {
  it('na primeira visita a ajuda começa aberta: os controles não são óbvios', () => {
    expect(new ModeloDaAjuda(memoria()).aberta).toBe(true);
  });

  it('alternar fecha e abre, e avisa quem escuta', () => {
    const ajuda = new ModeloDaAjuda(memoria());
    const vistos: boolean[] = [];
    ajuda.aoMudar((aberta) => vistos.push(aberta));
    ajuda.alternar();
    ajuda.alternar();
    expect(vistos).toEqual([false, true]);
    expect(ajuda.aberta).toBe(true);
  });

  it('lembra a escolha para a próxima visita', () => {
    const arm = memoria();
    new ModeloDaAjuda(arm).alternar();
    expect(new ModeloDaAjuda(arm).aberta).toBe(false);
  });

  it('dado salvo que não é booleano é ignorado', () => {
    expect(new ModeloDaAjuda(memoria({ 'sinuca.ajuda-aberta': '"talvez"' })).aberta).toBe(true);
    expect(new ModeloDaAjuda(memoria({ 'sinuca.ajuda-aberta': '{quebrado' })).aberta).toBe(true);
  });

  it('armazenamento bloqueado não impede de alternar', () => {
    const bloqueado: ArmazenamentoMinimo = {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
      removeItem() {
        throw new Error('bloqueado');
      },
    };
    const ajuda = new ModeloDaAjuda(bloqueado);
    ajuda.alternar();
    expect(ajuda.aberta).toBe(false);
  });

  it('em janela baixa a ajuda começa fechada para não cobrir a mesa', () => {
    expect(new ModeloDaAjuda(memoria(), false).aberta).toBe(false);
  });

  it('o que o jogador já escolheu vale mais que o padrão da janela', () => {
    const arm = memoria({ 'sinuca.ajuda-aberta': 'true' });
    expect(new ModeloDaAjuda(arm, false).aberta).toBe(true);
  });
});
