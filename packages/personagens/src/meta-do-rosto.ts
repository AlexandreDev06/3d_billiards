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

/** As pálpebras que seguem o olhar na vertical (v2): a forma de cada uma e o ângulo do olhar em que ela chega a 1 (graus). */
export interface PalpebrasDaMeta {
  readonly cima: { readonly forma: string; readonly grausPara1: number };
  readonly baixo: { readonly forma: string; readonly grausPara1: number };
}

/** A cordinha que o jogo simula (v2): os ossos do nó para baixo, o comprimento de cada junta (m) e a massa sugerida. */
export interface CordinhaDaMeta {
  readonly ossos: readonly string[];
  /** Um por osso (a junta que sai dele; o da ponta é só a pontinha); `null` se o artista não os deu (o motor mede no esqueleto). */
  readonly comprimentosM: readonly number[] | null;
  /** A massa que o artista sugere para cada junta, em **gramas**; `null` se não deu. */
  readonly massaSugeridaGPorJunta: number | null;
  /** `false` quando o artista deixou a cordinha animada nas ações e não quer a simulação. */
  readonly simulada: boolean;
}

/**
 * Os números do látex que o artista propõe (v2, `latex_proposta`): o que o jogo experimenta no material de látex dos níveis em que a
 * malha é a alta. O que o artista não diz fica `undefined` e o material mantém o padrão do pacote.
 */
export interface LatexProposto {
  readonly roughness?: number;
  readonly metalness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: number;
  readonly sheenRoughness?: number;
  readonly specularIntensity?: number;
  readonly ior?: number;
  /** A cor de vértice (`COLOR_0`, tons de cinza) multiplica a cor da equipe. */
  readonly vertexColors?: boolean;
}

/** Como um eixo da escala do acessório acompanha a do nó (v3): `escala_final = clamp(1 + segue × (escala_do_nó − 1), piso, teto)`. */
export interface RegraDeEscalaDoAcessorio {
  readonly segue: number;
  readonly piso: number;
  readonly teto: number;
}

/**
 * A âncora onde os acessórios (o chapéu) se prendem (v3, `ancora_chapeu`): o nó, o osso pai (o que acompanha o estica e amassa) e a regra
 * de escala por eixo: a largura (média de x e z) e a altura (y). O acessório herda a escala do osso, e a regra a compensa.
 */
export interface AncoraDeAcessorioDaMeta {
  readonly no: string;
  readonly pai: string;
  readonly largura: RegraDeEscalaDoAcessorio;
  readonly altura: RegraDeEscalaDoAcessorio;
}

/** Uma variante de malha do rosto (v3, o bigode): o nó de cada nível, que o arquivo entrega oculto (escala 0) e com as mesmas formas do rosto. */
export interface VarianteDaMeta {
  readonly noAlta: string;
  readonly noBaixa: string;
}

/** Um estilo de olho (v3): a forma `estilo_*` (ou `null` no estilo de fábrica) e o nome do material da esclera e da íris. */
export interface EstiloDeOlhoDaMeta {
  readonly forma: string | null;
  readonly esclera: string;
  readonly iris: string;
}

/** Os estilos de olho (v3) e o nó da vitrine, a malha oculta que guarda os materiais dos estilos que o corpo não usa. */
export interface EstilosDeOlhoDaMeta {
  readonly itens: ReadonlyMap<string, EstiloDeOlhoDaMeta>;
  readonly vitrine: string;
}

/** As cores de íris (v3): o tom de cada uma (`0xRRGGBB`, sRGB) e a de fábrica. */
export interface CoresDeOlhoDaMeta {
  readonly padrao: string;
  readonly cores: ReadonlyMap<string, number>;
}

/** O tamanho do personagem em repouso (m): metade da altura do corpo, raio, onde fica o nó e o comprimento da cordinha. */
export interface TamanhoDeRepouso {
  readonly metadeAlturaM: number;
  readonly raioM: number;
  readonly noZM: number;
  readonly cordinhaM: number;
}

