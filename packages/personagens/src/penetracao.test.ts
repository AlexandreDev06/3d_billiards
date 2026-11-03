import { describe, expect, it } from 'vitest';
import type { ContatoDeCilindro } from './contatos';
import { lerContatos } from './contatos';
import { construirModelo, peleNaPose } from './modelo';
import { penetracaoNoCilindro } from './penetracao';
import { fichaDeBrinquedo, malhaDeBrinquedo } from './para-testes';

/** Um taco: 1,45 m, de 6 mm de raio na ponta a 15 mm no cabo, segurado a 0,25 m da ponta (raio de 7,5 mm ali). */
const CILINDRO: ContatoDeCilindro = { ponto: [0, 0, 0], eixo: [0, 1, 0], distanciaDoFim: 0.25, comprimento: 1.45, raioFino: 0.006, raioLargo: 0.015 };

describe('penetracaoNoCilindro', () => {
  it('um ponto fora do cilindro não entra', () => {
    const r = penetracaoNoCilindro([0, 0.02, 0, 0, 0, -0.02], CILINDRO);
    expect(r.pior).toBe(0);
    expect(r.quantos).toBe(0);
  });

  it('mede o quanto o ponto passou da superfície, com o raio do cone naquele lugar', () => {
    // No ponto onde a mão segura o raio é 6 + 9 · 0,25 / 1,45 ≈ 7,55 mm; um ponto a 2 mm do eixo entra ≈ 5,55 mm.
    const r0 = 0.006 + (0.009 * 0.25) / 1.45;
    expect(penetracaoNoCilindro([0, 0.002, 0], CILINDRO).pior).toBeCloseTo(r0 - 0.002, 9);
    // O cone afina para o fim fino: 0,1 m para lá o raio é menor, 0,1 m para cá é maior.
    expect(penetracaoNoCilindro([0.1, 0, 0.001], CILINDRO).pior).toBeCloseTo(r0 - (0.009 / 1.45) * 0.1 - 0.001, 9);
    expect(penetracaoNoCilindro([-0.1, 0, 0.001], CILINDRO).pior).toBeCloseTo(r0 + (0.009 / 1.45) * 0.1 - 0.001, 9);
  });

  it('conta só os pontos que entram mais que o limite e diz onde está o pior', () => {
    const r = penetracaoNoCilindro([0, 0.0, 0, 0.05, 0.0, 0.0045, 0.05, 0, 0.0069], CILINDRO, 0.001);
    expect(r.quantos).toBe(2);
    expect(r.onde).toBe(0);
  });

  it('a folga é a menor distância à superfície, negativa quando entra, e infinita sem ponto entre as pontas', () => {
    const r0 = 0.006 + (0.009 * 0.25) / 1.45;
    expect(penetracaoNoCilindro([0, 0.02, 0, 0, 0, -0.01], CILINDRO).folga).toBeCloseTo(0.01 - r0, 9);
    expect(penetracaoNoCilindro([0, 0.002, 0], CILINDRO).folga).toBeCloseTo(0.002 - r0, 9);
    expect(penetracaoNoCilindro([5, 0, 0], CILINDRO).folga).toBe(Infinity);
  });

  it('ignora o que está além das pontas do cilindro', () => {
    const alemDaPonta = penetracaoNoCilindro([0.26, 0, 0], CILINDRO);
    const alemDoCabo = penetracaoNoCilindro([-1.3, 0, 0], CILINDRO);
    expect(alemDaPonta.quantos + alemDoCabo.quantos).toBe(0);
  });
});

describe('peleNaPose', () => {
  it('é a pele do modelo na pose pelo nome, e pode usar a saída dada', () => {
    const f = fichaDeBrinquedo();
    const m = malhaDeBrinquedo();
    const modelo = construirModelo(f, lerContatos({}), m);
    expect(modelo.malha).toBe(m);
    const saida = new Float64Array(m.posicoes.length);
    const a = peleNaPose(modelo, 'repouso', saida);
    expect(a).toBe(saida);
    const b = peleNaPose(modelo, f.poses.get('repouso')!);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i]!, 12);
    expect(() => peleNaPose(modelo, 'nao-existe')).toThrow(/não existe/);
  });
});
