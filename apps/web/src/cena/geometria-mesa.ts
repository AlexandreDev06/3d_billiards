import { BOLA, BOLAO, cacapas, pontasTabela, tabelas, type Cacapa, type MedidasMesa, type Ponto2 } from '@sinuca/fisica';
import type { ConfigMesa } from '../config';

export type ConfigGeometriaMesa = Pick<ConfigMesa, 'folgaRebaixo' | 'chanfroTopo' | 'raioCantoMoldura' | 'segmentosPorVolta' | 'paredeDaCacapa'>;

/** Uma das duas faces da garganta de uma caçapa: a da quina de uma ponta de tabela. */
export interface FaceDaGarganta {
  /** A quina, na linha do nariz de `tabelas()`. */
  readonly quina: Ponto2;
  /** Onde a face toca o círculo de queda (`PontaTabela.fimDaFace`): `quina + eixo · (fundo + raio)`. */
  readonly fimDaFace: Ponto2;
  /** Onde a face sai da borracha, na linha de trás dela (`larguraTabela` além do nariz): daí em diante a parede é de madeira. */
  readonly naBorracha: Ponto2;
  /** Normal unitária da tabela desta quina, para fora da mesa. */
  readonly fora: Ponto2;
}

/**
 * O buraco que se vê na mesa: o círculo de queda da física (`Cacapa.queda`), no fundo da garganta. A garganta é o canal entre
 * as duas faces das quinas, que correm paralelas ao `eixo` da boca até tocarem o círculo (`fimDaFace`): a bola que para nela
 * está sobre o pano; a que passa da linha de queda sai da mesa onde o buraco começa.
 */
export interface FuroVisual {
  /** A caçapa da física que ele mostra. */
  readonly fisica: Cacapa;
  /** Centro e raio do buraco: o círculo de queda da física. */
  readonly centro: Ponto2;
  readonly raio: number;
  /** Unitário, perpendicular à boca, apontando para fora da mesa; o centro do buraco está `fundo + raio` além da boca. */
  readonly eixo: Ponto2;
  /** Ponto médio da boca (de quina a quina). */
  readonly boca: Ponto2;
  /** As duas faces da garganta, a de menor ângulo (em volta do centro da mesa) primeiro. */
  readonly faces: readonly [FaceDaGarganta, FaceDaGarganta];
}

/** Ponto do perfil da tabela: `d` para fora a partir do nariz, `y` acima do pano. */
export interface PontoDoPerfil {
  readonly d: number;
  readonly y: number;
}

export interface AnelDaTabela {
  readonly y: number;
  readonly contorno: Ponto2[];
}

const DOIS_PI = 2 * Math.PI;
const TOLERANCIA = 1e-9;
const PASSOS_DA_FACE = 4;

const sub = (a: Ponto2, b: Ponto2): Ponto2 => ({ x: a.x - b.x, z: a.z - b.z });
const dot = (a: Ponto2, b: Ponto2): number => a.x * b.x + a.z * b.z;
const mais = (a: Ponto2, v: Ponto2, k: number): Ponto2 => ({ x: a.x + v.x * k, z: a.z + v.z * k });
const distancia = (a: Ponto2, b: Ponto2): number => Math.hypot(a.x - b.x, a.z - b.z);

function unitario(v: Ponto2): Ponto2 {
  const n = Math.hypot(v.x, v.z);
  return { x: v.x / n, z: v.z / n };
}

/** ângulo de `p` em torno de `centro`, no plano XZ. */
const anguloEm = (centro: Ponto2, p: Ponto2): number => Math.atan2(p.z - centro.z, p.x - centro.x);

const ORIGEM: Ponto2 = { x: 0, z: 0 };

/**
 * Os seis buracos, na ordem de `cacapas()`: cada um é o círculo de queda da física (centro e raio de `Cacapa.queda`) e as
 * duas faces da garganta até ele (`pontasTabela()`: quina e `fimDaFace`). Nada do desenho decide o tamanho do buraco.
 */
