import type { EstadoCarteira, ModoSala } from '@sinuca/protocolo';
import { LIMITES_PROTOCOLO, TAMANHO_CODIGO } from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import type { SomDoMenu } from '../audio/mapeamento';
import { aparenciaDoTaco } from '../cena/aparencia-do-taco';
import { jogadoresDoHotSeat } from '../config';
import { CATALOGO, fraseDeQuemJoga, montarCatalogo } from '../lobby/catalogo';
import type { MudancaDeRegras, OndeSeLembra, RegrasDaSala } from '../lobby/regras-da-sala';
import { codigoValido, limparCodigo } from '../online/convite';
import { textoDeMoedas } from '../online/moedas';
import type { MissoesNaTela } from '../online/missoes-modelo';
import type { AssentoModelo, SalaModelo } from '../online/sala-modelo';
import { criarConfronto } from './confronto';
import { copiarTexto } from './copiar-texto';
import { criarPainelDeMissoes, type PainelDeMissoes } from './missoes';
import type { ConfrontoNaTela, PlacarParaMostrar } from './confronto-modelo';
import { criarRegrasDaSala } from './regras-da-sala';
import { LINK_DE_PRIVACIDADE } from '../online/endereco-do-jogo';
import { ICONES_DO_MENU } from './icones';
import { criarCanvasDaMiniatura } from './miniatura-do-taco';
import { RECURSOS_DO_MENU, arquivoDoLetreiro, atalhosDaTelaInicial, barraDoMenu, escalaDoMenu, quadroComecaAberto, transicaoDoMenu, type IdDoAtalho, type RecursosDoMenu, type TelaDoMenu } from './menu-modelo';

/** Quanto tempo o "Expulsar?" fica esperando o sim antes de voltar ao botão (ms). */
const CONFIRMAR_EXPULSAO_MS = 5000;
/** De quanto em quanto tempo o painel de missões confere o relógio (ms): o texto "faltam N min" muda de minuto em minuto. */
const INTERVALO_DO_PAINEL_MS = 15_000;
/** Entre dois "tiques" de passar o mouse: a passada rápida sobre vários botões não vira rajada. */
const PASSADA_MINIMA_MS = 70;
/** A miniatura do taco na barra de cima, em pixels CSS. */
const MINIATURA_DA_BARRA = { largura: 168, altura: 24 } as const;

export interface OpcoesMenu {
  /** O espaço de anúncio da tela inicial (o mesmo elemento a cada chamada; `null` = sem anúncio). Fica embaixo, longe das placas. */
  espacoDeAnuncio?: () => HTMLElement | null;
  /** O que as regras sabem jogar: um formato de uma modalidade só vem habilitado se `novaPartida` o aceita. */
  readonly disponivel: (modalidade: Modalidade, modo: ModoSala) => boolean;
  readonly apelidoInicial: string;
  /** A última escolha de regras de cada tela (o navegador lembra; sem nada lembrado, o padrão): modalidade, formato, tempo, linha, giz e força. */
  readonly regrasLembradas: (onde: OndeSeLembra) => RegrasDaSala;
  /** Uma escolha foi feita: lembra para a próxima vez. */
  readonly aoLembrar: (onde: OndeSeLembra, regras: RegrasDaSala) => void;
  /** "Jogar" no mesmo PC com as regras escolhidas. */
  readonly aoJogarLocal: (regras: RegrasDaSala) => void;
  readonly aoCriar: (dados: { readonly nome: string; readonly regras: RegrasDaSala }) => void;
  /** "Loja" (L24): abre a loja de tacos sobre a tela de agora. */
  readonly aoAbrirLoja: () => void;
  /** A carteira do aparelho como está (`null` = ainda não lida ou fora do ar): a barra de cima mostra o saldo e o taco em uso dela (L40). */
  readonly carteira: () => EstadoCarteira | null;
  /** "Créditos" (L40): abre a tela de créditos sobre a tela inicial. */
  readonly aoAbrirCreditos: () => void;
  /** Os botões que podem não existir (o perfil, do L43): o interruptor fica em `menu-modelo.ts`; sem isto vale `RECURSOS_DO_MENU`. */
  readonly recursos?: RecursosDoMenu;
  /** "Treino" (L42): só aparece com `recursos.treino`. */
  readonly aoTreino?: () => void;
  /** "Perfil" (L43): só aparece com `recursos.perfil`. */
  readonly aoPerfil?: () => void;
  /** "Entrar" na barra de cima (L62), mostrado só para o convidado; sem isto o botão não existe. */
  readonly aoEntrarNaConta?: () => void;
  /** Toca um som curto do menu (passar o mouse, clicar); sem isto o menu é mudo. */
  readonly tocarSom?: (som: SomDoMenu) => void;
  /** O recado pendente da carteira (a do aparelho foi trocada por uma nova); `mostrarInicio` o mostra uma vez. */
  readonly avisoDaCarteira: () => string | null;
  /** O painel "Missões do dia" (L32) como está em `agoraMs`: o progresso da carteira, ou as missões do dia sem progresso. */
  readonly missoes: (agoraMs: number) => MissoesNaTela;
  /** O painel foi à tela, ou o dia virou com ele aberto: quem chama põe a carteira em dia (o painel se redesenha quando ela mudar). */
  readonly aoPrecisarDeMissoes: () => void;
  /** Anfitrião, na sala de espera: mudou alguma regra da sala (só o que mudou vem). */
  readonly aoConfigurarSala: (mudanca: MudancaDeRegras) => void;
  readonly aoEntrar: (dados: { readonly nome: string; readonly codigo: string }) => void;
  readonly aoEscolherLugar: (lugar: number | null) => void;
  /** Anfitrião, na sala de espera, já confirmado: tira a pessoa do `lugar`. */
  readonly aoExpulsar: (lugar: number) => void;
  readonly aoIniciar: () => void;
  readonly aoSair: () => void;
  /** A engrenagem do canto: abre as configurações (também servem antes de entrar numa sala). */
  readonly aoConfiguracoes: () => void;
  /** O placar do mesmo PC como está agora (`null` = nenhuma partida contada): "Jogar no mesmo PC" o mostra com o botão de zerar. */
  readonly placarDoMesmoPc: () => ConfrontoNaTela | null;
  /** "Zerar placar" do mesmo PC. */
  readonly aoZerarPlacarDoMesmoPc: () => void;
}

