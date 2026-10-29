import type { MedidasTaco } from '@sinuca/fisica';
import type { AparenciaTaco, PecaDeMadeira } from './aparencia-do-taco';
import { imagemDeCarbono, imagemDeMadeira, imagemDeNeon, imagemDoAntebraco, imagemDoPunho, imagemLisa, pintarChamas, pintarFaixas, type ImagemRGBA, type TamanhoDaImagem } from './imagens-do-taco';
import { partesDoTaco, type NomeDaParte } from './perfil-do-taco';
import { imagemDaTrama, type DetalheDaTrama } from './tramas-do-taco';

/**
 * As imagens de cada peça do taco, juntando as tramas antigas (`imagens-do-taco.ts`) e as geradas do L35 (`tramas-do-taco.ts`), as
 * faixas por cima, o brilho das faixas que acendem. Puro (pixels): `taco.ts` as transforma em texturas e
 * a miniatura da loja as pinta no canvas, as duas com a mesma conta.
 */

/** O que uma peça pede para desenhar. */
export interface ContextoDaPeca {
  readonly aparencia: AparenciaTaco;
  readonly tamanho: TamanhoDaImagem;
  /** Comprimento da peça ÷ perímetro dela. */
  readonly proporcao: number;
  /** Onde a peça começa e termina no taco inteiro (0 = ponta, 1 = cabo). */
  readonly noTaco: { readonly de: number; readonly ate: number };
  readonly detalhe: DetalheDaTrama;
}

/** As imagens de uma peça; `null` = a peça é lisa (só a cor do material). */
export interface MapasDaPeca {
  readonly cor: ImagemRGBA | null;
  readonly emissiva: ImagemRGBA | null;
  readonly relevo: ImagemRGBA | null;
}

/** As peças que levam imagem (a trama gerada ou a arte pintada) e o lado dela (px, na escala 1): em volta × ao longo. */
export const TAMANHO_DAS_IMAGENS = { haste: { largura: 128, altura: 512 }, antebraco: { largura: 128, altura: 256 }, punho: { largura: 128, altura: 256 }, base: { largura: 128, altura: 128 } } as const;
export type ParteDeImagem = keyof typeof TAMANHO_DAS_IMAGENS;
export const PARTES_COM_IMAGEM = Object.keys(TAMANHO_DAS_IMAGENS) as readonly ParteDeImagem[];

/** A razão comprimento ÷ perímetro de uma peça do taco (do raio médio dela). */
export function proporcaoDaParte(medidas: MedidasTaco, nome: NomeDaParte): number {
  const parte = partesDoTaco(medidas).find((p) => p.nome === nome)!;
  const raioMedio = (parte.raio(parte.de) + parte.raio(parte.ate)) / 2;
  return (parte.ate - parte.de) / (2 * Math.PI * raioMedio);
}

/** O que a peça pede para desenhar as imagens dela: o tamanho dado, a proporção e onde ela fica no taco inteiro. */
export function contextoDaPeca(aparencia: AparenciaTaco, medidas: MedidasTaco, nome: ParteDeImagem, tamanho: TamanhoDaImagem, detalhe: DetalheDaTrama): ContextoDaPeca {
  const parte = partesDoTaco(medidas).find((p) => p.nome === nome)!;
  return { aparencia, tamanho, proporcao: proporcaoDaParte(medidas, nome), noTaco: { de: parte.de / medidas.comprimento, ate: parte.ate / medidas.comprimento }, detalhe };
}

const SEM_MAPAS: MapasDaPeca = { cor: null, emissiva: null, relevo: null };

/** A semente de cada gerador antigo, mexida pela semente do taco (sem ela, as de sempre: o desenho de fábrica não muda). */
const semeadoPor = (fixa: number, ctx: ContextoDaPeca): number => (ctx.aparencia.variacao.semente === null ? fixa : fixa + 1000 * (ctx.aparencia.variacao.semente + 1));

/** As chamas da haste: fileiras curtas (uma a cada ~8 cm) de línguas gordas; vistas de trás, línguas compridas e finas virariam listras. */
const OPCOES_DAS_CHAMAS_DA_HASTE = (semente: number) => ({ linguas: 4, alturaMin: 0.55, alturaMax: 0.95, semente, fileiras: 9 });

/** Pinta as faixas por cima de `cor` e as que acendem em `emissiva` (criada preta se faltar e alguma acende). */
function comFaixas(cor: ImagemRGBA, emissiva: ImagemRGBA | null, peca: PecaDeMadeira, tamanho: TamanhoDaImagem): { cor: ImagemRGBA; emissiva: ImagemRGBA | null } {
  const faixas = peca.faixas ?? [];
  pintarFaixas(cor, faixas);
  if (faixas.some((f) => f.brilho === true)) return { cor, emissiva: pintarFaixas(emissiva ?? imagemLisa(tamanho, 0x000000), faixas, true) };
  return { cor, emissiva };
}

