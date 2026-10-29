import type { ImagemRGBA, TamanhoDaImagem } from './imagens-do-taco';
import { misturar, type VariacaoDaSemente } from './variacao-da-semente';

/**
 * As ferramentas das tramas geradas (L35, e as do L36 em `acabamentos-do-taco.ts`): o contexto de uma imagem, a rampa de cores, o ruído
 * de valor que dá a volta e as contas de coordenada (volta `a` e distância `b`, em perímetros). Puro, sem DOM nem three.
 */

/** O quanto a imagem desenha: `simples` (o nível baixo) usa menos oitavas de ruído e dispensa o relevo. */
export type DetalheDaTrama = 'cheio' | 'simples';

export interface ContextoDaTrama {
  readonly tamanho: TamanhoDaImagem;
  /** Comprimento da peça ÷ perímetro dela. */
  readonly proporcao: number;
  /** Onde a peça começa e termina no taco inteiro (0 = ponta, 1 = cabo): o degradê é contínuo de uma peça à outra. */
  readonly noTaco: { readonly de: number; readonly ate: number };
  readonly variacao: VariacaoDaSemente;
  readonly detalhe: DetalheDaTrama;
}

/** O que uma trama gera: a cor, o que acende (`null` = nada) e o relevo em mapa de normais (`null` = liso). */
export interface ImagemGerada {
  readonly cor: ImagemRGBA;
  readonly emissiva: ImagemRGBA | null;
  readonly relevo: ImagemRGBA | null;
}

export type Cor = readonly [number, number, number];

export const rgb = (cor: number): Cor => [(cor >> 16) & 255, (cor >> 8) & 255, cor & 255];
export const mistura = (a: Cor, b: Cor, t: number): Cor => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const escurece = (c: Cor, k: number): Cor => [c[0] * k, c[1] * k, c[2] * k];
export const limitar = (x: number, de = 0, ate = 1): number => Math.min(Math.max(x, de), ate);
export const suave = (de: number, ate: number, x: number): number => {
  const t = limitar((x - de) / (ate - de));
  return t * t * (3 - 2 * t);
};
export const frac = (x: number): number => x - Math.floor(x);
export const modulo = (i: number, n: number): number => ((i % n) + n) % n;

export function nova(t: TamanhoDaImagem): ImagemRGBA {
  const dados = new Uint8ClampedArray(t.largura * t.altura * 4);
  for (let i = 3; i < dados.length; i += 4) dados[i] = 255;
  return { largura: t.largura, altura: t.altura, dados };
}

export function poe(img: ImagemRGBA, x: number, y: number, c: Cor): void {
  const i = (y * img.largura + x) * 4;
  img.dados[i] = c[0];
  img.dados[i + 1] = c[1];
  img.dados[i + 2] = c[2];
}

/** Ruído de valor suave que dá a volta: `n` células em volta, do mesmo tamanho ao longo (b, em perímetros). De 0 a 1. */
export function ruidoDeValor(semente: number, n: number): (a: number, b: number) => number {
  const valor = (i: number, j: number): number => misturar(modulo(i, n), j, semente);
  return (a, b) => {
    const x = a * n;
    const y = b * n;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const tx = suave(0, 1, x - i);
    const ty = suave(0, 1, y - j);
    const topo = valor(i, j) * (1 - tx) + valor(i + 1, j) * tx;
    const base = valor(i, j + 1) * (1 - tx) + valor(i + 1, j + 1) * tx;
    return topo * (1 - ty) + base * ty;
  };
}

/** Ruído fractal (somas de ruídos de valor, cada oitava com o dobro de células): de 0 a 1, em torno de 0,5. */
export function fractal(semente: number, celulas: number, oitavas: number): (a: number, b: number) => number {
  const camadas = Array.from({ length: oitavas }, (_, k) => ruidoDeValor(semente * 31 + k * 977, celulas * 2 ** k));
  let total = 0;
  for (let k = 0; k < oitavas; k++) total += 0.5 ** k;
  return (a, b) => {
    let soma = 0;
    for (let k = 0; k < oitavas; k++) soma += camadas[k]!(a, b) * 0.5 ** k;
    return soma / total;
  };
}

/** A rampa de cores: `t` (0 a 1) percorre as `cores` em partes iguais, suavizado entre uma e outra. */
export function rampa(cores: readonly Cor[], t: number): Cor {
  if (cores.length === 1) return cores[0]!;
  const x = limitar(t) * (cores.length - 1);
  const i = Math.min(Math.floor(x), cores.length - 2);
  return mistura(cores[i]!, cores[i + 1]!, suave(0, 1, x - i));
}

/** O relevo de um campo de inclinações (nx, ny por pixel) em mapa de normais (RGBA, espaço da tangente). */
export function normaisDeInclinacao(img: ImagemRGBA, x: number, y: number, nx: number, ny: number): void {
  const norma = Math.hypot(nx, ny, 1);
  poe(img, x, y, [((nx / norma) * 0.5 + 0.5) * 255, ((ny / norma) * 0.5 + 0.5) * 255, ((1 / norma) * 0.5 + 0.5) * 255]);
}

/** Quantas voltas inteiras o padrão faz: `base` vezes a escala da semente, no mínimo `minimo`. */
export const voltas = (base: number, escala: number, minimo = 1): number => Math.max(Math.round(base * escala), minimo);

/** As coordenadas do pixel já com a semente: volta (`a`, com o rolo e a hélice do giro) e distância ao longo (`b`, com o deslocamento). */
export interface Ponto {
  readonly a: number;
  readonly b: number;
}

export function ponto(x: number, y: number, c: ContextoDaTrama, periodo: number): Ponto {
  const { largura, altura } = c.tamanho;
  const bruto = (altura > 1 ? y / (altura - 1) : 0) * c.proporcao;
  const b = bruto + c.variacao.deslocamento * periodo;
  return { a: x / largura + c.variacao.rolo + c.variacao.giro * bruto, b };
}
