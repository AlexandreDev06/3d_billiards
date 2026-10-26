import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { Ociosidade } from './ociosidade';

const ocio = CONFIG_WEB.maos.vida.ocio;
const PASSO = 0.1;

/** Anda `s` segundos com a mira parada (as mesmas medidas) e as mãos em cena. */
function parado(o: Ociosidade, s: number, angulo = 0.3): void {
  for (let t = 0; t < s - 1e-9; t += PASSO) o.atualizar(PASSO, true, angulo, 0.03, 0, 0);
}

describe('Ociosidade: a mão de trás tamborila quando a mira fica parada', () => {
  it('nasce sem tamborilar e só começa depois de `aposS` de mira parada', () => {
    const o = new Ociosidade(ocio);
    expect(o.tamborilando).toBe(false);
    parado(o, ocio.aposS - 0.5);
    expect(o.tamborilando).toBe(false);
    parado(o, 1);
    expect(o.tamborilando).toBe(true);
  });

  it('mexer na mira (o ângulo) para o tamborilar e recomeça a contagem', () => {
    const o = new Ociosidade(ocio);
    parado(o, ocio.aposS + 1);
    expect(o.tamborilando).toBe(true);
    o.atualizar(PASSO, true, 0.31, 0.03, 0, 0);
    expect(o.tamborilando).toBe(false);
    parado(o, ocio.aposS - 0.5, 0.31);
    expect(o.tamborilando).toBe(false);
  });

  it.each([
    ['o recuo', 0.2, 0.03, 0, 0],
    ['o efeito de lado', 0.3, 0.03, 0.2, 0],
    ['o efeito de altura', 0.3, 0.03, 0, 0.2],
  ])('mexer em %s também conta como mexer na mira', (_nome, angulo, recuo, lateral, vertical) => {
    const o = new Ociosidade(ocio);
    parado(o, ocio.aposS + 1);
    o.atualizar(PASSO, true, angulo === 0.2 ? 0.3 : angulo, angulo === 0.2 ? 0.2 : recuo, lateral, vertical);
    expect(o.tamborilando).toBe(false);
  });

  it('um tremor menor que o milésimo de radiano não conta como mexer', () => {
    const o = new Ociosidade(ocio);
    for (let t = 0; t < ocio.aposS + 1; t += PASSO) o.atualizar(PASSO, true, 0.3 + (t % 0.2) * 1e-5, 0.03, 0, 0);
    expect(o.tamborilando).toBe(true);
  });

  it('sem as mãos em cena (outra vez, bolas andando) a contagem zera', () => {
    const o = new Ociosidade(ocio);
    parado(o, ocio.aposS - 1);
    o.atualizar(PASSO, false, 0.3, 0.03, 0, 0);
    parado(o, ocio.aposS - 1);
    expect(o.tamborilando).toBe(false);
    expect(o.segundos).toBeLessThan(ocio.aposS);
  });

  it('o primeiro quadro não conta como mexida (não há medida anterior)', () => {
    const o = new Ociosidade(ocio);
    o.atualizar(ocio.aposS + 1, true, 0.3, 0.03, 0, 0);
    expect(o.tamborilando).toBe(true);
  });
});
