/**
 * A carteira e a aposta da sala (L22): o catálogo de skins do taco, o saldo inicial, as apostas que o anfitrião escolhe
 * e os tipos do HTTP da carteira (`/carteira` no mesmo servidor da sala). Só dados e tipos, sem rede.
 *
 * A carteira é um código secreto que a sala cria (`POST /carteira`) e o navegador guarda; quem o tem, mexe nela. A sala
 * nunca o devolve a ninguém depois da criação: em `estado-sala` só vão o saldo e a skin de cada lugar.
 */
import type { AparenciaDoBalao, EstadoDoBalao } from './balao';
import type { EstatisticasDaCarteira } from './estatisticas';
import type { MissoesDoDia, VitrineDoDia } from './missoes';

/** As faixas de raridade (L34), da mais comum à mais rara, com o nome e a cor que a loja e o taco mostram. */
export const FAIXAS = [
  { id: 'balcao', nome: 'Balcão', cor: '#b0c3d9' },
  { id: 'mesa', nome: 'Mesa', cor: '#5e98d9' },
  { id: 'salao', nome: 'Salão', cor: '#8847ff' },
  { id: 'camarote', nome: 'Camarote', cor: '#d32ce6' },
  { id: 'lenda', nome: 'Lenda', cor: '#eb4b4b' },
  { id: 'reliquia', nome: 'Relíquia', cor: '#e4ae39' },
] as const;

export type FaixaDeSkin = (typeof FAIXAS)[number]['id'];

/** A faixa de raridade: o nome e a cor dela. */
export const faixaDoCatalogo = (faixa: FaixaDeSkin): (typeof FAIXAS)[number] => FAIXAS.find((f) => f.id === faixa)!;

/** Quantas sementes existem: de 0 a `SEMENTES_POR_ITEM - 1`. Cada taco comprado leva uma, sorteada pela sala. */
export const SEMENTES_POR_ITEM = 1000;

/** O valor é uma semente válida (inteiro de 0 a 999)? */
export const ehSemente = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) < SEMENTES_POR_ITEM;

/**
 * Uma semente rara do desenho de antes do L34c (cerca de 1% do catálogo, 10 em 1000 por skin): o taco com ela tem um padrão
 * especial, que o cliente desenha de um jeito próprio e a loja mostra com o `selo`. É dado: trocar um padrão é editar o catálogo.
 * Nas skins que têm `padroes` (L34c), valem os `padroes` e a lista `raras` fica só para o web do L35, que ainda a lê.
 */
export interface PadraoRaro {
  readonly semente: number;
  /** O nome do padrão, para a tela ("Gema azul"). */
  readonly nome: string;
  /** Texto curto do selo no cabo e na loja (até 12 caracteres, em maiúsculas). */
  readonly selo: string;
}

/** Uma faixa de sementes, com as duas pontas dentro: `{de: 0, ate: 249}` são as 250 primeiras. Uma semente só é `{de: 44, ate: 44}`. */
export interface FaixaDeSementes {
  readonly de: number;
  readonly ate: number;
}

/**
 * Um padrão nomeado de uma skin (L34c), dado pela semente do taco: uma fase comum ("Phase 2") ou uma rara ("Ruby"). `faixas` são
 * as sementes que o dão. Numa skin, a PRIMEIRA entrada de `padroes` que cobre a semente vale; por isso as raras vêm antes das
 * fases, e as fases podem ser faixas largas que as raras furam.
 */
export interface PadraoDaSkin {
  readonly nome: string;
  /** Texto curto do selo no cabo e na loja (até 12 caracteres, em maiúsculas). */
  readonly selo: string;
  /** Rara: as raras de uma skin somam de 1% a 1,5% das sementes. As fases comuns não são raras. */
  readonly rara: boolean;
  readonly faixas: readonly FaixaDeSementes[];
}

/** O que a semente de um taco dá numa skin (L34c): o nome e o selo do padrão e se ele é raro. */
export interface PadraoDaSemente {
  readonly nome: string;
  readonly selo: string;
  readonly rara: boolean;
}

