import { Cinematica, type Corrente } from './cinematica';
import type { Contatos } from './contatos';
import { indiceDoOsso, poseDeRepouso, validarFicha, type Ficha } from './ficha';
import { esferasDosOssos, pelarMalha, pontosDeApoio, type EsferaDoOsso, type MalhaComPele } from './malha';
import { girarVetor } from './quaternios';
import type { Ponto, Trio } from './tipos';

/** O personagem como dados para as contas puras: o esqueleto e as poses, os contatos, as correntes de ossos e as esferas que o cobrem. */
export interface ModeloDoPersonagem {
  readonly ficha: Ficha;
  readonly contatos: Contatos;
  /** As correntes de ossos que dobram juntas (os dedos), por nome (`indicador`, `medio`...). */
  readonly correntes: ReadonlyMap<string, Corrente>;
  /** As esferas que cobrem o personagem, presas aos ossos. */
  readonly esferas: readonly EsferaDoOsso[];
  /** Por pose, os pontos mais baixos da pele no referencial do personagem (3 números cada), para saber se ela afunda. */
  readonly apoios: ReadonlyMap<string, Float64Array>;
}

export interface OpcoesDoModelo {
  /** O eixo em que os ossos de uma corrente dobram, no quadro de cada um (padrão: `x`). */
  readonly eixoDeDobra?: Trio;
  /** Quantas esferas cobrem cada osso, pelo nome dele. */
  readonly esferasPorOsso?: (nome: string) => number;
  /** Para onde é "baixo" quando a pose é apoiada (o referencial do personagem; para a mão, o lado da palma: `-z`). */
  readonly baixo?: Trio;
  /** Célula (m) e faixa (m) com que se escolhem os pontos de apoio de cada pose. */
  readonly celulaDoApoio?: number;
  readonly faixaDoApoio?: number;
}

const p: Ponto = { x: 0, y: 0, z: 0 };
const conj = new Float64Array(4);

/** O comprimento da corrente (do osso mais perto da raiz ao mais longe) a partir dos vértices: a ponta e o raio dela, no quadro do último osso. */
function medirPonta(ficha: Ficha, malha: MalhaComPele, osso: number): { ponta: Trio; raio: number } {
  const repouso = new Cinematica(ficha).calcular(poseDeRepouso(ficha));
  conj[0] = -repouso.rotacao[4 * osso]!;
  conj[1] = -repouso.rotacao[4 * osso + 1]!;
  conj[2] = -repouso.rotacao[4 * osso + 2]!;
  conj[3] = repouso.rotacao[4 * osso + 3]!;
  const locais: [number, number, number][] = [];
  const n = malha.posicoes.length / 3;
  for (let v = 0; v < n; v++) {
    let melhor = 0;
    for (let k = 1; k < 4; k++) if (malha.pesos[4 * v + k]! > malha.pesos[4 * v + melhor]!) melhor = k;
    if (malha.ossos[4 * v + melhor] !== osso) continue;
    girarVetor(conj, 0, malha.posicoes[3 * v]! - repouso.posicao[3 * osso]!, malha.posicoes[3 * v + 1]! - repouso.posicao[3 * osso + 1]!, malha.posicoes[3 * v + 2]! - repouso.posicao[3 * osso + 2]!, p);
    locais.push([p.x, p.y, p.z]);
  }
  if (locais.length === 0) throw new Error(`osso "${ficha.ossos[osso]!.nome}" não tem vértices`);
  const comprimento = Math.max(...locais.map((l) => l[1]));
  let raio = 0;
  for (const [x, y, z] of locais) if (y > 0.2 * comprimento && y < 0.7 * comprimento) raio = Math.max(raio, Math.hypot(x, z));
  return { ponta: [0, comprimento - raio, 0], raio };
}

/**
 * Agrupa em correntes os ossos de nome `<corrente>_<n>` (`indicador_1`, `indicador_2`...) pelo `n`, cada um filho do anterior, e mede a
 * ponta e o raio de cada uma na malha. Os ossos que não seguem o nome (o pulso, a palma) ficam de fora.
 */
export function acharCorrentes(ficha: Ficha, malha: MalhaComPele, eixoDeDobra: Trio = [1, 0, 0]): Map<string, Corrente> {
  const grupos = new Map<string, { n: number; osso: number }[]>();
  ficha.ossos.forEach((o, osso) => {
    const m = /^(.+)_(\d+)$/.exec(o.nome);
    if (m === null) return;
    const lista = grupos.get(m[1]!) ?? [];
    lista.push({ n: Number(m[2]), osso });
    grupos.set(m[1]!, lista);
  });
  const saida = new Map<string, Corrente>();
  for (const [nome, lista] of grupos) {
    lista.sort((a, b) => a.n - b.n);
    const ossos = lista.map((l) => l.osso);
    for (let i = 1; i < ossos.length; i++) {
      if (ficha.ossos[ossos[i]!]!.pai !== ossos[i - 1]) throw new Error(`corrente "${nome}": "${ficha.ossos[ossos[i]!]!.nome}" não é filho de "${ficha.ossos[ossos[i - 1]!]!.nome}"`);
    }
    const { ponta, raio } = medirPonta(ficha, malha, ossos[ossos.length - 1]!);
    saida.set(nome, { nome, ossos, eixoDeDobra, ponta, raioDaPonta: raio, partes: ossos.map(() => 1 / ossos.length) });
  }
  return saida;
}

/**
 * Monta o modelo: confere a ficha, acha as correntes, cobre os ossos com esferas e guarda, para cada pose, os pontos mais baixos da
 * pele. Roda uma vez, ao carregar.
 */
export function construirModelo(ficha: Ficha, contatos: Contatos, malha: MalhaComPele, opcoes: OpcoesDoModelo = {}): ModeloDoPersonagem {
  validarFicha(ficha);
  const correntes = acharCorrentes(ficha, malha, opcoes.eixoDeDobra);
  const porOsso = opcoes.esferasPorOsso ?? (() => 2);
  const esferas = esferasDosOssos(ficha, malha, (osso) => porOsso(ficha.ossos[osso]!.nome));
  const baixo = opcoes.baixo ?? [0, 0, -1];
  const superficie = new Float64Array(malha.posicoes.length);
  const apoios = new Map<string, Float64Array>();
  for (const [nome, pose] of ficha.poses) {
    pelarMalha(ficha, malha, pose, superficie);
    apoios.set(nome, pontosDeApoio(superficie, baixo, opcoes.celulaDoApoio ?? 0.012, opcoes.faixaDoApoio ?? 0.05));
  }
  return { ficha, contatos, correntes, esferas, apoios };
}

/** Onde ficam os centros das esferas na pose, no referencial do personagem (3 números por esfera), e o raio de cada uma. */
export function esferasNaPose(modelo: ModeloDoPersonagem, pose: string): { centros: Float64Array; raios: Float64Array } {
  const dados = modelo.ficha.poses.get(pose);
  if (dados === undefined) throw new Error(`pose "${pose}" não existe`);
  const c = new Cinematica(modelo.ficha).calcular(dados);
  const centros = new Float64Array(3 * modelo.esferas.length);
  const raios = new Float64Array(modelo.esferas.length);
  modelo.esferas.forEach((e, i) => {
    c.ponto(e.osso, e.x, e.y, e.z, p);
    centros[3 * i] = p.x;
    centros[3 * i + 1] = p.y;
    centros[3 * i + 2] = p.z;
    raios[i] = e.r;
  });
  return { centros, raios };
}

export { indiceDoOsso };
