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
  /** O que há embaixo da palma (com `pousam`, se ali é ar, o da esfera da mão mais alta sobre a borracha ou a moldura). */
  apoio: TipoDeApoio;
  /**
   * L65: a mão tem apoio embaixo. Com `pousam`, quando o de sempre cai no ar procura-se um lugar onde a palma flutua até `ponte.pouso`
   * do apoio, ou uma ponta de dedo o alcança dobrando-se; falso só se nenhum lugar entre a distância mínima e a máxima serve (uma pose
   * rara: a branca no canto ou junto da caçapa do meio): então vale o lugar de sempre, no ar.
   */
  pousa: boolean;
  /** O quanto a palma flutua sobre o apoio no lugar achado pela busca do pouso (m, 0 se toca); `Infinity` nos outros casos. */
  folga: number;
}

/** Bolas que a mão nunca pode tapar, vistas por esta câmera. */
export interface ProtecaoDaVista {
  readonly projetor: Projetor;
  readonly bolas: readonly Esfera[];
  readonly folga: number;
}

const centro: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * A pose da mão da ponte `s` m atrás de onde a ponta toca o bolão, sobre o eixo do taco. Com `subir` (padrão), se ali a palma enterra
 * um pouco no pano, na borracha ou na moldura, a mão sobe o que faltar (e o taco, que fica onde estava, passa a atravessar o vão da
 * mão); sem `subir` a mão fica no eixo, com o vão do artista sobre o taco, e só se diz quanto ela enterraria. Devolve o que há embaixo
 * dela e quanto a palma enterraria sem subir (`afundaria`, m; negativo = sobra espaço).
 */
export function poseDaPonte(
  eixo: EixoDoTaco,
  recuo: number,
  s: number,
  obstaculos: ObstaculosDaMesa,
  cfg: ConfigDaPonte,
  saida: PoseDeMao,
  esferasDaMao: readonly Esfera[] = [],
  subir = true,
  /** L65: a mão pendurada na borracha ou na moldura por uma esfera dela, com a palma no ar, conta como apoiada nelas. */
  apoioPelasEsferas = false,
): { apoio: TipoDeApoio; afundaria: number; sobreAMesa: boolean } {
  pontoDeContato(eixo, recuo, centro);
  const eixoY = centro.y - eixo.dy * s;
  const x = centro.x - eixo.dx * s;
  const z = centro.z - eixo.dz * s;
  const apoio = alturaDoApoio(obstaculos, eixo, x, z, cfg.pegada, (cfg.giro * Math.PI) / 180);
  let afundaria = apoio.altura + cfg.fundo - eixoY;
  let maiorChao = apoio.altura;
  let esferaSobreApoio = esferasDaMao.length === 0;
  // Girada no pano, a mão passa da pegada (o pulso vai para trás e para o lado): cada esfera dela olha o que há embaixo.
  const k = Math.hypot(eixo.dx, eixo.dz) || 1;
  const hx = eixo.dx / k;
  const hz = eixo.dz / k;
  for (const e of esferasDaMao) {
    const chao = alturaDoApoioEm(obstaculos, x + hx * e.x - hz * e.z, z + hz * e.x + hx * e.z);
    if (chao === -Infinity) continue;
    esferaSobreApoio = true;
    if (chao > maiorChao) maiorChao = chao;
    const embaixo = Math.max(e.y - e.r, -cfg.fundo);
    afundaria = Math.max(afundaria, chao - (eixoY + embaixo));
  }
  orientarMao(saida, eixo, x, eixoY + (subir ? Math.max(afundaria, 0) : 0), z);
  // L65: com a palma no ar mas alguma parte da mão sobre a borracha ou a moldura, ela está pendurada nelas, não solta no ar.
  const tipo = apoioPelasEsferas && apoio.tipo === 'ar' && maiorChao > -Infinity ? tipoDaAltura(obstaculos, maiorChao) : apoio.tipo;
  return { apoio: tipo, afundaria, sobreAMesa: esferaSobreApoio };
}

