import { pontoNoMundo, quadroVazio, vetorNoMundo, type Colocacao } from '@sinuca/personagens';
import { MESA_BAR } from '@sinuca/fisica';
import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm, apoioEm } from './apoio';
import { lugarDoTapinha, quadroDasPalmas, quadroDoTapinha, tapinhaVazio } from './gestos-com-contato';
import { maoDoArtista } from './para-testes';

const BASE = await maoDoArtista();
const tapinha = BASE.modelo.contatos.gestos.get('tapinha')!;
const palmas = BASE.modelo.contatos.gestos.get('palmas')!;
const obst = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const ESCALA = CONFIG_WEB.maos.escala;
const ponto = { x: 0, y: 0, z: 0 };
const vetor = { x: 0, y: 0, z: 0 };

describe('quadroDoTapinha: o punho cai no plano', () => {
  it.each([true, false])('com espelho %s: o ponto de contato do arquivo cai no ponto pedido e o plano vira a moldura (normal para cima)', (espelho) => {
    const c: Colocacao = { escala: ESCALA, espelho };
    const alvo = { x: 0.3, y: obst.alturaMoldura, z: 0.7 };
    const q = quadroDoTapinha(tapinha, c, alvo, 0.6, -0.8, quadroVazio());
    pontoNoMundo(q, c, tapinha.ponto[0], tapinha.ponto[1], tapinha.ponto[2], ponto);
    expect(ponto.x).toBeCloseTo(alvo.x, 9);
    expect(ponto.y).toBeCloseTo(alvo.y, 9);
    expect(ponto.z).toBeCloseTo(alvo.z, 9);
    vetorNoMundo(q, c, tapinha.planoNormal[0], tapinha.planoNormal[1], tapinha.planoNormal[2], vetor);
    expect(vetor.x).toBeCloseTo(0, 9);
    expect(vetor.y).toBeCloseTo(1, 9);
    expect(vetor.z).toBeCloseTo(0, 9);
  });

  it('os dedos apontam para o rumo pedido (na horizontal)', () => {
    const c: Colocacao = { escala: ESCALA, espelho: true };
    for (const rumo of [[1, 0], [0, 1], [-0.6, 0.8]] as const) {
      const q = quadroDoTapinha(tapinha, c, { x: 0, y: 0.04, z: 0 }, rumo[0], rumo[1], quadroVazio());
      vetorNoMundo(q, c, 0, 1, 0, vetor);
      expect(vetor.x).toBeCloseTo(rumo[0], 6);
      expect(vetor.z).toBeCloseTo(rumo[1], 6);
      expect(vetor.y).toBeCloseTo(0, 6);
    }
  });
});

describe('quadroDasPalmas: as duas palmas se encontram', () => {
  it('as duas mãos tocam o mesmo ponto, e as palmas olham uma para a outra', () => {
    const alvo = { x: 1, y: 0.8, z: -0.5 };
    const direita: Colocacao = { escala: 1.6, espelho: false };
    const esquerda: Colocacao = { escala: 1.6, espelho: true };
    const qd = quadroDasPalmas(palmas, direita, alvo, 1, 0, quadroVazio());
    const qe = quadroDasPalmas(palmas, esquerda, alvo, 1, 0, quadroVazio());
    const pd = pontoNoMundo(qd, direita, palmas.ponto[0], palmas.ponto[1], palmas.ponto[2], { x: 0, y: 0, z: 0 });
    const pe = pontoNoMundo(qe, esquerda, palmas.ponto[0], palmas.ponto[1], palmas.ponto[2], { x: 0, y: 0, z: 0 });
    expect(pd.x).toBeCloseTo(alvo.x, 9);
    expect(pe.x).toBeCloseTo(alvo.x, 9);
    expect(pd.y).toBeCloseTo(pe.y, 9);
    expect(pd.z).toBeCloseTo(pe.z, 9);
    const nd = vetorNoMundo(qd, direita, palmas.normalDaPalma[0], palmas.normalDaPalma[1], palmas.normalDaPalma[2], { x: 0, y: 0, z: 0 });
    const ne = vetorNoMundo(qe, esquerda, palmas.normalDaPalma[0], palmas.normalDaPalma[1], palmas.normalDaPalma[2], { x: 0, y: 0, z: 0 });
    // Uma olha para o lado do eixo das palmas e a outra para o contrário.
    expect(nd.x * ne.x + nd.y * ne.y + nd.z * ne.z).toBeCloseTo(-1, 6);
    expect(Math.abs(nd.x)).toBeCloseTo(1, 6);
  });

  it('os dedos apontam para cima', () => {
    for (const espelho of [false, true]) {
      const c: Colocacao = { escala: 1, espelho };
      const q = quadroDasPalmas(palmas, c, { x: 0, y: 0, z: 0 }, 0, 1, quadroVazio());
      vetorNoMundo(q, c, 0, 1, 0, vetor);
      expect(vetor.y).toBeCloseTo(1, 6);
    }
  });
});

describe('lugarDoTapinha: a moldura mais perto', () => {
  const lugar = tapinhaVazio();
  const larguraDoMeio = obst.larguraBorracha + obst.larguraMoldura / 2;

  it('perto da tabela de lado, o tapinha cai na moldura dela, na altura da moldura', () => {
    lugarDoTapinha(0.8, 0.5, obst, 0.3, lugar);
    expect(lugar.naMoldura).toBe(true);
    expect(lugar.y).toBeCloseTo(obst.alturaMoldura, 9);
    expect(lugar.z).toBeCloseTo(obst.semiZ + larguraDoMeio, 6);
    expect(lugar.x).toBeCloseTo(0.8, 6);
  });

  it('perto da cabeceira, a outra tabela (a de −X)', () => {
    lugarDoTapinha(-0.9, 0.1, obst, 0.3, lugar);
    expect(lugar.naMoldura).toBe(true);
    expect(lugar.x).toBeCloseTo(-(obst.semiX + larguraDoMeio), 6);
  });

  it('em frente a uma caçapa, escorrega pela moldura até onde há madeira', () => {
    lugarDoTapinha(0, 0.55, obst, 0.3, lugar);
    expect(lugar.naMoldura).toBe(true);
    expect(apoioEm(obst, lugar.x, lugar.z).tipo).toBe('moldura');
    expect(alturaDoApoioEm(obst, lugar.x, lugar.z)).toBeCloseTo(obst.alturaMoldura, 9);
  });

  it('longe de qualquer tabela (além do alcance), bate no pano ao lado: na altura do pano, `naMoldura` falso', () => {
    lugarDoTapinha(0, 0, obst, 0.3, lugar);
    expect(lugar.naMoldura).toBe(false);
    expect(lugar.y).toBe(0);
    expect(lugar.x).toBe(0);
    expect(lugar.z).toBe(0);
  });
});
