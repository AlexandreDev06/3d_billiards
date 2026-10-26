import { describe, expect, it } from 'vitest';
import { alvoDeCilindroVazio, alvoDePincaVazio, alvoDePlanoVazio, apoiarPalma, baseDoCilindro, cilindroDoQuadro, cuboDoQuadro, misturarQuadros, pincarCubo, pontoNoMundo, quadroVazio, segurarCilindro, vetorNoMundo } from './alinhar';
import type { ContatoDeCilindro, ContatoDePalma, ContatoDePinca } from './contatos';
import { pontoVazio } from './tipos';

const CILINDRO: ContatoDeCilindro = { ponto: [-0.04, 0.06, 0.035], eixo: [0, 1, 0], distanciaDoFim: 0.25, comprimento: 1.45, raioFino: 0.006, raioLargo: 0.015 };
const PINCA: ContatoDePinca = { centro: [-0.033, 0.114, -0.007], pinca: [0.6926, -0.6488, -0.3152], lado: [0.6887, 0.7248, 0.0214], aresta: 0.022 };

describe('segurarCilindro', () => {
  const alvo = alvoDeCilindroVazio();
  Object.assign(alvo, { px: 0.3, py: 0.03, pz: -0.2, dx: 0, dy: 0, dz: -1, cx: 0, cy: 1, cz: 0 });

  it('o ponto do contato cai sobre o ponto do alvo e o eixo do contato vira o do cilindro', () => {
    const q = segurarCilindro(CILINDRO, alvo, { escala: 1, espelho: false }, quadroVazio());
    const p = pontoNoMundo(q, { escala: 1, espelho: false }, ...CILINDRO.ponto, pontoVazio());
    expect([p.x, p.y, p.z].map((n) => +n.toFixed(9))).toEqual([0.3, 0.03, -0.2]);
    const e = vetorNoMundo(q, { escala: 1, espelho: false }, ...CILINDRO.eixo, pontoVazio());
    expect(e.x).toBeCloseTo(0, 9);
    expect(e.y).toBeCloseTo(0, 9);
    expect(e.z).toBeCloseTo(-1, 9);
  });

  it('o dorso (+z do personagem) fica para cima e o quadro é uma rotação', () => {
    const c = { escala: 1, espelho: false };
    const q = segurarCilindro(CILINDRO, alvo, c, quadroVazio());
    expect(vetorNoMundo(q, c, 0, 0, 1, pontoVazio()).y).toBeGreaterThan(0.99);
    const x = vetorNoMundo(q, c, 1, 0, 0, pontoVazio());
    const y = vetorNoMundo(q, c, 0, 1, 0, pontoVazio());
    const z = vetorNoMundo(q, c, 0, 0, 1, pontoVazio());
    expect(x.x * y.x + x.y * y.y + x.z * y.z).toBeCloseTo(0, 9);
    // x × y = z
    expect(x.y * y.z - x.z * y.y).toBeCloseTo(z.x, 9);
    expect(x.z * y.x - x.x * y.z).toBeCloseTo(z.y, 9);
    expect(x.x * y.y - x.y * y.x).toBeCloseTo(z.z, 9);
  });

  it('com espelho, o ponto espelhado (-x) cai no alvo e o dorso continua para cima', () => {
    const c = { escala: 1, espelho: true };
    const q = segurarCilindro(CILINDRO, alvo, c, quadroVazio());
    const p = pontoNoMundo(q, c, ...CILINDRO.ponto, pontoVazio());
    expect(p.x).toBeCloseTo(0.3, 9);
    expect(p.y).toBeCloseTo(0.03, 9);
    expect(p.z).toBeCloseTo(-0.2, 9);
    expect(vetorNoMundo(q, c, 0, 0, 1, pontoVazio()).y).toBeGreaterThan(0.99);
    // o polegar (x negativo na direita) fica do lado oposto ao da direita
    const direita = segurarCilindro(CILINDRO, alvo, { escala: 1, espelho: false }, quadroVazio());
    const polegarD = pontoNoMundo(direita, { escala: 1, espelho: false }, -0.04, 0.06, 0.035, pontoVazio());
    const polegarE = pontoNoMundo(q, c, -0.1, 0.06, 0.035, pontoVazio());
    const polegarD2 = pontoNoMundo(direita, { escala: 1, espelho: false }, -0.1, 0.06, 0.035, pontoVazio());
    expect(Math.sign(polegarE.x - 0.3)).toBe(-Math.sign(polegarD2.x - polegarD.x) || 1);
  });

  it('a escala afasta o resto da mão do cilindro sem tirar o ponto dele', () => {
    const c = { escala: 0.5, espelho: false };
    const q = segurarCilindro(CILINDRO, alvo, c, quadroVazio());
    const p = pontoNoMundo(q, c, ...CILINDRO.ponto, pontoVazio());
    expect(p.x).toBeCloseTo(0.3, 9);
    const longe = pontoNoMundo(q, c, 0, 0, 0, pontoVazio());
    const longe1 = pontoNoMundo(segurarCilindro(CILINDRO, alvo, { escala: 1, espelho: false }, quadroVazio()), { escala: 1, espelho: false }, 0, 0, 0, pontoVazio());
    const meio = Math.hypot(longe.x - 0.3, longe.y - 0.03, longe.z + 0.2);
    const inteiro = Math.hypot(longe1.x - 0.3, longe1.y - 0.03, longe1.z + 0.2);
    expect(meio).toBeCloseTo(inteiro / 2, 9);
  });

  it('o rolo gira a mão em torno do cilindro sem tirar o ponto nem o eixo', () => {
    const c = { escala: 1, espelho: false };
    const q = segurarCilindro(CILINDRO, alvo, c, quadroVazio(), Math.PI / 2);
    const p = pontoNoMundo(q, c, ...CILINDRO.ponto, pontoVazio());
    expect(p.y).toBeCloseTo(0.03, 9);
    const dorso = vetorNoMundo(q, c, 0, 0, 1, pontoVazio());
    expect(Math.abs(dorso.y)).toBeLessThan(1e-9);
    expect(Math.abs(dorso.z)).toBeLessThan(1e-9);
  });

  it('com o cilindro na direção do "para cima" (taco na vertical) ainda monta uma rotação válida', () => {
    const vertical = alvoDeCilindroVazio();
    Object.assign(vertical, { dx: 0, dy: 1, dz: 0, cx: 0, cy: 1, cz: 0 });
    const c = { escala: 1, espelho: false };
    const q = segurarCilindro(CILINDRO, vertical, c, quadroVazio());
    for (const n of [q.xx ** 2 + q.xy ** 2 + q.xz ** 2, q.yx ** 2 + q.yy ** 2 + q.yz ** 2, q.zx ** 2 + q.zy ** 2 + q.zz ** 2]) expect(n).toBeCloseTo(1, 9);
  });
});

