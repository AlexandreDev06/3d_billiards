import { APOSTAS_DA_SALA, type ForcaSala, type GizSala } from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import { CATALOGO, type Catalogo, type ModalidadeDoCatalogo } from '../lobby/catalogo';
import {
  CONTROLES_DO_GIZ,
  FORCAS_NA_TELA,
  ROTULO_FORCA,
  aplicarMudanca,
  passoDoGiz,
  porcento,
  resumoDasRegras,
  segundos,
  type MudancaDeRegras,
  type RegrasDaSala,
} from '../lobby/regras-da-sala';
import { linhaDe, type LinhaDaPartida } from '../previsao/regra-da-linha';
import { TEMPOS_DO_SELETOR, type TempoDaTacadaS } from '../relogio/modelo';

/** O que cada controle de força quer dizer, na dica do botão. */
const DICA_DA_FORCA: Readonly<Record<ForcaSala, string>> = {
  linha: 'Segure o botão, puxe o mouse para trás até a linha marcar a força e solte para tacar.',
  empurrar: 'Puxe o mouse para trás e empurre para a frente: a força é a velocidade do empurrão.',
};

export interface OpcoesDasRegras {
  /** O que está valendo agora (a sala, o que o navegador lembrou ou o padrão). */
  readonly regras: RegrasDaSala;
  /** Os cartões e formatos, já com o que as regras sabem jogar. */
  readonly catalogo: readonly ModalidadeDoCatalogo[];
  /** O catálogo bruto, para a troca de modalidade levar ao formato certo. */
  readonly base?: Catalogo;
  /** Está valendo para quem já está numa sala (a dica diz isso) ou só para esta tela. */
  readonly naSala: boolean;
  /**
   * `true`: a tela já mostra a escolha na hora (criar sala, mesmo PC). `false`: a escolha só vale quando a sala a confirma
   * (a espera): quem chama redesenha com o `estado-sala` que voltar.
   */
  readonly otimista: boolean;
  /** Uma escolha foi feita: o que mudou e como ficam as regras com ela. */
  readonly aoMudar: (mudanca: MudancaDeRegras, regras: RegrasDaSala) => void;
  /** Texto extra por baixo do formato (no mesmo PC, quem joga contra quem). */
  readonly dicaDoFormato?: (regras: RegrasDaSala) => string;
  /** Mostra a aposta (L24)? Só online: no mesmo PC não há carteira. Padrão: sim. */
  readonly comAposta?: boolean;
  /** O formato e a modalidade se podem escolher? `false` mostra só o resumo. */
  readonly editavel: boolean;
  /** Pergunta ao catálogo o que as regras jogam (para a troca de modalidade pular o que não dá). */
  readonly disponivel: (modalidade: Modalidade, modo: RegrasDaSala['modo']) => boolean;
}

export interface RegrasDaSalaDom {
  readonly raiz: HTMLElement;
  /** O que a tela mostra agora. */
  regras(): RegrasDaSala;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Um grupo com título e controles; o título dá o nome ao grupo (sem `<label>`, que daria o texto ao primeiro botão). */
function grupo(id: string, rotulo: string, conteudo: HTMLElement, classe = ''): HTMLElement {
  const g = el('div', `menu-campo ${classe}`.trim());
  const titulo = el('span', 'menu-campo-rotulo', rotulo);
  titulo.id = id;
  conteudo.setAttribute('aria-labelledby', id);
  g.append(titulo, conteudo);
  return g;
}

let contador = 0;

/**
 * As regras da sala (lobby): modalidade em cartões, o formato que o catálogo dá, o tempo por tacada, a linha de previsão,
 * o giz e o controle de força. Serve a criar sala, à espera do anfitrião e a "Jogar no mesmo PC"; sem `editavel` (quem não é
 * o anfitrião) mostra só o resumo. Só DOM: as decisões vêm de `lobby/`.
 */
export function criarRegrasDaSala(opcoes: OpcoesDasRegras): RegrasDaSalaDom {
  const base = opcoes.base ?? CATALOGO;
  const prefixo = `regras-${++contador}`;
  const raiz = el('div', 'regras-sala');
  let atual = opcoes.regras;

  const mudar = (mudanca: MudancaDeRegras): void => {
    const novas = aplicarMudanca(atual, mudanca, base, opcoes.disponivel);
    // Na espera quem manda é a sala: manda-se só o que mudou (a sala escolhe o formato ao trocar a modalidade) e a tela espera.
    if (opcoes.otimista) {
      atual = novas;
      desenhar();
    }
    opcoes.aoMudar(mudanca, novas);
  };

  /** Foco que sobrevive ao redesenho: o botão apertado continua em foco para o teclado seguir de onde estava. */
  const desenhar = (): void => {
    const foco = raiz.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.foco : undefined;
    raiz.replaceChildren(...(opcoes.editavel ? controles() : resumo()));
    if (foco !== undefined) raiz.querySelector<HTMLElement>(`[data-foco="${foco}"]`)?.focus();
  };

  const resumo = (): HTMLElement[] => {
    const cartao = opcoes.catalogo.find((c) => c.modalidade === atual.modalidade);
    const formato = cartao?.formatos.find((f) => f.modo === atual.modo);
    const bloco = el('div', 'menu-campo menu-regras-resumo-bloco');
    const titulo = el('div', 'menu-regras-resumo-modo');
    titulo.append(el('strong', '', cartao?.nome ?? atual.modalidade), ` · ${formato?.rotulo ?? atual.modo}`);
    const itens = el('ul', 'menu-regras-resumo-lista');
    for (const texto of resumoDasRegras(atual)) itens.append(el('li', '', texto));
    bloco.append(el('div', 'menu-campo-rotulo', 'Regras da sala'), titulo, itens);
    return [bloco];
  };

  const botao = (classe: string, chave: string, marcado: boolean, ...filhos: (HTMLElement | string)[]): HTMLButtonElement => {
    const b = el('button', classe);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(marcado));
    b.classList.toggle('marcado', marcado);
    b.dataset.foco = chave;
    b.append(...filhos);
    return b;
  };

