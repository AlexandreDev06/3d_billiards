import { sanearFisicaDaSala, type FisicaParcial } from '@sinuca/protocolo';
import type { ArmazenamentoMinimo } from '../armazenamento';
import { teclaEmCampo } from '../controles/campo';
import { NOTA_DA_FISICA_TRAVADA, juntarPedidos, pedidoDeUmaChave, valoresDaFisicaNoPainel, type ModoDoPainelDeFisica } from '../online/fisica-da-sala-modelo';
import {
  DESCRITORES,
  esquecerValores,
  jsonDoPainel,
  salvarValores,
  type ChaveDoPainel,
  type Descritor,
  type EstadoDoPainel,
  type GrupoDoPainel,
} from './parametros';

export interface OpcoesPainelDev {
  /**
   * Modo dev (`?dev=1` ou o Vite dev): os grupos de força e de previsão, "Lembrar", "Copiar JSON" e as teclas ` e L. Sem ele o
   * painel (F1) é o dos jogadores: só o grupo de física, para o anfitrião mexer na sala ou para quem treina.
   */
  readonly dev: boolean;
  readonly estado: EstadoDoPainel;
  readonly armazenamento: ArmazenamentoMinimo | null;
  /** Há valores lembrados de outra visita já aplicados ao abrir. */
  readonly carregadoDoArmazenamento: boolean;
  /** O que foi descartado do que estava lembrado (o padrão mudou); vazio se nada. Aparece no painel no lugar do "carregados". */
  readonly avisoDosSalvos?: string;
  /** O painel abriu: solte o mouse (Pointer Lock) para os sliders poderem ser usados. */
  readonly aoAbrir?: () => void;
  /**
   * Dá para ligar e desligar a linha de previsão por aqui (e pela tecla L)? Online ela é regra da sala, igual para todos:
   * sem isto o painel mostra só a nota e a tecla L não faz nada. Ausente = sempre dá.
   */
  readonly linhaEditavel?: () => boolean;
  /**
   * De onde a física vem agora (`modoDoPainelDeFisica`): sem sala os sliders mexem na física local; anfitrião, na da sala; os
   * outros só leem a da sala. Ausente = sempre local.
   */
  readonly fisica?: () => ModoDoPainelDeFisica;
  /** Anfitrião: um pedido de física para a sala (`configurar-sala.fisica`); `null` restaura o padrão. Já vem limpo (`sanearFisicaDaSala`). */
  readonly aoPedirFisicaDaSala?: (pedido: FisicaParcial | null) => void;
}

export interface PainelDev {
  readonly aberto: boolean;
  alternar(): void;
  /** Redesenha com o que vale agora (chegou um `estado-sala`, o aparelho entrou ou saiu da sala, a sala recusou um pedido). */
  atualizar(): void;
  /** A linha de status de baixo (por exemplo, o motivo de a sala ter recusado a física). */
  dizer(texto: string): void;
  dispose(): void;
}

/** Espera antes de mandar à sala o que o slider andou: um pedido por pausa, não um por pixel. */
const ESPERA_DO_PEDIDO_MS = 150;

const TITULOS: Readonly<Record<GrupoDoPainel, string>> = {
  fisica: 'Física',
  forca: 'Força da tacada (controle e curva do empurrar)',
  previsao: 'Linha de previsão (L liga e desliga no hot-seat)',
};

const casas = (passo: number): number => (String(passo).split('.')[1] ?? '').length;

interface Linha {
  readonly descritor: Descritor;
  readonly raiz: HTMLElement;
  /** Slider, ou caixa de seleção nos interruptores (`descritor.tipo === 'chave'`). */
  readonly controle: HTMLInputElement;
  readonly valor: HTMLElement;
}

/** As chaves da linha de previsão que a sala decide online. */
const CHAVES_DA_LINHA: ReadonlySet<ChaveDoPainel> = new Set<ChaveDoPainel>(['previsaoLigada', 'previsaoBolaAtingida']);

