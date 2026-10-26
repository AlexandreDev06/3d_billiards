import { SKINS_DE_TACO, type EstadoCarteira, type SkinTaco } from '@sinuca/protocolo';
import { sinalDoSaldo, textoDeMoedas } from './moedas';

export type SituacaoDaSkin = 'em-uso' | 'sua' | 'a-venda';

/** Uma skin na vitrine: o que o cartão escreve e o que o botão faz. */
export interface CartaoDeSkin {
  readonly skin: SkinTaco;
  readonly nome: string;
  readonly preco: number;
  /** "Grátis" ou "50 moedas". */
  readonly textoDoPreco: string;
  readonly situacao: SituacaoDaSkin;
  /** A etiqueta do canto: "Em uso", "Sua"; `null` na que ainda está à venda (e com a loja fora do ar). */
  readonly selo: 'Em uso' | 'Sua' | null;
  /** O que o botão faz; `null` = sem botão (em uso, ou loja fora do ar). */
  readonly acao: 'comprar' | 'usar' | null;
  /** O botão está ligado (comprar só com saldo que cobre o preço). */
  readonly podeAgir: boolean;
  /** Quantas moedas faltam para comprar (0 se o saldo cobre ou se a skin já é minha). */
  readonly faltam: number;
  /** "Faltam 30 moedas" quando falta; `null` caso contrário. */
  readonly textoFaltam: string | null;
}

export interface LojaNaTela {
  /** A carteira foi lida: sem isso a vitrine aparece, mas ninguém compra nem troca. */
  readonly disponivel: boolean;
  readonly saldo: number | null;
  /** "100 moedas", "−30 moedas" ou "—" sem carteira lida. */
  readonly textoSaldo: string;
  readonly saldoNegativo: boolean;
  /** As skins na ordem do catálogo. */
  readonly cartoes: readonly CartaoDeSkin[];
}

/** A vitrine da loja a partir da carteira do aparelho (`null` = ainda não lida ou servidor fora do ar). */
export function lojaNaTela(carteira: EstadoCarteira | null): LojaNaTela {
  const cartoes = SKINS_DE_TACO.map((s): CartaoDeSkin => {
    const base = { skin: s.id, nome: s.nome, preco: s.preco, textoDoPreco: s.preco === 0 ? 'Grátis' : textoDeMoedas(s.preco) };
    if (carteira === null) return { ...base, situacao: s.preco === 0 ? 'sua' : 'a-venda', selo: null, acao: null, podeAgir: false, faltam: 0, textoFaltam: null };
    if (s.id === carteira.skin) return { ...base, situacao: 'em-uso', selo: 'Em uso', acao: null, podeAgir: false, faltam: 0, textoFaltam: null };
    if (carteira.skins.includes(s.id)) return { ...base, situacao: 'sua', selo: 'Sua', acao: 'usar', podeAgir: true, faltam: 0, textoFaltam: null };
    const faltam = Math.max(s.preco - carteira.saldo, 0);
    return { ...base, situacao: 'a-venda', selo: null, acao: 'comprar', podeAgir: faltam === 0, faltam, textoFaltam: faltam > 0 ? `Faltam ${textoDeMoedas(faltam)}` : null };
  });
  if (carteira === null) return { disponivel: false, saldo: null, textoSaldo: '—', saldoNegativo: false, cartoes };
  return { disponivel: true, saldo: carteira.saldo, textoSaldo: textoDeMoedas(carteira.saldo), saldoNegativo: sinalDoSaldo(carteira.saldo) === 'negativo', cartoes };
}
