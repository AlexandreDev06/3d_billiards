export interface AvisoDaMira {
  /** Texto do aviso, ou `''` para esconder. Só mexe no DOM quando o texto muda. */
  mostrar(texto: string): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly texto: string };
  dispose(): void;
}

/** O aviso curto de "bola errada" enquanto se mira, embaixo do relógio. Não pega o mouse. */
export function criarAvisoDaMira(pai: HTMLElement): AvisoDaMira {
  const raiz = document.createElement('div');
  raiz.className = 'aviso-mira';
  raiz.hidden = true;
  raiz.setAttribute('role', 'status');
  pai.append(raiz);
  let texto = '';
  return {
    mostrar(novo) {
      if (novo === texto) return;
      texto = novo;
      raiz.textContent = novo;
      raiz.hidden = novo === '';
    },
    estado: () => ({ visivel: !raiz.hidden, texto }),
    dispose() {
      raiz.remove();
    },
  };
}
