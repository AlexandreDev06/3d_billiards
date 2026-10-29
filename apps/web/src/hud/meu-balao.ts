import { APARENCIA_PADRAO, itemDoBalao, type AparenciaDoBalao, type IdItemDoBalao } from '@sinuca/protocolo';
import type { PreviaDoBalao } from '../cena/previa-do-balao';
import { CATEGORIAS_DO_BALAO, editorDoBalao, escolherNoRascunho, type CategoriaDoBalao, type OpcaoDoEditor } from '../online/balao-modelo';
import type { CarteiraDoAparelho, ResultadoDaCarteira } from '../online/carteira';
import { textoDeMoedas } from '../online/moedas';
import { REACOES_DA_PREVIA, REACAO_PADRAO_DA_PREVIA } from '../online/previa-modelo';

export interface OpcoesDoMeuBalao {
  /** A prévia 3D, quando o balão do artista já carregou; `null` enquanto o arquivo chega (o editor tenta de novo). */
  readonly previa: () => PreviaDoBalao | null;
  /** As cores das equipes para testar a prévia (a cor no jogo continua a da equipe). */
  readonly cores: readonly number[];
  /** O item que falta foi escolhido: o jogo abre a loja nele. O editor já fechou. */
  readonly aoVerNaLoja: (item: IdItemDoBalao) => void;
  /** O editor fechou (Esc, ×, Voltar): o perfil volta. Não roda ao ir para a loja. */
  readonly aoVoltar: () => void;
  /** O editor abriu ou fechou: o jogo pausa o 3D por baixo enquanto ele está aberto. */
  readonly aoMudarDeEstado?: (aberto: boolean) => void;
}

export interface MeuBalao {
  readonly aberto: boolean;
  abrir(): void;
  fechar(): void;
  /** O rascunho de agora (o que a prévia veste). */
  rascunho(): AparenciaDoBalao;
  /** O que o editor mostra agora, em texto, para o gancho de teste. Nunca leva o código da carteira. */
  texto(): string;
  /** A prévia de agora (gancho de teste), se já existe. */
  previa(): PreviaDoBalao | null;
  /** Gancho de teste: o mesmo que clicar na opção. */
  escolher(categoria: CategoriaDoBalao, id: string | null): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

const hex = (cor: number): string => `#${cor.toString(16).padStart(6, '0')}`;
/** De quanto em quanto tempo o editor tenta de novo a prévia enquanto o `balao.glb` não chegou (ms). */
const TENTAR_PREVIA_MS = 250;

/**
 * O editor "Meu balão" (L48), aberto do Perfil: a prévia 3D do balão (gira arrastando, faz as caras e as ações do jogo, olha o ponteiro,
 * na cor de uma das equipes) e, ao lado, as quatro categorias (chapéu, bigode, estilo e cor dos olhos). Só se escolhe o que a carteira
 * tem (os grátis todo mundo tem); o item que falta mostra o preço e leva à loja. "Equipar" manda o rascunho à sala
 * (`POST /carteira/balao/equipar`), que é quem confere de verdade. Só DOM: o que cada opção diz vem de `editorDoBalao`.
 */
export function criarMeuBalao(pai: HTMLElement, carteira: CarteiraDoAparelho, opcoes: OpcoesDoMeuBalao): MeuBalao {
  const raiz = el('div', 'meu-balao');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-labelledby', 'meu-balao-titulo');
  const caixa = el('div', 'meu-balao-caixa');

  const topo = el('div', 'meu-balao-topo');
  const titulo = el('h2', 'meu-balao-titulo', 'Meu balão');
  titulo.id = 'meu-balao-titulo';
  const fechar = el('button', 'meu-balao-fechar', '×');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Voltar ao perfil');
  topo.append(titulo, fechar);

  const fora = el('div', 'meu-balao-fora');
  fora.hidden = true;
  fora.setAttribute('role', 'alert');

  const corpo = el('div', 'meu-balao-corpo');

  // A coluna da prévia.
  const colunaPrevia = el('section', 'meu-balao-previa');
  colunaPrevia.setAttribute('aria-label', 'Prévia do balão');
  const palco = el('div', 'meu-balao-palco');
  const carregando = el('p', 'meu-balao-carregando', 'Carregando o balão…');
  palco.append(carregando);
  const dicaDoGiro = el('p', 'meu-balao-dica', 'Arraste para girar. Os olhos seguem o mouse.');
  const grupoCores = el('div', 'meu-balao-cores');
  grupoCores.setAttribute('role', 'group');
  grupoCores.setAttribute('aria-label', 'Cor do balão na prévia (no jogo a cor é a da sua equipe)');
  const botoesDeCor = opcoes.cores.map((cor, i) => {
    const b = el('button', 'meu-balao-cor');
    b.type = 'button';
    b.style.setProperty('--cor', hex(cor));
    b.setAttribute('aria-label', `Prévia na cor da equipe ${i + 1}`);
    b.setAttribute('aria-pressed', 'false');
    b.dataset.cor = String(i);
    b.addEventListener('click', () => escolherCor(i));
    grupoCores.append(b);
    return b;
  });
  const reacoes = el('div', 'meu-balao-reacoes');
  const botoesDeReacao = REACOES_DA_PREVIA.map((r) => {
    const b = el('button', `meu-balao-reacao ${r.grupo}`, r.rotulo);
    b.type = 'button';
    b.dataset.reacao = r.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => escolherReacao(r.id));
    reacoes.append(b);
    return b;
  });
  colunaPrevia.append(palco, dicaDoGiro, grupoCores, reacoes);

