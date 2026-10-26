/**
 * Medidas da mesa, das bolas e do taco: fonte única para física e render.
 *
 * Sistema de coordenadas (metros): origem no centro do pano, Y para cima,
 * X ao longo do comprimento, Z ao longo da largura. É o mesmo do three.js,
 * então o render usa os valores sem conversão.
 */

/** Ponto ou vetor no plano do pano (XZ). */
export interface Ponto2 {
  readonly x: number;
  readonly z: number;
}

export interface MedidasMesa {
  /** Área de jogo de nariz a nariz da tabela, ao longo de X. */
  readonly comprimento: number;
  /** Área de jogo de nariz a nariz da tabela, ao longo de Z. */
  readonly largura: number;
  /** Abertura da boca das caçapas de canto, de quina a quina. */
  readonly bocaCanto: number;
  /** Abertura da boca das caçapas do meio, de quina a quina. */
  readonly bocaMeio: number;
  /**
   * Raio da ponta arredondada da tabela nas bocas de canto, no plano do pano:
   * o nariz faz a curva por ele até a face da quina (`pontasTabela`).
   */
  readonly raioQuinaCanto: number;
  /** Raio da ponta arredondada da tabela nas bocas do meio. */
  readonly raioQuinaMeio: number;
  /**
   * Quanto o centro da bola precisa passar da linha da boca de canto (a reta entre as
   * duas quinas) para cair: a caçapa é funda e a bola só cai bem dentro dela. Cerca de
   * 1 diâmetro de bola. Antes disso a bola está na garganta e fica na mesa se parar.
   */
  readonly fundoCanto: number;
  /** O mesmo para a boca do meio: cerca de ¾ do diâmetro de bola. */
  readonly fundoMeio: number;
  /** Altura do nariz da tabela acima do pano. */
  readonly alturaTabela: number;
  /** Profundidade da borracha da tabela, do nariz até a madeira. */
  readonly larguraTabela: number;
  /** Largura da moldura de madeira em volta das tabelas. */
  readonly larguraMoldura: number;
}

export interface MedidasBola {
  readonly raio: number;
  readonly massa: number;
}

export interface MedidasTaco {
  readonly comprimento: number;
  readonly raioPonta: number;
  readonly raioBase: number;
}

export const MESA_BAR: MedidasMesa = {
  comprimento: 2.1,
  largura: 1.2,
  bocaCanto: 0.085,
  bocaMeio: 0.095,
  raioQuinaCanto: 0.01,
  raioQuinaMeio: 0.0048,
  fundoCanto: 0.054,
  fundoMeio: 0.0405,
  alturaTabela: 0.034,
  larguraTabela: 0.04,
  larguraMoldura: 0.08,
};

export const BOLA: MedidasBola = { raio: 0.027, massa: 0.143 };

export const BOLAO: MedidasBola = { raio: 0.028, massa: 0.16 };

export const TACO: MedidasTaco = { comprimento: 1.45, raioPonta: 0.006, raioBase: 0.015 };

/** O círculo em que a bola cai: o centro dela entrando nele a derruba. */
export interface CirculoDeQueda {
  readonly centro: Ponto2;
  readonly raio: number;
}

/**
 * Uma caçapa: a boca (a reta entre as duas quinas), a garganta que as faces guiam e,
 * no fundo dela, o círculo de queda. A bola só cai quando o centro passa `fundo` da
 * linha da boca; antes disso está na garganta e fica na mesa se parar.
 */
export interface Cacapa {
  readonly id: string;
  /**
   * Centro do círculo tangente à linha da boca, no meio dela: `boca + eixo · raio`. É o círculo
   * que o desenho dos furos (`apps/web`) usa hoje, até o visual passar a seguir `queda`; a bola não cai nele.
   */
  readonly centro: Ponto2;
  /** Meia boca: o raio do círculo acima e o do círculo de queda (inscrito entre as faces). */
  readonly raio: number;
  /** Meio da linha da boca. */
  readonly boca: Ponto2;
  /** Direção da caçapa, para fora da mesa: a diagonal no canto, perpendicular à tabela no meio. Unitário. */
  readonly eixo: Ponto2;
  /** Quanto o centro da bola passa da linha da boca, no eixo, até tocar o círculo de queda (`fundoCanto` ou `fundoMeio`). */
  readonly fundo: number;
  /** Onde a bola cai: centro em `boca + eixo · (fundo + raio)`, o mesmo raio. */
  readonly queda: CirculoDeQueda;
}

