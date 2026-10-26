import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TACO } from '@sinuca/fisica';
import { criarTaco, posicionarTaco } from '../cena/taco';
import { eixoDoTaco, pontoDeContato, pontoDoTaco, type Vec3 } from './eixo';

describe('eixoDoTaco: a mesma conta de posicionarTaco, sem three', () => {
  const CASOS: readonly (readonly [number, number, number, number, number, number, string])[] = [
    [0, 0.05, 0, 0.03, 0, 0, 'centro, 5°'],
    [1.2, 0.2, 0.1, 0.12, 0, 0, 'mira de lado, recuo'],
    [-2.4, 0.9, 0.25, 0.3, -0.5, 0.4, 'efeito'],
    [3, 0.05, -0.02, 0.9, 0.9, 0, 'efeito lateral quase no limite'],
  ];

  it('a ponta cai onde o taco desenhado põe a dele, e a direção é a do taco', () => {
    for (const [angulo, elevacao, recuo, , lateral, vertical, rotulo] of CASOS.map((c) => [c[0], c[1], c[3], 0, c[4], c[5], c[6]] as const)) {
      const taco = criarTaco(TACO, { escalaTextura: 0.25 });
      const centro = new Vector3(0.3, 0.0286, -0.2);
      posicionarTaco(taco, centro, 0.0286, angulo, elevacao, recuo, { lateral, vertical });
      const eixo = eixoDoTaco(0.3, 0.0286, -0.2, 0.0286, angulo, elevacao, recuo, lateral, vertical);
      expect(eixo.px, rotulo).toBeCloseTo(taco.position.x, 12);
      expect(eixo.py, rotulo).toBeCloseTo(taco.position.y, 12);
      expect(eixo.pz, rotulo).toBeCloseTo(taco.position.z, 12);
      // O taco corre ao longo de -X do grupo: o cabo está em ponta − direção · comprimento.
      const cabo = new Vector3(-TACO.comprimento, 0, 0).applyQuaternion(taco.quaternion).add(taco.position);
      const q: Vec3 = { x: 0, y: 0, z: 0 };
      pontoDoTaco(eixo, TACO.comprimento, q);
      expect(q.x, rotulo).toBeCloseTo(cabo.x, 9);
      expect(q.y, rotulo).toBeCloseTo(cabo.y, 9);
      expect(q.z, rotulo).toBeCloseTo(cabo.z, 9);
    }
  });

  it('a direção é unitária e o contato é a ponta com o recuo desfeito', () => {
    const eixo = eixoDoTaco(0, 0.0286, 0, 0.0286, 0.8, 0.3, 0.17, 0.2, 0.1);
    expect(Math.hypot(eixo.dx, eixo.dy, eixo.dz)).toBeCloseTo(1, 12);
    const contato: Vec3 = { x: 0, y: 0, z: 0 };
    pontoDeContato(eixo, 0.17, contato);
    const sem = eixoDoTaco(0, 0.0286, 0, 0.0286, 0.8, 0.3, 0, 0.2, 0.1);
    expect(contato.x).toBeCloseTo(sem.px, 12);
    expect(contato.y).toBeCloseTo(sem.py, 12);
    expect(contato.z).toBeCloseTo(sem.pz, 12);
  });

  it('sem alocar: escreve na saída passada', () => {
    const saida = { px: 0, py: 0, pz: 0, dx: 0, dy: 0, dz: 0 };
    expect(eixoDoTaco(0, 0, 0, 0.0286, 0, 0, 0, 0, 0, saida)).toBe(saida);
  });
});
