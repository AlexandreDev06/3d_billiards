import type { ContatoDeCilindro, ContatoDePinca, ContatoDePalma } from './contatos';
import { baseDoQuaternio, quaternioDaBase } from './quaternios';
import type { Ponto, Trio } from './tipos';

/**
 * Onde um personagem está no mundo: a origem do quadro dele e para onde vão os três eixos dele (as colunas de uma rotação, sem
 * escala). Com `espelho`, o quadro vale para o personagem espelhado em `x`: o ponto (`x`, `y`, `z`) da ficha está em (`-x`, `y`, `z`),
 * e é assim que se faz a mão esquerda com a ficha da direita.
 */
export interface Quadro {
  px: number;
  py: number;
  pz: number;
  xx: number;
  xy: number;
  xz: number;
  yx: number;
  yy: number;
  yz: number;
  zx: number;
  zy: number;
  zz: number;
}

export function quadroVazio(): Quadro {
  return { px: 0, py: 0, pz: 0, xx: 1, xy: 0, xz: 0, yx: 0, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1 };
}

/** Como o personagem foi feito para o mundo: o tamanho (1 = o do artista) e se é o espelho em `x`. */
export interface Colocacao {
  readonly escala: number;
  readonly espelho: boolean;
}

/** Onde está o cilindro que a mão vai segurar: o ponto do eixo onde ela fica, a direção (do fim largo ao fim fino) e para onde o dorso deve olhar. */
export interface AlvoDeCilindro {
  px: number;
  py: number;
  pz: number;
  dx: number;
  dy: number;
  dz: number;
  /** "Para cima" da mão: só a parte perpendicular ao eixo conta. */
  cx: number;
  cy: number;
  cz: number;
}

export function alvoDeCilindroVazio(): AlvoDeCilindro {
  return { px: 0, py: 0, pz: 0, dx: 1, dy: 0, dz: 0, cx: 0, cy: 1, cz: 0 };
}

/** Onde está o cubo a pinçar: o centro dele e para onde apontam o eixo `lado` e o terceiro eixo do contato. */
export interface AlvoDePinca {
  px: number;
  py: number;
  pz: number;
  /** Para onde vai o eixo `lado` do contato. */
  lx: number;
  ly: number;
  lz: number;
  /** Para onde vai o terceiro eixo (`pinca × lado`): para uma mão, o lado do dorso. */
  tx: number;
  ty: number;
  tz: number;
}

export function alvoDePincaVazio(): AlvoDePinca {
  return { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: -1, tx: 0, ty: 1, tz: 0 };
}

/** Onde está o plano em que a palma se apoia: um ponto dele, a normal (para fora do plano, do lado em que a mão fica) e para onde os dedos apontam. */
export interface AlvoDePlano {
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  rx: number;
  ry: number;
  rz: number;
}

export function alvoDePlanoVazio(): AlvoDePlano {
  return { px: 0, py: 0, pz: 0, nx: 0, ny: 1, nz: 0, rx: 0, ry: 0, rz: -1 };
}

const EIXO_DO_DORSO: Trio = [0, 0, 1];
const lado: Ponto = { x: 0, y: 0, z: 0 };

function normalizar(v: Ponto): boolean {
  const n = Math.hypot(v.x, v.y, v.z);
  if (n < 1e-9) return false;
  v.x /= n;
  v.y /= n;
  v.z /= n;
  return true;
}

/** `v` sem a parte ao longo de `e` (unitário), normalizado; se sobra nada, um vetor qualquer perpendicular a `e`. */
function perpendicular(vx: number, vy: number, vz: number, ex: number, ey: number, ez: number, saida: Ponto): void {
  const k = vx * ex + vy * ey + vz * ez;
  saida.x = vx - k * ex;
  saida.y = vy - k * ey;
  saida.z = vz - k * ez;
  if (normalizar(saida)) return;
  // v paralelo a e: escolhe o eixo do mundo menos alinhado com e.
  const ax = Math.abs(ex);
  const ay = Math.abs(ey);
  const az = Math.abs(ez);
  const ox = ax <= ay && ax <= az ? 1 : 0;
  const oy = ox === 0 && ay <= az ? 1 : 0;
  const oz = ox === 0 && oy === 0 ? 1 : 0;
  const k2 = ox * ex + oy * ey + oz * ez;
  saida.x = ox - k2 * ex;
  saida.y = oy - k2 * ey;
  saida.z = oz - k2 * ez;
  normalizar(saida);
}

/**
 * Monta o quadro que leva a base ortonormal (`a`, `b`, `c = a × b`) do personagem à base (`A`, `B`, `C = A × B`) do mundo, com o
 * ponto `p` do personagem (já espelhado) sobre `alvo`, na escala dada. Sem alocar.
 */
