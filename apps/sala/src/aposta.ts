/**
 * A conta da aposta de uma partida (L22), pura: quem estava na partida quando ela começou (o rol), quanto cada um com
 * carteira pôs e quem venceu dão quanto cada carteira ganha ou perde. Não sabe de saldo, sala, rede nem disco, e só usa
 * inteiros: a soma das variações é sempre zero (o dinheiro só muda de mãos).
 *
 * - Cada pessoa do rol que tem carteira põe `aposta` no pote. Quem não tem não aposta e não recebe.
 * - Os vencedores com carteira dividem o pote por igual; a sobra de uma divisão que não fecha vai ao primeiro deles, por
 *   lugar. Cada perdedor com carteira paga a aposta inteira, e a variação de um vencedor é o que levou menos o que pôs.
 * - Sem vencedor com carteira, não há quem receba, então ninguém paga.
 * - A mesma carteira em dois lugares do rol anula a aposta: ninguém paga nem recebe.
 */

/** Quem estava num lugar quando a partida começou. `carteira` é o id interno do armazém (nunca o código), ou `null`. */
export interface ParticipanteDoRol {
  readonly lugar: number;
  /** A equipe do lugar na partida; vence quem tem a equipe igual à `partida.vencedor`. */
  readonly equipe: number;
  readonly nome: string;
  readonly carteira: string | null;
}

/** O que muda na carteira de quem estava num lugar. */
export interface Pagamento {
  readonly lugar: number;
  readonly nome: string;
  readonly carteira: string;
  readonly delta: number;
}

export type ResultadoDaAposta =
  | { readonly anulada: true; readonly aposta: number; readonly motivo: 'carteira-repetida' }
  /** `pagamentos`: uma entrada por pessoa com carteira, por lugar, inclusive as de variação zero. */
  | { readonly anulada: false; readonly aposta: number; readonly pagamentos: readonly Pagamento[] };

/**
 * A partida vale moeda se, qualquer que seja o vencedor, algum dinheiro pode mudar de mãos: há carteiras em pelo menos duas
 * equipes (alguém com carteira para pagar e alguém de outra equipe com carteira para receber) e a aposta não é anulada.
 * Sala "sem limite" só ganha o teto da vez quando a partida vale moeda.
 */
export function valeMoeda(rol: readonly ParticipanteDoRol[]): boolean {
  const apostadores = rol.filter((p) => p.carteira !== null);
  if (new Set(apostadores.map((p) => p.carteira)).size !== apostadores.length) return false;
  return new Set(apostadores.map((p) => p.equipe)).size >= 2;
}

export function calcularAposta(rol: readonly ParticipanteDoRol[], aposta: number, equipeVencedora: number): ResultadoDaAposta {
  if (!Number.isSafeInteger(aposta) || aposta <= 0) throw new RangeError('calcularAposta: a aposta precisa ser um inteiro positivo');

  const apostadores = rol.filter((p): p is ParticipanteDoRol & { carteira: string } => p.carteira !== null).sort((a, b) => a.lugar - b.lugar);
  if (new Set(apostadores.map((p) => p.carteira)).size !== apostadores.length) return { anulada: true, aposta, motivo: 'carteira-repetida' };

  const vencedores = apostadores.filter((p) => p.equipe === equipeVencedora);
  const pote = aposta * apostadores.length;
  const parte = vencedores.length === 0 ? 0 : Math.floor(pote / vencedores.length);
  const sobra = vencedores.length === 0 ? 0 : pote - parte * vencedores.length;

  const pagamentos = apostadores.map((p): Pagamento => {
    const base = { lugar: p.lugar, nome: p.nome, carteira: p.carteira };
    if (vencedores.length === 0) return { ...base, delta: 0 };
    if (p.equipe !== equipeVencedora) return { ...base, delta: -aposta };
    const recebe = parte + (p === vencedores[0] ? sobra : 0);
    return { ...base, delta: recebe - aposta };
  });
  return { anulada: false, aposta, pagamentos };
}
