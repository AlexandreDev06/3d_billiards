import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, type EstadoMesa } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { poseDaCameraDeTacada } from '../controles/camera-tacada';
import { ElevacaoDoTaco, obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm } from './apoio';
import { eixoDoTaco, pontoDoTaco, type EixoDoTaco, type Vec3 } from './eixo';
import { MaoCalibrada } from './mao-calibrada';
import { MaosDoJogador, type EntradaDasMaos, type EsferaMutavel } from './maos-do-jogador';
import { maoDoArtista, peleNoMundo } from './para-testes';
import { dobraDoAgarre, escalaDoAgarre, pulsoQueCabe, raioDoTacoA } from './agarre-no-taco';
import { poseDaPonteNomeada } from './pontes';
import { poseDoPunho, poseVaziaDeMao } from './pose-das-maos';
import { projetorDeAgulha } from './projetor';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HZ = MESA_BAR.largura / 2;
const HX = MESA_BAR.comprimento / 2;
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;
const RECUO_MAXIMO = CONFIG_WEB.tacada.recuoMaximo;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg = CONFIG_WEB.maos;
const BASE = await maoDoArtista();
const MODELO = BASE.modelo;
const TODOS = ['indicador', 'medio', 'anelar', 'minimo', 'polegar'] as const;

interface Cena {
  readonly nome: string;
  readonly x: number;
  readonly z: number;
  readonly angulo: number;
  readonly recuo?: number;
  readonly vertical?: number;
  readonly lateral?: number;
  readonly outras?: readonly (readonly [number, number])[];
}

const CENAS: readonly Cena[] = [
  { nome: 'meio', x: -0.4, z: 0.1, angulo: 0 },
  { nome: 'efeito alto', x: -0.4, z: 0, angulo: 0, vertical: 0.6 },
  { nome: 'efeito baixo', x: -0.4, z: 0, angulo: 0, vertical: -0.6 },
  { nome: 'efeito de lado', x: -0.4, z: 0, angulo: 0, lateral: 0.5, vertical: 0.4 },
  { nome: 'puxado', x: -0.4, z: 0.1, angulo: 0, recuo: REPOUSO + 0.6 * (RECUO_MAXIMO - REPOUSO) },
  { nome: 'bola logo atras', x: -0.4, z: 0.1, angulo: 0, outras: [[-0.4 - 0.09, 0.1]] },
  { nome: 'perto da tabela', x: 0.5, z: HZ - 0.05, angulo: -0.9 },
  { nome: 'colada ao longo', x: -0.3, z: HZ - R, angulo: -0.25 },
  { nome: 'colada de frente', x: 0.1, z: HZ - R, angulo: -Math.PI / 2 },
  { nome: 'colada de frente, puxado', x: 0.1, z: HZ - R, angulo: -Math.PI / 2, recuo: REPOUSO + 0.6 * (RECUO_MAXIMO - REPOUSO) },
  { nome: 'canto', x: -(HX - R - 0.03), z: HZ - R - 0.03, angulo: -Math.PI / 4 },
  { nome: 'junto da cacapa do meio', x: 0.3, z: HZ - R - 0.004, angulo: 0 },
  { nome: 'perto da cacapa do canto', x: HX - 0.06, z: HZ - 0.1, angulo: Math.PI + 0.35 },
  { nome: 'cabo alto na tabela curta', x: HX - 0.07, z: -0.2, angulo: Math.PI },
];

function montar(c: Cena) {
  const recuo = c.recuo ?? REPOUSO;
  const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x: c.x, z: c.z }), ...(c.outras ?? []).map(([ox, oz], i) => bolaParada(i + 1, { x: ox, z: oz }))] };
  const elevacaoDoTaco = new ElevacaoDoTaco(obstaculos, TACO, R, r, CONFIG_WEB.elevacaoDoTaco);
  elevacaoDoTaco.definirBolas(mesa);
  const elevacao = elevacaoDoTaco.atualizar(1, c.angulo, c.lateral ?? 0, c.vertical ?? 0, recuo, c.x, c.z);
  const p = poseDaCameraDeTacada({ x: c.x, y: R, z: c.z, angulo: c.angulo, elevacaoDoTaco: elevacao, recuo, zoom: 1 }, CONFIG_WEB.camera.tacada, { raioBolao: R, taco: TACO });
  const projetor = projetorDeAgulha([p.x, p.y, p.z], [p.olharX, p.olharY, p.olharZ], CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9);
  const entrada: EntradaDasMaos = { x: c.x, y: R, z: c.z, angulo: c.angulo, elevacao, recuo, lateral: c.lateral ?? 0, vertical: c.vertical ?? 0, ativas: true, soAPonte: false };
  const protegidas: EsferaMutavel[] = [
    { x: c.x, y: R, z: c.z, r: R },
    { x: c.x + Math.cos(c.angulo) * 0.3, y: r, z: c.z + Math.sin(c.angulo) * 0.3, r },
  ];
  return { mesa, entrada, projetor, protegidas, elevacao };
}

