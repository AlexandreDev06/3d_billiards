import { teclaEmCampo } from '../controles/campo';
import { DESCRITORES, CONFIGURACOES_PADRAO, type ChaveDeConfiguracao, type DescritorDeConfiguracao } from '../configuracoes/modelo';
import type { EmojisEscolhidos } from '../configuracoes/emojis-escolhidos';
import type { GerenteDeConfiguracoes } from '../configuracoes/gerente';
import type { NivelDeQualidade, PreferenciaDeQualidade } from '../qualidade/perfis';
import { criarEscolhaDeEmojis } from './escolha-emojis';

/** O que o painel precisa saber e mandar do lado da qualidade gráfica (que é do computador, não do jogador). */
export interface LadoDaQualidade {
  /** O que está valendo agora e o que o jogador escolheu. */
  estado(): {
    readonly nivel: NivelDeQualidade;
    readonly rotuloDoNivel: string;
    readonly preferencia: PreferenciaDeQualidade;
    /** O renderizador é de software: o automático escolhe a baixa. */
    readonly software: boolean;
    /** Antialias e tamanho das texturas do nível de agora só valem depois de recarregar. */
    readonly pedeRecarregar: boolean;
  };
  escolher(preferencia: PreferenciaDeQualidade): void;
  /** Avisa quando o nível muda sozinho (queda automática) para o painel aberto se atualizar. */
  aoMudar(ouvinte: () => void): () => void;
  recarregar(): void;
}

export interface OpcoesPainelDeConfiguracoes {
  readonly gerente: GerenteDeConfiguracoes;
  readonly qualidade: LadoDaQualidade;
  /** Os oito emojis das teclas 1 a 8: são do aparelho (não do perfil), e a seção "Emojis" os escolhe. */
  readonly emojis: EmojisEscolhidos;
  /** O painel abriu: solte o mouse (Pointer Lock) para os controles poderem ser usados. */
  readonly aoAbrir: () => void;
}

export interface PainelDeConfiguracoes {
  readonly aberto: boolean;
  abrir(): void;
  fechar(): void;
  alternar(): void;
  dispose(): void;
}

const GRUPOS: readonly { readonly grupo: DescritorDeConfiguracao['grupo']; readonly titulo: string }[] = [
  { grupo: 'mira', titulo: 'Mira' },
  { grupo: 'forca', titulo: 'Força da tacada' },
  { grupo: 'camera', titulo: 'Câmera' },
];

const OPCOES_DE_QUALIDADE: readonly { readonly valor: PreferenciaDeQualidade; readonly rotulo: string; readonly dica: string }[] = [
  { valor: 'auto', rotulo: 'Automática', dica: 'Escolhe pela placa de vídeo e desce sozinha se o jogo ficar lento' },
  { valor: 'baixa', rotulo: 'Baixa', dica: 'Sem sombras nem reflexos, imagem menor: para computador fraco' },
  { valor: 'media', rotulo: 'Média', dica: 'Sombras suaves e reflexos, materiais simples' },
  { valor: 'alta', rotulo: 'Alta', dica: 'Tudo ligado' },
];

/** Dentro de 3% do padrão o controle encaixa em 1,00 exato (o padrão tem de ser fácil de acertar). */
const ENCAIXE = 0.03;

const vezes = (v: number): string => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

interface Linha {
  readonly descritor: DescritorDeConfiguracao;
  readonly raiz: HTMLElement;
  readonly controle: HTMLInputElement;
  readonly valor: HTMLElement;
}

/**
 * A engrenagem: sensibilidades de quem joga (mira, mira fina, força, curva da força, órbita, zoom e giro da câmera,
 * cada controle em escala logarítmica em torno do padrão) e o nível de qualidade gráfica do computador. Os valores são
 * do perfil que o `gerente` está usando agora e valem na hora.
 */
