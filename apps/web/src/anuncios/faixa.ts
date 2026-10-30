import type { Anuncios } from './anuncios';
import { alturaDaFaixa } from './modelo';

export interface Faixa {
  /** Quanto da base da janela a faixa toma agora (px); 0 com o menu aberto ou sem anúncio. */
  altura(): number;
  /** Reavalia (menu abriu/fechou, janela mudou, prova visual); avisa `aoMudar` se a altura mudou. */
  atualizar(): void;
  dispose(): void;
}

/**
 * A faixa fixa na base da janela durante a partida. Ela não cobre nada: a altura vai para `--anuncio-faixa` (o HUD de baixo sobe) e
 * para quem dimensiona o canvas, via `altura()`. O espaço nasce na primeira vez que o menu fecha e vive com a página.
 */
export function criarFaixa(anuncios: Anuncios, aoMudar: () => void): Faixa {
  const raiz = document.createElement('div');
  raiz.className = 'anuncio-faixa';
  raiz.hidden = true;
  document.body.append(raiz);
  let altura = 0;

  const quandoPreencher = new MutationObserver(() => atualizar());
  let observado: HTMLElement | null = null;

  function atualizar(): void {
    const menuAberto = document.body.classList.contains('menu-aberto');
    const espaco = menuAberto ? null : anuncios.espaco('partida');
    if (espaco !== null && espaco.parentElement !== raiz) raiz.replaceChildren(espaco);
    if (espaco !== observado) {
      quandoPreencher.disconnect();
      observado = espaco;
      if (espaco !== null) quandoPreencher.observe(espaco, { attributes: true, attributeFilter: ['class'] });
    }
    raiz.hidden = espaco === null;
    // A faixa existe no layout desde o começo (o Google precisa de largura para escolher o anúncio), mas só toma altura da janela
    // quando um anúncio chegou: se não vier, não fica buraco.
    const cheio = espaco?.classList.contains('cheio') === true;
    raiz.classList.toggle('cheio', cheio);
    raiz.style.height = `${alturaDaFaixa(true, window.innerHeight)}px`;
    const nova = alturaDaFaixa(cheio, window.innerHeight);
    document.documentElement.style.setProperty('--anuncio-faixa', `${nova}px`);
    if (nova === altura) return;
    altura = nova;
    aoMudar();
  }

  const observador = new MutationObserver(atualizar);
  observador.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  atualizar();

  return {
    altura: () => altura,
    atualizar,
    dispose() {
      observador.disconnect();
      quandoPreencher.disconnect();
      document.documentElement.style.removeProperty('--anuncio-faixa');
      raiz.remove();
    },
  };
}