/** Painel de ajuste da física (F1 ou `): sliders ligados ao `EstadoDoPainel`. */
export function criarPainelDev(pai: HTMLElement, opcoes: OpcoesPainelDev): PainelDev {
  const { estado, armazenamento, dev } = opcoes;
  const padrao = estado.padrao;
  const modoDaFisica = (): ModoDoPainelDeFisica => opcoes.fisica?.() ?? { tipo: 'local' };
  const raiz = document.createElement('aside');
  raiz.className = 'painel-dev';
  if (!dev) raiz.classList.add('painel-fisica');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-label', dev ? 'Painel de física (dev)' : 'Física da partida');

  const cabecalho = document.createElement('header');
  cabecalho.className = 'painel-dev-cabecalho';
  const titulo = document.createElement('strong');
  titulo.textContent = dev ? 'Painel de física' : 'Física da partida';
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'hud-botao painel-dev-fechar';
  fechar.textContent = '×';
  fechar.setAttribute('aria-label', 'Fechar o painel');
  cabecalho.append(titulo, fechar);
  const nota = document.createElement('p');
  nota.className = 'painel-dev-nota painel-dev-nota-fonte';
  raiz.append(cabecalho, nota);

  const linhas: Linha[] = [];
  const notaDaLinha = document.createElement('p');
  notaDaLinha.className = 'painel-dev-nota painel-dev-nota-linha';
  notaDaLinha.textContent = 'Online a linha é regra da sala: só o anfitrião liga ou desliga, na sala de espera.';
  notaDaLinha.hidden = true;
  const grupos: GrupoDoPainel[] = dev ? ['fisica', 'forca', 'previsao'] : ['fisica'];
  for (const grupo of grupos) {
    const secao = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = TITULOS[grupo];
    secao.append(h);
    if (grupo === 'previsao') secao.append(notaDaLinha);
    for (const descritor of DESCRITORES.filter((d) => d.grupo === grupo)) {
      const linha = document.createElement('label');
      linha.className = 'painel-dev-linha';
      linha.title = descritor.dica;
      const nome = document.createElement('span');
      nome.className = 'painel-dev-nome';
      nome.textContent = descritor.rotulo;
      const valor = document.createElement('span');
      valor.className = 'painel-dev-valor';
      const controle = document.createElement('input');
      if (descritor.tipo === 'chave') {
        controle.type = 'checkbox';
        linha.classList.add('painel-dev-chave');
      } else {
        controle.type = 'range';
        controle.min = String(descritor.min);
        controle.max = String(descritor.max);
        controle.step = String(descritor.passo);
      }
      controle.dataset.chave = descritor.chave;
      controle.setAttribute('aria-label', descritor.rotulo);
      controle.name = descritor.chave;
      linha.append(nome, valor, controle);
      secao.append(linha);
      linhas.push({ descritor, raiz: linha, controle, valor });
    }
    raiz.append(secao);
  }

  const botoes = document.createElement('div');
  botoes.className = 'painel-dev-botoes';
  const criarBotao = (texto: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-botao';
    b.textContent = texto;
    botoes.append(b);
    return b;
  };
  const restaurar = criarBotao('Restaurar padrão');
  const copiar = dev ? criarBotao('Copiar JSON') : null;
  const lembrar = dev ? criarBotao('Lembrar') : null;
  const status = document.createElement('p');
  status.className = 'painel-dev-status';
  status.setAttribute('aria-live', 'polite');
  const json = document.createElement('textarea');
  json.className = 'painel-dev-json';
  json.name = 'json';
  json.readOnly = true;
  json.rows = 8;
  json.hidden = true;
  raiz.append(botoes, status, json);
  pai.append(raiz);

  const dizer = (texto: string): void => {
    status.textContent = texto;
  };
  if (dev && opcoes.avisoDosSalvos) dizer(opcoes.avisoDosSalvos);
  else if (dev && opcoes.carregadoDoArmazenamento) dizer('Valores lembrados carregados.');

  const podeMexerNaLinha = (): boolean => opcoes.linhaEditavel?.() ?? true;
  /** O que o anfitrião mexeu e ainda não voltou da sala: o slider fica onde o dedo o pôs até a sala responder (`atualizar`). */
  let enviados: Partial<Record<ChaveDoPainel, number>> = {};
  const textoDaFonte = (modo: ModoDoPainelDeFisica): string => {
    switch (modo.tipo) {
      case 'local':
        return dev ? 'A próxima tacada usa estes valores. F1 ou ` abre e fecha.' : 'Vale para as suas tacadas, neste aparelho. F1 abre e fecha.';
      case 'anfitriao':
        return 'Você é o anfitrião: o que mudar vale para todos da sala, da próxima tacada em diante. Física mexida: missões e estatísticas não contam.';
      case 'travada':
        return NOTA_DA_FISICA_TRAVADA;
      case 'leitura':
        return modo.mexida ? 'Física da sala, mexida pelo anfitrião (só ele muda): missões e estatísticas não contam.' : 'Física padrão da sala. Só o anfitrião pode mexer.';
    }
  };
  const sincronizar = (): void => {
    const modo = modoDaFisica();
    const valores = { ...valoresDaFisicaNoPainel(modo, estado.valores), ...enviados } as typeof estado.valores;
    const linhaLivre = podeMexerNaLinha();
    const soLeitura = modo.tipo === 'leitura' || modo.tipo === 'travada';
    nota.textContent = textoDaFonte(modo);
    nota.classList.toggle('travada', modo.tipo === 'travada');
    notaDaLinha.hidden = linhaLivre;
    restaurar.disabled = soLeitura;
    for (const { descritor, raiz: linha, controle, valor } of linhas) {
      linha.hidden = !linhaLivre && CHAVES_DA_LINHA.has(descritor.chave);
      const atual = valores[descritor.chave];
      if (descritor.tipo === 'chave') {
        controle.checked = atual === 1;
        valor.textContent = atual === 1 ? 'ligada' : 'desligada';
      } else {
        controle.value = String(atual);
        valor.textContent = `${atual.toFixed(casas(descritor.passo))}${descritor.unidade ? ` ${descritor.unidade}` : ''}`;
      }
      controle.disabled = soLeitura && descritor.grupo === 'fisica';
      linha.classList.toggle('alterado', atual !== padrao[descritor.chave]);
    }
  };

  /** Os pedidos que o anfitrião ainda não mandou à sala (juntos, num só). */
  let pedidosPendentes: FisicaParcial[] = [];
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  const mandarPedidos = (): void => {
    temporizador = null;
    if (pedidosPendentes.length === 0) return;
    const pedido = sanearFisicaDaSala(juntarPedidos(pedidosPendentes));
    pedidosPendentes = [];
    if (Object.keys(pedido).length > 0) opcoes.aoPedirFisicaDaSala?.(pedido);
  };

  const aoArrastar = (e: Event): void => {
    const controle = e.target as HTMLInputElement;
    const chave = controle.dataset.chave as ChaveDoPainel;
    const valor = controle.type === 'checkbox' ? Number(controle.checked) : Number(controle.value);
    const descritor = DESCRITORES.find((d) => d.chave === chave);
    if (descritor?.grupo === 'fisica' && modoDaFisica().tipo !== 'local') {
      // Online, anfitrião: o slider mexe na física da sala (cada pausa vira um pedido); fica no valor do dedo até a sala responder.
      if (modoDaFisica().tipo !== 'anfitriao') return sincronizar();
      enviados = { ...enviados, [chave]: valor };
      pedidosPendentes.push(pedidoDeUmaChave(chave as Parameters<typeof pedidoDeUmaChave>[0], valor));
      if (temporizador !== null) clearTimeout(temporizador);
      temporizador = setTimeout(mandarPedidos, ESPERA_DO_PEDIDO_MS);
    } else estado.definir(chave, valor);
    sincronizar();
    dizer('');
  };
  const aoSoltarControle = (e: Event): void => (e.target as HTMLInputElement).blur();
  raiz.addEventListener('input', aoArrastar);
  raiz.addEventListener('change', aoSoltarControle);

  const aoRestaurar = (): void => {
    const modo = modoDaFisica();
    if (modo.tipo === 'anfitriao') {
      // Online: o padrão que se restaura é o da sala (`null`); os valores locais do painel não entram.
      pedidosPendentes = [];
      if (temporizador !== null) clearTimeout(temporizador);
      temporizador = null;
      enviados = {};
      opcoes.aoPedirFisicaDaSala?.(null);
      sincronizar();
      dizer('Pedi à sala a física padrão.');
      return;
    }
    if (modo.tipo !== 'local') return;
    estado.restaurar();
    esquecerValores(armazenamento);
    sincronizar();
    json.hidden = true;
    dizer('Padrão restaurado; nada lembrado.');
  };
  const aoCopiar = async (): Promise<void> => {
    const texto = jsonDoPainel(estado.valores);
    try {
      await navigator.clipboard.writeText(texto);
      json.hidden = true;
      dizer('JSON copiado.');
    } catch {
      json.value = texto;
      json.hidden = false;
      json.select();
      dizer('Não consegui copiar sozinho: o JSON está selecionado, use Ctrl+C.');
    }
  };
  const aoLembrar = (): void => {
    dizer(salvarValores(estado.valores, padrao, armazenamento) ? 'Lembrado neste navegador.' : 'Armazenamento indisponível: nada foi lembrado.');
  };
  restaurar.addEventListener('click', aoRestaurar);
  copiar?.addEventListener('click', aoCopiar);
  lembrar?.addEventListener('click', aoLembrar);

  let abertoAgora = false;
  const definirAberto = (aberto: boolean): void => {
    if (aberto === abertoAgora) return;
    abertoAgora = aberto;
    raiz.hidden = !aberto;
    if (aberto) {
      sincronizar();
      opcoes.aoAbrir?.();
    }
  };
  const alternar = (): void => definirAberto(!abertoAgora);
  const aoFechar = (): void => definirAberto(false);
  fechar.addEventListener('click', aoFechar);

  const aoApertar = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'F1' || (dev && e.code === 'Backquote')) {
      e.preventDefault();
      if (!e.repeat) alternar();
    } else if (e.code === 'Escape' && abertoAgora) {
      definirAberto(false);
    } else if (dev && e.code === 'KeyL' && !e.repeat && !teclaEmCampo(e.target) && podeMexerNaLinha()) {
      estado.alternar('previsaoLigada');
      sincronizar();
      dizer(`Linha de previsão ${estado.valores.previsaoLigada === 1 ? 'ligada' : 'desligada'}.`);
    }
  };
  window.addEventListener('keydown', aoApertar);
  sincronizar();

  return {
    get aberto() {
      return abertoAgora;
    },
    alternar,
    atualizar() {
      // A sala respondeu (ou recusou): o que o dedo pôs dá lugar ao que ela tem.
      enviados = {};
      if (abertoAgora || !raiz.hidden) sincronizar();
    },
    dizer,
    dispose() {
      window.removeEventListener('keydown', aoApertar);
      if (temporizador !== null) clearTimeout(temporizador);
      raiz.remove();
    },
  };
}
