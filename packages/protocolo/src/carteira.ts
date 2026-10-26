/**
 * A carteira e a aposta da sala (L22): o catálogo de skins do taco, o saldo inicial, as apostas que o anfitrião escolhe
 * e os tipos do HTTP da carteira (`/carteira` no mesmo servidor da sala). Só dados e tipos, sem rede.
 *
 * A carteira é um código secreto que a sala cria (`POST /carteira`) e o navegador guarda; quem o tem, mexe nela. A sala
 * nunca o devolve a ninguém depois da criação: em `estado-sala` só vão o saldo e a skin de cada lugar.
 */
import type { MissoesDoDia } from './missoes';

/** O catálogo fechado, na ordem da loja. `preco` 0 = todo mundo tem (o clássico); o visual de cada skin é do cliente. */
export const SKINS_DE_TACO = [
  { id: 'classico', nome: 'Clássico', preco: 0 },
  { id: 'ebano', nome: 'Ébano', preco: 50 },
  { id: 'boteco', nome: 'Boteco', preco: 80 },
  { id: 'marfim', nome: 'Marfim', preco: 100 },
  { id: 'carbono', nome: 'Carbono', preco: 150 },
  { id: 'chamas', nome: 'Chamas', preco: 200 },
  { id: 'neon', nome: 'Neon', preco: 300 },
  { id: 'ouro', nome: 'Ouro', preco: 500 },
] as const;

export type SkinTaco = (typeof SKINS_DE_TACO)[number]['id'];

/** A skin de quem não escolheu (e de quem não tem carteira): a única grátis. */
export const SKIN_PADRAO: SkinTaco = 'classico';

const IDS_DAS_SKINS: readonly string[] = SKINS_DE_TACO.map((s) => s.id);

/** O valor é o id de uma skin do catálogo? (`toString`, `__proto__` e afins não são.) */
export const ehSkinDeTaco = (valor: unknown): valor is SkinTaco => typeof valor === 'string' && IDS_DAS_SKINS.includes(valor);

export const precoDaSkin = (skin: SkinTaco): number => SKINS_DE_TACO.find((s) => s.id === skin)!.preco;

/** Posição da skin na loja, para ordenar a lista de quem tem. */
export const ordemDaSkin = (skin: SkinTaco): number => IDS_DAS_SKINS.indexOf(skin);

/** Quanto cada jogador com carteira põe na partida, escolhido pelo anfitrião ao criar a sala e na espera. */
export const APOSTAS_DA_SALA = [10, 20, 50, 100] as const;
export type ApostaSala = (typeof APOSTAS_DA_SALA)[number];
export const APOSTA_PADRAO: ApostaSala = 10;

/** O que uma carteira nova tem. */
export const SALDO_INICIAL = 100;

/** Tamanho do código da carteira: 32 bytes aleatórios em base64url, sem preenchimento. */
export const TAMANHO_CODIGO_CARTEIRA = 43;
const FORMATO_DO_CODIGO = /^[A-Za-z0-9_-]{43}$/;

/** O texto tem a forma de um código de carteira? Não diz se ela existe. */
export const ehCodigoDeCarteira = (valor: unknown): valor is string => typeof valor === 'string' && FORMATO_DO_CODIGO.test(valor);

// ---------------------------------------------------------------- HTTP

/**
 * O que a carteira tem. `skins` na ordem da loja, sempre com a `SKIN_PADRAO`; `skin` é a que está em uso e está entre elas.
 * `saldo` é inteiro e pode ser negativo (perder aposta não tem piso).
 */
export interface EstadoCarteira {
  readonly saldo: number;
  readonly skins: readonly SkinTaco[];
  readonly skin: SkinTaco;
  /**
   * As missões do dia e o progresso desta carteira (L31). Opcional no tipo para o web de antes compilar; a sala sempre manda.
   * Vale o dia do servidor no momento da resposta: virou o dia, o progresso volta a zero.
   */
  readonly missoes?: MissoesDoDia;
}

/** Resposta de `POST /carteira`: a única vez em que o código sai da sala. */
export interface CarteiraCriada extends EstadoCarteira {
  readonly codigo: string;
}

/** Corpo de `POST /carteira/comprar` e `POST /carteira/usar`. Que `skin` esteja no catálogo é conferido pela sala (`skin-invalida`). */
export interface PedidoDeSkin {
  readonly skin: string;
}

/**
 * Os erros do HTTP da carteira, no corpo `{ erro, mensagem }`. `requisicao-invalida`: corpo, cabeçalho, método ou origem
 * errados (o status HTTP diz qual). Os outros seis são os da loja e da conta.
 */
export type CodigoErroCarteira =
  | 'carteira-invalida'
  | 'saldo-insuficiente'
  | 'skin-invalida'
  | 'ja-tem'
  | 'nao-tem'
  | 'limite'
  | 'requisicao-invalida';

export interface ErroDaCarteira {
  readonly erro: CodigoErroCarteira;
  readonly mensagem: string;
}
