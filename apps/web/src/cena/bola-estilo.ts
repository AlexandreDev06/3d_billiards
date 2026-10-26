import type { IdBola } from '@sinuca/fisica';
import { bolaDeCastigo, bolasDaCasa, type ConfigRegras } from '@sinuca/regras';

/** O que as regras da casa precisam dizer sobre as bolas: quais entram, quais são de grupo e qual é a final. */
export type CasaDasBolas = Pick<ConfigRegras, 'bolas' | 'bolaFinal'>;

/** Lisa (cor cheia) ou listrada (faixa na cor sobre o marfim). */
export type EstiloDaBola = 'lisa' | 'listrada';

/** A bolinha de uma bola no HUD: o número e como ela se desenha na casa. */
export interface FichaDaBola {
  readonly id: IdBola;
  readonly estilo: EstiloDaBola;
}

export const MARFIM = '#f4f1e8';

// Duas paletas, uma por estilo, sem verde (confunde com o pano) e testadas contra o pano, o marfim, a 8 preta e o
// daltonismo comum (ver `bola-estilo.test.ts`). Cada bola de um grupo tem cor própria; a mesma cor pode aparecer uma vez
// em cada grupo, porque a faixa já distingue. Seguem a regra de estilo da casa (ímpar listrada, par lisa), pelo número.
/** Lisas (pares): 2, 4, 6, 10, 12, 14, na ordem: azul, vermelho, amarelo, roxo, laranja, rosa. A 8 é preta. */
const LISAS = ['#2f7de8', '#b3202a', '#f5c400', '#5b2a86', '#f58220', '#ff7eb6'] as const;
/** Listradas (ímpares): 3, 5, 7, 9, 11, 13, 15: vermelho, azul, laranja, roxo, celeste, magenta, vinho. */
const LISTRADAS = ['#b3202a', '#2f7de8', '#f58220', '#5b2a86', '#4fc3f7', '#d02f8f', '#7a1f2b'] as const;
const PRETA = '#121212';
/** A 1 lisa (só na casa antiga, em que ela é o castigo): a sétima cor lisa, a única que as outras seis não usam. A 15 (listrada) repete o vinho: uma vez por estilo. */
const VINHO = '#7a1f2b';
/** A 1 listrada (o mata-mata tem as 15 bolas, e as 8 ímpares listradas precisam de cor própria): um salmão, que o vinho da 15 e o vermelho da 3 não alcançam. */
const SALMAO = '#fa8072';

/**
 * Como a bola se desenha na casa: as ímpares são listradas e as pares lisas, em qualquer modalidade (no par ou ímpar são as
 * do grupo; no mata-mata, que não tem grupos, a mesma convenção, para ninguém estranhar). A bola final (a 8 preta no
 * Boteco, a 1 na casa antiga) e as que a casa não usa ficam lisas: o desenho acompanha a regra, não o número.
 */
export function estiloDaBola(numero: IdBola, casa: CasaDasBolas): EstiloDaBola {
  const daCasa = bolasDaCasa(casa).includes(numero) && numero !== bolaDeCastigo(casa);
  return daCasa && numero % 2 === 1 ? 'listrada' : 'lisa';
}

export const fichaDaBola = (id: IdBola, casa: CasaDasBolas): FichaDaBola => ({ id, estilo: estiloDaBola(id, casa) });

export function corDaBola(numero: number): string {
  return corNoEstilo(numero, 'lisa');
}

/**
 * A cor da bola no estilo em que ela se desenha. É a mesma em qualquer estilo, menos a 1: lisa (só na casa antiga) é vinho
 * e listrada (mata-mata) é salmão, para ela não repetir a 15 listrada.
 */
export function corNoEstilo(numero: number, estilo: EstiloDaBola): string {
  if (!Number.isInteger(numero) || numero < 1 || numero > 15) throw new RangeError(`bola numerada inválida: ${numero}`);
  if (numero === 8) return PRETA;
  if (numero === 1) return estilo === 'listrada' ? SALMAO : VINHO;
  if (numero % 2 === 1) return LISTRADAS[(numero - 3) / 2]!;
  return LISAS[numero < 8 ? numero / 2 - 1 : numero / 2 - 2]!;
}

/** Cores do corpo e da faixa (`null` na lisa) para desenhar a bola. */
export function planoDeCor(numero: number, estilo: EstiloDaBola): { readonly fundo: string; readonly faixa: string | null } {
  const cor = corNoEstilo(numero, estilo);
  return estilo === 'listrada' ? { fundo: MARFIM, faixa: cor } : { fundo: cor, faixa: null };
}

/** O `background` CSS da ficha: a mesma faixa central (25% a 75%) da textura da bola. */
export function fundoCssDaFicha(numero: number, estilo: EstiloDaBola): string {
  const { fundo, faixa } = planoDeCor(numero, estilo);
  return faixa === null ? fundo : `linear-gradient(to bottom, ${fundo} 0 25%, ${faixa} 25% 75%, ${fundo} 75% 100%)`;
}
