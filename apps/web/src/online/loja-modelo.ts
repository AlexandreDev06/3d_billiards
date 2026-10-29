import { FAIXAS, SKINS_DE_TACO, padraoDaSemente, type EstadoCarteira, type FaixaDeSkin, type ItemTaco, type SkinTaco } from '@sinuca/protocolo';
import { textoDoContador } from '../cena/tramas-do-taco';
import { tempoParaVirar } from './missoes-modelo';
import { sinalDoSaldo, textoDeMoedas } from './moedas';

export type SituacaoDaSkin = 'em-uso' | 'sua' | 'a-venda';

/** Uma skin na loja: o que o cartão escreve e o que o botão faz. */
export interface CartaoDeSkin {
  readonly skin: SkinTaco;
  readonly nome: string;
  readonly faixa: FaixaDeSkin;
  /** "Balcão", "Camarote"... */
  readonly nomeDaFaixa: string;
  /** A cor da faixa (`#rrggbb`): a etiqueta e a borda do cartão. */
  readonly corDaFaixa: string;
  /** O preço de hoje: o da vitrine se a skin está nela, senão o do catálogo. É o que a sala cobra e o que a compra manda como teto. */
  readonly preco: number;
  /** O preço do catálogo. */
  readonly precoCheio: number;
  /** "Grátis" ou "40 moedas": o preço de hoje. */
  readonly textoDoPreco: string;
  /** O preço cheio, para vir riscado, só na vitrine do dia; `null` fora dela. */
  readonly textoDoPrecoRiscado: string | null;
  /** "−20%", só na vitrine do dia. */
  readonly textoDoDesconto: string | null;
  readonly naVitrine: boolean;
  readonly situacao: SituacaoDaSkin;
  /** A etiqueta do canto: "Em uso", "Já tem"; `null` na que ainda está à venda (e com a loja fora do ar). */
  readonly selo: 'Em uso' | 'Já tem' | null;
  /** O que o botão faz; `null` = sem botão (em uso, ou loja fora do ar). */
  readonly acao: 'comprar' | 'usar' | null;
  /** O botão está ligado (comprar só com saldo que cobre o preço). */
  readonly podeAgir: boolean;
  /** Quantas moedas faltam para comprar (0 se o saldo cobre ou se a skin já é minha). */
  readonly faltam: number;
  /** "Faltam 30 moedas" quando falta; `null` caso contrário. */
  readonly textoFaltam: string | null;
  /** A semente do meu taco (0 a 999); `null` se ainda não tenho a skin. */
  readonly semente: number | null;
  /** "#347"; `null` sem semente. */
  readonly textoDaSemente: string | null;
  /** O padrão raro que a semente deu ("Blue Gem", selo "BLUE GEM"), ou `null` (taco comum ou de uma fase). O catálogo é quem diz (`padraoDaSemente`). */
  readonly rara: { readonly nome: string; readonly selo: string } | null;
  /** A fase comum que a semente deu ("Phase 2"), discreta e sem selo de raro; `null` fora do Doppler e do Gamma Doppler e nos tacos raros. */
  readonly fase: string | null;
  /** As bolas que o meu taco matou; `null` se ainda não tenho a skin. */
  readonly bolas: number | null;
  /** "0042", os quatro dígitos do contador; `null` sem taco. */
  readonly textoDasBolas: string | null;
}

/** As skins de uma faixa, na ordem do catálogo. */
export interface GrupoDaFaixa {
  readonly faixa: FaixaDeSkin;
  readonly nome: string;
  readonly cor: string;
  readonly cartoes: readonly CartaoDeSkin[];
}

/** A vitrine do dia: as skins com desconto hoje. */
export interface VitrineNaTela {
  readonly desconto: number;
  /** "20% de desconto hoje". */
  readonly textoDoDesconto: string;
  /** "Troca em 3 h 20 min". */
  readonly restante: string;
  /** Quando a vitrine vira (ms desde 1970, o relógio da sala). */
  readonly fimMs: number;
  readonly cartoes: readonly CartaoDeSkin[];
}

export interface LojaNaTela {
  /** A carteira foi lida: sem isso a loja aparece, mas ninguém compra nem troca. */
  readonly disponivel: boolean;
  readonly saldo: number | null;
  /** "100 moedas", "−30 moedas" ou "—" sem carteira lida. */
  readonly textoSaldo: string;
  readonly saldoNegativo: boolean;
  /** A vitrine do dia; `null` sem ela (sala sem a vitrine, ou carteira não lida). */
  readonly vitrine: VitrineNaTela | null;
  /** As skins na ordem do catálogo. */
  readonly cartoes: readonly CartaoDeSkin[];
  /** As mesmas skins por faixa, da mais comum à mais rara. */
  readonly grupos: readonly GrupoDaFaixa[];
}

/** O que se espera depois do `fimMs` antes de reler a vitrine (a sala já virou o dia): um pouco, para o relógio dela não ficar atrás. */
export const ESPERA_APOS_VIRAR_MS = 1000;

