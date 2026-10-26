import type { ConfigMaos } from '../config';
import type { ObstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm, type TipoDeApoio } from './apoio';
import { pontoDeContato, type EixoDoTaco, type Vec3 } from './eixo';
import type { NomeDaPonte } from './pontes';
import type { BolasDaMesa } from './pose-das-maos';

/** O que há em volta de onde a mão da ponte pousaria, o que decide qual das pontes do artista o jogo mostra. */
export interface LugarDaPonte {
  /** O que há sob a mão se ela pousar onde o V pousaria. */
  apoio: TipoDeApoio;
  /** A altura (m, do pano) desse apoio: 0 no pano, a da borracha ou a da moldura; 0 onde não há nada. */
  alturaDoApoio: number;
  /** Esse lugar fica junto da boca ou do círculo de queda de uma caçapa, onde a palma não cabe. */
  pertoDeCacapa: boolean;
  /** O ângulo (rad) entre o taco e a tabela sobre a qual a mão pousa: 0 = corre ao longo dela, π/2 = de frente. Só conta sobre a madeira. */
  anguloComATabela: number;
  /** Há outra bola logo atrás da branca, no caminho de trás do taco. */
  bolaAtras: boolean;
  /** A elevação com que o taco é desenhado (rad). */
  elevacao: number;
  /** A fração da puxada de força, de 0 (taco parado) a 1 (recuo máximo). */
  forca: number;
}

export function lugarVazioDaPonte(): LugarDaPonte {
  return { apoio: 'pano', alturaDoApoio: 0, pertoDeCacapa: false, anguloComATabela: Math.PI / 2, bolaAtras: false, elevacao: 0, forca: 0 };
}

const contato: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Lê o que há em volta de onde a mão da ponte pousou, no V (`x`, `z` e o `apoio` sob ela, que `escolherPonte` achou): se fica junto de
 * uma caçapa, em que ângulo o taco corre em relação à tabela e se há bola logo atrás da branca. Escreve em `saida`; nada aloca.
 */
export function lerLugarDaPonte(
  x: number,
  z: number,
  apoio: TipoDeApoio,
  eixo: EixoDoTaco,
  recuo: number,
  obstaculos: ObstaculosDaMesa,
  bolas: BolasDaMesa,
  escolha: ConfigMaos['escolha'],
  elevacao: number,
  forca: number,
  saida: LugarDaPonte,
): LugarDaPonte {
  pontoDeContato(eixo, recuo, contato);
  const cx = contato.x;
  const cz = contato.z;
  saida.apoio = apoio;
  saida.alturaDoApoio = alturaDoApoioEm(obstaculos, x, z);
  if (saida.alturaDoApoio === -Infinity) saida.alturaDoApoio = 0;
  saida.elevacao = elevacao;
  saida.forca = Math.min(Math.max(forca, 0), 1);

  saida.pertoDeCacapa = false;
  for (const v of obstaculos.vaos) {
    if (Math.hypot(x - v.cx, z - v.cz) < escolha.canto.raio || Math.hypot(x - v.bx, z - v.bz) < escolha.canto.raio) {
      saida.pertoDeCacapa = true;
      break;
    }
  }

  const k = Math.hypot(eixo.dx, eixo.dz) || 1;
  const hx = eixo.dx / k;
  const hz = eixo.dz / k;
  saida.anguloComATabela = Math.PI / 2;
  if (apoio === 'borracha' || apoio === 'moldura') {
    // A tabela mais perto é a do eixo em que a mão passou mais para fora do pano.
    const foraX = Math.abs(x) - obstaculos.semiX;
    const foraZ = Math.abs(z) - obstaculos.semiZ;
    const aoLongo = foraX >= foraZ ? Math.abs(hz) : Math.abs(hx);
    saida.anguloComATabela = Math.acos(Math.min(aoLongo, 1));
  }

  saida.bolaAtras = false;
  for (let i = 0; i < bolas.quantas; i++) {
    const dx = bolas.x[i]! - cx;
    const dz = bolas.z[i]! - cz;
    const paraTras = -(dx * hx + dz * hz);
    const lado = Math.abs(-dx * hz + dz * hx);
    if (paraTras > 0 && paraTras <= escolha.elevada.alcance && lado <= escolha.elevada.lado) {
      saida.bolaAtras = true;
      break;
    }
  }
  return saida;
}

const grau = Math.PI / 180;

/**
 * Qual ponte do artista o jogo mostra neste lugar, em ordem:
 *
 * 1. `canto`: a mão cairia junto de uma caçapa, ou onde não há apoio (o vão): a palma não cabe;
 * 2. `elevada`: no pano, com bola logo atrás da branca e o taco subindo por cima dela;
 * 3. na borracha ou na moldura: `colada` se o taco corre ao longo da tabela, `tabela` se vem de frente;
 * 4. `laco`: no pano, com a força puxada acima de `laco.entra`; fica até a força cair abaixo de `laco.sai` (histerese);
 * 5. `v`: no pano, com a bola longe de tudo.
 *
 * `atual` é a ponte de agora, que só conta para a histerese do laço.
 */
export function escolherPoseDaPonte(lugar: LugarDaPonte, escolha: ConfigMaos['escolha'], atual: NomeDaPonte): NomeDaPonte {
  if (lugar.pertoDeCacapa || lugar.apoio === 'ar') return 'canto';
  if (lugar.apoio === 'borracha' || lugar.apoio === 'moldura') return lugar.anguloComATabela < escolha.colada.anguloMaximoGraus * grau ? 'colada' : 'tabela';
  if (lugar.bolaAtras && lugar.elevacao >= escolha.elevada.elevacaoMinimaGraus * grau) return 'elevada';
  const limiar = atual === 'laco' ? escolha.laco.sai : escolha.laco.entra;
  return lugar.forca >= limiar ? 'laco' : 'v';
}