export function furosVisuais(mesa: MedidasMesa): FuroVisual[] {
  const pontas = pontasTabela(mesa);
  const segmentos = tabelas(mesa);
  return cacapas(mesa).map((fisica) => {
    const daBoca = pontas.filter((p) => p.cacapa === fisica.id);
    if (daBoca.length !== 2) throw new RangeError(`a boca de ${fisica.id} precisa de duas pontas de tabela, tem ${daBoca.length}`);
    const faces = daBoca
      .map((p): FaceDaGarganta => {
        const normal = segmentos[p.tabela]!.normal;
        const fora = { x: -normal.x, z: -normal.z };
        return { quina: p.quina, fimDaFace: p.fimDaFace, naBorracha: mais(p.quina, fisica.eixo, mesa.larguraTabela / dot(fisica.eixo, fora)), fora };
      })
      .sort((a, b) => anguloEm(ORIGEM, a.quina) - anguloEm(ORIGEM, b.quina)) as [FaceDaGarganta, FaceDaGarganta];
    return { fisica, centro: fisica.queda.centro, raio: fisica.queda.raio, eixo: fisica.eixo, boca: fisica.boca, faces };
  });
}

/**
 * Quanto a moldura precisa ter de largura para o buraco caber com `paredeDaCacapa` de madeira até a borda de fora: o círculo de
 * queda do meio vai `fundoMeio + 2 · raio` além do nariz (mais fundo que a moldura da física, de 8 cm). Nunca menos que
 * `larguraMoldura` das medidas.
 */
export function larguraDaMoldura(mesa: MedidasMesa, cfg: Pick<ConfigMesa, 'paredeDaCacapa'>): number {
  const hx = mesa.comprimento / 2;
  const hz = mesa.largura / 2;
  let alcance = 0;
  for (const { queda } of cacapas(mesa)) {
    alcance = Math.max(alcance, Math.abs(queda.centro.x) + queda.raio - hx, Math.abs(queda.centro.z) + queda.raio - hz);
  }
  return Math.max(mesa.larguraMoldura, alcance + cfg.paredeDaCacapa - mesa.larguraTabela);
}

/** As medidas da mesa com a moldura da largura que o desenho precisa (`larguraDaMoldura`): é com elas que se monta a mesa visível. */
export const comMolduraVisual = (mesa: MedidasMesa, cfg: Pick<ConfigMesa, 'paredeDaCacapa'>): MedidasMesa => ({ ...mesa, larguraMoldura: larguraDaMoldura(mesa, cfg) });

/**
 * Quanto a face do nariz recua no pano. A bola encostada toca o nariz com a normal a `θ`
 * acima da horizontal (`sen θ = h/R - 1`); a reta tangente nesse ponto chega ao pano a
 * `h·tan θ` do nariz, e uma face mais inclinada que ela entra na bola. Vale a maior das bolas.
 */
function rebaixoDoNariz(mesa: MedidasMesa, cfg: ConfigGeometriaMesa): number {
  let tangente = 0;
  for (const { raio } of [BOLA, BOLAO]) {
    const sen = Math.min(0.999, Math.max(-1, mesa.alturaTabela / raio - 1));
    tangente = Math.max(tangente, (mesa.alturaTabela * sen) / Math.sqrt(1 - sen * sen));
  }
  return tangente + cfg.folgaRebaixo;
}

/**
 * Corte da tabela, do pano ao topo. A face do nariz desce do nariz (d = 0, y = altura)
 * até `rebaixoDoNariz` atrás dele no pano, de modo que a bola encostada (cujo centro fica
 * a `R·cos θ` do nariz) não entra na borracha; atrás do nariz o topo sobe num quarto de círculo.
 */
export function perfilNariz(mesa: MedidasMesa, cfg: ConfigGeometriaMesa): PontoDoPerfil[] {
  const rebaixo = rebaixoDoNariz(mesa, cfg);
  const perfil: PontoDoPerfil[] = [];
  // A face é reta; os anéis intermediários deixam o nariz recuar aos poucos, sem salto.
  for (let k = 0; k < PASSOS_DA_FACE; k++) {
    perfil.push({ d: rebaixo * (1 - k / PASSOS_DA_FACE), y: (mesa.alturaTabela * k) / PASSOS_DA_FACE });
  }
  perfil.push({ d: 0, y: mesa.alturaTabela });
  const passos = 4;
  for (let k = 1; k <= passos; k++) {
    const fi = (k / passos) * (Math.PI / 2);
    perfil.push({ d: cfg.chanfroTopo * (1 - Math.cos(fi)), y: mesa.alturaTabela + cfg.chanfroTopo * Math.sin(fi) });
  }
  return perfil;
}