export interface Menu {
  readonly visivel: boolean;
  /** As três opções da tela inicial; `aviso` mostra o que aconteceu (sala encerrada, recusa...). */
  mostrarInicio(aviso?: string): void;
  /** Redesenha o painel de missões da tela inicial, se ela está aberta (a carteira mudou, o dia virou). */
  atualizarMissoes(): void;
  /** O texto do painel de missões da tela inicial, `null` com outra tela aberta (gancho de teste). */
  textoDasMissoes(): string | null;
  /** Redesenha a barra de cima (a carteira mudou: saldo e taco em uso). */
  atualizarBarra(): void;
  /** O que a barra de cima mostra (apelido, saldo, taco), `null` com o menu fechado (gancho de teste). */
  textoDaBarra(): string | null;
  /** Qual tela está aberta, `null` com o menu fechado (gancho de teste). */
  readonly tela: TelaDoMenu | null;
  /**
   * O nome da conta (L62) ou `null` para o convidado. Com conta o apelido da mesa é o nome dela: a caixa do apelido mostra esse nome e não
   * deixa mudar (o nome muda no perfil); o apelido que o convidado digitou fica guardado e volta ao sair.
   */
  definirNomeDaConta(nome: string | null): void;
  /** O apelido como está na caixa agora (o que o jogador digitou, ou o que o navegador lembrava): o perfil o mostra. Vazio = sem apelido. */
  apelidoAtual(): string;
  /** Formulário de criar sala: apelido e as regras da sala (modalidade, formato, tempo, linha, giz e força). */
  mostrarCriar(): void;
  /** Hot-seat: as mesmas regras e o botão de jogar; reabre com o que foi escolhido da última vez. */
  mostrarLocal(): void;
  /**
   * O anfitrião tirou esta pessoa da sala: "Voltar ao menu" ou "Entrar de novo" (pelo mesmo código e apelido, como entrada
   * nova). Quem chama já fechou a sessão.
   */
  mostrarExpulso(codigo: string, nome: string): void;
  /** Versão do jogo diferente da sala: só recarregar a página resolve (o texto é o da sala). */
  mostrarRecarregar(texto: string): void;
  /** Formulário de entrar com código (`codigo` já preenchido quando veio do link). */
  mostrarEntrar(codigo?: string, aviso?: string): void;
  mostrarConectando(texto: string): void;
  /** A sala de espera: lugares, link, as regras da sala (o anfitrião as muda; os outros veem o resumo) e o botão de iniciar (do anfitrião). */
  mostrarEspera(modelo: SalaModelo, link: string): void;
  /** Um aviso numa tela que já está aberta (erro de lugar ocupado, p.ex.). */
  mostrarAviso(texto: string): void;
  esconder(): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Um ícone do menu como elemento (o SVG vem de `ICONES_DO_MENU`, é texto nosso e não do usuário). */
function icone(svg: string): HTMLElement {
  const e = document.createElement('span');
  e.className = 'menu-icone';
  e.innerHTML = svg;
  return e;
}

function botao(texto: string, classe: string, aoClicar: () => void): HTMLButtonElement {
  const b = el('button', classe, texto);
  b.type = 'button';
  b.addEventListener('click', aoClicar);
  return b;
}

function campo(rotulo: string, entrada: HTMLElement): HTMLElement {
  const grupo = el('label', 'menu-campo');
  grupo.append(el('span', 'menu-campo-rotulo', rotulo), entrada);
  return grupo;
}

/**
 * A tela inicial do jogo e a sala de espera, sobre a mesa. Só DOM: as decisões (o que a sala permite,
 * quem pode iniciar) vêm do modelo; cada botão chama um callback.
 */
export function criarMenu(pai: HTMLElement, opcoes: OpcoesMenu): Menu {
  const raiz = el('div', 'menu');
  raiz.hidden = true;
  const palco = el('div', 'menu-palco');
  const caixa = el('div', 'menu-caixa');
  palco.append(caixa);

  // A barra de cima (L40): apelido, saldo e taco em uso, e a engrenagem. Fica depois do palco no DOM para a engrenagem ser a última
  // do Tab, como sempre foi; o CSS a põe em cima.
  const barraItem = (classe: string, icone: string, rotulo: string, comoBotao = false): { readonly item: HTMLElement; readonly valor: HTMLElement; readonly texto: HTMLElement } => {
    const item: HTMLElement = comoBotao ? el('button', `menu-barra-item ${classe}`) : el('div', `menu-barra-item ${classe}`);
    if (item instanceof HTMLButtonElement) item.type = 'button';
    const desenho = el('span', 'menu-barra-icone');
    desenho.innerHTML = icone;
    const texto = el('span', 'menu-barra-texto');
    const valor = el('span', 'menu-barra-valor');
    texto.append(el('span', 'menu-barra-rotulo', rotulo), valor);
    item.append(desenho, texto);
    return { item, valor, texto };
  };
  const barra = el('div', 'menu-barra');
  barra.setAttribute('role', 'group');
  barra.setAttribute('aria-label', 'Seu apelido, seu saldo e o taco em uso');
  // L43: com o perfil ligado, o apelido da barra é o botão que o abre (o mesmo "Perfil" da fileira da tela inicial).
  const recursosDoMenu = opcoes.recursos ?? RECURSOS_DO_MENU;
  const perfilNaBarra = recursosDoMenu.perfil && opcoes.aoPerfil !== undefined;
  const barraApelido = barraItem('apelido', ICONES_DO_MENU.jogador, 'Jogador', perfilNaBarra);
  if (perfilNaBarra) {
    barraApelido.item.classList.add('abre-perfil');
    barraApelido.item.dataset.foco = 'barra-perfil';
    barraApelido.item.title = 'Perfil e estatísticas';
    barraApelido.item.addEventListener('click', () => opcoes.aoPerfil?.());
  }
  // L62: "Entrar" para o convidado (o nome da conta já aparece no item do apelido, que vira "Conta").
  const barraEntrar = barraItem('entrar abre-perfil', ICONES_DO_MENU.jogador, 'Conta', true);
  barraEntrar.valor.textContent = 'Entrar';
  barraEntrar.item.dataset.foco = 'barra-entrar';
  barraEntrar.item.title = 'Entrar ou criar a sua conta Beco Games';
  barraEntrar.item.hidden = opcoes.aoEntrarNaConta === undefined;
  barraEntrar.item.addEventListener('click', () => opcoes.aoEntrarNaConta?.());
  const barraSaldo = barraItem('saldo', ICONES_DO_MENU.moeda, 'Saldo');
  const barraTaco = barraItem('taco', '', 'Taco');
  const miniaturaDoTaco = el('span', 'menu-barra-miniatura-caixa');
  barraTaco.item.replaceChildren(miniaturaDoTaco, barraTaco.texto);
  const engrenagem = el('button', 'menu-engrenagem');
  engrenagem.type = 'button';
  engrenagem.title = 'Configurações (C)';
  engrenagem.setAttribute('aria-label', 'Configurações');
  engrenagem.innerHTML = ICONES_DO_MENU.configuracoes;
  const aoClicarEngrenagem = (): void => {
    engrenagem.blur();
    opcoes.aoConfiguracoes();
  };
  engrenagem.addEventListener('click', aoClicarEngrenagem);
  barra.append(barraApelido.item, barraEntrar.item, barraSaldo.item, barraTaco.item, engrenagem);
  raiz.append(palco, barra);
  pai.append(raiz);

  /** Menu maior que o de projeto (1280x720) cresce na mesma proporção: o CSS lê `--escala`. */
  const aplicarEscala = (): void => void raiz.style.setProperty('--escala', String(escalaDoMenu(window.innerWidth, window.innerHeight)));
  aplicarEscala();
  window.addEventListener('resize', aplicarEscala);

  // Os sons: um "tique" ao passar o mouse e uma batida ao clicar em qualquer botão do menu. O clique é ouvido na captura, antes do botão
  // trocar a tela (o botão clicado já teria saído do DOM quando a borbulha chegasse aqui).
  const botaoDe = (alvo: EventTarget | null): HTMLButtonElement | null => {
    const b = alvo instanceof Element ? alvo.closest('button') : null;
    return b !== null && !b.disabled && raiz.contains(b) ? b : null;
  };
  let ultimaPassada = Number.NEGATIVE_INFINITY;
  const aoPassarOMouse = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const b = botaoDe(e.target);
    if (b === null || (e.relatedTarget instanceof Node && b.contains(e.relatedTarget))) return;
    const agora = performance.now();
    if (agora - ultimaPassada < PASSADA_MINIMA_MS) return;
    ultimaPassada = agora;
    opcoes.tocarSom?.('menu-passa');
  };
  const aoClicarEmBotao = (e: MouseEvent): void => {
    if (botaoDe(e.target) !== null) opcoes.tocarSom?.('menu-clique');
  };
  raiz.addEventListener('pointerover', aoPassarOMouse);
  raiz.addEventListener('click', aoClicarEmBotao, true);