  const modalidades = (): HTMLElement => {
    const lista = el('div', 'menu-modalidades');
    lista.setAttribute('role', 'radiogroup');
    for (const cartao of opcoes.catalogo) {
      const marcado = cartao.modalidade === atual.modalidade;
      const b = botao('menu-modalidade', `modalidade-${cartao.modalidade}`, marcado, el('span', 'menu-modalidade-nome', cartao.nome), el('span', 'menu-modalidade-descricao', cartao.descricao));
      b.dataset.modalidade = cartao.modalidade;
      b.disabled = !cartao.disponivel;
      b.addEventListener('click', () => {
        if (!marcado) mudar({ modalidade: cartao.modalidade });
      });
      lista.append(b);
    }
    return grupo(`${prefixo}-modalidade`, 'Modalidade', lista, 'regras-modalidade');
  };

  const formatos = (): HTMLElement => {
    const cartao = opcoes.catalogo.find((c) => c.modalidade === atual.modalidade);
    const lista = el('div', (cartao?.formatos.length ?? 0) > 2 ? 'menu-modos tres' : 'menu-modos');
    lista.setAttribute('role', 'radiogroup');
    for (const formato of cartao?.formatos ?? []) {
      const b = botao('menu-modo', `formato-${formato.modo}`, formato.modo === atual.modo, el('span', 'menu-modo-nome', formato.rotulo), el('span', 'menu-modo-detalhe', formato.disponivel ? formato.detalhe : `${formato.detalhe} (em breve)`));
      b.dataset.modo = formato.modo;
      b.disabled = !formato.disponivel;
      b.addEventListener('click', () => mudar({ modo: formato.modo }));
      lista.append(b);
    }
    const g = grupo(`${prefixo}-formato`, 'Formato', lista, 'regras-formato');
    const dica = opcoes.dicaDoFormato?.(atual);
    if (dica) g.append(el('div', 'menu-dica', dica));
    return g;
  };

  const tempos = (): HTMLElement => {
    const lista = el('div', 'menu-tempos');
    lista.setAttribute('role', 'radiogroup');
    for (const tempoS of TEMPOS_DO_SELETOR) {
      const b = botao('menu-tempo', `tempo-${tempoS ?? 'sem'}`, tempoS === atual.tempoS, el('span', 'menu-tempo-valor', tempoS === null ? '∞' : String(tempoS)), el('span', 'menu-tempo-unidade', tempoS === null ? 'sem limite' : 'segundos'));
      b.addEventListener('click', () => mudar({ tempoS: tempoS as TempoDaTacadaS }));
      lista.append(b);
    }
    const g = grupo(`${prefixo}-tempo`, 'Tempo por tacada', lista, 'regras-tempo');
    g.title = 'Passou do tempo, perde a vez (sem falta).';
    return g;
  };

  const linha = (): HTMLElement => {
    const botoes = el('div', 'menu-modos');
    botoes.setAttribute('role', 'radiogroup');
    for (const [ligada, nome] of [
      [false, 'Desligada'],
      [true, 'Ligada'],
    ] as const) {
      const b = botao('menu-modo', `linha-${ligada ? 'ligada' : 'desligada'}`, ligada === atual.linha.previsao, el('span', 'menu-modo-nome', nome));
      b.addEventListener('click', () => mudar({ linha: linhaDe(ligada, atual.linha.bolaAtingida) }));
      botoes.append(b);
    }
    const caixa = el('input', 'menu-caixa-marcar');
    caixa.type = 'checkbox';
    caixa.name = 'linha-bola-atingida';
    caixa.dataset.foco = 'linha-bola-atingida';
    caixa.disabled = !atual.linha.previsao;
    caixa.checked = atual.linha.bolaAtingida;
    caixa.addEventListener('change', () => mudar({ linha: linhaDe(atual.linha.previsao, caixa.checked) as LinhaDaPartida }));
    const rotuloDaCaixa = el('label', 'menu-marcar');
    rotuloDaCaixa.classList.toggle('desabilitado', !atual.linha.previsao);
    rotuloDaCaixa.append(caixa, el('span', '', 'Bola atingida'));
    rotuloDaCaixa.title = 'Mostra também a primeira bola atingida e para onde ela segue';
    const g = grupo(`${prefixo}-linha`, 'Linha de previsão', botoes, 'regras-linha');
    // a opção "bola atingida" mora na linha do título do grupo: uma linha a menos na sala de espera de quatro
    g.insertBefore(rotuloDaCaixa, botoes);
    g.title = opcoes.naSala ? 'Vale para todos na sala, como o tempo. O anfitrião muda na sala de espera.' : 'Vale para todos os jogadores da mesa.';
    return g;
  };

