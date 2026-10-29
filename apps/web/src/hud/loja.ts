import type { CarteiraDoAparelho, ResultadoDaCarteira } from '../online/carteira';
import { balaoNaLoja, type CartaoDeItem } from '../online/balao-modelo';
import { lojaNaTela, msAteAViradaDaVitrine, type CartaoDeSkin, type GrupoDaFaixa, type VitrineNaTela } from '../online/loja-modelo';
import type { IdItemDoBalao } from '@sinuca/protocolo';
import { aparenciaDoTaco } from '../cena/aparencia-do-taco';
import { criarCanvasDaMiniatura } from './miniatura-do-taco';

export interface Loja {
  readonly aberta: boolean;
  /** Abre a loja; com `item`, rola até o item do balão (o "Ver na loja" do editor). */
  abrir(item?: IdItemDoBalao): void;
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
 * A loja: os tacos e, numa seção à parte, o balão (chapéus, bigodes, estilo e cor dos olhos). Sobre qualquer tela (menu, sala de espera), com o saldo no topo, a vitrine do dia (as skins com desconto) e as 21
 * skins por faixa de raridade, cada cartão com a cor da faixa, a semente e o contador de bolas do taco que o jogador já tem. Só DOM: o
 * que cada cartão mostra vem de `lojaNaTela`, e comprar/usar passam pela `CarteiraDoAparelho` (a compra manda o preço que a tela
 * mostrou; se a sala o recusar por ter mudado, a carteira é relida e a tela já mostra o preço novo). A vitrine é relida quando o dia
 * dela acaba. O código secreto da carteira nunca chega aqui.
 */
export function criarLoja(pai: HTMLElement, carteira: CarteiraDoAparelho): Loja {
  const raiz = el('div', 'loja');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-labelledby', 'loja-titulo');
  const caixa = el('div', 'loja-caixa');

  const topo = el('div', 'loja-topo');
  const titulo = el('h2', 'loja-titulo', 'Loja');
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

  // O que passa de 720 px de altura rola aqui dentro: o topo, os avisos e o status ficam à vista.
  const rolagem = el('div', 'loja-rolagem');
  const vitrineEl = el('section', 'loja-vitrine');
  vitrineEl.hidden = true;
  const vitrineTopo = el('div', 'loja-vitrine-topo');
  const vitrineGrade = el('ul', 'loja-grade loja-grade-vitrine');
  vitrineEl.append(vitrineTopo, vitrineGrade);
  const faixas = el('div', 'loja-faixas');
  const balaoEl = el('section', 'loja-balao');
  balaoEl.id = 'loja-balao';
  const balaoCategorias = el('div', 'loja-balao-categorias');
  const balaoDica = el('p', 'loja-balao-dica', 'Compre aqui e equipe em Perfil, Meu balão.');
  balaoEl.append(el('h3', 'loja-faixa-titulo loja-balao-titulo', 'Balão'), balaoDica, balaoCategorias);
  rolagem.append(vitrineEl, faixas, balaoEl);
  caixa.append(topo, aviso, fora, status, rolagem);
  raiz.append(caixa);
  pai.append(raiz);

  let aberta = false;
  let ocupada = false;
  let focoAnterior: HTMLElement | null = null;
  let desassinar: (() => void) | null = null;
  let temporizadorDaVirada: number | null = null;
  /** O `fimMs` da vitrine para o qual já se releu: se ela continua a mesma (relógio do aparelho adiantado), a próxima leitura espera mais. */
  let viradaRelida: number | null = null;
  const miniaturas = new Map<string, HTMLCanvasElement>();

  /** A miniatura do taco: o desenho de fábrica, ou o do meu taco (com a semente) se já o tenho; a arte pintada entra quando chega. */
  const canvasDa = (c: CartaoDeSkin, lugar: 'vitrine' | 'faixa'): HTMLCanvasElement => {
    const chave = `${lugar}|${c.skin}|${c.semente ?? ''}`;
    let canvas = miniaturas.get(chave);
    if (!canvas) {
      canvas = criarCanvasDaMiniatura(aparenciaDoTaco(c.skin, c.semente), MINIATURA.largura, MINIATURA.altura, 'loja-miniatura');
      miniaturas.set(chave, canvas);
    }
    return canvas;
  };

  const cartao = (c: CartaoDeSkin, lugar: 'vitrine' | 'faixa'): HTMLElement => {
    const item = el('li', `loja-cartao ${c.situacao}${c.rara !== null ? ' rara' : ''}`);
    item.dataset.skin = c.skin;
    item.dataset.faixa = c.faixa;
    item.style.setProperty('--faixa', c.corDaFaixa);
    const nomeLinha = el('div', 'loja-nome-linha');
    nomeLinha.append(el('span', 'loja-nome', c.nome));
    if (c.selo !== null) nomeLinha.append(el('span', `loja-selo ${c.situacao}`, c.selo));
    const etiquetas = el('div', 'loja-etiquetas');
    etiquetas.append(el('span', 'loja-faixa-etiqueta', c.nomeDaFaixa));
    if (c.textoDoDesconto !== null) etiquetas.append(el('span', 'loja-desconto', c.textoDoDesconto));
    const precoLinha = el('div', 'loja-preco-linha');
    if (c.textoDoPrecoRiscado !== null) precoLinha.append(el('s', 'loja-preco-riscado', c.textoDoPrecoRiscado));
    precoLinha.append(el('span', 'loja-preco', c.textoDoPreco));
    const rodape = el('div', 'loja-cartao-rodape');
    rodape.append(el('span', 'loja-faltam', c.textoFaltam ?? ''));
    if (c.acao !== null) {
      const botao = el('button', `loja-botao ${c.acao === 'comprar' ? 'principal' : ''}`.trim(), c.acao === 'comprar' ? 'Comprar' : 'Usar');
      botao.type = 'button';
      botao.disabled = !c.podeAgir || ocupada;
      botao.dataset.acao = c.acao;
      botao.setAttribute('aria-label', `${c.acao === 'comprar' ? 'Comprar' : 'Usar'} o taco ${c.nome}${c.acao === 'comprar' ? ` por ${c.textoDoPreco}` : ''}${c.textoFaltam ? `. ${c.textoFaltam}` : ''}`);
      botao.addEventListener('click', () => void executar(c));
      rodape.append(botao);
    }
    item.append(canvasDa(c, lugar), nomeLinha, etiquetas);
    // O taco que já tenho não mostra o preço: o cartão fala do meu taco.
    if (c.situacao === 'a-venda') item.append(precoLinha);
    if (c.textoDaSemente !== null) {
      // O taco que já tenho: a semente dele, o selo se ela é rara e as bolas que ele já matou (os quatro dígitos do contador).
      const meu = el('div', 'loja-meu-taco');
      meu.append(el('span', 'loja-semente', c.textoDaSemente));
      if (c.rara !== null) {
        const raro = el('span', 'loja-selo-raro', c.rara.selo);
        raro.title = c.rara.nome;
        meu.append(raro);
        // O selo já diz o nome quando é o mesmo ("BLUE GEM" / "Blue Gem"); nos nomes mais longos ("Veio de ouro") o nome vem ao lado.
        if (c.rara.nome.toUpperCase() !== c.rara.selo) meu.append(el('span', 'loja-rara-nome', c.rara.nome));
      } else if (c.fase !== null) {
        meu.append(el('span', 'loja-fase', c.fase));
      }
      if (c.textoDasBolas !== null) {
        const contador = el('span', 'loja-contador', c.textoDasBolas);
        contador.title = 'Bolas matadas com este taco';
        contador.setAttribute('aria-label', `${c.bolas} bolas matadas com este taco`);
        meu.append(contador);
      }
      item.append(meu);
    }
    // Sem botão nem aviso de saldo (o taco em uso), não sobra rodapé vazio.
    if (c.acao !== null || c.textoFaltam !== null) item.append(rodape);
    return item;
  };

  const faixaEl = (g: GrupoDaFaixa): HTMLElement => {
    const secao = el('section', 'loja-faixa');
    secao.style.setProperty('--faixa', g.cor);
    secao.dataset.faixa = g.faixa;
    const grade = el('ul', 'loja-grade');
    grade.append(...g.cartoes.map((c) => cartao(c, 'faixa')));
    secao.append(el('h3', 'loja-faixa-titulo', g.nome), grade);
    return secao;
  };

  const cartaoDoItem = (c: CartaoDeItem): HTMLElement => {
    const item = el('li', `loja-item ${c.situacao}`);
    item.dataset.item = c.id;
    const icone = el('img', 'loja-item-icone');
    icone.src = c.icone;
    icone.alt = '';
    icone.width = 56;
    icone.height = 56;
    icone.loading = 'lazy';
    const nomeLinha = el('div', 'loja-nome-linha');
    nomeLinha.append(el('span', 'loja-nome', c.nome));
    if (c.selo !== null) nomeLinha.append(el('span', `loja-selo ${c.situacao === 'equipado' ? 'em-uso' : 'sua'}`, c.selo));
    item.append(icone, nomeLinha);
    if (c.situacao === 'a-venda') item.append(el('span', 'loja-preco', c.textoDoPreco));
    else if (c.preco === 0) item.append(el('span', 'loja-preco', c.textoDoPreco));
    if (c.textoFaltam !== null) item.append(el('span', 'loja-faltam', c.textoFaltam));
    if (c.acao !== null) {
      const botao = el('button', 'loja-botao principal', 'Comprar');
      botao.type = 'button';
      botao.disabled = !c.podeAgir || ocupada;
      botao.dataset.acao = 'comprar';
      botao.setAttribute('aria-label', `Comprar ${c.nome} por ${c.textoDoPreco}${c.textoFaltam ? `. ${c.textoFaltam}` : ''}`);
      botao.addEventListener('click', () => void trabalhar(() => carteira.comprarItemDoBalao(c.id, c.preco), `Você comprou ${c.nome}. Equipe em Perfil, Meu balão.`));
      item.append(botao);
    }
    return item;
  };

  const desenharBalao = (): void => {
    const b = balaoNaLoja(carteira.estado());
    balaoEl.classList.toggle('indisponivel', !b.disponivel);
    balaoCategorias.replaceChildren(
      ...b.categorias.map((cat) => {
        const secao = el('div', 'loja-balao-categoria');
        secao.dataset.categoria = cat.id;
        const grade = el('ul', 'loja-grade-balao');
        grade.append(...cat.cartoes.map(cartaoDoItem));
        secao.append(el('h4', 'loja-balao-categoria-titulo', cat.titulo), grade);
        return secao;
      }),
    );
  };

  const desenharVitrine = (v: VitrineNaTela | null): void => {
    vitrineEl.hidden = v === null;
    if (v === null) return;
    const titulo2 = el('h3', 'loja-vitrine-titulo', 'Vitrine do dia');
    vitrineTopo.replaceChildren(titulo2, el('span', 'loja-vitrine-desconto', v.textoDoDesconto), el('span', 'loja-vitrine-restante', v.restante));
    vitrineGrade.replaceChildren(...v.cartoes.map((c) => cartao(c, 'vitrine')));
  };

  /** Relê a carteira (e com ela a vitrine) quando o dia da vitrine acaba: o preço e as skins de hoje mudam sem fechar a loja. */
  const agendarVirada = (): void => {
    if (temporizadorDaVirada !== null) window.clearTimeout(temporizadorDaVirada);
    temporizadorDaVirada = null;
    if (!aberta) return;
    const espera = msAteAViradaDaVitrine(carteira.estado(), Date.now());
    const fim = carteira.estado()?.vitrine?.fimMs;
    if (espera === null || fim === undefined) return;
    // Já relido para este fim e a vitrine é a mesma: o relógio daqui está adiantado; não martela a sala.
    const atraso = Math.min(viradaRelida === fim ? Math.max(espera, 5000) : espera, 2_000_000_000);
    temporizadorDaVirada = window.setTimeout(() => {
      temporizadorDaVirada = null;
      viradaRelida = fim;
      void carteira.garantir().then((r) => aberta && tratar(r, ''));
    }, atraso);
  };

  const desenhar = (): void => {
    const loja = lojaNaTela(carteira.estado(), Date.now());
    saldo.replaceChildren(el('span', 'loja-saldo-rotulo', 'Saldo'), el('span', `loja-saldo-valor${loja.saldoNegativo ? ' negativo' : ''}`, loja.textoSaldo));
    const avisoDaCarteira = carteira.aviso();
    aviso.hidden = avisoDaCarteira === null;
    avisoTexto.textContent = avisoDaCarteira ?? '';
    // O aviso de "fora do ar" só aparece depois de uma resposta ruim: a vitrine fica sem ele enquanto a primeira leitura não volta.
    fora.hidden = foraTexto.textContent === '';
    caixa.classList.toggle('fora-do-ar', !loja.disponivel);
    desenharVitrine(loja.vitrine);
    faixas.replaceChildren(...loja.grupos.map(faixaEl));
    desenharBalao();
    for (const b of caixa.querySelectorAll<HTMLButtonElement>('.loja-botao')) if (ocupada && b.dataset.acao !== undefined) b.disabled = true;
    tentar.disabled = ocupada;
    agendarVirada();
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
    // A compra manda o preço que a tela mostra (o da vitrine de hoje, se a skin está nela): a sala só o usa como teto.
    c.acao === 'comprar' ? trabalhar(() => carteira.comprar(c.skin, c.preco), `Você comprou o taco ${c.nome}.`) : trabalhar(() => carteira.usar(c.skin), `Taco ${c.nome} em uso.`);

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
  /** Rola até o item do balão e o destaca por um instante. */
  const irAoItem = (id: IdItemDoBalao): void => {
    const alvo = balaoCategorias.querySelector<HTMLElement>(`[data-item="${id}"]`);
    if (alvo === null) return;
    alvo.scrollIntoView({ block: 'center' });
    alvo.classList.add('destaque');
    window.setTimeout(() => alvo.classList.remove('destaque'), 1800);
  };
  fechar.addEventListener('click', () => loja.fechar());
  raiz.addEventListener('mousedown', aoClicarFora);

  const loja: Loja = {
    get aberta() {
      return aberta;
    },

    abrir(item) {
      if (aberta) {
        if (item !== undefined) irAoItem(item);
        return;
      }
      aberta = true;
      focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dizer('', false);
      desenhar();
      raiz.hidden = false;
      document.addEventListener('keydown', aoTeclar, true);
      desassinar = carteira.aoMudar(() => aberta && desenhar());
      fechar.focus();
      if (item !== undefined) irAoItem(item);
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
      if (temporizadorDaVirada !== null) window.clearTimeout(temporizadorDaVirada);
      temporizadorDaVirada = null;
      focoAnterior?.focus();
      focoAnterior = null;
    },

    texto() {
      if (!aberta) return '';
      const limpo = (e: Element | null): string => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const vitrine = vitrineEl.hidden ? [] : [`Vitrine: ${limpo(vitrineTopo)}`, ...[...vitrineGrade.querySelectorAll('.loja-cartao')].map(limpo)];
      const porFaixa = [...faixas.querySelectorAll('.loja-faixa')].flatMap((f) => [`Faixa ${limpo(f.querySelector('.loja-faixa-titulo'))}`, ...[...f.querySelectorAll('.loja-cartao')].map(limpo)]);
      const balao = [...balaoCategorias.querySelectorAll('.loja-balao-categoria')].flatMap((c) => [`Balão ${limpo(c.querySelector('.loja-balao-categoria-titulo'))}`, ...[...c.querySelectorAll('.loja-item')].map(limpo)]);
      return [`Saldo ${saldo.textContent ?? ''}`, avisoTexto.textContent ?? '', foraTexto.textContent ?? '', status.textContent ?? '', ...vitrine, ...porFaixa, ...balao].filter(Boolean).join(' | ');
    },

    dispose() {
      loja.fechar();
      raiz.remove();
    },
  };
  return loja;
}