/** As notas do artista sobre um personagem de rosto (`balao-meta.json`): formas, olhos, ações e pontos de ancoragem. */
export interface MetaDoRosto {
  /** O número de versão do arquivo (1 se ele não diz): as chaves novas de cada versão são opcionais e se desligam sozinhas. */
  readonly versao: number;
  readonly palpebras: PalpebrasDaMeta | null;
  readonly cordinha: CordinhaDaMeta | null;
  /** O látex proposto pelo artista, ou `null` se o arquivo não o traz. */
  readonly latexProposto: LatexProposto | null;
  /** Quanto cada cara deixa o olho aberto (0 a 1; a cara de olho fechado é 0): as pálpebras que seguem o olhar valem isto vezes o que o olhar pede. Sem a nota, 1. */
  readonly aberturaDaCara: ReadonlyMap<string, number>;
  /** Quanto da cara fica, numa piscadinha (0 a 1), para a pálpebra não deixar fresta nem afundar. Sem a nota, 1. */
  readonly pesoDaCaraNaPiscadinha: ReadonlyMap<string, number>;
  readonly tamanhoDeRepouso: TamanhoDeRepouso | null;
  /** Todas as formas (morph targets), na ordem do arquivo. */
  readonly formas: readonly string[];
  /** As formas que são caras (`cara_*`): uma por vez, misturadas entre si; as outras (o piscar) são à parte. */
  readonly caras: readonly string[];
  readonly acoes: ReadonlyMap<string, AcaoDoRosto>;
  readonly olhos: ReadonlyMap<string, OlhoDaMeta>;
  readonly limiteDoOlharRad: number;
  readonly ancoras: ReadonlyMap<string, AncoraDaMeta>;
  /** v3: onde o chapéu se prende e a regra de escala dele; `null` sem a chave (v1 e v2). */
  readonly ancoraDeAcessorio: AncoraDeAcessorioDaMeta | null;
  /** v3: os bigodes (variantes de malha) por id, na ordem do arquivo; vazio sem a chave. */
  readonly bigodes: ReadonlyMap<string, VarianteDaMeta>;
  /** v3: os estilos de olho; `null` sem a chave. */
  readonly estilosDeOlho: EstilosDeOlhoDaMeta | null;
  /** v3: as cores de íris; `null` sem a chave. */
  readonly coresDeOlho: CoresDeOlhoDaMeta | null;
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

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Um número finito dentro da faixa, ou lança dizendo o campo. */
function numeroEntre(valor: unknown, onde: string, min: number, max: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max) {
    throw new Error(`meta: ${onde} tem de ser um número ${max === Infinity ? `maior ou igual a ${min}` : `de ${min} a ${max}`}`);
  }
  return valor;
}

/** O campo opcional `chave` de `o`: `undefined` se não está; se está, tem de passar em `ler`. */
function opcional<T>(o: Record<string, unknown>, chave: string, caminho: string, ler: (valor: unknown, onde: string) => T): T | undefined {
  return o[chave] === undefined ? undefined : ler(o[chave], `${caminho}.${chave}`);
}

function umaPalpebra(valor: unknown, onde: string, formas: ReadonlySet<string>): { forma: string; grausPara1: number } {
  const o = objeto(valor, onde);
  const forma = texto(o.forma, `${onde}.forma`);
  if (!formas.has(forma)) throw new Error(`meta: ${onde}.forma "${forma}" não está em formas.nomes`);
  return { forma, grausPara1: numeroEntre(o.olhar_graus_para_peso_1, `${onde}.olhar_graus_para_peso_1`, 1e-6, 180) };
}

