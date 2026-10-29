import type { IdBola } from '@sinuca/fisica';
import { fichaDaBola, type CasaDasBolas } from '../cena/bola-estilo';
import type { IdDoCenario } from '../treino/cenarios';
import { TECLAS_DO_TREINO } from '../treino/teclas';
import { criarFicha } from './placar';
import type { HudDoTreinoNaTela } from './treino-modelo';

export interface OpcoesHudTreino {
  /** As bolas da casa do treino (o desenho das fichas da bandeja). */
  readonly casa: CasaDasBolas;
  /** Os cenários prontos que o seletor lista. */
  readonly cenarios: readonly { readonly id: IdDoCenario; readonly nome: string; readonly descricao: string }[];
  readonly aoBolaNaMao: () => void;
  readonly aoArrumar: () => void;
  readonly aoRefazer: () => void;
  readonly aoNovoTriangulo: () => void;
  readonly aoEscolherCenario: (id: IdDoCenario) => void;
  /** Clicou numa ficha da bandeja: a bola volta à mesa. */
  readonly aoDevolver: (bola: IdBola) => void;
  /** O seletor de cenários abriu (quem chama solta o mouse para dar para clicar). */
  readonly aoAbrirCenarios: () => void;
}

export interface HudTreino {
  /** Liga o HUD do treino (e esconde o placar de partida, pela classe `modo-treino` do `body`); desligado some tudo. */
  mostrar(ativo: boolean): void;
  /** Redesenha só o que mudou. */
  atualizar(h: HudDoTreinoNaTela): void;
  /** Abre ou fecha o seletor de cenários. */
  definirCenarios(aberto: boolean): void;
  readonly cenariosAbertos: boolean;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly texto: string; readonly cenarios: boolean; readonly bandeja: readonly number[]; readonly botoes: readonly { readonly tecla: string; readonly ativo: boolean; readonly desabilitado: boolean }[] };
  dispose(): void;
}

function elemento<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

const rotulo = (code: string): string => (code.startsWith('Key') ? code.slice(3) : code);

/**
 * O HUD do treino (L42): em cima à esquerda o cartão "Treino" (as bolas que restam, as tacadas dadas, o cenário armado e a dica do
 * modo da mão), embaixo à esquerda as ferramentas (bola na mão, arrumar, refazer, novo triângulo, cenários) com a tecla de cada uma,
 * o seletor de cenários ao lado e, arrumando a mesa, a bandeja com as bolas tiradas. Sem placar de adversário.
 */
