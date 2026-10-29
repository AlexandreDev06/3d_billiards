import { describe, expect, it } from 'vitest';
import { DETALHE_COMPLETO, mesmoDetalhe, type DetalheDoTaco } from './detalhe-do-taco';

const SIMPLES: DetalheDoTaco = { trama: 'simples', iridescencia: false, animacao: false, imagens: 'cor' };

describe('DetalheDoTaco', () => {
  it('o padrão de quem não escolhe liga tudo', () => {
    expect(DETALHE_COMPLETO).toEqual({ trama: 'cheia', iridescencia: true, animacao: true, imagens: 'completas' });
  });

  it('mesmoDetalhe compara por valor, campo a campo', () => {
    expect(mesmoDetalhe(DETALHE_COMPLETO, { ...DETALHE_COMPLETO })).toBe(true);
    expect(mesmoDetalhe(DETALHE_COMPLETO, SIMPLES)).toBe(false);
    for (const campo of ['trama', 'iridescencia', 'animacao', 'imagens'] as const) {
      expect(mesmoDetalhe(DETALHE_COMPLETO, { ...DETALHE_COMPLETO, [campo]: SIMPLES[campo] }), campo).toBe(false);
    }
  });
});
