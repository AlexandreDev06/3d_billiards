import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { eixoDoTaco, eixoVazio } from './eixo';
import { MaoCalibrada } from './mao-calibrada';
import {
  agarreDaMaoDeTras,
  caixaDasEsferas,
  caixaVazia,
  caixasSeSobrepoem,
  folgaVertical,
  fracaoVisivel,
  lugarVazio,
  type CaixaNaTela,
} from './lugar-da-mao-de-tras';
import { maoDoArtista } from './para-testes';
import { poseDoPunho, poseVaziaDeMao } from './pose-das-maos';
import { projetorDeAgulha } from './projetor';

const cfg = CONFIG_WEB.maos.punho;
const R = CONFIG_FISICA_PADRAO.bolao.raio;
const ESFERAS = new MaoCalibrada((await maoDoArtista()).modelo, 'punho', CONFIG_WEB.maos.escala, false).esferas('punho');

const caixa = (minX: number, maxX: number, minY: number, maxY: number): CaixaNaTela => ({ minX, maxX, minY, maxY, maisPerto: 1 });

describe('fracaoVisivel e folgaVertical: a conta da tela', () => {
  it('a fração é a parte da altura da caixa acima da borda de baixo da tela (y = -1)', () => {
    expect(fracaoVisivel(caixa(0, 0.2, -0.5, -0.1))).toBe(1);
    expect(fracaoVisivel(caixa(0, 0.2, -1.2, -0.8))).toBeCloseTo(0.5, 12);
    expect(fracaoVisivel(caixa(0, 0.2, -1.3, -1))).toBe(0);
    expect(fracaoVisivel(caixa(0, 0.2, -1.5, -1.2))).toBe(0);
  });

  it('a folga é a distância vertical da base de uma caixa ao topo da outra (negativa quando se cruzam)', () => {
    expect(folgaVertical(caixa(0, 1, 0, 0.4), caixa(0, 1, -1, -0.5))).toBeCloseTo(0.5, 12);
    expect(folgaVertical(caixa(0, 1, 0, 0.4), caixa(0, 1, -1, 0.1))).toBeCloseTo(-0.1, 12);
  });

  it('se sobrepõem só quando se cruzam nos dois eixos', () => {
    expect(caixasSeSobrepoem(caixa(0, 1, 0, 1), caixa(0.5, 2, 0.5, 2))).toBe(true);
    expect(caixasSeSobrepoem(caixa(0, 1, 0, 1), caixa(1.1, 2, 0.5, 2))).toBe(false);
    expect(caixasSeSobrepoem(caixa(0, 1, 0, 1), caixa(0.5, 2, 1.1, 2))).toBe(false);
  });
});

describe('caixaDasEsferas: o retângulo que a mão ocupa na tela', () => {
  const projetor = projetorDeAgulha([-1.4, 0.42, 0], [0.1, 0, 0], 50, 16 / 9);
  const eixo = eixoDoTaco(-0.4, R, 0, R, 0, 0.1, 0.03, 0, 0, eixoVazio());

  it('uma mão ao longe cabe na tela e uma mais perto ocupa mais', () => {
    const longe = poseVaziaDeMao();
    const perto = poseVaziaDeMao();
    poseDoPunho(eixo, { x: -0.6, y: 0.03, z: 0 }, cfg, longe);
    poseDoPunho(eixo, { x: -1.0, y: 0.03, z: 0 }, cfg, perto);
    const a = caixaVazia();
    const b = caixaVazia();
    expect(caixaDasEsferas(ESFERAS, longe, projetor, a)).toBe(true);
    expect(caixaDasEsferas(ESFERAS, perto, projetor, b)).toBe(true);
    expect(b.maxY - b.minY).toBeGreaterThan(a.maxY - a.minY);
    expect(b.minY).toBeLessThan(a.minY);
  });

  it('atrás da câmera não há caixa', () => {
    const atras = poseVaziaDeMao();
    poseDoPunho(eixo, { x: -2, y: 0.03, z: 0 }, cfg, atras);
    expect(caixaDasEsferas(ESFERAS, atras, projetor, caixaVazia())).toBe(false);
  });
});

