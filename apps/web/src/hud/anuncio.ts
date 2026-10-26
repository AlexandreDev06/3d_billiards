import { criarFicha } from './placar';
import type { Anuncio } from './anuncio-modelo';

export interface HudAnuncio {
  /** Mostra o aviso por `duracaoMs` a partir de `agoraMs`. */
  mostrar(anuncio: Anuncio, agoraMs: number, duracaoMs: number): void;
  esconder(): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly titulo: string; readonly detalhe: string };
  /** Uma vez por quadro: some quando o tempo acaba. */
  atualizar(agoraMs: number): void;
  dispose(): void;
}

/**
 * O aviso grande do meio de cima: "Agora é só a 8!" com a bola ao lado, no começo da vez de quem só precisa
 * da bola final. Não pega o mouse. Quem fala com leitor de tela é a região `role="alert"`.
 */
export function criarAnuncio(pai: HTMLElement): HudAnuncio {
  const raiz = document.createElement('div');
  raiz.className = 'anuncio';
  raiz.hidden = true;
  raiz.setAttribute('role', 'alert');
  const ficha = document.createElement('div');
  ficha.className = 'anuncio-ficha';
  const texto = document.createElement('div');
  texto.className = 'anuncio-texto';
  const titulo = document.createElement('div');
  titulo.className = 'anuncio-titulo';
  const detalhe = document.createElement('div');
  detalhe.className = 'anuncio-detalhe';
  texto.append(titulo, detalhe);
  raiz.append(ficha, texto);
  pai.append(raiz);

  let fimMs = 0;
  return {
    mostrar(anuncio, agoraMs, duracaoMs) {
      titulo.textContent = anuncio.titulo;
      detalhe.textContent = anuncio.detalhe;
      ficha.replaceChildren(criarFicha(anuncio.bola));
      // Reinicia a animação de entrada se o aviso já estava na tela.
      raiz.hidden = true;
      void raiz.offsetWidth;
      raiz.hidden = false;
      fimMs = agoraMs + duracaoMs;
    },
    esconder() {
      raiz.hidden = true;
      fimMs = 0;
    },
    estado: () => ({ visivel: !raiz.hidden, titulo: titulo.textContent ?? '', detalhe: detalhe.textContent ?? '' }),
    atualizar(agoraMs) {
      if (fimMs !== 0 && agoraMs >= fimMs) {
        fimMs = 0;
        raiz.hidden = true;
      }
    },
    dispose() {
      raiz.remove();
    },
  };
}
