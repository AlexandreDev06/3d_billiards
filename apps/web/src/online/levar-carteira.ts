import { ehCodigoDeCarteira, type EstadoCarteira } from '@sinuca/protocolo';
import type { ConferenciaDaCarteira, ResultadoDaCarteira } from './carteira';
import { textoDeMoedas } from './moedas';

/**
 * "Levar minha carteira para outro aparelho" (L43), puro: o link com o código no FRAGMENTO (`#carteira=...`, que o navegador nunca manda
 * à rede e que não entra em log de servidor), a leitura dele ao abrir o jogo e o fluxo de conferir, perguntar e só então trocar. O código
 * só aparece aqui como argumento de `linkDaCarteira` e dentro de `lerFragmentoDaCarteira`; nada daqui o escreve em log, texto de tela ou query.
 */

export const PARAMETRO_DA_CARTEIRA = 'carteira';

/** A frase em destaque ao lado do link. */
export const AVISO_DO_LINK = 'Quem tiver este link usa as suas moedas e os seus tacos';

/** O endereço da página sem busca nem fragmento: é a base do link (a busca pode ter `?sala=` ou `?dev=1`, que não vão para outro aparelho). */
export function baseDoLink(local: { readonly origin: string; readonly pathname: string }): string {
  return `${local.origin.replace(/\/+$/, '')}${local.pathname === '' ? '/' : local.pathname}`;
}

/** O link que leva a carteira: `base#carteira=CODIGO`. O código tem só letras, números, `-` e `_`, então não precisa de escape. */
export function linkDaCarteira(base: string, codigo: string): string {
  const limpa = base.split('#')[0]!.split('?')[0]!;
  return `${limpa}#${PARAMETRO_DA_CARTEIRA}=${codigo}`;
}

export type LeituraDoFragmento =
  | { readonly tipo: 'nenhum' }
  /** Havia `carteira=` e o valor tem a forma de um código. `resto` é o fragmento sem ela (`''` ou `#outra=coisa`). */
  | { readonly tipo: 'codigo'; readonly codigo: string; readonly resto: string }
  /** Havia `carteira` mas vazia, curta, longa ou com caractere que um código não tem. */
  | { readonly tipo: 'invalido'; readonly resto: string };

/** Lê `location.hash`. Só o primeiro `carteira=` vale; qualquer outro pedaço do fragmento (`#a=1`) é devolvido em `resto`, intacto. */
export function lerFragmentoDaCarteira(hash: string): LeituraDoFragmento {
  const corpo = hash.startsWith('#') ? hash.slice(1) : hash;
  if (corpo === '') return { tipo: 'nenhum' };
  const pedacos = corpo.split('&');
  const ehDaCarteira = (p: string): boolean => p === PARAMETRO_DA_CARTEIRA || p.startsWith(`${PARAMETRO_DA_CARTEIRA}=`);
  const primeiro = pedacos.find(ehDaCarteira);
  if (primeiro === undefined) return { tipo: 'nenhum' };
  const resto = pedacos.filter((p) => !ehDaCarteira(p) && p !== '').join('&');
  const restoComHash = resto === '' ? '' : `#${resto}`;
  const valor = primeiro.includes('=') ? primeiro.slice(primeiro.indexOf('=') + 1) : '';
  return ehCodigoDeCarteira(valor) ? { tipo: 'codigo', codigo: valor, resto: restoComHash } : { tipo: 'invalido', resto: restoComHash };
}

// ---------------------------------------------------------------- a pergunta

/** O que a pergunta "Usar esta carteira neste aparelho?" mostra. Só números e textos: o código não vai junto. */
export interface PerguntaDeCarteira {
  readonly titulo: string;
  /** O que a carteira do link tem: "250 moedas · 4 tacos". */
  readonly doLink: string;
  /** O que a carteira deste aparelho tem; `null` quando o aparelho ainda não tem nenhuma ou o saldo dela não pôde ser lido. */
  readonly atual: string | null;
  /** Em destaque: o que acontece com a carteira atual. */
  readonly aviso: string;
  readonly confirmar: string;
  readonly recusar: string;
}

export const TITULO_DA_PERGUNTA = 'Usar esta carteira neste aparelho?';

const tacos = (n: number): string => `${n} ${n === 1 ? 'taco' : 'tacos'}`;

/** "250 moedas · 4 tacos", ou só as moedas se a carteira não diz quantos tacos tem. */
export function resumoDaCarteira(estado: EstadoCarteira): string {
  const quantos = estado.itens?.length ?? estado.skins.length;
  return `${textoDeMoedas(estado.saldo)} · ${tacos(quantos)}`;
}

/** A pergunta a partir da carteira do link (já conferida na sala) e da deste aparelho (`null` = não tem ou não deu para ler). */
export function perguntaDaTroca(doLink: EstadoCarteira, atual: EstadoCarteira | null, aparelhoTemCarteira: boolean): PerguntaDeCarteira {
  return {
    titulo: TITULO_DA_PERGUNTA,
    doLink: resumoDaCarteira(doLink),
    atual: atual === null ? null : resumoDaCarteira(atual),
    aviso: aparelhoTemCarteira
      ? 'A carteira atual fica esquecida neste aparelho: sem o link dela, não dá para voltar a ela.'
      : 'Este aparelho ainda não tem carteira: esta passa a ser a dele.',
    confirmar: 'Usar esta carteira',
    recusar: 'Manter a atual',
  };
}

