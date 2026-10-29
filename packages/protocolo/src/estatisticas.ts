/**
 * As estatísticas de uma carteira (L38), puras: o que a sala guarda de cada jogador com carteira e o resumo público que o
 * `estado-sala` mostra por lugar. Só dados e contas, sem rede nem relógio.
 *
 * A sala guarda UMA contagem por modalidade; o total é sempre a soma delas (e a maior sequência, o maior valor), então os dois nunca
 * divergem. Conta só a partida online que acabou de verdade (com vencedor, aposta valendo e a física padrão em todas as tacadas);
 * quem decide isso é a sala (`apps/sala`), aqui só estão os números.
 */
import type { Modalidade } from '@sinuca/regras';

/** Os números de uma carteira numa modalidade (ou no total). Todos inteiros, de 0 em diante. */
export interface ContagemDeEstatisticas {
  /** Partidas que acabaram de verdade com esta carteira num lugar. */
  readonly partidas: number;
  /** Das `partidas`, as que a equipe dela venceu. */
  readonly vitorias: number;
  /** Bolas matadas (a mesma definição das missões diárias: bola objeto que cai em tacada sem falta e não volta à mesa). */
  readonly bolas: number;
  /** A maior sequência de bolas numa vez (a do *Embalado*: no par ou ímpar, as bolas de quem fica com a mesa; no mata-mata, tacadas dele seguidas que mataram). Soma não faz sentido: vale o maior. */
  readonly sequencia: number;
  /** Tabeladas (a mesma da missão *Tabelada*). */
  readonly tabeladas: number;
  /** Missões diárias cumpridas nas partidas que contam. */
  readonly missoes: number;
  /** Moedas ganhas nelas: o que a aposta pagou a mais do que a carteira pôs (só quando positivo) e os prêmios das missões; o presente de teste não entra. */
  readonly moedas: number;
}

/** As chaves de uma contagem, na ordem em que o arquivo e a tela as listam. */
export const CHAVES_DA_CONTAGEM = ['partidas', 'vitorias', 'bolas', 'sequencia', 'tabeladas', 'missoes', 'moedas'] as const satisfies readonly (keyof ContagemDeEstatisticas)[];

export const CONTAGEM_ZERADA: ContagemDeEstatisticas = Object.freeze({ partidas: 0, vitorias: 0, bolas: 0, sequencia: 0, tabeladas: 0, missoes: 0, moedas: 0 });

/** O que a carteira mostra (`GET /carteira`): o total e a contagem de cada modalidade em que ela já jogou. */
export interface EstatisticasDaCarteira {
  /** A soma das `modalidades` (a `sequencia`, o maior valor delas). */
  readonly total: ContagemDeEstatisticas;
  /** Só as modalidades em que a carteira já jogou uma partida que contou. */
  readonly modalidades: Readonly<Partial<Record<Modalidade, ContagemDeEstatisticas>>>;
}

/**
 * O resumo PÚBLICO de cada lugar no `estado-sala`: todo mundo na sala o vê, como o saldo. Só números do total, nunca o código
 * da carteira nem nada que a identifique.
 */
export interface ResumoDeEstatisticas {
  readonly partidas: number;
  readonly vitorias: number;
  readonly bolas: number;
}

/** `a` e `b` juntas: tudo soma, menos a `sequencia`, que fica com a maior. Não confere estouro de inteiro (quem guarda confere). */
export function somarContagens(a: ContagemDeEstatisticas, b: ContagemDeEstatisticas): ContagemDeEstatisticas {
  return {
    partidas: a.partidas + b.partidas,
    vitorias: a.vitorias + b.vitorias,
    bolas: a.bolas + b.bolas,
    sequencia: Math.max(a.sequencia, b.sequencia),
    tabeladas: a.tabeladas + b.tabeladas,
    missoes: a.missoes + b.missoes,
    moedas: a.moedas + b.moedas,
  };
}

/** O total de uma carteira: a soma das contagens por modalidade. */
export function totalDasModalidades(modalidades: Readonly<Partial<Record<Modalidade, ContagemDeEstatisticas>>>): ContagemDeEstatisticas {
  return Object.values(modalidades).reduce<ContagemDeEstatisticas>((soma, contagem) => (contagem ? somarContagens(soma, contagem) : soma), CONTAGEM_ZERADA);
}

/** As estatísticas completas de uma carteira, com o total derivado das modalidades. */
export function estatisticasDeModalidades(modalidades: Readonly<Partial<Record<Modalidade, ContagemDeEstatisticas>>>): EstatisticasDaCarteira {
  return { total: totalDasModalidades(modalidades), modalidades };
}

/** O que o `estado-sala` mostra de cada lugar. */
export const resumoPublico = (estatisticas: EstatisticasDaCarteira): ResumoDeEstatisticas => ({
  partidas: estatisticas.total.partidas,
  vitorias: estatisticas.total.vitorias,
  bolas: estatisticas.total.bolas,
});