  /** O apelido que o convidado digitou; com conta vale `nomeDaConta`, e este fica guardado. */
  let apelidoDoConvidado = opcoes.apelidoInicial;
  let nomeDaConta: string | null = null;
  const apelidoDeAgora = (): string => nomeDaConta ?? apelidoDoConvidado;
  const catalogo = montarCatalogo(CATALOGO, opcoes.disponivel);
  /** O que cada tela escolheu da última vez (criar sala e mesmo PC lembram cada uma a sua; o navegador também). */
  const escolhidas: Record<OndeSeLembra, RegrasDaSala> = { sala: opcoes.regrasLembradas('sala'), local: opcoes.regrasLembradas('local') };
  let visivel = false;
  /** A tela aberta (`null` = menu fechado): a transição só anima quando ela muda. */
  let telaAtual: TelaDoMenu | null = null;
  /** O quadro das missões da tela inicial está aberto? Começa conforme o tamanho da janela e depois fica como o jogador deixou. */
  let quadroAberto: boolean | null = null;
  let avisoEl: HTMLElement | null = null;
  /** O histórico do placar na sala de espera abre e fecha sem fechar de novo a cada `estado-sala` que redesenha a tela. */
  let historicoAberto = false;
  /** O painel de missões da tela inicial (L32); `null` em qualquer outra tela. */
  let painelDeMissoes: PainelDeMissoes | null = null;
  /** Até quando vale o dia que o painel mostra: passou disso, o dia virou e a carteira precisa ser lida de novo. */
  let fimDoDiaMostrado = 0;
  const desenharMissoes = (): void => {
    if (painelDeMissoes === null) return;
    const agora = Date.now();
    const virou = fimDoDiaMostrado !== 0 && agora >= fimDoDiaMostrado;
    const modelo = opcoes.missoes(agora);
    fimDoDiaMostrado = modelo.fimMs;
    painelDeMissoes.atualizar(modelo);
    if (virou) opcoes.aoPrecisarDeMissoes();
  };
  /** O "faltam 3 h 20 min" anda de minuto em minuto; o dia vira com o lobby aberto. */
  const relogioDasMissoes = window.setInterval(() => {
    if (visivel && painelDeMissoes !== null && painelDeMissoes.raiz.isConnected) desenharMissoes();
  }, INTERVALO_DO_PAINEL_MS);

