import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, MESA_BAR } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { obstaculosDaMesa } from '../controles/elevacao-do-taco';
import type { TipoDeApoio } from './apoio';
import { eixoDoTaco } from './eixo';
import { escolherPoseDaPonte, lerLugarDaPonte, lugarVazioDaPonte, type LugarDaPonte } from './ponte-por-lugar';
import { bolasVazias, type BolasDaMesa } from './pose-das-maos';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HX = MESA_BAR.comprimento / 2;
const HZ = MESA_BAR.largura / 2;
const grau = Math.PI / 180;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const escolha = CONFIG_WEB.maos.escolha;
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;

function bolasEm(outras: readonly (readonly [number, number])[]): BolasDaMesa {
  const b = bolasVazias();
  outras.forEach(([x, z], i) => {
    b.x[i] = x;
    b.z[i] = z;
  });
  b.quantas = outras.length;
  b.raio = r;
  return b;
}

/** Lê o lugar com a branca em (`cx`, `cz`), mirando `graus`, a mão em (`x`, `z`) sobre `apoio`. */
function ler(cx: number, cz: number, graus: number, mao: readonly [number, number], apoio: TipoDeApoio, opcoes: { outras?: readonly (readonly [number, number])[]; elevacao?: number; forca?: number } = {}): LugarDaPonte {
  const eixo = eixoDoTaco(cx, R, cz, R, graus * grau, opcoes.elevacao ?? 5 * grau, REPOUSO, 0, 0);
  return lerLugarDaPonte(mao[0], mao[1], apoio, eixo, REPOUSO, obstaculos, bolasEm(opcoes.outras ?? []), escolha, opcoes.elevacao ?? 5 * grau, opcoes.forca ?? 0, lugarVazioDaPonte());
}

describe('lerLugarDaPonte: o que há onde a mão pousou', () => {
  it('no meio da mesa, no pano: longe de caçapa e de tabela, sem bola atrás, sem força', () => {
    const l = ler(-0.4, 0.1, 0, [-0.67, 0.1], 'pano');
    expect(l).toMatchObject({ apoio: 'pano', alturaDoApoio: 0, pertoDeCacapa: false, bolaAtras: false, forca: 0 });
  });

  it('a altura do apoio é a da borracha ou a da moldura, e 0 onde não há nada', () => {
    expect(ler(-0.9, 0, 0, [-(HX + 0.02), 0], 'borracha').alturaDoApoio).toBe(obstaculos.alturaBorracha);
    expect(ler(-0.9, 0, 0, [-(HX + 0.06), 0], 'moldura').alturaDoApoio).toBe(obstaculos.alturaMoldura);
    expect(ler(-0.9, 0, 0, [-1.6, 0], 'ar').alturaDoApoio).toBe(0);
  });

  it('o ângulo com a tabela: de frente para ela (90°) ou correndo ao longo dela (0°)', () => {
    // A branca perto da cabeceira (−X) mirando para +X: o taco chega de frente à tabela do fundo atrás dela.
    expect(ler(-(HX - 0.2), 0, 0, [-(HX + 0.06), 0], 'borracha').anguloComATabela).toBeCloseTo(90 * grau, 6);
    // Mirando 5° fora do eixo da mesa ele corre quase ao longo da tabela do lado (+Z), com a mão sobre ela.
    const aoLongo = ler(0, HZ - 0.2, 180 + 5, [0.5, HZ + 0.06], 'moldura');
    expect(aoLongo.anguloComATabela).toBeLessThan(10 * grau);
    expect(ler(0, HZ - 0.2, 90 * 3, [0, HZ + 0.06], 'moldura').anguloComATabela).toBeCloseTo(90 * grau, 6);
  });

  it('sobre o pano o ângulo não conta (fica em 90°)', () => {
    expect(ler(-0.4, 0, 20, [-0.65, -0.1], 'pano').anguloComATabela).toBeCloseTo(90 * grau, 9);
  });

  it('a mão junto da boca ou do círculo de queda de uma caçapa está perto de caçapa; longe, não', () => {
    const boca = obstaculos.vaos[0]!;
    expect(ler(0, 0, 0, [boca.bx, boca.bz], 'pano').pertoDeCacapa).toBe(true);
    expect(ler(0, 0, 0, [boca.cx + escolha.canto.raio * 0.9, boca.cz], 'pano').pertoDeCacapa).toBe(true);
    expect(ler(0, 0, 0, [boca.cx + escolha.canto.raio * 3, boca.cz], 'pano').pertoDeCacapa).toBe(false);
    expect(ler(0, 0, 0, [0, 0], 'pano').pertoDeCacapa).toBe(false);
  });

  it('há bola atrás da branca quando outra está no caminho de trás do taco, perto e na faixa dele', () => {
    const atras = (x: number, z: number): boolean => ler(-0.4, 0, 0, [-0.67, 0], 'pano', { outras: [[x, z]] }).bolaAtras;
    expect(atras(-0.4 - 0.12, 0.01)).toBe(true);
    expect(atras(-0.4 - 0.12, escolha.elevada.lado + 0.01)).toBe(false);
    expect(atras(-0.4 - escolha.elevada.alcance - 0.05, 0)).toBe(false);
    expect(atras(-0.4 + 0.12, 0)).toBe(false);
  });

  it('a força é a fração dada, limitada a 0..1', () => {
    expect(ler(-0.4, 0, 0, [-0.67, 0], 'pano', { forca: 0.4 }).forca).toBe(0.4);
    expect(ler(-0.4, 0, 0, [-0.67, 0], 'pano', { forca: 3 }).forca).toBe(1);
    expect(ler(-0.4, 0, 0, [-0.67, 0], 'pano', { forca: -1 }).forca).toBe(0);
  });
});

