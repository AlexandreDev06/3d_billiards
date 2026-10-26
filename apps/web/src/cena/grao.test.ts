import { describe, expect, it } from 'vitest';
import { criarRng } from '@sinuca/fisica';
import { campoDeAltura, mapaDeNormais, ruidoPeriodico, tabuasDaMoldura } from './grao';

describe('ruidoPeriodico', () => {
  it('fica entre 0 e 1 e repete a cada volta (a emenda da textura não aparece)', () => {
    const ruido = ruidoPeriodico(criarRng(7), 8);
    for (let k = 0; k < 200; k++) {
      const u = k / 200;
      const v = ((k * 37) % 200) / 200;
      expect(ruido(u, v)).toBeGreaterThanOrEqual(0);
      expect(ruido(u, v)).toBeLessThanOrEqual(1);
    }
    for (let k = 0; k < 20; k++) {
      const t = k / 20;
      expect(Math.abs(ruido(1 - 1e-9, t) - ruido(0, t))).toBeLessThan(1e-6);
      expect(Math.abs(ruido(t, 1 - 1e-9) - ruido(t, 0))).toBeLessThan(1e-6);
    }
  });

  it('é determinístico pela semente e muda com ela', () => {
    const a = ruidoPeriodico(criarRng(1), 8)(0.3, 0.6);
    expect(ruidoPeriodico(criarRng(1), 8)(0.3, 0.6)).toBe(a);
    expect(ruidoPeriodico(criarRng(2), 8)(0.3, 0.6)).not.toBe(a);
  });
});

describe('campoDeAltura e mapaDeNormais', () => {
  it('o campo tem lado × lado valores finitos e não é plano', () => {
    const altura = campoDeAltura(64, criarRng(3));
    expect(altura).toHaveLength(64 * 64);
    expect(altura.every((v) => Number.isFinite(v))).toBe(true);
    expect(Math.max(...altura) - Math.min(...altura)).toBeGreaterThan(0.1);
  });

  it('altura plana dá normal para cima (128, 128, 255)', () => {
    const rgba = mapaDeNormais(new Float32Array(16).fill(0.5), 4, 2);
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([128, 128, 255, 255]);
  });

  it('rampa que sobe em +x inclina a normal para -x (R abaixo de 128, B ainda alto)', () => {
    const lado = 8;
    const altura = new Float32Array(lado * lado);
    for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) altura[y * lado + x] = x < lado / 2 ? 0 : 1;
    const rgba = mapaDeNormais(altura, lado, 2);
    const i = (3 * lado + lado / 2) * 4; // logo na quina da subida
    expect(rgba[i]).toBeLessThan(110);
    expect(rgba[i + 2]).toBeGreaterThan(150);
  });
});

describe('tabuasDaMoldura', () => {
  const area = (p: readonly { x: number; z: number }[]): number =>
    Math.abs(p.reduce((soma, a, i) => soma + (a.x * p[(i + 1) % p.length]!.z - p[(i + 1) % p.length]!.x * a.z), 0)) / 2;

  it('quatro tábuas em esquadria que cobrem a moldura sem sobrepor', () => {
    const tabuas = tabuasDaMoldura(1.17, 0.72, 0.08);
    expect(tabuas).toHaveLength(4);
    const moldura = 4 * 1.17 * 0.72 - 4 * (1.17 - 0.08) * (0.72 - 0.08);
    expect(tabuas.reduce((soma, t) => soma + area(t.pontos), 0)).toBeCloseTo(moldura, 9);
    expect(tabuas.filter((t) => t.vertical)).toHaveLength(2);
  });
});
