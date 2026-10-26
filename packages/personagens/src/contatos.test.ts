import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerContatos, raioNoPonto } from './contatos';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../arte/personagens/exportados');
const DO_ARTISTA = JSON.parse(readFileSync(resolve(PASTA, 'mao-taco.json'), 'utf8')) as unknown;

const ARQUIVO = {
  referencial: 'da mão',
  pose_pinca: { tipo: 'cubo_de_giz', centro_m: [-0.03286, 0.11391, -0.007], eixo_n: [0.6926, -0.6488, -0.3152], eixo_e1: [0.6887, 0.7248, 0.0214], aresta_m: 0.022 },
  pose_ponte_v: {
    tipo: 'taco',
    ponto_m: [-0.04071, 0.06, 0.03543],
    direcao_cabo_para_ponta: [-0.0262, 0.9996, 0.0089],
    ponta_a_ponto_m: 0.25,
    comprimento_m: 1.45,
    raio_ponta_m: 0.006,
    raio_cabo_m: 0.015,
  },
};

describe('lerContatos', () => {
  it('lê o formato do artista: o taco vira cilindro, o cubo de giz vira pinça, e a pose perde o prefixo', () => {
    const c = lerContatos(ARQUIVO);
    expect([...c.cilindros.keys()]).toEqual(['ponte_v']);
    expect([...c.pincas.keys()]).toEqual(['pinca']);
    const cil = c.cilindros.get('ponte_v')!;
    expect(cil.ponto).toEqual([-0.04071, 0.06, 0.03543]);
    expect(cil.distanciaDoFim).toBe(0.25);
    expect(c.pincas.get('pinca')!.aresta).toBe(0.022);
  });

  it('o raio no ponto vem do fim fino ao largo, pela distância ao fim fino', () => {
    const cil = lerContatos(ARQUIVO).cilindros.get('ponte_v')!;
    expect(raioNoPonto(cil)).toBeCloseTo(0.006 + (0.009 * 0.25) / 1.45, 9);
  });

  it('aceita os nomes genéricos cilindro e cubo', () => {
    const c = lerContatos({ a: { ...ARQUIVO.pose_ponte_v, tipo: 'cilindro' }, b: { ...ARQUIVO.pose_pinca, tipo: 'cubo' } });
    expect(c.cilindros.has('a')).toBe(true);
    expect(c.pincas.has('b')).toBe(true);
  });

  it('lança dizendo o campo quando algo está errado', () => {
    expect(() => lerContatos(null)).toThrow(/objeto/);
    expect(() => lerContatos({ a: { ...ARQUIVO.pose_ponte_v, ponto_m: [1, 2] } })).toThrow(/a\.ponto_m/);
    expect(() => lerContatos({ a: { ...ARQUIVO.pose_ponte_v, direcao_cabo_para_ponta: [0, 0, 3] } })).toThrow(/unitário/);
    expect(() => lerContatos({ a: { ...ARQUIVO.pose_pinca, aresta_m: 'x' } })).toThrow(/a\.aresta_m/);
    expect(() => lerContatos({ a: { tipo: 'esfera' } })).toThrow(/esfera/);
  });

  it('entradas sem tipo (o cabeçalho do arquivo) são ignoradas', () => {
    expect(lerContatos({ referencial: 'x', versao: 2 }).cilindros.size).toBe(0);
  });

  it('o taco leva o apoio, a elevação e a altura do eixo ao plano (m) quando o arquivo traz', () => {
    const c = lerContatos(DO_ARTISTA);
    const v = c.cilindros.get('ponte_v')!;
    expect(v.elevacaoGraus).toBeCloseTo(-0.5, 6);
    expect(v.alturaDoEixoAoPlano!.noPonto).toBeCloseTo(0.0657, 6);
    expect(v.alturaDoEixoAoPlano!.naFim).toBeCloseTo(0.0679, 6);
    expect(v.apoio!.tipo).toBe('pano');
    expect(v.apoio!.normal).toEqual([0, 0, 1]);
    expect(v.apoio!.toca).toEqual(['anelar', 'indicador', 'medio', 'minimo']);
    expect(c.cilindros.get('ponte_tabela')!.apoio!.tipo).toBe('madeira');
    expect(c.cilindros.get('ponte_elevada')!.elevacaoGraus).toBeCloseTo(22.9, 6);
    expect(c.cilindros.get('punho')!.apoio).toBeUndefined();
    expect(c.cilindros.get('punho')!.elevacaoGraus).toBeUndefined();
  });

  it('os contatos dos gestos (o tapinha e as palmas) saem à parte, com o plano e os quadros', () => {
    const c = lerContatos(DO_ARTISTA);
    expect([...c.gestos.keys()].sort()).toEqual(['palmas', 'tapinha']);
    const tapinha = c.gestos.get('tapinha')!;
    expect(tapinha.quadros).toEqual([11, 20]);
    expect(tapinha.planoNormal).toEqual([0, 0, 1]);
    expect(tapinha.planoValor).toBeCloseTo(-0.07044, 6);
    expect(tapinha.ponto[2]).toBeCloseTo(-0.07044, 6);
    const palmas = c.gestos.get('palmas')!;
    expect(palmas.quadros).toEqual([8, 16, 24]);
    expect(palmas.normalDaPalma).toEqual([-1, 0, 0]);
    expect(palmas.ponto[0]).toBeCloseTo(-0.02533, 6);
    expect(palmas.pontos).toHaveLength(3);
  });

  it('o contato de um gesto com campo errado lança dizendo qual', () => {
    const base = { tipo: 'contato', quadros: [3], ponto_m: [0, 0, 0], pontos_m: [[0, 0, 0]], plano: { normal: [0, 0, 1], valor_m: 0 }, normal_da_palma: [0, 0, 1] };
    expect(lerContatos({ gesto_x: base }).gestos.has('x')).toBe(true);
    expect(() => lerContatos({ gesto_x: { ...base, quadros: 'a' } })).toThrow(/gesto_x\.quadros/);
    expect(() => lerContatos({ gesto_x: { ...base, plano: { normal: [0, 0], valor_m: 0 } } })).toThrow(/gesto_x\.plano\.normal/);
  });
});
