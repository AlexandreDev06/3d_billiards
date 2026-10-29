/**
 * A conta das estatísticas por carteira (L38), pura: sem rede, relógio nem disco. A sala vai somando, por lugar, o que cada
 * tacada vale (`ParcialDaPartida`) e, quando a partida acaba de verdade, `estatisticasDaPartida` transforma isso na contagem que o
 * armazém soma à carteira de cada um. Quem decide SE a partida conta (vencedor, aposta valendo, física padrão) é a sala; os números
 * de bola, sequência e tabelada saem de `conferirTacada` (`missoes.ts`), a mesma definição das missões.
 */
import { premioDaMissao, type ContagemDeEstatisticas, type IdMissao } from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import type { EstatisticaDaPartida } from './carteiras-base';
import type { Pagamento, ParticipanteDoRol } from './aposta';

/** O que um lugar fez numa partida em andamento; só vira estatística se ela acabar de verdade. */
export interface ParcialDaPartida {
  bolas: number;
  /** A maior sequência de bolas numa vez que ele fez nesta partida. */
  sequencia: number;
  tabeladas: number;
  /** Missões diárias que fecharam nesta partida. */
  missoes: number;
  /** Moedas dos prêmios dessas missões. */
  moedasDeMissoes: number;
}

export const parcialVazio = (): ParcialDaPartida => ({ bolas: 0, sequencia: 0, tabeladas: 0, missoes: 0, moedasDeMissoes: 0 });

/** Uma tacada de física padrão aceita: as bolas que matou, a sequência dele depois dela (a do *Embalado*) e as tabeladas. */
export function contarTacada(p: ParcialDaPartida, t: { readonly mortas: number; readonly sequencia: number; readonly tabeladas: number }): void {
  p.bolas += t.mortas;
  p.sequencia = Math.max(p.sequencia, t.sequencia);
  p.tabeladas += t.tabeladas;
}

/** Missões que o armazém acabou de fechar (e pagar) para este lugar. */
export function contarMissoesCumpridas(p: ParcialDaPartida, cumpridas: readonly IdMissao[]): void {
  p.missoes += cumpridas.length;
  p.moedasDeMissoes += cumpridas.reduce((soma, id) => soma + premioDaMissao(id), 0);
}

export interface PartidaQueContou {
  readonly rol: readonly ParticipanteDoRol[];
  /** A equipe vencedora (a partida acabou de verdade). */
  readonly vencedor: number;
  readonly modalidade: Modalidade;
  readonly parciais: ReadonlyMap<number, ParcialDaPartida>;
  /** O que a aposta pagou a cada carteira (`calcularAposta`); só o delta positivo conta como moeda ganha. */
  readonly pagamentos: readonly Pagamento[];
}

/**
 * Uma contagem por carteira do rol (quem não tinha carteira não entra): uma partida, uma vitória se a equipe dela venceu, o que
 * ela fez e as moedas ganhas (o que a aposta pagou a mais do que ela pôs, quando positivo, mais os prêmios das missões; o presente
 * de teste nunca passa por aqui).
 */
export function estatisticasDaPartida(p: PartidaQueContou): EstatisticaDaPartida[] {
  const saida: EstatisticaDaPartida[] = [];
  for (const q of p.rol) {
    if (q.carteira === null) continue;
    const parcial = p.parciais.get(q.lugar) ?? parcialVazio();
    const ganhoNaAposta = Math.max(0, p.pagamentos.find((pg) => pg.lugar === q.lugar)?.delta ?? 0);
    const contagem: ContagemDeEstatisticas = {
      partidas: 1,
      vitorias: q.equipe === p.vencedor ? 1 : 0,
      bolas: parcial.bolas,
      sequencia: parcial.sequencia,
      tabeladas: parcial.tabeladas,
      missoes: parcial.missoes,
      moedas: ganhoNaAposta + parcial.moedasDeMissoes,
    };
    saida.push({ id: q.carteira, modalidade: p.modalidade, contagem });
  }
  return saida;
}