describe('pincarCubo', () => {
  const cubo = alvoDePincaVazio();
  Object.assign(cubo, { px: 0.1, py: 0.05, pz: 0.2, lx: 0, ly: -1, lz: 0, tx: -1, ty: 0, tz: 0 });

  it('o centro do contato cai no centro do cubo e os dois eixos vão aos do cubo', () => {
    const c = { escala: 1, espelho: false };
    const q = pincarCubo(PINCA, cubo, c, quadroVazio());
    const p = pontoNoMundo(q, c, ...PINCA.centro, pontoVazio());
    expect(p.x).toBeCloseTo(0.1, 9);
    expect(p.y).toBeCloseTo(0.05, 9);
    expect(p.z).toBeCloseTo(0.2, 9);
    const l = vetorNoMundo(q, c, ...PINCA.lado, pontoVazio());
    expect(l.x).toBeCloseTo(0, 3);
    expect(l.y).toBeCloseTo(-1, 3);
    expect(l.z).toBeCloseTo(0, 3);
    const e2 = [PINCA.pinca[1] * PINCA.lado[2] - PINCA.pinca[2] * PINCA.lado[1], PINCA.pinca[2] * PINCA.lado[0] - PINCA.pinca[0] * PINCA.lado[2], PINCA.pinca[0] * PINCA.lado[1] - PINCA.pinca[1] * PINCA.lado[0]] as const;
    const t = vetorNoMundo(q, c, ...e2, pontoVazio());
    expect(t.x).toBeCloseTo(-1, 3);
  });

  it('a mão esquerda (espelho) também põe o centro no cubo, com o dorso do mesmo lado', () => {
    const c = { escala: 0.8, espelho: true };
    const q = pincarCubo(PINCA, cubo, c, quadroVazio());
    const p = pontoNoMundo(q, c, ...PINCA.centro, pontoVazio());
    expect(p.x).toBeCloseTo(0.1, 9);
    expect(p.y).toBeCloseTo(0.05, 9);
    expect(p.z).toBeCloseTo(0.2, 9);
    // o terceiro eixo, espelhado, é o que vai a `t`
    const e2 = [PINCA.pinca[1] * PINCA.lado[2] - PINCA.pinca[2] * PINCA.lado[1], PINCA.pinca[2] * PINCA.lado[0] - PINCA.pinca[0] * PINCA.lado[2], PINCA.pinca[0] * PINCA.lado[1] - PINCA.pinca[1] * PINCA.lado[0]] as const;
    const t = vetorNoMundo(q, c, ...e2, pontoVazio());
    expect(t.x).toBeCloseTo(-1, 3);
  });
});

