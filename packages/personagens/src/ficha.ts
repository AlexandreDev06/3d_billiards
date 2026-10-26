import type { Quarteto, Trio } from './tipos';

/** Um osso do esqueleto: o pai (`-1` na raiz), onde fica no quadro do pai e para onde está virado, em repouso. */
export interface OssoDaFicha {
  readonly nome: string;
  readonly pai: number;
  readonly posicao: Trio;
  readonly rotacao: Quarteto;
}

/** O que cada osso faz numa pose: a rotação (4 números por osso) e a posição (3), os dois no quadro do pai. */
export interface PoseDaFicha {
  readonly rotacoes: Float64Array;
  readonly posicoes: Float64Array;
}

/**
 * O esqueleto de um personagem e as poses que ele tem, como dados: tudo o que as contas puras precisam saber do arquivo `.glb`,
 * sem a malha. Os ossos vêm com o pai antes do filho. O referencial é o do personagem (para uma mão, `+y` para os dedos, `+z`
 * para o dorso e `+x` para o mínimo), não o do glTF.
 */
export interface Ficha {
  readonly ossos: readonly OssoDaFicha[];
  /** Por nome de pose (`repouso`, `ponte_v`...); o repouso do esqueleto está em `ossos`. */
  readonly poses: ReadonlyMap<string, PoseDaFicha>;
}

/** A pose em que o esqueleto está em repouso, no formato de `PoseDaFicha`. */
export function poseDeRepouso(ficha: Ficha): PoseDaFicha {
  const n = ficha.ossos.length;
  const rotacoes = new Float64Array(4 * n);
  const posicoes = new Float64Array(3 * n);
  ficha.ossos.forEach((o, i) => {
    rotacoes.set(o.rotacao, 4 * i);
    posicoes.set(o.posicao, 3 * i);
  });
  return { rotacoes, posicoes };
}

/** O índice do osso pelo nome; lança se não existe. */
export function indiceDoOsso(ficha: Ficha, nome: string): number {
  const i = ficha.ossos.findIndex((o) => o.nome === nome);
  if (i < 0) throw new Error(`osso "${nome}" não existe na ficha`);
  return i;
}

/** Confere a ficha: pai antes do filho, quaternions unitários, poses do tamanho do esqueleto. Lança com o que está errado. */
export function validarFicha(ficha: Ficha): void {
  const n = ficha.ossos.length;
  if (n === 0) throw new Error('ficha sem ossos');
  ficha.ossos.forEach((o, i) => {
    if (o.pai >= i) throw new Error(`osso "${o.nome}": o pai (${o.pai}) tem de vir antes do filho (${i})`);
    const norma = Math.hypot(...o.rotacao);
    if (Math.abs(norma - 1) > 1e-3) throw new Error(`osso "${o.nome}": rotação não unitária (${norma})`);
  });
  for (const [nome, pose] of ficha.poses) {
    if (pose.rotacoes.length !== 4 * n || pose.posicoes.length !== 3 * n) throw new Error(`pose "${nome}": tamanho diferente do esqueleto`);
  }
}
