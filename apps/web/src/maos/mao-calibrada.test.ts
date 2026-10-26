import { TACO } from '@sinuca/fisica';
import { pelarMalha, pontoNoMundo, poseDeRepouso, quadroVazio } from '@sinuca/personagens';
import { beforeAll, describe, expect, it } from 'vitest';
import { raioDoCone } from '../cena/perfil-do-taco';
import { CONFIG_WEB } from '../config';
import { MaoCalibrada } from './mao-calibrada';
import { DEDOS_LONGOS, maoDoArtista, pontasNoMundo } from './para-testes';
import { noMundo, poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';

const ESCALA = CONFIG_WEB.maos.escala;
let ponte: MaoCalibrada;
let punho: MaoCalibrada;
let pele: (pose: string) => Float64Array;

beforeAll(async () => {
  const base = await maoDoArtista();
  ponte = new MaoCalibrada(base.modelo, 'ponte_v', ESCALA, true);
  punho = new MaoCalibrada(base.modelo, 'punho', ESCALA, false);
  const malha = base.malha('alta');
  pele = (pose) => pelarMalha(base.modelo.ficha, malha, base.modelo.ficha.poses.get(pose)!, new Float64Array(malha.posicoes.length));
});

const pose = (): PoseDeMao => ({ x: 0.4, y: 0.05, z: -0.2, dx: 0, dy: 0, dz: -1, ux: 0, uy: 1, uz: 0 });

describe('MaoCalibrada: o quadro do taco e o do arquivo', () => {
  it.each([
    ['ponte', () => ponte],
    ['punho', () => punho],
  ])('%s: um ponto da mão no quadro da pose cai onde o pacote o põe no mundo', (_nome, qual) => {
    const mao = qual();
    const p = pose();
    const quadro = mao.quadro(p, 1, quadroVazio());
    const l = { x: 0, y: 0, z: 0 };
    const w = { x: 0, y: 0, z: 0 };
    for (const [x, y, z] of [[0, 0, 0], [-0.04, 0.06, 0.035], [0.03, 0.15, -0.02], [-0.07, 0.08, 0.03]] as const) {
      mao.local(x, y, z, l);
      noMundo(p, l.x, l.y, l.z, w);
      const certo = pontoNoMundo(quadro, mao.colocacao, x, y, z, { x: 0, y: 0, z: 0 });
      expect(w.x).toBeCloseTo(certo.x, 9);
      expect(w.y).toBeCloseTo(certo.y, 9);
      expect(w.z).toBeCloseTo(certo.z, 9);
    }
  });

  it('o ponto do contato é a origem da pose e o resto da mão encolhe com a escala', () => {
    const l = { x: 0, y: 0, z: 0 };
    ponte.local(...ponte.contato.ponto, l);
    expect(Math.hypot(l.x, l.y, l.z)).toBeLessThan(1e-12);
    ponte.local(0, 0, 0, l);
    const inteira = new MaoCalibrada(ponte.modelo, 'ponte_v', 1, true).local(0, 0, 0, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(l.x, l.y, l.z)).toBeCloseTo(Math.hypot(inteira.x, inteira.y, inteira.z) * ESCALA, 9);
  });

  it('a mão de trás e a da ponte são o espelho uma da outra: o polegar fica de lados opostos do taco', () => {
    // o polegar (osso `polegar_3`) em x do arquivo é negativo; no quadro, a esquerda o põe do lado `z` positivo e a direita do negativo
    const base = ponte.modelo;
    const i = base.ficha.ossos.findIndex((o) => o.nome === 'polegar_3');
    const p = { x: 0, y: 0, z: 0 };
    const c = ponte.cinematica('repouso').ponto(i, 0, 0, 0, { x: 0, y: 0, z: 0 });
    const esquerda = ponte.local(c.x, c.y, c.z, p).z;
    const direita = new MaoCalibrada(base, 'ponte_v', ESCALA, false).local(c.x, c.y, c.z, { x: 0, y: 0, z: 0 }).z;
    expect(Math.sign(esquerda)).toBe(-Math.sign(direita));
    expect(esquerda).toBeCloseTo(-direita, 9);
  });
});

describe('MaoCalibrada: as esferas e o fundo', () => {
  for (const [nome, qual] of [
    ['ponte_v', () => ponte],
    ['punho', () => punho],
  ] as const) {
    it(`${nome}: as esferas cobrem a pele (nenhum ponto a mais de 1,5 cm de uma esfera) e a mão tem esferas de sobra`, () => {
      const mao = qual();
      const esferas = mao.esferas(nome);
      expect(esferas.length).toBeGreaterThanOrEqual(20);
      const v = pele(nome);
      const l = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < v.length; i += 3) {
        mao.local(v[i]!, v[i + 1]!, v[i + 2]!, l);
        const folga = Math.min(...esferas.map((e) => Math.hypot(l.x - e.x, l.y - e.y, l.z - e.z) - e.r));
        expect(folga).toBeLessThan(0.015);
      }
    });
  }

  it('o fundo da ponte é o que a pele desce abaixo do eixo do taco: uns 4 a 6 cm na escala do jogo', () => {
    const fundo = ponte.fundo('ponte_v');
    expect(fundo).toBeGreaterThan(0.04);
    expect(fundo).toBeLessThan(0.06);
    const v = pele('ponte_v');
    const l = { x: 0, y: 0, z: 0 };
    let menor = Infinity;
    for (let i = 0; i < v.length; i += 3) menor = Math.min(menor, ponte.local(v[i]!, v[i + 1]!, v[i + 2]!, l).y);
    expect(fundo).toBeCloseTo(-menor, 2);
  });
});

