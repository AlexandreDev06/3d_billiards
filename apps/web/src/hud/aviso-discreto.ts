export interface AvisoDiscreto {
  /** Uma frase pequena e passageira (some sozinha depois de `duracaoMs`). */
  mostrar(texto: string, agoraMs: number, duracaoMs: number): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly texto: string };
  atualizar(agoraMs: number): void;
  dispose(): void;
}

/** O recado que não pede resposta: embaixo no meio, fora do caminho da mesa (ex.: "gráficos reduzidos para manter a fluidez"). */
export function criarAvisoDiscreto(pai: HTMLElement): AvisoDiscreto {
  const raiz = document.createElement('div');
  raiz.className = 'aviso-discreto';
  raiz.hidden = true;
  raiz.setAttribute('role', 'status');
  pai.append(raiz);
  let fimMs = 0;
  return {
    mostrar(texto, agoraMs, duracaoMs) {
      raiz.textContent = texto;
      raiz.hidden = false;
      fimMs = agoraMs + duracaoMs;
    },
    estado: () => ({ visivel: !raiz.hidden, texto: raiz.textContent ?? '' }),
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
