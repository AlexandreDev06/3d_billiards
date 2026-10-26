import { describe, expect, it } from 'vitest';
import { medidasDaBola } from './config';
import { gravacaoDeTeste } from './gravacao';
import { MESA_BAR, pontoDeSaida } from './medidas';
import { ID_BOLAO, type Gravacao, type Vetor3 } from './tipos';

type Quat = [number, number, number, number];

const posicao = (g: Gravacao, q: number, i: number): Vetor3 => {
  const k = (q * g.ids.length + i) * 3;
  return { x: g.posicoes[k]!, y: g.posicoes[k + 1]!, z: g.posicoes[k + 2]! };
};

const orientacao = (g: Gravacao, q: number, i: number): Quat => {
  const k = (q * g.ids.length + i) * 4;
  return [g.orientacoes[k]!, g.orientacoes[k + 1]!, g.orientacoes[k + 2]!, g.orientacoes[k + 3]!];
};

/** b · a⁻¹: a rotação que leva a orientação `a` até `b`. */
const rotacaoEntre = ([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat => {
  const [cx, cy, cz, cw] = [-ax, -ay, -az, aw];
  return [
    bw * cx + bx * cw + by * cz - bz * cy,
    bw * cy - bx * cz + by * cw + bz * cx,
    bw * cz + bx * cy - by * cx + bz * cw,
    bw * cw - bx * cx - by * cy - bz * cz,
  ];
};

const deslocamento = (a: Vetor3, b: Vetor3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

describe('gravacaoDeTeste', () => {
  const g = gravacaoDeTeste();
  const n = g.ids.length;
  const iBolao = g.ids.indexOf(ID_BOLAO);
  const raioBolao = medidasDaBola(ID_BOLAO).raio;

  it('tem arrays de quadros × ids × componentes', () => {
    expect(g.frequencia).toBe(60);
    expect(g.quadros).toBe(Math.ceil(g.duracao * g.frequencia) + 1);
    expect(g.posicoes).toBeInstanceOf(Float32Array);
    expect(g.posicoes).toHaveLength(g.quadros * n * 3);
    expect(g.orientacoes).toBeInstanceOf(Float32Array);
    expect(g.orientacoes).toHaveLength(g.quadros * n * 4);
    expect(g.naMesa).toBeInstanceOf(Uint8Array);
    expect(g.naMesa).toHaveLength(g.quadros * n);
  });

  it('traz o bolão e as 15 numeradas, uma vez cada', () => {
    expect([...g.ids].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('o bolão sai da marca da saída em linha reta para +X, apoiado no pano', () => {
    const saida = pontoDeSaida(MESA_BAR);
    const inicio = posicao(g, 0, iBolao);
    expect(inicio.x).toBeCloseTo(saida.x, 6);
    expect(inicio.z).toBeCloseTo(saida.z, 6);
    for (let q = 0; q < g.quadros; q++) {
      const p = posicao(g, q, iBolao);
      expect(p.y).toBeCloseTo(raioBolao, 6);
      expect(p.z).toBeCloseTo(saida.z, 6);
      if (q > 0) expect(p.x).toBeGreaterThan(posicao(g, q - 1, iBolao).x);
    }
  });

  it('desacelera e para em cerca de 2 s', () => {
    expect(g.duracao).toBeGreaterThan(1.5);
    expect(g.duracao).toBeLessThan(2.5);
    const passos = Array.from({ length: g.quadros - 1 }, (_, q) =>
      deslocamento(posicao(g, q, iBolao), posicao(g, q + 1, iBolao)),
    );
    for (let q = 1; q < passos.length; q++) expect(passos[q]!).toBeLessThanOrEqual(passos[q - 1]! + 1e-6);
    expect(passos.at(-1)!).toBeLessThan(1e-4);
  });

  it('abre com taco-bola no bolão e fecha com parou em t = duracao', () => {
    expect(g.eventos[0]).toMatchObject({ tipo: 'taco-bola', t: 0, bola: ID_BOLAO, miscue: false });
    expect(g.eventos.at(-1)).toEqual({ tipo: 'parou', t: g.duracao });
  });

  it('nenhuma bola sai da mesa nem invade outra', () => {
    expect(g.naMesa.every((v) => v === 1)).toBe(true);
    for (let q = 0; q < g.quadros; q++) {
      for (let i = 0; i < n; i++) {
        const p = posicao(g, q, i);
        const r = medidasDaBola(g.ids[i]!).raio;
        expect(Math.abs(p.x) + r).toBeLessThan(MESA_BAR.comprimento / 2);
        expect(Math.abs(p.z) + r).toBeLessThan(MESA_BAR.largura / 2);
        for (let j = i + 1; j < n; j++) {
          const rj = medidasDaBola(g.ids[j]!).raio;
          expect(deslocamento(p, posicao(g, q, j))).toBeGreaterThanOrEqual(r + rj);
        }
      }
    }
  });

  it('orientações são quaternions unitários e as bolas paradas não giram', () => {
    for (let q = 0; q < g.quadros; q++) {
      for (let i = 0; i < n; i++) {
        expect(Math.hypot(...orientacao(g, q, i))).toBeCloseTo(1, 5);
        if (i !== iBolao) expect(orientacao(g, q, i)).toEqual(orientacao(g, 0, i));
      }
    }
  });

  it('o bolão rola sem escorregar: gira Δs/R por quadro em torno de ŷ × direção', () => {
    for (let q = 0; q + 1 < g.quadros; q++) {
      const ds = deslocamento(posicao(g, q, iBolao), posicao(g, q + 1, iBolao));
      const [x, y, z, w] = rotacaoEntre(orientacao(g, q, iBolao), orientacao(g, q + 1, iBolao));
      const s = Math.sign(w) || 1;
      const angulo = 2 * Math.atan2(Math.hypot(x, y, z), s * w);
      expect(angulo).toBeCloseTo(ds / raioBolao, 3);
      if (ds > 1e-3) {
        const eixo = Math.hypot(x, y, z);
        expect((s * x) / eixo).toBeCloseTo(0, 3);
        expect((s * y) / eixo).toBeCloseTo(0, 3);
        expect((s * z) / eixo).toBeCloseTo(-1, 3);
      }
    }
  });
});
