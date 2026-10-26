import { criarConfronto } from './confronto';
import type { ConfrontoNaTela } from './confronto-modelo';

/** O placar da sala (ou do mesmo PC) em pequeno, em cima do placar das bolas: "Ana 3 × 1 Beto". */
export interface PlacarDaSalaHud {
  /** Redesenha só se mudou; `null` esconde. */
  mostrar(confronto: ConfrontoNaTela | null): void;
  /** A frase na tela ("Ana 3 × 1 Beto"); "" se escondido (para o gancho de teste). */
  texto(): string;
  dispose(): void;
}

export function criarPlacarDaSala(pai: HTMLElement): PlacarDaSalaHud {
  const raiz = document.createElement('div');
  raiz.className = 'placar-sala';
  raiz.hidden = true;
  pai.append(raiz);
  let ultimaChave = '';
  return {
    mostrar(confronto) {
      const chave = confronto === null ? '' : JSON.stringify(confronto);
      if (chave === ultimaChave) return;
      ultimaChave = chave;
      raiz.hidden = confronto === null;
      raiz.replaceChildren(...(confronto === null ? [] : [criarConfronto(confronto, 'pequeno')]));
    },
    texto: () => (raiz.hidden ? '' : (raiz.firstElementChild as HTMLElement | null)?.title ?? ''),
    dispose() {
      raiz.remove();
    },
  };
}
