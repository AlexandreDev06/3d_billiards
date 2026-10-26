/** O que a barra de força diz para uma fração (0 a 1) da barra cheia; `minima` é a fração abaixo da qual soltar cancela. */
export interface ModeloDaForca {
  /** 0 a 100, inteiro. */
  readonly percentual: number;
  /** Soltar agora não taca: a barra está abaixo do mínimo. */
  readonly cancela: boolean;
  readonly dica: string;
}

export function modeloDaForca(fracao: number, minima: number): ModeloDaForca {
  const f = Math.min(Math.max(Number.isFinite(fracao) ? fracao : 0, 0), 1);
  const cancela = f < minima;
  const dica = f === 0 ? 'Puxe o mouse para trás' : cancela ? 'Solte para cancelar' : 'Solte para tacar';
  return { percentual: Math.round(f * 100), cancela, dica };
}