/** Varredura (rad, com sinal) do menor arco entre dois ângulos. */
function varreduraCurta(de: number, para: number): number {
  const ccw = (((para - de) % DOIS_PI) + DOIS_PI) % DOIS_PI;
  return ccw <= Math.PI ? ccw : ccw - DOIS_PI;
}

/** `n + 1` pontos do arco que sai de `inicio` e varre `varredura` rad em torno de `centro`. */
function pontosDoArco(centro: Ponto2, raio: number, inicio: number, varredura: number, n: number): Ponto2[] {
  const pontos: Ponto2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = inicio + (varredura * k) / Math.max(n, 1);
    pontos.push({ x: centro.x + raio * Math.cos(a), z: centro.z + raio * Math.sin(a) });
  }
  return pontos;
}

/** Lados do arredondado da ponta da borracha (o arco da física, em segmentos). */
const SEGMENTOS_DA_PONTA = 6;

/**
 * A ponta arredondada da borracha: um arco de raio `raio` (`raioQuinaCanto`/`raioQuinaMeio`, os mesmos da física)
 * tangente ao nariz e à face, a `raio / tan(α/2)` do vértice. Com o nariz na linha da física é a curva de
 * `pontasTabela()`. Se a face é mais curta que isso, o raio encolhe até caber.
 */
function arredondarPonta(vertice: Ponto2, paraDentro: Ponto2, face: Ponto2, comprimentoDaFace: number, raio: number): Ponto2[] {
  const alfa = Math.acos(Math.min(1, Math.max(-1, dot(paraDentro, face))));
  const tangente = Math.min(raio / Math.tan(alfa / 2), comprimentoDaFace);
  const raioReal = tangente * Math.tan(alfa / 2);
  const noNariz = mais(vertice, paraDentro, tangente);
  const naFace = mais(vertice, face, tangente);
  const centro = mais(vertice, unitario(mais(paraDentro, face, 1)), raioReal / Math.sin(alfa / 2));
  const inicio = anguloEm(centro, noNariz);
  return pontosDoArco(centro, raioReal, inicio, varreduraCurta(inicio, anguloEm(centro, naFace)), SEGMENTOS_DA_PONTA);
}


/** A tabela vista de cima: onde ela começa, para onde corre, para onde é "fora" e quanto o nariz está recuado. */
interface EixosDaTabela {
  readonly e: Ponto2;
  readonly fora: Ponto2;
  readonly recuo: number;
}

interface PontaDaTabela {
  /** O vértice do nariz (recuado) com a face da quina, antes do arredondado. */
  readonly nariz: Ponto2;
  /** Onde a face sai da borracha, na linha de trás dela. */
  readonly naBorracha: Ponto2;
  /** O arredondado da ponta, do nariz reto à face (`SEGMENTOS_DA_PONTA + 1` pontos). */
  readonly ponta: Ponto2[];
}

/**
 * Uma ponta da tabela: o nariz (recuado `recuo` atrás da linha da física) encontra a face da quina, que corre paralela ao eixo
 * da boca até a linha de trás da borracha; daí em diante a parede é a de madeira da moldura. `lado` = -1 para a ponta de
 * `inicio`, +1 para a de `fim`.
 */
function pontaDaTabela(furo: FuroVisual, face: FaceDaGarganta, lado: -1 | 1, { e, fora, recuo }: EixosDaTabela, mesa: MedidasMesa): PontaDaTabela {
  const { eixo } = furo;
  const nariz = mais(face.quina, eixo, recuo / dot(eixo, fora));
  const noCanto = Math.abs(furo.fisica.boca.x) > TOLERANCIA;
  const paraDentro = lado < 0 ? e : { x: -e.x, z: -e.z };
  // O mesmo arco de `pontasTabela()`: o raio vem das medidas da mesa, o desenho não tem número próprio.
  const ponta = arredondarPonta(nariz, paraDentro, eixo, distancia(nariz, face.naBorracha), noCanto ? mesa.raioQuinaCanto : mesa.raioQuinaMeio);
  return { nariz, naBorracha: face.naBorracha, ponta };
}

/** A face da garganta que nasce na quina `q`, e o furo dela. */
function faceDaQuina(furos: readonly FuroVisual[], q: Ponto2): { readonly furo: FuroVisual; readonly face: FaceDaGarganta } {
  for (const furo of furos) {
    const face = furo.faces.find((f) => distancia(f.quina, q) < TOLERANCIA);
    if (face) return { furo, face };
  }
  throw new RangeError('quina sem furo visual');
}