/**
 * Uma skin do catálogo: id sem acento, nome da loja, preço, faixa e as sementes raras (vazio só no clássico). `padroes` (L34c) são
 * os padrões nomeados por semente das skins que os têm (as fases do Doppler e do Gamma Doppler e as raras do CS); opcional, as
 * outras skins seguem só com `raras`. Quem lê o padrão de uma semente usa `padraoDaSemente`, que junta as duas fontes.
 */
export interface SkinDoCatalogo {
  readonly id: string;
  readonly nome: string;
  readonly preco: number;
  readonly faixa: FaixaDeSkin;
  /** @deprecated Nas skins com `padroes` esta lista não vale mais (L34c). O web do L35 ainda a lê; sai quando o web migrar para `padraoDaSemente`. */
  readonly raras: readonly PadraoRaro[];
  readonly padroes?: readonly PadraoDaSkin[];
}

/** As sementes `sementes` de um padrão raro, uma entrada por semente. */
const padrao = (nome: string, selo: string, ...sementes: number[]): PadraoRaro[] => sementes.map((semente) => ({ semente, nome, selo }));

/** Um padrão raro de `padroes` (L34c): as sementes `sementes`, cada uma uma faixa de uma semente só. */
const rara = (nome: string, selo: string, ...sementes: number[]): PadraoDaSkin => ({ nome, selo, rara: true, faixas: sementes.map((s) => ({ de: s, ate: s })) });

/** Uma fase comum de `padroes` (L34c): as sementes de `de` a `ate`, as duas pontas dentro. */
const fase = (nome: string, selo: string, de: number, ate: number): PadraoDaSkin => ({ nome, selo, rara: false, faixas: [{ de, ate }] });

/** As quatro fases comuns do Doppler e do Gamma Doppler, de 250 sementes cada; as raras, que vêm antes na lista, furam as faixas. */
const FASES: readonly PadraoDaSkin[] = [fase('Phase 1', 'PHASE 1', 0, 249), fase('Phase 2', 'PHASE 2', 250, 499), fase('Phase 3', 'PHASE 3', 500, 749), fase('Phase 4', 'PHASE 4', 750, 999)];

/** As sementes da rara da Howl e da Dragon Lore (L34d): as 10 de antes, que eram 4 + 6 em dois padrões, numa lista só (1%). */
const SEMENTES_DA_HOWL = [43, 91, 165, 184, 202, 318, 382, 746, 864, 927] as const;
const SEMENTES_DO_DRAGON_LORE = [13, 39, 318, 350, 485, 519, 775, 820, 855, 921] as const;

/**
 * O catálogo fechado, na ordem da loja (por faixa e, dentro dela, por preço). `preco` 0 = todo mundo tem (o clássico); o visual de
 * cada skin é do cliente. As 8 primeiras do L22 ficam com o mesmo preço e as 13 do L34 vêm de `docs/design/skins-de-taco.md`.
 *
 * L34c: nove skins ganharam o nome do CS, e o `id` NÃO mudou (o web desenha cada skin pelo id): `tempera` é a Case Hardened,
 * `esmeralda-do-pano` a Gamma Doppler, `obsidiana` a Doppler, `fim-de-tarde` a Fade, `resina-marmorizada` a Marble Fade,
 * `rede-de-cacapa` a Crimson Web, `placar` a Asiimov, `dragao-das-quinze` a Dragon Lore e `corujao` a Howl (o id `corujao` é a Howl
 * agora, não mais o Corujão). Preços e faixas ficaram como estavam.
 */