/** Linha do nariz de uma tabela, com a normal apontando para dentro da mesa. */
export interface SegmentoTabela {
  readonly inicio: Ponto2;
  readonly fim: Ponto2;
  readonly normal: Ponto2;
}

/**
 * As seis caçapas: quatro de canto e duas no meio dos lados compridos. A bola cai
 * quando o centro entra no círculo de queda (`queda`), o inscrito entre as faces
 * das quinas da sua boca, atrás da linha das quinas: a distância dessa linha ao
 * ponto do círculo mais perto da mesa, no eixo, é `fundoCanto` ou `fundoMeio`.
 * Bola rasante bate na quina, e a que para na garganta antes do círculo fica na mesa.
 */
export function cacapas(mesa: MedidasMesa): Cacapa[] {
  const hx = mesa.comprimento / 2;
  const hz = mesa.largura / 2;
  const raioCanto = mesa.bocaCanto / 2;
  const raioMeio = mesa.bocaMeio / 2;
  // A boca do canto fica a meia boca do canto da mesa, na diagonal.
  const bocaX = hx - raioCanto * Math.SQRT1_2;
  const bocaZ = hz - raioCanto * Math.SQRT1_2;
  const canto = (id: string, sx: number, sz: number): Cacapa =>
    cacapa(id, { x: sx * bocaX, z: sz * bocaZ }, { x: sx * Math.SQRT1_2, z: sz * Math.SQRT1_2 }, raioCanto, mesa.fundoCanto);
  const meio = (id: string, sz: number): Cacapa => cacapa(id, { x: 0, z: sz * hz }, { x: 0, z: sz }, raioMeio, mesa.fundoMeio);
  return [
    canto('canto-x-z-', -1, -1),
    canto('canto-x+z-', 1, -1),
    canto('canto-x-z+', -1, 1),
    canto('canto-x+z+', 1, 1),
    meio('meio-z-', -1),
    meio('meio-z+', 1),
  ];
}

function cacapa(id: string, boca: Ponto2, eixo: Ponto2, raio: number, fundo: number): Cacapa {
  const naBoca = (recuo: number): Ponto2 => ({ x: boca.x + eixo.x * recuo, z: boca.z + eixo.z * recuo });
  return { id, centro: naBoca(raio), raio, boca, eixo, fundo, queda: { centro: naBoca(fundo + raio), raio } };
}

/**
 * As seis tabelas: duas em cada lado comprido (cortadas pela caçapa do meio)
 * e uma em cada cabeceira. Nos cantos a boca fica a 45°, então cada tabela
 * termina a `bocaCanto / √2` do canto. Os extremos são as quinas, onde o nariz
 * encontraria a face da quina; o nariz de verdade faz a curva um pouco antes
 * (`pontasTabela`).
 */
export function tabelas(mesa: MedidasMesa): SegmentoTabela[] {
  const hx = mesa.comprimento / 2;
  const hz = mesa.largura / 2;
  const dc = mesa.bocaCanto / Math.SQRT2;
  const dm = mesa.bocaMeio / 2;
  return [
    { inicio: { x: -hx + dc, z: -hz }, fim: { x: -dm, z: -hz }, normal: { x: 0, z: 1 } },
    { inicio: { x: dm, z: -hz }, fim: { x: hx - dc, z: -hz }, normal: { x: 0, z: 1 } },
    { inicio: { x: -hx + dc, z: hz }, fim: { x: -dm, z: hz }, normal: { x: 0, z: -1 } },
    { inicio: { x: dm, z: hz }, fim: { x: hx - dc, z: hz }, normal: { x: 0, z: -1 } },
    { inicio: { x: -hx, z: -hz + dc }, fim: { x: -hx, z: hz - dc }, normal: { x: 1, z: 0 } },
    { inicio: { x: hx, z: -hz + dc }, fim: { x: hx, z: hz - dc }, normal: { x: -1, z: 0 } },
  ];
}

/**
 * Uma ponta de tabela numa boca de caçapa. O nariz reto termina em `noNariz`,
 * faz a curva num arco de `raio` em volta de `centro` e vira a face da quina,
 * que entra na caçapa de `naFace` até `fimDaFace`: a 45° no canto (paralela à
 * diagonal), perpendicular ao nariz no meio. As duas faces de uma boca são
 * paralelas, a uma boca de distância, e vão até o círculo de queda (`fundo` + um
 * raio da linha das quinas), onde o tocam: a garganta guia a bola até a linha de queda.
 */
