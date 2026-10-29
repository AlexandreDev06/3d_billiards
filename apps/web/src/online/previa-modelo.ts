import type { CaraDoBalao } from '../baloes/rosto';
import type { ResultadoDoFim } from '../baloes/acao-do-balao';

/**
 * O que os botões da prévia do "Meu balão" (L48) pedem ao balão: a cara e, junto, o que o jogo faria para a ação aparecer (mirando,
 * impaciente, fim da partida). Puro: a tabela de reações do jogo (`pedidoDoBalao`) decide o corpo.
 */
export interface ReacaoDaPrevia {
  readonly id: string;
  readonly rotulo: string;
  readonly grupo: 'cara' | 'acao';
  readonly cara: CaraDoBalao;
  readonly mirando: boolean;
  readonly impaciente: boolean;
  readonly fim: ResultadoDoFim | null;
}

const reacao = (id: string, rotulo: string, grupo: 'cara' | 'acao', cara: CaraDoBalao, resto: Partial<Pick<ReacaoDaPrevia, 'mirando' | 'impaciente' | 'fim'>> = {}): ReacaoDaPrevia => ({
  id,
  rotulo,
  grupo,
  cara,
  mirando: resto.mirando ?? false,
  impaciente: resto.impaciente ?? false,
  fim: resto.fim ?? null,
});

export const REACOES_DA_PREVIA: readonly ReacaoDaPrevia[] = [
  reacao('neutro', 'Normal', 'cara', 'neutro'),
  reacao('sorriso', 'Sorriso', 'cara', 'sorriso'),
  reacao('rindo', 'Rindo', 'cara', 'rindo'),
  reacao('bravo', 'Bravo', 'cara', 'bravo'),
  reacao('susto', 'Susto', 'cara', 'susto'),
  reacao('triste', 'Triste', 'cara', 'desanimado'),
  reacao('convencido', 'Convencido', 'cara', 'convencido'),
  reacao('concentrar', 'Mirando', 'acao', 'neutro', { mirando: true }),
  reacao('impaciente', 'Impaciente', 'acao', 'neutro', { mirando: true, impaciente: true }),
  reacao('comemorar', 'Comemorar', 'acao', 'comemorando'),
  reacao('ganhou', 'Ganhou', 'acao', 'neutro', { fim: 'ganhou' }),
  reacao('perdeu', 'Perdeu', 'acao', 'neutro', { fim: 'perdeu' }),
];

export const REACAO_PADRAO_DA_PREVIA = 'neutro';

export function reacaoDaPrevia(id: string): ReacaoDaPrevia | null {
  return REACOES_DA_PREVIA.find((r) => r.id === id) ?? null;
}