/**
 * Onde a mão da ponte pousa: sobre o eixo do taco, `distancia` atrás de onde a ponta toca o bolão. Se ali a palma enterraria no
 * pano, na borracha ou na moldura (a bola colada na tabela, o taco alto por cima dela), bateria noutra bola ou tamparia uma das
 * `protecao.bolas`, a mão se desloca pelo taco, a partir da distância pedida e alternando para os dois lados, até o primeiro lugar
 * em que cabe: no pano, na borracha, na moldura ou no ar, fora da mesa. Sem lugar nenhum, `ok` é falso.
 *
 * L63: a mão fica **no eixo do taco**, nunca erguida para fugir do pano (o taco passaria a atravessar o vão dela): o lugar só serve se
 * a palma enterra no máximo `tolerancia` e as pontas dos dedos, esticadas ao máximo (`subidaDosDedos`), também; mais longe da bola o
 * eixo está mais alto (o taco sobe para trás), então o primeiro lugar que cabe é mais atrás do que a distância pedida. Só se nenhum
 * lugar serve assim a mão volta a subir (até `tolerancia` na palma e o que os dedos pedirem), para não sumir. Com `evitarAr`, um lugar
 * com apoio (pano, borracha ou moldura) mais longe do pedido ganha de um no ar mais perto.
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
  /**
   * L65: se a mão, no lugar que está em `saidaDoLugar`, tem uma ponta de dedo que alcança o apoio (`PlantadorDeDedos.alcancaOApoio`).
   * Com isto, se o lugar de sempre cai no ar, procura-se (só com a mão no eixo) o primeiro, a partir da distância pedida, onde ela pousa
   * (`PonteEscolhida.pousa`); sem nenhum, vale o de sempre. Lugar que já tem apoio fica como estava.
   */
  pousam: ((pose: PoseDeMao) => boolean) | null = null,
): PonteEscolhida {
  if (pousam !== null) {
    // O de sempre vale se a mão pousa em alguma coisa. Só quando a palma cai no ar (a bola colada na tabela, a mão pendurada na moldura)
    // procura-se o lugar onde ela pousa; sem nenhum, fica o de sempre, e `pousa` diz que flutua.
    const deSempre = escolherPonte(eixo, recuo, obstaculos, bolas, cfg, protecao, esferasDaMao, saidaDoLugar, subidaDosDedos, evitarAr, null);
    if (deSempre.apoio !== 'ar') return deSempre;
    // A busca anda num rascunho: se nada pousa, a pose do de sempre fica em `saidaDoLugar`, como estava.
    // Só a mão no eixo: erguida do apoio ela não pousa, e é a busca mais cara.
    const achou = percorrer(true, eixo, recuo, obstaculos, bolas, cfg, protecao, esferasDaMao, rascunho, subidaDosDedos, evitarAr, pousam);
    if (!achou.ok) return deSempre;
    Object.assign(saidaDoLugar, rascunho);
    return achou;
  }
  // Primeiro a mão no eixo, onde o pano deixa; só se nenhum lugar serve, erguida do pano, como antes do L63.
  const noEixo = percorrer(true, eixo, recuo, obstaculos, bolas, cfg, protecao, esferasDaMao, saidaDoLugar, subidaDosDedos, evitarAr, null);
  if (noEixo.ok) return noEixo;
  return percorrer(false, eixo, recuo, obstaculos, bolas, cfg, protecao, esferasDaMao, saidaDoLugar, subidaDosDedos, evitarAr, null);
}