function assentadas(c: Cena) {
  const q = montar(c);
  const m = new MaosDoJogador(cfg, obstaculos, R, REPOUSO, RECUO_MAXIMO, () => 0.1);
  m.calibrar(MODELO);
  m.definirBolas(q.mesa, r);
  m.atualizar(1, q.entrada, q.projetor, q.protegidas);
  m.atualizar(1, q.entrada, q.projetor, q.protegidas);
  return { m, q };
}

/** O eixo do taco como o jogo o desenha, com o efeito. */
function eixoDe(q: ReturnType<typeof montar>): EixoDoTaco {
  const e = q.entrada;
  return eixoDoTaco(e.x, R, e.z, R, e.angulo, q.elevacao, e.recuo, e.lateral, e.vertical);
}

/** O quanto a pele (3 números por vértice, no mundo) entra no taco (m, o pior) e em quantos vértices passa de `limite`. */
function peleNoTaco(pele: Float64Array, eixo: EixoDoTaco, limite = 0.0015): { pior: number; quantos: number } {
  let pior = 0;
  let quantos = 0;
  for (let v = 0; v < pele.length; v += 3) {
    const mx = pele[v]! - eixo.px;
    const my = pele[v + 1]! - eixo.py;
    const mz = pele[v + 2]! - eixo.pz;
    const ao = -(mx * eixo.dx + my * eixo.dy + mz * eixo.dz);
    if (ao < -0.01 || ao > TACO.comprimento) continue;
    const d = Math.hypot(mx + eixo.dx * ao, my + eixo.dy * ao, mz + eixo.dz * ao);
    const raio = TACO.raioPonta + ((TACO.raioBase - TACO.raioPonta) * Math.max(ao, 0)) / TACO.comprimento;
    const entra = raio - d;
    if (entra > limite) quantos++;
    if (entra > pior) pior = entra;
  }
  return { pior, quantos };
}

/** O quanto a pele afunda no que a sustenta (m, o pior): pano, borracha ou moldura. */
function peleNoApoio(pele: Float64Array): { pior: number; quantos: number } {
  let pior = 0;
  let quantos = 0;
  for (let v = 0; v < pele.length; v += 3) {
    const chao = alturaDoApoioEm(obstaculos, pele[v]!, pele[v + 2]!);
    if (chao === -Infinity) continue;
    const afunda = chao - pele[v + 1]!;
    if (afunda > 0.002) quantos++;
    if (afunda > pior) pior = afunda;
  }
  return { pior, quantos };
}

/** A tolerância do jogo para a pele no taco (`ponte.penetracaoNoTaco`) e o que o resto da pele pode passar dela (m). */
const TOLERANCIA = cfg.ponte.penetracaoNoTaco;
const FOLGA_DA_MEDIDA = 0.0015;

