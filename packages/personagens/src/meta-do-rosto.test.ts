import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerMetaDoRosto } from './meta-do-rosto';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../arte/personagens/exportados');
const arquivo = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as unknown;

describe('lerMetaDoRosto (balao-meta.json do artista)', () => {
  const meta = lerMetaDoRosto(arquivo);

  it('lê as formas na ordem do arquivo, e as caras são as que começam por cara_', () => {
    expect(meta.formas).toEqual(['cara_neutro', 'cara_sorriso', 'cara_susto', 'cara_bravo', 'cara_triste', 'piscar']);
    expect(meta.caras).toEqual(['cara_neutro', 'cara_sorriso', 'cara_susto', 'cara_bravo', 'cara_triste']);
  });

  it('lê as ações com o tempo em segundos (quadros / fps)', () => {
    expect([...meta.acoes.keys()].sort()).toEqual(['balao_estufar', 'balao_inclinar', 'balao_murchar', 'balao_parado', 'balao_pulinho', 'balao_susto']);
    const inclinar = meta.acoes.get('balao_inclinar')!;
    expect(inclinar.duracaoS).toBeCloseTo(2.8, 6);
    expect(inclinar.cicloS![0]).toBeCloseTo(24 / 30, 6);
    expect(inclinar.cicloS![1]).toBeCloseTo(84 / 30, 6);
    expect(inclinar.entradaS![1]).toBeCloseTo(24 / 30, 6);
    expect(inclinar.caraPar).toBe('cara_neutro');
    expect(meta.acoes.get('balao_pulinho')!.cicloS).toBeUndefined();
    expect(meta.acoes.get('balao_murchar')!.caraPar).toBe('cara_triste');
  });

  it('a ação que repete sozinha (a parada) é marcada', () => {
    expect(meta.acoes.get('balao_parado')!.repete).toBe(true);
    expect(meta.acoes.get('balao_estufar')!.repete).toBe(false);
  });

  it('lê os olhos (pai, eixo no repouso) e o limite do olhar em radianos', () => {
    expect([...meta.olhos.keys()].sort()).toEqual(['olho_dir', 'olho_esq']);
    expect(meta.olhos.get('olho_esq')!.pai).toBe('espinha_2');
    expect(meta.olhos.get('olho_esq')!.eixoDeRepouso).toEqual([0, 0, 1]);
    expect(meta.limiteDoOlharRad).toBeCloseTo(Math.PI / 6, 9);
  });

  it('lê os pontos das mãos', () => {
    expect([...meta.ancoras.keys()].sort()).toEqual(['mao_dir', 'mao_esq']);
    expect(meta.ancoras.get('mao_esq')!.pai).toBe('espinha_2');
    expect(meta.ancoras.get('mao_esq')!.posicaoM[0]).toBeCloseTo(0.095, 6);
  });

  it('diz qual campo está errado', () => {
    expect(() => lerMetaDoRosto(null)).toThrow('meta');
    expect(() => lerMetaDoRosto({ acoes: { balao_x: { fps: 'a', quadros: 3 } }, formas: { nomes: [] } })).toThrow('balao_x.fps');
  });
});