function montar(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  Ax: number, Ay: number, Az: number, Bx: number, By: number, Bz: number,
  p: Trio, espelho: boolean, escala: number, alvoX: number, alvoY: number, alvoZ: number, saida: Quadro,
): Quadro {
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const Cx = Ay * Bz - Az * By;
  const Cy = Az * Bx - Ax * Bz;
  const Cz = Ax * By - Ay * Bx;
  // R = A a^T + B b^T + C c^T: a coluna k de R é A a_k + B b_k + C c_k.
  saida.xx = Ax * ax + Bx * bx + Cx * cx;
  saida.xy = Ay * ax + By * bx + Cy * cx;
  saida.xz = Az * ax + Bz * bx + Cz * cx;
  saida.yx = Ax * ay + Bx * by + Cx * cy;
  saida.yy = Ay * ay + By * by + Cy * cy;
  saida.yz = Az * ay + Bz * by + Cz * cy;
  saida.zx = Ax * az + Bx * bz + Cx * cz;
  saida.zy = Ay * az + By * bz + Cy * cz;
  saida.zz = Az * az + Bz * bz + Cz * cz;
  const px = espelho ? -p[0] : p[0];
  const rx = saida.xx * px + saida.yx * p[1] + saida.zx * p[2];
  const ry = saida.xy * px + saida.yy * p[1] + saida.zy * p[2];
  const rz = saida.xz * px + saida.yz * p[1] + saida.zz * p[2];
  saida.px = alvoX - escala * rx;
  saida.py = alvoY - escala * ry;
  saida.pz = alvoZ - escala * rz;
  return saida;
}

/**
 * Segurar um cilindro: o quadro do personagem com o eixo do contato sobre o do cilindro e o ponto do contato sobre `alvo`. O
 * dorso (o eixo `referencia` do personagem, `+z` por padrão) fica o mais virado possível para `alvo.c`; `rolo` (rad) gira o
 * personagem em torno do cilindro a partir daí. O cilindro é o que o artista mediu: com a mão menor ou maior que a dele
 * (`escala`), o ponto continua no cilindro, mas o resto da mão se afasta ou se aproxima dele.
 */
export function segurarCilindro(contato: ContatoDeCilindro, alvo: AlvoDeCilindro, colocacao: Colocacao, saida: Quadro, rolo = 0, referencia: Trio = EIXO_DO_DORSO): Quadro {
  const m = colocacao.espelho ? -1 : 1;
  const ax = m * contato.eixo[0];
  const ay = contato.eixo[1];
  const az = contato.eixo[2];
  perpendicular(m * referencia[0], referencia[1], referencia[2], ax, ay, az, lado);
  const bx = lado.x;
  const by = lado.y;
  const bz = lado.z;
  const dn = Math.hypot(alvo.dx, alvo.dy, alvo.dz) || 1;
  const Ax = alvo.dx / dn;
  const Ay = alvo.dy / dn;
  const Az = alvo.dz / dn;
  perpendicular(alvo.cx, alvo.cy, alvo.cz, Ax, Ay, Az, lado);
  let Bx = lado.x;
  let By = lado.y;
  let Bz = lado.z;
  if (rolo !== 0) {
    const c = Math.cos(rolo);
    const s = Math.sin(rolo);
    // B gira em torno de A: B c + (A × B) s
    const Cx = Ay * Bz - Az * By;
    const Cy = Az * Bx - Ax * Bz;
    const Cz = Ax * By - Ay * Bx;
    Bx = Bx * c + Cx * s;
    By = By * c + Cy * s;
    Bz = Bz * c + Cz * s;
  }
  return montar(ax, ay, az, bx, by, bz, Ax, Ay, Az, Bx, By, Bz, contato.ponto, colocacao.espelho, colocacao.escala, alvo.px, alvo.py, alvo.pz, saida);
}

/**
 * Pinçar um cubo: o quadro do personagem com o centro do contato sobre o do cubo, o eixo `lado` do contato para `alvo.l` e o
 * terceiro eixo (`pinca × lado`, do lado do dorso na mão que o artista fez) para `alvo.t`. A pinça aperta as duas faces que o
 * terceiro e o `lado` não tocam: o resto da mão segue o cubo. `alvo.l` e `alvo.t` têm de ser perpendiculares e unitários.
 */
