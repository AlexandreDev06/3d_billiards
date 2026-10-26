import { CONFIG_FISICA_PADRAO, medidasDaBola } from './config';
import { BOLA, cacapas, distanciaContatoTabela, pontoDeSaida, type MedidasMesa, type Ponto2 } from './medidas';
import { FOLGA_TRIANGULO, posicoesTriangulo } from './triangulo';
import { ID_BOLAO, type ConfigFisica, type EstadoBola, type EstadoMesa, type IdBola, type Rng } from './tipos';

export interface LugaresMesa {
  /** Onde o bolão começa e para onde volta (= `pontoDeSaida`). */
  readonly marcaSaida: Ponto2;
  /** Vértice do triângulo: x = +comprimento/4, z = 0. */
  readonly marcaPe: Ponto2;
  /** Encostado na tabela da cabeceira −X, z = 0 (casa do castigo). */
  readonly tabelaLadoSaida: Ponto2;
}

/** Pontos nomeados da mesa; `raio` é o da bola que vai encostar na tabela. */
export function lugares(mesa: MedidasMesa, raio = BOLA.raio): LugaresMesa {
  return {
    marcaSaida: pontoDeSaida(mesa),
    marcaPe: { x: mesa.comprimento / 4, z: 0 },
    tabelaLadoSaida: { x: -mesa.comprimento / 2 + distanciaContatoTabela(raio, mesa), z: 0 },
  };
}

/** Bola parada em `p`, apoiada no pano, com a orientação de fábrica. */
export function bolaParada(id: IdBola, p: Ponto2, config: ConfigFisica = CONFIG_FISICA_PADRAO): EstadoBola {
  return {
    id,
    posicao: { x: p.x, y: medidasDaBola(id, config).raio, z: p.z },
    velocidade: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
    orientacao: { x: 0, y: 0, z: 0, w: 1 },
    movimento: 'parada',
    naMesa: true,
  };
}

/** Índice do centro do triângulo (meio da 3ª fileira) em `posicoesTriangulo`. */
const CENTRO_TRIANGULO = 4;

/** Índices das pontas da base de 5 em `posicoesTriangulo`. */
const PONTAS_DA_BASE = [10, 14];

/** Vagas ocupadas por `n` bolas, em ordem: 15 enchem tudo; 13 deixam as pontas da base; as outras contagens, o centro. */
function vagas(n: number): number[] {
  const todas = Array.from({ length: 15 }, (_, k) => k);
  if (n === 15) return todas;
  if (n === 13) return todas.filter((k) => !PONTAS_DA_BASE.includes(k));
  return todas.filter((k) => k !== CENTRO_TRIANGULO).slice(0, n);
}

/**
 * Mesa da saída: bolão na marca da saída e as bolas de `arrumacao` no
 * triângulo, na ordem dada, fileira a fileira. Com 15 bolas o triângulo fica
 * cheio. Com 13, vértice e fileiras 2, 3 e 4 cheias e a base de 5 só com as 3
 * do meio (a `arrumacao[4]` fica no centro). Com outras contagens o centro (meio
 * da 3ª fileira) fica vazio e as bolas ocupam as outras vagas em ordem: com 14,
 * vértice e base de 5 ficam cheios.
 *
 * Com `rng`, o triângulo fica imperfeito como na mesa de verdade: cada bola sai
 * até `FOLGA_TRIANGULO` do lugar, em direção sorteada, sem sobrepor as vizinhas
 * (a folga entre elas fica entre 0 e 3 × `FOLGA_TRIANGULO`). Sem `rng`, o
 * triângulo é perfeito.
 */
export function mesaInicial(
  arrumacao: readonly IdBola[],
  config: ConfigFisica = CONFIG_FISICA_PADRAO,
  rng?: Rng,
): EstadoMesa {
  if (arrumacao.length > 15) throw new Error('mesaInicial: mais de 15 bolas no triângulo');
  if (new Set(arrumacao).size !== arrumacao.length) throw new Error('mesaInicial: bola repetida na arrumação');
  if (arrumacao.includes(ID_BOLAO)) throw new Error('mesaInicial: o bolão não entra no triângulo');
  const triangulo = posicoesTriangulo(config.mesa, config.bola.raio);
  const postas: Ponto2[] = [];
  for (const k of vagas(arrumacao.length)) {
    const vaga = triangulo[k]!;
    postas.push(rng ? fora(vaga, postas, 2 * config.bola.raio, rng) : vaga);
  }
  return {
    bolas: [bolaParada(ID_BOLAO, lugares(config.mesa).marcaSaida, config), ...arrumacao.map((id, k) => bolaParada(id, postas[k]!, config))],
  };
}

/**
 * Ponto sorteado no disco de raio `FOLGA_TRIANGULO` em volta de `p`, a pelo
 * menos `distancia` das bolas já postas. Se o sorteio não acha lugar, fica em
 * `p`, que nunca sobrepõe: as vizinhas saíram no máximo uma folga do lugar.
 */
function fora(p: Ponto2, postas: readonly Ponto2[], distancia: number, rng: Rng): Ponto2 {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const angulo = 2 * Math.PI * rng.proximo();
    const r = FOLGA_TRIANGULO * Math.sqrt(rng.proximo());
    const q = { x: p.x + r * Math.cos(angulo), z: p.z + r * Math.sin(angulo) };
    if (postas.every((o) => (q.x - o.x) ** 2 + (q.z - o.z) ** 2 >= distancia * distancia)) return q;
  }
  return p;
}

