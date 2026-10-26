export interface AvisoDeEspirro {
  /** Mostra o alerta por `duracaoMs`; um novo no meio do outro reinicia a contagem. */
  mostrar(texto: string, agoraMs: number, duracaoMs: number): void;
  atualizar(agoraMs: number): void;
  esconder(): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly texto: string };
  dispose(): void;
}

/**
 * O alerta de "Espirrou!": uma pílula laranja logo abaixo do relógio, igual para quem tacou e para quem assiste. Não pega o
 * mouse; o tremor é só CSS (e some com `prefers-reduced-motion`).
 */
export function criarAvisoDeEspirro(pai: HTMLElement): AvisoDeEspirro {
  const raiz = document.createElement('div');
  raiz.className = 'aviso-espirro';
  raiz.hidden = true;
  raiz.setAttribute('role', 'alert');
  pai.append(raiz);
  let fimMs = 0;
  let texto = '';
  return {
    mostrar(novo, agoraMs, duracaoMs) {
      texto = novo;
      raiz.textContent = novo;
      fimMs = agoraMs + duracaoMs;
      // Reinicia o tremor se já estava na tela.
      raiz.hidden = true;
      void raiz.offsetWidth;
      raiz.hidden = false;
    },
    atualizar(agoraMs) {
      if (fimMs !== 0 && agoraMs >= fimMs) this.esconder();
    },
    esconder() {
      fimMs = 0;
      texto = '';
      raiz.hidden = true;
    },
    estado: () => ({ visivel: !raiz.hidden, texto }),
    dispose() {
      raiz.remove();
    },
  };
}