describe('apoiarPalma', () => {
  const PALMA: ContatoDePalma = { centro: [0, 0.05, -0.024], normal: [0, 0, -1], rumo: [0, 1, 0] };

  it('a palma encosta no plano, virada para ele, com os dedos para onde se pediu', () => {
    const plano = alvoDePlanoVazio();
    Object.assign(plano, { px: 1, py: 0.5, pz: -2, nx: 0, ny: 1, nz: 0, rx: 1, ry: 0, rz: 0 });
    const c = { escala: 1, espelho: false };
    const q = apoiarPalma(PALMA, plano, c, quadroVazio());
    const p = pontoNoMundo(q, c, ...PALMA.centro, pontoVazio());
    expect([p.x, p.y, p.z].map((n) => +n.toFixed(9))).toEqual([1, 0.5, -2]);
    const normal = vetorNoMundo(q, c, ...PALMA.normal, pontoVazio());
    expect(normal.y).toBeCloseTo(-1, 9);
    const dedos = vetorNoMundo(q, c, 0, 1, 0, pontoVazio());
    expect(dedos.x).toBeCloseTo(1, 9);
  });
});

describe('o contrário: do quadro ao alvo', () => {
  it.each([false, true])('cilindroDoQuadro devolve o alvo que segurarCilindro recebeu (espelho %s)', (espelho) => {
    const alvo = alvoDeCilindroVazio();
    Object.assign(alvo, { px: 0.3, py: 0.03, pz: -0.2, dx: 0.3, dy: 0.1, dz: -0.9, cx: 0, cy: 1, cz: 0 });
    const c = { escala: 0.8, espelho };
    const q = segurarCilindro(CILINDRO, alvo, c, quadroVazio(), 0.4);
    const volta = cilindroDoQuadro(CILINDRO, q, c, alvoDeCilindroVazio());
    expect(volta.px).toBeCloseTo(0.3, 9);
    expect(volta.py).toBeCloseTo(0.03, 9);
    expect(volta.pz).toBeCloseTo(-0.2, 9);
    const n = Math.hypot(0.3, 0.1, 0.9);
    expect(volta.dx).toBeCloseTo(0.3 / n, 9);
    expect(volta.dy).toBeCloseTo(0.1 / n, 9);
    expect(volta.dz).toBeCloseTo(-0.9 / n, 9);
    // o mesmo quadro: refazer a partir do alvo devolvido, com o rolo já embutido no `c`
    const refeito = segurarCilindro(CILINDRO, volta, c, quadroVazio());
    for (const k of ['xx', 'xy', 'xz', 'yx', 'yy', 'yz', 'zx', 'zy', 'zz', 'px', 'py', 'pz'] as const) expect(refeito[k]).toBeCloseTo(q[k], 9);
  });

  it.each([false, true])('cuboDoQuadro devolve o alvo que pincarCubo recebeu (espelho %s)', (espelho) => {
    const alvo = alvoDePincaVazio();
    Object.assign(alvo, { px: 0.1, py: 0.05, pz: 0.2, lx: 0, ly: -1, lz: 0, tx: -1, ty: 0, tz: 0 });
    const c = { escala: 0.85, espelho };
    const q = pincarCubo(PINCA, alvo, c, quadroVazio());
    const volta = cuboDoQuadro(PINCA, q, c, alvoDePincaVazio());
    expect([volta.px, volta.py, volta.pz].map((n) => +n.toFixed(6))).toEqual([0.1, 0.05, 0.2]);
    expect(volta.lx).toBeCloseTo(0, 3);
    expect(volta.ly).toBeCloseTo(-1, 3);
    expect(volta.tx).toBeCloseTo(-1, 3);
  });

  it('baseDoCilindro é ortonormal e o eixo é o do contato (espelhado)', () => {
    const b = baseDoCilindro(CILINDRO, true, new Float64Array(9));
    expect(b[0]).toBeCloseTo(-CILINDRO.eixo[0], 9);
    expect(Math.hypot(b[3]!, b[4]!, b[5]!)).toBeCloseTo(1, 9);
    expect(b[0]! * b[3]! + b[1]! * b[4]! + b[2]! * b[5]!).toBeCloseTo(0, 9);
  });
});

