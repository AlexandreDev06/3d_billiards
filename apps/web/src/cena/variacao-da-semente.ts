/**
 * O que a semente do taco (0 a 999, sorteada pela sala na compra) muda no desenho: onde o padrão começa, o quanto ele gira e
 * cresce e um leve tom. Puro e determinístico (a mesma semente dá o mesmo taco em qualquer aparelho, sem `Math.random`): só
 * inteiros e uma mistura de bits, sem relógio nem sorteio do navegador.
 */
export interface VariacaoDaSemente {
  /** A semente de que sai (`null` = taco sem semente, a aparência de fábrica). */
  readonly semente: number | null;
  /** Gira a arte em volta da peça, de 0 a 1 da volta (o `offset.x` das imagens pintadas). */
  readonly rolo: number;
  /** Desloca o padrão ao longo da peça, de 0 a 1 de um período. */
  readonly deslocamento: number;
  /** Inclinação do padrão em volta da peça (rad): o desenho vira uma hélice suave. De −0,3 a 0,3. */
  readonly giro: number;
  /** Quanto o padrão cresce (1 = o de fábrica): de 0,8 a 1,25. */
  readonly escala: number;
  /** O leve tom: giro de matiz (graus, ±10) e fator de claridade (0,95 a 1,05). */
  readonly tom: { readonly matiz: number; readonly claridade: number };
}

/** O taco de fábrica: nada se mexe. */
export const SEM_VARIACAO: VariacaoDaSemente = { semente: null, rolo: 0, deslocamento: 0, giro: 0, escala: 1, tom: { matiz: 0, claridade: 1 } };

/** Mistura de bits de 32 em 0 a 1 (determinística). */
export function misturar(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** A variação de uma semente; sem semente (ou fora de 0 a 999), a de fábrica. */
export function variacaoDaSemente(semente: number | null | undefined): VariacaoDaSemente {
  if (semente === null || semente === undefined || !Number.isInteger(semente) || semente < 0 || semente > 999) return SEM_VARIACAO;
  const r = (k: number): number => misturar(semente, k, 7919);
  return {
    semente,
    rolo: r(1),
    deslocamento: r(2),
    giro: (r(3) * 2 - 1) * 0.3,
    escala: 0.8 * 1.25 ** (r(4) * 2),
    tom: { matiz: (r(5) * 2 - 1) * 10, claridade: 0.95 + r(6) * 0.1 },
  };
}

type Canais = readonly [number, number, number];

const canais = (cor: number): Canais => [(cor >> 16) & 255, (cor >> 8) & 255, cor & 255];
const pack = ([r, g, b]: Canais): number => (Math.round(Math.min(Math.max(r, 0), 255)) << 16) | (Math.round(Math.min(Math.max(g, 0), 255)) << 8) | Math.round(Math.min(Math.max(b, 0), 255));

/**
 * Aplica o leve tom da variação a uma cor 0xRRGGBB: gira o matiz (rotação no espaço RGB em volta do cinza) e multiplica a claridade.
 * Cinzas e pretos quase não mudam: só o que tem cor leva o tom.
 */
export function aplicarTom(cor: number, tom: VariacaoDaSemente['tom']): number {
  if (tom.matiz === 0 && tom.claridade === 1) return cor;
  const [r, g, b] = canais(cor);
  const a = (tom.matiz * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Rotação de matiz de Rec. 601 (matriz clássica de filtro de cor).
  const m = [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ] as const;
  const k = tom.claridade;
  return pack([(m[0] * r + m[1] * g + m[2] * b) * k, (m[3] * r + m[4] * g + m[5] * b) * k, (m[6] * r + m[7] * g + m[8] * b) * k]);
}
