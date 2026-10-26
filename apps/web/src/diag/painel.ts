import { linhasDoDiagnostico, type DadosDoDiagnostico } from './linhas';

export interface OpcoesPainelDiagnostico {
  /** De quanto em quanto tempo o texto se refaz (ms). */
  readonly atualizacaoMs: number;
  /** Lê os números de agora; só é chamado com o painel aberto. */
  readonly ler: (agoraMs: number) => DadosDoDiagnostico;
  readonly aberto?: boolean;
}

export interface PainelDiagnostico {
  readonly aberto: boolean;
  alternar(): void;
  /** Uma vez por quadro: refaz o texto se o painel está aberto e passou o intervalo. */
  atualizar(agoraMs: number): void;
  dispose(): void;
}

/** O painel F3: um bloco de texto monoespaçado embaixo no meio, sem capturar o mouse. */
export function criarPainelDiagnostico(pai: HTMLElement, opcoes: OpcoesPainelDiagnostico): PainelDiagnostico {
  const raiz = document.createElement('pre');
  raiz.className = 'painel-diag';
  raiz.setAttribute('aria-label', 'Diagnóstico de desempenho');
  raiz.hidden = !(opcoes.aberto ?? false);
  pai.append(raiz);
  let proximoMs = 0;
  return {
    get aberto() {
      return !raiz.hidden;
    },
    alternar() {
      raiz.hidden = !raiz.hidden;
      proximoMs = 0;
    },
    atualizar(agoraMs) {
      if (raiz.hidden || agoraMs < proximoMs) return;
      proximoMs = agoraMs + opcoes.atualizacaoMs;
      raiz.textContent = linhasDoDiagnostico(opcoes.ler(agoraMs)).join('\n');
    },
    dispose() {
      raiz.remove();
    },
  };
}