  // A coluna das categorias.
  const colunaItens = el('section', 'meu-balao-itens');
  colunaItens.setAttribute('aria-label', 'Itens do balão');
  const categorias = el('div', 'meu-balao-categorias');
  colunaItens.append(categorias);

  corpo.append(colunaPrevia, colunaItens);

  const rodape = el('div', 'meu-balao-rodape');
  const status = el('div', 'meu-balao-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const voltar = el('button', 'menu-botao meu-balao-botao', 'Voltar');
  voltar.type = 'button';
  const equipar = el('button', 'menu-botao meu-balao-botao principal', 'Equipar');
  equipar.type = 'button';
  rodape.append(status, voltar, equipar);

  caixa.append(topo, fora, corpo, rodape);
  raiz.append(caixa);
  pai.append(raiz);

  let aberto = false;
  let ocupado = false;
  let focoAnterior: HTMLElement | null = null;
  let desassinar: (() => void) | null = null;
  let previa: PreviaDoBalao | null = null;
  let temporizadorDaPrevia: number | null = null;
  let rascunho: AparenciaDoBalao = APARENCIA_PADRAO;
  let reacaoAtual = REACAO_PADRAO_DA_PREVIA;
  let corAtual = 0;
  /** O rascunho com que o editor abriu: se ainda é ele quando a carteira volta da sala, o balão guardado lá o substitui. */
  let rascunhoDeAbertura: AparenciaDoBalao = APARENCIA_PADRAO;

  const dizer = (texto: string, erro: boolean): void => {
    status.textContent = texto;
    status.classList.toggle('erro', erro);
    status.setAttribute('role', erro ? 'alert' : 'status');
  };

  const marcar = (): void => {
    for (const b of botoesDeCor) b.setAttribute('aria-pressed', String(b.dataset.cor === String(corAtual)));
    for (const b of botoesDeReacao) b.setAttribute('aria-pressed', String(b.dataset.reacao === reacaoAtual));
  };

  const textoDaOpcao = (o: OpcaoDoEditor): string => (o.situacao === 'bloqueado' ? `${o.textoDoPreco ?? ''} Ver na loja` : o.situacao === 'seu' ? 'Seu' : (o.textoDoPreco ?? ''));

  const opcaoEl = (categoria: CategoriaDoBalao, o: OpcaoDoEditor): HTMLElement => {
    const b = el('button', `meu-balao-opcao ${o.situacao}${o.selecionada ? ' escolhida' : ''}`);
    b.type = 'button';
    b.dataset.categoria = categoria;
    b.dataset.item = o.id ?? 'nenhum';
    b.setAttribute('aria-pressed', String(o.selecionada));
    if (o.icone !== null) {
      const img = el('img', 'meu-balao-opcao-icone');
      img.src = o.icone;
      img.alt = '';
      img.width = 48;
      img.height = 48;
      img.loading = 'lazy';
      b.append(img);
    } else b.append(el('span', 'meu-balao-opcao-nenhum', '∅'));
    b.append(el('span', 'meu-balao-opcao-nome', o.nome));
    const detalhe = textoDaOpcao(o);
    if (detalhe !== '') b.append(el('span', 'meu-balao-opcao-detalhe', detalhe));
    b.setAttribute('aria-label', o.situacao === 'bloqueado' ? `${o.nome}, falta comprar por ${textoDeMoedas(o.preco)}. Abrir na loja` : `${o.nome}${o.selecionada ? ', escolhido' : ''}`);
    b.addEventListener('click', () => escolher(categoria, o.id));
    return b;
  };

  const desenhar = (): void => {
    const ed = editorDoBalao(carteira.estado(), rascunho);
    caixa.classList.toggle('indisponivel', !ed.disponivel);
    categorias.replaceChildren(
      ...ed.categorias.map((c) => {
        const secao = el('div', 'meu-balao-categoria');
        secao.dataset.categoria = c.id;
        const lista = el('div', 'meu-balao-lista');
        lista.append(...c.opcoes.map((o) => opcaoEl(c.id, o)));
        secao.append(el('h3', 'meu-balao-categoria-titulo', c.titulo), lista);
        return secao;
      }),
    );
    equipar.disabled = !ed.podeEquipar || ocupado;
    equipar.title = !ed.disponivel ? 'A sala ainda não mandou o seu balão' : !ed.mudou ? 'Já é o seu balão' : '';
    voltar.disabled = ocupado;
    marcar();
  };

  const aplicarNaPrevia = (): void => {
    if (previa === null) return;
    previa.definirAparencia(rascunho);
    previa.definirCor(opcoes.cores[corAtual] ?? 0xffffff);
    previa.definirReacao(reacaoAtual);
  };

  function escolher(categoria: CategoriaDoBalao, id: string | null): void {
    if (ocupado) return;
    const itens = carteira.estado()?.balao?.itens ?? [];
    const novo = escolherNoRascunho(rascunho, categoria, id, itens);
    if (novo === rascunho) {
      // O item que falta (o botão dele mostra o preço): leva à loja, no item.
      const item = id === null ? undefined : CATEGORIAS_DO_BALAO.find((c) => c.id === categoria)?.ids.find((i) => i === id);
      if (item !== undefined && itemDoBalao(item).preco > 0 && !itens.includes(item)) irParaALoja(item);
      return;
    }
    rascunho = novo;
    dizer('', false);
    aplicarNaPrevia();
    desenhar();
  }

  function irParaALoja(item: IdItemDoBalao): void {
    fecharSemVoltar();
    opcoes.aoVerNaLoja(item);
  }

  function escolherCor(i: number): void {
    corAtual = i;
    previa?.definirCor(opcoes.cores[i] ?? 0xffffff);
    marcar();
  }

  function escolherReacao(id: string): void {
    reacaoAtual = id;
    previa?.definirReacao(id);
    marcar();
  }

  /** Cria a prévia assim que o balão do artista chega; até lá o palco diz que está carregando e o editor tenta de novo. */
  const prepararPrevia = (): void => {
    temporizadorDaPrevia = null;
    if (!aberto || previa !== null) return;
    let nova: PreviaDoBalao | null;
    try {
      nova = opcoes.previa();
    } catch (erro) {
      carregando.textContent = 'A prévia 3D não abriu neste navegador. Você ainda pode escolher e equipar.';
      console.warn(`Meu balão: a prévia não abriu (${erro instanceof Error ? erro.message : String(erro)})`);
      return;
    }
    if (nova === null) {
      temporizadorDaPrevia = window.setTimeout(prepararPrevia, TENTAR_PREVIA_MS);
      return;
    }
    previa = nova;
    carregando.hidden = true;
    palco.prepend(nova.elemento);
    aplicarNaPrevia();
    nova.iniciar();
  };

  const tratar = (r: ResultadoDaCarteira, sucesso: string): void => {
    if (r.ok) {
      fora.hidden = true;
      dizer(sucesso, false);
    } else if (r.erro === 'fora-do-ar') {
      fora.hidden = false;
      fora.textContent = r.mensagem;
      dizer('', false);
    } else dizer(r.mensagem, true);
    desenhar();
  };

  equipar.addEventListener('click', () => {
    if (ocupado || equipar.disabled) return;
    ocupado = true;
    raiz.setAttribute('aria-busy', 'true');
    desenhar();
    void carteira.equiparAparencia(rascunho).then((r) => {
      ocupado = false;
      raiz.removeAttribute('aria-busy');
      tratar(r, 'Balão equipado. É assim que os outros vão te ver.');
    });
  });

  const aoTeclar = (e: KeyboardEvent): void => {
    if (!aberto) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      meuBalao.fechar();
    } else if (e.key === 'Tab') prenderFoco(e);
  };
  const prenderFoco = (e: KeyboardEvent): void => {
    const alvos = [...raiz.querySelectorAll<HTMLElement>('button:not(:disabled)')].filter((a) => a.offsetParent !== null);
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
  fechar.addEventListener('click', () => meuBalao.fechar());
  voltar.addEventListener('click', () => meuBalao.fechar());
  raiz.addEventListener('mousedown', (e) => {
    if (e.target === raiz) meuBalao.fechar();
  });

  /** Desmonta a prévia (o contexto WebGL é caro e a tela fica fechada a maior parte do tempo). */
  function desmontar(): void {
    aberto = false;
    raiz.hidden = true;
    document.removeEventListener('keydown', aoTeclar, true);
    desassinar?.();
    desassinar = null;
    if (temporizadorDaPrevia !== null) window.clearTimeout(temporizadorDaPrevia);
    temporizadorDaPrevia = null;
    previa?.dispose();
    previa = null;
    carregando.hidden = false;
    carregando.textContent = 'Carregando o balão…';
    opcoes.aoMudarDeEstado?.(false);
  }

  function fecharSemVoltar(): void {
    if (!aberto) return;
    desmontar();
    focoAnterior = null;
  }

  const meuBalao: MeuBalao = {
    get aberto() {
      return aberto;
    },

    abrir() {
      if (aberto) return;
      aberto = true;
      ocupado = false;
      focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      rascunho = carteira.estado()?.balao?.aparencia ?? APARENCIA_PADRAO;
      rascunhoDeAbertura = rascunho;
      reacaoAtual = REACAO_PADRAO_DA_PREVIA;
      corAtual = 0;
      fora.hidden = true;
      dizer('', false);
      desenhar();
      raiz.hidden = false;
      opcoes.aoMudarDeEstado?.(true);
      document.addEventListener('keydown', aoTeclar, true);
      desassinar = carteira.aoMudar(() => aberto && desenhar());
      fechar.focus();
      prepararPrevia();
      // Põe a carteira em dia: o que se comprou na loja (ou em outra aba) aparece aqui.
      void carteira.garantir().then((r) => {
        if (!aberto) return;
        if (!r.ok && r.erro === 'fora-do-ar') tratar(r, '');
        else {
          // O balão que a sala guarda pode ser outro desde a última leitura: se o rascunho ainda é o de antes de mexer, acompanha.
          const guardado = carteira.estado()?.balao?.aparencia;
          if (guardado !== undefined && rascunho === rascunhoDeAbertura) rascunho = guardado;
          aplicarNaPrevia();
          desenhar();
        }
      });
    },

    fechar() {
      if (!aberto) return;
      desmontar();
      focoAnterior?.focus();
      focoAnterior = null;
      opcoes.aoVoltar();
    },

    rascunho: () => rascunho,

    previa: () => previa,

    escolher,

    texto() {
      if (!aberto) return '';
      const limpo = (e: Element | null): string => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const escolhidos = CATEGORIAS_DO_BALAO.map((c) => `${c.titulo}: ${limpo(categorias.querySelector(`[data-categoria="${c.id}"] .escolhida .meu-balao-opcao-nome`))}`);
      const bloqueados = [...categorias.querySelectorAll('.meu-balao-opcao.bloqueado')].map(limpo);
      return [...escolhidos, `Equipar ${equipar.disabled ? 'desligado' : 'ligado'}`, limpo(fora), limpo(status), ...(bloqueados.length > 0 ? [`Bloqueados: ${bloqueados.join(' / ')}`] : [])].filter(Boolean).join(' | ');
    },

    dispose() {
      if (aberto) desmontar();
      raiz.remove();
    },
  };
  return meuBalao;
}
