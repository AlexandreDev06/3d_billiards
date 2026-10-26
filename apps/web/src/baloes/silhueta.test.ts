import { describe, expect, it } from 'vitest';
import { FAIXA_DO_ROSTO, perfilDoBalao, raioDoBalaoEm } from './silhueta';

describe('perfilDoBalao', () => {
  const perfil = perfilDoBalao(0.11, 0.075, 20);

  it('vai do nó (embaixo) ao topo, fechado nas duas pontas', () => {
    expect(perfil).toHaveLength(21);
    expect(perfil[0]!.y).toBeCloseTo(-0.11, 9);
    expect(perfil[20]!.y).toBeCloseTo(0.11, 9);
    expect(perfil[0]!.r).toBeCloseTo(0, 9);
    expect(perfil[20]!.r).toBeCloseTo(0, 9);
  });

  it('o maior raio é o pedido e fica acima do meio, como o bojo de um balão de festa', () => {
    const maior = perfil.reduce((a, b) => (b.r > a.r ? b : a));
    expect(maior.r).toBeCloseTo(0.075, 3);
    expect(maior.y).toBeGreaterThan(0);
  });

  it('é uma gota: sobe de largura até o bojo e desce depois, sem dentes', () => {
    const ia = perfil.findIndex((p) => p.r === Math.max(...perfil.map((q) => q.r)));
    for (let i = 1; i <= ia; i++) expect(perfil[i]!.r).toBeGreaterThanOrEqual(perfil[i - 1]!.r - 1e-12);
    for (let i = ia + 1; i < perfil.length; i++) expect(perfil[i]!.r).toBeLessThanOrEqual(perfil[i - 1]!.r + 1e-12);
  });

  it('o rosto cabe no miolo: ali o balão tem pelo menos 80% do raio máximo', () => {
    expect(raioDoBalaoEm(FAIXA_DO_ROSTO.de, 1)).toBeGreaterThan(0.8);
    expect(raioDoBalaoEm(FAIXA_DO_ROSTO.ate, 1)).toBeGreaterThan(0.8);
  });

  it('fora de 0 a 1 não passa do perfil', () => {
    expect(raioDoBalaoEm(-1, 1)).toBeCloseTo(0, 9);
    expect(raioDoBalaoEm(2, 1)).toBeCloseTo(0, 9);
  });
});
