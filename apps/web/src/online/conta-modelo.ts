import type { EstadoCarteira } from '@sinuca/protocolo';

/**
 * Contas na tela (L62), puro: o que perguntar antes de entrar e o que conferir antes de gastar um pedido. Quem manda nos limites
 * (tamanho, formato) é a API; aqui só se evita o pedido que já se sabe vazio.
 */

/** A carteira de convidado deste navegador tem moedas ou itens que a pessoa perderia de vista ao entrar? (`null` = sem carteira lida.) */
export function carteiraDoConvidadoTemAlgo(carteira: EstadoCarteira | null): boolean {
  if (carteira === null) return false;
  return carteira.saldo !== 0 || carteira.skins.length > 1 || (carteira.balao?.itens.length ?? 0) > 0 || (carteira.itens?.length ?? 0) > 1;
}

export type CampoFaltando = 'email' | 'senha' | 'nome';

/** O primeiro campo vazio, na ordem da tela, com a frase para mostrar; `null` se tudo está preenchido. */
export function campoFaltando(campos: { readonly email?: string; readonly senha?: string; readonly nome?: string }): { readonly campo: CampoFaltando; readonly mensagem: string } | null {
  if (campos.email !== undefined && campos.email.trim() === '') return { campo: 'email', mensagem: 'Digite o e-mail.' };
  if (campos.nome !== undefined && campos.nome.trim() === '') return { campo: 'nome', mensagem: 'Digite o nome da mesa.' };
  if (campos.senha !== undefined && campos.senha === '') return { campo: 'senha', mensagem: 'Digite a senha.' };
  return null;
}

/** "Tente de novo em 2 min" a partir do `tenteEmS` da API; vazio sem o dado. */
export function textoDaEspera(tenteEmS: number | undefined): string {
  if (tenteEmS === undefined) return '';
  if (tenteEmS < 60) return ` Tente de novo em ${tenteEmS} s.`;
  const min = Math.ceil(tenteEmS / 60);
  return min < 60 ? ` Tente de novo em ${min} min.` : ` Tente de novo em ${Math.ceil(min / 60)} h.`;
}
