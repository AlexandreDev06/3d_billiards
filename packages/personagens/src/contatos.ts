import type { Trio } from './tipos';

/** Segurar um cilindro (um taco, um cabo): onde o eixo passa pela mão e para onde ele vai, no referencial do personagem. */
export interface ContatoDeCilindro {
  /** Um ponto do eixo (m): onde a mão segura. */
  readonly ponto: Trio;
  /** A direção do eixo, unitária, do fim largo ao fim fino. */
  readonly eixo: Trio;
  /** Quanto falta do ponto ao fim fino (m) e o comprimento do cilindro. */
  readonly distanciaDoFim: number;
  readonly comprimento: number;
  /** O raio no fim fino e no fim largo (m). */
  readonly raioFino: number;
  readonly raioLargo: number;
  /** O quanto o eixo sobe do ponto ao fim fino em relação ao plano do apoio, em graus (negativo: desce), quando o arquivo diz. */
  readonly elevacaoGraus?: number;
  /** A distância do eixo ao plano do apoio, no ponto e no fim fino (m), medida na vertical do personagem. */
  readonly alturaDoEixoAoPlano?: { readonly noPonto: number; readonly naFim: number };
  /** O plano em que a mão pousa nesta pose, quando há um. */
  readonly apoio?: ApoioDoContato;
}

/** O plano horizontal (a normal é `+z` do personagem) em que as pontas dos dedos pousam numa pose, e o que o artista chama de material dele. */
export interface ApoioDoContato {
  /** O material do plano (`pano`, `madeira`). */
  readonly tipo: string;
  readonly ponto: Trio;
  readonly normal: Trio;
  /** Quais partes da mão tocam o plano. */
  readonly toca: readonly string[];
}

/** O contato de um gesto com uma superfície (as palmas, o tapinha): o plano em que a mão encosta e o quadro de cada encontro. */
export interface ContatoDeGesto {
  /** Os quadros (a 30/s) em que a mão toca o plano. */
  readonly quadros: readonly number[];
  /** Onde a mão toca, no referencial do personagem, no primeiro quadro e em cada um. */
  readonly ponto: Trio;
  readonly pontos: readonly Trio[];
  /** O plano: a normal e a posição dele ao longo do eixo `x`, `y` ou `z` do personagem (m). */
  readonly planoNormal: Trio;
  readonly planoValor: number;
  /** Para onde olha a palma no contato. */
  readonly normalDaPalma: Trio;
}

/** Pinçar um cubo: o centro dele e os eixos dele, no referencial do personagem. */
export interface ContatoDePinca {
  readonly centro: Trio;
  /** O eixo que liga o polegar ao outro dedo (a normal das duas faces apertadas). */
  readonly pinca: Trio;
  /** Um dos outros dois eixos do cubo; o terceiro é `pinca × lado`. */
  readonly lado: Trio;
  /** A aresta do cubo (m). */
  readonly aresta: number;
}

/** Apoiar a palma: um ponto da pele da palma, a normal dela (para fora) e para onde os dedos apontam, no referencial do personagem. */
export interface ContatoDePalma {
  readonly centro: Trio;
  readonly normal: Trio;
  readonly rumo: Trio;
}

/** Onde a mão toca o que segura em cada pose, por nome de pose, e onde encosta em cada gesto, por nome de gesto. */
export interface Contatos {
  readonly cilindros: ReadonlyMap<string, ContatoDeCilindro>;
  readonly pincas: ReadonlyMap<string, ContatoDePinca>;
  readonly gestos: ReadonlyMap<string, ContatoDeGesto>;
}

function trio(valor: unknown, onde: string): Trio {
  if (!Array.isArray(valor) || valor.length !== 3 || valor.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error(`contatos: ${onde} tem de ser [x, y, z] de números`);
  }
  return [valor[0], valor[1], valor[2]];
}

function numero(valor: unknown, onde: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new Error(`contatos: ${onde} tem de ser um número`);
  return valor;
}

function lista(valor: unknown, onde: string): unknown[] {
  if (!Array.isArray(valor)) throw new Error(`contatos: ${onde} tem de ser uma lista`);
  return valor;
}

function apoioDe(valor: unknown, chave: string): ApoioDoContato | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'object' || valor === null) throw new Error(`contatos: ${chave}.apoio tem de ser um objeto`);
  const a = valor as Record<string, unknown>;
  return {
    tipo: typeof a.tipo === 'string' ? a.tipo : '',
    ponto: trio(a.ponto_m, `${chave}.apoio.ponto_m`),
    normal: trio(a.normal, `${chave}.apoio.normal`),
    toca: lista(a.toca ?? [], `${chave}.apoio.toca`).map(String),
  };
}

