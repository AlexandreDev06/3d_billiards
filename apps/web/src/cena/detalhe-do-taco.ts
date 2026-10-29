/**
 * O que o taco desenha em cada nível de qualidade (L35), como o verniz já fazia: a alta desenha tudo; a média, a trama cheia e a luz
 * que corre, mas sem a película irisada (que só o material físico tem); a baixa, cor e trama simples, sem iridescência nem animação.
 */
export interface DetalheDoTaco {
  /** `cheia`: marmorizado, facetas e relevo completos; `simples`: poucas oitavas de ruído e sem relevo (o nível baixo). */
  readonly trama: 'cheia' | 'simples';
  /** A película irisada (`iridescence`) das gemas e da obsidiana. */
  readonly iridescencia: boolean;
  /** A faixa de luz que corre pela peça (o brilho animado). */
  readonly animacao: boolean;
  /** As imagens pintadas: cor e brilho (`completas`) ou só a cor. */
  readonly imagens: 'completas' | 'cor';
}

/** Tudo ligado: o que a alta desenha e o padrão de quem não escolhe. */
export const DETALHE_COMPLETO: DetalheDoTaco = { trama: 'cheia', iridescencia: true, animacao: true, imagens: 'completas' };

/** Mesma comparação de valor, para só refazer o taco quando o nível de verdade mudou. */
export function mesmoDetalhe(a: DetalheDoTaco, b: DetalheDoTaco): boolean {
  return a.trama === b.trama && a.iridescencia === b.iridescencia && a.animacao === b.animacao && a.imagens === b.imagens;
}