/**
 * Contorno 2D de uma das seis tabelas (a borracha), com o nariz `recuo` atrás da linha da física. Pontos, em ordem: os dois
 * primeiros são os extremos da parte reta do nariz, `inicio` → `fim` (a ponta é arredondada só no desenho, então eles ficam um
 * pouco antes das quinas); depois, saindo de `fim`, o arredondado da ponta e a face da quina até a linha de trás da borracha;
 * e o mesmo, ao contrário, na ponta de `inicio`. A linha de trás liga os dois lados e é a aresta de índice `n / 2`.
 * O número de pontos não depende do `recuo`, para os anéis poderem ser ligados.
 */
export function contornoTabela(mesa: MedidasMesa, _cfg: ConfigGeometriaMesa, indice: number, recuo = 0): Ponto2[] {
  const segmento = tabelas(mesa)[indice];
  if (!segmento) throw new RangeError(`tabela ${indice} não existe`);
  const furos = furosVisuais(mesa);
  const eixos: EixosDaTabela = { e: unitario(sub(segmento.fim, segmento.inicio)), fora: { x: -segmento.normal.x, z: -segmento.normal.z }, recuo };
  const de = (quina: Ponto2, lado: -1 | 1): PontaDaTabela => {
    const { furo, face } = faceDaQuina(furos, quina);
    return pontaDaTabela(furo, face, lado, eixos, mesa);
  };
  const ponta0 = de(segmento.inicio, -1);
  const ponta1 = de(segmento.fim, 1);
  /** Do arredondado (sem o primeiro ponto, que é o fim do nariz reto) até a linha de trás. */
  const caminho = (p: PontaDaTabela): Ponto2[] => [...p.ponta.slice(1), p.naBorracha];
  return [ponta0.ponta[0]!, ponta1.ponta[0]!, ...caminho(ponta1), ...caminho(ponta0).reverse()];
}

/** Os anéis da tabela, do pano ao topo, um por ponto de `perfilNariz()`; todos com o mesmo número de pontos. */
export function aneisTabela(mesa: MedidasMesa, cfg: ConfigGeometriaMesa, indice: number): AnelDaTabela[] {
  return perfilNariz(mesa, cfg).map(({ d, y }) => ({ y, contorno: contornoTabela(mesa, cfg, indice, d) }));
}

/** O círculo do buraco como polígono (anti-horário em XZ), com os lados de `segmentosPorVolta`. */
export function circuloDoFuro(furo: FuroVisual, cfg: Pick<ConfigGeometriaMesa, 'segmentosPorVolta'>): Ponto2[] {
  return pontosDoArco(furo.centro, furo.raio, 0, DOIS_PI, cfg.segmentosPorVolta).slice(0, -1);
}

/**
 * O pano: um retângulo que cobre a área de jogo, as tabelas e a garganta das caçapas, por baixo da moldura, furado em seis
 * círculos (os buracos). Assim a bola parada na garganta tem pano sob ela, e o buraco começa onde a física derruba a bola.
 */
export function contornoPano(mesa: MedidasMesa, cfg: ConfigGeometriaMesa): { readonly externo: Ponto2[]; readonly furos: Ponto2[][] } {
  // Quase até a borda de fora da moldura (a madeira por cima esconde o pano): cobre a garganta inteira e deixa todo buraco dentro
  // do retângulo, com meia parede de madeira de sobra.
  const sobra = mesa.larguraTabela + mesa.larguraMoldura - cfg.paredeDaCacapa / 2;
  const hx = mesa.comprimento / 2 + sobra;
  const hz = mesa.largura / 2 + sobra;
  return {
    externo: [
      { x: -hx, z: -hz },
      { x: hx, z: -hz },
      { x: hx, z: hz },
      { x: -hx, z: hz },
    ],
    furos: furosVisuais(mesa).map((f) => circuloDoFuro(f, cfg)),
  };
}

/**
 * O contorno de madeira de um buraco, de uma ponta a outra, andando em volta da mesa no sentido anti-horário: sai da face
 * da quina de menor ângulo no ponto onde ela deixa a borracha, segue em linha reta pela parede de madeira até tocar o círculo
 * (`fimDaFace`), contorna o círculo pelo lado de fora da mesa e volta pela outra face até a borracha.
 * `retas` pontos por lado reto (além das pontas) e os lados do arco vêm de `segmentosPorVolta`.
 */
