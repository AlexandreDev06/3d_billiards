import type { AvisoDeMissao } from '../online/missoes-modelo';
import { PilhaDeAvisosDeMissao, type ConfigDosAvisosDeMissao } from './avisos-de-missao-modelo';

export interface AvisosDeMissao {
  /** Põe os avisos na tela agora (o chamador só os manda quando as bolas pararam). */
  mostrar(avisos: readonly AvisoDeMissao[], agoraMs: number): void;
  /** Tira o que já passou da hora; chamado a cada quadro, só mexe no DOM quando algo muda. */
  atualizar(agoraMs: number): void;
  /** Tira tudo da tela (a sala acabou). */
  limpar(): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): readonly { readonly tipo: string; readonly texto: string }[];
  dispose(): void;
}

/**
 * Os avisos das missões do dia (L32): um recado pequeno quando uma missão anda ("Mão quente 3/5") e uma pílula dourada de festa
 * quando fecha ("Missão cumprida! Tabelada +100"). Ficam no canto de cima à direita, abaixo dos botões, longe do meio da mesa, e
 * não pegam o mouse. Fora do `.hud` de propósito, como os emojis: a tela de fim e a espera cobrem o HUD.
 */
export function criarAvisosDeMissao(pai: HTMLElement, cfg: ConfigDosAvisosDeMissao): AvisosDeMissao {
  const raiz = document.createElement('div');
  raiz.className = 'avisos-missao';
  raiz.setAttribute('role', 'status');
  raiz.setAttribute('aria-live', 'polite');
  raiz.hidden = true;
  pai.append(raiz);
  const pilha = new PilhaDeAvisosDeMissao(cfg);
  /** Chave do que está desenhado, para só mexer no DOM quando a pilha muda. */
  let desenhado = '';

  const redesenhar = (itens: ReturnType<PilhaDeAvisosDeMissao['atualizar']>): void => {
    const chave = itens.map((i) => `${i.tipo}:${i.desdeMs}:${i.texto}`).join('|');
    if (chave === desenhado) return;
    desenhado = chave;
    raiz.hidden = itens.length === 0;
    raiz.replaceChildren(
      ...itens.map((i) => {
        const e = document.createElement('div');
        e.className = `aviso-missao ${i.tipo}`;
        e.dataset.missao = i.id;
        if (i.tipo === 'cumprida') {
          const moeda = document.createElement('span');
          moeda.className = 'aviso-missao-moeda';
          moeda.setAttribute('aria-hidden', 'true');
          e.append(moeda, document.createTextNode(i.texto));
        } else {
          e.textContent = i.texto;
        }
        return e;
      }),
    );
  };

  return {
    mostrar(avisos, agoraMs) {
      pilha.empilhar(avisos, agoraMs);
      redesenhar(pilha.atualizar(agoraMs));
    },
    atualizar(agoraMs) {
      redesenhar(pilha.atualizar(agoraMs));
    },
    limpar() {
      pilha.limpar();
      redesenhar(pilha.atualizar(0));
    },
    estado: () => [...raiz.children].map((c) => ({ tipo: c.classList.contains('cumprida') ? 'cumprida' : 'progresso', texto: c.textContent ?? '' })),
    dispose() {
      raiz.remove();
    },
  };
}