describe('MaoCalibrada: o taco no V', () => {
  it('o taco da ponte não atravessa a pele mais que 3 mm na escala do jogo', () => {
    // O taco do jogo, no ponto da ponte (recuo de repouso + distância da ponte), tem o raio do cone; o eixo dele é o x da pose.
    const raio = raioDoCone(TACO, CONFIG_WEB.tacada.recuoInicial + CONFIG_WEB.maos.ponte.distancia);
    const v = pele('ponte_v');
    const l = { x: 0, y: 0, z: 0 };
    let pior = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      ponte.local(v[i]!, v[i + 1]!, v[i + 2]!, l);
      if (Math.abs(l.x) > 0.06) continue;
      pior = Math.max(pior, raio - Math.hypot(l.y, l.z));
    }
    expect(pior).toBeLessThan(0.003);
  });

  it('a mão de trás, no punho (mais grosso que o taco do artista), afunda no taco menos que 4 mm', () => {
    const raio = raioDoCone(TACO, CONFIG_WEB.maos.punho.agarre);
    const v = pele('punho');
    const l = { x: 0, y: 0, z: 0 };
    let pior = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      punho.local(v[i]!, v[i + 1]!, v[i + 2]!, l);
      if (Math.abs(l.x) > 0.06) continue;
      pior = Math.max(pior, raio - Math.hypot(l.y, l.z));
    }
    expect(pior).toBeLessThan(0.004);
  });
});

describe('MaoCalibrada: o cubo de giz na pinça', () => {
  const cubo: PoseDeMao = { x: 0.5, y: 0.03, z: 0.1, dx: 0, dy: -1, dz: 0, ux: -1, uy: 0, uz: 0 };

  it('a mão que pinça tem o centro do contato no centro do cubo, e o cubo na mão volta ao quadro de onde saiu', () => {
    const pinca = ponte.modelo.contatos.pincas.get('pinca')!;
    const mao = ponte.poseQuePinca(pinca, cubo, poseVaziaDeMao());
    const quadro = ponte.quadro(mao, 1, quadroVazio());
    const centro = pontoNoMundo(quadro, ponte.colocacao, ...pinca.centro, { x: 0, y: 0, z: 0 });
    expect(centro.x).toBeCloseTo(cubo.x, 9);
    expect(centro.y).toBeCloseTo(cubo.y, 9);
    expect(centro.z).toBeCloseTo(cubo.z, 9);
    const de = ponte.cuboNaPose(pinca, mao, poseVaziaDeMao());
    for (const k of ['x', 'y', 'z', 'dx', 'dy', 'dz', 'ux', 'uy', 'uz'] as const) expect(de[k]).toBeCloseTo(cubo[k], 3);
  });

  it('o cubo do jogo (aresta × escala) cabe na pinça: a pele não o atravessa mais que 3 mm', () => {
    const pinca = ponte.modelo.contatos.pincas.get('pinca')!;
    const meio = CONFIG_WEB.maos.giz.cubo.lado / 2;
    expect(CONFIG_WEB.maos.giz.cubo.lado).toBeCloseTo(pinca.aresta * ESCALA, 3);
    const v = pele('pinca');
    // o cubo no quadro da mão do arquivo: eixos n, lado e n × lado, centrado em `centro`, de meia-aresta `meio / escala`
    const n = pinca.pinca;
    const e1 = pinca.lado;
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const m = meio / ESCALA;
    let pior = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      const d = [v[i]! - pinca.centro[0], v[i + 1]! - pinca.centro[1], v[i + 2]! - pinca.centro[2]];
      const proj = [n, e1, e2].map((e) => Math.abs(d[0]! * e[0]! + d[1]! * e[1]! + d[2]! * e[2]!) - m);
      const fora = Math.hypot(...proj.map((p) => Math.max(p, 0)));
      pior = Math.max(pior, -(fora > 0 ? fora : Math.max(...proj)) * ESCALA);
    }
    expect(pior).toBeLessThan(0.003);
  });
});