  /** A barra de cima com o que o apelido e a carteira dizem agora; a miniatura do taco só é refeita quando a skin ou a semente muda. */
  let chaveDoTacoDesenhado = '';
  const desenharBarra = (): void => {
    const b = barraDoMenu(opcoes.carteira(), apelidoDeAgora());
    barraEntrar.item.hidden = opcoes.aoEntrarNaConta === undefined || nomeDaConta !== null;
    barraApelido.item.querySelector('.menu-barra-rotulo')!.textContent = nomeDaConta === null ? 'Jogador' : 'Conta';
    barraApelido.valor.textContent = b.apelido;
    barraApelido.item.classList.toggle('vazio', !b.temApelido);
    if (perfilNaBarra) barraApelido.item.setAttribute('aria-label', `Perfil e estatísticas${b.temApelido ? ` de ${b.apelido}` : ''}`);
    barraSaldo.valor.textContent = b.textoSaldo;
    barraSaldo.item.classList.toggle('negativo', b.saldoNegativo);
    barraSaldo.item.classList.toggle('sem-carteira', b.semCarteira);
    barraTaco.valor.textContent = b.taco.nome;
    barraTaco.item.title = `Taco em uso: ${b.taco.nome}${b.taco.semente === null ? '' : ` #${b.taco.semente}`}`;
    barraTaco.item.style.setProperty('--faixa', b.taco.corDaFaixa);
    if (b.chaveDoTaco !== chaveDoTacoDesenhado) {
      chaveDoTacoDesenhado = b.chaveDoTaco;
      miniaturaDoTaco.replaceChildren(criarCanvasDaMiniatura(aparenciaDoTaco(b.taco.skin, b.taco.semente ?? undefined), MINIATURA_DA_BARRA.largura, MINIATURA_DA_BARRA.altura, 'menu-barra-miniatura'));
    }
  };

  /** A tela nova entra com um deslize curto; a mesma tela redesenhada (a sala de espera a cada `estado-sala`) não anima. */
  const animarEntrada = (direcao: 'avanca' | 'volta' | null): void => {
    caixa.removeAttribute('data-entrada');
    if (direcao === null) return;
    // Sem o recálculo de estilo no meio, o navegador veria a mesma animação de antes e não a reiniciaria.
    void caixa.offsetWidth;
    caixa.dataset.entrada = direcao;
  };

