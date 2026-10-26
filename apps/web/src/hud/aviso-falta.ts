import type { AvisoDaTransicao } from '../jogo/transicao-modelo';
import { criarFicha } from './placar';

export interface HudAvisoFalta {
  /** Mostra o aviso por `aviso.duracaoS` a partir de `agoraMs`. */
  mostrar(aviso: AvisoDaTransicao, agoraMs: number): void;
  esconder(): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly titulo: string; readonly detalhes: readonly string[]; readonly falta: boolean };
  /** Uma vez por quadro: some quando o tempo acaba. */
  atualizar(agoraMs: number): void;
  dispose(): void;
}

/**
 * O aviso grande da falta, depois da animação da tacada: o nome da falta, quem recebe a bola e o ícone dela
 * (a mesma ficha lisa/listrada da mesa). Fica na tela mesmo depois de a transição acabar e a mira voltar. Não pega o mouse.
 */
export function criarAvisoDaFalta(pai: HTMLElement): HudAvisoFalta {
  const raiz = document.createElement('div');
  raiz.className = 'aviso-falta';
  raiz.hidden = true;
  raiz.setAttribute('role', 'alert');
  const ficha = document.createElement('div');
  ficha.className = 'aviso-falta-ficha';
  const texto = document.createElement('div');
  texto.className = 'aviso-falta-texto';
  const titulo = document.createElement('div');
  titulo.className = 'aviso-falta-titulo';
  const detalhes = document.createElement('div');
  detalhes.className = 'aviso-falta-detalhes';
  texto.append(titulo, detalhes);
  raiz.append(ficha, texto);
  pai.append(raiz);

  let fimMs = 0;
  let atual: AvisoDaTransicao | null = null;
  return {
    mostrar(aviso, agoraMs) {
      atual = aviso;
      titulo.textContent = aviso.titulo;
      detalhes.replaceChildren(
        ...aviso.detalhes.map((linha) => {
          const el = document.createElement('div');
          el.textContent = linha;
          return el;
        }),
      );
      ficha.replaceChildren(...(aviso.bola === null ? [] : [criarFicha(aviso.bola)]));
      ficha.hidden = aviso.bola === null;
      raiz.classList.toggle('falta', aviso.falta);
      // Reinicia a animação de entrada se o aviso já estava na tela.
      raiz.hidden = true;
      void raiz.offsetWidth;
      raiz.hidden = false;
      fimMs = agoraMs + aviso.duracaoS * 1000;
    },
    esconder() {
      raiz.hidden = true;
      fimMs = 0;
      atual = null;
    },
    estado: () => ({ visivel: !raiz.hidden, titulo: atual?.titulo ?? '', detalhes: atual?.detalhes ?? [], falta: atual?.falta ?? false }),
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