/** `rigido`: a mão fica no eixo do taco; senão ela sobe do pano até onde a folga do L28 deixa. */
function percorrer(
  rigido: boolean,
  eixo: EixoDoTaco,
  recuo: number,
  obstaculos: ObstaculosDaMesa,
  bolas: BolasDaMesa,
  cfg: ConfigDaPonte,
  protecao: ProtecaoDaVista | null,
  esferasDaMao: readonly Esfera[],
  saidaDoLugar: PoseDeMao,
  subidaDosDedos: ((pose: PoseDeMao) => number) | null,
  evitarAr: boolean,
  pousam: ((pose: PoseDeMao) => boolean) | null,
): PonteEscolhida {
  // A busca do pouso anda de dois em dois passos: a faixa onde a mão pousa tem centímetros, e ela roda todo quadro em que a palma cai no ar.
  const passo = pousam !== null ? 2 * cfg.passo : cfg.passo;
  const passos = Math.ceil((cfg.distanciaMaxima - cfg.distanciaMinima) / passo);
  // Erguida, vale a folga de antes; no eixo, o pano e os dedos pedem quase nada.
  const tolerancia = rigido ? cfg.tolerancia : cfg.toleranciaErguida;
  let noAr = NaN;
  for (let k = 0; k <= 2 * passos + 1; k++) {
    // 0, +1, -1, +2, -2...: o lugar mais perto do pedido primeiro.
    const deslocamento = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * passo;
    const s = cfg.distancia + deslocamento;
    if (s < cfg.distanciaMinima - 1e-9 || s > cfg.distanciaMaxima + 1e-9) continue;
    const { apoio, afundaria, sobreAMesa } = poseDaPonte(eixo, recuo, s, obstaculos, cfg, saidaDoLugar, esferasDaMao, !rigido, pousam !== null);
    if (afundaria > tolerancia) continue;
    // Só serve o lugar onde a mão pousa: a palma não entra no apoio e uma ponta de dedo o alcança. A mão inclina com o taco e baixa a
    // quina da palma (`INCLINACAO_DA_MAO` por unidade de seno da elevação), que a conta pela vertical não vê.
    if (pousam !== null && (apoio === 'ar' || !sobreAMesa || afundaria + Math.abs(eixo.dy) * INCLINACAO_DA_MAO > 0.0005)) continue;
    if (subidaDosDedos !== null) {
      const subida = subidaDosDedos(saidaDoLugar);
      if (rigido ? subida > tolerancia : false) continue;
      if (!rigido) saidaDoLugar.y += subida;
    }
    if (batendoEmBola(bolas, saidaDoLugar.x, saidaDoLugar.z, saidaDoLugar.y - cfg.fundo, cfg.pegada)) continue;
    if (protecao !== null && tapaAlgumaBola(esferasDaMao, saidaDoLugar, protecao.bolas, protecao.projetor, protecao.folga)) continue;
    if (pousam !== null) {
      const folga = Math.max(-afundaria, 0);
      if (folga <= cfg.pouso || pousam(saidaDoLugar)) return { ok: true, distancia: s, apoio, pousa: true, folga };
      continue;
    }
    if (evitarAr && apoio === 'ar') {
      if (Number.isNaN(noAr)) noAr = s;
      continue;
    }
    return { ok: true, distancia: s, apoio, pousa: apoio !== 'ar', folga: Infinity };
  }
  if (!Number.isNaN(noAr)) {
    const { apoio } = poseDaPonte(eixo, recuo, noAr, obstaculos, cfg, saidaDoLugar, esferasDaMao, !rigido);
    if (subidaDosDedos !== null && !rigido) saidaDoLugar.y += subidaDosDedos(saidaDoLugar);
    return { ok: true, distancia: noAr, apoio, pousa: false, folga: Infinity };
  }
  return { ok: false, distancia: cfg.distanciaMaxima, apoio: 'ar', pousa: false, folga: Infinity };
}

const rascunho: PoseDeMao = poseVaziaDeMao();

/** O quanto a quina da palma baixa (m) a cada unidade de seno da elevação do taco: a mão inclina com ele. */
const INCLINACAO_DA_MAO = 0.04;

/** O que é o apoio que tem esta altura (m, do pano). */
function tipoDaAltura(obst: ObstaculosDaMesa, altura: number): TipoDeApoio {
  if (altura >= obst.alturaMoldura - 1e-9) return 'moldura';
  if (altura >= obst.alturaBorracha - 1e-9) return 'borracha';
  return 'pano';
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