/** `palpebras` como o Pincel o escreve: `cima` e `baixo`, cada um com `forma` e `olhar_graus_para_peso_1`. */
function lerPalpebras(valor: unknown, formas: ReadonlySet<string>): PalpebrasDaMeta | null {
  if (valor === undefined) return null;
  const o = objeto(valor, 'palpebras');
  return { cima: umaPalpebra(o.cima, 'palpebras.cima', formas), baixo: umaPalpebra(o.baixo, 'palpebras.baixo', formas) };
}

/**
 * `cordinha` como o Pincel a escreve: `ossos` (lista de nomes), `comprimento_de_cada_junta_m` (um número por osso),
 * `massa_sugerida_g_por_junta` (gramas) e `simulada`. A lista de comprimentos tem de ter o tamanho da de ossos, e só pode faltar
 * quando `simulada` é falso.
 */
function lerCordinha(valor: unknown): CordinhaDaMeta | null {
  if (valor === undefined) return null;
  const o = objeto(valor, 'cordinha');
  const simulada = opcional(o, 'simulada', 'cordinha', (v, onde) => {
    if (typeof v !== 'boolean') throw new Error(`meta: ${onde} tem de ser verdadeiro ou falso`);
    return v;
  });
  if (!Array.isArray(o.ossos) || o.ossos.length < (simulada === false ? 1 : 2) || !o.ossos.every((n) => typeof n === 'string' && n !== '')) {
    throw new Error('meta: cordinha.ossos tem de ser uma lista de nomes de osso (pelo menos 2)');
  }
  const ossos = o.ossos as string[];
  const lerComprimentos = (v: unknown): number[] => {
    const onde = 'cordinha.comprimento_de_cada_junta_m';
    if (!Array.isArray(v)) throw new Error(`meta: ${onde} tem de ser uma lista de números (um por osso)`);
    if (v.length !== ossos.length) throw new Error(`meta: ${onde} tem ${v.length} números e cordinha.ossos tem ${ossos.length} ossos`);
    return v.map((n, i) => numeroEntre(n, `${onde}[${i}]`, 1e-9, 1));
  };
  // simulada: o motor usa os comprimentos para conferir os ossos, então sem eles (ou com a chave escrita errado) o arquivo não vale
  const comprimentos = simulada === false ? opcional(o, 'comprimento_de_cada_junta_m', 'cordinha', lerComprimentos) : lerComprimentos(o.comprimento_de_cada_junta_m);
  return {
    ossos,
    comprimentosM: comprimentos ?? null,
    massaSugeridaGPorJunta: opcional(o, 'massa_sugerida_g_por_junta', 'cordinha', (v, onde) => numeroEntre(v, onde, 0, Infinity)) ?? null,
    simulada: simulada ?? true,
  };
}

/** `tamanho_repouso_cm`: `metade_altura` e `raio` obrigatórios; `no_z` e `cordinha` opcionais (cm). */
function lerTamanho(valor: unknown): TamanhoDeRepouso | null {
  if (valor === undefined) return null;
  const o = objeto(valor, 'tamanho_repouso_cm');
  const cm = (v: unknown, onde: string): number => numeroEntre(v, onde, -1000, 1000);
  return {
    metadeAlturaM: numeroEntre(o.metade_altura, 'tamanho_repouso_cm.metade_altura', 1e-9, 1000) / 100,
    raioM: numeroEntre(o.raio, 'tamanho_repouso_cm.raio', 1e-9, 1000) / 100,
    noZM: (opcional(o, 'no_z', 'tamanho_repouso_cm', cm) ?? 0) / 100,
    cordinhaM: (opcional(o, 'cordinha', 'tamanho_repouso_cm', cm) ?? 0) / 100,
  };
}