describe('agarreDaMaoDeTras: onde a mão de trás segura o taco', () => {
  const projetor = projetorDeAgulha([-1.4, 0.42, 0], [0.1, 0, 0], 50, 16 / 9);
  const eixo = eixoDoTaco(-0.4, R, 0, R, 0, 0.1, 0.03, 0, 0, eixoVazio());
  /** Uma ponte parada bem à frente, onde sobra pano de sobra para a mão de trás. */
  const ponte = caixa(-0.1, 0.1, -0.3, -0.05);
  const saida = lugarVazio();

  /** A caixa da mão de trás com o taco `e` e a mão a `q` m da ponta. */
  function caixaDaMao(e: typeof eixo, q: number): CaixaNaTela {
    const pose = poseVaziaDeMao();
    const c = caixaVazia();
    poseDoPunho(e, { x: e.px - e.dx * q, y: e.py - e.dy * q, z: e.pz - e.dz * q }, cfg, pose);
    caixaDasEsferas(ESFERAS, pose, projetor, c);
    return c;
  }

  it('sem ponte, a mão fica com a fração à mostra que cfg.visivelAlvo pede (se o taco chega lá)', () => {
    const { agarre, cabe } = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, null, saida);
    expect(cabe).toBe(true);
    const c = caixaDaMao(eixo, agarre);
    if (agarre < cfg.agarre - 1e-6) expect(fracaoVisivel(c)).toBeCloseTo(cfg.visivelAlvo, 1);
    else expect(fracaoVisivel(c)).toBeGreaterThanOrEqual(cfg.visivelAlvo - 1e-3);
  });

  it('com a ponte logo acima da mão livre, a mão desce pelo taco até sobrar a folga pedida', () => {
    const livre = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, null, lugarVazio()).agarre;
    const topoLivre = caixaDaMao(eixo, livre).maxY;
    // A ponte com a base à metade da folga pedida acima da mão: falta pano.
    const perto = caixa(-0.1, 0.1, topoLivre + cfg.folgaDaPonte, topoLivre + cfg.folgaDaPonte + 0.35);
    const { agarre, cabe } = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, perto, saida);
    expect(agarre).toBeGreaterThan(livre + 0.01);
    expect(cabe).toBe(true);
    expect(folgaVertical(perto, caixaDaMao(eixo, agarre))).toBeGreaterThanOrEqual(2 * cfg.folgaDaPonte - 1e-3);
  });

  it('com a ponte longe, a mão fica onde ficaria sem ela', () => {
    const livre = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, null, lugarVazio()).agarre;
    expect(agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, ponte, saida).agarre).toBeCloseTo(livre, 9);
  });

  it('uma ponte colada na borda de baixo não deixa pano para a mão: ela fica fora do quadro (cabe falso) em vez de amontoar', () => {
    const baixa = caixa(-0.1, 0.1, -1.1, -0.8);
    expect(agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, baixa, saida).cabe).toBe(false);
  });

  it('a mão nunca tem menos de visivelMinima à mostra, mesmo com a ponte pedindo mais folga: a folga cede', () => {
    const baixa = caixa(-0.1, 0.1, -0.8, -0.6);
    const { agarre } = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, baixa, saida);
    expect(fracaoVisivel(caixaDaMao(eixo, agarre))).toBeGreaterThanOrEqual(cfg.visivelMinima - 1e-3);
  });

  it('puxado o taco, a mão recua com ele mas para quando só resta a fração mínima: nunca some de vez', () => {
    const puxado = eixoDoTaco(-0.4, R, 0, R, 0, 0.1, 0.25, 0, 0, eixoVazio());
    const parado = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, ponte, lugarVazio());
    const { agarre } = agarreDaMaoDeTras(eixo, puxado, projetor, cfg, ESFERAS, ponte, saida);
    expect(agarre).toBeLessThanOrEqual(parado.agarre + 1e-9);
    expect(fracaoVisivel(caixaDaMao(puxado, agarre))).toBeGreaterThanOrEqual(cfg.visivelPuxada - 1e-3);
  });

  it('puxado um pouco, com a mão toda à mostra, ela recua junto: o agarre é o mesmo', () => {
    const longe = projetorDeAgulha([-3.5, 1.2, 0], [0.1, 0, 0], 50, 16 / 9);
    const um = eixoDoTaco(-0.4, R, 0, R, 0, 0.1, 0.03, 0, 0, eixoVazio());
    const dois = eixoDoTaco(-0.4, R, 0, R, 0, 0.1, 0.13, 0, 0, eixoVazio());
    const parado = agarreDaMaoDeTras(um, um, longe, cfg, ESFERAS, null, lugarVazio()).agarre;
    expect(agarreDaMaoDeTras(um, dois, longe, cfg, ESFERAS, null, saida).agarre).toBeCloseTo(parado, 9);
  });

  it('nunca passa do punho de verdade nem chega mais perto da ponta que o mínimo', () => {
    for (const camX of [-0.5, -1.4, -3.5]) {
      const longe = projetorDeAgulha([camX, 0.42, 0], [0.1, 0, 0], 50, 16 / 9);
      const { agarre } = agarreDaMaoDeTras(eixo, eixo, longe, cfg, ESFERAS, null, saida);
      expect(agarre).toBeLessThanOrEqual(cfg.agarre + 1e-9);
      expect(agarre).toBeGreaterThanOrEqual(cfg.agarreMinimo - 1e-9);
    }
  });

  it('é uma conta pura: a mesma entrada dá o mesmo resultado, e o objeto de saída é o devolvido', () => {
    const a = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, ponte, saida).agarre;
    const r2 = agarreDaMaoDeTras(eixo, eixo, projetor, cfg, ESFERAS, ponte, saida);
    expect(r2).toBe(saida);
    expect(r2.agarre).toBe(a);
  });
});
