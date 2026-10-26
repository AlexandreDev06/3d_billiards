import type { Trio } from './tipos';

/** O que o artista diz de uma ação do corpo: quanto dura, se repete sozinha, o trecho de entrada e o de ciclo, e a cara que combina. Tempos em segundos. */
export interface AcaoDoRosto {
  readonly duracaoS: number;
  /** A ação é um ciclo inteiro (a parada): o jogo a deixa repetindo. */
  readonly repete: boolean;
  readonly entradaS?: readonly [number, number];
  /** O trecho que o jogo repete enquanto pedir: de, até (s). */
  readonly cicloS?: readonly [number, number];
  /** A cara sugerida para a ação (nome da forma). */
  readonly caraPar?: string;
}

/** Um olho: o osso que gira, quem é o pai dele e para onde ele olha no repouso (no referencial do mundo do arquivo). */
export interface OlhoDaMeta {
  readonly pai: string;
  readonly eixoDeRepouso: Trio;
}

/** Um ponto de ancoragem (a mão): o nó, o pai dele e onde fica no repouso (m). */
export interface AncoraDaMeta {
  readonly pai: string;
  readonly posicaoM: Trio;
}

/** As notas do artista sobre um personagem de rosto (`balao-meta.json`): formas, olhos, ações e pontos de ancoragem. */
export interface MetaDoRosto {
  /** Todas as formas (morph targets), na ordem do arquivo. */
  readonly formas: readonly string[];
  /** As formas que são caras (`cara_*`): uma por vez, misturadas entre si; as outras (o piscar) são à parte. */
  readonly caras: readonly string[];
  readonly acoes: ReadonlyMap<string, AcaoDoRosto>;
  readonly olhos: ReadonlyMap<string, OlhoDaMeta>;
  readonly limiteDoOlharRad: number;
  readonly ancoras: ReadonlyMap<string, AncoraDaMeta>;
}

function objeto(valor: unknown, onde: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new Error(`meta: ${onde} tem de ser um objeto`);
  return valor as Record<string, unknown>;
}

function numero(valor: unknown, onde: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new Error(`meta: ${onde} tem de ser um número`);
  return valor;
}

function texto(valor: unknown, onde: string): string {
  if (typeof valor !== 'string') throw new Error(`meta: ${onde} tem de ser um texto`);
  return valor;
}

function trio(valor: unknown, onde: string): Trio {
  if (!Array.isArray(valor) || valor.length !== 3) throw new Error(`meta: ${onde} tem de ser [x, y, z]`);
  return [numero(valor[0], `${onde}[0]`), numero(valor[1], `${onde}[1]`), numero(valor[2], `${onde}[2]`)];
}

function trecho(valor: unknown, onde: string, fps: number): [number, number] | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (!Array.isArray(valor) || valor.length !== 2) throw new Error(`meta: ${onde} tem de ser [de, até]`);
  return [numero(valor[0], `${onde}[0]`) / fps, numero(valor[1], `${onde}[1]`) / fps];
}

/**
 * Lê o arquivo de notas que o artista exporta junto do `.glb` de um personagem de rosto (`balao-meta.json`). Os quadros viram
 * segundos pelo `fps` da ação, e a duração é quadros / fps (a ação vai de 0 a esse tempo). Lança, dizendo qual campo, se estiver errado.
 */
export function lerMetaDoRosto(json: unknown): MetaDoRosto {
  const raiz = objeto(json, 'o arquivo');
  const acoes = new Map<string, AcaoDoRosto>();
  for (const [nome, bruto] of Object.entries(objeto(raiz.acoes, 'acoes'))) {
    const a = objeto(bruto, nome);
    const fps = numero(a.fps, `${nome}.fps`);
    const entradaS = trecho(a.entrada_quadros, `${nome}.entrada_quadros`, fps);
    const cicloS = trecho(a.ciclo_quadros, `${nome}.ciclo_quadros`, fps);
    acoes.set(nome, {
      duracaoS: numero(a.quadros, `${nome}.quadros`) / fps,
      repete: a.repete === true,
      ...(entradaS === undefined ? {} : { entradaS }),
      ...(cicloS === undefined ? {} : { cicloS }),
      ...(typeof a.cara_par === 'string' ? { caraPar: a.cara_par } : {}),
    });
  }
  const formas = raiz.formas === undefined ? [] : objeto(raiz.formas, 'formas').nomes;
  if (!Array.isArray(formas)) throw new Error('meta: formas.nomes tem de ser uma lista');
  const nomesDasFormas = formas.map((n, i) => texto(n, `formas.nomes[${i}]`));
  const olhos = new Map<string, OlhoDaMeta>();
  for (const [nome, bruto] of Object.entries(raiz.olhos === undefined ? {} : objeto(raiz.olhos, 'olhos'))) {
    const o = objeto(bruto, `olhos.${nome}`);
    olhos.set(nome, { pai: texto(o.pai, `olhos.${nome}.pai`), eixoDeRepouso: trio(o.eixo_do_olhar_no_repouso, `olhos.${nome}.eixo_do_olhar_no_repouso`) });
  }
  const ancoras = new Map<string, AncoraDaMeta>();
  for (const [nome, bruto] of Object.entries(raiz.pontos_das_maos === undefined ? {} : objeto(raiz.pontos_das_maos, 'pontos_das_maos'))) {
    const p = objeto(bruto, `pontos_das_maos.${nome}`);
    ancoras.set(nome, { pai: texto(p.pai, `pontos_das_maos.${nome}.pai`), posicaoM: trio(p.posicao_repouso_m, `pontos_das_maos.${nome}.posicao_repouso_m`) });
  }
  const olhar = raiz.olhar === undefined ? {} : objeto(raiz.olhar, 'olhar');
  const limiteGraus = olhar.limite_graus === undefined ? 30 : numero(olhar.limite_graus, 'olhar.limite_graus');
  return {
    formas: nomesDasFormas,
    caras: nomesDasFormas.filter((n) => n.startsWith('cara_')),
    acoes,
    olhos,
    limiteDoOlharRad: (limiteGraus * Math.PI) / 180,
    ancoras,
  };
}