export const SKINS_DE_TACO = [
  { id: 'classico', nome: 'Clássico', preco: 0, faixa: 'balcao', raras: [] },
  { id: 'ebano', nome: 'Ébano', preco: 50, faixa: 'mesa', raras: [...padrao('Veio de ouro', 'OURO', 21, 92, 186, 851), ...padrao('Raiz retorcida', 'RAIZ', 86, 113, 169, 521, 543, 681)] },
  { id: 'xadrez-de-toalha', nome: 'Xadrez de Toalha', preco: 70, faixa: 'mesa', raras: [...padrao('Toalha de domingo', 'DOMINGO', 164, 212, 704, 771), ...padrao('Toalha com molho', 'MOLHO', 137, 655, 709, 955, 977, 991)] },
  { id: 'boteco', nome: 'Boteco', preco: 80, faixa: 'mesa', raras: [...padrao('Rótulo de ouro', 'OURO', 46, 198, 480, 741), ...padrao('Chopp na espuma', 'ESPUMA', 30, 365, 652, 940, 950, 970)] },
  { id: 'marfim', nome: 'Marfim', preco: 100, faixa: 'mesa', raras: [...padrao('Marfim antigo', 'ANTIGO', 104, 166, 671, 877), ...padrao('Veio de jade', 'JADE', 34, 68, 385, 510, 769, 952)] },
  { id: 'long-neck', nome: 'Long Neck', preco: 120, faixa: 'mesa', raras: [...padrao('Garrafa âmbar', 'ÂMBAR', 64, 96, 951, 996), ...padrao('Rótulo dourado', 'RÓTULO', 8, 242, 270, 437, 615, 861)] },
  { id: 'carbono', nome: 'Carbono', preco: 150, faixa: 'salao', raras: [...padrao('Trama diagonal', 'DIAGONAL', 80, 451, 607, 844), ...padrao('Fibra azul', 'FIBRA AZUL', 93, 109, 195, 343, 344, 889)] },
  { id: 'placar', nome: 'Asiimov', preco: 180, faixa: 'salao', raras: [...padrao('Placar zerado', 'ZERADO', 385, 593, 927, 973), ...padrao('Placar de decisão', 'DECISÃO', 76, 119, 155, 321, 518, 587)] },
  { id: 'chamas', nome: 'Chamas', preco: 200, faixa: 'salao', raras: [...padrao('Chama azul', 'CHAMA AZUL', 105, 230, 248, 952), ...padrao('Brasa viva', 'BRASA', 47, 68, 151, 545, 866, 909)] },
  {
    id: 'fim-de-tarde',
    nome: 'Fade',
    preco: 250,
    faixa: 'salao',
    raras: [...padrao('Sol a pino', 'SOL', 2, 282, 402, 945), ...padrao('Hora azul', 'HORA AZUL', 110, 256, 530, 723, 863, 969)],
    padroes: [rara('Full Fade', 'FULL FADE', 36, 119, 233, 307, 444, 589, 691, 760, 833, 902, 998)],
  },
  {
    id: 'resina-marmorizada',
    nome: 'Marble Fade',
    preco: 280,
    faixa: 'salao',
    raras: [...padrao('Bola 8 perfeita', 'BOLA 8', 150, 588, 647, 728), ...padrao('Redemoinho de rubi', 'RUBI', 115, 181, 219, 273, 736, 925)],
    padroes: [rara('Fire & Ice', 'FIRE & ICE', 21, 88, 176, 254, 331, 407, 486, 575, 664, 742, 819, 934)],
  },
  { id: 'neon', nome: 'Neon', preco: 300, faixa: 'salao', raras: [...padrao('Neon rosa', 'ROSA', 131, 436, 474, 885), ...padrao('Neon que pisca', 'PISCA', 218, 239, 289, 317, 676, 821)] },
  { id: 'coral', nome: 'Coral', preco: 350, faixa: 'camarote', raras: [...padrao('Coral verdadeira', 'VERDADEIRA', 42, 794, 809, 969), ...padrao('Coral albina', 'ALBINA', 504, 684, 740, 926, 941, 964)] },
  { id: 'rede-de-cacapa', nome: 'Crimson Web', preco: 400, faixa: 'camarote', raras: [...padrao('Rede de seda', 'SEDA', 319, 598, 768, 920), ...padrao('Rede rubi', 'RUBI', 203, 317, 443, 736, 941, 957)] },
  { id: 'bicho-solto', nome: 'Bicho Solto', preco: 450, faixa: 'camarote', raras: [...padrao('Bicho raro', 'RARO', 538, 665, 708, 950), ...padrao('Zoológico completo', 'ZOO', 156, 508, 520, 543, 645, 873)] },
  { id: 'ouro', nome: 'Ouro', preco: 500, faixa: 'camarote', raras: [...padrao('Ouro rosa', 'ROSA', 275, 666, 868, 962), ...padrao('Ouro branco', 'BRANCO', 183, 300, 341, 441, 478, 721)] },
  {
    id: 'esmeralda-do-pano',
    nome: 'Gamma Doppler',
    preco: 800,
    faixa: 'lenda',
    raras: [...padrao('Esmeralda perfeita', 'PERFEITA', 219, 243, 327, 572), ...padrao('Faceta dupla', 'DUPLA', 166, 168, 241, 272, 719, 868)],
    padroes: [rara('Emerald', 'EMERALD', 58, 131, 207, 266, 342, 415, 493, 561, 638, 731, 794, 867), ...FASES],
  },
  {
    id: 'obsidiana',
    nome: 'Doppler',
    preco: 1000,
    faixa: 'lenda',
    raras: [...padrao('Obsidiana arco-íris', 'ARCO-ÍRIS', 332, 530, 715, 877), ...padrao('Eclipse', 'ECLIPSE', 151, 298, 314, 428, 452, 468)],
    padroes: [rara('Ruby', 'RUBY', 77, 313, 609, 905), rara('Sapphire', 'SAPPHIRE', 142, 388, 654, 921), rara('Black Pearl', 'BLACK PEARL', 29, 471, 836), ...FASES],
  },
  {
    id: 'tempera',
    nome: 'Case Hardened',
    preco: 1200,
    faixa: 'lenda',
    raras: [...padrao('Gema azul', 'GEMA AZUL', 44, 281, 458, 882), ...padrao('Ouro e roxo', 'ROXO', 10, 185, 214, 253, 657, 947)],
    // a Blue Gem é a antiga Gema azul: as quatro sementes de antes (44, 281, 458 e 882) continuam raras
    padroes: [rara('Blue Gem', 'BLUE GEM', 44, 97, 163, 281, 349, 458, 512, 603, 677, 748, 882, 955)],
  },
  {
    // L34c: o id `corujao` é a Howl (o lobo uivando, em vermelho e laranja); a Corujão saiu da Relíquia. O id ficou para o web desenhar pelo id.
    // L34d: uma rara só, "Lobo da Geada" (azul-gelo e branco, a variação que o Pincel pintou no P3): as 10 sementes raras de antes
    // (Olhar de madrugada e Coruja albina) viraram uma lista, e `raras` e `padroes` dizem a mesma coisa.
    id: 'corujao',
    nome: 'Howl',
    preco: 2000,
    faixa: 'reliquia',
    raras: padrao('Lobo da Geada', 'GEADA', ...SEMENTES_DA_HOWL),
    padroes: [rara('Lobo da Geada', 'GEADA', ...SEMENTES_DA_HOWL)],
  },
  {
    // L34d: uma rara só, "Ouro Verde" (o dragão em verde e ouro, P3): as 10 sementes de As quinze e Sopro de giz numa lista.
    id: 'dragao-das-quinze',
    nome: 'Dragon Lore',
    preco: 3000,
    faixa: 'reliquia',
    raras: padrao('Ouro Verde', 'OURO VERDE', ...SEMENTES_DO_DRAGON_LORE),
    padroes: [rara('Ouro Verde', 'OURO VERDE', ...SEMENTES_DO_DRAGON_LORE)],
  },
] as const satisfies readonly SkinDoCatalogo[];

