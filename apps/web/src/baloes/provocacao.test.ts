import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { ProvocacaoDoBalao } from './provocacao';

const cfg = CONFIG_WEB.baloes.rosto;
const nova = (): ProvocacaoDoBalao => new ProvocacaoDoBalao(cfg);
/** Arma e já deixa o balão à vista: devolve se ele riu. */
const provocarJa = (p: ProvocacaoDoBalao, motivo: 'falta' | 'erro', agoraS: number, equipe = 1): boolean => p.armar(motivo, equipe, agoraS) && p.disparar(equipe, agoraS + 0.5, 1);

describe('ProvocacaoDoBalao (quem joga contra o dono errou e o balão está à vista)', () => {
  it('a falta de quem joga contra ele provoca sempre, vez após vez', () => {
    const p = nova();
    for (let i = 0; i < 5; i++) expect(provocarJa(p, 'falta', i * 3), `falta ${i}`).toBe(true);
  });

  it('o erro simples (a bola não caiu) provoca no máximo uma vez a cada provocacaoNoErroEntreS de partida', () => {
    const p = nova();
    expect(provocarJa(p, 'erro', 10)).toBe(true);
    expect(provocarJa(p, 'erro', 10 + cfg.provocacaoNoErroEntreS - 1)).toBe(false);
    expect(provocarJa(p, 'erro', 10 + cfg.provocacaoNoErroEntreS + 1)).toBe(true);
    expect(provocarJa(p, 'erro', 10 + cfg.provocacaoNoErroEntreS + 5)).toBe(false);
  });

  it('a falta não gasta a janela do erro simples, e o erro simples não impede a falta', () => {
    const p = nova();
    expect(provocarJa(p, 'falta', 10)).toBe(true);
    expect(provocarJa(p, 'erro', 12)).toBe(true);
    expect(provocarJa(p, 'falta', 14)).toBe(true);
  });

  it('só gasta a janela quando o balão ri de verdade: o pedido que venceu sem o balão aparecer não conta', () => {
    const p = nova();
    expect(p.armar('erro', 1, 10)).toBe(true);
    expect(p.disparar(1, 10 + cfg.provocacaoValeS + 1, 1)).toBe(false);
    expect(provocarJa(p, 'erro', 12 + cfg.provocacaoValeS)).toBe(true);
  });

  it('espera o balão aparecer (a escala passar de provocacaoEscala) e dispara uma vez só', () => {
    const p = nova();
    p.armar('falta', 1, 10);
    expect(p.disparar(1, 10.2, cfg.provocacaoEscala - 0.1)).toBe(false);
    expect(p.disparar(1, 10.4, cfg.provocacaoEscala + 0.1)).toBe(true);
    expect(p.disparar(1, 10.6, 1)).toBe(false);
  });

  it('vale só até provocacaoValeS depois de armar', () => {
    const p = nova();
    p.armar('falta', 1, 10);
    expect(p.disparar(1, 10 + cfg.provocacaoValeS + 0.1, 1)).toBe(false);
  });

  it('é do balão da equipe que ficou com a vez: o balão de outra equipe não ri', () => {
    const p = nova();
    p.armar('falta', 1, 10);
    expect(p.disparar(0, 10.5, 1)).toBe(false);
    expect(p.disparar(1, 10.6, 1)).toBe(true);
  });

  it('cancelar tira o pedido que esperava (o dono saiu, a partida acabou); reiniciar zera também a janela do erro', () => {
    const p = nova();
    p.armar('falta', 1, 10);
    p.cancelar();
    expect(p.disparar(1, 10.5, 1)).toBe(false);
    expect(provocarJa(p, 'erro', 20)).toBe(true);
    p.cancelar();
    expect(provocarJa(p, 'erro', 30)).toBe(false);
    p.reiniciar();
    expect(provocarJa(p, 'erro', 31)).toBe(true);
  });

  it('sem armar, nunca dispara', () => {
    expect(nova().disparar(1, 5, 1)).toBe(false);
  });
});