export function pincarCubo(contato: ContatoDePinca, alvo: AlvoDePinca, colocacao: Colocacao, saida: Quadro): Quadro {
  const m = colocacao.espelho ? -1 : 1;
  const e1x = m * contato.lado[0];
  const e1y = contato.lado[1];
  const e1z = contato.lado[2];
  // O terceiro eixo é calculado com o contato como o artista o mediu e só então espelhado, para continuar do lado do dorso.
  const nx = contato.pinca[0];
  const ny = contato.pinca[1];
  const nz = contato.pinca[2];
  const lx = contato.lado[0];
  const ly = contato.lado[1];
  const lz = contato.lado[2];
  const e2x = m * (ny * lz - nz * ly);
  const e2y = nz * lx - nx * lz;
  const e2z = nx * ly - ny * lx;
  return montar(e1x, e1y, e1z, e2x, e2y, e2z, alvo.lx, alvo.ly, alvo.lz, alvo.tx, alvo.ty, alvo.tz, contato.centro, colocacao.espelho, colocacao.escala, alvo.px, alvo.py, alvo.pz, saida);
}

/**
 * Apoiar a palma num plano: o quadro do personagem com a palma (o ponto `centro` do contato, na pele da palma) sobre `alvo.p`, virada
 * para o plano (a normal do contato contra `alvo.n`) e os dedos para `alvo.r`, que só conta no que é paralelo ao plano.
 */
export function apoiarPalma(palma: ContatoDePalma, alvo: AlvoDePlano, colocacao: Colocacao, saida: Quadro): Quadro {
  const m = colocacao.espelho ? -1 : 1;
  const ax = m * palma.normal[0];
  const ay = palma.normal[1];
  const az = palma.normal[2];
  perpendicular(m * palma.rumo[0], palma.rumo[1], palma.rumo[2], ax, ay, az, lado);
  const bx = lado.x;
  const by = lado.y;
  const bz = lado.z;
  const nn = Math.hypot(alvo.nx, alvo.ny, alvo.nz) || 1;
  const Ax = -alvo.nx / nn;
  const Ay = -alvo.ny / nn;
  const Az = -alvo.nz / nn;
  perpendicular(alvo.rx, alvo.ry, alvo.rz, Ax, Ay, Az, lado);
  return montar(ax, ay, az, bx, by, bz, Ax, Ay, Az, lado.x, lado.y, lado.z, palma.centro, colocacao.espelho, colocacao.escala, alvo.px, alvo.py, alvo.pz, saida);
}

/** O ponto (`x`, `y`, `z`) da ficha do personagem, no mundo. */
export function pontoNoMundo(q: Quadro, c: Colocacao, x: number, y: number, z: number, saida: Ponto): Ponto {
  const lx = c.espelho ? -x : x;
  saida.x = q.px + c.escala * (q.xx * lx + q.yx * y + q.zx * z);
  saida.y = q.py + c.escala * (q.xy * lx + q.yy * y + q.zy * z);
  saida.z = q.pz + c.escala * (q.xz * lx + q.yz * y + q.zz * z);
  return saida;
}

/** O vetor (`x`, `y`, `z`) da ficha, no mundo (só a rotação, sem a escala nem a origem). */
export function vetorNoMundo(q: Quadro, c: Colocacao, x: number, y: number, z: number, saida: Ponto): Ponto {
  const lx = c.espelho ? -x : x;
  saida.x = q.xx * lx + q.yx * y + q.zx * z;
  saida.y = q.xy * lx + q.yy * y + q.zy * z;
  saida.z = q.xz * lx + q.yz * y + q.zz * z;
  return saida;
}

/** A imagem, no mundo, do vetor (`x`, `y`, `z`) já espelhado: só a rotação do quadro. */
function girarPeloQuadro(q: Quadro, x: number, y: number, z: number, saida: Ponto): Ponto {
  saida.x = q.xx * x + q.yx * y + q.zx * z;
  saida.y = q.xy * x + q.yy * y + q.zy * z;
  saida.z = q.xz * x + q.yz * y + q.zz * z;
  return saida;
}

/**
 * A base do contato de um cilindro, a que `segurarCilindro` usa: `saida` recebe, nesta ordem, o eixo do cilindro (`a`), o dorso
 * perpendicular a ele (`b`) e `a × b` (`c`), nove números, no referencial do personagem já espelhado (com `espelho`, o `x` trocado).
 * Um ponto do personagem tem as coordenadas (`a·p`, `b·p`, `c·p`) no quadro da mão que segura o cilindro.
 */
export function baseDoCilindro(contato: ContatoDeCilindro, espelho: boolean, saida: Float64Array, referencia: Trio = EIXO_DO_DORSO): Float64Array {
  const m = espelho ? -1 : 1;
  const ax = m * contato.eixo[0];
  const ay = contato.eixo[1];
  const az = contato.eixo[2];
  perpendicular(m * referencia[0], referencia[1], referencia[2], ax, ay, az, lado);
  saida[0] = ax;
  saida[1] = ay;
  saida[2] = az;
  saida[3] = lado.x;
  saida[4] = lado.y;
  saida[5] = lado.z;
  saida[6] = ay * lado.z - az * lado.y;
  saida[7] = az * lado.x - ax * lado.z;
  saida[8] = ax * lado.y - ay * lado.x;
  return saida;
}