export type SkinTaco = (typeof SKINS_DE_TACO)[number]['id'];

/** A skin de quem não escolheu (e de quem não tem carteira): a única grátis. */
export const SKIN_PADRAO: SkinTaco = 'classico';

const IDS_DAS_SKINS: readonly string[] = SKINS_DE_TACO.map((s) => s.id);

/** O valor é o id de uma skin do catálogo? (`toString`, `__proto__` e afins não são.) */
export const ehSkinDeTaco = (valor: unknown): valor is SkinTaco => typeof valor === 'string' && IDS_DAS_SKINS.includes(valor);

/** A skin do catálogo, com o id já tipado. */
export const skinDoCatalogoPorId = (skin: SkinTaco): SkinDoCatalogo & { readonly id: SkinTaco } => SKINS_DE_TACO.find((s) => s.id === skin)!;

/** O preço cheio da skin (sem a vitrine do dia; para o preço do dia, `precoDaSkinNoDia`). */
export const precoDaSkin = (skin: SkinTaco): number => skinDoCatalogoPorId(skin).preco;

/** A faixa de raridade da skin. */
export const faixaDaSkin = (skin: SkinTaco): FaixaDeSkin => skinDoCatalogoPorId(skin).faixa;

/** Posição da skin na loja, para ordenar a lista de quem tem. */
export const ordemDaSkin = (skin: SkinTaco): number => IDS_DAS_SKINS.indexOf(skin);