function caminhoDoEntalhe(furo: FuroVisual, cfg: Pick<ConfigGeometriaMesa, 'segmentosPorVolta'>, retas: number): Ponto2[] {
  const [primeira, segunda] = furo.faces;
  const reta = (de: Ponto2, para: Ponto2): Ponto2[] => Array.from({ length: retas + 1 }, (_, k) => mais(de, sub(para, de), k / (retas + 1)));
  const inicio = anguloEm(furo.centro, primeira.fimDaFace);
  // As duas faces tocam o círculo em pontos opostos: das duas meias voltas, a que passa por `eixo` é a de fora da mesa.
  const passaPorFora = (varredura: number): boolean => {
    const meio = inicio + varredura / 2;
    return Math.cos(meio) * furo.eixo.x + Math.sin(meio) * furo.eixo.z > 0;
  };
  const varredura = passaPorFora(Math.PI) ? Math.PI : -Math.PI;
  const amostras = Math.max(2, Math.ceil(cfg.segmentosPorVolta / 2));
  const arco = pontosDoArco(furo.centro, furo.raio, inicio, varredura, amostras);
  return [...reta(primeira.naBorracha, primeira.fimDaFace), ...arco, ...reta(segunda.fimDaFace, segunda.naBorracha).slice(1), segunda.naBorracha];
}

/** Os seis furos ordenados em volta da mesa (anti-horário). */
const emVoltaDaMesa = (furos: readonly FuroVisual[]): FuroVisual[] => [...furos].sort((a, b) => anguloEm(ORIGEM, a.centro) - anguloEm(ORIGEM, b.centro));

/** Retângulo `±metadeX × ±metadeZ` com os cantos arredondados de raio `raio`, anti-horário em XZ. */
export function retanguloArredondado(metadeX: number, metadeZ: number, raio: number, segmentosPorVolta: number): Ponto2[] {
  const porCanto = Math.max(1, Math.ceil(segmentosPorVolta / 4));
  const cantos: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  return cantos.flatMap(([sx, sz], k) =>
    pontosDoArco({ x: sx * (metadeX - raio), z: sz * (metadeZ - raio) }, raio, (k * Math.PI) / 2, Math.PI / 2, porCanto),
  );
}

/**
 * A moldura de madeira: o retângulo externo de cantos arredondados (`externo`) menos o retângulo nariz + tabela com os
 * entalhes das caçapas (`furo`): em cada boca, as duas paredes retas que continuam as faces das quinas até o círculo de queda e
 * o arco de fora dele.
 */
export function contornoMoldura(mesa: MedidasMesa, cfg: ConfigGeometriaMesa): { readonly externo: Ponto2[]; readonly furo: Ponto2[] } {
  const metadeX = mesa.comprimento / 2 + mesa.larguraTabela + mesa.larguraMoldura;
  const metadeZ = mesa.largura / 2 + mesa.larguraTabela + mesa.larguraMoldura;
  return {
    externo: retanguloArredondado(metadeX, metadeZ, cfg.raioCantoMoldura, cfg.segmentosPorVolta),
    // Entre dois entalhes o contorno segue reto, pela borda do retângulo nariz + tabela (os cantos dele ficam dentro dos entalhes de canto).
    furo: emVoltaDaMesa(furosVisuais(mesa)).flatMap((f) => caminhoDoEntalhe(f, cfg, 0)),
  };
}

/** Pontos por parede reta a mais (além das pontas) no caminho que a caçapa segue para o forro e o lábio. */
const PONTOS_POR_PAREDE = 3;

/**
 * O entalhe de cada caçapa na moldura, do ponto onde uma face deixa a borracha, pela parede reta e pelo arco de fora do
 * círculo, até a outra face: é por onde o forro de couro e o lábio de alumínio passam. Os pontos são os de `furo` da moldura
 * (com paredes retas amostradas a mais para o lábio seguir a curva).
 */
export function entalhesDaMoldura(mesa: MedidasMesa, cfg: ConfigGeometriaMesa): { readonly furo: FuroVisual; readonly caminho: Ponto2[] }[] {
  return emVoltaDaMesa(furosVisuais(mesa)).map((furo) => ({ furo, caminho: caminhoDoEntalhe(furo, cfg, PONTOS_POR_PAREDE) }));
}