/** `latex_proposta`: os números do material (cada um opcional); o que for texto (avisos, dicas) o jogo ignora. */
function lerLatexProposto(valor: unknown): LatexProposto | null {
  if (valor === undefined) return null;
  const o = objeto(valor, 'latex_proposta');
  const zeroAUm = (v: unknown, onde: string): number => numeroEntre(v, onde, 0, 1);
  const c = 'latex_proposta';
  return {
    roughness: opcional(o, 'roughness', c, zeroAUm),
    metalness: opcional(o, 'metalness', c, zeroAUm),
    clearcoat: opcional(o, 'clearcoat', c, zeroAUm),
    clearcoatRoughness: opcional(o, 'clearcoatRoughness', c, zeroAUm),
    sheen: opcional(o, 'sheen', c, zeroAUm),
    sheenRoughness: opcional(o, 'sheenRoughness', c, zeroAUm),
    specularIntensity: opcional(o, 'specularIntensity', c, zeroAUm),
    ior: opcional(o, 'ior', c, (v, onde) => numeroEntre(v, onde, 1, 2.333)),
    vertexColors: opcional(o, 'vertexColors', c, (v, onde) => {
      if (typeof v !== 'boolean') throw new Error(`meta: ${onde} tem de ser verdadeiro ou falso`);
      return v;
    }),
  };
}

/** Um mapa de cara para peso (0 a 1): `abertura_da_cara` e `piscar.peso_da_cara_na_piscadinha`. Cada chave tem de ser uma forma do arquivo. */
function mapaDePesos(valor: unknown, onde: string, formas: ReadonlySet<string>): Map<string, number> {
  const mapa = new Map<string, number>();
  if (valor === undefined) return mapa;
  for (const [nome, v] of Object.entries(objeto(valor, onde))) {
    if (!formas.has(nome)) throw new Error(`meta: ${onde}.${nome} não é uma forma de formas.nomes`);
    mapa.set(nome, numeroEntre(v, `${onde}.${nome}`, 0, 1));
  }
  return mapa;
}

/** Uma lista de textos não vazios e sem repetição. */
function listaDeIds(valor: unknown, onde: string): string[] {
  if (!Array.isArray(valor) || valor.length === 0 || !valor.every((n) => typeof n === 'string' && n !== '')) throw new Error(`meta: ${onde} tem de ser uma lista de ids (textos)`);
  if (new Set(valor).size !== valor.length) throw new Error(`meta: ${onde} tem id repetido`);
  return valor as string[];
}

/** `{ ids, itens }`: cada id tem o seu item, e cada item está nos ids (na ordem de `ids`). */
function itensPorId(valor: Record<string, unknown>, onde: string): Array<[string, Record<string, unknown>]> {
  const ids = listaDeIds(valor.ids, `${onde}.ids`);
  const itens = objeto(valor.itens, `${onde}.itens`);
  for (const k of Object.keys(itens)) if (!ids.includes(k)) throw new Error(`meta: ${onde}.itens.${k} não está em ${onde}.ids`);
  return ids.map((id) => {
    if (itens[id] === undefined) throw new Error(`meta: ${onde}.itens.${id} falta (o id está em ${onde}.ids)`);
    return [id, objeto(itens[id], `${onde}.itens.${id}`)];
  });
}

function umEixoDeEscala(valor: unknown, onde: string): RegraDeEscalaDoAcessorio {
  const o = objeto(valor, onde);
  const segue = numeroEntre(o.segue, `${onde}.segue`, 0, 1);
  const piso = numeroEntre(o.piso, `${onde}.piso`, 1e-3, 10);
  const teto = numeroEntre(o.teto, `${onde}.teto`, 1e-3, 10);
  if (teto < piso) throw new Error(`meta: ${onde}.teto tem de ser maior ou igual ao piso`);
  return { segue, piso, teto };
}

