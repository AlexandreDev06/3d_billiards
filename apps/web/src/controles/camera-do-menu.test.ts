import { describe, expect, it } from 'vitest';
import { poseDoMenu, poseDoMenuVazia, suavizadoDe5, type PosicaoDoMenu } from './camera-do-menu';

const posicao = (x: number, alvoX: number): PosicaoDoMenu => ({ x, y: 1.5, z: 2, alvoX, alvoY: 0.8, alvoZ: 0 });
const TRES = [posicao(0, 10), posicao(4, 20), posicao(8, 30)];

describe('suavizadoDe5', () => {
  it('sobe de 0 a 1 com derivada zero nas pontas e passa por 0,5 no meio', () => {
    expect(suavizadoDe5(0)).toBe(0);
    expect(suavizadoDe5(1)).toBe(1);
    expect(suavizadoDe5(0.5)).toBeCloseTo(0.5, 12);
    expect(suavizadoDe5(0.01)).toBeLessThan(2e-5);
    expect(suavizadoDe5(-3)).toBe(0);
    expect(suavizadoDe5(7)).toBe(1);
  });
});

describe('poseDoMenu', () => {
  it('começa na primeira posição, olhando para o alvo dela', () => {
    expect(poseDoMenu(TRES, 0, 18, false)).toMatchObject({ x: 0, olharX: 10 });
  });

  it('passeia 1 → 2 → 3 → 1 em ciclo, trechoS segundos de uma à outra', () => {
    expect(poseDoMenu(TRES, 9, 18, false).x).toBeCloseTo(2, 9); // meio do trecho 1→2
    expect(poseDoMenu(TRES, 18, 18, false)).toMatchObject({ x: 4, olharX: 20 });
    expect(poseDoMenu(TRES, 36, 18, false)).toMatchObject({ x: 8, olharX: 30 });
    expect(poseDoMenu(TRES, 54, 18, false)).toMatchObject({ x: 0, olharX: 10 }); // fecha o ciclo
    expect(poseDoMenu(TRES, 63, 18, false).x).toBeCloseTo(2, 9);
  });

  it('chega devagar: perto de cada posição quase não anda', () => {
    const quase = poseDoMenu(TRES, 17.5, 18, false).x;
    expect(Math.abs(4 - quase)).toBeLessThan(0.002);
    expect(poseDoMenu(TRES, 0.5, 18, false).x).toBeLessThan(0.002);
  });

  it('parada (nível baixo): fica na primeira, a qualquer hora', () => {
    for (const t of [0, 5, 100, 12345]) expect(poseDoMenu(TRES, t, 18, true)).toMatchObject({ x: 0, olharX: 10 });
  });

  it('com uma câmera só, ou sem nenhuma, não anda nem quebra', () => {
    expect(poseDoMenu([TRES[1]!], 50, 18, false).x).toBe(4);
    const vazia = poseDoMenuVazia();
    expect(poseDoMenu([], 3, 18, false, vazia)).toBe(vazia);
    expect(vazia.x).toBe(0);
  });

  it('reaproveita o objeto de saída (nada aloca por quadro) e ignora tempo negativo', () => {
    const saida = poseDoMenuVazia();
    expect(poseDoMenu(TRES, 3, 18, false, saida)).toBe(saida);
    expect(poseDoMenu(TRES, -4, 18, false, saida).x).toBe(0);
  });
});
