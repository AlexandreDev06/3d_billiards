import { describe, expect, it } from 'vitest';
import { JanelaDeVelocidade } from './janela-velocidade';

describe('JanelaDeVelocidade', () => {
  it('mede a velocidade de avanço (posição diminuindo) em m/s', () => {
    const janela = new JanelaDeVelocidade(50);
    for (let i = 0; i <= 10; i++) janela.registrar(i * 10, 0.2 - i * 0.01);
    expect(janela.velocidade(100)).toBeCloseTo(1, 6);
  });

  it('só olha os últimos 50 ms', () => {
    const janela = new JanelaDeVelocidade(50);
    for (let i = 0; i <= 10; i++) janela.registrar(i * 10, 0.2 - i * 0.001);
    for (let i = 1; i <= 5; i++) janela.registrar(100 + i * 10, 0.19 - i * 0.02);
    expect(janela.velocidade(150)).toBeCloseTo(2, 6);
  });

  it('com uma só amostra na janela, usa a anterior mesmo fora dela', () => {
    const janela = new JanelaDeVelocidade(50);
    janela.registrar(0, 0.1);
    janela.registrar(400, 0);
    expect(janela.velocidade(400)).toBeCloseTo(0.25, 6);
  });

  it('é zero sem duas amostras e negativa quando o taco recua', () => {
    const janela = new JanelaDeVelocidade(50);
    expect(janela.velocidade(0)).toBe(0);
    janela.registrar(0, 0.1);
    expect(janela.velocidade(0)).toBe(0);
    janela.registrar(10, 0.11);
    expect(janela.velocidade(10)).toBeLessThan(0);
  });

  it('continua certa depois de dar a volta no buffer', () => {
    const janela = new JanelaDeVelocidade(50, 8);
    for (let i = 0; i < 100; i++) janela.registrar(i * 10, 1 - i * 0.005);
    expect(janela.velocidade(990)).toBeCloseTo(0.5, 6);
  });

  it('reiniciar esquece tudo', () => {
    const janela = new JanelaDeVelocidade(50);
    janela.registrar(0, 0.1);
    janela.registrar(10, 0);
    janela.reiniciar();
    expect(janela.velocidade(10)).toBe(0);
  });
});
