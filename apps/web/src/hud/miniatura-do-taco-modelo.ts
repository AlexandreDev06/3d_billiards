import type { MedidasTaco } from '@sinuca/fisica';
import type { AparenciaTaco, Superficie, Trama } from '../cena/aparencia-do-taco';
import { PARTES_COM_IMAGEM, TAMANHO_DAS_IMAGENS, contextoDaPeca, corDaPeca, type ParteDeImagem } from '../cena/imagem-da-peca';
import type { ImagemRGBA } from '../cena/imagens-do-taco';
import { partesDoTaco, type NomeDaParte } from '../cena/perfil-do-taco';

/** 0xRRGGBB → `#rrggbb`. */
export const corCss = (cor: number): string => `#${cor.toString(16).padStart(6, '0')}`;

/** Mistura duas cores `#rrggbb`: `t` 0 = a primeira, 1 = a segunda (fora disso é limitado). */
export function misturarCores(a: string, b: string, t: number): string {
  const peso = Math.min(Math.max(t, 0), 1);
  const canal = (cor: string, i: number): number => parseInt(cor.slice(1 + 2 * i, 3 + 2 * i), 16);
  const misto = [0, 1, 2].map((i) => Math.round(canal(a, i) + (canal(b, i) - canal(a, i)) * peso));
  return `#${misto.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Uma das nove peças do taco no desenho plano: de `de` a `ate` do comprimento (0 = ponta, 1 = cabo), com o raio em fração do maior. */
export interface PecaDaMiniatura {
  readonly nome: NomeDaParte;
  readonly de: number;
  readonly ate: number;
  readonly raioDe: number;
  readonly raioAte: number;
  readonly cor: string;
  readonly metal: boolean;
  readonly trama: Trama;
  /** A cor com que a peça acende (neon); `null` = não acende. */
  readonly brilho: string | null;
}

/** O que se pinta por cima das peças, sempre em frações do comprimento do taco. */
export type DetalheDaMiniatura =
  | { readonly tipo: 'faixa'; readonly de: number; readonly ate: number; readonly cor: string; readonly brilho: boolean }
  | { readonly tipo: 'bicos'; readonly de: number; readonly ate: number; readonly cor: string; readonly quantidade: number }
  | { readonly tipo: 'chamas'; readonly de: number; readonly ate: number; readonly cores: readonly [string, string] }
  | { readonly tipo: 'linhas'; readonly de: number; readonly ate: number; readonly cores: readonly [string, string] };

export interface MiniaturaDoTaco {
  readonly pecas: readonly PecaDaMiniatura[];
  readonly detalhes: readonly DetalheDaMiniatura[];
  /** O brilho que vaza do taco aceso (neon); `null` nas outras. */
  readonly halo: { readonly cores: readonly [string, string]; readonly intensidade: number } | null;
}

/**
 * O plano do desenho 2D de uma skin (a miniatura da loja): as peças com o perfil do taco de verdade e os detalhes da
 * aparência, em frações do comprimento. Sem canvas nem three: quem pinta é `miniatura-do-taco.ts`.
 */
export function miniaturaDoTaco(aparencia: AparenciaTaco, medidas: MedidasTaco): MiniaturaDoTaco {
  const L = medidas.comprimento;
  const partes = partesDoTaco(medidas);
  const raioMaximo = Math.max(...partes.flatMap((p) => [p.raio(p.de), p.raio(p.ate)]));
  const superficieDe = (nome: NomeDaParte): { cor: number; metal: boolean; trama: Trama; brilho: number | null } => {
    const lisa = (s: Superficie) => ({ cor: s.cor, metal: s.metal > 0.5, trama: 'lisa' as Trama, brilho: s.emissivo?.cor ?? null });
    const madeira = (s: Superficie & { trama: Trama }) => ({ ...lisa(s), trama: s.trama });
    switch (nome) {
      case 'sola':
        return { cor: aparencia.ponta.giz, metal: false, trama: 'lisa', brilho: null };
      case 'virola':
        return lisa(aparencia.virola);
      case 'haste':
        return madeira(aparencia.haste);
      case 'junta':
        return lisa(aparencia.junta);
      case 'antebraco':
        return madeira(aparencia.antebraco.base);
      case 'punho':
        return { cor: aparencia.punho.cor, metal: false, trama: 'lisa', brilho: null };
      case 'anel':
        return lisa(aparencia.anel);
      case 'base':
        return madeira(aparencia.base);
      case 'borracha':
        return lisa(aparencia.borracha);
    }
  };

  const pecas = partes.map((p): PecaDaMiniatura => {
    const s = superficieDe(p.nome);
    return {
      nome: p.nome,
      de: p.de / L,
      ate: p.ate / L,
      raioDe: p.raio(p.de) / raioMaximo,
      raioAte: p.raio(p.ate) / raioMaximo,
      cor: corCss(s.cor),
      metal: s.metal,
      trama: s.trama,
      brilho: s.brilho === null ? null : corCss(s.brilho),
    };
  });
  const da = (nome: NomeDaParte): PecaDaMiniatura => pecas.find((p) => p.nome === nome)!;
  /** Posição `u` (0 a 1) dentro da peça, em fração do comprimento do taco. */
  const naPeca = (nome: NomeDaParte, u: number): number => da(nome).de + u * (da(nome).ate - da(nome).de);

  const detalhes: DetalheDaMiniatura[] = [];
  const faixasDe = (nome: 'haste' | 'base', faixas: AparenciaTaco['haste']['faixas']): void => {
    for (const f of faixas ?? []) detalhes.push({ tipo: 'faixa', de: naPeca(nome, f.de), ate: naPeca(nome, f.ate), cor: corCss(f.cor), brilho: f.brilho === true });
  };
  faixasDe('haste', aparencia.haste.faixas);
  const haste = da('haste');
  if (aparencia.haste.trama === 'neon' && aparencia.haste.linhas) {
    detalhes.push({ tipo: 'linhas', de: haste.de, ate: haste.ate, cores: [corCss(aparencia.haste.linhas[0]), corCss(aparencia.haste.linhas[1])] });
  }
  if (aparencia.haste.trama === 'chamas' && aparencia.haste.chamas) {
    detalhes.push({ tipo: 'chamas', de: haste.de, ate: haste.ate, cores: [corCss(aparencia.haste.chamas[0]), corCss(aparencia.haste.chamas[1])] });
  }
  const antebraco = da('antebraco');
  const desenho = aparencia.antebraco.desenho;
  if (desenho.tipo === 'bicos') detalhes.push({ tipo: 'bicos', de: antebraco.de, ate: antebraco.ate, cor: corCss(desenho.cor), quantidade: desenho.quantidade });
  else if (desenho.tipo === 'chamas') detalhes.push({ tipo: 'chamas', de: antebraco.de, ate: antebraco.ate, cores: [corCss(desenho.cores[0]), corCss(desenho.cores[1])] });
  else if (desenho.tipo === 'linhas') detalhes.push({ tipo: 'linhas', de: antebraco.de, ate: antebraco.ate, cores: [corCss(desenho.cores[0]), corCss(desenho.cores[1])] });
  if (aparencia.punho.faixa !== undefined) detalhes.push({ tipo: 'faixa', de: naPeca('punho', 0.4), ate: naPeca('punho', 0.6), cor: corCss(aparencia.punho.faixa), brilho: false });
  faixasDe('base', aparencia.base.faixas);

  const halo = aparencia.halo ? { cores: [corCss(aparencia.halo.cores[0]), corCss(aparencia.halo.cores[1])] as const, intensidade: aparencia.halo.intensidade } : null;
  return { pecas, detalhes, halo };
}

// ---------------------------------------------------------------- as imagens das peças na miniatura (L35)

/** A imagem de cor de cada peça que a tem, na orientação da malha: x = em volta (u), linha 0 = a ponta da peça (v = 0). */
export type ImagensDaMiniatura = Partial<Record<ParteDeImagem, ImagemRGBA>>;

/** A escala das imagens da miniatura em relação às do taco (a miniatura é pequena: metade do lado basta). */
const ESCALA_DAS_IMAGENS = 0.5;

const ladoDaImagem = (base: number): number => Math.max(Math.round((base * ESCALA_DAS_IMAGENS) / 16) * 16, 32);

/**
 * As imagens que o taco desenharia em cada peça (a mesma conta de `cena/imagem-da-peca.ts`, com a semente da aparência), em metade
 * do tamanho. Peça lisa não entra: a miniatura a pinta com a cor dela.
 */
export function imagensDaMiniatura(aparencia: AparenciaTaco, medidas: MedidasTaco): ImagensDaMiniatura {
  const saida: ImagensDaMiniatura = {};
  for (const parte of PARTES_COM_IMAGEM) {
    const base = TAMANHO_DAS_IMAGENS[parte];
    const ctx = contextoDaPeca(aparencia, medidas, parte, { largura: ladoDaImagem(base.largura), altura: ladoDaImagem(base.altura) }, 'cheio');
    const cor = corDaPeca(ctx, parte);
    if (cor !== null) saida[parte] = cor;
  }
  return saida;
}

/** Os PNGs que a skin pinta (o da variante rara, se a semente deu uma rara) e a peça de cada um. */
export function arquivosPintados(aparencia: AparenciaTaco): readonly { readonly parte: ParteDeImagem; readonly arquivo: string }[] {
  const por: Record<ParteDeImagem, AparenciaTaco['haste']['imagem']> = { haste: aparencia.haste.imagem, antebraco: aparencia.antebraco.base.imagem, punho: aparencia.punho.imagem, base: aparencia.base.imagem };
  const lista: { parte: ParteDeImagem; arquivo: string }[] = [];
  for (const parte of PARTES_COM_IMAGEM) {
    const imagem = por[parte];
    if (imagem) lista.push({ parte, arquivo: aparencia.padrao?.rara === true && imagem.rara ? imagem.rara.cor : imagem.cor });
  }
  return lista;
}

const frac = (v: number): number => v - Math.floor(v);

/**
 * Leva um PNG do Pincel (a linha de baixo é a ponta, o x corre ao contrário do UV da malha) à orientação da malha, com o rolo da
 * semente: a mesma regra do `taco.ts` (`repeat.x = −1`, `offset.x = 1 + rolo`), em pixels. A imagem chega do tamanho que a miniatura quer.
 */
export function pintadaNaMalha(png: ImagemRGBA, rolo: number): ImagemRGBA {
  const { largura: w, altura: h } = png;
  const dados = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const linhaDoPng = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const xDoPng = Math.min(Math.floor(frac(1 - (x + 0.5) / w + rolo) * w), w - 1);
      const de = (linhaDoPng * w + xDoPng) * 4;
      const para = (y * w + x) * 4;
      dados[para] = png.dados[de]!;
      dados[para + 1] = png.dados[de + 1]!;
      dados[para + 2] = png.dados[de + 2]!;
      dados[para + 3] = 255;
    }
  }
  return { largura: w, altura: h, dados };
}

/**
 * A peça vista de lado, em orto: a imagem desenrolada (x = em volta, linha 0 = ponta) vira uma faixa de `largura` (ao longo da peça,
 * da ponta para o cabo) por `altura` (de cima para baixo). A altura é o diâmetro: o ponto a `s` do meio (−1 em cima, 1 embaixo) está
 * no ângulo `centro + asin(s) / 2π` da volta, em que `centro` (0 a 1 da volta) é o que fica virado para quem olha; o alto do taco é
 * o 0 da volta, então `centro` = 0,25 mostra o lado de cima para cima.
 */
export function vistaLateralDaImagem(origem: ImagemRGBA, largura: number, altura: number, centro = 0.25): ImagemRGBA {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  const { largura: w, altura: h } = origem;
  for (let oy = 0; oy < altura; oy++) {
    const s = ((oy + 0.5) / altura) * 2 - 1;
    const x = frac(centro + Math.asin(s) / (2 * Math.PI)) * w - 0.5;
    const x0 = Math.floor(x);
    const fx = x - x0;
    const xa = ((x0 % w) + w) % w;
    const xb = (xa + 1) % w;
    for (let ox = 0; ox < largura; ox++) {
      const y = Math.min(Math.max(((ox + 0.5) / largura) * h - 0.5, 0), h - 1);
      const y0 = Math.floor(y);
      const y1 = Math.min(y0 + 1, h - 1);
      const fy = y - y0;
      const para = (oy * largura + ox) * 4;
      for (let c = 0; c < 3; c++) {
        const a = origem.dados[(y0 * w + xa) * 4 + c]! * (1 - fx) + origem.dados[(y0 * w + xb) * 4 + c]! * fx;
        const b = origem.dados[(y1 * w + xa) * 4 + c]! * (1 - fx) + origem.dados[(y1 * w + xb) * 4 + c]! * fx;
        dados[para + c] = a * (1 - fy) + b * fy;
      }
      dados[para + 3] = 255;
    }
  }
  return { largura, altura, dados };
}
