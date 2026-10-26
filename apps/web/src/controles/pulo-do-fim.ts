import { teclaEmCampoDeTexto } from './campo';

const SO_MODIFICADORA: ReadonlySet<string> = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);

/** A tecla pula o fim da partida? Qualquer uma que não seja só um modificador, repetição ou digitação num campo de texto. */
export function teclaPulaOFim(code: string, repetida: boolean, emCampoDeTexto: boolean): boolean {
  return !repetida && !emCampoDeTexto && !SO_MODIFICADORA.has(code);
}

/**
 * A tecla que pulou o fim fica "engolida" até soltar: a tela de fim aparece com o botão já em foco, e um Enter ou Espaço ainda
 * apertado o clicaria sem ninguém querer. `engolir` diz se o evento da tecla deve ser descartado.
 */
export class TeclaDoPulo {
  private code: string | null = null;

  segurar(code: string): void {
    this.code = code;
  }

  /** O evento (`keydown` ou `keyup`) dessa tecla deve ser descartado? No `keyup` ela é solta e deixa de ser engolida. */
  engolir(tipo: 'keydown' | 'keyup', code: string): boolean {
    if (this.code !== code) return false;
    if (tipo === 'keyup') this.code = null;
    return true;
  }
}

type AlvoDeEventos = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Liga o pulo do fim da partida: um clique ou uma tecla enquanto `ativo()` chama `pular()`. O clique que pula não chega à tela de
 * fim que aparece embaixo dele. Devolve quem desliga.
 */
export function ouvirPuloDoFim(alvo: AlvoDeEventos, ativo: () => boolean, pular: () => void): () => void {
  const tecla = new TeclaDoPulo();
  const aoClicar = (e: Event): void => {
    if (!ativo()) return;
    e.stopPropagation();
    e.preventDefault();
    pular();
  };
  const aoTeclar = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (tecla.engolir('keydown', e.code)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    if (ativo() && teclaPulaOFim(e.code, e.repeat, teclaEmCampoDeTexto(e.target))) {
      tecla.segurar(e.code);
      pular();
    }
  };
  const aoSoltar = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (!tecla.engolir('keyup', e.code)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  };
  alvo.addEventListener('click', aoClicar, true);
  alvo.addEventListener('keydown', aoTeclar, true);
  alvo.addEventListener('keyup', aoSoltar, true);
  return () => {
    alvo.removeEventListener('click', aoClicar, true);
    alvo.removeEventListener('keydown', aoTeclar, true);
    alvo.removeEventListener('keyup', aoSoltar, true);
  };
}