export interface PontaTabela {
  /** Índice em `tabelas()`. */
  readonly tabela: number;
  /** Id em `cacapas()`. */
  readonly cacapa: string;
  /** Onde o nariz e a face se encontrariam sem o arredondado (extremo de `tabelas()`). */
  readonly quina: Ponto2;
  readonly centro: Ponto2;
  readonly raio: number;
  /** Onde o arco encontra o nariz. */
  readonly noNariz: Ponto2;
  /** Onde o arco encontra a face. */
  readonly naFace: Ponto2;
  readonly fimDaFace: Ponto2;
  /** Normal unitária da face, apontando para dentro da boca. */
  readonly normalFace: Ponto2;
}

/** As doze pontas, na ordem de `tabelas()`: início e fim de cada tabela. */
export function pontasTabela(mesa: MedidasMesa): PontaTabela[] {
  const bocas = cacapas(mesa);
  return tabelas(mesa).flatMap((t, tabela) => {
    const ex = t.fim.x - t.inicio.x;
    const ez = t.fim.z - t.inicio.z;
    const n = Math.hypot(ex, ez);
    return [
      ponta(mesa, bocas, tabela, t.inicio, { x: ex / n, z: ez / n }),
      ponta(mesa, bocas, tabela, t.fim, { x: -ex / n, z: -ez / n }),
    ];
  });
}

/** A ponta na `quina`, com o nariz seguindo `paraDentro` (unitário, para longe da boca). */
function ponta(mesa: MedidasMesa, bocas: readonly Cacapa[], tabela: number, quina: Ponto2, paraDentro: Ponto2): PontaTabela {
  const boca = bocas.reduce((a, b) => (Math.hypot(b.boca.x - quina.x, b.boca.z - quina.z) < Math.hypot(a.boca.x - quina.x, a.boca.z - quina.z) ? b : a));
  const canto = boca.id.startsWith('canto');
  const eixo = boca.eixo;
  const raio = canto ? mesa.raioQuinaCanto : mesa.raioQuinaMeio;
  const meioAngulo = Math.acos(paraDentro.x * eixo.x + paraDentro.z * eixo.z) / 2;
  const tangente = raio / Math.tan(meioAngulo);
  const bx = paraDentro.x + eixo.x;
  const bz = paraDentro.z + eixo.z;
  const nb = Math.hypot(bx, bz);
  const ate = raio / Math.sin(meioAngulo);
  // Perpendicular ao eixo, do lado contrário ao nariz: para dentro da boca.
  const lado = -eixo.z * paraDentro.x + eixo.x * paraDentro.z > 0 ? -1 : 1;
  // A face vai da quina até o ponto de tangência com o círculo de queda: `fundo` + meia boca para dentro da garganta.
  const profundidade = boca.fundo + boca.raio;
  return {
    tabela,
    cacapa: boca.id,
    quina,
    centro: { x: quina.x + (bx / nb) * ate, z: quina.z + (bz / nb) * ate },
    raio,
    noNariz: { x: quina.x + paraDentro.x * tangente, z: quina.z + paraDentro.z * tangente },
    naFace: { x: quina.x + eixo.x * tangente, z: quina.z + eixo.z * tangente },
    fimDaFace: { x: quina.x + eixo.x * profundidade, z: quina.z + eixo.z * profundidade },
    normalFace: { x: -lado * eixo.z, z: lado * eixo.x },
  };
}

/** Onde o bolão começa: no eixo da mesa, a um quarto do comprimento da cabeceira. */
export function pontoDeSaida(mesa: MedidasMesa): Ponto2 {
  return { x: -mesa.comprimento / 4, z: 0 };
}

/**
 * Distância horizontal do centro da bola ao nariz da tabela quando encostam.
 * O nariz fica a `alturaTabela` do pano, acima do centro: `sen θ = h/R − 1` e
 * a distância é `R·cos θ`, um pouco menor que o raio.
 */
export function distanciaContatoTabela(raio: number, mesa: MedidasMesa): number {
  const senTheta = Math.min(1, Math.max(-1, mesa.alturaTabela / raio - 1));
  return raio * Math.sqrt(1 - senTheta * senTheta);
}
