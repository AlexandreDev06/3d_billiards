import type { CaraDoBalao } from './rosto';

/** As ações do corpo do balão do artista (`balao.glb`), pelo nome do jogo. */
export type AcaoDoBalao = 'parado' | 'inclinar' | 'pulinho' | 'susto' | 'estufar' | 'murchar';

/** O nome de cada ação no arquivo do artista. */
export const NOME_DA_ACAO: Readonly<Record<AcaoDoBalao, string>> = {
  parado: 'balao_parado',
  inclinar: 'balao_inclinar',
  pulinho: 'balao_pulinho',
  susto: 'balao_susto',
  estufar: 'balao_estufar',
  murchar: 'balao_murchar',
};

/** O nome de cada cara na forma (morph target) do arquivo. */
export const NOME_DA_CARA: Readonly<Record<CaraDoBalao, string>> = {
  neutro: 'cara_neutro',
  sorriso: 'cara_sorriso',
  susto: 'cara_susto',
  bravo: 'cara_bravo',
  triste: 'cara_triste',
};

/** Como a partida acabou para a equipe do balão. */
export type ResultadoDoFim = 'ganhou' | 'perdeu';

/** O que o balão faz agora: a ação do corpo (e se repete o trecho do meta até o jogo soltá-la) e a cara. */
export interface PedidoDoBalao {
  acao: AcaoDoBalao;
  repetir: boolean;
  cara: CaraDoBalao;
}

/**
 * O pedido do balão neste instante, a partir do rosto que a tacada provoca (`RostoDoBalao`, os mesmos momentos de
 * `momentosDaGravacao`), de o outro estar mirando e do fim da partida:
 *
 * - sorriso (encaçapou): `pulinho` com cara de sorriso;
 * - susto (raspou a caçapa) e bravo (falta): `susto` com cara de susto;
 * - neutro: `inclinar` (repetindo) enquanto o outro mira, senão a parada;
 * - no fim, quem ganhou `estufar` e quem perdeu `murchar`, repetindo, com a cara que o roteiro pedir.
 */
export function pedidoDoBalao(cara: CaraDoBalao, mirando: boolean, fim: ResultadoDoFim | null, saida: PedidoDoBalao = { acao: 'parado', repetir: false, cara: 'neutro' }): PedidoDoBalao {
  saida.cara = cara;
  saida.repetir = false;
  if (fim !== null) {
    saida.acao = fim === 'ganhou' ? 'estufar' : 'murchar';
    saida.repetir = true;
  } else if (cara === 'sorriso') saida.acao = 'pulinho';
  else if (cara === 'susto' || cara === 'bravo') {
    saida.acao = 'susto';
    saida.cara = 'susto';
  } else if (mirando) {
    saida.acao = 'inclinar';
    saida.repetir = true;
  } else saida.acao = 'parado';
  return saida;
}
