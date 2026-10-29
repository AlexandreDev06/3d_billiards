/**
 * A aparência do balão (L47): o catálogo fechado de chapéus, bigodes, estilos de olho e cores de olho que a loja vende, e o que a
 * sala guarda por carteira e manda aos outros jogadores. Só dados e funções puras, sem rede.
 *
 * Os ids são o contrato com o arquivo do artista, com o cliente e com a sala: português sem acento, `snake_case`, fechados. Trocar
 * um nome, um preço ou o que um item é, é editar este catálogo (e o teste que o fixa); item novo muda o que o esquema aceita, então
 * pede versão nova do protocolo. **Nada de barba**, nem bigode que desça ao queixo.
 *
 * Só o estilo `olho_normal` e a cor `castanho` são grátis (preço 0): todo mundo os tem, e o visual padrão (`APARENCIA_PADRAO`) usa
 * só eles. Todo o resto se compra, uma vez, e a posse é por item.
 *
 * Escala dos preços (a das skins de taco, de 50 a algumas centenas): as cores de olho são as mais baratas (40 a 80), estilos e
 * bigodes ficam no meio (90 a 160), e os chapéus vão do meio para cima (130 a 260), com a `coroa` (500) como o item de status
 * mais caro dos balões.
 */

/** Os quatro tipos de item, com o nome que o contrato dá a cada um (a chave do campo `corDosOlhos` é o `cor_dos_olhos` em camelCase). */
export const TIPOS_DE_ITEM_DO_BALAO = ['chapeu', 'bigode', 'olhos', 'cor_dos_olhos'] as const;
export type TipoDeItemDoBalao = (typeof TIPOS_DE_ITEM_DO_BALAO)[number];

/** Um item da loja do balão. `preco` 0 = todo mundo tem. */
export interface ItemDoBalao {
  readonly id: string;
  readonly tipo: TipoDeItemDoBalao;
  /** O nome na loja: português, curto. */
  readonly nome: string;
  /** Moedas, inteiro; 0 só no estilo `olho_normal` e na cor `castanho`. */
  readonly preco: number;
}

/**
 * Os 25 itens, agrupados por tipo na ordem do contrato (a ordem da loja). Chapéu e bigode: nenhum é grátis (`null` = sem ele).
 */
export const ITENS_DO_BALAO = [
  { id: 'chapeu_panama', tipo: 'chapeu', nome: 'Panamá de Domingo', preco: 200 },
  { id: 'bone_aba_reta', tipo: 'chapeu', nome: 'Boné do Cunhado', preco: 150 },
  { id: 'cartola', tipo: 'chapeu', nome: 'Cartola de Casamento', preco: 260 },
  { id: 'gorro_pompom', tipo: 'chapeu', nome: 'Gorro do Friozão', preco: 130 },
  { id: 'chapeu_palha', tipo: 'chapeu', nome: 'Palhinha de Pescador', preco: 160 },
  { id: 'boina', tipo: 'chapeu', nome: 'Boina do Seu Raul', preco: 180 },
  { id: 'chapeu_festa', tipo: 'chapeu', nome: 'Chapéu de Parabéns', preco: 140 },
  { id: 'coroa', tipo: 'chapeu', nome: 'Coroa do Rei da Mesa', preco: 500 },
  { id: 'bigode_fino', tipo: 'bigode', nome: 'Bigode de Galã', preco: 90 },
  { id: 'bigodao', tipo: 'bigode', nome: 'Bigodão de Respeito', preco: 120 },
  { id: 'bigode_guidao', tipo: 'bigode', nome: 'Guidão de Bicicleta', preco: 140 },
  { id: 'bigode_dali', tipo: 'bigode', nome: 'Pontas pro Alto', preco: 160 },
  { id: 'bigode_chevron', tipo: 'bigode', nome: 'Bigode de Tiozão', preco: 100 },
  { id: 'olho_normal', tipo: 'olhos', nome: 'Olho de Sempre', preco: 0 },
  { id: 'olho_kawaii', tipo: 'olhos', nome: 'Olhinho Kawaii', preco: 150 },
  { id: 'olho_bravo', tipo: 'olhos', nome: 'Cara de Poucos Amigos', preco: 120 },
  { id: 'olho_cansado', tipo: 'olhos', nome: 'Olho de Madrugada', preco: 100 },
  { id: 'castanho', tipo: 'cor_dos_olhos', nome: 'Castanho Café', preco: 0 },
  { id: 'mel', tipo: 'cor_dos_olhos', nome: 'Mel de Abelha', preco: 40 },
  { id: 'verde', tipo: 'cor_dos_olhos', nome: 'Verde Garrafa', preco: 50 },
  { id: 'azul', tipo: 'cor_dos_olhos', nome: 'Azul Piscina', preco: 50 },
  { id: 'cinza', tipo: 'cor_dos_olhos', nome: 'Cinza Fumaça', preco: 40 },
  { id: 'violeta', tipo: 'cor_dos_olhos', nome: 'Violeta de Uva', preco: 60 },
  { id: 'vermelho', tipo: 'cor_dos_olhos', nome: 'Vermelho Pimenta', preco: 70 },
  { id: 'dourado', tipo: 'cor_dos_olhos', nome: 'Dourado de Troféu', preco: 80 },
] as const satisfies readonly ItemDoBalao[];

type ItemNoCatalogo = (typeof ITENS_DO_BALAO)[number];

