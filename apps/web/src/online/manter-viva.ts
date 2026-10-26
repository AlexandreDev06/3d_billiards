/** O que usamos de `navigator.locks`; os testes passam um falso. */
export interface TravasMinimas {
  request(nome: string, opcoes: { mode: 'shared' }, ao: () => Promise<void>): Promise<unknown>;
}

export const NOME_DO_TRAVAMENTO = 'sinuca-sala';

export interface AbaViva {
  /** O navegador concedeu o travamento e ele ainda está de pé. */
  readonly ativa: boolean;
  /** Solta o travamento (ao sair da sala). Pode ser chamado mais de uma vez. */
  liberar(): void;
}

/**
 * Segura um Web Lock compartilhado enquanto a sala está aberta. O Chrome congela as abas que ficam escondidas e,
 * ao descongelar (a cada ~60 s), fecha os WebSockets delas com 1001: o espectador de uma aba escondida caía e
 * voltava de minuto em minuto, e um jogador que olhasse outra aba perdia a conexão no meio da partida. Aba com
 * Web Lock não é candidata a congelamento. Sem `navigator.locks` (página sem HTTPS, navegador antigo) ou com o
 * pedido recusado, o jogo segue como antes; a volta rápida fica por conta de `ClienteSala.retomar`.
 */
export function manterViva(travas: TravasMinimas | undefined): AbaViva {
  let ativa = false;
  let solta = false;
  let soltar: (() => void) | null = null;
  const segurar = (): Promise<void> =>
    new Promise<void>((resolver) => {
      if (solta) return resolver();
      ativa = true;
      soltar = () => {
        ativa = false;
        resolver();
      };
    });
  try {
    void travas?.request(NOME_DO_TRAVAMENTO, { mode: 'shared' }, segurar)?.catch(() => {
      ativa = false;
    });
  } catch {
    ativa = false;
  }
  return {
    get ativa() {
      return ativa;
    },
    liberar() {
      solta = true;
      soltar?.();
    },
  };
}
