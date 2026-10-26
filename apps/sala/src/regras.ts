import type { EventoTacada, Rng } from '@sinuca/fisica';
import { PRESETS_DE_FABRICA, aplicarTacada, novaPartida, type ConfigRegras, type EstadoPartida, type Jogador, type Modalidade, type NovaPartida, type PresetRegras, type ResultadoRegras } from '@sinuca/regras';

/** O que a sala precisa das regras: as duas funções puras de `@sinuca/regras` (injetáveis nos testes). */
export interface MotorDeRegras {
  novaPartida(config: ConfigRegras, jogadores: readonly Jogador[], rng: Rng): NovaPartida;
  aplicarTacada(partida: EstadoPartida, eventos: readonly EventoTacada[]): ResultadoRegras;
}

export const REGRAS_DO_PACOTE: MotorDeRegras = { novaPartida, aplicarTacada };

/**
 * O preset de fábrica de uma modalidade (a sala joga com ele quando o anfitrião troca de modalidade na espera). Modalidade
 * nova = um preset em `PRESETS_DE_FABRICA` mais uma entrada no catálogo do protocolo; um teste confere as duas pontas.
 */
export function presetDaModalidade(modalidade: Modalidade): PresetRegras {
  const preset = PRESETS_DE_FABRICA.find((p) => p.regras.modalidade === modalidade);
  if (!preset) throw new Error(`Sem preset de fábrica para a modalidade "${modalidade}"`);
  return preset;
}
