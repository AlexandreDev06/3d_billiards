import { describe, expect, it } from 'vitest';
import { ajusteDaVistaDeCima, type EntradaVistaDeCima } from './vista-cima';

const BASE: EntradaVistaDeCima = {
  semiX: 1.15,
  semiZ: 0.7,
  campoDeVisaoGraus: 50,
  aspecto: 16 / 9,
  margem: 1.12,
  reservaEsquerda: 0,
  reservaDireita: 0,
  zoom: 1,
};

/** Fração da largura da tela que a mesa ocupa a essa altura. */
const larguraNaTela = (e: EntradaVistaDeCima, altura: number): number => e.semiX / (altura * Math.tan((e.campoDeVisaoGraus * Math.PI) / 360) * e.aspecto);

describe('ajusteDaVistaDeCima', () => {
  it('sem HUD a mesa é encaixada pela altura, na tela larga, sem deslocar o desenho', () => {
    const r = ajusteDaVistaDeCima(BASE);
    expect(r.deslocamento).toBe(0);
    expect(r.altura).toBeCloseTo((0.7 / Math.tan((25 * Math.PI) / 180)) * 1.12, 6);
  });

  it('com o HUD à esquerda a mesa cabe inteira na faixa livre e o desenho vai para a direita', () => {
    const e = { ...BASE, reservaEsquerda: 0.25, reservaDireita: 0.13 };
    const r = ajusteDaVistaDeCima(e);
    expect(larguraNaTela(e, r.altura / e.margem)).toBeLessThanOrEqual(1 - 0.25 - 0.13 + 1e-9);
    expect(r.deslocamento).toBeCloseTo(0.06, 9);
    expect(r.altura).toBeGreaterThan(ajusteDaVistaDeCima(BASE).altura);
  });

  it('a mesa fica afastada (câmera mais alta) quando a tela estreita', () => {
    const larga = ajusteDaVistaDeCima({ ...BASE, reservaEsquerda: 0.25 });
    const estreita = ajusteDaVistaDeCima({ ...BASE, aspecto: 1.2, reservaEsquerda: 0.25 });
    expect(estreita.altura).toBeGreaterThan(larga.altura);
  });

  it('a reserva exagerada não zera a faixa livre: a mesa nunca ocupa menos que a largura mínima', () => {
    const estreita = { ...BASE, aspecto: 1.2 };
    const a = ajusteDaVistaDeCima({ ...estreita, reservaEsquerda: 0.5, reservaDireita: 0.3 });
    const b = ajusteDaVistaDeCima({ ...estreita, reservaEsquerda: 0.45, reservaDireita: 0.45 });
    expect(a.altura).toBeCloseTo(b.altura, 9);
    expect(Number.isFinite(a.altura) && a.altura > 0).toBe(true);
    const tanMeio = Math.tan((50 * Math.PI) / 360);
    expect(a.altura).toBeCloseTo((1.15 / (tanMeio * 1.2 * 0.4)) * 1.12, 6);
  });

  it('o zoom escala a altura', () => {
    const um = ajusteDaVistaDeCima(BASE).altura;
    expect(ajusteDaVistaDeCima({ ...BASE, zoom: 0.5 }).altura).toBeCloseTo(um / 2, 9);
  });
});
