import { equipeDoLugar, type ModoSala, type MsgApostaPaga } from '@sinuca/protocolo';
import { deltaEmMoedas, sinalDoSaldo, textoDeMoedas } from './moedas';

export type SentidoDaAposta = 'ganhou' | 'perdeu' | 'igual';

export interface LinhaDaAposta {
  readonly lugar: number;
  readonly nome: string;
  /** A equipe do lugar (a cor do nome, como no placar e no chat). */
  readonly equipe: number;
  readonly delta: number;
  /** "+20", "−10" ou "0". */
  readonly textoDelta: string;
  readonly sentido: SentidoDaAposta;
  readonly saldo: number;
  /** "120 moedas", "−5 moedas". */
  readonly textoSaldo: string;
  readonly saldoNegativo: boolean;
  /** Sou eu. */
  readonly voce: boolean;
  /** A linha por extenso, para o leitor de tela. */
  readonly descricao: string;
}

/** O que a tela de fim mostra do dinheiro da partida. */
export interface ApostaNaTela {
  readonly anulada: boolean;
  readonly titulo: string;
  readonly linhas: readonly LinhaDaAposta[];
}

/** A `aposta-paga` da sala como a tela de fim a mostra (puro). `null` = a partida não teve dinheiro a mostrar. */
export function apostaNaTela(paga: MsgApostaPaga | null, modo: ModoSala, meuLugar: number | null): ApostaNaTela | null {
  if (paga === null) return null;
  if (paga.anulada !== undefined) return { anulada: true, titulo: 'Aposta anulada: a mesma carteira em dois lugares', linhas: [] };
  const linhas = paga.variacoes.map((v): LinhaDaAposta => {
    const sentido: SentidoDaAposta = v.delta > 0 ? 'ganhou' : v.delta < 0 ? 'perdeu' : 'igual';
    const resultado = sentido === 'igual' ? 'não ganhou nem perdeu' : `${sentido} ${textoDeMoedas(Math.abs(v.delta))}`;
    return {
      lugar: v.lugar,
      nome: v.nome,
      equipe: equipeDoLugar(modo, v.lugar),
      delta: v.delta,
      textoDelta: deltaEmMoedas(v.delta),
      sentido,
      saldo: v.saldo,
      textoSaldo: textoDeMoedas(v.saldo),
      saldoNegativo: sinalDoSaldo(v.saldo) === 'negativo',
      voce: v.lugar === meuLugar,
      descricao: `${v.nome} ${resultado} e ficou com ${textoDeMoedas(v.saldo)}`,
    };
  });
  return { anulada: false, titulo: `Aposta de ${textoDeMoedas(paga.valor)}`, linhas };
}
