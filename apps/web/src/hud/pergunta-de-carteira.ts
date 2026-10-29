import type { PerguntaDeCarteira } from '../online/levar-carteira';

export interface PerguntaDaCarteira {
  readonly aberta: boolean;
  /** Mostra a pergunta e espera a resposta: `true` = usar a carteira do link. Esc e clicar fora são "manter a atual". */
  perguntar(pergunta: PerguntaDeCarteira): Promise<boolean>;
  /** Mostra um recado (código inválido, sala fora do ar...) e espera o "Entendi". Nada muda por causa dele. */
  avisar(texto: string): Promise<void>;
  /** O texto que está na tela, `''` fechada (gancho de teste). Nunca leva o código da carteira: ele nem chega aqui. */
  texto(): string;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * A pergunta "Usar esta carteira neste aparelho?" (L43), por cima de qualquer tela, com o saldo da carteira do link e o da atual e o
 * aviso de que a atual fica esquecida; e o recado simples para o link que não vale. Só DOM, sem o código da carteira. O foco nasce no
 * botão que NÃO troca ("Manter a atual"): trocar de carteira exige um clique de propósito.
 */
export function criarPerguntaDeCarteira(pai: HTMLElement): PerguntaDaCarteira {
  const raiz = el('div', 'carteira-pergunta');
  raiz.hidden = true;
  raiz.setAttribute('role', 'alertdialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-labelledby', 'carteira-pergunta-titulo');
  raiz.setAttribute('aria-describedby', 'carteira-pergunta-corpo');
  const caixa = el('div', 'carteira-pergunta-caixa');
  const titulo = el('h2', 'carteira-pergunta-titulo');
  titulo.id = 'carteira-pergunta-titulo';
  const corpo = el('div', 'carteira-pergunta-corpo');
  corpo.id = 'carteira-pergunta-corpo';
  const acoes = el('div', 'carteira-pergunta-acoes');
  caixa.append(titulo, corpo, acoes);
  raiz.append(caixa);
  pai.append(raiz);

  let aberta = false;
  let focoAnterior: HTMLElement | null = null;
  /** Fecha a pergunta de agora com a resposta dada; `null` = nada aberto. */
  let responder: ((usar: boolean) => void) | null = null;

  const botao = (texto: string, classe: string, aoClicar: () => void): HTMLButtonElement => {
    const b = el('button', classe, texto);
    b.type = 'button';
    b.addEventListener('click', aoClicar);
    return b;
  };

  const linhaDeCarteira = (rotulo: string, valor: string, classe: string): HTMLElement => {
    const l = el('div', `carteira-pergunta-linha ${classe}`);
    l.append(el('span', 'carteira-pergunta-rotulo', rotulo), el('span', 'carteira-pergunta-valor', valor));
    return l;
  };

  const aoTeclar = (e: KeyboardEvent): void => {
    if (!aberta) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      responder?.(false);
    } else if (e.key === 'Tab') {
      const alvos = [...raiz.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (alvos.length === 0) return;
      const primeiro = alvos[0]!;
      const ultimo = alvos.at(-1)!;
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  };

  const abrir = (focar: () => void): void => {
    aberta = true;
    focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    raiz.hidden = false;
    document.addEventListener('keydown', aoTeclar, true);
    focar();
  };
  const fechar = (): void => {
    aberta = false;
    raiz.hidden = true;
    document.removeEventListener('keydown', aoTeclar, true);
    titulo.textContent = '';
    corpo.replaceChildren();
    acoes.replaceChildren();
    focoAnterior?.focus();
    focoAnterior = null;
  };

  /** Uma pergunta ou recado de cada vez: o que chega com outro aberto espera a vez. */
  let fila: Promise<unknown> = Promise.resolve();
  const naFila = <T>(fazer: () => Promise<T>): Promise<T> => {
    const proxima = fila.then(fazer, fazer);
    fila = proxima.catch(() => undefined);
    return proxima;
  };

  return {
    get aberta() {
      return aberta;
    },

    perguntar(pergunta) {
      return naFila(
        () =>
          new Promise<boolean>((resolver) => {
            titulo.textContent = pergunta.titulo;
            const doLink = linhaDeCarteira('Carteira do link', pergunta.doLink, 'do-link');
            const atual = pergunta.atual === null ? null : linhaDeCarteira('Carteira deste aparelho', pergunta.atual, 'atual');
            const alerta = el('p', 'carteira-pergunta-aviso', pergunta.aviso);
            corpo.replaceChildren(...[doLink, atual, alerta].filter((x): x is HTMLElement => x !== null));
            const manter = botao(pergunta.recusar, 'menu-botao carteira-pergunta-botao', () => responder?.(false));
            const usar = botao(pergunta.confirmar, 'menu-botao carteira-pergunta-botao principal', () => responder?.(true));
            acoes.replaceChildren(manter, usar);
            responder = (resposta) => {
              responder = null;
              fechar();
              resolver(resposta);
            };
            abrir(() => manter.focus());
          }),
      );
    },

    avisar(texto) {
      return naFila(
        () =>
          new Promise<void>((resolver) => {
            titulo.textContent = 'Carteira';
            corpo.replaceChildren(el('p', 'carteira-pergunta-aviso neutro', texto));
            const entendi = botao('Entendi', 'menu-botao carteira-pergunta-botao principal', () => responder?.(false));
            acoes.replaceChildren(entendi);
            responder = () => {
              responder = null;
              fechar();
              resolver();
            };
            abrir(() => entendi.focus());
          }),
      );
    },

    texto() {
      if (!aberta) return '';
      const linha = (c: Element): string => (c.children.length > 0 ? [...c.children].map((x) => x.textContent ?? '').join(': ') : (c.textContent ?? '')).replace(/\s+/g, ' ').trim();
      return [titulo.textContent ?? '', ...[...corpo.children].map(linha)].filter(Boolean).join(' | ');
    },

    dispose() {
      if (aberta) responder?.(false);
      raiz.remove();
    },
  };
}