export function criarPainelDeConfiguracoes(pai: HTMLElement, opcoes: OpcoesPainelDeConfiguracoes): PainelDeConfiguracoes {
  const { gerente, qualidade } = opcoes;
  const raiz = el('aside', 'config-jogador');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-label', 'Configurações');

  const cabecalho = el('header', 'config-cabecalho');
  const titulo = el('strong', 'config-titulo', 'Configurações');
  const fechar = el('button', 'hud-botao config-fechar', '×');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar as configurações');
  cabecalho.append(titulo, fechar);

  const dono = el('p', 'config-dono');
  const donoRotulo = el('span', 'config-dono-rotulo', 'Perfil de');
  const donoNome = el('strong', 'config-dono-nome');
  dono.append(donoRotulo, donoNome);
  const nota = el('p', 'config-nota', 'Cada jogador tem as suas configurações; no mesmo PC elas trocam sozinhas na vez de cada um. Online, valem só para você, neste aparelho.');
  raiz.append(cabecalho, dono, nota);

  const colunas = el('div', 'config-colunas');
  const colunaA = el('div', 'config-coluna');
  const colunaB = el('div', 'config-coluna');
  colunas.append(colunaA, colunaB);
  raiz.append(colunas);

  const linhas: Linha[] = [];
  for (const { grupo, titulo: tituloDoGrupo } of GRUPOS) {
    const secao = el('section', 'config-secao');
    secao.append(el('h3', 'config-secao-titulo', tituloDoGrupo));
    for (const descritor of DESCRITORES.filter((d) => d.grupo === grupo)) {
      const linha = el('label', 'config-linha');
      linha.title = descritor.dica;
      const topo = el('span', 'config-linha-topo');
      const nome = el('span', 'config-nome', descritor.rotulo);
      const valor = el('span', 'config-valor');
      topo.append(nome, valor);
      const controle = el('input', 'config-slider');
      controle.type = 'range';
      controle.min = String(Math.log2(descritor.minimo));
      controle.max = String(Math.log2(descritor.maximo));
      controle.step = '0.01';
      controle.name = descritor.chave;
      controle.dataset.chave = descritor.chave;
      controle.setAttribute('aria-label', descritor.rotulo);
      const pontas = el('span', 'config-pontas');
      pontas.append(el('span', '', descritor.pontaMenor), el('span', '', descritor.pontaMaior));
      linha.append(topo, controle, pontas);
      secao.append(linha);
      linhas.push({ descritor, raiz: linha, controle, valor });
    }
    (grupo === 'camera' ? colunaB : colunaA).append(secao);
  }

  const acoes = el('div', 'config-acoes');
  const restaurar = el('button', 'hud-botao config-restaurar', 'Restaurar padrão');
  restaurar.type = 'button';
  acoes.append(restaurar);
  colunaA.append(acoes);

  // ---------------------------------------------------------------- qualidade gráfica (do computador)
  const secaoQualidade = el('section', 'config-secao config-qualidade');
  secaoQualidade.append(el('h3', 'config-secao-titulo', 'Gráficos (neste computador)'));
  const opcoesDeQualidade = el('div', 'config-nivel');
  opcoesDeQualidade.setAttribute('role', 'radiogroup');
  opcoesDeQualidade.setAttribute('aria-label', 'Qualidade gráfica');
  const botoesDeQualidade = new Map<PreferenciaDeQualidade, HTMLButtonElement>();
  for (const { valor, rotulo, dica } of OPCOES_DE_QUALIDADE) {
    const b = el('button', 'config-nivel-botao', rotulo);
    b.type = 'button';
    b.title = dica;
    b.setAttribute('role', 'radio');
    b.dataset.preferencia = valor;
    opcoesDeQualidade.append(b);
    botoesDeQualidade.set(valor, b);
  }
  const agora = el('p', 'config-agora');
  agora.setAttribute('aria-live', 'polite');
  const recarregarAviso = el('div', 'config-recarregar');
  recarregarAviso.append(el('span', '', 'Antialias e texturas menores valem na próxima vez que o jogo abrir.'));
  const recarregar = el('button', 'hud-botao', 'Recarregar agora');
  recarregar.type = 'button';
  recarregarAviso.append(recarregar);
  secaoQualidade.append(opcoesDeQualidade, agora, recarregarAviso);
  colunaB.append(secaoQualidade);

  // ---------------------------------------------------------------- emojis (do aparelho; ocupa a largura toda)
  const secaoEmojis = el('section', 'config-secao config-emojis');
  const tituloDosEmojis = el('div', 'config-emojis-titulo');
  tituloDosEmojis.append(el('h3', 'config-secao-titulo', 'Emojis (teclas 1 a 8)'), el('span', 'config-emojis-aviso', 'Valem neste aparelho, em qualquer sala'));
  secaoEmojis.append(tituloDosEmojis);
  const escolhaDeEmojis = criarEscolhaDeEmojis(opcoes.emojis, { compacta: true });
  secaoEmojis.append(escolhaDeEmojis.raiz);
  raiz.append(secaoEmojis);
  pai.append(raiz);

  // ---------------------------------------------------------------- vida
  const sincronizarValores = (): void => {
    const perfil = gerente.perfil;
    donoNome.textContent = perfil?.rotulo ?? '';
    const valores = gerente.valores;
    for (const { descritor, raiz: linha, controle, valor } of linhas) {
      const v = valores[descritor.chave];
      controle.value = String(Math.log2(v));
      valor.textContent = vezes(v);
      linha.classList.toggle('alterado', v !== CONFIGURACOES_PADRAO[descritor.chave]);
      controle.setAttribute('aria-valuetext', `${v.toFixed(2)} vezes o padrão`);
    }
    restaurar.disabled = gerente.padrao;
    restaurar.textContent = perfil ? `Restaurar padrão de ${perfil.rotulo}` : 'Restaurar padrão';
  };

  const sincronizarQualidade = (): void => {
    const e = qualidade.estado();
    for (const [valor, botao] of botoesDeQualidade) {
      const marcado = valor === e.preferencia;
      botao.classList.toggle('marcado', marcado);
      botao.setAttribute('aria-checked', String(marcado));
    }
    const origem = e.preferencia === 'auto' ? (e.software ? ' (automática: o navegador usa renderização por software)' : ' (automática)') : '';
    agora.textContent = `Agora: ${e.rotuloDoNivel}${origem}`;
    recarregarAviso.hidden = !e.pedeRecarregar;
  };

  const aoArrastar = (e: Event): void => {
    const controle = e.target as HTMLInputElement;
    if (!controle.dataset.chave) return;
    let v = 2 ** Number(controle.value);
    if (Math.abs(v - 1) < ENCAIXE) v = 1;
    gerente.definir(controle.dataset.chave as ChaveDeConfiguracao, Math.round(v * 100) / 100);
    sincronizarValores();
  };
  const aoSoltarControle = (e: Event): void => (e.target as HTMLInputElement).blur();
  raiz.addEventListener('input', aoArrastar);
  raiz.addEventListener('change', aoSoltarControle);

  const aoClicarQualidade = (e: Event): void => {
    const botao = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-preferencia]');
    if (!botao) return;
    qualidade.escolher(botao.dataset.preferencia as PreferenciaDeQualidade);
    botao.blur();
    sincronizarQualidade();
  };
  opcoesDeQualidade.addEventListener('click', aoClicarQualidade);
  const aoRestaurar = (): void => {
    gerente.restaurar();
    restaurar.blur();
    sincronizarValores();
  };
  restaurar.addEventListener('click', aoRestaurar);
  const aoRecarregar = (): void => qualidade.recarregar();
  recarregar.addEventListener('click', aoRecarregar);

  const pararDeOuvirGerente = gerente.aoMudar(sincronizarValores);
  const pararDeOuvirQualidade = qualidade.aoMudar(sincronizarQualidade);
  sincronizarValores();
  sincronizarQualidade();

  let abertoAgora = false;
  const definirAberto = (aberto: boolean): void => {
    if (aberto === abertoAgora) return;
    abertoAgora = aberto;
    raiz.hidden = !aberto;
    if (aberto) {
      sincronizarValores();
      sincronizarQualidade();
      opcoes.aoAbrir();
    } else {
      escolhaDeEmojis.limparSelecao();
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  };
  const aoFechar = (): void => definirAberto(false);
  fechar.addEventListener('click', aoFechar);

  const aoApertar = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'Escape' && abertoAgora) definirAberto(false);
    else if (e.code === 'KeyC' && !e.repeat && !teclaEmCampo(e.target)) definirAberto(!abertoAgora);
  };
  window.addEventListener('keydown', aoApertar);
  // Clicar em qualquer outra coisa (a mesa, o menu) é seguir o jogo: o painel se fecha. A engrenagem alterna sozinha.
  const aoPressionarFora = (e: PointerEvent): void => {
    if (abertoAgora && !(e.target as Element | null)?.closest?.('.config-jogador, .hud-engrenagem, .menu-engrenagem')) definirAberto(false);
  };
  window.addEventListener('pointerdown', aoPressionarFora, true);

  return {
    get aberto() {
      return abertoAgora;
    },
    abrir: () => definirAberto(true),
    fechar: () => definirAberto(false),
    alternar: () => definirAberto(!abertoAgora),
    dispose() {
      window.removeEventListener('keydown', aoApertar);
      window.removeEventListener('pointerdown', aoPressionarFora, true);
      raiz.removeEventListener('input', aoArrastar);
      raiz.removeEventListener('change', aoSoltarControle);
      opcoesDeQualidade.removeEventListener('click', aoClicarQualidade);
      restaurar.removeEventListener('click', aoRestaurar);
      recarregar.removeEventListener('click', aoRecarregar);
      fechar.removeEventListener('click', aoFechar);
      escolhaDeEmojis.dispose();
      pararDeOuvirGerente();
      pararDeOuvirQualidade();
      raiz.remove();
    },
  };
}
