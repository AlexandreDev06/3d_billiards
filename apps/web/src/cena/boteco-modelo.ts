import type { NivelDeQualidade } from '../config';

/** Os três níveis do `.glb` do boteco (`boteco-<nivel>.glb`); a qualidade do jogo é `alta`/`media`/`baixa`. */
export type NivelDoBoteco = 'alto' | 'medio' | 'baixo';

export const NIVEL_DO_BOTECO: Readonly<Record<NivelDeQualidade, NivelDoBoteco>> = { alta: 'alto', media: 'medio', baixa: 'baixo' };

/** O `.glb` que casa com o nível de qualidade (`pasta` com a barra no fim, a partir da raiz do site). */
export function arquivoDoBoteco(pasta: string, qualidade: NivelDeQualidade): string {
  return `${pasta}boteco-${NIVEL_DO_BOTECO[qualidade]}.glb`;
}

/** O que o artista põe nos `extras` de um marcador `luz-*` (o `GLTFLoader` os deixa em `userData`). */
export interface ExtrasDeLuz {
  readonly tipo?: unknown;
  readonly cor?: unknown;
  readonly intensidade?: unknown;
  readonly alcance?: unknown;
}

/** Uma luz de ponto do boteco, pronta para virar `PointLight`: intensidade em candela, alcance em metros. */
export interface LuzDePonto {
  readonly nome: string;
  readonly posicao: readonly [number, number, number];
  readonly cor: number;
  readonly intensidade: number;
  readonly alcance: number;
}

/** `#rrggbb` → número; `null` se não for isso. */
export function corDoMarcador(texto: unknown): number | null {
  if (typeof texto !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(texto)) return null;
  return Number.parseInt(texto.slice(1), 16);
}

/**
 * O marcador `luz-*` como luz de ponto. `fator`: quantas candelas vale a intensidade relativa 1 do artista (o visor dele usa 8).
 * `null` para o que não é de ponto (a `luz-luminaria` é retangular: é a luminária do `ambiente.ts`) ou vem com dado estragado.
 */
export function luzDePonto(nome: string, posicao: readonly [number, number, number], extras: ExtrasDeLuz | undefined, fator: number): LuzDePonto | null {
  if (extras === undefined || extras.tipo !== 'ponto') return null;
  const cor = corDoMarcador(extras.cor);
  const relativa = extras.intensidade;
  const alcance = extras.alcance;
  if (cor === null || typeof relativa !== 'number' || !(relativa > 0) || typeof alcance !== 'number' || !(alcance > 0)) return null;
  return { nome, posicao, cor, intensidade: relativa * fator, alcance };
}

/** O forro e as vigas só aparecem com a câmera abaixo deles; acima (a vista de cima) eles tapariam a mesa. */
export function tetoVisivel(alturaDaCamera: number, somemAcimaDe: number): boolean {
  return alturaDaCamera < somemAcimaDe;
}
