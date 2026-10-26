import { alvoDePlanoVazio, apoiarPalma, type AlvoDePlano, type Colocacao, type ContatoDeGesto, type ContatoDePalma, type Quadro } from '@sinuca/personagens';
import type { ObstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm } from './apoio';

const alvo: AlvoDePlano = alvoDePlanoVazio();

/**
 * O contato de um gesto visto como o de uma palma: o ponto onde a mão toca e para onde ela olha ali (`normalDaPalma`, ou, se o gesto
 * toca com outra parte da mão, o contrário da normal do plano), com os dedos para `+Y` do arquivo.
 */
function comoPalma(g: ContatoDeGesto, normal: readonly [number, number, number]): ContatoDePalma {
  return { centro: g.ponto, normal, rumo: [0, 1, 0] };
}

/**
 * O quadro da mão em cena (a origem do arquivo) que faz o tapinha cair em `onde`: o ponto onde o punho toca o plano fica em `onde`,
 * o plano do arquivo (a normal `planoNormal`) vira a horizontal (a normal para cima) e os dedos apontam para (`rumoX`, `rumoZ`).
 * A mão vem do arquivo na pose em que o gesto toca o plano; o gesto leva a mão até lá.
 */
export function quadroDoTapinha(g: ContatoDeGesto, colocacao: Colocacao, onde: { x: number; y: number; z: number }, rumoX: number, rumoZ: number, saida: Quadro): Quadro {
  alvo.px = onde.x;
  alvo.py = onde.y;
  alvo.pz = onde.z;
  alvo.nx = 0;
  alvo.ny = 1;
  alvo.nz = 0;
  alvo.rx = rumoX;
  alvo.ry = 0;
  alvo.rz = rumoZ;
  // A palma olha para o plano: o contrário da normal do plano, que sai dele para a mão.
  return apoiarPalma(comoPalma(g, [-g.planoNormal[0], -g.planoNormal[1], -g.planoNormal[2]]), alvo, colocacao, saida);
}

/**
 * O quadro de uma das duas mãos que batem palmas: o ponto onde as palmas se tocam fica em `onde`, as palmas olham ao longo do eixo
 * horizontal (`eixoX`, `eixoZ`), a direita para o lado negativo dele e a esquerda (a espelhada) para o positivo, e os dedos
 * apontam para cima. As duas, no mesmo `onde`, se encontram.
 */
export function quadroDasPalmas(g: ContatoDeGesto, colocacao: Colocacao, onde: { x: number; y: number; z: number }, eixoX: number, eixoZ: number, saida: Quadro): Quadro {
  const k = Math.hypot(eixoX, eixoZ) || 1;
  const lado = colocacao.espelho ? -1 : 1;
  alvo.px = onde.x;
  alvo.py = onde.y;
  alvo.pz = onde.z;
  // `apoiarPalma` vira a normal do contato contra o contrário de `alvo.n`: a direita olha para −eixo (normal +eixo), a esquerda para +eixo.
  alvo.nx = (lado * eixoX) / k;
  alvo.ny = 0;
  alvo.nz = (lado * eixoZ) / k;
  alvo.rx = 0;
  alvo.ry = 1;
  alvo.rz = 0;
  return apoiarPalma(comoPalma(g, g.normalDaPalma), alvo, colocacao, saida);
}

/** Onde o tapinha cai: o ponto no mundo e se é na moldura (ou, longe de qualquer tabela, no pano). */
export interface LugarDoTapinha {
  x: number;
  y: number;
  z: number;
  naMoldura: boolean;
}

export function tapinhaVazio(): LugarDoTapinha {
  return { x: 0, y: 0, z: 0, naMoldura: false };
}

const PASSO_DO_TAPINHA = 0.04;

/**
 * Onde o tapinha cai a partir de (`x`, `z`): no meio da moldura da tabela mais perto, se ela está a `alcance` m ou menos (medido do
 * pano até o meio da moldura); em frente a uma caçapa, escorrega ao longo da tabela até onde há madeira. Longe de tudo, a mão bate
 * no pano mesmo, onde está.
 */
export function lugarDoTapinha(x: number, z: number, obst: ObstaculosDaMesa, alcance: number, saida: LugarDoTapinha): LugarDoTapinha {
  const meio = obst.larguraBorracha + obst.larguraMoldura / 2;
  const foraX = obst.semiX - Math.abs(x);
  const foraZ = obst.semiZ - Math.abs(z);
  const aoLongoDeZ = foraZ <= foraX;
  const distancia = (aoLongoDeZ ? foraZ : foraX) + meio;
  saida.naMoldura = false;
  saida.x = x;
  saida.y = 0;
  saida.z = z;
  if (distancia > alcance) return saida;
  const lado = aoLongoDeZ ? Math.sign(z) || 1 : Math.sign(x) || 1;
  const fixo = lado * ((aoLongoDeZ ? obst.semiZ : obst.semiX) + meio);
  const limite = aoLongoDeZ ? obst.semiX : obst.semiZ;
  const ao = aoLongoDeZ ? x : z;
  // 0, +passo, −passo, +2 passos...: o ponto da moldura mais perto de onde se pediu.
  for (let k = 0; k <= 2 * Math.ceil((2 * limite) / PASSO_DO_TAPINHA); k++) {
    const t = ao + (k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * PASSO_DO_TAPINHA);
    if (Math.abs(t) > limite) continue;
    const px = aoLongoDeZ ? t : fixo;
    const pz = aoLongoDeZ ? fixo : t;
    if (alturaDoApoioEm(obst, px, pz) !== obst.alturaMoldura) continue;
    saida.x = px;
    saida.z = pz;
    saida.y = obst.alturaMoldura;
    saida.naMoldura = true;
    return saida;
  }
  return saida;
}
