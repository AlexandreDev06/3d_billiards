import { Cinematica } from './cinematica';
import { poseDeRepouso, type Ficha, type PoseDaFicha } from './ficha';
import { girarVetor } from './quaternios';
import type { Ponto } from './tipos';

/** A malha do personagem em repouso, com os pesos de pele: 3 números por vértice, e 4 ossos e 4 pesos por vértice. */
export interface MalhaComPele {
  readonly posicoes: ArrayLike<number>;
  readonly ossos: ArrayLike<number>;
  readonly pesos: ArrayLike<number>;
}

/** Uma esfera presa a um osso: o centro no quadro dele e o raio (m). */
export interface EsferaDoOsso {
  readonly osso: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

const conj = new Float64Array(4);
const p: Ponto = { x: 0, y: 0, z: 0 };

/** A posição de cada vértice no quadro do osso que mais pesa nele, em repouso. */
interface Vertice {
  osso: number;
  lx: number;
  ly: number;
  lz: number;
}

function verticesNosOssos(ficha: Ficha, malha: MalhaComPele): Vertice[] {
  const repouso = new Cinematica(ficha).calcular(poseDeRepouso(ficha));
  const n = malha.posicoes.length / 3;
  const saida: Vertice[] = [];
  for (let v = 0; v < n; v++) {
    let melhor = 0;
    for (let k = 1; k < 4; k++) if (malha.pesos[4 * v + k]! > malha.pesos[4 * v + melhor]!) melhor = k;
    const osso = malha.ossos[4 * v + melhor]!;
    // o inverso de um quaternion unitário é o conjugado
    conj[0] = -repouso.rotacao[4 * osso]!;
    conj[1] = -repouso.rotacao[4 * osso + 1]!;
    conj[2] = -repouso.rotacao[4 * osso + 2]!;
    conj[3] = repouso.rotacao[4 * osso + 3]!;
    girarVetor(conj, 0, malha.posicoes[3 * v]! - repouso.posicao[3 * osso]!, malha.posicoes[3 * v + 1]! - repouso.posicao[3 * osso + 1]!, malha.posicoes[3 * v + 2]! - repouso.posicao[3 * osso + 2]!, p);
    saida.push({ osso, lx: p.x, ly: p.y, lz: p.z });
  }
  return saida;
}

/**
 * Cobre cada osso com `quantas(osso)` esferas que, juntas, contêm todos os vértices que mais pesam nele: os centros pelo ponto mais
 * longe dos já escolhidos (k-centros) e o raio de cada um, o do vértice mais longe dele. Osso sem vértices fica sem esfera. É a
 * aproximação barata da mão que as contas de "tapa a bola" usam no lugar da malha.
 */
export function esferasDosOssos(ficha: Ficha, malha: MalhaComPele, quantas: (osso: number) => number): EsferaDoOsso[] {
  const vertices = verticesNosOssos(ficha, malha);
  const saida: EsferaDoOsso[] = [];
  for (let osso = 0; osso < ficha.ossos.length; osso++) {
    const meus = vertices.filter((v) => v.osso === osso);
    const k = Math.min(quantas(osso), meus.length);
    if (k <= 0) continue;
    const centros: Vertice[] = [meus.reduce((a, b) => (b.ly > a.ly ? b : a))];
    while (centros.length < k) {
      let longe = meus[0]!;
      let dmax = -1;
      for (const v of meus) {
        const d = Math.min(...centros.map((c) => Math.hypot(v.lx - c.lx, v.ly - c.ly, v.lz - c.lz)));
        if (d > dmax) {
          dmax = d;
          longe = v;
        }
      }
      centros.push(longe);
    }
    const raios = centros.map(() => 0);
    for (const v of meus) {
      let melhor = 0;
      let dmin = Infinity;
      centros.forEach((c, i) => {
        const d = Math.hypot(v.lx - c.lx, v.ly - c.ly, v.lz - c.lz);
        if (d < dmin) {
          dmin = d;
          melhor = i;
        }
      });
      raios[melhor] = Math.max(raios[melhor]!, dmin);
    }
    centros.forEach((c, i) => saida.push({ osso, x: c.lx, y: c.ly, z: c.lz, r: raios[i]! }));
  }
  return saida;
}

/** As posições dos vértices na pose (pele linear, `saida` com 3 números por vértice). Devolve a própria `saida`. */
export function pelarMalha(ficha: Ficha, malha: MalhaComPele, pose: PoseDaFicha, saida: Float64Array): Float64Array {
  const repouso = new Cinematica(ficha).calcular(poseDeRepouso(ficha));
  const agora = new Cinematica(ficha).calcular(pose);
  const n = malha.posicoes.length / 3;
  const q = new Float64Array(4);
  for (let v = 0; v < n; v++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 4; k++) {
      const w = malha.pesos[4 * v + k]!;
      if (w === 0) continue;
      const osso = malha.ossos[4 * v + k]!;
      q[0] = -repouso.rotacao[4 * osso]!;
      q[1] = -repouso.rotacao[4 * osso + 1]!;
      q[2] = -repouso.rotacao[4 * osso + 2]!;
      q[3] = repouso.rotacao[4 * osso + 3]!;
      girarVetor(q, 0, malha.posicoes[3 * v]! - repouso.posicao[3 * osso]!, malha.posicoes[3 * v + 1]! - repouso.posicao[3 * osso + 1]!, malha.posicoes[3 * v + 2]! - repouso.posicao[3 * osso + 2]!, p);
      agora.ponto(osso, p.x, p.y, p.z, p);
      x += w * p.x;
      y += w * p.y;
      z += w * p.z;
    }
    saida[3 * v] = x;
    saida[3 * v + 1] = y;
    saida[3 * v + 2] = z;
  }
  return saida;
}

