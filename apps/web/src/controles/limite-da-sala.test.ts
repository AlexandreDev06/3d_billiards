import { describe, expect, it } from 'vitest';
import { fracaoDentroDaSala, raioMaximoNaDirecao } from './limite-da-sala';

const SALA = { xMax: 2.7, zMax: 2.25, yMax: 2.3 };

describe('fracaoDentroDaSala', () => {
  it('destino dentro: anda tudo', () => {
    expect(fracaoDentroDaSala({ x: 0, y: 0.3, z: 0 }, { x: 1, y: 1, z: -1 }, SALA)).toBe(1);
  });

  it('para na parede: o ponto da fração fica exatamente no limite', () => {
    const a = { x: 0, y: 0.5, z: 0 };
    const b = { x: 5.4, y: 0.5, z: 0 };
    expect(fracaoDentroDaSala(a, b, SALA)).toBeCloseTo(0.5, 9);
    const c = { x: 0, y: 0.5, z: -4.5 };
    expect(fracaoDentroDaSala(a, c, SALA)).toBeCloseTo(0.5, 9);
  });

  it('o eixo que mais aperta manda, e o teto também vale', () => {
    const a = { x: 0, y: 0.5, z: 0 };
    expect(fracaoDentroDaSala(a, { x: 5.4, y: 0.5, z: 4.5 }, SALA)).toBeCloseTo(0.5, 9);
    expect(fracaoDentroDaSala(a, { x: 0, y: 4.1, z: 0 }, SALA)).toBeCloseTo((2.3 - 0.5) / (4.1 - 0.5), 9);
    expect(fracaoDentroDaSala(a, { x: 10, y: 0.5, z: 0 }, SALA)).toBeCloseTo(0.27, 9);
  });

  it('partindo de fora (a âncora encostada), não anda para fora e nunca dá negativo', () => {
    expect(fracaoDentroDaSala({ x: 2.8, y: 0.5, z: 0 }, { x: 3.5, y: 0.5, z: 0 }, SALA)).toBe(0);
    expect(fracaoDentroDaSala({ x: 2.8, y: 0.5, z: 0 }, { x: 0, y: 0.5, z: 0 }, SALA)).toBe(1);
  });
});

describe('raioMaximoNaDirecao', () => {
  it('na horizontal, o limite do eixo para onde a câmera olha', () => {
    expect(raioMaximoNaDirecao(0, 0, SALA)).toBeCloseTo(2.7, 9);
    expect(raioMaximoNaDirecao(Math.PI / 2, 0, SALA)).toBeCloseTo(2.25, 9);
    expect(raioMaximoNaDirecao(Math.PI, 0, SALA)).toBeCloseTo(2.7, 9);
  });

  it('na diagonal o canto fica mais perto do que a parede', () => {
    const raio = raioMaximoNaDirecao(Math.PI / 4, 0, SALA);
    expect(raio).toBeCloseTo(2.25 / Math.sin(Math.PI / 4), 9);
    expect(raio * Math.cos(Math.PI / 4)).toBeLessThanOrEqual(2.7);
  });

  it('para cima o teto limita; para baixo (elevação negativa) o piso não conta', () => {
    expect(raioMaximoNaDirecao(0, Math.PI / 2, SALA)).toBeCloseTo(2.3, 9);
    expect(raioMaximoNaDirecao(0, -0.3, SALA)).toBeCloseTo(2.7 / Math.cos(0.3), 9);
  });

  it('o ponto no raio máximo está sempre dentro da sala', () => {
    for (let az = 0; az < Math.PI * 2; az += 0.37) {
      for (let el = -0.4; el < 1.5; el += 0.23) {
        const r = raioMaximoNaDirecao(az, el, SALA);
        expect(Math.abs(r * Math.cos(el) * Math.cos(az))).toBeLessThanOrEqual(SALA.xMax + 1e-9);
        expect(Math.abs(r * Math.cos(el) * Math.sin(az))).toBeLessThanOrEqual(SALA.zMax + 1e-9);
        expect(r * Math.sin(el)).toBeLessThanOrEqual(SALA.yMax + 1e-9);
      }
    }
  });
});