/**
 * As imagens da haste ou da base: a trama (gerada, neon, carbono, chamas, lisa ou veio), as faixas por cima e o que acende.
 * `semente` é a do gerador antigo da peça (a haste e a base têm a sua).
 */
export function mapasDaMadeira(peca: PecaDeMadeira, ctx: ContextoDaPeca, semente: number): MapasDaPeca {
  const { tamanho: t, proporcao } = ctx;
  const faixas = peca.faixas ?? [];
  if (peca.trama === 'neon') {
    const { cor, emissiva } = imagemDeNeon(t, peca.cor, peca.linhas ?? [0x19f0ff, 0xff2bd6], faixas);
    return { cor, emissiva, relevo: null };
  }
  if (peca.gerada) {
    const g = imagemDaTrama(peca.gerada, { tamanho: t, proporcao, noTaco: ctx.noTaco, variacao: ctx.aparencia.variacao, detalhe: ctx.detalhe });
    const f = comFaixas(g.cor, g.emissiva, peca, t);
    return { cor: f.cor, emissiva: f.emissiva, relevo: g.relevo };
  }
  if (peca.trama === 'lisa' && faixas.length === 0) return SEM_MAPAS;
  const v = ctx.aparencia.variacao;
  const base =
    peca.trama === 'carbono' ? imagemDeCarbono(t, peca.cor, peca.contraste, 6, proporcao) : peca.trama === 'lisa' ? imagemLisa(t, peca.cor) : imagemDeMadeira(t, peca.cor, peca.contraste, semeadoPor(semente, ctx), v);
  const chamas = peca.chamas ?? [0xffc23a, 0xd8200f];
  if (peca.trama === 'chamas') pintarChamas(base, chamas, OPCOES_DAS_CHAMAS_DA_HASTE(semeadoPor(semente, ctx)));
  const f = comFaixas(base, null, peca, t);
  if (peca.trama === 'chamas') {
    // As chamas acendem por si (o fogo não depende da luz da luminária): a mesma imagem, sobre o preto.
    return { cor: f.cor, emissiva: pintarChamas(imagemLisa(t, 0x000000), chamas, OPCOES_DAS_CHAMAS_DA_HASTE(semeadoPor(semente, ctx))), relevo: null };
  }
  return { cor: f.cor, emissiva: f.emissiva, relevo: null };
}

/** As imagens do antebraço: a trama de base (gerada ou antiga) com o desenho (bicos, chamas, linhas) das antigas. */
export function mapasDoAntebraco(ctx: ContextoDaPeca): MapasDaPeca {
  const { aparencia, tamanho: t, proporcao } = ctx;
  const base = aparencia.antebraco.base;
  if (base.gerada) {
    const g = imagemDaTrama(base.gerada, { tamanho: t, proporcao, noTaco: ctx.noTaco, variacao: aparencia.variacao, detalhe: ctx.detalhe });
    const f = comFaixas(g.cor, g.emissiva, base, t);
    return { cor: f.cor, emissiva: f.emissiva, relevo: g.relevo };
  }
  if (base.trama === 'lisa' && aparencia.antebraco.desenho.tipo === 'liso' && (base.faixas ?? []).length === 0) return SEM_MAPAS;
  const desenho = imagemDoAntebraco(t, base, aparencia.antebraco.desenho, semeadoPor(31, ctx), proporcao, aparencia.variacao);
  const f = comFaixas(desenho.cor, desenho.emissiva, base, t);
  return { cor: f.cor, emissiva: f.emissiva, relevo: null };
}

/** O punho: a cor com a trama do fio, os anéis (se tem) e o relevo. */
export function mapasDoPunho(ctx: ContextoDaPeca): { readonly cor: ImagemRGBA; readonly relevo: ImagemRGBA } {
  const imagens = imagemDoPunho(ctx.tamanho, ctx.aparencia.punho, semeadoPor(47, ctx));
  // Os anéis de ouro do punho da Dragon Lore: pintados por cima do fio (o relevo do fio fica por baixo).
  if (ctx.aparencia.punho.aneis) pintarFaixas(imagens.cor, ctx.aparencia.punho.aneis);
  return imagens;
}

/** A imagem de cor que a peça de código desenha (a que a miniatura da loja usa), ou `null` se a peça é lisa. */
export function corDaPeca(ctx: ContextoDaPeca, nome: ParteDeImagem): ImagemRGBA | null {
  switch (nome) {
    case 'haste':
      return mapasDaMadeira(ctx.aparencia.haste, ctx, 11).cor;
    case 'antebraco':
      return mapasDoAntebraco(ctx).cor;
    case 'punho':
      return mapasDoPunho(ctx).cor;
    case 'base':
      return mapasDaMadeira(ctx.aparencia.base, ctx, 53).cor;
  }
}
