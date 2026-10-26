import type { ConfigMaos } from '../config';
import type { ObstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm, apoioEm, type TipoDeApoio } from './apoio';
import { pontoDeContato, type EixoDoTaco, type Vec3 } from './eixo';
import type { Esfera } from './esferas';
import type { PontoProjetado, Projetor } from './projetor';

/**
 * Onde uma mão está e como está virada, no quadro do taco: (`x`, `y`, `z`) é onde o eixo do taco a atravessa, `d` é para onde o
 * taco aponta (da ponta para a bola) e `u` é perpendicular a ele, na vertical (o "para cima" da mão). O terceiro eixo é `d × u`.
 */
export interface PoseDeMao {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  ux: number;
  uy: number;
  uz: number;
}

export function poseVaziaDeMao(): PoseDeMao {
  return { x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0, ux: 0, uy: 1, uz: 0 };
}

/** Vira a pose para o taco `eixo` e põe a origem em (`x`, `y`, `z`). */
export function orientarMao(saida: PoseDeMao, eixo: EixoDoTaco, x: number, y: number, z: number): PoseDeMao {
  saida.x = x;
  saida.y = y;
  saida.z = z;
  saida.dx = eixo.dx;
  saida.dy = eixo.dy;
  saida.dz = eixo.dz;
  // u = céu sem a parte ao longo de d, normalizado (o taco nunca fica na vertical: no máximo ~82°).
  const k = Math.hypot(eixo.dx, eixo.dz) || 1;
  saida.ux = (-eixo.dx * eixo.dy) / k;
  saida.uy = k;
  saida.uz = (-eixo.dz * eixo.dy) / k;
  return saida;
}

const grau = Math.PI / 180;

/**
 * A pose da mão de trás, que segura o taco no ponto `ponto` do eixo (a origem da pose é o ponto do contato do arquivo, no meio da
 * palma, e o taco passa por ela). O polegar vai para a frente e os dedos dão a volta no taco; `cfg.rolo` gira a mão em torno do taco
 * (graus; 0 = o dorso para cima).
 */
export function poseDoPunho(eixo: EixoDoTaco, ponto: Vec3, cfg: ConfigMaos['punho'], saida: PoseDeMao): PoseDeMao {
  orientarMao(saida, eixo, ponto.x, ponto.y, ponto.z);
  if (cfg.rolo === 0) return saida;
  const wx = saida.dy * saida.uz - saida.dz * saida.uy;
  const wy = saida.dz * saida.ux - saida.dx * saida.uz;
  const wz = saida.dx * saida.uy - saida.dy * saida.ux;
  const c = Math.cos(cfg.rolo * grau);
  const s = Math.sin(cfg.rolo * grau);
  const ux = saida.ux * c + wx * s;
  const uy = saida.uy * c + wy * s;
  const uz = saida.uz * c + wz * s;
  saida.ux = ux;
  saida.uy = uy;
  saida.uz = uz;
  return saida;
}

/** O ponto do quadro da mão (`lx`, `ly`, `lz`) no mundo. */
export function noMundo(pose: PoseDeMao, lx: number, ly: number, lz: number, saida: Vec3): Vec3 {
  const wx = pose.dy * pose.uz - pose.dz * pose.uy;
  const wy = pose.dz * pose.ux - pose.dx * pose.uz;
  const wz = pose.dx * pose.uy - pose.dy * pose.ux;
  saida.x = pose.x + pose.dx * lx + pose.ux * ly + wx * lz;
  saida.y = pose.y + pose.dy * lx + pose.uy * ly + wy * lz;
  saida.z = pose.z + pose.dz * lx + pose.uz * ly + wz * lz;
  return saida;
}

/** As outras bolas da mesa, o que a ponte não pode atravessar: centros no plano e o raio delas. */
export interface BolasDaMesa {
  quantas: number;
  readonly x: Float64Array;
  readonly z: Float64Array;
  raio: number;
}

export function bolasVazias(limite = 16): BolasDaMesa {
  return { quantas: 0, x: new Float64Array(limite), z: new Float64Array(limite), raio: 0 };
}

/** A configuração da ponte com o que só se sabe depois de carregar a mão: do eixo do taco ao ponto mais baixo da pele (`MaoCalibrada.fundo`). */
export type ConfigDaPonte = ConfigMaos['ponte'] & { readonly fundo: number };

/** Onde a mão da ponte ficou: a distância atrás do contato, o que a sustenta e se coube em algum lugar. */
export interface PonteEscolhida {
  /** Coube em algum lugar entre a distância mínima e a máxima; se não, a ponte não aparece. */
  ok: boolean;
  /** Distância pelo taco, do ponto de contato à mão (m). */
  distancia: number;
  /** O que há embaixo da palma. */
  apoio: TipoDeApoio;
}