  /** Um número do giz com os botões de menos e mais. */
  const passo = (campo: keyof GizSala, nome: string, texto: (valor: number) => string): HTMLElement => {
    const faixa = campo === 'passadaS' ? CONTROLES_DO_GIZ.passadaS : campo === 'passada' ? CONTROLES_DO_GIZ.passada : CONTROLES_DO_GIZ.desgaste;
    const valor = atual.giz[campo];
    const caixa = el('span', 'menu-passo');
    caixa.setAttribute('role', 'group');
    caixa.setAttribute('aria-label', nome);
    const menos = el('button', 'menu-passo-botao', '−');
    menos.type = 'button';
    menos.dataset.foco = `giz-${campo}-menos`;
    menos.setAttribute('aria-label', `Diminuir ${nome.toLowerCase()}`);
    menos.disabled = valor <= faixa.min;
    menos.addEventListener('click', () => mudar({ giz: passoDoGiz(atual.giz, campo, -1) }));
    const mais = el('button', 'menu-passo-botao', '+');
    mais.type = 'button';
    mais.dataset.foco = `giz-${campo}-mais`;
    mais.setAttribute('aria-label', `Aumentar ${nome.toLowerCase()}`);
    mais.disabled = valor >= faixa.max;
    mais.addEventListener('click', () => mudar({ giz: passoDoGiz(atual.giz, campo, 1) }));
    const numero = el('output', 'menu-passo-valor', texto(valor));
    numero.dataset.campo = campo;
    caixa.append(menos, numero, mais);
    return caixa;
  };

  const giz = (): HTMLElement => {
    const corpo = el('div', 'menu-giz');
    const gasto = el('div', 'menu-giz-linha');
    gasto.append(el('span', 'menu-giz-rotulo', 'Gasto'), passo('desgasteMin', 'Gasto mínimo por tacada', porcento), el('span', 'menu-giz-ligacao', 'a'), passo('desgasteMax', 'Gasto máximo por tacada', porcento));
    const passada = el('div', 'menu-giz-linha');
    passada.append(el('span', 'menu-giz-rotulo', 'Passada'), passo('passada', 'Quanto cada passada soma', porcento), el('span', 'menu-giz-ligacao', 'em'), passo('passadaS', 'Duração da passada', segundos));
    corpo.append(gasto, passada);
    const g = grupo(`${prefixo}-giz`, 'Giz', corpo, 'regras-giz');
    g.title = 'Gasto: cada tacada gasta um tanto sorteado entre o mínimo e o máximo. Passada: cada passada de G devolve o tanto marcado, no tempo marcado.';
    return g;
  };

  const forca = (): HTMLElement => {
    const lista = el('div', 'menu-modos');
    lista.setAttribute('role', 'radiogroup');
    for (const controle of FORCAS_NA_TELA) {
      const b = botao('menu-modo', `forca-${controle}`, controle === atual.forca, el('span', 'menu-modo-nome', ROTULO_FORCA[controle]));
      b.title = DICA_DA_FORCA[controle];
      b.dataset.forca = controle;
      b.addEventListener('click', () => mudar({ forca: controle }));
      lista.append(b);
    }
    return grupo(`${prefixo}-forca`, 'Força da tacada', lista, 'regras-forca');
  };

  const apostas = (): HTMLElement => {
    const lista = el('div', 'menu-apostas');
    lista.setAttribute('role', 'radiogroup');
    for (const valor of APOSTAS_DA_SALA) {
      const b = botao('menu-tempo', `aposta-${valor}`, valor === atual.aposta, el('span', 'menu-tempo-valor', String(valor)));
      b.dataset.aposta = String(valor);
      b.setAttribute('aria-label', `${valor} moedas`);
      b.addEventListener('click', () => mudar({ aposta: valor }));
      lista.append(b);
    }
    const g = grupo(`${prefixo}-aposta`, 'Aposta (moedas)', lista, 'regras-aposta');
    g.title = 'Cada jogador com carteira põe esse tanto na partida; quem ganha divide o pote. Quem não tem carteira não aposta.';
    return g;
  };

  const controles = (): HTMLElement[] => [modalidades(), formatos(), tempos(), linha(), forca(), ...(opcoes.comAposta === false ? [] : [apostas()]), giz()];

  desenhar();
  return { raiz, regras: () => atual };
}
