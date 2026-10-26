import { describe, expect, it } from 'vitest';
import { SeguidorDoOlhar } from './seguidor-do-olhar';

const CFG = { velocidadeMinima: 0.15, histerese: 0.6, taxa: 1000, altura: 0.028 };
const BRANCA = 0;

function mesa() {
  const xs = Float64Array.of(0, 1, 2);
  const zs = Float64Array.of(0, 0, 0);
  const ativas = Uint8Array.of(1, 1, 1);
  return { xs, zs, ativas };
}

describe('SeguidorDoOlhar (para onde o balão olha)', () => {
  it('com tudo parado, olha a bola branca', () => {
    const { xs, zs, ativas } = mesa();
    xs[0] = 0.4;
    zs[0] = -0.2;
    const s = new SeguidorDoOlhar(CFG, BRANCA);
    s.atualizar(0.016, xs, zs, ativas);
    s.atualizar(0.016, xs, zs, ativas);
    expect(s.x).toBeCloseTo(0.4, 6);
    expect(s.z).toBeCloseTo(-0.2, 6);
    expect(s.y).toBe(0.028);
    expect(s.bolaSeguida).toBe(BRANCA);
  });

  it('depois da tacada segue a bola que anda mais rápido', () => {
    const { xs, zs, ativas } = mesa();
    const s = new SeguidorDoOlhar(CFG, BRANCA);
    s.atualizar(0.1, xs, zs, ativas);
    // a 2 anda 3 m/s, a 1 anda 1 m/s
    for (let i = 0; i < 4; i++) {
      xs[2]! += 0.3;
      xs[1]! += 0.1;
      s.atualizar(0.1, xs, zs, ativas);
    }
    expect(s.bolaSeguida).toBe(2);
    expect(s.x).toBeCloseTo(xs[2]!, 6);
  });

  it('não pula de bola por uma diferença pequena (histerese)', () => {
    const { xs, zs, ativas } = mesa();
    const s = new SeguidorDoOlhar(CFG, BRANCA);
    s.atualizar(0.1, xs, zs, ativas);
    for (let i = 0; i < 4; i++) {
      xs[2]! += 0.3;
      xs[1]! += 0.25;
      s.atualizar(0.1, xs, zs, ativas);
    }
    // a 1 chegou perto da velocidade da 2, mas não passou 1/histerese vezes dela: continua na 2
    expect(s.bolaSeguida).toBe(2);
    for (let i = 0; i < 6; i++) {
      xs[2]! += 0.01;
      xs[1]! += 0.3;
      s.atualizar(0.1, xs, zs, ativas);
    }
    expect(s.bolaSeguida).toBe(1);
  });

  it('bola que caiu (fora da mesa) não é seguida; quando tudo para volta à branca', () => {
    const { xs, zs, ativas } = mesa();
    const s = new SeguidorDoOlhar(CFG, BRANCA);
    s.atualizar(0.1, xs, zs, ativas);
    for (let i = 0; i < 3; i++) {
      xs[2]! += 0.3;
      s.atualizar(0.1, xs, zs, ativas);
    }
    ativas[2] = 0;
    for (let i = 0; i < 12; i++) s.atualizar(0.1, xs, zs, ativas);
    expect(s.bolaSeguida).toBe(BRANCA);
  });

  it('o ponto olhado anda suave de uma bola para a outra (não dá um salto)', () => {
    const { xs, zs, ativas } = mesa();
    const s = new SeguidorDoOlhar({ ...CFG, taxa: 8 }, BRANCA);
    s.atualizar(0.016, xs, zs, ativas);
    s.atualizar(0.016, xs, zs, ativas);
    xs[1] = 1;
    xs[2] = 5; // a 2 foi para longe de uma vez
    s.atualizar(0.016, xs, zs, ativas);
    expect(s.x).toBeLessThan(1);
    expect(s.x).toBeGreaterThanOrEqual(0);
  });

  it('reiniciar volta à branca e esquece as velocidades', () => {
    const { xs, zs, ativas } = mesa();
    const s = new SeguidorDoOlhar(CFG, BRANCA);
    s.atualizar(0.1, xs, zs, ativas);
    for (let i = 0; i < 3; i++) {
      xs[2]! += 0.3;
      s.atualizar(0.1, xs, zs, ativas);
    }
    s.reiniciar();
    s.atualizar(0.1, xs, zs, ativas);
    expect(s.bolaSeguida).toBe(BRANCA);
  });
});