/** Bolas que a mão nunca pode tapar, vistas por esta câmera. */
export interface ProtecaoDaVista {
  readonly projetor: Projetor;
  readonly bolas: readonly Esfera[];
  readonly folga: number;
}

const centro: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * A pose da mão da ponte `s` m atrás de onde a ponta toca o bolão, sobre o eixo do taco; se ali a palma enterra um pouco no pano,
 * na borracha ou na moldura, a mão sobe o que faltar. Devolve o que há embaixo dela e quanto a palma enterraria sem subir
 * (`afundaria`, m; negativo = sobra espaço).
 */
export function poseDaPonte(
  eixo: EixoDoTaco,
  recuo: number,
  s: number,
  obstaculos: ObstaculosDaMesa,
  cfg: ConfigDaPonte,
  saida: PoseDeMao,
  esferasDaMao: readonly Esfera[] = [],
): { apoio: TipoDeApoio; afundaria: number } {
  pontoDeContato(eixo, recuo, centro);
  const eixoY = centro.y - eixo.dy * s;
  const x = centro.x - eixo.dx * s;
  const z = centro.z - eixo.dz * s;
  const apoio = alturaDoApoio(obstaculos, eixo, x, z, cfg.pegada, (cfg.giro * Math.PI) / 180);
  let afundaria = apoio.altura + cfg.fundo - eixoY;
  // Girada no pano, a mão passa da pegada (o pulso vai para trás e para o lado): cada esfera dela olha o que há embaixo.
  const k = Math.hypot(eixo.dx, eixo.dz) || 1;
  const hx = eixo.dx / k;
  const hz = eixo.dz / k;
  for (const e of esferasDaMao) {
    const chao = alturaDoApoioEm(obstaculos, x + hx * e.x - hz * e.z, z + hz * e.x + hx * e.z);
    if (chao === -Infinity) continue;
    const embaixo = Math.max(e.y - e.r, -cfg.fundo);
    afundaria = Math.max(afundaria, chao - (eixoY + embaixo));
  }
  orientarMao(saida, eixo, x, eixoY + Math.max(afundaria, 0), z);
  return { apoio: apoio.tipo, afundaria };
}

/**
 * Onde a mão da ponte pousa: sobre o eixo do taco, `distancia` atrás de onde a ponta toca o bolão. Se ali a palma enterraria no
 * pano, na borracha ou na moldura (a bola colada na tabela, o taco alto por cima dela), bateria noutra bola ou tamparia uma das
 * `protecao.bolas`, a mão se desloca pelo taco, a partir da distância pedida e alternando para os dois lados, até o primeiro lugar
 * em que cabe: no pano, na borracha, na moldura ou no ar, fora da mesa. Sem lugar nenhum, `ok` é falso.
 *
 * Quando a palma só enterra um pouco (até `tolerancia`), a mão sobe junto, para não atravessar a madeira; e sobe mais o que
 * `subidaDosDedos` pedir, para as pontas dos dedos não entrarem na borracha nem na moldura. Com `evitarAr`, um lugar com apoio
 * (pano, borracha ou moldura) mais longe do pedido ganha de um no ar mais perto.
 */
export function escolherPonte(
  eixo: EixoDoTaco,
  recuo: number,
  obstaculos: ObstaculosDaMesa,
  bolas: BolasDaMesa,
  cfg: ConfigDaPonte,
  protecao: ProtecaoDaVista | null,
  esferasDaMao: readonly Esfera[],
  saidaDoLugar: PoseDeMao,
  /** Quanto a mão em cada lugar tem de subir, além da palma, para os dedos não afundarem (`PlantadorDeDedos.subidaNecessaria`). */
  subidaDosDedos: ((pose: PoseDeMao) => number) | null = null,
  /** Prefere qualquer lugar com apoio ao ar: a mão só fica no ar, fora da mesa, se não houver onde pousar entre o mínimo e o máximo. */
  evitarAr = false,
): PonteEscolhida {
  const passos = Math.ceil((cfg.distanciaMaxima - cfg.distanciaMinima) / cfg.passo);
  let noAr = NaN;
  for (let k = 0; k <= 2 * passos + 1; k++) {
    // 0, +1, -1, +2, -2...: o lugar mais perto do pedido primeiro.
    const deslocamento = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * cfg.passo;
    const s = cfg.distancia + deslocamento;
    if (s < cfg.distanciaMinima - 1e-9 || s > cfg.distanciaMaxima + 1e-9) continue;
    const { apoio, afundaria } = poseDaPonte(eixo, recuo, s, obstaculos, cfg, saidaDoLugar, esferasDaMao);
    if (afundaria > cfg.tolerancia) continue;
    if (subidaDosDedos !== null) saidaDoLugar.y += subidaDosDedos(saidaDoLugar);
    if (batendoEmBola(bolas, saidaDoLugar.x, saidaDoLugar.z, saidaDoLugar.y - cfg.fundo, cfg.pegada)) continue;
    if (protecao !== null && tapaAlgumaBola(esferasDaMao, saidaDoLugar, protecao.bolas, protecao.projetor, protecao.folga)) continue;
    if (evitarAr && apoio === 'ar') {
      if (Number.isNaN(noAr)) noAr = s;
      continue;
    }
    return { ok: true, distancia: s, apoio };
  }
  if (!Number.isNaN(noAr)) {
    // Nada com apoio coube: fica no ar, onde a primeira conta o achou.
    const { apoio } = poseDaPonte(eixo, recuo, noAr, obstaculos, cfg, saidaDoLugar, esferasDaMao);
    if (subidaDosDedos !== null) saidaDoLugar.y += subidaDosDedos(saidaDoLugar);
    return { ok: true, distancia: noAr, apoio };
  }
  return { ok: false, distancia: cfg.distanciaMaxima, apoio: 'ar' };
}

