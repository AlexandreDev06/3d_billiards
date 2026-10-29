import type { Ponto2 } from '@sinuca/fisica';

export interface DependenciasArraste {
  readonly canvas: HTMLCanvasElement;
  /** A mão está livre para pegar bola (bola na mão ou arrumar a mesa)? Fora disso o canvas é do jogo e nada aqui age. */
  readonly ativo: () => boolean;
  /** Onde, no pano, cai o ponto da tela (px do canvas); `null` se não cai (a câmera olha para o céu). */
  readonly pontoNaMesa: (px: number, py: number) => Ponto2 | null;
  /** O botão esquerdo desceu sobre o pano em `ponto`. */
  readonly aoPegar: (ponto: Ponto2) => void;
  /** O ponteiro andou (com a bola na mão, ou só passeando: serve à tecla X, que tira a bola sob o mouse). */
  readonly aoMover: (ponto: Ponto2, segurando: boolean) => void;
  /** O botão subiu: larga a bola. */
  readonly aoSoltar: () => void;
}

export interface Arraste {
  /** O último ponto do pano sob o mouse; `null` se o mouse não passou sobre o pano ou saiu da tela. */
  readonly ultimoPonto: Ponto2 | null;
  dispose(): void;
}

/**
 * O mouse livre do treino (DOM): com a mão ativa o botão esquerdo pega a bola sob o cursor, o ponteiro a leva e soltar a larga.
 * Só traduz o ponteiro em pontos do pano; quem decide o que pegar, onde cabe e o que mostrar é `EditorDaMesa` (puro). O ponteiro
 * é capturado no canvas enquanto a bola está na mão, para soltar fora da janela também soltar.
 */
export function ligarArraste(d: DependenciasArraste): Arraste {
  const { canvas } = d;
  let segurando = false;
  let ultimo: Ponto2 | null = null;

  const ponto = (e: PointerEvent): Ponto2 | null => {
    const r = canvas.getBoundingClientRect();
    return d.pontoNaMesa(((e.clientX - r.left) / r.width) * canvas.clientWidth, ((e.clientY - r.top) / r.height) * canvas.clientHeight);
  };

  const aoPressionar = (e: PointerEvent): void => {
    if (e.button !== 0 || !d.ativo()) return;
    const p = ponto(e);
    if (p === null) return;
    e.preventDefault();
    segurando = true;
    ultimo = p;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Sem captura (evento sintético, navegador sem suporte): o arraste segue pelo `window`.
    }
    d.aoPegar(p);
  };

  const aoMover = (e: PointerEvent): void => {
    if (!d.ativo()) {
      ultimo = null;
      return;
    }
    const alvoNoCanvas = e.target === canvas || segurando;
    const p = alvoNoCanvas ? ponto(e) : null;
    ultimo = p;
    if (p !== null) d.aoMover(p, segurando);
  };

  const soltar = (): void => {
    if (!segurando) return;
    segurando = false;
    d.aoSoltar();
  };
  const aoSoltarBotao = (e: PointerEvent): void => {
    if (e.button === 0) soltar();
  };

  canvas.addEventListener('pointerdown', aoPressionar);
  window.addEventListener('pointermove', aoMover);
  window.addEventListener('pointerup', aoSoltarBotao);
  window.addEventListener('pointercancel', soltar);
  window.addEventListener('blur', soltar);

  return {
    get ultimoPonto() {
      return ultimo;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', aoPressionar);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltarBotao);
      window.removeEventListener('pointercancel', soltar);
      window.removeEventListener('blur', soltar);
    },
  };
}
