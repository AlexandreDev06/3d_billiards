import { PRESET_BOTECO, PRESET_MATA_MATA, bolasDaCasa, type ConfigRegras, type EstadoPartida, type Jogador } from '@sinuca/regras';

/** A casa com a bola final na 8 (bolas 2–14), a de fábrica. */
export const CASA_8: ConfigRegras = { ...PRESET_BOTECO.regras, bolas: '2-14', bolaFinal: 8 };
/** A casa antiga, com a 1 como bola final (o castigo). */
export const CASA_1: ConfigRegras = { ...PRESET_BOTECO.regras, bolas: '1-15', bolaFinal: 1 };
/** 2 a 15 sem bola final: vence quem encaçapa a última do grupo. */
export const CASA_SEM_FINAL: ConfigRegras = { ...PRESET_BOTECO.regras, bolas: '2-15', bolaFinal: 'ultima-do-grupo' };

export const ANA_E_BETO: readonly Jogador[] = [
  { id: 'a', nome: 'Ana', equipe: 0 },
  { id: 'b', nome: 'Beto', equipe: 1 },
];

/** 2×2 na ordem da roda: Ana e Caio (equipe 0) contra Beto e Dani (equipe 1). */
export const DUPLAS_DE_TESTE: readonly Jogador[] = [...ANA_E_BETO, { id: 'c', nome: 'Caio', equipe: 0 }, { id: 'd', nome: 'Dani', equipe: 1 }];

/** 2×1 na ordem da roda (A1, B1, A2): Ana e Caio (equipe 0) contra Beto, sozinho (equipe 1). */
export const TRIO_DE_TESTE: readonly Jogador[] = [...ANA_E_BETO, { id: 'c', nome: 'Caio', equipe: 0 }];

/** A casa do mata-mata: as 15 bolas, sem grupos nem bola final. */
export const CASA_MATA_MATA: ConfigRegras = PRESET_MATA_MATA.regras;

/** Mata-mata de 3 na ordem da roda: Ana, Beto e Caio, cada um a sua equipe (0, 1, 2). */
export const TRIO_POR_SI: readonly Jogador[] = [...ANA_E_BETO, { id: 'c', nome: 'Caio', equipe: 2 }];

/** Mata-mata de 4 na ordem da roda: Ana, Beto, Caio e Dani, cada um a sua equipe (0 a 3). */
export const QUARTETO_POR_SI: readonly Jogador[] = [...TRIO_POR_SI, { id: 'd', nome: 'Dani', equipe: 3 }];

/** Uma partida no começo (saída, todas as bolas da casa na mesa); `mudancas` troca o que o teste precisa. */
export function partidaDeTeste(mudancas: Partial<EstadoPartida> = {}): EstadoPartida {
  const config = mudancas.config ?? CASA_8;
  return {
    config,
    jogadores: ANA_E_BETO,
    vez: 0,
    grupos: [null, null],
    fase: 'saida',
    naMesa: bolasDaCasa(config),
    encacapadas: [],
    retiradas: [],
    vencedor: null,
    ...mudancas,
  };
}