describe('pontasNoMundo (a conta independente do teste)', () => {
  it('sem dobra a mais, a ponta é a da pose do arquivo e a dobra positiva a leva para baixo', () => {
    const p = pose();
    const sem = pontasNoMundo(ponte, [0, 0, 0, 0], p);
    const com = pontasNoMundo(ponte, [0.3, 0.3, 0.3, 0.3], p);
    for (const d of DEDOS_LONGOS) expect(com[d].y).toBeLessThan(sem[d].y - 0.003);
  });

  it('a pose de repouso do esqueleto é um ponto de partida válido', () => {
    expect(poseDeRepouso(ponte.modelo.ficha).rotacoes.length).toBe(4 * ponte.modelo.ficha.ossos.length);
  });
});

describe('MaoCalibrada: o giro no pano, com o V fixo no taco', () => {
  const GIRO = (40 * Math.PI) / 180;
  let girada: MaoCalibrada;
  beforeAll(async () => {
    girada = new MaoCalibrada((await maoDoArtista()).modelo, 'ponte_v', ESCALA, true, GIRO);
  });

  it('o contato continua na origem e a altura não muda: só o plano do pano gira', () => {
    const l = { x: 0, y: 0, z: 0 };
    girada.local(...girada.contato.ponto, l);
    expect(Math.hypot(l.x, l.y, l.z)).toBeLessThan(1e-12);
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    for (const [x, y, z] of [[0.03, 0.15, -0.02], [-0.07, 0.08, 0.03], [0.0, -0.05, 0.0]] as const) {
      ponte.local(x, y, z, a);
      girada.local(x, y, z, b);
      expect(b.y).toBeCloseTo(a.y, 12);
      expect(Math.hypot(b.x, b.z)).toBeCloseTo(Math.hypot(a.x, a.z), 12);
      let volta = Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x);
      volta = Math.atan2(Math.sin(volta), Math.cos(volta));
      expect(volta).toBeCloseTo(GIRO, 9);
    }
  });

  it('os dedos vão para a direita de quem joga e o pulso para a esquerda e para trás', () => {
    const l = { x: 0, y: 0, z: 0 };
    const pulso = girada.local(0, 0, 0, l);
    const semGiro = ponte.local(0, 0, 0, { x: 0, y: 0, z: 0 });
    expect(pulso.z).toBeLessThan(semGiro.z);
    const dedo = girada.local(...girada.contato.ponto.map((v, i) => (i === 1 ? v + 0.1 : v)) as [number, number, number], l);
    expect(dedo.z).toBeGreaterThan(0);
    expect(dedo.x).toBeGreaterThan(0);
  });

  it('um ponto da mão no quadro da pose cai onde o pacote o põe no mundo, também girada', () => {
    const p = pose();
    const quadro = girada.quadro(p, 1, quadroVazio());
    const l = { x: 0, y: 0, z: 0 };
    const w = { x: 0, y: 0, z: 0 };
    for (const [x, y, z] of [[0, 0, 0], [-0.04, 0.06, 0.035], [0.03, 0.15, -0.02], [-0.07, 0.08, 0.03]] as const) {
      girada.local(x, y, z, l);
      noMundo(p, l.x, l.y, l.z, w);
      const certo = pontoNoMundo(quadro, girada.colocacao, x, y, z, { x: 0, y: 0, z: 0 });
      expect(w.x).toBeCloseTo(certo.x, 9);
      expect(w.y).toBeCloseTo(certo.y, 9);
      expect(w.z).toBeCloseTo(certo.z, 9);
    }
  });

  it('a pinça do giz continua exata: o centro do contato no centro do cubo e o cubo volta de onde saiu', () => {
    const cubo: PoseDeMao = { x: 0.5, y: 0.03, z: 0.1, dx: 0, dy: -1, dz: 0, ux: -1, uy: 0, uz: 0 };
    const pinca = girada.modelo.contatos.pincas.get('pinca')!;
    const mao = girada.poseQuePinca(pinca, cubo, poseVaziaDeMao());
    const quadro = girada.quadro(mao, 1, quadroVazio());
    const centro = pontoNoMundo(quadro, girada.colocacao, ...pinca.centro, { x: 0, y: 0, z: 0 });
    expect(centro.x).toBeCloseTo(cubo.x, 9);
    expect(centro.y).toBeCloseTo(cubo.y, 9);
    expect(centro.z).toBeCloseTo(cubo.z, 9);
    const de = girada.cuboNaPose(pinca, mao, poseVaziaDeMao());
    for (const k of ['x', 'y', 'z', 'dx', 'dy', 'dz', 'ux', 'uy', 'uz'] as const) expect(de[k]).toBeCloseTo(cubo[k], 3);
  });
});
