import type { ConfigAvisosDeSom } from '../config';
import type { SomDeAviso } from './mapeamento';

/** Um aviso para tocar, `atrasoMs` depois de agora. */
export interface SomAgendado {
  readonly som: SomDeAviso;
  readonly atrasoMs: number;
}

export type MotivoDaTroca = 'tacada' | 'tempo';

export interface TrocaDeVez {
  /** Hot-seat: quem ouve é sempre quem passa a jogar (e quem perdeu o tempo): um PC só. */
  readonly hotSeat: boolean;
  /** Online: a vez que chegou é minha. */
  readonly euRecebo: boolean;
  /** Só o hot-seat distingue: online o tempo esgotado chega por mensagem da sala (`somDoTempoEsgotado`) e o retrato que vem depois não repete o som. */
  readonly motivo: MotivoDaTroca;
}

/**
 * Que som toca quando a vez passa depois de uma tacada (ou, no hot-seat, do tempo). Online cada pessoa ouve um só: a sua
 * vez chegou (sino) ou foi de outro (tique discreto). No hot-seat quem ouve é sempre quem passa a jogar (sino) e, se foi o
 * tempo que acabou, a batida toca primeiro e o sino logo depois.
 */
export function somsDaTroca(t: TrocaDeVez, cfg: ConfigAvisosDeSom): readonly SomAgendado[] {
  if (t.hotSeat) {
    return t.motivo === 'tempo'
      ? [
          { som: 'tempo-esgotado', atrasoMs: 0 },
          { som: 'vez-sua', atrasoMs: cfg.sinoDepoisDoEsgotadoMs },
        ]
      : [{ som: 'vez-sua', atrasoMs: 0 }];
  }
  return [{ som: t.euRecebo ? 'vez-sua' : 'vez-outro', atrasoMs: 0 }];
}

/** Online: o som da mensagem `tempo-esgotado` da sala, para quem ouve (`lugar` perdeu a vez, `proximo` a recebe). */
export function somDoTempoEsgotado(aviso: { readonly lugar: number; readonly proximo: number }, meuLugar: number | null): SomDeAviso {
  if (aviso.lugar === meuLugar) return 'tempo-esgotado';
  return aviso.proximo === meuLugar ? 'vez-sua' : 'vez-outro';
}

/** O jogador da roda é o do meu lugar? (o id do jogador online é `lugar-N`) */
export const jogadorEhDoLugar = (jogadorId: string, lugar: number | null): boolean => lugar !== null && jogadorId === `lugar-${lugar}`;