// ---------------------------------------------------------------- os avisos

export const AVISO_LINK_INVALIDO = 'O código deste link não tem a forma de uma carteira. Peça o link de novo a quem o mandou. Nada mudou.';
export const AVISO_LINK_DESCONHECIDO = 'A sala não conhece a carteira deste link (ou o código veio incompleto). Peça o link de novo. Nada mudou.';
export const AVISO_LINK_FORA_DO_AR = 'Não deu para conferir a carteira do link: a sala não respondeu. Abra o link de novo daqui a pouco. Nada mudou.';
export const AVISO_LINK_EM_SALA = 'Saia da sala e abra o link de novo para trocar de carteira. Nada mudou.';

// ---------------------------------------------------------------- o fluxo

/** O que o fluxo precisa da carteira do aparelho (a `CarteiraDoAparelho` serve; os testes põem uma de brincadeira). */
export interface CarteiraDoLink {
  conferir(codigo: string): Promise<ConferenciaDaCarteira>;
  /** O aparelho já tem uma carteira (código guardado)? */
  tem(): boolean;
  estado(): EstadoCarteira | null;
  garantir(): Promise<ResultadoDaCarteira>;
}

/** O que o fluxo precisa da tela. */
export interface TelaDoLink {
  /** Mostra a pergunta e espera a resposta: `true` = usar a carteira do link. */
  perguntar(pergunta: PerguntaDeCarteira): Promise<boolean>;
  /** Mostra um recado e espera o "Entendi". */
  avisar(texto: string): Promise<void>;
}

export type ResultadoDoLink = 'nenhum' | 'invalido' | 'desconhecido' | 'fora-do-ar' | 'mesma' | 'trocada' | 'mantida';

export interface PedidoDoLink {
  /** `location.hash` na hora da abertura. */
  readonly hash: string;
  /** Tira o código do endereço (`history.replaceState`), deixando só `resto`. Roda antes de qualquer pedido à rede. */
  limparEndereco(resto: string): void;
  readonly carteira: CarteiraDoLink;
  readonly tela: TelaDoLink;
}

/**
 * O que acontece quando o jogo abre com `#carteira=` no endereço:
 * 1. o fragmento sai do endereço na hora;
 * 2. a sala confere o código (`GET /carteira`), sem mexer em nada do aparelho;
 * 3. se o aparelho ainda não tem carteira, adota a do link sem perguntar (L49: é o amigo que veio do endereço antigo); se já é a mesma, nada
 *    aparece; se é outra, pergunta "Usar esta carteira neste aparelho?" com o saldo dela e o da atual;
 * 4. só troca se a pessoa confirmar.
 * Código inválido, desconhecido ou sala fora do ar: um aviso, e nada muda. Sem carteira própria, o aparelho cria uma depois (o jogo
 * não adiou isso por causa do link).
 */
export async function receberCarteiraDoLink(pedido: PedidoDoLink): Promise<ResultadoDoLink> {
  const leitura = lerFragmentoDaCarteira(pedido.hash);
  if (leitura.tipo === 'nenhum') return 'nenhum';
  pedido.limparEndereco(leitura.resto);
  const { carteira, tela } = pedido;
  /** Sem carteira própria o jogo ainda não a criou (esperava o link): cria agora, para o resto do jogo seguir como sempre. */
  const garantirAPropria = async (): Promise<void> => {
    if (!carteira.tem()) await carteira.garantir();
  };
  if (leitura.tipo === 'invalido') {
    await garantirAPropria();
    await tela.avisar(AVISO_LINK_INVALIDO);
    return 'invalido';
  }
  const temAtual = carteira.tem();
  const [conferida] = await Promise.all([carteira.conferir(leitura.codigo), temAtual ? carteira.garantir() : Promise.resolve(null)]);
  if (!conferida.ok) {
    await garantirAPropria();
    const desconhecida = conferida.erro === 'carteira-invalida';
    await tela.avisar(desconhecida ? AVISO_LINK_DESCONHECIDO : conferida.erro === 'fora-do-ar' ? AVISO_LINK_FORA_DO_AR : `${conferida.mensagem} Nada mudou.`);
    return desconhecida ? 'desconhecido' : 'fora-do-ar';
  }
  // Já é a deste aparelho (p.ex. o link colado na própria aba): nada a mostrar.
  if (conferida.mesma) return 'mesma';
  // Sem carteira aqui (quem veio do endereço antigo, L49): adota a do link sem perguntar, não há o que perder. Nunca cria uma vazia antes.
  if (!temAtual) {
    conferida.usar();
    void carteira.garantir();
    return 'trocada';
  }
  const usar = await tela.perguntar(perguntaDaTroca(conferida.estado, carteira.estado(), temAtual));
  if (!usar) {
    await garantirAPropria();
    return 'mantida';
  }
  conferida.usar();
  // O estado que a conferência trouxe tem alguns segundos; a leitura nova põe o saldo e as missões em dia.
  void carteira.garantir();
  return 'trocada';
}