interface Obstaculo {
  readonly x: number;
  readonly z: number;
  /** Distância mínima entre centros. */
  readonly d: number;
}

const TOL = 1e-9;

/**
 * Ponto livre mais perto de `alvo` para uma bola de `raio`: sem sobrepor as
 * bolas na mesa, nem passar do nariz das tabelas, nem ficar na boca de uma
 * caçapa: o disco de meia boca mais o `raio`, centrado no meio da linha das
 * quinas, cobre a garganta e as quinas, então a bola nunca é posta onde ela
 * poderia ficar presa ou encostada na quina. Ocupado o alvo, a bola fica
 * encostada (com `FOLGA_TRIANGULO`) no que estiver lá. Bolas com `naMesa`
 * falso não contam; a bola que está sendo recolocada não deve estar na mesa.
 * O raio das bolas que já estão na mesa vem de `config`.
 */
export function posicaoLivre(
  estado: EstadoMesa,
  alvo: Ponto2,
  raio: number,
  mesa: MedidasMesa,
  config: ConfigFisica = CONFIG_FISICA_PADRAO,
): Ponto2 {
  const lx = mesa.comprimento / 2 - distanciaContatoTabela(raio, mesa);
  const lz = mesa.largura / 2 - distanciaContatoTabela(raio, mesa);
  const obstaculos: Obstaculo[] = [
    ...estado.bolas.filter((b) => b.naMesa).map((b) => ({ x: b.posicao.x, z: b.posicao.z, d: raio + medidasDaBola(b.id, config).raio })),
    ...cacapas(mesa).map((c) => ({ x: c.boca.x, z: c.boca.z, d: c.raio + raio })),
  ];

  const livre = (x: number, z: number) =>
    Math.abs(x) <= lx + TOL &&
    Math.abs(z) <= lz + TOL &&
    obstaculos.every((o) => (x - o.x) ** 2 + (z - o.z) ** 2 >= (o.d - TOL) ** 2);

  let melhor: Ponto2 | null = null;
  let melhorDist = Infinity;
  const tentar = (x: number, z: number) => {
    const dist = Math.hypot(x - alvo.x, z - alvo.z);
    // Empate (vários pontos à mesma distância) fica com o primeiro candidato, não com o ruído de arredondamento.
    if (dist < melhorDist - 1e-12 && livre(x, z)) {
      melhor = { x, z };
      melhorDist = dist;
    }
  };

  // Candidatos: o alvo puxado para dentro, os pontos de encosto em cada bola,
  // em cada par de bolas, em bola + tabela, e os cantos da área livre.
  const cx = Math.max(-lx, Math.min(lx, alvo.x));
  const cz = Math.max(-lz, Math.min(lz, alvo.z));
  tentar(cx, cz);
  if (melhor) return melhor;

  const circulos = obstaculos.map((o) => ({ x: o.x, z: o.z, r: o.d + FOLGA_TRIANGULO }));
  for (const c of circulos) {
    const dx = alvo.x - c.x;
    const dz = alvo.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-12) {
      tentar(c.x + (dx / d) * c.r, c.z + (dz / d) * c.r);
    } else {
      // Alvo exatamente no centro de outra bola: tenta em volta, começando por trás (−X).
      for (let k = 0; k < 16; k++) {
        const a = Math.PI + (k * Math.PI) / 8;
        tentar(c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r);
      }
    }
    for (const x of [-lx, lx]) for (const z of cortesCirculoReta(c.x, c.z, c.r, x)) tentar(x, z);
    for (const z of [-lz, lz]) for (const x of cortesCirculoReta(c.z, c.x, c.r, z)) tentar(x, z);
  }
  for (let i = 0; i < circulos.length; i++) {
    for (let j = i + 1; j < circulos.length; j++) {
      for (const p of cortesCirculos(circulos[i]!, circulos[j]!)) tentar(p.x, p.z);
    }
  }
  for (const x of [-lx, lx]) {
    tentar(x, cz);
    for (const z of [-lz, lz]) tentar(x, z);
  }
  for (const z of [-lz, lz]) tentar(cx, z);
  if (melhor) return melhor;
  throw new Error('posicaoLivre: não há lugar livre na mesa');
}

/** Coordenadas onde o círculo (centro a, b; raio r) corta a reta "primeira coordenada = k". */
function cortesCirculoReta(a: number, b: number, r: number, k: number): number[] {
  const h = r * r - (k - a) ** 2;
  if (h < 0) return [];
  const s = Math.sqrt(h);
  return [b - s, b + s];
}

function cortesCirculos(c1: { x: number; z: number; r: number }, c2: { x: number; z: number; r: number }): Ponto2[] {
  const dx = c2.x - c1.x;
  const dz = c2.z - c1.z;
  const d = Math.hypot(dx, dz);
  if (d === 0 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const mx = c1.x + (a * dx) / d;
  const mz = c1.z + (a * dz) / d;
  return [
    { x: mx - (h * dz) / d, z: mz + (h * dx) / d },
    { x: mx + (h * dz) / d, z: mz - (h * dx) / d },
  ];
}
