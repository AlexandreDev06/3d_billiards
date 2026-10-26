import type { ConfigTacada } from '../config';

/**
 * Como a força da tacada se dá:
 * - `empurrar`: puxa o mouse para trás e empurra para a frente; a força é a velocidade do empurrão (o jeito de antes);
 * - `linha`: segura o botão, puxa o mouse para trás até a linha de força marcar o que quer e solta; a força é o tamanho da puxada.
 */
export type ControleForca = 'empurrar' | 'linha';

export const CONTROLES_DE_FORCA: readonly ControleForca[] = ['empurrar', 'linha'];

/** O controle de quem não escolheu nada. */
export const CONTROLE_DE_FORCA_PADRAO: ControleForca = 'linha';

export function ehControleDeForca(valor: unknown): valor is ControleForca {
  return valor === 'empurrar' || valor === 'linha';
}

/** `?forca=empurrar|linha` (vale só naquela visita); `null` se não veio ou veio outra coisa. */
export function controleDaUrl(busca: string): ControleForca | null {
  const pedido = new URLSearchParams(busca).get('forca');
  return ehControleDeForca(pedido) ? pedido : null;
}

/**
 * O controle que vale agora. É o ponto único por onde a regra da sala entra (L17): online vale o que a sala mandar
 * (`daSala`); enquanto ela não manda nada, e no mesmo PC, vale a escolha local (`?forca=` ou o interruptor do painel dev).
 */
export function controleEfetivo(online: boolean, daSala: ControleForca | null | undefined, local: ControleForca): ControleForca {
  return online && daSala != null ? daSala : local;
}

/** A linha de força: fração da barra (0 a 1) → velocidade do taco (m/s). */
export type ConfigLinhaDeForca = ConfigTacada['linha'];

/**
 * Velocidade do taco (m/s) para uma fração da barra (0 a 1). Quase linear (`expoente` perto de 1) e a barra cheia dá a
 * "Força máxima" (`velocidadeMax`). A curva foi ajustada na física real (`forca-linha.test.ts` confere, e a tabela fica em
 * `.outros/lote-15/forca-linha.txt`): 25% do bolão sozinho anda cerca de 1 comprimento de mesa, 50% cerca de 2.
 */
export function velocidadeDaLinha(fracao: number, cfg: Pick<ConfigTacada, 'velocidadeMax' | 'linha'>): number {
  const f = Math.min(Math.max(fracao, 0), 1);
  return cfg.velocidadeMax * (1 - (1 - f) ** cfg.linha.expoente);
}

/** Fração da barra (0 a 1) para uma puxada de `puxadaM` metros de taco; a barra cheia é `recuoMaximo − recuoInicial`. */
export function fracaoDaPuxada(puxadaM: number, cfg: Pick<ConfigTacada, 'recuoInicial' | 'recuoMaximo'>): number {
  const cheia = cfg.recuoMaximo - cfg.recuoInicial;
  return Math.min(Math.max(puxadaM / cheia, 0), 1);
}