/**
 * Os pontos da pele mais baixos de uma pose, para saber se ela afunda no que a sustenta: o mais baixo de cada célula de `celula` m
 * no plano perpendicular a `baixo` (unitário), só os que ficam a menos de `faixa` m do mais baixo de todos. Em 3 números por ponto.
 */
export function pontosDeApoio(superficie: Float64Array, baixo: readonly [number, number, number], celula: number, faixa: number): Float64Array {
  const [bx, by, bz] = baixo;
  // dois eixos perpendiculares a `baixo`
  const ex = Math.abs(bx) < 0.9 ? 1 : 0;
  const ey = ex === 1 ? 0 : 1;
  let ux = ey * bz;
  let uy = -ex * bz;
  let uz = ex * by - ey * bx;
  const nu = Math.hypot(ux, uy, uz) || 1;
  ux /= nu;
  uy /= nu;
  uz /= nu;
  const vx = by * uz - bz * uy;
  const vy = bz * ux - bx * uz;
  const vz = bx * uy - by * ux;
  const n = superficie.length / 3;
  const celulas = new Map<string, number>();
  let maisBaixo = -Infinity;
  for (let i = 0; i < n; i++) {
    const fundo = superficie[3 * i]! * bx + superficie[3 * i + 1]! * by + superficie[3 * i + 2]! * bz;
    if (fundo > maisBaixo) maisBaixo = fundo;
  }
  for (let i = 0; i < n; i++) {
    const x = superficie[3 * i]!;
    const y = superficie[3 * i + 1]!;
    const z = superficie[3 * i + 2]!;
    const fundo = x * bx + y * by + z * bz;
    if (fundo < maisBaixo - faixa) continue;
    const chave = `${Math.floor((x * ux + y * uy + z * uz) / celula)},${Math.floor((x * vx + y * vy + z * vz) / celula)}`;
    const j = celulas.get(chave);
    if (j === undefined || fundo > superficie[3 * j]! * bx + superficie[3 * j + 1]! * by + superficie[3 * j + 2]! * bz) celulas.set(chave, i);
  }
  const saida = new Float64Array(3 * celulas.size);
  let k = 0;
  for (const i of celulas.values()) {
    saida[3 * k] = superficie[3 * i]!;
    saida[3 * k + 1] = superficie[3 * i + 1]!;
    saida[3 * k + 2] = superficie[3 * i + 2]!;
    k++;
  }
  return saida;
}
