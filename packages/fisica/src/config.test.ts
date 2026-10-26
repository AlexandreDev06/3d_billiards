import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, medidasDaBola } from './config';
import { BOLA, BOLAO, MESA_BAR } from './medidas';
import { ID_BOLAO } from './tipos';
import { FOLGA_TRIANGULO } from './triangulo';

describe('CONFIG_FISICA_PADRAO', () => {
  const c = CONFIG_FISICA_PADRAO;

  it('usa as medidas de medidas.ts', () => {
    expect(c.mesa).toBe(MESA_BAR);
    expect(c.bola).toBe(BOLA);
    expect(c.bolao).toBe(BOLAO);
  });

  it('integra com passo fixo de 1/512 s e grava a 60 Hz', () => {
    expect(c.passo).toBe(1 / 512);
    expect(c.frequenciaGravacao).toBe(60);
  });

  it('fica dentro das faixas da skill sinuca-fisica', () => {
    expect(c.atritoDeslizamento).toBeGreaterThanOrEqual(0.15);
    expect(c.atritoDeslizamento).toBeLessThanOrEqual(0.4);
    expect(c.restituicaoBolaBola).toBeGreaterThanOrEqual(0.92);
    expect(c.restituicaoBolaBola).toBeLessThanOrEqual(0.98);
    const atritoBolaBola = (v: number) =>
      c.atritoBolaBolaRapido + (c.atritoBolaBolaLento - c.atritoBolaBolaRapido) * Math.exp(-c.atritoBolaBolaQueda * v);
    expect(atritoBolaBola(0.5)).toBeGreaterThanOrEqual(0.03);
    expect(atritoBolaBola(1)).toBeLessThanOrEqual(0.08);
    expect(c.restituicaoBolaTabela).toBeGreaterThanOrEqual(0.6);
    expect(c.restituicaoBolaTabela).toBeLessThanOrEqual(0.9);
  });

  it('pano de bar mais lento que o de referência (pedido do usuário, 2026-10-09): rolamento 0,02, giro 20 rad/s², efeito lateral × 0,6', () => {
    // O dobro do 0,01 do Dr. Dave (faixa 0,005–0,015): "a bola está indo muito rápido".
    expect(c.atritoRolamento).toBeCloseTo(0.02, 12);
    // "Quando dá efeito, a bola branca roda muito rápido": giro acima da faixa do Dr. Dave (5–15 rad/s²)
    // e 0,6 do deslocamento lateral do mini-bolão no contato (.outros/lote-11/giro-dev.txt).
    expect(c.desaceleracaoGiro).toBe(20);
    expect(c.fatorEfeitoLateral).toBeCloseTo(0.6, 12);
  });

  it('tabela devolve como no pooltool: restituição 0,85 (decisão do L2)', () => {
    expect(c.restituicaoBolaTabela).toBeCloseTo(0.85, 12);
  });

  it('limita o efeito seguro: sem giz menor que com giz', () => {
    expect(c.limiteEfeitoComGiz).toBeCloseTo(0.5, 12);
    expect(c.limiteEfeitoSemGiz).toBeCloseTo(0.3, 12);
  });

  it('janela de choque simultâneo de 0,1 ms: cobre as folgas do triângulo na quebra', () => {
    expect(c.janelaChoqueSimultaneo).toBeCloseTo(1e-4, 12);
    // Folga entre vizinhas até 3 × FOLGA_TRIANGULO, fechada a ~9 m/s (a bola da frente depois do bolão).
    expect((3 * FOLGA_TRIANGULO) / 9).toBeLessThan(c.janelaChoqueSimultaneo);
  });

  it('taco chega a cerca de 8 m/s', () => {
    expect(c.velocidadeMaxTaco).toBeCloseTo(8, 0);
  });
});

describe('medidasDaBola', () => {
  it('0 é o bolão; 1 a 15 são bolas', () => {
    expect(medidasDaBola(ID_BOLAO)).toBe(BOLAO);
    for (let id = 1; id <= 15; id++) expect(medidasDaBola(id)).toBe(BOLA);
  });
});
