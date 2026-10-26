import { pelarMalha, pontoNoMundo, quadroVazio, type ContatoDePinca } from '@sinuca/personagens';
import { TACO } from '@sinuca/fisica';
import { beforeAll, describe, expect, it } from 'vitest';
import { raioDoCone } from '../cena/perfil-do-taco';
import { CONFIG_WEB } from '../config';
import { eixoDoTaco, type EixoDoTaco } from './eixo';
import { AnimacaoDoGiz, poseDoCubo } from './giz-animado';
import { GizNaMao } from './giz-na-mao';
import { MaoCalibrada } from './mao-calibrada';
import { maoDoArtista } from './para-testes';
import { poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';

const CFG = CONFIG_WEB.maos;
const LADO = CFG.giz.cubo.lado;
const MM = 0.001;

let calibrada: MaoCalibrada;
let semGiro: MaoCalibrada;
let pinca: ContatoDePinca;
let pele: Float64Array;

beforeAll(async () => {
  const base = await maoDoArtista();
  calibrada = new MaoCalibrada(base.modelo, 'ponte_v', CFG.escala, true, CFG.ponte.giro);
  semGiro = new MaoCalibrada(base.modelo, 'ponte_v', CFG.escala, true, 0);
  pinca = base.modelo.contatos.pincas.get('pinca')!;
  const malha = base.malha('alta');
  pele = pelarMalha(base.modelo.ficha, malha, base.modelo.ficha.poses.get('pinca')!, new Float64Array(malha.posicoes.length));
});

interface Quadro {
  readonly cubo: PoseDeMao;
  readonly mao: PoseDeMao;
  readonly eixo: EixoDoTaco;
}

/** Roda o gesto inteiro como o jogo o roda e devolve cada quadro em que o cubo está girando na ponta. */
function quadrosDoGirar(angulo: number, elevacao: number, x = -0.4, z = 0.05, mao = calibrada): Quadro[] {
  const eixo = eixoDoTaco(x, 0.028, z, 0.028, angulo, elevacao, CFG.giz.recuoDoTaco + CONFIG_WEB.tacada.recuoInicial, 0, 0);
  const noCubo = poseDoCubo(x + 0.15, LADO / 2, z + 0.62, angulo);
  const ponteSemGiz: PoseDeMao = {
    x: eixo.px - eixo.dx * CFG.ponte.distancia,
    y: eixo.py - eixo.dy * CFG.ponte.distancia,
    z: eixo.pz - eixo.dz * CFG.ponte.distancia,
    dx: eixo.dx,
    dy: eixo.dy,
    dz: eixo.dz,
    ux: 0,
    uy: 1,
    uz: 0,
  };
  const animacao = new AnimacaoDoGiz(CFG.giz);
  const giz = new GizNaMao(CFG.giz.pegada.rolo);
  const ponte = poseVaziaDeMao();
  const quadros: Quadro[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 4; i++) {
    animacao.atualizar(dt, { passando: i < 60 * 2.2, encadeando: false, ativo: true, passadaS: 3 });
    if (animacao.fase === 'parado') continue;
    giz.moverMao(animacao, mao, pinca, eixo, noCubo, ponteSemGiz, LADO, ponte);
    const cubo = animacao.cuboNaMao ? giz.cuboNaMao(mao, pinca, ponte) : giz.cuboNaBorda(noCubo);
    if (animacao.fase === 'girar') quadros.push({ cubo: { ...cubo }, mao: { ...ponte }, eixo });
  }
  return quadros;
}

const CASOS = [
  { nome: 'taco de frente, quase paralelo ao pano', angulo: 0, elevacao: 5 * (Math.PI / 180) },
  { nome: 'taco de lado e mais inclinado', angulo: 1.2, elevacao: 12 * (Math.PI / 180) },
  { nome: 'taco para trás', angulo: -2.4, elevacao: 5 * (Math.PI / 180) },
];

describe.each(CASOS)('o giz na ponta — $nome', ({ angulo, elevacao }) => {
  const quadros = (): Quadro[] => quadrosDoGirar(angulo, elevacao);

  it('há quadros girando', () => {
    expect(quadros().length).toBeGreaterThan(20);
  });

  it('em cada quadro do girar a face da covinha está a no máximo 1 mm da sola (o plano da ponta do taco)', () => {
    for (const { cubo, eixo } of quadros()) {
      // `cubo.d` sai da face da covinha para fora: o centro da face é o centro do cubo menos meio lado ao longo dele.
      const fx = cubo.x + (cubo.dx * LADO) / 2;
      const fy = cubo.y + (cubo.dy * LADO) / 2;
      const fz = cubo.z + (cubo.dz * LADO) / 2;
      const distancia = (fx - eixo.px) * eixo.dx + (fy - eixo.py) * eixo.dy + (fz - eixo.pz) * eixo.dz;
      expect(Math.abs(distancia) / MM).toBeLessThanOrEqual(1);
    }
  });

  it('a sola fica dentro do quadrado da face (o cubo não sai de cima da ponta) e perto do centro da covinha', () => {
    for (const { cubo, eixo } of quadros()) {
      const fx = cubo.x + (cubo.dx * LADO) / 2;
      const fy = cubo.y + (cubo.dy * LADO) / 2;
      const fz = cubo.z + (cubo.dz * LADO) / 2;
      const wx = cubo.dy * cubo.uz - cubo.dz * cubo.uy;
      const wy = cubo.dz * cubo.ux - cubo.dx * cubo.uz;
      const wz = cubo.dx * cubo.uy - cubo.dy * cubo.ux;
      const vx = eixo.px - fx;
      const vy = eixo.py - fy;
      const vz = eixo.pz - fz;
      const a = vx * cubo.ux + vy * cubo.uy + vz * cubo.uz;
      const b = vx * wx + vy * wy + vz * wz;
      expect(Math.abs(a)).toBeLessThanOrEqual(LADO / 2);
      expect(Math.abs(b)).toBeLessThanOrEqual(LADO / 2);
      // o círculo do esfrega (`giro.raioM`) é o que se afasta do centro; mais que isso e a ponta anda pela face
      expect(Math.hypot(a, b)).toBeLessThanOrEqual(CFG.giz.giro.raioM + 1 * MM);
    }
  });

  it('o cubo na mão é o mesmo que a pinça do arquivo segura: o centro do contato cai no centro do cubo', () => {
    for (const { cubo, mao } of quadros()) {
      const quadro = calibrada.quadro(mao, 1, quadroVazio());
      const centro = pontoNoMundo(quadro, calibrada.colocacao, ...pinca.centro, { x: 0, y: 0, z: 0 });
      expect(Math.hypot(centro.x - cubo.x, centro.y - cubo.y, centro.z - cubo.z) / MM).toBeLessThan(0.5);
    }
  });

  it('o cubo aparece da câmera de mira: a pele não cobre mais da metade dele nem o tapa por inteiro', () => {
    const [primeiro] = quadros();
    const { cubo, mao, eixo } = primeiro!;
    const quadro = calibrada.quadro(mao, 1, quadroVazio());
    const mundo: Array<[number, number, number]> = [];
    for (let i = 0; i < pele.length; i += 3) {
      const p = pontoNoMundo(quadro, calibrada.colocacao, pele[i]!, pele[i + 1]!, pele[i + 2]!, { x: 0, y: 0, z: 0 });
      mundo.push([p.x, p.y, p.z]);
    }
    // câmera de mira: atrás do taco e acima, olhando a ponta
    const dist = 0.9;
    const el = (25 * Math.PI) / 180;
    const k = Math.hypot(eixo.dx, eixo.dz);
    const fx = eixo.dx / k;
    const fz = eixo.dz / k;
    const cam: [number, number, number] = [eixo.px - fx * Math.cos(el) * dist, eixo.py + Math.sin(el) * dist, eixo.pz - fz * Math.cos(el) * dist];
    const v = [eixo.px - cam[0], eixo.py - cam[1], eixo.pz - cam[2]];
    const nv = Math.hypot(v[0]!, v[1]!, v[2]!);
    const vd = v.map((c) => c / nv) as [number, number, number];
    const dr = [vd[2], 0, -vd[0]];
    const ndr = Math.hypot(dr[0]!, dr[2]!);
    const direita = [dr[0]! / ndr, 0, dr[2]! / ndr] as [number, number, number];
    const cima: [number, number, number] = [direita[1] * vd[2] - direita[2] * vd[1], direita[2] * vd[0] - direita[0] * vd[2], direita[0] * vd[1] - direita[1] * vd[0]];
    const projeta = (p: readonly [number, number, number]): [number, number, number] => {
      const r: [number, number, number] = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
      const d = (u: readonly number[]): number => r[0] * u[0]! + r[1] * u[1]! + r[2] * u[2]!;
      return [d(direita), d(cima), d(vd)];
    };
    const centro = projeta([cubo.x, cubo.y, cubo.z]);
    const caixa = { x0: centro[0] - LADO * 0.75, x1: centro[0] + LADO * 0.75, y0: centro[1] - LADO * 0.75, y1: centro[1] + LADO * 0.75 };
    const frente = mundo.map(projeta).filter((p) => p[2] < centro[2] - 2 * MM);
    let cobertas = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const gx = caixa.x0 + ((i + 0.5) / N) * (caixa.x1 - caixa.x0);
        const gy = caixa.y0 + ((j + 0.5) / N) * (caixa.y1 - caixa.y0);
        if (frente.some((p) => Math.hypot(p[0] - gx, p[1] - gy) < 4 * MM)) cobertas++;
      }
    }
    expect(cobertas / (N * N)).toBeLessThan(0.5);
  });

  it('a pele não afunda no pano nem entra no taco além de 3 mm', () => {
    const [primeiro] = quadros();
    const { mao, eixo } = primeiro!;
    const quadro = calibrada.quadro(mao, 1, quadroVazio());
    let minimoY = Infinity;
    let pior = -Infinity;
    for (let i = 0; i < pele.length; i += 3) {
      const p = pontoNoMundo(quadro, calibrada.colocacao, pele[i]!, pele[i + 1]!, pele[i + 2]!, { x: 0, y: 0, z: 0 });
      minimoY = Math.min(minimoY, p.y);
      const atras = (eixo.px - p.x) * eixo.dx + (eixo.py - p.y) * eixo.dy + (eixo.pz - p.z) * eixo.dz;
      if (atras > 0 && atras < 0.4) {
        const ax = p.x - (eixo.px - eixo.dx * atras);
        const ay = p.y - (eixo.py - eixo.dy * atras);
        const az = p.z - (eixo.pz - eixo.dz * atras);
        pior = Math.max(pior, raioDoCone(TACO, atras) - Math.hypot(ax, ay, az));
      }
    }
    expect(minimoY).toBeGreaterThan(-0.003);
    expect(pior).toBeLessThan(0.003);
  });
});

describe('o giz não depende do giro da ponte (`ponte.giro`)', () => {
  it.each([
    ['com o giro de 45° da ponte', () => calibrada],
    ['sem giro', () => semGiro],
  ])('%s: a face da covinha fica a 1 mm da sola e a sola dentro dela', (_nome, qual) => {
    const quadros = quadrosDoGirar(0.7, 8 * (Math.PI / 180), -0.2, -0.1, qual());
    expect(quadros.length).toBeGreaterThan(20);
    for (const { cubo, eixo } of quadros) {
      const fx = cubo.x + (cubo.dx * LADO) / 2 - eixo.px;
      const fy = cubo.y + (cubo.dy * LADO) / 2 - eixo.py;
      const fz = cubo.z + (cubo.dz * LADO) / 2 - eixo.pz;
      expect(Math.abs(fx * eixo.dx + fy * eixo.dy + fz * eixo.dz)).toBeLessThanOrEqual(MM);
      expect(Math.hypot(fx, fy, fz)).toBeLessThanOrEqual(LADO / 2);
    }
  });
});
