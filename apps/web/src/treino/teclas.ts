import type { ModoDaMao } from './sessao-de-treino';

/** O que cada tecla do treino pede; `null` = a tecla não é do treino. */
export type AcaoDoTreino = 'bola-na-mao' | 'arrumar' | 'refazer' | 'novo-triangulo' | 'cenarios' | 'tirar-bola' | 'sair-do-modo';

/**
 * As teclas do treino, escolhidas entre as que o jogo não usa (A B C D G H L M S W, Tab, Esc, F1, F3 e 1 a 8 online):
 * P bola na mão, E arrumar a mesa, R refazer a tacada, N novo triângulo, T cenários prontos, X ou Delete tira a bola sob o mouse
 * (no modo arrumar). Esc, e a mesma tecla do modo, saem do modo da mão.
 */
export const TECLAS_DO_TREINO: Readonly<Record<'bolaNaMao' | 'arrumar' | 'refazer' | 'novoTriangulo' | 'cenarios' | 'tirarBola', string>> = {
  bolaNaMao: 'KeyP',
  arrumar: 'KeyE',
  refazer: 'KeyR',
  novoTriangulo: 'KeyN',
  cenarios: 'KeyT',
  tirarBola: 'KeyX',
};

export function acaoDaTecla(code: string, modo: ModoDaMao): AcaoDoTreino | null {
  switch (code) {
    case TECLAS_DO_TREINO.bolaNaMao:
      return modo === 'branca' ? 'sair-do-modo' : 'bola-na-mao';
    case TECLAS_DO_TREINO.arrumar:
      return modo === 'arrumar' ? 'sair-do-modo' : 'arrumar';
    case TECLAS_DO_TREINO.refazer:
      return 'refazer';
    case TECLAS_DO_TREINO.novoTriangulo:
      return 'novo-triangulo';
    case TECLAS_DO_TREINO.cenarios:
      return 'cenarios';
    case TECLAS_DO_TREINO.tirarBola:
    case 'Delete':
      return modo === 'arrumar' ? 'tirar-bola' : null;
    case 'Escape':
      return modo === 'mirar' ? null : 'sair-do-modo';
    default:
      return null;
  }
}
