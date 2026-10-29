import { TECLAS_DO_TREINO } from '../treino/teclas';
import type { ModeloDaAjuda } from './ajuda-modelo';

export interface LinhaDeAjuda {
  readonly teclas: readonly string[];
  readonly texto: string;
}

/** O que o botão esquerdo faz, conforme o controle de força que vale (a linha de força ou o empurrar). */
export const TEXTO_DA_TACADA: Readonly<Record<'linha' | 'empurrar', string>> = {
  linha: 'Tacada: segure, puxe o mouse para trás e solte',
  empurrar: 'Tacada: segure, puxe e empurre para bater',
};

export const LINHAS_DE_AJUDA: readonly LinhaDeAjuda[] = [
  { teclas: ['Mouse'], texto: 'Mirar (Shift: fina)' },
  { teclas: ['Botão esq.'], texto: TEXTO_DA_TACADA.linha },
  { teclas: ['Botão dir.'], texto: 'Orbitar a câmera' },
  { teclas: ['Roda'], texto: 'Zoom' },
  { teclas: ['Tab'], texto: 'Vista de cima' },
  { teclas: ['WASD'], texto: 'Efeito' },
  { teclas: ['G'], texto: 'Passar giz (segure para encadear)' },
  { teclas: ['B'], texto: 'Mostrar de novo as bolas da vez (segure)' },
  { teclas: ['M'], texto: 'Som / mudo' },
  { teclas: ['C'], texto: 'Configurações' },
  { teclas: ['F3'], texto: 'Diagnóstico de FPS' },
  { teclas: ['H'], texto: 'Ajuda e missões do dia' },
  { teclas: ['Enter'], texto: 'Chat (online)' },
  { teclas: ['1 a 8'], texto: 'Emoji (online); C ou ✎ escolhe quais' },
  { teclas: ['Esc'], texto: 'Soltar o mouse' },
];

const rotuloDaTecla = (code: string): string => (code.startsWith('Key') ? code.slice(3) : code);

/** As teclas do modo treino (L42), que a ajuda só mostra no treino: as mesmas de `TECLAS_DO_TREINO`, que o jogo escuta. */
export const LINHAS_DO_TREINO: readonly LinhaDeAjuda[] = [
  { teclas: [rotuloDaTecla(TECLAS_DO_TREINO.bolaNaMao)], texto: 'Treino: bola na mão (arraste a branca)' },
  { teclas: [rotuloDaTecla(TECLAS_DO_TREINO.arrumar), rotuloDaTecla(TECLAS_DO_TREINO.tirarBola)], texto: 'Treino: arrumar a mesa; X tira a bola sob o mouse' },
  { teclas: [rotuloDaTecla(TECLAS_DO_TREINO.refazer)], texto: 'Treino: refazer a última tacada' },
  { teclas: [rotuloDaTecla(TECLAS_DO_TREINO.novoTriangulo)], texto: 'Treino: novo triângulo' },
  { teclas: [rotuloDaTecla(TECLAS_DO_TREINO.cenarios)], texto: 'Treino: cenários prontos' },
];

export interface HudAjuda {
  /** Mostra (ou esconde) as linhas do treino. */
  definirTreino(ativo: boolean): void;
  /** Troca o texto da linha do botão esquerdo (a tacada) quando o controle de força muda. */
  definirTacada(controle: 'linha' | 'empurrar'): void;
  dispose(): void;
}

/**
 * Chip "Ajuda H" sempre visível e, abaixo dele, o cartão de controles que a tecla H recolhe. Com `aoCreditos`, o cartão
 * leva o botão que abre a tela de créditos.
 */
export function criarAjuda(
  paiDoChip: HTMLElement,
  paiDoCartao: HTMLElement,
  modelo: ModeloDaAjuda,
  linhas: readonly LinhaDeAjuda[],
  aoCreditos?: () => void,
  linhasDoTreino: readonly LinhaDeAjuda[] = [],
): HudAjuda {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'hud-botao hud-ajuda-chip';
  chip.innerHTML = 'Ajuda <kbd class="hud-tecla">H</kbd>';
  chip.setAttribute('aria-controls', 'hud-ajuda-cartao');

  const cartao = document.createElement('div');
  cartao.id = 'hud-ajuda-cartao';
  cartao.className = 'hud-ajuda';
  const titulo = document.createElement('div');
  titulo.className = 'hud-ajuda-titulo';
  titulo.textContent = 'Controles';
  let tacadaEl: HTMLElement | null = null;
  const lista = document.createElement('dl');
  lista.className = 'hud-ajuda-lista';
  for (const linha of linhas) {
    const teclas = document.createElement('dt');
    for (const tecla of linha.teclas) {
      const kbd = document.createElement('kbd');
      kbd.className = 'hud-tecla';
      kbd.textContent = tecla;
      teclas.append(kbd);
    }
    const texto = document.createElement('dd');
    texto.textContent = linha.texto;
    if (linha.texto === TEXTO_DA_TACADA.linha) {
      texto.dataset.linha = 'tacada';
      tacadaEl = texto;
    }
    lista.append(teclas, texto);
  }
  // As linhas do treino entram no fim da lista e ficam escondidas fora do treino.
  const doTreino: HTMLElement[] = [];
  for (const linha of linhasDoTreino) {
    const teclas = document.createElement('dt');
    teclas.hidden = true;
    for (const tecla of linha.teclas) {
      const kbd = document.createElement('kbd');
      kbd.className = 'hud-tecla';
      kbd.textContent = tecla;
      teclas.append(kbd);
    }
    const texto = document.createElement('dd');
    texto.hidden = true;
    texto.textContent = linha.texto;
    doTreino.push(teclas, texto);
    lista.append(teclas, texto);
  }
  cartao.append(titulo, lista);
  let botaoCreditos: HTMLButtonElement | null = null;
  const aoClicarCreditos = (): void => {
    botaoCreditos?.blur();
    aoCreditos?.();
  };
  if (aoCreditos) {
    botaoCreditos = document.createElement('button');
    botaoCreditos.type = 'button';
    botaoCreditos.className = 'hud-botao hud-ajuda-creditos';
    botaoCreditos.textContent = 'Créditos dos sons';
    botaoCreditos.addEventListener('click', aoClicarCreditos);
    cartao.append(botaoCreditos);
  }
  paiDoChip.append(chip);
  paiDoCartao.append(cartao);

  const mostrar = (aberta: boolean): void => {
    cartao.hidden = !aberta;
    chip.setAttribute('aria-expanded', String(aberta));
  };
  const aoClicar = (): void => {
    modelo.alternar();
    chip.blur();
  };
  chip.addEventListener('click', aoClicar);
  const parar = modelo.aoMudar(mostrar);
  mostrar(modelo.aberta);

  return {
    definirTreino(ativo) {
      for (const el of doTreino) el.hidden = !ativo;
    },
    definirTacada(controle) {
      if (tacadaEl) tacadaEl.textContent = TEXTO_DA_TACADA[controle];
    },
    dispose() {
      parar();
      chip.removeEventListener('click', aoClicar);
      botaoCreditos?.removeEventListener('click', aoClicarCreditos);
      chip.remove();
      cartao.remove();
    },
  };
}