/** O id de um chapéu (o campo `chapeu` da aparência, ou `null` sem ele). */
export type IdDoChapeu = Extract<ItemNoCatalogo, { tipo: 'chapeu' }>['id'];
/** O id de um bigode (o campo `bigode` da aparência, ou `null` sem ele). */
export type IdDoBigode = Extract<ItemNoCatalogo, { tipo: 'bigode' }>['id'];
/** O id de um estilo de olho (o campo `olhos`). */
export type IdDoEstiloDeOlho = Extract<ItemNoCatalogo, { tipo: 'olhos' }>['id'];
/** O id de uma cor de olho (o campo `corDosOlhos`), que tinge a íris em qualquer estilo. */
export type IdDaCorDeOlho = Extract<ItemNoCatalogo, { tipo: 'cor_dos_olhos' }>['id'];
/** O id de qualquer item do catálogo. */
export type IdItemDoBalao = ItemNoCatalogo['id'];

const IDS_DO_CATALOGO: readonly string[] = ITENS_DO_BALAO.map((i) => i.id);

/** Os ids de cada tipo, na ordem da loja (o esquema da aparência os usa campo a campo). */
export const IDS_DOS_CHAPEUS = ITENS_DO_BALAO.filter((i) => i.tipo === 'chapeu').map((i) => i.id) as readonly IdDoChapeu[];
export const IDS_DOS_BIGODES = ITENS_DO_BALAO.filter((i) => i.tipo === 'bigode').map((i) => i.id) as readonly IdDoBigode[];
export const IDS_DOS_ESTILOS_DE_OLHO = ITENS_DO_BALAO.filter((i) => i.tipo === 'olhos').map((i) => i.id) as readonly IdDoEstiloDeOlho[];
export const IDS_DAS_CORES_DE_OLHO = ITENS_DO_BALAO.filter((i) => i.tipo === 'cor_dos_olhos').map((i) => i.id) as readonly IdDaCorDeOlho[];

/** Os itens de preço 0, que toda carteira tem sem comprar: o estilo `olho_normal` e a cor `castanho`. */
export const ITENS_GRATIS_DO_BALAO: readonly IdItemDoBalao[] = ITENS_DO_BALAO.filter((i) => i.preco === 0).map((i) => i.id);

/** O valor é o id de um item do catálogo? (`toString`, `__proto__` e afins não são.) */
export const ehIdDeItemDoBalao = (valor: unknown): valor is IdItemDoBalao => typeof valor === 'string' && IDS_DO_CATALOGO.includes(valor);

/** O item do catálogo, com o id já tipado. */
export const itemDoBalao = (id: IdItemDoBalao): ItemNoCatalogo => ITENS_DO_BALAO.find((i) => i.id === id)!;

/** O que o item custa (0 = grátis). O preço do balão é fixo: não há vitrine do dia. */
export const precoDoItemDoBalao = (id: IdItemDoBalao): number => itemDoBalao(id).preco;

/** Posição do item na loja, para ordenar a lista de quem tem. */
export const ordemDoItemDoBalao = (id: IdItemDoBalao): number => IDS_DO_CATALOGO.indexOf(id);

/**
 * O que a sala guarda por carteira e manda aos outros jogadores: o balão que a pessoa está usando. `chapeu` e `bigode` são `null`
 * sem o item; `olhos` e `corDosOlhos` sempre têm um. No fio os quatro campos vêm sempre, com `null` explícito (nunca ausentes).
 */
export interface AparenciaDoBalao {
  readonly chapeu: IdDoChapeu | null;
  readonly bigode: IdDoBigode | null;
  readonly olhos: IdDoEstiloDeOlho;
  readonly corDosOlhos: IdDaCorDeOlho;
}

/** O balão de quem não escolheu nada (e de quem não tem carteira): sem chapéu, sem bigode, olho normal, castanho. Só itens grátis. */
export const APARENCIA_PADRAO: AparenciaDoBalao = Object.freeze({ chapeu: null, bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' });

/** Os ids que a aparência usa, sem os `null`, na ordem chapéu, bigode, estilo, cor. */
export const itensDaAparencia = (a: AparenciaDoBalao): IdItemDoBalao[] => {
  const ids: IdItemDoBalao[] = [];
  if (a.chapeu !== null) ids.push(a.chapeu);
  if (a.bigode !== null) ids.push(a.bigode);
  ids.push(a.olhos, a.corDosOlhos);
  return ids;
};

/** Cada item da aparência é grátis ou está em `itens` (os que a carteira tem)? É a regra de "equipar só o que se tem". */
export const aparenciaCabeNosItens = (a: AparenciaDoBalao, itens: readonly IdItemDoBalao[]): boolean =>
  itensDaAparencia(a).every((id) => precoDoItemDoBalao(id) === 0 || itens.includes(id));

/** As duas aparências são a mesma? */
export const aparenciaIgual = (a: AparenciaDoBalao, b: AparenciaDoBalao): boolean =>
  a.chapeu === b.chapeu && a.bigode === b.bigode && a.olhos === b.olhos && a.corDosOlhos === b.corDosOlhos;

/**
 * O balão de uma carteira, como o HTTP o entrega (`EstadoCarteira.balao`): a aparência em uso e os itens que ela tem, os grátis
 * incluídos, na ordem da loja. A aparência sempre cabe nos itens.
 */
export interface EstadoDoBalao {
  readonly aparencia: AparenciaDoBalao;
  readonly itens: readonly IdItemDoBalao[];
}
