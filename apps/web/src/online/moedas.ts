/** Como as moedas aparecem na tela (puro): a contagem com plural, o sinal da variação e se o saldo está no vermelho. */

const MENOS = '−';

/** "0 moedas", "1 moeda", "100 moedas", "−30 moedas" (o menos é o sinal de verdade, não o hífen). */
export function textoDeMoedas(valor: number): string {
  const sinal = valor < 0 ? MENOS : '';
  const modulo = Math.abs(valor);
  return `${sinal}${modulo} ${modulo === 1 ? 'moeda' : 'moedas'}`;
}

/** "+20" a quem ganhou, "−10" a quem perdeu, "0" a quem ficou igual. */
export function deltaEmMoedas(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${MENOS}${Math.abs(delta)}`;
  return '0';
}

export type SinalDoSaldo = 'negativo' | 'zero' | 'positivo';

/** Só o saldo abaixo de zero é "negativo": é ele que a tela pinta de vermelho. */
export function sinalDoSaldo(saldo: number): SinalDoSaldo {
  if (saldo < 0) return 'negativo';
  return saldo === 0 ? 'zero' : 'positivo';
}
