import { teclaEmCampo } from './campo';

/** O que usamos da janela; os testes passam um `EventTarget`. */
export interface AlvoDeTeclas {
  addEventListener(tipo: string, ouvinte: (evento: Event) => void): void;
  removeEventListener(tipo: string, ouvinte: (evento: Event) => void): void;
}

export interface TeclaSegurada {
  /** A tecla está apertada agora. */
  readonly segurando: boolean;
  dispose(): void;
}

interface Teclado extends Event {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/**
 * Acompanha uma tecla que vale enquanto segurada (`code` como em `KeyboardEvent.code`). Ctrl/Alt/Meta e tecla digitada
 * num campo não contam; perder o foco da janela solta a tecla, porque o `keyup` não chega.
 */
export function ligarTeclaSegurada(alvo: AlvoDeTeclas, code: string): TeclaSegurada {
  let apertada = false;
  const aoApertar = (evento: Event): void => {
    const e = evento as Teclado;
    if (e.code !== code || e.ctrlKey || e.altKey || e.metaKey || teclaEmCampo(e.target)) return;
    apertada = true;
  };
  const aoSoltar = (evento: Event): void => {
    if ((evento as Teclado).code === code) apertada = false;
  };
  const aoPerderFoco = (): void => {
    apertada = false;
  };
  alvo.addEventListener('keydown', aoApertar);
  alvo.addEventListener('keyup', aoSoltar);
  alvo.addEventListener('blur', aoPerderFoco);
  return {
    get segurando() {
      return apertada;
    },
    dispose() {
      apertada = false;
      alvo.removeEventListener('keydown', aoApertar);
      alvo.removeEventListener('keyup', aoSoltar);
      alvo.removeEventListener('blur', aoPerderFoco);
    },
  };
}
