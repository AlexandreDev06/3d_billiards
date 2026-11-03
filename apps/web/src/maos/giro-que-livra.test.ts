import { describe, expect, it } from 'vitest';
import { peleNaPose } from '@sinuca/personagens';
import { CONFIG_WEB } from '../config';
import { giroQueLivra } from './giro-que-livra';
import { limitesDosDedos } from './limites-dos-dedos';
import { MaoCalibrada } from './mao-calibrada';
import { maoDoArtista } from './para-testes';
import { NOMES_DOS_DEDOS_PLANTADOS } from './plantar-dedos';
import { PONTES, poseDaPonteNomeada } from './pontes';

const cfg = CONFIG_WEB.maos;
const base = await maoDoArtista();
const TOLERANCIA = cfg.ponte.penetracaoNoTaco;
const grau = Math.PI / 180;

describe('giroQueLivra: o giro da mão da ponte com que o taco passa pelo vão', () => {
  it.each(PONTES)('%s: nunca passa do pedido, e com o giro devolvido a pele não entra no taco mais que a tolerância', (nome) => {
    const pose = poseDaPonteNomeada(nome);
    const pedido = 45 * grau;
    const giro = giroQueLivra(base.modelo, pose, pose, cfg.escala, pedido, TOLERANCIA);
    expect(giro).toBeGreaterThanOrEqual(0);
    expect(giro).toBeLessThanOrEqual(pedido + 1e-9);
    if (giro > 0) {
      const mao = new MaoCalibrada(base.modelo, pose, cfg.escala, true, giro);
      expect(mao.penetracaoNoTaco(peleNaPose(base.modelo, pose)).pior).toBeLessThanOrEqual(TOLERANCIA + 1e-9);
    }
  });

  it('sem giro pedido, sem giro', () => {
    const pose = poseDaPonteNomeada('v');
    expect(giroQueLivra(base.modelo, pose, pose, cfg.escala, 0, TOLERANCIA)).toBe(0);
  });

  it('o giro do jogo (45 graus de pedido) só aparece onde o V comporta: nenhuma ponte fica com mais giro do que cabe', () => {
    const v = poseDaPonteNomeada('v');
    const cheio = new MaoCalibrada(base.modelo, v, cfg.escala, true, 45 * grau);
    const entra = cheio.penetracaoNoTaco(peleNaPose(base.modelo, v)).pior;
    const giro = giroQueLivra(base.modelo, v, v, cfg.escala, 45 * grau, TOLERANCIA);
    if (entra > TOLERANCIA) expect(giro).toBeLessThan(45 * grau);
  });
});

describe('limitesDosDedos: até onde cada dedo vai antes de entrar no taco', () => {
  it.each(['v', 'laco'] as const)('%s: o intervalo contém o zero (a pose do artista) e cabe em [-1, 1]', (nome) => {
    const pose = poseDaPonteNomeada(nome);
    const mao = new MaoCalibrada(base.modelo, pose, cfg.escala, true, 0);
    const alcance = (cfg.plantio.alcance * Math.PI) / 180;
    const { min, max } = limitesDosDedos(base.modelo, mao, pose, NOMES_DOS_DEDOS_PLANTADOS, alcance, TOLERANCIA);
    expect(min.length).toBe(NOMES_DOS_DEDOS_PLANTADOS.length);
    for (let i = 0; i < min.length; i++) {
      expect(min[i]).toBeGreaterThanOrEqual(-1);
      expect(min[i]).toBeLessThanOrEqual(0);
      expect(max[i]).toBeGreaterThanOrEqual(0);
      expect(max[i]).toBeLessThanOrEqual(1);
    }
  });
});
