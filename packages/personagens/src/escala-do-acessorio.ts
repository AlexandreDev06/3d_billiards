import type { AncoraDeAcessorioDaMeta } from './meta-do-rosto';
import type { Trio } from './tipos';

const MENOR_ESCALA = 1e-6;

/**
 * A escala **local** que o acessório (o chapéu) leva na âncora para não amassar junto com o osso: ele herda a escala do nó, e a regra
 * do meta (`ancora_chapeu.escala_do_chapeu`) diz quanto dela ele acompanha, por eixo, com piso e teto:
 * `final = clamp(1 + segue × (escala_do_nó − 1), piso, teto)` e `local = final / escala_do_nó`. A largura vale a média de x e z (o
 * acessório não fica torto), a altura é y. `escalaDoNo` é a escala do nó vista no mundo do personagem (o tamanho das colunas da
 * matriz, sem a escala com que o jogo põe o personagem em cena). Escreve em `saida`; nada aloca. Escala do nó que não é um número
 * positivo deixa o acessório como está (1).
 */
export function escalaDoAcessorio(escalaDoNo: Trio, ancora: Pick<AncoraDeAcessorioDaMeta, 'largura' | 'altura'>, saida: [number, number, number]): void {
  const [sx, sy, sz] = escalaDoNo;
  if (!(sx > MENOR_ESCALA) || !(sy > MENOR_ESCALA) || !(sz > MENOR_ESCALA) || !Number.isFinite(sx + sy + sz)) {
    saida[0] = 1;
    saida[1] = 1;
    saida[2] = 1;
    return;
  }
  const { largura, altura } = ancora;
  const larg = Math.min(largura.teto, Math.max(largura.piso, 1 + largura.segue * ((sx + sz) / 2 - 1)));
  const alt = Math.min(altura.teto, Math.max(altura.piso, 1 + altura.segue * (sy - 1)));
  saida[0] = larg / sx;
  saida[1] = alt / sy;
  saida[2] = larg / sz;
}
