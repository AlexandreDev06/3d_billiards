import {
  IDS_DAS_CORES_DE_OLHO,
  IDS_DOS_BIGODES,
  IDS_DOS_CHAPEUS,
  IDS_DOS_ESTILOS_DE_OLHO,
  ITENS_DO_BALAO,
  aparenciaCabeNosItens,
  aparenciaIgual,
  itemDoBalao,
  itensDaAparencia,
  type AparenciaDoBalao,
  type EstadoCarteira,
  type IdItemDoBalao,
  type TipoDeItemDoBalao,
} from '@sinuca/protocolo';
import { textoDeMoedas } from './moedas';

/**
 * A personalização do balão (L48), pura: o que a loja e o editor "Meu balão" escrevem a partir da carteira (`EstadoCarteira.balao`).
 * O catálogo (ids, nomes, preços) é do `packages/protocolo`; aqui só há a ordem das categorias, os títulos e as regras de tela
 * ("só o que a carteira tem pode ser equipado"). Sem DOM, sem rede e sem o código da carteira.
 */

export type CategoriaDoBalao = TipoDeItemDoBalao;

export interface DefinicaoDaCategoria {
  readonly id: CategoriaDoBalao;
  /** O campo da `AparenciaDoBalao` (em camelCase, como o protocolo). */
  readonly campo: keyof AparenciaDoBalao;
  readonly titulo: string;
  /** Chapéu e bigode aceitam "Nenhum" (`null`); olhos e cor sempre têm um. */
  readonly opcional: boolean;
  /** Os ids da categoria, na ordem da loja. */
  readonly ids: readonly IdItemDoBalao[];
}

export const CATEGORIAS_DO_BALAO: readonly DefinicaoDaCategoria[] = [
  { id: 'chapeu', campo: 'chapeu', titulo: 'Chapéus', opcional: true, ids: IDS_DOS_CHAPEUS },
  { id: 'bigode', campo: 'bigode', titulo: 'Bigodes', opcional: true, ids: IDS_DOS_BIGODES },
  { id: 'olhos', campo: 'olhos', titulo: 'Estilo dos olhos', opcional: false, ids: IDS_DOS_ESTILOS_DE_OLHO },
  { id: 'cor_dos_olhos', campo: 'corDosOlhos', titulo: 'Cor dos olhos', opcional: false, ids: IDS_DAS_CORES_DE_OLHO },
];

const definicao = (id: CategoriaDoBalao): DefinicaoDaCategoria => CATEGORIAS_DO_BALAO.find((c) => c.id === id)!;

/** O ícone do artista: `public/personagens/icones/<id>.png` (o id é o do contrato). */
export const iconeDoItem = (id: IdItemDoBalao): string => `/personagens/icones/${id}.png`;

const textoDoPreco = (preco: number): string => (preco === 0 ? 'Grátis' : textoDeMoedas(preco));

/** O id que a aparência usa na categoria (`null` sem chapéu ou sem bigode). */
export function itemDaAparencia(a: AparenciaDoBalao, categoria: CategoriaDoBalao): IdItemDoBalao | null {
  return a[definicao(categoria).campo];
}

/** O nome do que está equipado na categoria ("Nenhum" sem chapéu ou bigode). */
export function textoDoCampoDoBalao(a: AparenciaDoBalao, categoria: CategoriaDoBalao): string {
  const id = itemDaAparencia(a, categoria);
  return id === null ? 'Nenhum' : itemDoBalao(id).nome;
}

// ---------------------------------------------------------------- a loja

export type SituacaoDoItem = 'a-venda' | 'seu' | 'equipado';

/** Um item na loja: o que o cartão escreve e o que o botão faz. */
export interface CartaoDeItem {
  readonly id: IdItemDoBalao;
  readonly categoria: CategoriaDoBalao;
  readonly nome: string;
  readonly icone: string;
  readonly preco: number;
  /** "Grátis" ou "150 moedas". */
  readonly textoDoPreco: string;
  readonly situacao: SituacaoDoItem;
  readonly selo: 'Seu' | 'Equipado' | null;
  /** O que o botão faz; `null` = sem botão (já é meu, ou a loja está fora do ar). */
  readonly acao: 'comprar' | null;
  /** O botão está ligado (comprar só com saldo que cobre o preço). */
  readonly podeAgir: boolean;
  readonly faltam: number;
  /** "Faltam 30 moedas" quando falta; `null` caso contrário. */
  readonly textoFaltam: string | null;
}

export interface CategoriaNaLoja {
  readonly id: CategoriaDoBalao;
  readonly titulo: string;
  readonly cartoes: readonly CartaoDeItem[];
}

export interface BalaoNaLoja {
  /** A carteira foi lida e a sala mandou o balão: sem isso a seção aparece, mas ninguém compra. */
  readonly disponivel: boolean;
  readonly categorias: readonly CategoriaNaLoja[];
}

