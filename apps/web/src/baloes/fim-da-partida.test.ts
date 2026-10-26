import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { FimDaPartida, lugaresDoFim, quadroDoFim } from './fim-da-partida';

const FIM = CONFIG_WEB.baloes.fim;

describe('lugaresDoFim', () => {
  it('põe os balões no fundo e nas pontas, nunca do lado da câmera', () => {
    for (const n of [2, 3, 4]) {
      const lugares = lugaresDoFim(n, 1.4, 0.75, 0.3);
      expect(lugares).toHaveLength(n);
      for (const l of lugares) expect(l.z).toBeLessThan(0);
    }
  });

  it('abre a elipse além da moldura e espalha da esquerda para a direita', () => {
    const l = lugaresDoFim(4, 1.4, 0.75, 0.3);
    for (const p of l) expect((p.x / 1.7) ** 2 + (p.z / 1.05) ** 2).toBeCloseTo(1, 6);
    for (let i = 1; i < l.length; i++) expect(l[i]!.x).toBeGreaterThan(l[i - 1]!.x);
    expect(l[0]!.x).toBeLessThan(-1.5);
    expect(l[3]!.x).toBeGreaterThan(1.5);
  });

  it('com três, o do meio fica no centro do fundo', () => {
    expect(lugaresDoFim(3, 1.4, 0.75, 0.3)[1]!.x).toBeCloseTo(0, 6);
  });
});

describe('quadroDoFim', () => {
  it('todos entram juntos, do mesmo tamanho e de cara neutra, antes de estufar ou murchar', () => {
    const a = quadroDoFim(true, 1, FIM.entraS / 2, FIM);
    const b = quadroDoFim(false, 1, FIM.entraS / 2, FIM);
    expect(a.escala).toBeGreaterThan(0);
    expect(a.escala).toBeLessThan(1);
    expect(a.escala).toBeCloseTo(b.escala, 12);
    expect([a.largura, a.altura, b.largura, b.altura]).toEqual([1, 1, 1, 1]);
    expect([a.cara, b.cara]).toEqual(['neutro', 'neutro']);
  });

  it('quem ganhou estufa passando um pouco do tamanho, assenta e sorri', () => {
    const picos: number[] = [];
    for (let t = FIM.entraS; t <= FIM.entraS + FIM.viraS; t += 0.02) picos.push(quadroDoFim(true, 1, t, FIM).altura);
    expect(Math.max(...picos)).toBeGreaterThan(FIM.estufa.altura);
    const assentado = quadroDoFim(true, 1, FIM.entraS + FIM.viraS, FIM);
    expect(assentado.altura).toBeCloseTo(FIM.estufa.altura, 6);
    expect(assentado.largura).toBeCloseTo(FIM.estufa.largura, 6);
    expect(assentado.cara).toBe('sorriso');
    expect(assentado.caida).toBe(0);
    expect(assentado.descida).toBe(0);
  });

  it('depois de assentar quem ganhou pulsa de leve, sem passar da amplitude', () => {
    for (let t = FIM.entraS + FIM.viraS; t <= FIM.duracaoS; t += 0.05) {
      const q = quadroDoFim(true, 1, t, FIM);
      expect(Math.abs(q.altura - FIM.estufa.altura)).toBeLessThanOrEqual(FIM.estufa.pulso + 1e-9);
    }
  });

  it('quem perdeu murcha, pende para o lado pedido, desce e fica triste', () => {
    const fim = quadroDoFim(false, -1, FIM.entraS + FIM.viraS, FIM);
    expect(fim.altura).toBeCloseTo(FIM.murcha.altura, 6);
    expect(fim.largura).toBeCloseTo(FIM.murcha.largura, 6);
    expect(fim.caida).toBeCloseTo(-FIM.murcha.caida, 6);
    expect(fim.descida).toBeCloseTo(FIM.murcha.descida, 6);
    expect(fim.cara).toBe('triste');
    expect(quadroDoFim(false, 1, FIM.duracaoS, FIM).caida).toBeGreaterThan(0);
  });

  it('o murchar só vai em um sentido: nunca cresce de volta', () => {
    let anterior = Infinity;
    for (let t = FIM.entraS; t <= FIM.duracaoS; t += 0.02) {
      const h = quadroDoFim(false, 1, t, FIM).altura;
      expect(h).toBeLessThanOrEqual(anterior + 1e-12);
      anterior = h;
    }
  });

  it('reaproveita o objeto de saída', () => {
    const saida = quadroDoFim(true, 1, 0, FIM);
    expect(quadroDoFim(false, 1, 1, FIM, saida)).toBe(saida);
  });
});

describe('FimDaPartida', () => {
  it('conta o tempo do começo e acaba na duração', () => {
    const fim = new FimDaPartida();
    expect(fim.existe).toBe(false);
    fim.iniciar(1000, [true, false]);
    expect(fim.existe).toBe(true);
    expect(fim.equipes).toBe(2);
    expect(fim.ganhou(0)).toBe(true);
    expect(fim.ganhou(1)).toBe(false);
    expect(fim.ativo(1000 + 500, 2.4)).toBe(true);
    expect(fim.tempoS(1000 + 500, 2.4)).toBeCloseTo(0.5, 9);
    expect(fim.ativo(1000 + 2400, 2.4)).toBe(false);
    expect(fim.tempoS(1000 + 9000, 2.4)).toBe(2.4);
    expect(fim.existe).toBe(true);
  });

  it('pular acaba já e o tempo vai ao fim do roteiro', () => {
    const fim = new FimDaPartida();
    fim.iniciar(0, [true, false]);
    fim.pular();
    expect(fim.ativo(100, 2.4)).toBe(false);
    expect(fim.tempoS(100, 2.4)).toBe(2.4);
  });

  it('pular sem roteiro não faz nada, e cancelar esquece tudo', () => {
    const fim = new FimDaPartida();
    fim.pular();
    expect(fim.existe).toBe(false);
    fim.iniciar(0, [false, true]);
    fim.cancelar();
    expect(fim.existe).toBe(false);
    expect(fim.equipes).toBe(0);
    expect(fim.ativo(10, 2.4)).toBe(false);
  });

  it('fixar para o relógio: o roteiro fica no instante pedido e não acaba até soltar', () => {
    const fim = new FimDaPartida();
    fim.iniciar(0, [true, false]);
    fim.fixar(1.2);
    expect(fim.tempoS(99_000, 2.4)).toBe(1.2);
    expect(fim.ativo(99_000, 2.4)).toBe(true);
    fim.fixar(null);
    expect(fim.ativo(99_000, 2.4)).toBe(false);
    expect(fim.tempoS(99_000, 2.4)).toBe(2.4);
  });

  it('pular vale mesmo com o relógio fixo', () => {
    const fim = new FimDaPartida();
    fim.iniciar(0, [true, false]);
    fim.fixar(0.5);
    fim.pular();
    expect(fim.ativo(0, 2.4)).toBe(false);
    expect(fim.tempoS(0, 2.4)).toBe(2.4);
  });
});
