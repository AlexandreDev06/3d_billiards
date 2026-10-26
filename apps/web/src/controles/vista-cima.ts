export interface EntradaVistaDeCima {
  /** Meia extensão da mesa com a moldura, ao longo de X e de Z (m). */
  readonly semiX: number;
  readonly semiZ: number;
  readonly campoDeVisaoGraus: number;
  /** Largura / altura da tela. */
  readonly aspecto: number;
  /** Folga em volta da mesa; 1 = encosta nas bordas da área livre. */
  readonly margem: number;
  /** Fração da largura da tela coberta pelo HUD à esquerda e à direita. */
  readonly reservaEsquerda: number;
  readonly reservaDireita: number;
  readonly zoom: number;
}

export interface AjusteVistaDeCima {
  /** Altura da câmera sobre o centro da mesa (m). */
  readonly altura: number;
  /** Quanto o desenho desce para a direita, em fração da largura da tela: o centro da área livre fica no centro da mesa. */
  readonly deslocamento: number;
}

/** Sobra mínima de largura para a mesa, mesmo com uma tela estreita demais para o HUD. */
const LARGURA_LIVRE_MINIMA = 0.4;

/**
 * Altura e deslocamento da vista de cima para a mesa inteira caber na faixa
 * da tela que o HUD não cobre (pura, sem three).
 */
export function ajusteDaVistaDeCima(e: EntradaVistaDeCima): AjusteVistaDeCima {
  const tanMeio = Math.tan((e.campoDeVisaoGraus * Math.PI) / 360);
  const livre = Math.max(1 - e.reservaEsquerda - e.reservaDireita, LARGURA_LIVRE_MINIMA);
  const altura = Math.max(e.semiZ / tanMeio, e.semiX / (tanMeio * e.aspecto * livre)) * e.margem * e.zoom;
  return { altura, deslocamento: (e.reservaEsquerda - e.reservaDireita) / 2 };
}