/** `ancora_chapeu` como o Pincel a escreve: `no`, `pai` e `escala_do_chapeu.largura|altura` (`segue`, `piso`, `teto`). */
function lerAncoraDeAcessorio(valor: unknown): AncoraDeAcessorioDaMeta | null {
  if (valor === undefined) return null;
  const o = objeto(valor, 'ancora_chapeu');
  const regra = objeto(o.escala_do_chapeu, 'ancora_chapeu.escala_do_chapeu');
  return {
    no: texto(o.no, 'ancora_chapeu.no'),
    pai: texto(o.pai, 'ancora_chapeu.pai'),
    largura: umEixoDeEscala(regra.largura, 'ancora_chapeu.escala_do_chapeu.largura'),
    altura: umEixoDeEscala(regra.altura, 'ancora_chapeu.escala_do_chapeu.altura'),
  };
}

/** `bigodes`: `ids` e `itens.<id>.no_alta|no_baixa`. */
function lerBigodes(valor: unknown): Map<string, VarianteDaMeta> {
  const mapa = new Map<string, VarianteDaMeta>();
  if (valor === undefined) return mapa;
  for (const [id, item] of itensPorId(objeto(valor, 'bigodes'), 'bigodes')) {
    mapa.set(id, { noAlta: texto(item.no_alta, `bigodes.itens.${id}.no_alta`), noBaixa: texto(item.no_baixa, `bigodes.itens.${id}.no_baixa`) });
  }
  return mapa;
}

/** `estilos_de_olho`: `ids`, `itens.<id>` (`forma` texto ou null, `esclera.material`, `iris.material`) e `vitrine.no`. */
function lerEstilosDeOlho(valor: unknown, formas: ReadonlySet<string>): EstilosDeOlhoDaMeta | null {
  if (valor === undefined) return null;
  const o = objeto(valor, 'estilos_de_olho');
  const itens = new Map<string, EstiloDeOlhoDaMeta>();
  for (const [id, item] of itensPorId(o, 'estilos_de_olho')) {
    const c = `estilos_de_olho.itens.${id}`;
    if (item.forma === undefined) throw new Error(`meta: ${c}.forma falta (texto, ou null no estilo de fábrica)`);
    const forma = item.forma === null ? null : texto(item.forma, `${c}.forma`);
    if (forma !== null && !formas.has(forma)) throw new Error(`meta: ${c}.forma "${forma}" não está em formas.nomes`);
    itens.set(id, {
      forma,
      esclera: texto(objeto(item.esclera, `${c}.esclera`).material, `${c}.esclera.material`),
      iris: texto(objeto(item.iris, `${c}.iris`).material, `${c}.iris.material`),
    });
  }
  return { itens, vitrine: texto(objeto(o.vitrine, 'estilos_de_olho.vitrine').no, 'estilos_de_olho.vitrine.no') };
}

const COR_HEX = /^#[0-9a-fA-F]{6}$/;

function corHex(valor: unknown, onde: string): number {
  if (typeof valor !== 'string' || !COR_HEX.test(valor)) throw new Error(`meta: ${onde} tem de ser uma cor "#RRGGBB"`);
  return parseInt(valor.slice(1), 16);
}

/** `cores_de_olho`: `ids`, `padrao` e `cores.<id>.cor` (`centro` e `borda`, se vierem, também têm de ser "#RRGGBB"). */
function lerCoresDeOlho(valor: unknown): CoresDeOlhoDaMeta | null {
  if (valor === undefined) return null;
  const o = objeto(valor, 'cores_de_olho');
  const ids = listaDeIds(o.ids, 'cores_de_olho.ids');
  const cores = objeto(o.cores, 'cores_de_olho.cores');
  for (const k of Object.keys(cores)) if (!ids.includes(k)) throw new Error(`meta: cores_de_olho.cores.${k} não está em cores_de_olho.ids`);
  const mapa = new Map<string, number>();
  for (const id of ids) {
    const c = `cores_de_olho.cores.${id}`;
    const cor = objeto(cores[id], c);
    mapa.set(id, corHex(cor.cor, `${c}.cor`));
    opcional(cor, 'centro', c, corHex);
    opcional(cor, 'borda', c, corHex);
  }
  const padrao = texto(o.padrao, 'cores_de_olho.padrao');
  if (!mapa.has(padrao)) throw new Error(`meta: cores_de_olho.padrao "${padrao}" não está em cores_de_olho.ids`);
  return { padrao, cores: mapa };
}

