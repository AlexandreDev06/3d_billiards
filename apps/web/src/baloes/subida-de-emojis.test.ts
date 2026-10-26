import { describe, expect, it } from 'vitest';
import { SUBIDA_PADRAO, SubidasDeEmojis, quadroDaSubida } from './subida-de-emojis';

describe('quadroDaSubida', () => {
  it('começa embaixo e invisível, aparece, sobe e some no fim', () => {
    const inicio = quadroDaSubida(0);
    expect(inicio.altura).toBe(0);
    expect(inicio.opacidade).toBe(0);
    const meio = quadroDaSubida(0.4);
    expect(meio.opacidade).toBe(1);
    expect(meio.altura).toBeGreaterThan(0);
    const fim = quadroDaSubida(1);
    expect(fim.opacidade).toBe(0);
    expect(fim.altura).toBeCloseTo(SUBIDA_PADRAO.subida, 9);
  });

  it('só sobe: a altura nunca diminui, e a opacidade fica entre 0 e 1', () => {
    let antes = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const q = quadroDaSubida(p);
      expect(q.altura).toBeGreaterThanOrEqual(antes);
      antes = q.altura;
      expect(q.opacidade).toBeGreaterThanOrEqual(0);
      expect(q.opacidade).toBeLessThanOrEqual(1);
      expect(q.escala).toBeGreaterThan(0.4);
      expect(q.escala).toBeLessThan(1.3);
    }
  });

  it('fora de 0 a 1 não passa do começo nem do fim', () => {
    expect(quadroDaSubida(-3).altura).toBe(0);
    expect(quadroDaSubida(7).opacidade).toBe(0);
  });
});

describe('SubidasDeEmojis', () => {
  it('um emoji vive a vida inteira e depois sai', () => {
    const s = new SubidasDeEmojis();
    s.chegar('😂', 0, 1000);
    expect(s.vivos(1500)).toHaveLength(1);
    expect(s.vivos(1000 + SUBIDA_PADRAO.vidaMs - 1)).toHaveLength(1);
    expect(s.vivos(1000 + SUBIDA_PADRAO.vidaMs)).toHaveLength(0);
  });

  it('o que passa do máximo tira o mais velho, e o progresso vai de 0 a 1', () => {
    const s = new SubidasDeEmojis({ ...SUBIDA_PADRAO, maximo: 2 });
    s.chegar('🔥', 0, 0);
    s.chegar('👏', 0, 100);
    s.chegar('🍺', 0, 200);
    const vivos = s.vivos(300);
    expect(vivos.map((e) => e.emoji)).toEqual(['👏', '🍺']);
    expect(s.progressoDe(vivos[0]!, 100)).toBe(0);
    expect(s.progressoDe(vivos[0]!, 100 + SUBIDA_PADRAO.vidaMs / 2)).toBeCloseTo(0.5, 9);
    expect(s.progressoDe(vivos[0]!, 1e9)).toBe(1);
  });

  it('limpar esvazia', () => {
    const s = new SubidasDeEmojis();
    s.chegar('🎱', null, 0);
    s.limpar();
    expect(s.vivos(1)).toHaveLength(0);
  });
});
