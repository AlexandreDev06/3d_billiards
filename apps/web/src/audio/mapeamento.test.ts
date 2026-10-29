import { describe, expect, it } from 'vitest';
import type { EventoTacada } from '@sinuca/fisica';
import { CONFIG_WEB, type ConfigAudio } from '../config';
import { pedidoDeAviso, pedidoDoEvento, pedidoDoMenu, SONS_DE_AVISO, SONS_DO_MENU, tomDaVelocidade, volumeDaVelocidade } from './mapeamento';

const CFG: ConfigAudio = {
  volumeGeral: 0.8,
  maxVozes: 8,
  velocidadeMudo: 0.05,
  velocidadeCheia: 5,
  volumeMin: 0.1,
  expoenteVolume: 1,
  tomMin: 0.8,
  tomMax: 1.2,
  volumeCacapa: 0.6,
  amostras: CONFIG_WEB.audio.amostras,
  avisos: CONFIG_WEB.audio.avisos,
};

describe('volumeDaVelocidade', () => {
  it('abaixo da velocidade de mudo o impacto é inaudível', () => {
    expect(volumeDaVelocidade(0.049, CFG)).toBe(0);
    expect(volumeDaVelocidade(0, CFG)).toBe(0);
  });

  it('o impacto mais fraco audível já soa no volume mínimo', () => {
    expect(volumeDaVelocidade(0.05, CFG)).toBeCloseTo(CFG.volumeMin + (1 - CFG.volumeMin) * 0.01, 9);
  });

  it('cresce com a velocidade e chega a 1 na velocidade cheia, sem passar', () => {
    const fraco = volumeDaVelocidade(1, CFG);
    const medio = volumeDaVelocidade(2.5, CFG);
    expect(fraco).toBeLessThan(medio);
    expect(volumeDaVelocidade(5, CFG)).toBeCloseTo(1, 9);
    expect(volumeDaVelocidade(50, CFG)).toBe(1);
  });

  it('expoente menor que 1 abre os impactos fracos', () => {
    const aberto = volumeDaVelocidade(1, { ...CFG, expoenteVolume: 0.5 });
    expect(aberto).toBeGreaterThan(volumeDaVelocidade(1, CFG));
  });

  it('velocidade inválida (NaN, negativa) não toca', () => {
    expect(volumeDaVelocidade(Number.NaN, CFG)).toBe(0);
    expect(volumeDaVelocidade(-3, CFG)).toBe(0);
  });
});

describe('tomDaVelocidade', () => {
  it('vai do tom mínimo ao máximo e fica nos extremos fora da faixa', () => {
    expect(tomDaVelocidade(0, CFG)).toBeCloseTo(0.8, 9);
    expect(tomDaVelocidade(2.5, CFG)).toBeCloseTo(1, 9);
    expect(tomDaVelocidade(5, CFG)).toBeCloseTo(1.2, 9);
    expect(tomDaVelocidade(99, CFG)).toBeCloseTo(1.2, 9);
  });

  it('velocidade inválida cai no tom mínimo', () => {
    expect(tomDaVelocidade(Number.NaN, CFG)).toBeCloseTo(0.8, 9);
  });
});

describe('pedidoDoEvento', () => {
  it('taco-bola, bola-bola e bola-tabela viram o som do mesmo nome, com volume e tom da velocidade', () => {
    const tacoBola: EventoTacada = { tipo: 'taco-bola', t: 0, bola: 0, velocidade: 5, miscue: false };
    const bolaBola: EventoTacada = { tipo: 'bola-bola', t: 0.1, a: 0, b: 3, velocidade: 2.5 };
    const bolaTabela: EventoTacada = { tipo: 'bola-tabela', t: 0.2, bola: 3, tabela: 1, parte: 'nariz', velocidade: 1 };
    expect(pedidoDoEvento(tacoBola, CFG)).toEqual({ som: 'taco-bola', volume: 1, tom: tomDaVelocidade(5, CFG), intensidade: 1 });
    expect(pedidoDoEvento(bolaBola, CFG)).toEqual({
      som: 'bola-bola',
      volume: volumeDaVelocidade(2.5, CFG),
      tom: tomDaVelocidade(2.5, CFG),
      intensidade: 0.5,
    });
    expect(pedidoDoEvento(bolaTabela, CFG)).toEqual({
      som: 'bola-tabela',
      volume: volumeDaVelocidade(1, CFG),
      tom: tomDaVelocidade(1, CFG),
      intensidade: 0.2,
    });
  });

  it('a intensidade é a velocidade sobre a cheia, entre 0 e 1 (o que escolhe a variação da amostra)', () => {
    const doImpacto = (velocidade: number) => pedidoDoEvento({ tipo: 'bola-bola', t: 0, a: 1, b: 2, velocidade }, CFG)!.intensidade;
    expect(doImpacto(0)).toBe(0);
    expect(doImpacto(1)).toBeCloseTo(0.2, 9);
    expect(doImpacto(50)).toBe(1);
    expect(doImpacto(Number.NaN)).toBe(0);
  });

  it('a caçapa toca no volume fixo, no tom do meio da faixa, e sorteia entre as duas variações (intensidade no meio)', () => {
    const cacapa: EventoTacada = { tipo: 'cacapa', t: 1, bola: 4, cacapa: 'canto-1' };
    expect(pedidoDoEvento(cacapa, CFG)).toEqual({ som: 'cacapa', volume: 0.6, tom: 1, intensidade: 0.5 });
  });

  it('parou e fora-da-mesa não têm som', () => {
    expect(pedidoDoEvento({ tipo: 'parou', t: 3 }, CFG)).toBeNull();
    expect(pedidoDoEvento({ tipo: 'fora-da-mesa', t: 1, bola: 2 }, CFG)).toBeNull();
  });

  it('impacto inaudível ainda vira pedido, com volume 0, para o contador distinguir de "sem som"', () => {
    const leve: EventoTacada = { tipo: 'bola-bola', t: 0.5, a: 1, b: 2, velocidade: 0.01 };
    expect(pedidoDoEvento(leve, CFG)).toMatchObject({ som: 'bola-bola', volume: 0 });
  });
});

describe('pedidoDeAviso', () => {
  it('toca no volume cheio e sem mudar o tom: quem decide o resto é o ganho do arquivo e o volume geral', () => {
    for (const som of SONS_DE_AVISO) expect(pedidoDeAviso(som)).toEqual({ som, volume: 1, tom: 1, intensidade: 0.5 });
  });

  it('são três: vez de outro, a sua vez e tempo esgotado', () => {
    expect([...SONS_DE_AVISO].sort()).toEqual(['moedas', 'tempo-esgotado', 'vez-outro', 'vez-sua']);
  });
});

describe('pedidoDoMenu (L40)', () => {
  it('são dois sons, no volume cheio e sem mudar o tom', () => {
    expect([...SONS_DO_MENU].sort()).toEqual(['menu-clique', 'menu-passa']);
    for (const som of SONS_DO_MENU) expect(pedidoDoMenu(som)).toEqual({ som, volume: 1, tom: 1, intensidade: 0.5 });
  });

  it('os sons do menu não entram na lista dos avisos do jogo (não têm amostra)', () => {
    for (const som of SONS_DO_MENU) expect((SONS_DE_AVISO as readonly string[]).includes(som)).toBe(false);
  });
});