function trecho(valor: unknown, onde: string, fps: number): [number, number] | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (!Array.isArray(valor) || valor.length !== 2) throw new Error(`meta: ${onde} tem de ser [de, até]`);
  return [numero(valor[0], `${onde}[0]`) / fps, numero(valor[1], `${onde}[1]`) / fps];
}

/**
 * Lê o arquivo de notas que o artista exporta junto do `.glb` de um personagem de rosto (`balao-meta.json`). Os quadros viram
 * segundos pelo `fps` da ação, e a duração é quadros / fps (a ação vai de 0 a esse tempo).
 *
 * As chaves do v2 (`palpebras`, `cordinha`, `abertura_da_cara`, `piscar`, `tamanho_repouso_cm`, `latex_proposta`) e as do v3
 * (`ancora_chapeu`, `bigodes`, `estilos_de_olho`, `cores_de_olho`) são opcionais: se
 * a chave não está, o recurso dela fica desligado. Se **está**, tem de estar escrita como o Pincel a escreve (uma grafia por
 * campo): campo errado, de tipo errado, fora da faixa, ou nome que não é de uma forma do arquivo, lança dizendo qual campo. O
 * recurso nunca se desliga em silêncio por causa de um erro de digitação.
 */
export function lerMetaDoRosto(json: unknown): MetaDoRosto {
  const raiz = objeto(json, 'o arquivo');
  const acoes = new Map<string, AcaoDoRosto>();
  const paresDeCara = ehObjeto(raiz.par_de_cara) ? raiz.par_de_cara : {};
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
      ...(typeof a.cara_par === 'string' ? { caraPar: a.cara_par } : typeof paresDeCara[nome] === 'string' ? { caraPar: paresDeCara[nome] as string } : {}),
    });
  }
  const formas = raiz.formas === undefined ? [] : objeto(raiz.formas, 'formas').nomes;
  if (!Array.isArray(formas)) throw new Error('meta: formas.nomes tem de ser uma lista');
  const nomesDasFormas = formas.map((n, i) => texto(n, `formas.nomes[${i}]`));
  const conjuntoDasFormas = new Set(nomesDasFormas);
  const piscar = raiz.piscar === undefined ? {} : objeto(raiz.piscar, 'piscar');
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
    versao: typeof raiz.versao === 'number' && Number.isFinite(raiz.versao) ? raiz.versao : 1,
    palpebras: lerPalpebras(raiz.palpebras, conjuntoDasFormas),
    cordinha: lerCordinha(raiz.cordinha),
    latexProposto: lerLatexProposto(raiz.latex_proposta),
    aberturaDaCara: mapaDePesos(raiz.abertura_da_cara, 'abertura_da_cara', conjuntoDasFormas),
    pesoDaCaraNaPiscadinha: mapaDePesos(piscar.peso_da_cara_na_piscadinha, 'piscar.peso_da_cara_na_piscadinha', conjuntoDasFormas),
    tamanhoDeRepouso: lerTamanho(raiz.tamanho_repouso_cm),
    formas: nomesDasFormas,
    caras: nomesDasFormas.filter((n) => n.startsWith('cara_')),
    acoes,
    olhos,
    limiteDoOlharRad: (limiteGraus * Math.PI) / 180,
    ancoras,
    ancoraDeAcessorio: lerAncoraDeAcessorio(raiz.ancora_chapeu),
    bigodes: lerBigodes(raiz.bigodes),
    estilosDeOlho: lerEstilosDeOlho(raiz.estilos_de_olho, conjuntoDasFormas),
    coresDeOlho: lerCoresDeOlho(raiz.cores_de_olho),
  };
}
