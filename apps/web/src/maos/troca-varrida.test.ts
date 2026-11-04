import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, MESA_BAR, TACO } from '@sinuca/fisica';
import { misturarQuadros, pelarMalha, pontoNoMundo, quadroVazio, type PoseDaFicha, type Quadro } from '@sinuca/personagens';
import { CONFIG_WEB } from '../config';
import { obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { eixoDoTaco, type EixoDoTaco } from './eixo';
import { MaosDoJogador } from './maos-do-jogador';
import { maoDoArtista } from './para-testes';
import { bolasVazias, escolherPonte, poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';
import { PONTES, poseDaPonteNomeada, type NomeDaPonte } from './pontes';
import { afastarQuadro, TrocaDePonte } from './troca-de-ponte';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;
const RECUO_MAXIMO = CONFIG_WEB.tacada.recuoMaximo;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg = CONFIG_WEB.maos;
const troca = cfg.escolha.troca;
const BASE = await maoDoArtista();
const MALHA = BASE.malha('alta');

/** O quanto a troca pode somar à pele no taco (m), além do que as duas pontes já têm paradas naquela elevação (L65b). */
const ACEITO = 0.0025;
/** O maior salto de um vértice da pele entre dois quadros (m): a troca antiga (0,15 s, mistura linear) chegava a 96 mm; esta, que abre e fecha os dedos, a 72 mm. */
const SALTO_MAXIMO = 0.08;
/** A elevada só vale com o taco a `elevacaoMinimaGraus` ou mais: abaixo disso a pose parada dela (7 mm no taco) nunca aparece. */
const ELEVACAO_MINIMA_DA_ELEVADA = (cfg.escolha.elevada.elevacaoMinimaGraus * Math.PI) / 180;

const ELEVACOES = [0.05, 0.15, 0.3, 0.5, 0.75];

interface Cena {
  eixo: EixoDoTaco;
  poses: Map<NomeDaPonte, PoseDeMao>;
}

/** O taco em `elevacao` e cada ponte onde `escolherPonte` a poria, sem bolas em volta. */
function cena(maos: MaosDoJogador, elevacao: number): Cena {
  const eixo = eixoDoTaco(-0.4, R, 0.1, R, 0, elevacao, REPOUSO, 0, 0);
  const conjuntos = (maos as unknown as { conjuntos: Record<NomeDaPonte, { cfg: { distancia: number }; esferas: never[]; subidaDosDedos: (p: PoseDeMao) => number }> }).conjuntos;
  const poses = new Map<NomeDaPonte, PoseDeMao>();
  for (const nome of PONTES) {
    const c = conjuntos[nome];
    const pose = poseVaziaDeMao();
    c.cfg.distancia = 0.27;
    escolherPonte(eixo, REPOUSO, obstaculos, bolasVazias(), c.cfg as never, null, c.esferas, pose, c.subidaDosDedos, false);
    poses.set(nome, pose);
  }
  return { eixo, poses };
}

/** Quanto a pele entra no cone do taco (m, o pior): como o jogo desenha o taco, de `ao` -1 cm à base. */
function entraNoTaco(pele: Float64Array, eixo: EixoDoTaco): number {
  let pior = 0;
  for (let v = 0; v < pele.length; v += 3) {
    const mx = pele[v]! - eixo.px;
    const my = pele[v + 1]! - eixo.py;
    const mz = pele[v + 2]! - eixo.pz;
    const ao = -(mx * eixo.dx + my * eixo.dy + mz * eixo.dz);
    if (ao < -0.01 || ao > TACO.comprimento) continue;
    const d = Math.hypot(mx + eixo.dx * ao, my + eixo.dy * ao, mz + eixo.dz * ao);
    pior = Math.max(pior, TACO.raioPonta + ((TACO.raioBase - TACO.raioPonta) * Math.max(ao, 0)) / TACO.comprimento - d);
  }
  return pior;
}

/** O quanto a pele afunda sob o pano (m, y = 0). */
function afundaNoPano(pele: Float64Array): number {
  let menor = 0;
  for (let v = 1; v < pele.length; v += 3) menor = Math.min(menor, pele[v]!);
  return -menor;
}

/** A pose de ficha entre `a` e `b` (rotação pelo caminho curto, posição em linha reta): o que o desenho faz com os dois pesos. */
function entre(a: PoseDaFicha, b: PoseDaFicha, t: number, saida: PoseDaFicha): void {
  for (let i = 0; i < a.rotacoes.length; i += 4) {
    let dot = 0;
    for (let k = 0; k < 4; k++) dot += a.rotacoes[i + k]! * b.rotacoes[i + k]!;
    const s = dot < 0 ? -1 : 1;
    let norma = 0;
    for (let k = 0; k < 4; k++) {
      saida.rotacoes[i + k] = a.rotacoes[i + k]! * (1 - t) + b.rotacoes[i + k]! * s * t;
      norma += saida.rotacoes[i + k]! ** 2;
    }
    norma = Math.sqrt(norma) || 1;
    for (let k = 0; k < 4; k++) saida.rotacoes[i + k] = saida.rotacoes[i + k]! / norma;
  }
  for (let i = 0; i < a.posicoes.length; i++) saida.posicoes[i] = a.posicoes[i]! + (b.posicoes[i]! - a.posicoes[i]!) * t;
}

interface Medida {
  /** O pior quanto a pele entra no taco (m) e em que quadro. */
  pior: number;
  quadro: number;
  /** O pior afundar sob o pano (m). */
  pano: number;
  /** O maior salto de um vértice entre dois quadros (m). */
  salto: number;
  quadros: number;
}

/**
 * Mede a troca de `de` para `para` quadro a quadro (60 por segundo), como `cena/maos.ts` a desenha: a pose do esqueleto vem da
 * fase (a de saída, a aberta ou a de chegada, misturada pelo peso `abertura`) e o quadro da mão vai do de saída, afastado pela
 * rota dele, ao de chegada, afastado pela dele. Sem dedos plantados.
 */
function medirATroca(maos: MaosDoJogador, c: Cena, de: NomeDaPonte, para: NomeDaPonte): Medida {
  const ficha = BASE.modelo.ficha;
  const aberta = ficha.poses.get(troca.aberta)!;
  const poseDe = ficha.poses.get(poseDaPonteNomeada(de))!;
  const posePara = ficha.poses.get(poseDaPonteNomeada(para))!;
  const misturada: PoseDaFicha = { rotacoes: poseDe.rotacoes.slice(), posicoes: poseDe.posicoes.slice() };
  const calibDe = maos.calibradaDa(de);
  const calibPara = maos.calibradaDa(para);
  const qDe: Quadro = quadroVazio();
  const qPara: Quadro = quadroVazio();
  const q: Quadro = quadroVazio();
  const colocacao = { escala: calibPara.escala, espelho: true };
  const pele = new Float64Array(MALHA.posicoes.length);
  const mundo = new Float64Array(MALHA.posicoes.length);
  const anterior = new Float64Array(MALHA.posicoes.length);
  const p = { x: 0, y: 0, z: 0 };
  const t = new TrocaDePonte(troca);
  t.iniciar(de, para, c.poses.get(de)!, troca.duracaoS);
  let pior = 0;
  let quadro = 0;
  let pano = 0;
  let salto = 0;
  let n = 0;
  while (t.ativa) {
    t.atualizar(1 / 60);
    n++;
    entre(t.fase === 'chegada' ? posePara : poseDe, aberta, t.abertura, misturada);
    pelarMalha(ficha, MALHA, misturada, pele);
    calibDe.quadro(c.poses.get(de)!, 1, qDe);
    calibPara.quadro(c.poses.get(para)!, 1, qPara);
    afastarQuadro(qDe, c.poses.get(de)!, t.afastaDe, 1);
    afastarQuadro(qPara, c.poses.get(para)!, t.afastaPara, 1);
    misturarQuadros(qDe, qPara, t.viagem, q);
    for (let v = 0; v < pele.length; v += 3) {
      pontoNoMundo(q, colocacao, pele[v]!, pele[v + 1]!, pele[v + 2]!, p);
      mundo[v] = p.x;
      mundo[v + 1] = p.y;
      mundo[v + 2] = p.z;
    }
    const entra = entraNoTaco(mundo, c.eixo);
    if (entra > pior) {
      pior = entra;
      quadro = n;
    }
    pano = Math.max(pano, afundaNoPano(mundo));
    if (n > 1) for (let v = 0; v < mundo.length; v += 3) salto = Math.max(salto, Math.hypot(mundo[v]! - anterior[v]!, mundo[v + 1]! - anterior[v + 1]!, mundo[v + 2]! - anterior[v + 2]!));
    anterior.set(mundo);
  }
  return { pior, quadro, pano, salto, quadros: n };
}

/** A pele de uma ponte parada no lugar dela: o que ela já entra no taco e afunda no pano (m). */
function parada(maos: MaosDoJogador, c: Cena, ponte: NomeDaPonte): { taco: number; pano: number } {
  const ficha = BASE.modelo.ficha;
  const calib = maos.calibradaDa(ponte);
  const pele = pelarMalha(ficha, MALHA, ficha.poses.get(poseDaPonteNomeada(ponte))!, new Float64Array(MALHA.posicoes.length));
  const q = calib.quadro(c.poses.get(ponte)!, 1, quadroVazio());
  const p = { x: 0, y: 0, z: 0 };
  for (let v = 0; v < pele.length; v += 3) {
    pontoNoMundo(q, { escala: calib.escala, espelho: true }, pele[v]!, pele[v + 1]!, pele[v + 2]!, p);
    pele[v] = p.x;
    pele[v + 1] = p.y;
    pele[v + 2] = p.z;
  }
  return { taco: entraNoTaco(pele, c.eixo), pano: afundaNoPano(pele) };
}

describe('a troca de ponte, quadro a quadro (L65b)', () => {
  const maos = new MaosDoJogador(cfg, obstaculos, R, REPOUSO, RECUO_MAXIMO, () => 0.1);
  maos.calibrar(BASE.modelo);

  it('a troca dura o que a config manda, em quadros de 1/60 s, e a viagem só cresce', () => {
    const t = new TrocaDePonte(troca);
    t.iniciar('v', 'laco', poseVaziaDeMao(), troca.duracaoS);
    let quadros = 0;
    let anterior = 0;
    while (t.ativa) {
      t.atualizar(1 / 60);
      expect(t.viagem).toBeGreaterThanOrEqual(anterior);
      anterior = t.viagem;
      quadros++;
    }
    expect(quadros).toBe(Math.round(troca.duracaoS * 60));
    expect(troca.duracaoS).toBeLessThanOrEqual(0.25);
  });

  const pares: [NomeDaPonte, NomeDaPonte][] = [];
  for (const a of PONTES) for (const b of PONTES) if (a !== b) pares.push([a, b]);

  it.each(ELEVACOES)(
    'elevação %f rad: nos 30 pares a troca soma no máximo 2,5 mm de pele no taco e no pano ao que as pontes já têm paradas, sem salto de mais de 8 cm entre quadros',
    (elevacao) => {
      const c = cena(maos, elevacao);
      const falhas: string[] = [];
      let n = 0;
      for (const [de, para] of pares) {
        if ((de === 'elevada' || para === 'elevada') && elevacao < ELEVACAO_MINIMA_DA_ELEVADA) continue;
        n++;
        const a = parada(maos, c, de);
        const b = parada(maos, c, para);
        const m = medirATroca(maos, c, de, para);
        const tetoTaco = Math.max(a.taco, b.taco, 0) + ACEITO;
        const tetoPano = Math.max(a.pano, b.pano) + ACEITO;
        const nome = `${de} -> ${para}`;
        if (m.pior >= tetoTaco) falhas.push(`${nome}: taco ${(m.pior * 1000).toFixed(1)} mm no quadro ${m.quadro} (teto ${(tetoTaco * 1000).toFixed(1)})`);
        if (m.pano >= tetoPano) falhas.push(`${nome}: pano ${(m.pano * 1000).toFixed(1)} mm (teto ${(tetoPano * 1000).toFixed(1)})`);
        if (m.salto >= SALTO_MAXIMO) falhas.push(`${nome}: salto ${(m.salto * 1000).toFixed(0)} mm entre quadros`);
        expect(m.quadros).toBe(Math.round(troca.duracaoS * 60));
      }
      expect(n).toBeGreaterThanOrEqual(20);
      expect(falhas).toEqual([]);
    },
    60_000,
  );
});
