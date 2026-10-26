import type { FichaDaBola } from '../cena/bola-estilo';
import { criarFicha } from './placar';

export interface VooDeFichas {
  /** Põe a ficha `indice` no ponto (`x`, `y`) da janela (px), no tamanho `escala` vezes o da ficha do placar. */
  mostrar(indice: number, ficha: FichaDaBola, x: number, y: number, escala: number): void;
  esconder(indice: number): void;
  dispose(): void;
}

/** As fichas que voam por cima de tudo, da bola na mesa até a ficha do placar. Não pegam o mouse. */
export function criarVooDeFichas(pai: HTMLElement): VooDeFichas {
  const itens: { el: HTMLElement; chave: string }[] = [];
  const dar = (indice: number): { el: HTMLElement; chave: string } => {
    while (itens.length <= indice) {
      const el = document.createElement('div');
      el.className = 'voo-ficha';
      el.hidden = true;
      pai.append(el);
      itens.push({ el, chave: '' });
    }
    return itens[indice]!;
  };
  return {
    mostrar(indice, ficha, x, y, escala) {
      const item = dar(indice);
      const chave = `${ficha.id}:${ficha.estilo}`;
      if (item.chave !== chave) {
        item.chave = chave;
        item.el.replaceChildren(criarFicha(ficha));
      }
      item.el.hidden = false;
      item.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${escala.toFixed(3)})`;
    },
    esconder(indice) {
      const item = itens[indice];
      if (item) item.el.hidden = true;
    },
    dispose() {
      for (const { el } of itens) el.remove();
      itens.length = 0;
    },
  };
}