function gestoDe(entrada: Record<string, unknown>, chave: string): ContatoDeGesto {
  const plano = entrada.plano;
  if (typeof plano !== 'object' || plano === null) throw new Error(`contatos: ${chave}.plano tem de ser um objeto`);
  const p = plano as Record<string, unknown>;
  return {
    quadros: lista(entrada.quadros, `${chave}.quadros`).map((q, i) => numero(q, `${chave}.quadros[${i}]`)),
    ponto: trio(entrada.ponto_m, `${chave}.ponto_m`),
    pontos: lista(entrada.pontos_m ?? [entrada.ponto_m], `${chave}.pontos_m`).map((t, i) => trio(t, `${chave}.pontos_m[${i}]`)),
    planoNormal: trio(p.normal, `${chave}.plano.normal`),
    planoValor: numero(p.valor_m, `${chave}.plano.valor_m`),
    normalDaPalma: trio(entrada.normal_da_palma, `${chave}.normal_da_palma`),
  };
}

function alturaDe(valor: unknown, chave: string): { alturaDoEixoAoPlano?: { noPonto: number; naFim: number } } {
  if (valor === undefined) return {};
  if (typeof valor !== 'object' || valor === null) throw new Error(`contatos: ${chave}.altura_do_taco_ao_plano_mm tem de ser um objeto`);
  const a = valor as Record<string, unknown>;
  return {
    alturaDoEixoAoPlano: {
      noPonto: numero(a.no_ponto, `${chave}.altura_do_taco_ao_plano_mm.no_ponto`) / 1000,
      naFim: numero(a.na_ponta, `${chave}.altura_do_taco_ao_plano_mm.na_ponta`) / 1000,
    },
  };
}

function unitario(v: Trio, onde: string): Trio {
  const n = Math.hypot(...v);
  if (n < 0.99 || n > 1.01) throw new Error(`contatos: ${onde} tem de ser unitário (norma ${n.toFixed(4)})`);
  return [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * Lê o arquivo de contatos que o artista exporta junto do `.glb` (`mao-taco.json`): uma entrada por pose, com `tipo` `taco` ou
 * `cilindro` (segurar um cilindro) ou `cubo_de_giz` ou `cubo` (pinçar um cubo), e as medidas em metros no referencial do
 * personagem. O nome da pose é a chave sem o prefixo `pose_`; os contatos de gesto (`tipo: "contato"`), a sem `gesto_`. Lança, dizendo qual campo, se o arquivo estiver errado.
 */
export function lerContatos(json: unknown): Contatos {
  if (typeof json !== 'object' || json === null) throw new Error('contatos: o arquivo tem de ser um objeto');
  const cilindros = new Map<string, ContatoDeCilindro>();
  const pincas = new Map<string, ContatoDePinca>();
  const gestos = new Map<string, ContatoDeGesto>();
  for (const [chave, bruto] of Object.entries(json)) {
    if (typeof bruto !== 'object' || bruto === null || !('tipo' in bruto)) continue;
    const entrada = bruto as Record<string, unknown>;
    const nome = chave.replace(/^pose_/, '');
    if (entrada.tipo === 'taco' || entrada.tipo === 'cilindro') {
      const apoio = apoioDe(entrada.apoio, chave);
      cilindros.set(nome, {
        ponto: trio(entrada.ponto_m, `${chave}.ponto_m`),
        eixo: unitario(trio(entrada.direcao_cabo_para_ponta, `${chave}.direcao_cabo_para_ponta`), `${chave}.direcao_cabo_para_ponta`),
        distanciaDoFim: numero(entrada.ponta_a_ponto_m, `${chave}.ponta_a_ponto_m`),
        comprimento: numero(entrada.comprimento_m, `${chave}.comprimento_m`),
        raioFino: numero(entrada.raio_ponta_m, `${chave}.raio_ponta_m`),
        raioLargo: numero(entrada.raio_cabo_m, `${chave}.raio_cabo_m`),
        ...(entrada.elevacao_do_taco_graus === undefined ? {} : { elevacaoGraus: numero(entrada.elevacao_do_taco_graus, `${chave}.elevacao_do_taco_graus`) }),
        ...alturaDe(entrada.altura_do_taco_ao_plano_mm, chave),
        ...(apoio === undefined ? {} : { apoio }),
      });
    } else if (entrada.tipo === 'cubo_de_giz' || entrada.tipo === 'cubo') {
      pincas.set(nome, {
        centro: trio(entrada.centro_m, `${chave}.centro_m`),
        pinca: unitario(trio(entrada.eixo_n, `${chave}.eixo_n`), `${chave}.eixo_n`),
        lado: unitario(trio(entrada.eixo_e1, `${chave}.eixo_e1`), `${chave}.eixo_e1`),
        aresta: numero(entrada.aresta_m, `${chave}.aresta_m`),
      });
    } else if (entrada.tipo === 'contato') {
      // O contato de um gesto (as palmas, o tapinha): é do gesto, não da mão no taco nem no cubo.
      gestos.set(chave.replace(/^gesto_/, ''), gestoDe(entrada, chave));
    } else {
      throw new Error(`contatos: ${chave}.tipo "${String(entrada.tipo)}" desconhecido`);
    }
  }
  return { cilindros, pincas, gestos };
}

/** O raio do cilindro no ponto onde a mão o segura (m): entre o fim fino e o fim largo, pela distância ao fim fino. */
export function raioNoPonto(c: ContatoDeCilindro): number {
  return c.raioFino + ((c.raioLargo - c.raioFino) * c.distanciaDoFim) / c.comprimento;
}