describe('a mão da ponte não atravessa o taco nem o apoio (L63)', () => {
  it.each(CENAS)('$nome: o taco passa pelo V ou pelo anel e a pele não afunda no pano nem na madeira', (c) => {
    const { m, q } = assentadas(c);
    const eixo = eixoDe(q);
    const ponte = peleNoMundo(m.calibradaAtual, BASE, m.ponte, poseDaPonteNomeada(m.ponteAtual), undefined, Array.from(m.dobrasDaPonte));
    expect(peleNoTaco(ponte, eixo).pior).toBeLessThan(0.0025);
    expect(peleNoApoio(ponte).pior).toBeLessThan(0.002);
  });

  it.each(CENAS)('$nome: o punho segura o taco sem atravessá-lo e não afunda no pano nem na madeira, nem apertando', (c) => {
    const { m, q } = assentadas(c);
    if (!m.punhoVisivel) return;
    const eixo = eixoDe(q);
    const pele = peleNoMundo(m.punhoCalibrado!, BASE, m.punho, 'punho', TODOS, [1, 1, 1, 1, 1].map((v) => v * m.fechoDoPunho));
    expect(peleNoTaco(pele, eixo).pior).toBeLessThan(TOLERANCIA + FOLGA_DA_MEDIDA);
    expect(peleNoApoio(pele).pior).toBeLessThan(0.002);
  });

  it('o laço e o V descem ao mesmo lugar sob o taco: efeito por baixo não manda a mão para longe da bola', () => {
    const { m } = assentadas(CENAS[2]!);
    expect(m.ponteAtual).toBe('laco');
    expect(m.distanciaDaPonte).toBeLessThan(cfg.escolha.laco.distanciaEntra);
  });
});

describe('a mão de trás: o agarre no raio do taco, em todo agarre, pulso e aperto', () => {
  it('o raio do taco do jogo cresce da ponta (`raioPonta`) ao cabo (`raioBase`)', () => {
    expect(raioDoTacoA(0)).toBeCloseTo(TACO.raioPonta, 9);
    expect(raioDoTacoA(TACO.comprimento)).toBeCloseTo(TACO.raioBase, 9);
    expect(raioDoTacoA(0.7)).toBeCloseTo(TACO.raioPonta + (TACO.raioBase - TACO.raioPonta) * (0.7 / TACO.comprimento), 9);
    expect(raioDoTacoA(5)).toBeCloseTo(TACO.raioBase, 9);
  });

  it('a mão cresce na razão dos raios onde o taco é mais grosso que o do artista, e nunca encolhe', () => {
    const punho = new MaoCalibrada(MODELO, 'punho', cfg.escala, false);
    const doArtista = punho.contato.distanciaDoFim;
    expect(escalaDoAgarre(punho, 0.3)).toBe(1);
    expect(escalaDoAgarre(punho, doArtista)).toBeCloseTo(1, 9);
    expect(escalaDoAgarre(punho, 1.3)).toBeCloseTo(raioDoTacoA(1.3) / raioDoTacoA(doArtista), 9);
    expect(escalaDoAgarre(punho, 1.3)).toBeGreaterThan(1.05);
  });

  const { m, q } = assentadas(CENAS[0]!);
  const eixo = eixoDe(q);
  const curva = (m as unknown as { curvaDoPunho: Parameters<typeof dobraDoAgarre>[0] }).curvaDoPunho;
  const ponto: Vec3 = { x: 0, y: 0, z: 0 };
  const pose = poseVaziaDeMao();
  const AGARRES = [0.3, 0.5, 0.66, 0.9, 1.1, 1.3];
  const PULSOS = [-cfg.vida.pulso.maximo, -0.1, 0, 0.1, cfg.vida.pulso.maximo];

  for (const agarre of AGARRES) {
    for (const pedido of PULSOS) {
      it(`agarre a ${agarre} m, pulso pedido ${pedido} rad, apertando: a pele não entra no taco`, () => {
        const pulso = pulsoQueCabe(curva, m.punhoCalibrado!, agarre, pedido, TOLERANCIA);
        const fecho = dobraDoAgarre(curva, m.punhoCalibrado!, agarre, pulso, cfg.vida.aperto.rad, TOLERANCIA);
        poseDoPunho(eixo, pontoDoTaco(eixo, agarre, ponto), cfg.punho, pose);
        const maior = new MaoCalibrada(MODELO, 'punho', cfg.escala * escalaDoAgarre(m.punhoCalibrado!, agarre), false);
        const pele = peleNoMundo(maior, BASE, pose, 'punho', TODOS, [fecho, fecho, fecho, fecho, fecho], { osso: 'pulso', eixo: cfg.vida.pulso.eixo, rad: pulso });
        expect(Math.abs(pulso)).toBeLessThanOrEqual(Math.abs(pedido) + 1e-9);
        expect(peleNoTaco(pele, eixo).pior).toBeLessThan(TOLERANCIA + FOLGA_DA_MEDIDA);
      });
    }
  }
});
