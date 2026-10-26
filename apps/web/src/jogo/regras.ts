import type { EventoTacada, Rng } from '@sinuca/fisica';
import {
  aplicarTacada,
  novaPartida,
  type ConfigRegras,
  type EstadoPartida,
  type Jogador,
  type NovaPartida,
  type ResultadoRegras,
} from '@sinuca/regras';

/** O que o laço precisa das regras: as duas funções puras de `@sinuca/regras`. */
export interface MotorDeRegras {
  novaPartida(config: ConfigRegras, jogadores: readonly Jogador[], rng: Rng): NovaPartida;
  aplicarTacada(partida: EstadoPartida, eventos: readonly EventoTacada[]): ResultadoRegras;
}

/** As regras do pacote; o gancho de teste pode trocá-las por um cenário de ensaio. */
export const REGRAS_DO_PACOTE: MotorDeRegras = { novaPartida, aplicarTacada };
