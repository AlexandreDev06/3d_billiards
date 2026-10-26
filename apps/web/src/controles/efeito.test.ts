import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { PontoDeContato, limiteSeguro } from './efeito';

const cfg = CONFIG_WEB.efeito;

describe('PontoDeContato', () => {
  it('começa no centro', () => {
    const ponto = new PontoDeContato(cfg);
    expect(ponto.lateral).toBe(0);
    expect(ponto.vertical).toBe(0);
  });

  it('centralizar volta ao centro', () => {
    const ponto = new PontoDeContato(cfg);
    ponto.mover(1, 1, 0.3);
    ponto.centralizar();
    expect(ponto.lateral).toBe(0);
    expect(ponto.vertical).toBe(0);
  });

  it('anda na direção das teclas à velocidade da config', () => {
    const ponto = new PontoDeContato(cfg);
    ponto.mover(1, 0, 0.5);
    expect(ponto.lateral).toBeCloseTo(cfg.velocidade * 0.5, 9);
    ponto.mover(0, -1, 0.25);
    expect(ponto.vertical).toBeCloseTo(-cfg.velocidade * 0.25, 9);
  });

  it('não passa do raio máximo, em nenhuma direção', () => {
    const ponto = new PontoDeContato(cfg);
    ponto.mover(1, 1, 10);
    expect(Math.hypot(ponto.lateral, ponto.vertical)).toBeCloseTo(cfg.raioMaximo, 9);
    expect(ponto.lateral).toBeCloseTo(ponto.vertical, 9);
  });

  it('na diagonal não anda mais rápido que na reta', () => {
    const reta = new PontoDeContato(cfg);
    reta.mover(1, 0, 0.1);
    const diagonal = new PontoDeContato(cfg);
    diagonal.mover(1, 1, 0.1);
    expect(Math.hypot(diagonal.lateral, diagonal.vertical)).toBeCloseTo(reta.lateral, 9);
  });

  it('sem tecla não se mexe', () => {
    const ponto = new PontoDeContato(cfg);
    ponto.mover(0, 0, 1);
    expect(Math.hypot(ponto.lateral, ponto.vertical)).toBe(0);
  });
});

describe('limiteSeguro', () => {
  const { limiteEfeitoComGiz: com, limiteEfeitoSemGiz: sem } = CONFIG_FISICA_PADRAO;

  it('vai do limite sem giz ao limite com giz, linearmente', () => {
    expect(limiteSeguro(1, CONFIG_FISICA_PADRAO)).toBeCloseTo(com, 9);
    expect(limiteSeguro(0, CONFIG_FISICA_PADRAO)).toBeCloseTo(sem, 9);
    expect(limiteSeguro(0.5, CONFIG_FISICA_PADRAO)).toBeCloseTo((com + sem) / 2, 9);
  });

  it('ignora nível fora de [0, 1]', () => {
    expect(limiteSeguro(2, CONFIG_FISICA_PADRAO)).toBeCloseTo(com, 9);
    expect(limiteSeguro(-1, CONFIG_FISICA_PADRAO)).toBeCloseTo(sem, 9);
  });
});