/**
 * O padrão raro de antes do L34c que esta semente dá nesta skin, ou `undefined` se a semente é comum. É o que o web do L35 lê; nas
 * skins com `padroes` ele não acompanha os padrões novos: quem quer o padrão de verdade usa `padraoDaSemente`.
 */
export const padraoRaroDaSemente = (skin: SkinTaco, semente: number): PadraoRaro | undefined => skinDoCatalogoPorId(skin).raras.find((r) => r.semente === semente);

/**
 * O padrão que esta semente dá nesta skin (L34c), ou `undefined` se a semente não tem padrão com nome. Função pura do catálogo.
 * Skin com `padroes`: vale a primeira entrada que cobre a semente (as raras antes das fases). Skin sem `padroes`: só as
 * sementes de `raras`, todas raras. Semente que não é inteiro de 0 a 999 não tem padrão.
 */
export const padraoDaSemente = (skin: SkinTaco, semente: number): PadraoDaSemente | undefined => {
  if (!ehSemente(semente)) return undefined;
  const entrada = skinDoCatalogoPorId(skin);
  if (entrada.padroes !== undefined) {
    const achado = entrada.padroes.find((p) => p.faixas.some((f) => semente >= f.de && semente <= f.ate));
    return achado === undefined ? undefined : { nome: achado.nome, selo: achado.selo, rara: achado.rara };
  }
  const antiga = padraoRaroDaSemente(skin, semente);
  return antiga === undefined ? undefined : { nome: antiga.nome, selo: antiga.selo, rara: true };
};

/** Um taco da carteira: a skin, a semente que a sala sorteou na compra (ou na migração) e quantas bolas já matou. Um por skin. */
export interface ItemTaco {
  readonly skin: SkinTaco;
  /** Inteiro de 0 a 999; o padrão do taco sai dela. */
  readonly semente: number;
  /** As bolas matadas com este taco (o contador, no estilo do StatTrak): as mesmas bolas das missões, online e valendo moeda. */
  readonly bolas: number;
}

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
 * O que a carteira tem. `itens` (L34) são os tacos, um por skin, na ordem da loja, sempre com o da `SKIN_PADRAO`; `skin` é a que
 * está em uso e está entre eles. `saldo` é inteiro e pode ser negativo (perder aposta não tem piso).
 */
export interface EstadoCarteira {
  readonly saldo: number;
  /**
   * As skins que a carteira tem, na ordem da loja: sempre as de `itens` (L34). Fica porque o web de antes lê daqui; o cliente
   * novo lê `itens`, e este campo sai quando ele migrar.
   */
  readonly skins: readonly SkinTaco[];
  readonly skin: SkinTaco;
  /**
   * Os tacos da carteira, um por skin, cada um com a sua semente e o seu contador (L34). Opcional no tipo para o web de antes
   * compilar; a sala sempre manda.
   */
  readonly itens?: readonly ItemTaco[];
  /**
   * A vitrine do dia (L34): as 3 skins com desconto hoje e o preço de cada uma, iguais para todo mundo. Opcional no tipo para o web
   * de antes compilar; a sala sempre manda.
   */
  readonly vitrine?: VitrineDoDia;
  /**
   * As missões do dia e o progresso desta carteira (L31). Opcional no tipo para o web de antes compilar; a sala sempre manda.
   * Vale o dia do servidor no momento da resposta: virou o dia, o progresso volta a zero.
   */
  readonly missoes?: MissoesDoDia;
  /**
   * As estatísticas da carteira (L38): o total e a contagem por modalidade das partidas online que acabaram de verdade (com vencedor,
   * aposta valendo e a física padrão). Opcional no tipo para o web de antes compilar; a sala sempre manda, zeradas para quem nunca jogou
   * uma que contou.
   */
  readonly estatisticas?: EstatisticasDaCarteira;
  /**
   * O balão da carteira (L47): a aparência em uso e os itens que ela tem (os grátis incluídos, na ordem da loja). Opcional no tipo
   * para o web de antes compilar. A sala manda a quem declara a versão 10 do protocolo (cabeçalho `CABECALHO_DO_PROTOCOLO`, ver
   * compat.ts) e NÃO manda a quem não declara nada, que é o cliente da versão 9: o esquema dele é estrito e não leria a chave. As
   * respostas das rotas do balão (comprar item, equipar) levam sempre.
   */
  readonly balao?: EstadoDoBalao;
}

