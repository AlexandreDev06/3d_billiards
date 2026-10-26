import type { ArmazenamentoMinimo } from '../armazenamento';
import { teclaEmCampo } from '../controles/campo';
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
}

export interface PainelDev {
  readonly aberto: boolean;
  alternar(): void;
  dispose(): void;
}

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
  const { estado, armazenamento } = opcoes;
  const padrao = estado.padrao;
  const raiz = document.createElement('aside');
  raiz.className = 'painel-dev';
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-label', 'Painel de física (dev)');

  const cabecalho = document.createElement('header');
  cabecalho.className = 'painel-dev-cabecalho';
  const titulo = document.createElement('strong');
  titulo.textContent = 'Painel de física';
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'hud-botao painel-dev-fechar';
  fechar.textContent = '×';
  fechar.setAttribute('aria-label', 'Fechar o painel');
  cabecalho.append(titulo, fechar);
  const nota = document.createElement('p');
  nota.className = 'painel-dev-nota';
  nota.textContent = 'A próxima tacada usa estes valores. F1 ou ` abre e fecha.';
  raiz.append(cabecalho, nota);

  const linhas: Linha[] = [];
  const notaDaLinha = document.createElement('p');
  notaDaLinha.className = 'painel-dev-nota painel-dev-nota-linha';
  notaDaLinha.textContent = 'Online a linha é regra da sala: só o anfitrião liga ou desliga, na sala de espera.';
  notaDaLinha.hidden = true;
  const grupos: GrupoDoPainel[] = ['fisica', 'forca', 'previsao'];
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
  const copiar = criarBotao('Copiar JSON');
  const lembrar = criarBotao('Lembrar');
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
  if (opcoes.avisoDosSalvos) dizer(opcoes.avisoDosSalvos);
  else if (opcoes.carregadoDoArmazenamento) dizer('Valores lembrados carregados.');

  const podeMexerNaLinha = (): boolean => opcoes.linhaEditavel?.() ?? true;
  const sincronizar = (): void => {
    const valores = estado.valores;
    const linhaLivre = podeMexerNaLinha();
    notaDaLinha.hidden = linhaLivre;
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
      linha.classList.toggle('alterado', atual !== padrao[descritor.chave]);
    }
  };

  const aoArrastar = (e: Event): void => {
    const controle = e.target as HTMLInputElement;
    estado.definir(controle.dataset.chave as ChaveDoPainel, controle.type === 'checkbox' ? Number(controle.checked) : Number(controle.value));
    sincronizar();
    dizer('');
  };
  const aoSoltarControle = (e: Event): void => (e.target as HTMLInputElement).blur();
  raiz.addEventListener('input', aoArrastar);
  raiz.addEventListener('change', aoSoltarControle);

  const aoRestaurar = (): void => {
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
  copiar.addEventListener('click', aoCopiar);
  lembrar.addEventListener('click', aoLembrar);

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
    if (e.code === 'F1' || e.code === 'Backquote') {
      e.preventDefault();
      if (!e.repeat) alternar();
    } else if (e.code === 'Escape' && abertoAgora) {
      definirAberto(false);
    } else if (e.code === 'KeyL' && !e.repeat && !teclaEmCampo(e.target) && podeMexerNaLinha()) {
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
    dispose() {
      window.removeEventListener('keydown', aoApertar);
      raiz.remove();
    },
  };
}