/** A maior altura de apoio sob a pegada da mão em (`x`, `z`) e o tipo do que há no centro. */
function alturaDoApoio(obst: ObstaculosDaMesa, eixo: EixoDoTaco, x: number, z: number, pegada: ConfigMaos['ponte']['pegada'], giro: number): { altura: number; tipo: TipoDeApoio } {
  const k = Math.hypot(eixo.dx, eixo.dz) || 1;
  const hx = eixo.dx / k;
  const hz = eixo.dz / k;
  const centroDoApoio = apoioEm(obst, x, z);
  let altura = centroDoApoio.altura;
  const c = Math.cos(giro);
  const sen = Math.sin(giro);
  for (const [a, b] of PONTOS_DA_PEGADA) {
    const dedos = a > 0 ? pegada.frente : -pegada.tras;
    const direita = b * pegada.lado;
    // A mão gira no pano (`ponte.giro`) em torno do V: a pegada gira com ela.
    const along = c * dedos - sen * direita;
    const lado = sen * dedos + c * direita;
    const apoio = apoioEm(obst, x + hx * along - hz * lado, z + hz * along + hx * lado);
    if (apoio.altura > altura) altura = apoio.altura;
  }
  return { altura, tipo: centroDoApoio.tipo };
}

const PONTOS_DA_PEGADA: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [1, 0],
  [-1, 0],
];

/** A palma (a base dela em `base`, a pegada em volta de `x`, `z`) entra em alguma outra bola? */
function batendoEmBola(bolas: BolasDaMesa, x: number, z: number, base: number, pegada: ConfigMaos['ponte']['pegada']): boolean {
  if (base >= 2 * bolas.raio) return false;
  const alcance = Math.max(pegada.frente, pegada.tras, pegada.lado) * 0.75 + bolas.raio;
  for (let i = 0; i < bolas.quantas; i++) {
    const dx = bolas.x[i]! - x;
    const dz = bolas.z[i]! - z;
    if (dx * dx + dz * dz < alcance * alcance) return true;
  }
  return false;
}

const centroDaEsfera: Vec3 = { x: 0, y: 0, z: 0 };
const projetadaDaMao: PontoProjetado = { x: 0, y: 0, profundidade: 0 };
const projetadaDaBola: PontoProjetado = { x: 0, y: 0, profundidade: 0 };

/**
 * Alguma esfera da mão (no quadro da `pose`) fica na frente de alguma bola, vista da câmera, tapando-a? A bola é tapada quando o
 * disco da esfera na tela cobre o disco da bola (com `folga`, fração do tamanho dela) e a esfera está mais perto da câmera.
 */
export function tapaAlgumaBola(esferas: readonly Esfera[], pose: PoseDeMao, bolas: readonly Esfera[], projetor: Projetor, folga: number): boolean {
  for (const e of esferas) {
    noMundo(pose, e.x, e.y, e.z, centroDaEsfera);
    if (!projetor.projetar(centroDaEsfera.x, centroDaEsfera.y, centroDaEsfera.z, projetadaDaMao)) continue;
    const raioDaMao = (e.r * projetor.escala) / projetadaDaMao.profundidade;
    for (const b of bolas) {
      if (!projetor.projetar(b.x, b.y, b.z, projetadaDaBola)) continue;
      if (projetadaDaMao.profundidade >= projetadaDaBola.profundidade) continue;
      const raioDaBola = (b.r * projetor.escala) / projetadaDaBola.profundidade;
      const dx = (projetadaDaMao.x - projetadaDaBola.x) * projetor.aspecto;
      const dy = projetadaDaMao.y - projetadaDaBola.y;
      const soma = raioDaMao + raioDaBola * (1 + folga);
      if (dx * dx + dy * dy < soma * soma) return true;
    }
  }
  return false;
}