/** A seção "Balão" da loja a partir da carteira do aparelho (`null` = ainda não lida ou sala fora do ar). */
export function balaoNaLoja(carteira: EstadoCarteira | null): BalaoNaLoja {
  const balao = carteira?.balao;
  const categorias = CATEGORIAS_DO_BALAO.map((c): CategoriaNaLoja => ({
    id: c.id,
    titulo: c.titulo,
    cartoes: c.ids.map((id): CartaoDeItem => {
      const item = itemDoBalao(id);
      const base = { id, categoria: c.id, nome: item.nome, icone: iconeDoItem(id), preco: item.preco, textoDoPreco: textoDoPreco(item.preco) };
      const semBotao = { acao: null, podeAgir: false, faltam: 0, textoFaltam: null } as const;
      if (carteira === null || balao === undefined) {
        return { ...base, situacao: item.preco === 0 ? 'seu' : 'a-venda', selo: null, ...semBotao };
      }
      if (itensDaAparencia(balao.aparencia).includes(id)) return { ...base, situacao: 'equipado', selo: 'Equipado', ...semBotao };
      if (item.preco === 0 || balao.itens.includes(id)) return { ...base, situacao: 'seu', selo: 'Seu', ...semBotao };
      const faltam = Math.max(item.preco - carteira.saldo, 0);
      return { ...base, situacao: 'a-venda', selo: null, acao: 'comprar', podeAgir: faltam === 0, faltam, textoFaltam: faltam > 0 ? `Faltam ${textoDeMoedas(faltam)}` : null };
    }),
  }));
  return { disponivel: carteira !== null && balao !== undefined, categorias };
}

// ---------------------------------------------------------------- o editor "Meu balão"

export type SituacaoDaOpcao = 'livre' | 'seu' | 'bloqueado';

/** Uma opção do editor: `id` `null` é o "Nenhum" do chapéu e do bigode. */
export interface OpcaoDoEditor {
  readonly id: IdItemDoBalao | null;
  readonly nome: string;
  readonly icone: string | null;
  readonly preco: number;
  /** "Grátis", "150 moedas"; `null` no "Nenhum". */
  readonly textoDoPreco: string | null;
  /** `livre`: grátis, todo mundo tem; `seu`: comprado; `bloqueado`: falta comprar (mostra o preço e leva à loja). */
  readonly situacao: SituacaoDaOpcao;
  readonly selecionada: boolean;
}

export interface CategoriaNoEditor {
  readonly id: CategoriaDoBalao;
  readonly titulo: string;
  readonly opcoes: readonly OpcaoDoEditor[];
}

export interface EditorDoBalao {
  /** A carteira foi lida e a sala mandou o balão. */
  readonly disponivel: boolean;
  readonly categorias: readonly CategoriaNoEditor[];
  /** O rascunho é diferente do balão que a carteira já usa. */
  readonly mudou: boolean;
  /** Dá para equipar: mudou, e tudo o que o rascunho usa é grátis ou da carteira. */
  readonly podeEquipar: boolean;
  /** O que o rascunho usa e a carteira não tem (nunca equipa). */
  readonly bloqueados: readonly IdItemDoBalao[];
}

/** O editor a partir da carteira (o que se tem) e do rascunho (o que a prévia mostra). */
export function editorDoBalao(carteira: EstadoCarteira | null, rascunho: AparenciaDoBalao): EditorDoBalao {
  const balao = carteira?.balao;
  const itens: readonly IdItemDoBalao[] = balao?.itens ?? [];
  const tem = (id: IdItemDoBalao): boolean => itemDoBalao(id).preco === 0 || itens.includes(id);
  const categorias = CATEGORIAS_DO_BALAO.map((c): CategoriaNoEditor => {
    const escolhido = itemDaAparencia(rascunho, c.id);
    const opcoes: OpcaoDoEditor[] = c.ids.map((id) => {
      const item = itemDoBalao(id);
      const situacao: SituacaoDaOpcao = item.preco === 0 ? 'livre' : tem(id) && balao !== undefined ? 'seu' : 'bloqueado';
      return { id, nome: item.nome, icone: iconeDoItem(id), preco: item.preco, textoDoPreco: textoDoPreco(item.preco), situacao, selecionada: escolhido === id };
    });
    if (c.opcional) opcoes.unshift({ id: null, nome: 'Nenhum', icone: null, preco: 0, textoDoPreco: null, situacao: 'livre', selecionada: escolhido === null });
    return { id: c.id, titulo: c.titulo, opcoes };
  });
  const disponivel = carteira !== null && balao !== undefined;
  const mudou = balao !== undefined && !aparenciaIgual(rascunho, balao.aparencia);
  const bloqueados = itensDaAparencia(rascunho).filter((id) => !tem(id));
  return { disponivel, categorias, mudou, podeEquipar: disponivel && mudou && aparenciaCabeNosItens(rascunho, itens), bloqueados };
}

/**
 * Escolhe `id` na categoria do rascunho. Devolve um rascunho novo; se a escolha não vale (o item não é da categoria, não é do
 * catálogo, a carteira não o tem, ou `null` onde não pode) devolve **o mesmo rascunho**: só o que a carteira tem se equipa, e o que
 * falta tem de ser comprado antes.
 */
export function escolherNoRascunho(rascunho: AparenciaDoBalao, categoria: CategoriaDoBalao, id: string | null, itens: readonly IdItemDoBalao[]): AparenciaDoBalao {
  const def = definicao(categoria);
  if (id === null) return def.opcional ? { ...rascunho, [def.campo]: null } : rascunho;
  const doCatalogo = ITENS_DO_BALAO.find((i) => i.id === id);
  if (doCatalogo === undefined || doCatalogo.tipo !== categoria) return rascunho;
  if (doCatalogo.preco !== 0 && !itens.includes(doCatalogo.id)) return rascunho;
  return { ...rascunho, [def.campo]: doCatalogo.id };
}
