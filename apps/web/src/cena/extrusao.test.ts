import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import type { Ponto2 } from '@sinuca/fisica';
import { extrudar, formaDe } from './extrusao';

const retangulo = (x0: number, z0: number, x1: number, z1: number): Ponto2[] => [
  { x: x0, z: z0 },
  { x: x1, z: z0 },
  { x: x1, z: z1 },
  { x: x0, z: z1 },
];

function limites(g: BufferGeometry): { min: number[]; max: number[] } {
  const p = g.getAttribute('position');
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.count; i++) {
    [p.getX(i), p.getY(i), p.getZ(i)].forEach((v, k) => {
      min[k] = Math.min(min[k]!, v);
      max[k] = Math.max(max[k]!, v);
    });
  }
  return { min, max };
}

describe('extrudar', () => {
  it('sobe de yBase a yBase + altura e mantém x e z do contorno (z não espelha)', () => {
    const { min, max } = limites(extrudar(formaDe(retangulo(1, 2, 4, 3)), { yBase: -0.02, altura: 0.05 }));
    expect(min[0]).toBeCloseTo(1, 6);
    expect(max[0]).toBeCloseTo(4, 6);
    expect(min[1]).toBeCloseTo(-0.02, 6);
    expect(max[1]).toBeCloseTo(0.03, 6);
    expect(min[2]).toBeCloseTo(2, 6);
    expect(max[2]).toBeCloseTo(3, 6);
  });

  it('com chanfro a parede fica no contorno e a altura total não muda', () => {
    const g = extrudar(formaDe(retangulo(-1, -1, 1, 1)), { yBase: 0, altura: 0.06, chanfro: 0.01 });
    const { min, max } = limites(g);
    expect(min[1]).toBeCloseTo(0, 6);
    expect(max[1]).toBeCloseTo(0.06, 6);
    expect(max[0]).toBeCloseTo(1, 6);
    expect(min[2]).toBeCloseTo(-1, 6);
    // o topo encolhe: os vértices mais altos estão a um chanfro da parede
    const p = g.getAttribute('position');
    let maiorXNoTopo = -Infinity;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.0599) maiorXNoTopo = Math.max(maiorXNoTopo, p.getX(i));
    expect(maiorXNoTopo).toBeCloseTo(0.99, 3);
  });

  it('o furo da forma fica vazado: nenhum triângulo de cima cobre o centro do furo', () => {
    const g = extrudar(formaDe(retangulo(-1, -1, 1, 1), [retangulo(-0.25, -0.25, 0.25, 0.25)]), { yBase: 0, altura: 0.05 });
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const topo = [0, 1, 2].every((k) => p.getY(i + k) > 0.0499);
      if (!topo) continue;
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      expect(Math.abs(cx) < 0.25 && Math.abs(cz) < 0.25).toBe(false);
    }
  });

  it('as normais de cima apontam para cima e as da parede para fora', () => {
    const g = extrudar(formaDe(retangulo(-1, -1, 1, 1)), { yBase: 0, altura: 0.05 });
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0.0499 && Math.abs(n.getY(i)) > 0.5) expect(n.getY(i)).toBeGreaterThan(0.99);
      if (Math.abs(n.getY(i)) < 0.5) expect(n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i)).toBeGreaterThan(0.5);
    }
  });
});

/** Triângulos de parede (face quase vertical) com a normal geométrica da ordem dos vértices, que é a que o `FrontSide` usa para desenhar ou cortar. */
function paredes(g: BufferGeometry): { centro: [number, number, number]; normal: [number, number, number] }[] {
  const p = g.getAttribute('position');
  const lista: { centro: [number, number, number]; normal: [number, number, number] }[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)] as const);
    const a = [v[1]![0] - v[0]![0], v[1]![1] - v[0]![1], v[1]![2] - v[0]![2]];
    const b = [v[2]![0] - v[0]![0], v[2]![1] - v[0]![1], v[2]![2] - v[0]![2]];
    const n: [number, number, number] = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const comprimento = Math.hypot(...n);
    if (comprimento === 0 || Math.abs(n[1]! / comprimento) > 0.5) continue;
    lista.push({
      centro: [(v[0]![0] + v[1]![0] + v[2]![0]) / 3, (v[0]![1] + v[1]![1] + v[2]![1]) / 3, (v[0]![2] + v[1]![2] + v[2]![2]) / 3],
      normal: [n[0] / comprimento, n[1]! / comprimento, n[2]! / comprimento],
    });
  }
  return lista;
}

describe('extrudar: as paredes do furo', () => {
  const horario = (pontos: Ponto2[]): Ponto2[] => [...pontos].reverse();
  const casos: [string, Ponto2[], Ponto2[]][] = [
    ['contorno e furo no mesmo sentido (a caçapa do pano: os dois anti-horários em XZ)', retangulo(-1, -1, 1, 1), retangulo(-0.25, -0.25, 0.25, 0.25)],
    ['contorno anti-horário e furo horário', retangulo(-1, -1, 1, 1), horario(retangulo(-0.25, -0.25, 0.25, 0.25))],
    ['contorno horário e furo anti-horário', horario(retangulo(-1, -1, 1, 1)), retangulo(-0.25, -0.25, 0.25, 0.25)],
    ['contorno e furo horários', horario(retangulo(-1, -1, 1, 1)), horario(retangulo(-0.25, -0.25, 0.25, 0.25))],
  ];
  for (const [nome, contorno, furo] of casos) {
    it(`a parede do furo olha para dentro do furo, para ser vista dele, e a de fora para fora: ${nome}`, () => {
      const g = extrudar(formaDe(contorno, [furo]), { yBase: 0, altura: 0.05 });
      let doFuro = 0;
      let defora = 0;
      for (const { centro, normal } of paredes(g)) {
        const noFuro = Math.abs(centro[0]) < 0.3 && Math.abs(centro[2]) < 0.3;
        const paraOCentro = -(normal[0] * centro[0] + normal[2] * centro[2]) / Math.hypot(centro[0], centro[2]);
        if (noFuro) {
          doFuro++;
          expect(paraOCentro).toBeGreaterThan(0.5);
        } else {
          defora++;
          expect(-paraOCentro).toBeGreaterThan(0.5);
        }
      }
      expect(doFuro).toBeGreaterThan(0);
      expect(defora).toBeGreaterThan(0);
    });
  }
});