/**
 * O contrário de `segurarCilindro`: dado o quadro do personagem, onde está o ponto do contato e para onde apontam o eixo do cilindro
 * (`d`) e o dorso (`c`). Com o resultado, `segurarCilindro` devolve o mesmo quadro.
 */
export function cilindroDoQuadro(contato: ContatoDeCilindro, quadro: Quadro, colocacao: Colocacao, saida: AlvoDeCilindro, referencia: Trio = EIXO_DO_DORSO): AlvoDeCilindro {
  baseDoCilindro(contato, colocacao.espelho, base, referencia);
  pontoNoMundo(quadro, colocacao, contato.ponto[0], contato.ponto[1], contato.ponto[2], ponto);
  saida.px = ponto.x;
  saida.py = ponto.y;
  saida.pz = ponto.z;
  girarPeloQuadro(quadro, base[0]!, base[1]!, base[2]!, ponto);
  saida.dx = ponto.x;
  saida.dy = ponto.y;
  saida.dz = ponto.z;
  girarPeloQuadro(quadro, base[3]!, base[4]!, base[5]!, ponto);
  saida.cx = ponto.x;
  saida.cy = ponto.y;
  saida.cz = ponto.z;
  return saida;
}

/** O contrário de `pincarCubo`: onde está o cubo (o centro, o eixo `lado` e o terceiro eixo) quando o personagem está no `quadro`. */
export function cuboDoQuadro(contato: ContatoDePinca, quadro: Quadro, colocacao: Colocacao, saida: AlvoDePinca): AlvoDePinca {
  const m = colocacao.espelho ? -1 : 1;
  pontoNoMundo(quadro, colocacao, contato.centro[0], contato.centro[1], contato.centro[2], ponto);
  saida.px = ponto.x;
  saida.py = ponto.y;
  saida.pz = ponto.z;
  girarPeloQuadro(quadro, m * contato.lado[0], contato.lado[1], contato.lado[2], ponto);
  saida.lx = ponto.x;
  saida.ly = ponto.y;
  saida.lz = ponto.z;
  const [nx, ny, nz] = contato.pinca;
  const [lx, ly, lz] = contato.lado;
  girarPeloQuadro(quadro, m * (ny * lz - nz * ly), nz * lx - nx * lz, nx * ly - ny * lx, ponto);
  saida.tx = ponto.x;
  saida.ty = ponto.y;
  saida.tz = ponto.z;
  return saida;
}

const base = new Float64Array(9);
const ponto: Ponto = { x: 0, y: 0, z: 0 };

const qa = new Float64Array(4);
const qb = new Float64Array(4);
const mistura = new Float64Array(9);

/**
 * O quadro entre `a` (`k` = 0) e `b` (`k` = 1): a origem anda em linha reta e a rotação, pelo caminho curto. Serve para a mão que
 * troca de lugar (um quadro de saída, um de chegada) e para o arco de uma troca. `saida` pode ser `a` ou `b`; `k` é limitado a 0..1.
 */
export function misturarQuadros(a: Quadro, b: Quadro, k: number, saida: Quadro): Quadro {
  const t = Math.min(Math.max(k, 0), 1);
  quaternioDaBase(a.xx, a.xy, a.xz, a.yx, a.yy, a.yz, a.zx, a.zy, a.zz, qa, 0);
  quaternioDaBase(b.xx, b.xy, b.xz, b.yx, b.yy, b.yz, b.zx, b.zy, b.zz, qb, 0);
  const sinal = qa[0]! * qb[0]! + qa[1]! * qb[1]! + qa[2]! * qb[2]! + qa[3]! * qb[3]! < 0 ? -1 : 1;
  let norma = 0;
  for (let i = 0; i < 4; i++) {
    qa[i] = qa[i]! * (1 - t) + qb[i]! * sinal * t;
    norma += qa[i]! * qa[i]!;
  }
  norma = Math.sqrt(norma) || 1;
  for (let i = 0; i < 4; i++) qa[i] = qa[i]! / norma;
  baseDoQuaternio(qa, 0, mistura);
  const px = a.px + (b.px - a.px) * t;
  const py = a.py + (b.py - a.py) * t;
  const pz = a.pz + (b.pz - a.pz) * t;
  saida.px = px;
  saida.py = py;
  saida.pz = pz;
  saida.xx = mistura[0]!;
  saida.xy = mistura[1]!;
  saida.xz = mistura[2]!;
  saida.yx = mistura[3]!;
  saida.yy = mistura[4]!;
  saida.yz = mistura[5]!;
  saida.zx = mistura[6]!;
  saida.zy = mistura[7]!;
  saida.zz = mistura[8]!;
  return saida;
}
