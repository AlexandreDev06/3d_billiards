import type { CarteiraDoAparelho, ResultadoDaCarteira } from '../online/carteira';
import { lojaNaTela, type CartaoDeSkin } from '../online/loja-modelo';
import { APARENCIAS_DO_TACO } from '../cena/aparencia-do-taco';
import { desenharMiniatura } from './miniatura-do-taco';

export interface Loja {
  readonly aberta: boolean;
  abrir(): void;
  fechar(): void;
  /** O texto que a loja mostra agora (saldo, cartões, mensagem), para o gancho de teste. Nunca leva o código da carteira. */
  texto(): string;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Tamanho da miniatura em pixels CSS; o canvas leva o `devicePixelRatio`. */
const MINIATURA = { largura: 300, altura: 40 } as const;

/**
 * A loja de tacos: sobre qualquer tela (menu, sala de espera), com o saldo no topo e as oito skins. Só DOM: o que cada cartão
 * mostra vem de `lojaNaTela`, e comprar/usar passam pela `CarteiraDoAparelho`. O código secreto da carteira nunca chega aqui.
 */
export function criarLoja(pai: HTMLElement, carteira: CarteiraDoAparelho): Loja {
  const raiz = el('div', 'loja');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-labelledby', 'loja-titulo');
  const caixa = el('div', 'loja-caixa');

  const topo = el('div', 'loja-topo');
  const titulo = el('h2', 'loja-titulo', 'Loja de tacos');
  titulo.id = 'loja-titulo';
  const saldo = el('div', 'loja-saldo');
  const fechar = el('button', 'loja-fechar', '×');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar a loja');
  topo.append(titulo, saldo, fechar);

  const aviso = el('div', 'loja-aviso');
  aviso.hidden = true;
  const avisoTexto = el('span', 'loja-aviso-texto');
  const entendi = el('button', 'loja-botao pequeno', 'Entendi');
  entendi.type = 'button';
  entendi.addEventListener('click', () => carteira.dispensarAviso());
  aviso.append(avisoTexto, entendi);

  const fora = el('div', 'loja-fora');
  fora.hidden = true;
  fora.setAttribute('role', 'alert');
  const foraTexto = el('span', 'loja-fora-texto');
  const tentar = el('button', 'loja-botao pequeno', 'Tentar de novo');
  tentar.type = 'button';
  fora.append(foraTexto, tentar);

  const status = el('div', 'loja-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const grade = el('ul', 'loja-grade');
  caixa.append(topo, aviso, fora, status, grade);
  raiz.append(caixa);
  pai.append(raiz);

  let aberta = false;
  let ocupada = false;
  let focoAnterior: HTMLElement | null = null;
  let desassinar: (() => void) | null = null;
  const miniaturas = new Map<string, HTMLCanvasElement>();

  const canvasDa = (skin: string): HTMLCanvasElement => {
    let c = miniaturas.get(skin);
    if (!c) {
      c = el('canvas', 'loja-miniatura');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(MINIATURA.largura * dpr);
      c.height = Math.round(MINIATURA.altura * dpr);
      c.setAttribute('aria-hidden', 'true');
      desenharMiniatura(c, APARENCIAS_DO_TACO[skin as keyof typeof APARENCIAS_DO_TACO]);
      miniaturas.set(skin, c);
    }
    return c;
  };

  const cartao = (c: CartaoDeSkin): HTMLElement => {
    const item = el('li', `loja-cartao ${c.situacao}`);
    item.dataset.skin = c.skin;
    const nomeLinha = el('div', 'loja-nome-linha');
    nomeLinha.append(el('span', 'loja-nome', c.nome));
    if (c.selo !== null) nomeLinha.append(el('span', `loja-selo ${c.situacao}`, c.selo));
    nomeLinha.append(el('span', 'loja-preco', c.textoDoPreco));
    const rodape = el('div', 'loja-cartao-rodape');
    rodape.append(el('span', 'loja-faltam', c.textoFaltam ?? ''));
    if (c.acao !== null) {
      const botao = el('button', `loja-botao ${c.acao === 'comprar' ? 'principal' : ''}`.trim(), c.acao === 'comprar' ? 'Comprar' : 'Usar');
      botao.type = 'button';
      botao.disabled = !c.podeAgir || ocupada;
      botao.dataset.acao = c.acao;
      botao.setAttribute('aria-label', `${c.acao === 'comprar' ? 'Comprar' : 'Usar'} o taco ${c.nome}${c.textoFaltam ? `. ${c.textoFaltam}` : ''}`);
      botao.addEventListener('click', () => void executar(c));
      rodape.append(botao);
    }
    item.append(canvasDa(c.skin), nomeLinha, rodape);
    return item;
  };

  const desenhar = (): void => {
    const loja = lojaNaTela(carteira.estado());
    saldo.replaceChildren(el('span', 'loja-saldo-rotulo', 'Saldo'), el('span', `loja-saldo-valor${loja.saldoNegativo ? ' negativo' : ''}`, loja.textoSaldo));
    const avisoDaCarteira = carteira.aviso();
    aviso.hidden = avisoDaCarteira === null;
    avisoTexto.textContent = avisoDaCarteira ?? '';
    // O aviso de "fora do ar" só aparece depois de uma resposta ruim: a vitrine fica sem ele enquanto a primeira leitura não volta.
    fora.hidden = foraTexto.textContent === '';
    caixa.classList.toggle('fora-do-ar', !loja.disponivel);
    grade.replaceChildren(...loja.cartoes.map(cartao));
    for (const b of caixa.querySelectorAll<HTMLButtonElement>('.loja-botao')) if (ocupada && b.dataset.acao !== undefined) b.disabled = true;
    tentar.disabled = ocupada;
  };

  const dizer = (texto: string, erro: boolean): void => {
    status.textContent = texto;
    status.classList.toggle('erro', erro);
    status.setAttribute('role', erro ? 'alert' : 'status');
  };

  /** Mostra o que a carteira respondeu: sucesso na linha de status, falha de rede no aviso de "fora do ar", o resto como erro. */
  const tratar = (r: ResultadoDaCarteira, sucesso: string): void => {
    if (r.ok) {
      foraTexto.textContent = '';
      dizer(sucesso, false);
    } else if (r.erro === 'fora-do-ar') {
      foraTexto.textContent = r.mensagem;
      dizer('', false);
    } else dizer(r.mensagem, true);
    desenhar();
  };

  const trabalhar = async (pedido: () => Promise<ResultadoDaCarteira>, sucesso: string): Promise<void> => {
    if (ocupada) return;
    ocupada = true;
    raiz.setAttribute('aria-busy', 'true');
    desenhar();
    const r = await pedido();
    ocupada = false;
    raiz.removeAttribute('aria-busy');
    tratar(r, sucesso);
  };

  const executar = (c: CartaoDeSkin): Promise<void> =>
    c.acao === 'comprar' ? trabalhar(() => carteira.comprar(c.skin), `Você comprou o taco ${c.nome}.`) : trabalhar(() => carteira.usar(c.skin), `Taco ${c.nome} em uso.`);

  tentar.addEventListener('click', () => void trabalhar(() => carteira.garantir(), ''));

  /** Esc fecha; as outras teclas não chegam ao jogo (os dígitos mandariam emojis por trás da loja). */
  const aoTeclar = (e: KeyboardEvent): void => {
    if (!aberta) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      loja.fechar();
    } else if (e.key === 'Tab') prenderFoco(e);
  };
  const prenderFoco = (e: KeyboardEvent): void => {
    const alvos = [...raiz.querySelectorAll<HTMLElement>('button:not(:disabled)')];
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
  };
  const aoClicarFora = (e: MouseEvent): void => {
    if (e.target === raiz) loja.fechar();
  };
  fechar.addEventListener('click', () => loja.fechar());
  raiz.addEventListener('mousedown', aoClicarFora);

  const loja: Loja = {
    get aberta() {
      return aberta;
    },

    abrir() {
      if (aberta) return;
      aberta = true;
      focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dizer('', false);
      desenhar();
      raiz.hidden = false;
      document.addEventListener('keydown', aoTeclar, true);
      desassinar = carteira.aoMudar(() => aberta && desenhar());
      fechar.focus();
      // Põe o saldo em dia: a compra feita em outra aba, ou o pote de uma partida, mudou o número.
      void carteira.garantir().then((r) => aberta && tratar(r, ''));
    },

    fechar() {
      if (!aberta) return;
      aberta = false;
      raiz.hidden = true;
      document.removeEventListener('keydown', aoTeclar, true);
      desassinar?.();
      desassinar = null;
      focoAnterior?.focus();
      focoAnterior = null;
    },

    texto() {
      if (!aberta) return '';
      const cartoes = [...grade.querySelectorAll<HTMLElement>('.loja-cartao')].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
      return [`Saldo ${saldo.textContent ?? ''}`, avisoTexto.textContent ?? '', foraTexto.textContent ?? '', status.textContent ?? '', ...cartoes].filter(Boolean).join(' | ');
    },

    dispose() {
      loja.fechar();
      raiz.remove();
    },
  };
  return loja;
}