export function criarHudTreino(paiDoCartao: HTMLElement, paiDasFerramentas: HTMLElement, opcoes: OpcoesHudTreino): HudTreino {
  const cartao = elemento('div', 'treino-cartao');
  cartao.hidden = true;
  const titulo = elemento('div', 'treino-titulo', 'Treino');
  const numeros = elemento('div', 'treino-numeros');
  const bolasEl = elemento('span', 'treino-bolas');
  const tacadasEl = elemento('span', 'treino-tacadas');
  numeros.append(bolasEl, tacadasEl);
  const cenarioEl = elemento('div', 'treino-cenario');
  const cenarioNome = elemento('strong', 'treino-cenario-nome');
  const cenarioDescricao = elemento('p', 'treino-cenario-descricao');
  cenarioEl.append(cenarioNome, cenarioDescricao);
  const dicaEl = elemento('p', 'treino-dica');
  cartao.append(titulo, numeros, cenarioEl, dicaEl);
  paiDoCartao.prepend(cartao);

  const ferramentas = elemento('div', 'treino-ferramentas');
  ferramentas.hidden = true;
  const bandeja = elemento('div', 'treino-bandeja');
  bandeja.hidden = true;
  bandeja.setAttribute('aria-label', 'Bolas tiradas da mesa');
  const bandejaTitulo = elemento('span', 'treino-bandeja-titulo', 'Bandeja');
  const fichas = elemento('span', 'treino-bandeja-fichas');
  bandeja.append(bandejaTitulo, fichas);

  const barra = elemento('div', 'treino-barra');
  const botoes = new Map<string, HTMLButtonElement>();
  const novoBotao = (chave: string, code: string, texto: string, dica: string, acao: () => void): void => {
    const b = elemento('button', 'hud-botao treino-botao');
    b.type = 'button';
    b.title = dica;
    const tecla = elemento('kbd', 'hud-tecla', rotulo(code));
    b.append(tecla, elemento('span', 'treino-botao-texto', texto));
    b.addEventListener('click', () => {
      b.blur();
      acao();
    });
    b.dataset.tecla = rotulo(code);
    botoes.set(chave, b);
    barra.append(b);
  };
  novoBotao('bolaNaMao', TECLAS_DO_TREINO.bolaNaMao, 'Bola na mão', 'Arraste a branca para onde quiser', opcoes.aoBolaNaMao);
  novoBotao('arrumar', TECLAS_DO_TREINO.arrumar, 'Arrumar a mesa', 'Arraste, tire e devolva bolas', opcoes.aoArrumar);
  novoBotao('refazer', TECLAS_DO_TREINO.refazer, 'Refazer a tacada', 'Volta à mesa de antes da última tacada', opcoes.aoRefazer);
  novoBotao('novoTriangulo', TECLAS_DO_TREINO.novoTriangulo, 'Novo triângulo', 'Arruma a mesa de novo', opcoes.aoNovoTriangulo);
  let cenariosAbertosAgora = false;
  const cenarios = elemento('div', 'treino-cenarios');
  cenarios.hidden = true;
  const alternarCenarios = (): void => definirCenarios(!cenariosAbertosAgora);
  novoBotao('cenarios', TECLAS_DO_TREINO.cenarios, 'Cenários', 'Mesas prontas para treinar uma jogada', alternarCenarios);
  cenarios.append(elemento('div', 'treino-cenarios-titulo', 'Cenários prontos'));
  for (const c of opcoes.cenarios) {
    const item = elemento('button', 'hud-botao treino-cenario-item');
    item.type = 'button';
    item.dataset.cenario = c.id;
    item.append(elemento('strong', 'treino-cenario-item-nome', c.nome), elemento('span', 'treino-cenario-item-descricao', c.descricao));
    item.addEventListener('click', () => {
      item.blur();
      definirCenarios(false);
      opcoes.aoEscolherCenario(c.id);
    });
    cenarios.append(item);
  }
  ferramentas.append(bandeja, barra, cenarios);
  paiDasFerramentas.append(ferramentas);

  function definirCenarios(aberto: boolean): void {
    if (aberto === cenariosAbertosAgora) return;
    cenariosAbertosAgora = aberto;
    cenarios.hidden = !aberto;
    botoes.get('cenarios')?.classList.toggle('ativo', aberto);
    if (aberto) opcoes.aoAbrirCenarios();
  }

  let ativo = false;
  let ultimaChave = '';
  return {
    mostrar(on) {
      ativo = on;
      cartao.hidden = !on;
      ferramentas.hidden = !on;
      document.body.classList.toggle('modo-treino', on);
      if (!on) {
        definirCenarios(false);
        ultimaChave = '';
      }
    },
    atualizar(h) {
      const chave = JSON.stringify(h);
      if (chave === ultimaChave) return;
      ultimaChave = chave;
      bolasEl.textContent = h.bolas;
      tacadasEl.textContent = h.tacadas;
      cartao.classList.toggle('mesa-limpa', h.mesaLimpa);
      cenarioEl.hidden = h.cenario === null;
      cenarioNome.textContent = h.cenario?.nome ?? '';
      cenarioDescricao.textContent = h.cenario?.descricao ?? '';
      dicaEl.hidden = h.dica === null;
      dicaEl.textContent = h.dica ?? '';
      const marcar = (chave2: string, aceso: boolean, desabilitado = false): void => {
        const b = botoes.get(chave2);
        if (!b) return;
        b.classList.toggle('ativo', aceso);
        b.setAttribute('aria-pressed', String(aceso));
        b.disabled = desabilitado;
      };
      marcar('bolaNaMao', h.modo === 'branca');
      marcar('arrumar', h.modo === 'arrumar');
      marcar('refazer', false, !h.refazerAtivo);
      bandeja.hidden = !h.mostrarBandeja;
      bandeja.classList.toggle('vazia', h.bandeja.length === 0);
      fichas.replaceChildren(
        ...h.bandeja.map((id) => {
          const b = elemento('button', 'treino-ficha-botao');
          b.type = 'button';
          b.title = `Devolver a ${id} à mesa`;
          b.setAttribute('aria-label', `Devolver a bola ${id} à mesa`);
          b.dataset.bola = String(id);
          b.append(criarFicha(fichaDaBola(id, opcoes.casa)));
          b.addEventListener('click', () => {
            b.blur();
            opcoes.aoDevolver(id);
          });
          return b;
        }),
      );
      if (h.mostrarBandeja && h.bandeja.length === 0) fichas.textContent = 'vazia: X tira a bola sob o mouse';
    },
    definirCenarios,
    get cenariosAbertos() {
      return cenariosAbertosAgora;
    },
    estado: () => ({
      visivel: ativo,
      texto: ativo ? [bolasEl.textContent, tacadasEl.textContent, cenarioEl.hidden ? '' : cenarioNome.textContent, dicaEl.hidden ? '' : dicaEl.textContent].filter((t) => t).join(' | ') : '',
      cenarios: cenariosAbertosAgora,
      bandeja: [...fichas.querySelectorAll<HTMLElement>('[data-bola]')].filter((e) => e.tagName === 'BUTTON').map((e) => Number(e.dataset.bola)),
      botoes: [...botoes.values()].map((b) => ({ tecla: b.dataset.tecla ?? '', ativo: b.classList.contains('ativo'), desabilitado: b.disabled })),
    }),
    dispose() {
      document.body.classList.remove('modo-treino');
      cartao.remove();
      ferramentas.remove();
    },
  };
}
