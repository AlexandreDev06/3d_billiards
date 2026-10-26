import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { PoeiraDeGiz } from './poeira-de-giz';

const CFG = CONFIG_WEB.maos.giz.poeira;

/** Um sorteio repetível (congruencial simples). */
function sorteio(semente = 7): () => number {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('PoeiraDeGiz', () => {
  it('sem capacidade (qualidade baixa) não solta pó nenhum', () => {
    const p = new PoeiraDeGiz(CFG, 0, sorteio());
    p.emitir(1, 0, 0, 0, 1, 0, 0);
    p.atualizar(0.1);
    expect(p.capacidade).toBe(0);
    expect(p.vivas).toBe(0);
  });

  it('solta a razão pedida por segundo, guardando o resto de um quadro para o outro', () => {
    const p = new PoeiraDeGiz({ ...CFG, porSegundo: 30 }, 100, sorteio());
    for (let i = 0; i < 60; i++) p.emitir(1 / 60, 0, 0.03, 0, 1, 0, 0);
    expect(p.vivas).toBeGreaterThanOrEqual(29);
    expect(p.vivas).toBeLessThanOrEqual(30);
  });

  it('as partículas nascem junto do ponto e abrem em volta do eixo, não ao longo dele', () => {
    const p = new PoeiraDeGiz({ ...CFG, porSegundo: 300 }, 60, sorteio());
    p.emitir(0.1, 1, 0.5, -2, 1, 0, 0);
    for (let i = 0; i < p.capacidade; i++) {
      if (p.vida[i]! <= 0) continue;
      expect(Math.hypot(p.x[i]! - 1, p.y[i]! - 0.5, p.z[i]! + 2)).toBeLessThanOrEqual(0.0041);
    }
    p.atualizar(0.2);
    let abriu = 0;
    for (let i = 0; i < p.capacidade; i++) if (p.vida[i]! > 0 && Math.hypot(p.y[i]! - 0.5, p.z[i]! + 2) > 0.003) abriu++;
    expect(abriu).toBeGreaterThan(p.vivas * 0.6);
  });

  it('cada uma envelhece, cresce, some e libera o lugar', () => {
    const p = new PoeiraDeGiz({ ...CFG, porSegundo: 20 }, 40, sorteio());
    p.emitir(0.1, 0, 0, 0, 1, 0, 0);
    expect(p.vivas).toBeGreaterThan(0);
    const i = [...p.vida].findIndex((v) => v > 0);
    const t0 = p.tamanho(i);
    p.atualizar(0.3);
    expect(p.tamanho(i)).toBeGreaterThan(t0);
    expect(p.tamanho(i)).toBeLessThanOrEqual(CFG.tamanhoM[1]);
    p.atualizar(CFG.vidaS[1] + 0.1);
    expect(p.vivas).toBe(0);
    expect(p.opacidade(i)).toBe(0);
    expect(p.tamanho(i)).toBe(0);
  });

  it('a opacidade sobe depressa, passa do pico e vai a zero no fim', () => {
    const p = new PoeiraDeGiz({ ...CFG, porSegundo: 10, vidaS: [1, 1] }, 4, sorteio());
    p.emitir(0.1, 0, 0, 0, 1, 0, 0);
    const i = [...p.vida].findIndex((v) => v > 0);
    expect(p.opacidade(i)).toBe(0);
    p.atualizar(0.1);
    const cedo = p.opacidade(i);
    p.atualizar(0.5);
    const meio = p.opacidade(i);
    p.atualizar(0.35);
    const tarde = p.opacidade(i);
    expect(cedo).toBeGreaterThan(0.3);
    expect(meio).toBeGreaterThan(tarde);
    expect(tarde).toBeGreaterThan(0);
    expect(tarde).toBeLessThan(0.1);
  });

  it('com a reserva cheia reusa as mais velhas, sem passar da capacidade', () => {
    const p = new PoeiraDeGiz({ ...CFG, porSegundo: 1000 }, 8, sorteio());
    p.emitir(1, 0, 0, 0, 1, 0, 0);
    expect(p.vivas).toBe(8);
  });

  it('limpar apaga tudo, inclusive o resto de emissão', () => {
    const p = new PoeiraDeGiz({ ...CFG, porSegundo: 30 }, 16, sorteio());
    p.emitir(0.5, 0, 0, 0, 1, 0, 0);
    p.limpar();
    expect(p.vivas).toBe(0);
  });

  it('com o mesmo sorteio o pó é o mesmo', () => {
    const a = new PoeiraDeGiz(CFG, 16, sorteio(3));
    const b = new PoeiraDeGiz(CFG, 16, sorteio(3));
    for (const p of [a, b]) {
      p.emitir(0.2, 0.1, 0.2, 0.3, 0, 0, 1);
      p.atualizar(0.1);
    }
    expect([...a.x]).toEqual([...b.x]);
    expect([...a.vida]).toEqual([...b.vida]);
  });
});