  /** Troca o conteúdo da caixa. O controle que estava em foco (`data-foco`) volta a ficar, para o teclado seguir de onde estava; devolve se voltou. */
  const mostrar = (tela: TelaDoMenu, ...filhos: HTMLElement[]): boolean => {
    const foco = caixa.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.foco : undefined;
    const direcao = transicaoDoMenu(visivel ? telaAtual : null, tela);
    telaAtual = tela;
    painelDeMissoes = null;
    caixa.className = 'menu-caixa';
    caixa.replaceChildren(...filhos);
    raiz.dataset.tela = tela;
    raiz.hidden = false;
    visivel = true;
    document.body.classList.add('menu-aberto');
    animarEntrada(direcao);
    desenharBarra();
    const volta = foco === undefined ? null : caixa.querySelector<HTMLElement>(`[data-foco="${foco}"]`);
    volta?.focus();
    return volta !== null;
  };
  /**
   * O letreiro: o nome do jogo num elemento só (`.menu-letreiro`). Leva o letreiro do Pincel (`arte/marca`, L44), aceso por cima do
   * apagado (o apagado só aparece no nível alto, onde o néon falha de vez em quando); o texto continua ali, escondido, para o leitor de
   * tela, e volta a ser o letreiro se a imagem não carregar (a cópia de `public/marca/` não rodou).
   */
  const letreiro = (grande: boolean): HTMLElement => {
    const l = el('h1', `menu-titulo menu-letreiro${grande ? ' grande' : ''}`);
    const texto = el('span', 'menu-letreiro-texto');
    texto.append(el('span', 'menu-letreiro-a', 'Sinuca'), ' ', el('span', 'menu-letreiro-b', 'Par ou Ímpar'));
    const imagem = (estado: 'acesa' | 'apagada'): HTMLImageElement => {
      const i = document.createElement('img');
      i.className = `menu-letreiro-img menu-letreiro-${estado}`;
      i.src = arquivoDoLetreiro(import.meta.env.BASE_URL, grande, estado);
      i.alt = '';
      i.decoding = 'async';
      i.draggable = false;
      if (estado === 'apagada') i.loading = 'lazy';
      else i.addEventListener('error', () => l.classList.add('sem-imagem'), { once: true });
      return i;
    };
    l.append(imagem('apagada'), imagem('acesa'), texto);
    return l;
  };
  const cabecalho = (subtitulo: string, grande = false): HTMLElement => {
    const c = el('div', 'menu-cabecalho');
    c.append(letreiro(grande), el('div', 'menu-subtitulo', subtitulo));
    return c;
  };
  const aviso = (texto: string | undefined, alerta = true): HTMLElement => {
    const a = el('div', alerta ? 'menu-aviso' : 'menu-aviso neutro', texto ?? '');
    a.hidden = !texto;
    a.setAttribute('role', 'status');
    avisoEl = a;
    return a;
  };
  const campoDoApelido = (): HTMLInputElement => {
    const entrada = el('input', 'menu-entrada');
    entrada.type = 'text';
    entrada.maxLength = LIMITES_PROTOCOLO.nome;
    entrada.placeholder = 'Como te chamam na mesa';
    entrada.name = 'apelido';
    entrada.autocomplete = 'off';
    entrada.value = apelidoDeAgora();
    if (nomeDaConta !== null) {
      entrada.readOnly = true;
      entrada.title = 'O nome da mesa é o da sua conta. Mude no perfil.';
    }
    entrada.addEventListener('input', () => {
      if (nomeDaConta !== null) return;
      apelidoDoConvidado = entrada.value;
      desenharBarra();
    });
    return entrada;
  };
  const nomeValido = (entrada: HTMLInputElement): string | null => {
    const nome = entrada.value.trim();
    if (nome === '') {
      entrada.focus();
      menu.mostrarAviso('Diga seu apelido para os outros saberem quem é.');
      return null;
    }
    return nome;
  };
  const aoEnter = (entrada: HTMLInputElement, acao: () => void): void => {
    entrada.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        acao();
      }
    });
  };

  /** O bloco das regras da sala (modalidade, formato, tempo, linha, giz e força) das telas de criar sala e do mesmo PC: a escolha aparece na hora e fica lembrada. */
  const regrasDe = (onde: OndeSeLembra): HTMLElement => {
    const painel = criarRegrasDaSala({
      regras: escolhidas[onde],
      catalogo,
      naSala: onde === 'sala',
      otimista: true,
      editavel: true,
      disponivel: opcoes.disponivel,
      comAposta: onde === 'sala',
      dicaDoFormato: onde === 'local' ? (r) => `${fraseDeQuemJoga(jogadoresDoHotSeat(r.modo))}${jogadoresDoHotSeat(r.modo).length > 2 ? ' Cada um tem as suas configurações (⚙).' : ''}` : undefined,
      aoMudar: (_mudanca, regras) => {
        escolhidas[onde] = regras;
        opcoes.aoLembrar(onde, regras);
      },
    });
    painel.raiz.dataset.onde = onde;
    return painel.raiz;
  };

  /** O botão "Expulsar" do anfitrião; um clique pede a confirmação ("Expulsar? Sim / Não") e ela some sozinha depois de um tempo. */
  const controleDeExpulsao = (a: AssentoModelo): HTMLElement => {
    const caixaDoControle = el('span', 'menu-lugar-expulsar');
    const mostrarBotao = (): void => {
      const expulsar = botao('Expulsar', 'menu-lugar-expulsar-botao', () => pedirConfirmacao());
      expulsar.setAttribute('aria-label', `Expulsar ${a.nome ?? 'jogador'} da sala`);
      caixaDoControle.replaceChildren(expulsar);
    };
    let desistir: ReturnType<typeof setTimeout> | undefined;
    const pedirConfirmacao = (): void => {
      const sim = botao('Sim', 'menu-lugar-expulsar-sim', () => {
        clearTimeout(desistir);
        opcoes.aoExpulsar(a.lugar);
      });
      sim.setAttribute('aria-label', `Sim, expulsar ${a.nome ?? 'jogador'}`);
      const nao = botao('Não', 'menu-lugar-expulsar-nao', () => {
        clearTimeout(desistir);
        mostrarBotao();
      });
      caixaDoControle.replaceChildren(el('span', 'menu-lugar-expulsar-pergunta', 'Expulsar?'), sim, nao);
      sim.focus();
      desistir = setTimeout(mostrarBotao, CONFIRMAR_EXPULSAO_MS);
    };
    mostrarBotao();
    return caixaDoControle;
  };

  /** O cartão de um lugar da sala de espera: o nome, a presença, "Sentar aqui" (vago) e "Expulsar" (do anfitrião). */
  const cartaoDoLugar = (a: AssentoModelo): HTMLElement => {
    const cartao = el('div', `menu-lugar equipe-${a.equipe}`);
    cartao.dataset.lugar = String(a.lugar);
    cartao.classList.toggle('vago', a.nome === null);
    cartao.classList.toggle('meu', a.meu);
    const topo = el('div', 'menu-lugar-topo');
    if (a.anfitriao) topo.append(el('span', 'menu-lugar-selo', 'anfitrião'));
    if (a.podeExpulsar) topo.append(controleDeExpulsao(a));
    cartao.append(topo);
    if (a.nome === null) {
      cartao.append(el('div', 'menu-lugar-nome', 'Vago'));
      if (a.podeSentar) cartao.append(botao('Sentar aqui', 'menu-botao pequeno', () => opcoes.aoEscolherLugar(a.lugar)));
    } else {
      const nome = el('div', 'menu-lugar-nome');
      const presenca = el('span', 'placar-presenca');
      presenca.dataset.estado = a.conectado ? 'online' : 'caiu';
      nome.append(presenca, a.nome);
      if (a.meu) nome.append(el('span', 'placar-voce', 'você'));
      nome.append(el('span', `menu-lugar-saldo${a.saldo !== null && a.saldo < 0 ? ' negativo' : ''}`, a.saldo === null ? 'sem carteira' : textoDeMoedas(a.saldo)));
      cartao.append(nome);
      // L43: o resumo público de quem está no lugar; sem resumo (sem carteira), o cartão fica sem a linha.
      if (a.resumo !== null) cartao.append(el('div', 'menu-lugar-resumo', a.resumo));
      if (!a.conectado) cartao.append(el('div', 'menu-lugar-detalhe', 'desconectado'));
    }
    return cartao;
  };

  /** O placar da sala na espera: o confronto de quem está sentado em destaque e, recolhível, o histórico. `null` antes da primeira partida. */
  const blocoDoPlacarDaSala = (placar: PlacarParaMostrar): HTMLElement | null => {
    if (!placar.contou || placar.atual === null) return null;
    const bloco = el('div', 'menu-placar');
    const topo = el('div', 'menu-placar-topo');
    topo.append(el('span', 'menu-campo-rotulo', `Placar da sala · ${placar.atual.rotuloDaModalidade}`));
    if (placar.novo) topo.append(el('span', 'menu-placar-novo', 'confronto novo'));
    bloco.append(topo, criarConfronto(placar.atual, 'grande'));
    if (placar.historico.length === 0) return bloco;
    const lista = el('ul', 'menu-historico');
    lista.hidden = !historicoAberto;
    for (const confronto of placar.historico) {
      const item = el('li', 'menu-historico-item');
      item.append(criarConfronto(confronto, 'linha'));
      lista.append(item);
    }
    const alternar = el('button', 'menu-historico-botao');
    alternar.type = 'button';
    const desenharBotao = (): void => {
      alternar.textContent = `Histórico (${placar.historico.length}) ${historicoAberto ? '▴' : '▾'}`;
      alternar.setAttribute('aria-expanded', String(historicoAberto));
    };
    desenharBotao();
    alternar.addEventListener('click', () => {
      historicoAberto = !historicoAberto;
      lista.hidden = !historicoAberto;
      desenharBotao();
    });
    topo.append(alternar);
    bloco.append(lista);
    return bloco;
  };

  /** O placar do mesmo PC em "Jogar no mesmo PC", com "Zerar placar". `null` sem partida contada. */
  const blocoDoPlacarLocal = (): HTMLElement | null => {
    const placar = opcoes.placarDoMesmoPc();
    if (placar === null) return null;
    const bloco = el('div', 'menu-placar');
    const topo = el('div', 'menu-placar-topo');
    topo.append(el('span', 'menu-campo-rotulo', `Placar do mesmo PC · ${placar.rotuloDaModalidade}`), botao('Zerar placar', 'menu-historico-botao', () => {
      opcoes.aoZerarPlacarDoMesmoPc();
      menu.mostrarLocal();
    }));
    bloco.append(topo, criarConfronto(placar, 'grande'));
    return bloco;
  };

  const menu: Menu = {
    get visivel() {
      return visivel;
    },

    mostrarInicio(texto) {
      const recursos = recursosDoMenu;

      // "Jogar online": uma placa com as duas portas, criar sala e entrar com código.
      const online = el('section', 'menu-placa online');
      const tituloOnline = el('h2', 'menu-placa-titulo');
      tituloOnline.id = 'menu-online-titulo';
      tituloOnline.append(icone(ICONES_DO_MENU.online), 'Jogar online');
      online.setAttribute('aria-labelledby', tituloOnline.id);
      const criar = botao('Criar sala', 'menu-botao principal menu-placa-botao', () => menu.mostrarCriar());
      const entrar = botao('Entrar com código', 'menu-botao menu-placa-botao', () => menu.mostrarEntrar());
      criar.dataset.foco = 'criar';
      entrar.dataset.foco = 'entrar';
      const portas = el('div', 'menu-placa-portas');
      portas.append(criar, entrar);
      online.append(tituloOnline, el('p', 'menu-placa-dica', 'Com os amigos, pela internet'), portas);

      // "Jogar no mesmo PC": a outra placa, um botão só.
      const jogarLocal = botao('', 'menu-botao principal menu-placa local', () => menu.mostrarLocal());
      jogarLocal.dataset.foco = 'local';
      const tituloLocal = el('span', 'menu-placa-titulo');
      tituloLocal.append(icone(ICONES_DO_MENU.mesmoPc), 'Jogar no mesmo PC');
      jogarLocal.setAttribute('aria-label', 'Jogar no mesmo PC');
      jogarLocal.append(tituloLocal, el('span', 'menu-placa-dica', 'Todo mundo na mesma tela, um de cada vez'));

      const destaques = el('div', 'menu-destaques');
      destaques.append(online, jogarLocal);

      // A fileira de baixo: fichas de largura igual; o treino (L42) e o perfil (L43) entram nos lugares deles quando o interruptor liga.
      const acaoDe: Readonly<Record<IdDoAtalho, (() => void) | undefined>> = {
        treino: opcoes.aoTreino,
        loja: opcoes.aoAbrirLoja,
        perfil: opcoes.aoPerfil,
        configuracoes: opcoes.aoConfiguracoes,
        creditos: opcoes.aoAbrirCreditos,
      };
      const atalhos = el('div', 'menu-atalhos');
      for (const a of atalhosDaTelaInicial(recursos)) {
        const ficha = botao('', 'menu-botao menu-ficha', () => acaoDe[a.id]?.());
        ficha.dataset.foco = a.id;
        ficha.dataset.atalho = a.id;
        // O nome do botão é o rótulo (sem a frase de baixo grudada nele); a frase vai na dica do mouse.
        ficha.setAttribute('aria-label', a.rotulo);
        ficha.title = a.dica;
        ficha.append(icone(ICONES_DO_MENU[a.id]), el('span', 'menu-ficha-rotulo', a.rotulo), el('span', 'menu-ficha-dica', a.dica));
        atalhos.append(ficha);
      }

      const principal = el('div', 'menu-inicio-principal');
      principal.append(destaques, atalhos);

      // O quadro de giz das missões (L32): ao lado dos botões onde cabe, recolhido em tela pequena.
      quadroAberto ??= quadroComecaAberto(window.innerWidth, window.innerHeight);
      const missoes = criarPainelDeMissoes();
      const quadro = el('aside', 'menu-quadro');
      const alternar = el('button', 'menu-quadro-alternar');
      alternar.type = 'button';
      alternar.innerHTML = ICONES_DO_MENU.seta;
      const pintarQuadro = (): void => {
        const aberto = quadroAberto === true;
        quadro.classList.toggle('recolhido', !aberto);
        alternar.setAttribute('aria-expanded', String(aberto));
        alternar.setAttribute('aria-label', aberto ? 'Recolher as missões do dia' : 'Mostrar as missões do dia');
        alternar.title = aberto ? 'Recolher as missões' : 'Mostrar as missões';
      };
      alternar.dataset.foco = 'quadro';
      alternar.addEventListener('click', () => {
        quadroAberto = quadroAberto !== true;
        pintarQuadro();
      });
      pintarQuadro();
      quadro.append(missoes.raiz, alternar);

      const inicio = el('div', 'menu-inicio');
      inicio.append(principal, quadro);

      const privacidade = el('a', 'menu-privacidade', 'Privacidade');
      privacidade.href = LINK_DE_PRIVACIDADE;
      privacidade.target = '_blank';
      privacidade.rel = 'noopener noreferrer';

      const anuncio = opcoes.espacoDeAnuncio?.() ?? null;
      mostrar('inicio', cabecalho('Escolha como jogar', true), aviso(texto ?? opcoes.avisoDaCarteira() ?? undefined), inicio, privacidade, ...(anuncio === null ? [] : [anuncio]));
      caixa.classList.add('inicio');
      painelDeMissoes = missoes;
      fimDoDiaMostrado = 0;
      desenharMissoes();
      // Voltar ao lobby é hora de pôr a carteira em dia: o progresso das missões mudou na última partida.
      opcoes.aoPrecisarDeMissoes();
      jogarLocal.focus();
    },

    atualizarMissoes: desenharMissoes,
    textoDasMissoes: () => (painelDeMissoes === null ? null : painelDeMissoes.texto()),
    atualizarBarra() {
      if (visivel) desenharBarra();
    },
    textoDaBarra: () => (visivel ? barra.innerText || barra.textContent : null),
    definirNomeDaConta(nome) {
      if (nome === nomeDaConta) return;
      nomeDaConta = nome;
      const campo = caixa.querySelector<HTMLInputElement>('input[name="apelido"]');
      if (campo !== null) {
        campo.value = apelidoDeAgora();
        campo.readOnly = nome !== null;
        campo.title = nome === null ? '' : 'O nome da mesa é o da sua conta. Mude no perfil.';
      }
      if (visivel) desenharBarra();
    },
    apelidoAtual: apelidoDeAgora,
    get tela() {
      return visivel ? telaAtual : null;
    },

    mostrarEntrar(codigo = '', texto) {
      const nome = campoDoApelido();
      const entradaCodigo = el('input', 'menu-entrada codigo');
      entradaCodigo.type = 'text';
      entradaCodigo.maxLength = TAMANHO_CODIGO + 2;
      entradaCodigo.placeholder = 'K7M2P';
      entradaCodigo.autocomplete = 'off';
      entradaCodigo.name = 'codigo';
      entradaCodigo.spellcheck = false;
      entradaCodigo.value = codigo;
      const enviar = (): void => {
        const nomeLimpo = nomeValido(nome);
        if (nomeLimpo === null) return;
        if (!codigoValido(entradaCodigo.value)) {
          entradaCodigo.focus();
          menu.mostrarAviso(`O código tem ${TAMANHO_CODIGO} letras e números (sem 0, 1, I, L e O).`);
          return;
        }
        opcoes.aoEntrar({ nome: nomeLimpo, codigo: limparCodigo(entradaCodigo.value) });
      };
      aoEnter(nome, enviar);
      aoEnter(entradaCodigo, enviar);
      const acoes = el('div', 'menu-acoes');
      acoes.append(
        botao('Voltar', 'menu-botao', () => menu.mostrarInicio()),
        botao('Entrar', 'menu-botao principal', enviar),
      );
      mostrar('entrar', cabecalho('Entrar numa sala'), aviso(texto), campo('Apelido', nome), campo('Código da sala', entradaCodigo), acoes);
      (codigo === '' ? entradaCodigo : nome.value === '' ? nome : entradaCodigo).focus();
    },

    mostrarCriar() {
      const nome = campoDoApelido();
      const enviar = (): void => {
        const nomeLimpo = nomeValido(nome);
        if (nomeLimpo !== null) opcoes.aoCriar({ nome: nomeLimpo, regras: escolhidas.sala });
      };
      aoEnter(nome, enviar);
      const acoes = el('div', 'menu-acoes');
      acoes.append(
        botao('Voltar', 'menu-botao', () => menu.mostrarInicio()),
        botao('Criar sala', 'menu-botao principal', enviar),
      );
      mostrar('criar', cabecalho('Criar uma sala'), aviso(undefined), campo('Apelido', nome), regrasDe('sala'), acoes);
      caixa.classList.add('com-regras');
      nome.focus();
    },

    mostrarLocal() {
      const jogar = botao('Jogar', 'menu-botao principal', () => opcoes.aoJogarLocal(escolhidas.local));
      const acoes = el('div', 'menu-acoes');
      acoes.append(botao('Voltar', 'menu-botao', () => menu.mostrarInicio()), jogar);
      const placarLocal = blocoDoPlacarLocal();
      mostrar('local', cabecalho('Jogar no mesmo PC'), aviso(undefined), ...(placarLocal === null ? [] : [placarLocal]), regrasDe('local'), acoes);
      caixa.classList.add('com-regras');
      jogar.focus();
    },

    mostrarExpulso(codigo, nome) {
      const voltar = botao('Voltar ao menu', 'menu-botao', () => menu.mostrarInicio());
      const entrarDeNovo = botao('Entrar de novo', 'menu-botao principal', () => opcoes.aoEntrar({ nome, codigo }));
      const acoes = el('div', 'menu-acoes');
      acoes.append(voltar, entrarDeNovo);
      mostrar(
        'expulso',
        cabecalho('Você foi removido da sala'),
        aviso(`O anfitrião tirou você da sala ${codigo}. Se foi engano, dá para entrar de novo pelo mesmo link.`, false),
        acoes,
      );
      voltar.focus();
    },

    mostrarRecarregar(texto) {
      const recarregar = botao('Recarregar a página', 'menu-botao principal', () => window.location.reload());
      const acoes = el('div', 'menu-acoes');
      acoes.append(recarregar);
      mostrar('recarregar', cabecalho('O jogo mudou de versão'), aviso(texto), acoes);
      recarregar.focus();
    },

    mostrarConectando(texto) {
      mostrar('conectando', cabecalho(texto), aviso(undefined), el('div', 'menu-carregando'));
    },

    mostrarEspera(modelo, link) {
      const codigo = el('div', 'menu-codigo');
      codigo.append(el('span', 'menu-codigo-rotulo', 'Código da sala'), el('span', 'menu-codigo-valor', modelo.codigo));

      const campoDoLink = el('input', 'menu-entrada link');
      campoDoLink.type = 'text';
      campoDoLink.readOnly = true;
      campoDoLink.name = 'link';
      campoDoLink.value = link;
      campoDoLink.addEventListener('focus', () => campoDoLink.select());
      const copiarBotao = botao('Copiar link', 'menu-botao', () => {
        void copiarTexto(link, campoDoLink).then((ok) => {
          copiarBotao.textContent = ok ? 'Link copiado!' : 'Selecione e copie (Ctrl+C)';
          setTimeout(() => (copiarBotao.textContent = 'Copiar link'), 2200);
        });
      });
      campoDoLink.title = 'Mande este link para os amigos';
      campoDoLink.setAttribute('aria-label', 'Link da sala: mande para os amigos');
      // O código e o link na mesma linha: a sala de espera de quatro tem de caber em 720 px.
      const convite = el('div', 'menu-convite');
      convite.append(codigo, campoDoLink, copiarBotao);

      const lugares = el('div', `menu-lugares modo-${modelo.modo}`);
      if (modelo.equipes.length === 0) {
        for (const a of modelo.assentos) lugares.append(cartaoDoLugar(a));
      } else {
        // 2x1 e 2x2: uma coluna por equipe (a de 2 e a de 1 lado a lado).
        lugares.classList.add('por-equipe');
        for (const equipe of modelo.equipes) {
          const coluna = el('div', `menu-equipe equipe-${equipe.equipe}`);
          coluna.dataset.equipe = String(equipe.equipe);
          const titulo = el('div', 'menu-equipe-titulo');
          titulo.append(el('span', 'menu-equipe-nome', equipe.rotulo), el('span', 'menu-equipe-tamanho', equipe.assentos.length === 1 ? 'sozinho' : 'dupla'));
          coluna.append(titulo, ...equipe.assentos.map(cartaoDoLugar));
          lugares.append(coluna);
        }
      }

      // As regras da sala: o anfitrião muda (e a sala avisa todos, que redesenham); os outros só veem o que está valendo.
      const regras = criarRegrasDaSala({
        regras: modelo.regras,
        catalogo,
        naSala: true,
        otimista: false,
        editavel: modelo.podeConfigurar,
        disponivel: opcoes.disponivel,
        aoMudar: (mudanca, novas) => {
          opcoes.aoConfigurarSala(mudanca);
          opcoes.aoLembrar('sala', novas);
        },
      });
      regras.raiz.dataset.onde = 'espera';
      // A física da sala (L42): "Física: padrão", ou o aviso em destaque quando o anfitrião a mexeu (missões e estatísticas não contam).
      const fisica = el('div', 'menu-fisica');
      fisica.classList.toggle('mexida', modelo.fisica.destaque);
      fisica.dataset.mexida = String(modelo.fisica.mexida);
      fisica.append(el('span', 'menu-fisica-texto', modelo.fisica.texto), el('span', 'menu-fisica-dica', modelo.fisica.souAnfitriao ? 'F1 abre a física da sala' : 'F1 mostra a física da sala'));
      regras.raiz.append(fisica);

      const acoes = el('div', 'menu-acoes');
      acoes.append(botao('Sair da sala', 'menu-botao', opcoes.aoSair));
      const loja = botao('Loja', 'menu-botao', opcoes.aoAbrirLoja);
      loja.dataset.foco = 'loja';
      acoes.append(loja);
      const iniciar = botao('Iniciar partida', 'menu-botao principal', opcoes.aoIniciar);
      if (modelo.podeIniciar) acoes.append(iniciar);
      const situacao = el('div', 'menu-situacao', modelo.aviso);
      if (modelo.souEspectador) situacao.textContent = 'Você está assistindo. Sente num lugar vago se houver.';
      else if (modelo.espectadores > 0) situacao.textContent += ` · ${modelo.espectadores} assistindo`;
      // O aviso e os botões na mesma linha: a sala de espera de quatro tem de caber em 720 px.
      const rodape = el('div', 'menu-rodape');
      rodape.append(situacao, acoes);

      // Em tela larga a espera é de duas colunas (quem está na mesa à esquerda, as regras à direita) e cabe em 720 px com o placar; em
      // tela estreita as duas viram uma pilha só (o CSS as deixa `display: contents`). A ordem do DOM, e com ela a do Tab, é a mesma.
      const placar = blocoDoPlacarDaSala(modelo.placar);
      const esquerda = el('div', 'menu-espera-esquerda');
      esquerda.append(convite, lugares, ...(placar === null ? [] : [placar]));
      const colunas = el('div', 'menu-espera-colunas');
      colunas.append(esquerda, regras.raiz);
      const manteveFoco = mostrar('espera', cabecalho(modelo.titulo), aviso(undefined), colunas, rodape);
      caixa.classList.add('espera', 'com-regras');
      if (modelo.podeIniciar && !manteveFoco) iniciar.focus();
    },

    mostrarAviso(texto) {
      if (!avisoEl) return;
      avisoEl.textContent = texto;
      avisoEl.hidden = texto === '';
    },

    esconder() {
      raiz.hidden = true;
      visivel = false;
      telaAtual = null;
      document.body.classList.remove('menu-aberto');
    },

    dispose() {
      window.clearInterval(relogioDasMissoes);
      window.removeEventListener('resize', aplicarEscala);
      raiz.removeEventListener('pointerover', aoPassarOMouse);
      raiz.removeEventListener('click', aoClicarEmBotao, true);
      engrenagem.removeEventListener('click', aoClicarEngrenagem);
      document.body.classList.remove('menu-aberto');
      raiz.remove();
    },
  };

  return menu;
}