/** Resposta de `POST /carteira`: a única vez em que o código sai da sala. */
export interface CarteiraCriada extends EstadoCarteira {
  readonly codigo: string;
}

/**
 * Corpo de `POST /carteira/comprar` e `POST /carteira/usar`. Que `skin` esteja no catálogo é conferido pela sala (`skin-invalida`).
 */
export interface PedidoDeSkin {
  readonly skin: string;
  /**
   * Só em `comprar` (em `usar` é pedido errado): o preço que a tela mostrou, inteiro de 1 a 1 000 000. A sala o usa como TETO, nunca
   * como preço: se o preço dela na hora for maior (a vitrine virou o dia e a skin saiu dela), recusa com `preco-mudou` sem cobrar;
   * se for igual ou menor, cobra o preço dela. Ausente, a sala cobra o preço do dia sem conferir nada.
   */
  readonly preco?: number;
}

/**
 * Corpo de `POST /carteira/balao/comprar` (L47). Que `item` seja um id do catálogo do balão é conferido pela sala (`item-invalido`).
 * O preço do balão é fixo (não há vitrine do dia), e a sala cobra sempre o do catálogo dela.
 */
export interface PedidoDeItemDoBalao {
  readonly item: string;
  /**
   * O preço que a tela mostrou, inteiro de 1 a 1 000 000, só como TETO como nas skins: se o preço da sala na hora for maior (o catálogo
   * mudou numa versão nova), recusa com `preco-mudou` sem cobrar; igual ou menor, cobra o dela. Ausente, a sala cobra sem conferir.
   */
  readonly preco?: number;
}

/**
 * Corpo de `POST /carteira/balao/equipar` (L47): a aparência inteira que a pessoa quer usar. Tudo ou nada: se um só campo não vale
 * (`aparencia-invalida`) ou um item pago não é da carteira (`nao-tem`), nada muda.
 */
export interface PedidoDeAparencia {
  readonly aparencia: AparenciaDoBalao;
}

/**
 * Os erros do HTTP da carteira, no corpo `{ erro, mensagem }`. `requisicao-invalida`: corpo, cabeçalho, método ou origem
 * errados (o status HTTP diz qual). `preco-mudou` (L34b): a compra pediu `preco` e o preço do dia na sala é maior; nada foi cobrado,
 * e o cliente relê a carteira para mostrar o preço novo. Os outros seis são os da loja e da conta. L47, balão: `item-invalido` (o `item`
 * não é do catálogo do balão) e `aparencia-invalida` (a aparência pedida tem campo que não vale); `ja-tem`, `nao-tem`,
 * `saldo-insuficiente` e `preco-mudou` valem também para os itens do balão.
 */
export type CodigoErroCarteira =
  | 'carteira-invalida'
  | 'saldo-insuficiente'
  | 'skin-invalida'
  | 'ja-tem'
  | 'nao-tem'
  | 'preco-mudou'
  | 'item-invalido'
  | 'aparencia-invalida'
  | 'limite'
  | 'requisicao-invalida';

export interface ErroDaCarteira {
  readonly erro: CodigoErroCarteira;
  readonly mensagem: string;
}