const base = (o: Partial<LugarDaPonte> = {}): LugarDaPonte => ({ ...lugarVazioDaPonte(), apoio: 'pano', ...o });

describe('escolherPoseDaPonte: qual ponte o jogo põe em cada lugar', () => {
  it('no pano, longe de tudo e sem força: o V', () => {
    expect(escolherPoseDaPonte(base(), escolha, 'v')).toBe('v');
  });

  it('no pano com a força puxada acima do limiar: o laço; abaixo, o V', () => {
    expect(escolherPoseDaPonte(base({ forca: escolha.laco.entra + 0.01 }), escolha, 'v')).toBe('laco');
    expect(escolherPoseDaPonte(base({ forca: escolha.laco.entra - 0.01 }), escolha, 'v')).toBe('v');
  });

  it('o laço tem histerese: entra em `entra` e só volta ao V abaixo de `sai`', () => {
    const entre = (escolha.laco.entra + escolha.laco.sai) / 2;
    expect(escolha.laco.sai).toBeLessThan(escolha.laco.entra);
    expect(escolherPoseDaPonte(base({ forca: entre }), escolha, 'v')).toBe('v');
    expect(escolherPoseDaPonte(base({ forca: entre }), escolha, 'laco')).toBe('laco');
    expect(escolherPoseDaPonte(base({ forca: escolha.laco.sai - 0.01 }), escolha, 'laco')).toBe('v');
  });

  it('com bola atrás da branca e o taco subindo por cima dela: a elevada (ganha do laço)', () => {
    const alto = escolha.elevada.elevacaoMinimaGraus * grau + 0.01;
    expect(escolherPoseDaPonte(base({ bolaAtras: true, elevacao: alto }), escolha, 'v')).toBe('elevada');
    expect(escolherPoseDaPonte(base({ bolaAtras: true, elevacao: alto, forca: 1 }), escolha, 'v')).toBe('elevada');
    expect(escolherPoseDaPonte(base({ bolaAtras: true, elevacao: 5 * grau }), escolha, 'v')).toBe('v');
    expect(escolherPoseDaPonte(base({ bolaAtras: false, elevacao: alto }), escolha, 'v')).toBe('v');
  });

  it('com a palma na borracha ou na moldura: a da tabela, e a colada se o taco corre ao longo dela', () => {
    for (const apoio of ['borracha', 'moldura'] as const) {
      expect(escolherPoseDaPonte(base({ apoio, anguloComATabela: 80 * grau }), escolha, 'v')).toBe('tabela');
      expect(escolherPoseDaPonte(base({ apoio, anguloComATabela: 5 * grau }), escolha, 'v')).toBe('colada');
    }
    expect(escolherPoseDaPonte(base({ apoio: 'moldura', anguloComATabela: escolha.colada.anguloMaximoGraus * grau - 0.01 }), escolha, 'v')).toBe('colada');
    expect(escolherPoseDaPonte(base({ apoio: 'moldura', anguloComATabela: escolha.colada.anguloMaximoGraus * grau + 0.01 }), escolha, 'v')).toBe('tabela');
  });

  it('junto da caçapa, ou onde não há apoio (o vão): a do canto, que ganha de tudo', () => {
    expect(escolherPoseDaPonte(base({ pertoDeCacapa: true }), escolha, 'v')).toBe('canto');
    expect(escolherPoseDaPonte(base({ apoio: 'ar' }), escolha, 'v')).toBe('canto');
    expect(escolherPoseDaPonte(base({ pertoDeCacapa: true, apoio: 'moldura', bolaAtras: true, elevacao: 1, forca: 1 }), escolha, 'tabela')).toBe('canto');
  });

  it('a força só vale no pano: sobre a madeira a força não traz o laço', () => {
    expect(escolherPoseDaPonte(base({ apoio: 'moldura', anguloComATabela: 80 * grau, forca: 1 }), escolha, 'v')).toBe('tabela');
  });
});