/** Quanto falta até reler a vitrine: do agora até o `fimMs` mais a folga, nunca negativo; `null` sem vitrine. */
export function msAteAViradaDaVitrine(carteira: EstadoCarteira | null, agoraMs: number): number | null {
  const fim = carteira?.vitrine?.fimMs;
  return fim === undefined ? null : Math.max(fim - agoraMs, 0) + ESPERA_APOS_VIRAR_MS;
}

/** A loja a partir da carteira do aparelho (`null` = ainda não lida ou servidor fora do ar). `agoraMs` é o relógio do aparelho. */
export function lojaNaTela(carteira: EstadoCarteira | null, agoraMs: number = Date.now()): LojaNaTela {
  const vitrine = carteira?.vitrine;
  const itens = new Map<SkinTaco, ItemTaco>((carteira?.itens ?? []).map((i) => [i.skin, i]));
  const cartoes = SKINS_DE_TACO.map((s): CartaoDeSkin => {
    const faixa = FAIXAS.find((f) => f.id === s.faixa)!;
    const item = itens.get(s.id);
    const tenho = item !== undefined || (carteira?.skins.includes(s.id) ?? false);
    // Quem já tem o taco não vê mais o desconto: o que vale agora é o taco dele.
    const daVitrine = tenho ? undefined : vitrine?.itens.find((i) => i.skin === s.id);
    const preco = daVitrine?.preco ?? s.preco;
    const base = {
      skin: s.id,
      nome: s.nome,
      faixa: s.faixa,
      nomeDaFaixa: faixa.nome,
      corDaFaixa: faixa.cor,
      preco,
      precoCheio: s.preco,
      textoDoPreco: preco === 0 ? 'Grátis' : textoDeMoedas(preco),
      textoDoPrecoRiscado: daVitrine !== undefined && daVitrine.preco !== daVitrine.precoCheio ? textoDeMoedas(daVitrine.precoCheio) : null,
      textoDoDesconto: daVitrine !== undefined && vitrine !== undefined && daVitrine.preco !== daVitrine.precoCheio ? `−${vitrine.desconto}%` : null,
      naVitrine: daVitrine !== undefined,
    };
    const padrao = item === undefined ? undefined : padraoDaSemente(s.id, item.semente);
    const doTaco = {
      semente: item?.semente ?? null,
      textoDaSemente: item === undefined ? null : `#${item.semente}`,
      rara: padrao?.rara === true ? { nome: padrao.nome, selo: padrao.selo } : null,
      fase: padrao !== undefined && !padrao.rara ? padrao.nome : null,
      bolas: item?.bolas ?? null,
      textoDasBolas: item === undefined ? null : textoDoContador(item.bolas),
    };
    if (carteira === null) return { ...base, ...doTaco, situacao: s.preco === 0 ? 'sua' : 'a-venda', selo: null, acao: null, podeAgir: false, faltam: 0, textoFaltam: null };
    if (s.id === carteira.skin) return { ...base, ...doTaco, situacao: 'em-uso', selo: 'Em uso', acao: null, podeAgir: false, faltam: 0, textoFaltam: null };
    if (carteira.skins.includes(s.id)) return { ...base, ...doTaco, situacao: 'sua', selo: 'Já tem', acao: 'usar', podeAgir: true, faltam: 0, textoFaltam: null };
    const faltam = Math.max(preco - carteira.saldo, 0);
    return { ...base, ...doTaco, situacao: 'a-venda', selo: null, acao: 'comprar', podeAgir: faltam === 0, faltam, textoFaltam: faltam > 0 ? `Faltam ${textoDeMoedas(faltam)}` : null };
  });
  const grupos = FAIXAS.map((f): GrupoDaFaixa => ({ faixa: f.id, nome: f.nome, cor: f.cor, cartoes: cartoes.filter((c) => c.faixa === f.id) })).filter((g) => g.cartoes.length > 0);
  const naVitrine: VitrineNaTela | null =
    vitrine === undefined || vitrine.itens.length === 0
      ? null
      : {
          desconto: vitrine.desconto,
          textoDoDesconto: `${vitrine.desconto}% de desconto hoje`,
          restante: `Troca em ${tempoParaVirar(vitrine.fimMs, agoraMs)}`,
          fimMs: vitrine.fimMs,
          cartoes: vitrine.itens.map((i) => cartoes.find((c) => c.skin === i.skin)!),
        };
  if (carteira === null) return { disponivel: false, saldo: null, textoSaldo: '—', saldoNegativo: false, vitrine: null, cartoes, grupos };
  return { disponivel: true, saldo: carteira.saldo, textoSaldo: textoDeMoedas(carteira.saldo), saldoNegativo: sinalDoSaldo(carteira.saldo) === 'negativo', vitrine: naVitrine, cartoes, grupos };
}
