import { describe, expect, it } from 'vitest';
import { lerContatos } from './contatos';
import { esferasDosOssos, pelarMalha, pontosDeApoio } from './malha';
import { poseDeRepouso } from './ficha';
import { acharCorrentes, construirModelo, esferasNaPose } from './modelo';
import { fichaDeBrinquedo, malhaDeBrinquedo } from './para-testes';

describe('esferasDosOssos', () => {
  it('as esferas de cada osso contêm todos os vértices que mais pesam nele', () => {
    const f = fichaDeBrinquedo();
    const m = malhaDeBrinquedo();
    const esferas = esferasDosOssos(f, m, () => 2);
    expect(esferas.length).toBe(10);
    const pele = pelarMalha(f, m, poseDeRepouso(f), new Float64Array(m.posicoes.length));
    const modelo = construirModelo(f, lerContatos({}), m, { esferasPorOsso: () => 2 });
    const { centros, raios } = esferasNaPose(modelo, 'repouso');
    for (let v = 0; v < pele.length / 3; v++) {
      const dentro = raios.some((r, i) => Math.hypot(pele[3 * v]! - centros[3 * i]!, pele[3 * v + 1]! - centros[3 * i + 1]!, pele[3 * v + 2]! - centros[3 * i + 2]!) <= r + 1e-9);
      expect(dentro).toBe(true);
    }
  });

  it('com mais esferas por osso, o raio total encolhe', () => {
    const f = fichaDeBrinquedo();
    const m = malhaDeBrinquedo();
    const soma = (k: number): number => esferasDosOssos(f, m, () => k).reduce((a, e) => a + e.r, 0) / k;
    expect(soma(3)).toBeLessThan(soma(1));
  });
});

describe('pelarMalha', () => {
  it('no repouso devolve a malha de repouso', () => {
    const f = fichaDeBrinquedo();
    const m = malhaDeBrinquedo();
    const pele = pelarMalha(f, m, poseDeRepouso(f), new Float64Array(m.posicoes.length));
    for (let i = 0; i < pele.length; i++) expect(pele[i]).toBeCloseTo(m.posicoes[i]!, 9);
  });

  it('na garra as pontas dos dedos descem em z e a palma fica onde estava', () => {
    const f = fichaDeBrinquedo();
    const m = malhaDeBrinquedo();
    const pele = pelarMalha(f, m, f.poses.get('garra')!, new Float64Array(m.posicoes.length));
    let menorZ = Infinity;
    for (let v = 0; v < pele.length / 3; v++) menorZ = Math.min(menorZ, pele[3 * v + 2]!);
    expect(menorZ).toBeLessThan(-0.02);
    // os 150 primeiros vértices (raiz e palma) não se mexem
    for (let i = 0; i < 3 * 60; i++) expect(pele[i]).toBeCloseTo(m.posicoes[i]!, 9);
  });
});

describe('pontosDeApoio', () => {
  it('guarda o ponto mais baixo de cada célula, só os da faixa do mais baixo', () => {
    const sup = new Float64Array([0, 0, -0.01, 0.001, 0, -0.02, 0.05, 0, -0.011, 0.05, 0, 0.3]);
    const apoio = pontosDeApoio(sup, [0, 0, -1], 0.01, 0.02);
    // (0,0,-0.01) e (0.001,0,-0.02) dividem a célula: fica o mais baixo; (0.05,0,0.3) está longe da faixa
    expect(apoio.length / 3).toBe(2);
    const zs = [apoio[2]!, apoio[5]!].sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(-0.02, 9);
    expect(zs[1]).toBeCloseTo(-0.011, 9);
  });
});

describe('acharCorrentes e construirModelo', () => {
  it('agrupa os ossos nome_n em correntes e mede a ponta na malha', () => {
    const f = fichaDeBrinquedo();
    const correntes = acharCorrentes(f, malhaDeBrinquedo());
    expect([...correntes.keys()]).toEqual(['dedo']);
    const dedo = correntes.get('dedo')!;
    expect(dedo.ossos).toEqual([2, 3, 4]);
    expect(dedo.raioDaPonta).toBeCloseTo(0.01, 9);
    expect(dedo.ponta[1]).toBeCloseTo(0.01, 9);
    expect(dedo.partes.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('lança dizendo o osso quando a corrente não é uma cadeia', () => {
    const f = fichaDeBrinquedo();
    const quebrada = { ...f, ossos: f.ossos.map((o, i) => (i === 4 ? { ...o, pai: 1 } : o)) };
    expect(() => acharCorrentes(quebrada, malhaDeBrinquedo())).toThrow(/dedo_3/);
  });

  it('monta o modelo com esferas e os apoios de cada pose', () => {
    const f = fichaDeBrinquedo();
    const modelo = construirModelo(f, lerContatos({}), malhaDeBrinquedo());
    expect(modelo.esferas.length).toBeGreaterThan(0);
    expect([...modelo.apoios.keys()].sort()).toEqual(['garra', 'repouso']);
    expect(() => esferasNaPose(modelo, 'nao-existe')).toThrow(/nao-existe/);
  });
});