describe('misturarQuadros', () => {
  const girado = (graus: number, px: number, py: number, pz: number) => {
    const a = (graus * Math.PI) / 180;
    // rotação em torno de y: x → (cos, 0, -sen), z → (sen, 0, cos)
    return { ...quadroVazio(), px, py, pz, xx: Math.cos(a), xz: -Math.sin(a), zx: Math.sin(a), zz: Math.cos(a) };
  };

  it('k = 0 devolve o primeiro, k = 1 o segundo, e a origem anda em linha reta', () => {
    const a = girado(0, 0, 0, 0);
    const b = girado(90, 2, 4, -6);
    const s = quadroVazio();
    misturarQuadros(a, b, 0, s);
    expect(s).toMatchObject({ px: 0, py: 0, pz: 0 });
    expect(s.xx).toBeCloseTo(1, 9);
    misturarQuadros(a, b, 1, s);
    expect(s).toMatchObject({ px: 2, py: 4, pz: -6 });
    expect(s.xz).toBeCloseTo(-1, 9);
    misturarQuadros(a, b, 0.25, s);
    expect(s).toMatchObject({ px: 0.5, py: 1, pz: -1.5 });
  });

  it('no meio de 0° e 90° o quadro é o de 45°, ainda uma rotação (colunas unitárias e perpendiculares)', () => {
    const s = quadroVazio();
    misturarQuadros(girado(0, 0, 0, 0), girado(90, 0, 0, 0), 0.5, s);
    expect(s.xx).toBeCloseTo(Math.SQRT1_2, 9);
    expect(s.xz).toBeCloseTo(-Math.SQRT1_2, 9);
    for (const [x, y, z] of [[s.xx, s.xy, s.xz], [s.yx, s.yy, s.yz], [s.zx, s.zy, s.zz]] as const) expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
    expect(s.xx * s.zx + s.xy * s.zy + s.xz * s.zz).toBeCloseTo(0, 9);
  });

  it('vai pelo caminho curto (350° e 10° passam por 0°, não por 180°) e k fora de 0..1 é limitado', () => {
    const s = quadroVazio();
    misturarQuadros(girado(350, 0, 0, 0), girado(10, 0, 0, 0), 0.5, s);
    expect(s.xx).toBeCloseTo(1, 6);
    misturarQuadros(girado(0, 0, 0, 0), girado(90, 1, 1, 1), 9, s);
    expect(s.px).toBe(1);
  });

  it('pode escrever sobre um dos dois quadros', () => {
    const a = girado(0, 0, 0, 0);
    misturarQuadros(a, girado(90, 2, 0, 0), 0.5, a);
    expect(a.px).toBe(1);
    expect(a.xx).toBeCloseTo(Math.SQRT1_2, 9);
  });
});
