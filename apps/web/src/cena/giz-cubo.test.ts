import type { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { poseVaziaDeMao } from '../maos/pose-das-maos';
import { PoeiraDeGiz } from '../maos/poeira-de-giz';
import { GizDaCena, MAXIMO_DE_PARTICULAS } from './giz-cubo';

const CFG = CONFIG_WEB.maos.giz;

function pose(x: number, y: number, z: number) {
  const p = poseVaziaDeMao();
  p.x = x;
  p.y = y;
  p.z = z;
  return p;
}

describe('GizDaCena', () => {
  it('nasce com o cubo escondido e sem pó', () => {
    const g = new GizDaCena(CFG, 13);
    expect(g.cuboVisivel).toBe(false);
    expect(g.particulasVisiveis).toBe(0);
    g.descartar();
  });

  it('mostra o cubo na pose, na escala pedida, e some com a escala quase zero', () => {
    const g = new GizDaCena(CFG, 13);
    g.mostrarCubo(pose(0.4, 0.8, -0.6), 1);
    expect(g.cuboVisivel).toBe(true);
    expect(g.posicaoDoCubo.toArray()).toEqual([0.4, 0.8, -0.6]);
    g.mostrarCubo(pose(0.4, 0.8, -0.6), 0.004);
    expect(g.cuboVisivel).toBe(false);
    g.mostrarCubo(pose(0, 0, 0), 1);
    g.esconderCubo();
    expect(g.cuboVisivel).toBe(false);
    g.descartar();
  });

  it('a covinha é a face de cima do cubo: com a normal em +Y a pose identidade não gira nada', () => {
    const g = new GizDaCena(CFG, 13);
    const p = pose(0, 0.9, 0);
    p.dx = 0;
    p.dy = 1;
    p.dz = 0;
    p.ux = 1;
    p.uy = 0;
    p.uz = 0;
    g.mostrarCubo(p, 1);
    const cubo = g.grupo.getObjectByName('giz-cubo')!;
    expect(cubo.quaternion.angleTo(cubo.quaternion.clone().identity())).toBeCloseTo(0, 6);
    g.descartar();
  });

  it('desenha o pó que a conta tem e esconde o resto', () => {
    const g = new GizDaCena(CFG, 13);
    const poeira = new PoeiraDeGiz({ ...CFG.poeira, porSegundo: 100 }, 20, () => 0.5);
    g.desenharPoeira(poeira, 720);
    expect(g.particulasVisiveis).toBe(0);
    poeira.emitir(0.1, 0, 0.03, 0, 1, 0, 0);
    poeira.atualizar(0.1);
    g.desenharPoeira(poeira, 720);
    expect(g.particulasVisiveis).toBe(poeira.vivas);
    poeira.limpar();
    g.desenharPoeira(poeira, 720);
    expect(g.particulasVisiveis).toBe(0);
    g.descartar();
  });

  it('uma reserva maior que o desenho comporta é cortada no máximo', () => {
    const g = new GizDaCena(CFG, 13);
    const poeira = new PoeiraDeGiz({ ...CFG.poeira, porSegundo: 5000 }, MAXIMO_DE_PARTICULAS + 20, () => 0.5);
    poeira.emitir(1, 0, 0, 0, 1, 0, 0);
    poeira.atualizar(0.01);
    g.desenharPoeira(poeira, 720);
    expect(g.particulasVisiveis).toBeLessThanOrEqual(MAXIMO_DE_PARTICULAS);
    g.descartar();
  });

  it('mudar os lados troca as malhas do cubo e solta as antigas', () => {
    const g = new GizDaCena(CFG, 20);
    const corpo = g.grupo.getObjectByName('giz-corpo') as Mesh;
    const antes = corpo.geometry.uuid;
    g.definirLados(8);
    expect(corpo.geometry.uuid).not.toBe(antes);
    g.definirLados(8);
    g.descartar();
  });

  it('o cubo tem o tamanho da config e a covinha cabe na face', () => {
    const g = new GizDaCena(CFG, 13);
    const corpo = g.grupo.getObjectByName('giz-corpo') as Mesh;
    corpo.geometry.computeBoundingBox();
    const caixa = corpo.geometry.boundingBox!;
    expect(caixa.max.x - caixa.min.x).toBeCloseTo(CFG.cubo.lado, 6);
    g.descartar();
  });
});
