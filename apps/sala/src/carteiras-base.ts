/**
 * As carteiras (L22): saldo, tacos e a skin em uso. Desde o L34 cada skin que a carteira tem é um item (`ItemTaco`): a skin, a semente
 * que o servidor sorteou na compra (aleatoriedade criptográfica, nunca o cliente) e o contador de bolas matadas com ele.
 *
 * Este é o NÚCLEO (L41): as regras de saldo, loja, aposta, missões e estatísticas, na memória, sem disco nem relógio de verdade.
 * Quem guarda é uma subclasse: `ArmazemDeCarteiras` (carteiras.ts, o arquivo `carteiras.json` da sala Node) ou `CarteirasNoDO`
 * (carteiras-sqlite.ts, o armazenamento SQLite do Durable Object). A subclasse implementa `persistir()`, que o núcleo chama de
 * forma síncrona a cada mudança, e pode marcar `rastreiaSujas` para receber em `sujas` os ids que mudaram.
 *
 * O código secreto que o navegador guarda só existe aqui por um instante: o armazém o troca por um resumo SHA-256 (o `id`),
 * e é o `id` que as salas, o arquivo e os testes manipulam. Achar uma carteira é achar o resumo num `Map`, então não há
 * comparação de texto cujo tempo conte quantos caracteres do código batem, e quem ler o disco não ganha a carteira de
 * ninguém. Nada aqui chega ao log com o código nem com o `id`.
 *
 * Tudo é síncrono e atômico dentro do processo (um único thread): a checagem de saldo e o desconto de uma compra não têm
 * `await` no meio, então duas compras ao mesmo tempo nunca gastam o mesmo dinheiro duas vezes.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  APARENCIA_PADRAO,
  CHAVES_DA_CONTAGEM,
  IDS_DAS_CORES_DE_OLHO,
  IDS_DOS_BIGODES,
  IDS_DOS_CHAPEUS,
  IDS_DOS_ESTILOS_DE_OLHO,
  ITENS_GRATIS_DO_BALAO,
  CONTAGEM_ZERADA,
  MODALIDADES_DE_SALA,
  SALDO_INICIAL,
  SEMENTES_POR_ITEM,
  SKINS_DE_TACO,
  SKIN_PADRAO,
  diaDaMissao,
  ehCodigoDeCarteira,
  ehDiaDaMissao,
  ehIdDeMissao,
  ehIdDeItemDoBalao,
  ehSemente,
  ehSkinDeTaco,
  estatisticasDeModalidades,
  fimDoDia,
  missaoDoCatalogo,
  missoesDoDia,
  ordemDaSkin,
  ordemDoItemDoBalao,
  padraoDaSemente,
  aparenciaCabeNosItens,
  aparenciaIgual,
  itemDoBalao,
  precoDaSkin,
  precoDaSkinNoDia,
  precoDoItemDoBalao,
  premioDaMissao,
  somarContagens,
  validarAparenciaDoBalao,
  vitrineDoDia,
  type AparenciaDoBalao,
  type ContagemDeEstatisticas,
  type EstadoCarteira,
  type IdItemDoBalao,
  type IdMissao,
  type MissoesDoDia,
  type SkinTaco,
} from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import type { PresenteDeTeste } from './config-nucleo';
import type { ValoresDasMissoes } from './missoes';
import type { Logger } from './log';

/** 2 (L34): a carteira guarda `itens` (skin, semente e bolas) no lugar de `skins`. O 1 ainda abre: cada skin vira um item com semente sorteada. */
export const VERSAO_DO_ARQUIVO = 2;
export const VERSOES_QUE_ABREM = [1, 2];
/** O formato do arquivo à parte do balão da sala Node (`carteiras-balao.json`): `{ versao, baloes: { <id>: { itens, aparencia } } }`. */
export const VERSAO_DO_ARQUIVO_DO_BALAO = 1;
export const ID_VALIDO = /^[0-9a-f]{64}$/;
const TENTATIVAS_DE_CODIGO = 8;

/** O que o núcleo precisa para existir; quem guarda acrescenta o seu (pasta, tabela). */
export interface OpcoesDasCarteiras {
  readonly maxCarteiras: number;
  readonly relogio: () => number;
  readonly log: Logger;
  /** Sorteia o código; os testes injetam o seu. Padrão: 32 bytes aleatórios do sistema em base64url. */
  readonly gerarCodigo?: () => string;
  /** Sorteia a semente de um taco (inteiro de 0 a 999); os testes injetam a sua. Padrão: `crypto.randomInt`, aleatoriedade criptográfica. */
  readonly sortearSemente?: () => number;
  /** O presente de teste (L34c): cada carteira ganha o valor uma vez por rótulo, na primeira vez que aparece. Ausente ou `null` = desligado. */
  readonly presenteDeTeste?: PresenteDeTeste | null;
}

export interface ProgressoDasMissoes {
  dia: string;
  progresso: Partial<Record<IdMissao, number>>;
}

/** Um taco guardado (o `ItemTaco` do protocolo, que a leitura entrega só de leitura). */
export interface ItemGuardado {
  skin: SkinTaco;
  semente: number;
  bolas: number;
}

export interface Guardada {
  saldo: number;
  /** Um por skin, na ordem da loja; sempre tem o da `SKIN_PADRAO`. */
  itens: ItemGuardado[];
  skin: SkinTaco;
  readonly criadaEm: number;
  /** Já esteve num lugar de partida ou levou/pagou uma aposta: nunca mais é reaproveitada no teto. */
  jogou: boolean;
  /** Ausente no arquivo de antes do L31 (e para quem nunca andou numa missão): zero em tudo. */
  missoes?: ProgressoDasMissoes;
  /** Os presentes de teste (L34c) que a carteira já recebeu: rótulo → moedas. Ausente no arquivo de antes e para quem nunca ganhou um. */
  presentes?: Record<string, number>;
  /**
   * As estatísticas (L38): uma contagem por modalidade em que a carteira já jogou uma partida que contou. O total NÃO é guardado:
   * sai da soma delas na leitura, então os dois nunca divergem. Ausente no arquivo de antes e para quem nunca jogou uma.
   */
  estatisticas?: Partial<Record<Modalidade, ContagemDeEstatisticas>>;
  /**
   * O balão (L47): os itens PAGOS que a carteira comprou (os grátis todo mundo tem e não são guardados) e a aparência em uso. Ausente
   * enquanto a carteira não comprou nada e usa o padrão. Vale só na memória: NUNCA vai na linha da carteira (o `carteiras.json`, a linha
   * do SQLite). A versão anterior da sala só aceita uma lista fechada de chaves e DESCARTA a carteira que traz uma a mais, então o balão
   * é gravado à parte (`carteiras-balao.json` na sala Node, tabela `carteiras_balao` no Durable Object) e quem volta para a versão
   * anterior lê a linha de sempre e ignora o resto (L47b). `linhaDaCarteira` é a linha sem ele.
   */
  balao?: BalaoGuardado;
}

/** O balão de uma carteira como é guardado. `itens` só tem itens pagos, sem repetir, na ordem da loja. */
export interface BalaoGuardado {
  itens: IdItemDoBalao[];
  aparencia: AparenciaDoBalao;
}

/** Uma carteira que o armazenamento não conseguiu ler e guardou de lado (`carteiras_descartadas` no Durable Object); `dados` é o texto como estava. */
export interface CarteiraDescartada {
  readonly id: string;
  readonly dados: string;
  readonly motivo: string;
  readonly em: number;
}

/** O que uma partida que contou soma à carteira `id`, na modalidade dela (a contagem da partida: tudo soma, menos a `sequencia`, que fica com a maior). */
export interface EstatisticaDaPartida {
  readonly id: string;
  readonly modalidade: Modalidade;
  readonly contagem: ContagemDeEstatisticas;
}

/** O que `registrarMissoes` fez numa carteira que andou: o quadro de agora e as missões que fecharam (e pagaram) nesta chamada. */
export interface ResultadoDeMissoes {
  readonly missoes: MissoesDoDia;
  readonly cumpridas: readonly IdMissao[];
}

/** `encerrado`: o armazém já fechou (o servidor está saindo) e não aceita mais mudança. */
export type ErroDeLoja =
  | 'carteira-invalida'
  | 'skin-invalida'
  | 'item-invalido'
  | 'aparencia-invalida'
  | 'ja-tem'
  | 'preco-mudou'
  | 'saldo-insuficiente'
  | 'nao-tem'
  | 'encerrado';
export type ResultadoDeLoja = { readonly ok: true; readonly estado: EstadoCarteira } | { readonly ok: false; readonly erro: ErroDeLoja };

export interface Variacao {
  readonly id: string;
  readonly delta: number;
}

/** Quem quer saber que uma carteira mudou; `origem` é o que quem mudou passou (para não avisar a si mesmo). */
export type OuvinteDeCarteira = (id: string, origem?: unknown) => void;

const resumo = (codigo: string): string => createHash('sha256').update(codigo).digest('hex');

const codigoAleatorio = (): string => randomBytes(32).toString('base64url');

/** Semente de 0 a 999, uniforme, da fonte aleatória criptográfica do sistema. */
const sementeAleatoria = (): number => randomInt(SEMENTES_POR_ITEM);

const CHAVES_DA_CARTEIRA = ['saldo', 'skins', 'itens', 'skin', 'criadaEm', 'jogou', 'missoes', 'presentes', 'estatisticas', 'balao'];
const ROTULO_DO_PRESENTE = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const MAX_PRESENTES_POR_CARTEIRA = 100;
const CHAVES_DO_ITEM = ['skin', 'semente', 'bolas'];

const emOrdemDaLoja = (itens: ItemGuardado[]): ItemGuardado[] => itens.sort((a, b) => ordemDaSkin(a.skin) - ordemDaSkin(b.skin));

/**
 * O progresso guardado das missões, ou `undefined` se não presta. Diferente do saldo, aqui o que não presta não derruba a
 * carteira: é um dado do dia, sem dinheiro, e perdê-lo custa no máximo recomeçar as missões de hoje. Missão que saiu do
 * catálogo é descartada e o que passa da meta volta a ela.
 */
function missoesValidas(valor: unknown): ProgressoDasMissoes | undefined {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return undefined;
  const { dia, progresso } = valor as Record<string, unknown>;
  if (!ehDiaDaMissao(dia) || typeof progresso !== 'object' || progresso === null || Array.isArray(progresso)) return undefined;
  const lido: Partial<Record<IdMissao, number>> = {};
  for (const [id, n] of Object.entries(progresso)) {
    if (!ehIdDeMissao(id) || !Number.isSafeInteger(n) || (n as number) < 0) continue;
    lido[id] = Math.min(n as number, missaoDoCatalogo(id).meta);
  }
  return { dia, progresso: lido };
}

/**
 * Os presentes guardados (L34c), ou `undefined` se não há nenhum que preste. Como o progresso das missões, o que não presta não
 * derruba a carteira: a entrada torta é descartada (o pior caso é um presente de teste pago de novo).
 */
function presentesValidos(valor: unknown): Record<string, number> | undefined {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return undefined;
  const lidos: Record<string, number> = {};
  for (const [rotulo, moedas] of Object.entries(valor).slice(0, MAX_PRESENTES_POR_CARTEIRA)) {
    if (ROTULO_DO_PRESENTE.test(rotulo) && Number.isSafeInteger(moedas) && (moedas as number) > 0) lidos[rotulo] = moedas as number;
  }
  return Object.keys(lidos).length > 0 ? lidos : undefined;
}

/** Os 7 números são inteiros seguros de 0 em diante e ninguém vence mais partidas do que jogou. */
const contagemValida = (c: ContagemDeEstatisticas): boolean =>
  CHAVES_DA_CONTAGEM.every((chave) => Number.isSafeInteger(c[chave]) && c[chave] >= 0) && c.vitorias <= c.partidas;

/**
 * As estatísticas guardadas (L38), ou `undefined` se não há nenhuma que preste. Como o progresso das missões, o que não presta não
 * derruba a carteira (não é dinheiro): a modalidade desconhecida ou com a contagem torta é descartada, e as outras ficam.
 */
function estatisticasValidas(valor: unknown): Partial<Record<Modalidade, ContagemDeEstatisticas>> | undefined {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return undefined;
  const lidas: Partial<Record<Modalidade, ContagemDeEstatisticas>> = {};
  for (const modalidade of MODALIDADES_DE_SALA) {
    if (!Object.hasOwn(valor, modalidade)) continue;
    const bruta = (valor as Record<string, unknown>)[modalidade];
    if (typeof bruta !== 'object' || bruta === null || Array.isArray(bruta)) continue;
    const b = bruta as Record<string, unknown>;
    if (!CHAVES_DA_CONTAGEM.every((chave) => Object.hasOwn(b, chave) && typeof b[chave] === 'number')) continue;
    const contagem = Object.fromEntries(CHAVES_DA_CONTAGEM.map((chave) => [chave, b[chave]])) as unknown as ContagemDeEstatisticas;
    if (contagemValida(contagem)) lidas[modalidade] = contagem;
  }
  return Object.keys(lidas).length > 0 ? lidas : undefined;
}

/** Os itens pagos em ordem da loja, sem repetir. */
const itensPagosEmOrdem = (ids: Iterable<IdItemDoBalao>): IdItemDoBalao[] => [...new Set(ids)].sort((a, b) => ordemDoItemDoBalao(a) - ordemDoItemDoBalao(b));

/**
 * O balão guardado (L47), ou `undefined` se não há nada além do padrão. Como o progresso das missões, o que não presta não derruba a
 * carteira: o item que saiu do catálogo, repetido ou grátis é ignorado, e o campo da aparência que não vale, ou que usa o que a
 * carteira não tem, volta ao padrão (só ele). Quem lê o arquivo de antes não passa por aqui (a chave não existe).
 */
function balaoValido(valor: unknown): BalaoGuardado | undefined {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return undefined;
  const bruto = valor as Record<string, unknown>;
  const itens = itensPagosEmOrdem(Array.isArray(bruto.itens) ? bruto.itens.filter((i): i is IdItemDoBalao => ehIdDeItemDoBalao(i) && precoDoItemDoBalao(i) > 0) : []);
  const a = typeof bruto.aparencia === 'object' && bruto.aparencia !== null && !Array.isArray(bruto.aparencia) ? (bruto.aparencia as Record<string, unknown>) : {};
  const tem = (id: IdItemDoBalao): boolean => precoDoItemDoBalao(id) === 0 || itens.includes(id);
  const campo = <T extends IdItemDoBalao>(valido: readonly T[], v: unknown): T | undefined => (valido.includes(v as T) && tem(v as T) ? (v as T) : undefined);
  const aparencia: AparenciaDoBalao = {
    chapeu: campo(IDS_DOS_CHAPEUS, a.chapeu) ?? null,
    bigode: campo(IDS_DOS_BIGODES, a.bigode) ?? null,
    olhos: campo(IDS_DOS_ESTILOS_DE_OLHO, a.olhos) ?? APARENCIA_PADRAO.olhos,
    corDosOlhos: campo(IDS_DAS_CORES_DE_OLHO, a.corDosOlhos) ?? APARENCIA_PADRAO.corDosOlhos,
  };
  return itens.length === 0 && aparenciaIgual(aparencia, APARENCIA_PADRAO) ? undefined : { itens, aparencia };
}

export const objetoSimples = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A carteira como a versão anterior a lê (L47b): tudo menos o balão, que é gravado à parte. É isto que vai à linha do SQLite e ao `carteiras.json`. */
export function linhaDaCarteira(c: Guardada): Omit<Guardada, 'balao'> {
  return Object.fromEntries(Object.entries(c).filter(([chave]) => chave !== 'balao')) as Omit<Guardada, 'balao'>;
}

/**
 * Põe em cada carteira de `carteiras` o balão guardado à parte (L47b) para o `id` dela; o que o balão guardado diz manda sobre o que a
 * carteira trazia. Id sem carteira é ignorado (o balão de quem saiu não volta). Balão que não presta vira o padrão, sem derrubar nada.
 */
export function aplicarBaloes(guardados: Iterable<readonly [string, unknown]>, carteiras: Map<string, Guardada>): void {
  for (const [id, bruto] of guardados) {
    const c = carteiras.get(id);
    if (!c) continue;
    const balao = balaoValido(bruto);
    if (balao) c.balao = balao;
    else delete c.balao;
  }
}

/** O que a carteira já ganhou de presente de teste, somado. */
const totalDePresentes = (c: Guardada): number => Object.values(c.presentes ?? {}).reduce((soma, moedas) => soma + moedas, 0);

/** Os itens guardados no formato do L34, ou `null` se não prestam (skin fora do catálogo ou repetida, semente fora de 0 a 999, contador torto). */
function itensValidos(valor: unknown): ItemGuardado[] | null {
  if (!Array.isArray(valor) || valor.length < 1 || valor.length > SKINS_DE_TACO.length) return null;
  const lidos: ItemGuardado[] = [];
  for (const bruto of valor) {
    if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null;
    const i = bruto as Record<string, unknown>;
    if (!Object.keys(i).every((k) => CHAVES_DO_ITEM.includes(k)) || !CHAVES_DO_ITEM.every((k) => k in i)) return null;
    if (!ehSkinDeTaco(i.skin) || !ehSemente(i.semente) || !Number.isSafeInteger(i.bolas) || (i.bolas as number) < 0) return null;
    lidos.push({ skin: i.skin, semente: i.semente, bolas: i.bolas as number });
  }
  return new Set(lidos.map((i) => i.skin)).size === lidos.length ? emOrdemDaLoja(lidos) : null;
}

/**
 * Uma carteira do arquivo, ou `null` se não presta. Dois formatos: o do L34 (`itens`) e o de antes (`skins`), que vira itens
 * sorteando uma semente por skin com `sortear` e contador 0 (`migrada` diz que isso aconteceu, para o armazém regravar logo: a
 * semente é sorteada uma vez só).
 */
export function guardadaValida(valor: unknown, sortear: () => number): { carteira: Guardada; migrada: boolean } | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  // `jogou` veio no L25, `missoes` no L31 e `itens` no L34: o arquivo de antes vale como carteira já usada, sem missões e com skins, porque não há como saber o contrário
  if (!Object.keys(v).every((k) => CHAVES_DA_CARTEIRA.includes(k))) return null;
  for (const k of ['saldo', 'skin', 'criadaEm']) if (!(k in v)) return null;
  if ('skins' in v === 'itens' in v) return null; // exatamente um dos dois
  const { saldo, skin, criadaEm } = v;
  const jogou = 'jogou' in v ? v.jogou : true;
  if (typeof jogou !== 'boolean') return null;
  if (!Number.isSafeInteger(saldo) || typeof criadaEm !== 'number' || !Number.isFinite(criadaEm)) return null;
  let itens: ItemGuardado[] | null;
  let migrada = false;
  if ('itens' in v) itens = itensValidos(v.itens);
  else {
    const { skins } = v;
    if (!Array.isArray(skins) || skins.length < 1 || !skins.every(ehSkinDeTaco) || new Set(skins).size !== skins.length) return null;
    itens = emOrdemDaLoja(skins.map((skin): ItemGuardado => ({ skin, semente: sortear(), bolas: 0 })));
    migrada = true;
  }
  if (itens === null || !itens.some((i) => i.skin === SKIN_PADRAO) || !ehSkinDeTaco(skin) || !itens.some((i) => i.skin === skin)) return null;
  const missoes = 'missoes' in v ? missoesValidas(v.missoes) : undefined;
  const presentes = 'presentes' in v ? presentesValidos(v.presentes) : undefined;
  const estatisticas = 'estatisticas' in v ? estatisticasValidas(v.estatisticas) : undefined;
  const balao = 'balao' in v ? balaoValido(v.balao) : undefined; // `balao` veio no L47: o arquivo de antes não tem a chave e abre com o padrão
  return {
    carteira: {
      saldo: saldo as number,
      itens,
      skin,
      criadaEm,
      jogou,
      ...(missoes ? { missoes } : {}),
      ...(presentes ? { presentes } : {}),
      ...(estatisticas ? { estatisticas } : {}),
      ...(balao ? { balao } : {}),
    },
    migrada,
  };
}
export abstract class CarteirasBase {
  protected readonly carteiras = new Map<string, Guardada>();
  private readonly ouvintes = new Set<OuvinteDeCarteira>();
  /** Ids que mudaram (ou saíram) desde a última `persistir()` bem-sucedida; só vale com `rastreiaSujas`. */
  protected sujas = new Set<string>();
  /** A subclasse que quer saber QUAIS carteiras mudaram (o SQLite grava só elas) liga isto; o arquivo grava tudo e dispensa. */
  protected rastreiaSujas = false;
  /** De quem é uma carteira que está sentada numa sala, só para o log da compra; o `Registro` o preenche. */
  private apelidoDe: (id: string) => string | null = () => null;

  constructor(protected readonly opcoes: OpcoesDasCarteiras) {}

  /** Chamada, de forma síncrona, a cada mudança: a subclasse leva a memória ao armazenamento (ou agenda isso). Falhar aqui não derruba a mudança. */
  protected abstract persistir(): void;

  /** `true` desde o começo do fechamento: nenhuma mudança entra mais. O núcleo nunca fecha; quem fecha (o arquivo) sobrescreve. */
  get encerrado(): boolean {
    return false;
  }

  get total(): number {
    return this.carteiras.size;
  }

  protected marcar(id: string): void {
    if (this.rastreiaSujas) this.sujas.add(id);
  }

  // ---------------------------------------------------------------- achar e criar

  /**
   * Cria uma carteira nova. No teto de carteiras ela toma o lugar da nunca usada mais velha (saldo inicial, só o clássico,
   * nunca num lugar de partida); sem nenhuma assim, `null`. O código sai daqui uma única vez.
   */
  criar(): { readonly codigo: string; readonly id: string } | null {
    if (this.recusaPorEncerrado()) return null;
    if (this.carteiras.size >= this.opcoes.maxCarteiras && !this.reaproveitarUma()) {
      this.opcoes.log('carteiras-cheio', { maximo: this.opcoes.maxCarteiras });
      return null;
    }
    const gerar = this.opcoes.gerarCodigo ?? codigoAleatorio;
    for (let tentativa = 0; tentativa < TENTATIVAS_DE_CODIGO; tentativa++) {
      const codigo = gerar();
      const id = resumo(codigo);
      if (this.carteiras.has(id)) continue;
      this.carteiras.set(id, {
        saldo: SALDO_INICIAL,
        itens: [{ skin: SKIN_PADRAO, semente: this.novaSemente(), bolas: 0 }],
        skin: SKIN_PADRAO,
        criadaEm: this.opcoes.relogio(),
        jogou: false,
      });
      this.opcoes.log('carteira-criada', { carteiras: this.carteiras.size });
      this.marcar(id);
      this.mudou();
      this.presentear(id);
      return { codigo, id };
    }
    this.opcoes.log('carteiras-codigo-repetido');
    return null;
  }

  /** Tira a carteira nunca usada mais velha para dar lugar a uma nova; `false` se todas estão em uso. */
  private reaproveitarUma(): boolean {
    let velha: [string, Guardada] | null = null;
    for (const par of this.carteiras) {
      const c = par[1];
      const nunca = !c.jogou && c.saldo === SALDO_INICIAL + totalDePresentes(c) && c.itens.length === 1 && c.skin === SKIN_PADRAO && c.balao === undefined; // o presente de teste não é uso; item de balão comprado é
      if (nunca && (velha === null || c.criadaEm < velha[1].criadaEm)) velha = par;
    }
    if (velha === null) return false;
    this.carteiras.delete(velha[0]);
    this.marcar(velha[0]);
    this.opcoes.log('carteira-reaproveitada', { carteiras: this.carteiras.size });
    return true;
  }

  /**
   * Estas carteiras estão num lugar de uma partida que começou: deixam de ser "nunca usadas". Não é uma mudança que alguém
   * veja (nenhum ouvinte é avisado), só vai ao disco. Id que não existe é ignorado.
   */
  registrarPartida(ids: readonly string[]): void {
    if (this.recusaPorEncerrado()) return;
    let mudou = false;
    for (const id of ids) {
      const c = this.carteiras.get(id);
      if (c && !c.jogou) {
        c.jogou = true;
        mudou = true;
        this.marcar(id);
      }
    }
    if (mudou) this.mudou();
  }

  /**
   * O `id` da carteira deste código, ou `undefined` se a forma está errada ou ela não existe. Quem aparece com o código (o HTTP da
   * carteira e a entrada numa sala) passa por aqui, então é aqui que a carteira que existe recebe o presente de teste (L34c), se
   * ele está ligado e ela ainda não o recebeu.
   */
  resolver(codigo: unknown): string | undefined {
    if (!ehCodigoDeCarteira(codigo)) return undefined;
    const id = resumo(codigo);
    if (!this.carteiras.has(id)) return undefined;
    this.presentear(id);
    return id;
  }

  /**
   * O presente de teste (L34c): soma o valor ao saldo e marca o rótulo na carteira, juntos e sem `await` no meio (tudo ou nada: ou
   * as duas coisas, ou nenhuma). Uma vez por rótulo, nunca duas, venha de onde vier (duas abas, duas salas); rótulo novo paga de
   * novo. Desligado, ou com o armazém fechando, não faz nada. O log diz o valor e o rótulo, nunca o código nem o `id`.
   */
  private presentear(id: string): void {
    const presente = this.opcoes.presenteDeTeste;
    if (!presente || this.encerrado) return;
    const c = this.carteiras.get(id);
    if (!c || (c.presentes !== undefined && Object.hasOwn(c.presentes, presente.rotulo))) return;
    if (!Number.isSafeInteger(c.saldo + presente.valor)) return;
    c.saldo += presente.valor;
    c.presentes = { ...c.presentes, [presente.rotulo]: presente.valor };
    this.opcoes.log('presente', { apelido: this.apelidoDe(id), valor: presente.valor, rotulo: presente.rotulo });
    this.marcar(id);
    this.mudou(id);
  }

  /**
   * O que a carteira tem agora (uma cópia), com a vitrine e as missões do dia de agora, ou `undefined` se o `id` não existe. As
   * `skins` são as dos itens, na ordem da loja.
   */
  ler(id: string): EstadoCarteira | undefined {
    const c = this.carteiras.get(id);
    if (!c) return undefined;
    const dia = diaDaMissao(this.opcoes.relogio());
    return {
      saldo: c.saldo,
      skins: c.itens.map((i) => i.skin),
      skin: c.skin,
      itens: c.itens.map((i) => ({ ...i })),
      vitrine: vitrineDoDia(dia),
      missoes: this.quadroDeMissoes(c, dia),
      estatisticas: estatisticasDeModalidades(Object.fromEntries(Object.entries(c.estatisticas ?? {}).map(([m, n]) => [m, { ...n }]))),
      balao: {
        aparencia: { ...(c.balao?.aparencia ?? APARENCIA_PADRAO) },
        itens: itensPagosEmOrdem([...ITENS_GRATIS_DO_BALAO, ...(c.balao?.itens ?? [])]),
      },
    };
  }

  /** A semente de um taco novo (de 0 a 999). Lança se quem sorteia (injetado nos testes) devolver outra coisa: nunca guarda semente torta. */
  private novaSemente(): number {
    const semente = (this.opcoes.sortearSemente ?? sementeAleatoria)();
    if (!ehSemente(semente)) throw new RangeError(`semente fora de 0 a ${SEMENTES_POR_ITEM - 1}: ${semente}`);
    return semente;
  }

  /** O `Registro` diz de quem é cada carteira sentada numa sala; o log da compra mostra o apelido (`null` se ela não está em sala nenhuma). */
  usarApelidos(apelidoDe: (id: string) => string | null): void {
    this.apelidoDe = apelidoDe;
  }

  /** As 3 missões de hoje com o que esta carteira já andou nelas; o progresso de outro dia não conta. */
  private quadroDeMissoes(c: Guardada, dia: string): MissoesDoDia {
    const andado = c.missoes?.dia === dia ? c.missoes.progresso : {};
    return {
      dia,
      fimMs: fimDoDia(dia),
      itens: missoesDoDia(dia).map((m) => {
        const progresso = Math.min(andado[m.id] ?? 0, m.meta);
        return { id: m.id, progresso, meta: m.meta, cumprida: progresso >= m.meta };
      }),
    };
  }

  // ---------------------------------------------------------------- mexer

  /**
   * Compra uma skin: só com saldo para o preço inteiro (o saldo nunca fica abaixo de zero por uma compra). O preço é o que o
   * servidor calcula para o dia, com o desconto da vitrine (o cliente nunca manda preço), e a semente do taco novo é sorteada
   * aqui, com aleatoriedade criptográfica. Comprar de novo uma skin que já se tem é `ja-tem` (não há "rolar" outra semente).
   * Não a coloca em uso.
   *
   * `precoVisto` (L34b) é o preço que a tela mostrou, só como TETO: se o preço do servidor agora for maior (a vitrine virou o dia),
   * recusa com `preco-mudou` sem cobrar nem sortear; igual ou menor, cobra o do servidor, nunca o do cliente. Vem depois de `ja-tem`
   * e antes de `saldo-insuficiente` (o que o cliente precisa ver primeiro é o preço novo). Valor que não é número também recusa.
   */
  comprar(id: string, skin: string, origem?: unknown, precoVisto?: number): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    if (!ehSkinDeTaco(skin)) return { ok: false, erro: 'skin-invalida' };
    if (c.itens.some((i) => i.skin === skin)) return { ok: false, erro: 'ja-tem' };
    const preco = precoDaSkinNoDia(skin, diaDaMissao(this.opcoes.relogio()));
    if (precoVisto !== undefined && !(preco <= precoVisto)) return { ok: false, erro: 'preco-mudou' };
    if (c.saldo < preco) return { ok: false, erro: 'saldo-insuficiente' };
    const semente = this.novaSemente(); // antes de mexer em qualquer coisa
    c.saldo -= preco;
    c.itens.push({ skin, semente, bolas: 0 });
    emOrdemDaLoja(c.itens);
    const padrao = padraoDaSemente(skin, semente);
    this.opcoes.log('compra', {
      apelido: this.apelidoDe(id),
      skin,
      preco,
      vitrine: preco !== precoDaSkin(skin),
      semente,
      rara: padrao?.rara === true,
      ...(padrao ? { padrao: padrao.nome } : {}),
    });
    this.marcar(id);
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /** Põe em uso uma skin que a carteira tem. */
  usar(id: string, skin: string, origem?: unknown): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    if (!ehSkinDeTaco(skin)) return { ok: false, erro: 'skin-invalida' };
    if (!c.itens.some((i) => i.skin === skin)) return { ok: false, erro: 'nao-tem' };
    c.skin = skin;
    this.marcar(id);
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /**
   * Compra um item do balão (L47): só com saldo para o preço inteiro, que é o do catálogo (fixo, sem vitrine; o cliente nunca manda o
   * preço que vale). Tudo ou nada e síncrono, como `comprar`: o saldo, a posse e o gasto mudam juntos ou nenhum muda, e duas compras
   * ao mesmo tempo nunca gastam o mesmo dinheiro duas vezes. O item grátis e o que a carteira já tem são `ja-tem` (não cobra de novo).
   * Não o põe em uso: para isso, `equiparAparencia`. `precoVisto` é só um teto, como em `comprar`: o preço da sala maior recusa com
   * `preco-mudou`, sem cobrar.
   */
  comprarItemDoBalao(id: string, item: string, origem?: unknown, precoVisto?: number): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    if (!ehIdDeItemDoBalao(item)) return { ok: false, erro: 'item-invalido' };
    const preco = precoDoItemDoBalao(item);
    if (preco === 0 || c.balao?.itens.includes(item)) return { ok: false, erro: 'ja-tem' };
    if (precoVisto !== undefined && !(preco <= precoVisto)) return { ok: false, erro: 'preco-mudou' };
    if (c.saldo < preco) return { ok: false, erro: 'saldo-insuficiente' };
    c.saldo -= preco;
    c.balao = { itens: itensPagosEmOrdem([...(c.balao?.itens ?? []), item]), aparencia: c.balao?.aparencia ?? { ...APARENCIA_PADRAO } };
    this.opcoes.log('compra-balao', { apelido: this.apelidoDe(id), item, tipo: itemDoBalao(item).tipo, preco });
    this.marcar(id);
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /**
   * Põe em uso uma aparência do balão (L47): a aparência INTEIRA, de uma vez. Tudo ou nada: se algum campo não vale (id que não
   * existe, de outro tipo, campo faltando ou a mais) é `aparencia-invalida`, e se algum item pago não é da carteira é `nao-tem`; em
   * ambos nada muda, nem os campos que valiam. Os itens grátis todo mundo equipa. Pedir a aparência que já está em uso é `ok` e não
   * grava nem avisa ninguém. A aparência é sempre a desta carteira: não há como equipar a de outra.
   */
  equiparAparencia(id: string, aparencia: unknown, origem?: unknown): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    const valida = validarAparenciaDoBalao(aparencia);
    if (!valida.ok) return { ok: false, erro: 'aparencia-invalida' };
    const nova = valida.valor;
    if (!aparenciaCabeNosItens(nova, c.balao?.itens ?? [])) return { ok: false, erro: 'nao-tem' };
    if (aparenciaIgual(nova, c.balao?.aparencia ?? APARENCIA_PADRAO)) return { ok: true, estado: this.ler(id)! };
    c.balao = { itens: c.balao?.itens ?? [], aparencia: { ...nova } };
    this.opcoes.log('equipou-balao', { apelido: this.apelidoDe(id), chapeu: nova.chapeu, bigode: nova.bigode, olhos: nova.olhos, cor: nova.corDosOlhos });
    this.marcar(id);
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /**
   * Soma as variações aos saldos, que podem ficar negativos sem limite. Tudo ou nada: se uma só está errada — carteira que
   * não existe, o mesmo `id` duas vezes, delta que não é inteiro ou que tiraria o saldo do que um número conta sem perder
   * unidade — nenhuma é aplicada e devolve `false`. `true` = todas foram aplicadas.
   *
   * `partida` (L38) são as estatísticas da partida que contou: entram na MESMA mudança e na mesma gravação do saldo, então ou o
   * dinheiro e as estatísticas chegam juntos, ou nenhum dos dois (a contagem de uma carteira que não existe, repetida, torta ou que
   * estouraria um inteiro recusa tudo, as variações inclusive). Pode vir sem variações (partida que contou mas não moveu dinheiro).
   */
  aplicar(variacoes: readonly Variacao[], origem?: unknown, partida: readonly EstatisticaDaPartida[] = []): boolean {
    if (this.recusaPorEncerrado()) return false;
    const alvos: { carteira: Guardada; id: string; delta: number }[] = [];
    const vistos = new Set<string>();
    for (const { id, delta } of variacoes) {
      const carteira = this.carteiras.get(id);
      if (!carteira || vistos.has(id)) {
        this.opcoes.log('carteiras-variacao-recusada', { motivo: carteira ? 'carteira-repetida' : 'carteira-inexistente' });
        return false;
      }
      vistos.add(id);
      if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(carteira.saldo + delta)) {
        this.opcoes.log('carteiras-variacao-recusada', { delta: Number.isFinite(delta) ? delta : 'invalido' });
        return false;
      }
      alvos.push({ carteira, id, delta });
    }
    const somadas = this.estatisticasSomadas(partida);
    if (somadas === null) return false;
    for (const { carteira, delta } of alvos) {
      carteira.saldo += delta;
      carteira.jogou = true; // dinheiro que mexe é dinheiro de quem jogou, mesmo que o saldo volte a 100
    }
    for (const { carteira, modalidade, contagem } of somadas) carteira.estatisticas = { ...carteira.estatisticas, [modalidade]: contagem };
    const avisar = new Set([...alvos.map((a) => a.id), ...somadas.map((s) => s.id)]);
    for (const id of avisar) this.marcar(id);
    for (const id of avisar) this.mudou(id, origem);
    return true;
  }

  /** As contagens que `aplicar` vai gravar (a de antes somada à da partida), ou `null` se alguma não vale; nada é alterado aqui. */
  private estatisticasSomadas(partida: readonly EstatisticaDaPartida[]): { carteira: Guardada; id: string; modalidade: Modalidade; contagem: ContagemDeEstatisticas }[] | null {
    const somadas: { carteira: Guardada; id: string; modalidade: Modalidade; contagem: ContagemDeEstatisticas }[] = [];
    const vistas = new Set<string>();
    for (const { id, modalidade, contagem } of partida) {
      const carteira = this.carteiras.get(id);
      const chave = `${id}/${modalidade}`;
      if (!carteira || vistas.has(chave) || !MODALIDADES_DE_SALA.includes(modalidade) || !contagemValida(contagem)) {
        this.opcoes.log('carteiras-estatistica-recusada', { motivo: !carteira ? 'carteira-inexistente' : vistas.has(chave) ? 'repetida' : 'invalida' });
        return null;
      }
      vistas.add(chave);
      const nova = somarContagens(carteira.estatisticas?.[modalidade] ?? CONTAGEM_ZERADA, contagem);
      if (!CHAVES_DA_CONTAGEM.every((k) => Number.isSafeInteger(nova[k]))) {
        this.opcoes.log('carteiras-estatistica-recusada', { motivo: 'no-limite' });
        return null;
      }
      somadas.push({ carteira, id, modalidade, contagem: nova });
    }
    return somadas;
  }

  /**
   * Soma o que uma tacada (ou o fim de uma partida) vale às missões de hoje desta carteira e paga o prêmio do nível (`premioDaMissao`) de cada
   * uma que chegar à meta. Síncrono e tudo ou nada, como `aplicar`: o progresso e o prêmio entram juntos, e a missão que já
   * chegou à meta no dia não paga de novo, venha de onde vier (duas abas, duas salas, a mesma tacada repetida). Só vale o
   * que for das 3 missões do dia; valor que não é inteiro positivo recusa tudo. Virou o dia, o progresso de ontem some.
   *
   * `bolas` (L34) são as bolas que esta tacada matou: somam ao contador do taco que a carteira tem em uso agora (trocar de skin
   * no meio da partida vale para as tacadas seguintes), na mesma chamada e na mesma gravação do progresso e do prêmio. O
   * contador anda mesmo que nenhuma missão ande (a *Mão quente* já cumprida, por exemplo).
   *
   * Devolve o quadro novo e as missões que fecharam agora; `null` se nenhuma missão andou (carteira que não existe, nenhum valor
   * das missões de hoje, tudo já cumprido; o contador pode ter andado) ou se algum valor era inválido (nada mudou). Só o prêmio e o
   * contador avisam as outras salas da carteira; progresso sem prêmio vai só ao disco. `origem` é a sala que pagou, para ela não
   * se reavisar.
   */
  registrarMissoes(id: string, valores: ValoresDasMissoes, origem?: unknown, bolas = 0): ResultadoDeMissoes | null {
    if (this.recusaPorEncerrado()) return null;
    const c = this.carteiras.get(id);
    if (!c) return null;
    for (const v of Object.values(valores)) {
      if (!Number.isSafeInteger(v) || (v as number) <= 0) {
        this.opcoes.log('carteiras-missao-recusada', { valor: Number.isFinite(v) ? v : 'invalido' });
        return null;
      }
    }
    if (!Number.isSafeInteger(bolas) || bolas < 0) {
      this.opcoes.log('carteiras-missao-recusada', { bolas: Number.isFinite(bolas) ? bolas : 'invalido' });
      return null;
    }
    const dia = diaDaMissao(this.opcoes.relogio());
    const antes = c.missoes?.dia === dia ? c.missoes.progresso : {};
    const progresso: Partial<Record<IdMissao, number>> = { ...antes };
    const cumpridas: IdMissao[] = [];
    let andou = false;
    for (const m of missoesDoDia(dia)) {
      const valor = valores[m.id];
      const atual = antes[m.id] ?? 0;
      if (valor === undefined || atual >= m.meta) continue;
      const novo = Math.min(m.meta, m.acumulo === 'soma' ? atual + valor : Math.max(atual, valor));
      if (novo === atual) continue;
      progresso[m.id] = novo;
      andou = true;
      if (novo >= m.meta) cumpridas.push(m.id);
    }
    if (!andou && bolas === 0) return null;
    const premio = cumpridas.reduce((soma, m) => soma + premioDaMissao(m), 0);
    const emUso = c.itens.find((i) => i.skin === c.skin)!;
    if (!Number.isSafeInteger(c.saldo + premio) || !Number.isSafeInteger(emUso.bolas + bolas)) {
      this.opcoes.log('carteiras-missao-recusada', { motivo: 'no-limite' });
      return null;
    }
    if (andou) c.missoes = { dia, progresso };
    c.saldo += premio;
    emUso.bolas += bolas;
    if (premio > 0) c.jogou = true; // dinheiro que mexe é dinheiro de quem jogou
    this.marcar(id);
    if (premio > 0 || bolas > 0) this.mudou(id, origem);
    else this.mudou();
    return andou ? { missoes: this.quadroDeMissoes(c, dia), cumpridas } : null;
  }

  /** Avisa sempre que uma carteira existente muda (compra, uso, variação). Devolve como cancelar. */
  aoMudar(ouvinte: OuvinteDeCarteira): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  protected recusaPorEncerrado(): boolean {
    if (!this.encerrado) return false;
    this.opcoes.log('carteiras-encerrado');
    return true;
  }

  protected mudou(id?: string, origem?: unknown): void {
    this.persistir();
    if (id === undefined) return;
    for (const ouvinte of [...this.ouvintes]) {
      try {
        ouvinte(id, origem);
      } catch (e) {
        this.opcoes.log('carteiras-ouvinte-falhou', { erro: e instanceof Error ? e.message : 'desconhecido' });
      }
    }
  }

  /**
   * Importa o texto de um `carteiras.json` da sala Node (formato 1 ou 2, o mesmo de `serializar`), uma vez: o das carteiras que já
   * existem aqui só é trocado com `sobrescrever`. Tudo ou nada: arquivo que não se entende, carteira que não presta (a menos que
   * `aceitarDescartadas`), mais carteiras do que cabem ou carteiras já existentes sem `sobrescrever` recusam sem mudar nada. O que
   * entra vai à subclasse numa `persistir()` só. Nunca loga código, `id` nem saldo: só contagens.
   */
  importar(texto: string, opcoes: { readonly sobrescrever?: boolean; readonly aceitarDescartadas?: boolean } = {}): ResultadoDaImportacao {
    if (this.recusaPorEncerrado()) return { ok: false, motivo: 'encerrado' };
    const lidas = this.interpretar(texto);
    if (lidas === null) return { ok: false, motivo: 'arquivo-invalido' };
    if (lidas.descartadas > 0 && opcoes.aceitarDescartadas !== true) return { ok: false, motivo: 'carteiras-invalidas', descartadas: lidas.descartadas };
    if (lidas.carteiras.size > this.opcoes.maxCarteiras) return { ok: false, motivo: 'cheio', maximo: this.opcoes.maxCarteiras };
    if (this.carteiras.size > 0 && opcoes.sobrescrever !== true) return { ok: false, motivo: 'ja-tem-carteiras', existentes: this.carteiras.size };
    const antes = [...this.carteiras.keys()];
    this.carteiras.clear();
    for (const [id, c] of lidas.carteiras) this.carteiras.set(id, c);
    for (const id of [...antes, ...lidas.carteiras.keys()]) this.marcar(id);
    this.opcoes.log('carteiras-importadas', { importadas: lidas.carteiras.size, descartadas: lidas.descartadas, migradas: lidas.migradas, substituidas: antes.length });
    this.mudou();
    for (const id of lidas.carteiras.keys()) this.avisar(id);
    return { ok: true, importadas: lidas.carteiras.size, descartadas: lidas.descartadas, migradas: lidas.migradas, substituidas: antes.length };
  }

  /**
   * A cópia de segurança (L47, L47b): o arquivo que `importar` aceita. As `carteiras` são as linhas EXATAS da versão anterior (sem o
   * balão: uma versão anterior ainda a importa sem descartar nenhuma), os `baloes` levam o balão de cada carteira que o tem (itens e
   * aparência, pela chave da carteira) e `carteiras_descartadas` o que o armazenamento guardou de lado por não conseguir ler (o
   * Durable Object; a sala Node guarda o seu em `carteiras.corrompido-*.json` e aqui vem vazio). Só os ids (o resumo SHA-256 do
   * código) e os dados; o código de ninguém está aqui, nem pode estar. Quem a usa (`GET /admin/exportar-carteiras`) a guarda como
   * segredo mesmo assim: tem o saldo e os itens de todo mundo, e nunca a manda a log.
   */
  exportar(): string {
    return JSON.stringify({ ...this.paraOArquivo(), baloes: this.baloesParaGuardar(), carteiras_descartadas: this.descartadas() });
  }

  /** O `{ versao, carteiras }` que a sala Node grava em `carteiras.json`: só o que a versão anterior lê, sem balão. */
  protected paraOArquivo(): { versao: number; carteiras: Record<string, Omit<Guardada, 'balao'>> } {
    const carteiras: Record<string, Omit<Guardada, 'balao'>> = {};
    for (const [id, c] of this.carteiras) carteiras[id] = linhaDaCarteira(c);
    return { versao: VERSAO_DO_ARQUIVO, carteiras };
  }

  /** O balão de cada carteira que o tem, pela chave dela. */
  protected baloesParaGuardar(): Record<string, BalaoGuardado> {
    const baloes: Record<string, BalaoGuardado> = {};
    for (const [id, c] of this.carteiras) if (c.balao) baloes[id] = c.balao;
    return baloes;
  }

  /** As carteiras que o armazenamento guardou de lado por não conseguir ler (nada, aqui: quem guarda de lado sobrescreve). */
  descartadas(): readonly CarteiraDescartada[] {
    return [];
  }

  /**
   * Traz de volta carteiras descartadas (L47b): `texto` é uma cópia (a exportação, ou o que `GET /admin/carteiras-descartadas` devolveu),
   * `ids` as que se quer (basta o objeto ter `carteiras_descartadas`, e `baloes` se for o caso). Cada uma volta como carteira, validada pela versão de agora (o formato de antes vira itens com semente
   * sorteada), com o balão que a cópia traz em `baloes` para o mesmo id. Nunca troca uma carteira que já existe (`ja-existe`) e é tudo ou
   * nada: um id que a cópia não tem (`descartada-nao-encontrada`) ou que ainda não presta (`descartada-invalida`) recusa todos. Vale a
   * descartada mais recente de cada id. Só acrescenta, então pode rodar com salas abertas.
   */
  restaurar(texto: string, ids: readonly string[]): ResultadoDaRestauracao {
    if (this.recusaPorEncerrado()) return { ok: false, motivo: 'encerrado' };
    let dado: unknown;
    try {
      dado = JSON.parse(texto);
    } catch {
      dado = null;
    }
    // basta `carteiras_descartadas` (e `baloes`, se houver): a resposta de `GET /admin/carteiras-descartadas` também serve
    if (!objetoSimples(dado) || !Array.isArray(dado.carteiras_descartadas) || ('baloes' in dado && !objetoSimples(dado.baloes))) return { ok: false, motivo: 'arquivo-invalido' };
    const quer = [...new Set(ids)];
    const guardadas = descartadasDoArquivo(dado.carteiras_descartadas);
    const baloes = objetoSimples(dado.baloes) ? dado.baloes : {};
    const voltam = new Map<string, Guardada>();
    for (const id of quer) {
      const entrada = guardadas.findLast((d) => d.id === id);
      if (!ID_VALIDO.test(id) || entrada === undefined) return { ok: false, motivo: 'descartada-nao-encontrada' };
      if (this.carteiras.has(id)) return { ok: false, motivo: 'ja-existe' };
      let bruto: unknown;
      try {
        bruto = JSON.parse(entrada.dados);
      } catch {
        return { ok: false, motivo: 'descartada-invalida' };
      }
      const lida = guardadaValida(bruto, () => this.novaSemente());
      if (lida === null) return { ok: false, motivo: 'descartada-invalida' };
      voltam.set(id, lida.carteira);
    }
    if (voltam.size === 0) return { ok: false, motivo: 'descartada-nao-encontrada' };
    if (this.carteiras.size + voltam.size > this.opcoes.maxCarteiras) return { ok: false, motivo: 'cheio', maximo: this.opcoes.maxCarteiras };
    aplicarBaloes(Object.entries(baloes).filter(([id]) => voltam.has(id)), voltam);
    for (const [id, c] of voltam) {
      this.carteiras.set(id, c);
      this.marcar(id);
    }
    this.opcoes.log('carteiras-restauradas', { restauradas: voltam.size });
    this.mudou();
    this.aoRestaurar([...voltam.keys()]);
    for (const id of voltam.keys()) this.avisar(id);
    return { ok: true, restauradas: voltam.size };
  }

  /** As carteiras de `ids` voltaram (e já foram gravadas, ou estão pendentes): quem guarda a lista de descartadas tira as entradas delas de lá. */
  protected aoRestaurar(ids: readonly string[]): void {
    void ids;
  }

  /** Avisa os ouvintes de que a carteira `id` mudou, sem gravar nada (quem chamou já gravou). */
  private avisar(id: string): void {
    for (const ouvinte of [...this.ouvintes]) {
      try {
        ouvinte(id);
      } catch (e) {
        this.opcoes.log('carteiras-ouvinte-falhou', { erro: e instanceof Error ? e.message : 'desconhecido' });
      }
    }
  }

  /** O objeto de cima de um texto de carteiras (`versao` conhecida e `carteiras` um objeto), ou `null` se não se entende. As outras chaves ficam para quem as quer. */
  private lerArquivo(bruto: string): Record<string, unknown> | null {
    let dado: unknown;
    try {
      dado = JSON.parse(bruto);
    } catch {
      return null;
    }
    if (!objetoSimples(dado)) return null;
    const { versao, carteiras } = dado;
    if (typeof versao !== 'number' || !VERSOES_QUE_ABREM.includes(versao) || !objetoSimples(carteiras)) return null;
    return dado;
  }

  /**
   * As carteiras de um texto JSON, ou `null` se o arquivo não se entende (JSON quebrado, versão ou forma errada, ou `baloes` que não é
   * um objeto: o balão custou dinheiro e não se descarta calado). Carteira que não presta é descartada e contada; o formato de antes
   * (`skins`) vira itens com semente sorteada (`migradas`); o balão vem de `baloes` (L47b, pela chave da carteira; o balão que a
   * carteira trazia na própria linha, do L47 que nunca foi publicado, ainda vale se `baloes` não o contradiz).
   */
  protected interpretar(bruto: string): { carteiras: Map<string, Guardada>; descartadas: number; migradas: number } | null {
    const dado = this.lerArquivo(bruto);
    if (dado === null || ('baloes' in dado && !objetoSimples(dado.baloes))) return null;
    const lidas = new Map<string, Guardada>();
    let descartadas = 0;
    let migradas = 0;
    for (const [id, valor] of Object.entries(dado.carteiras as Record<string, unknown>)) {
      const lida = ID_VALIDO.test(id) ? guardadaValida(valor, () => this.novaSemente()) : null;
      if (lida) {
        lidas.set(id, lida.carteira);
        if (lida.migrada) migradas++;
      } else descartadas++;
    }
    if (objetoSimples(dado.baloes)) aplicarBaloes(Object.entries(dado.baloes), lidas);
    return { carteiras: lidas, descartadas, migradas };
  }
}

/** As entradas de `carteiras_descartadas` de uma cópia que têm a forma certa (`id` e `dados` e `motivo` texto, `em` número); o resto é ignorado. */
function descartadasDoArquivo(valor: unknown): CarteiraDescartada[] {
  if (!Array.isArray(valor)) return [];
  const lidas: CarteiraDescartada[] = [];
  for (const e of valor) {
    if (objetoSimples(e) && typeof e.id === 'string' && typeof e.dados === 'string' && typeof e.motivo === 'string' && typeof e.em === 'number') {
      lidas.push({ id: e.id, dados: e.dados, motivo: e.motivo, em: e.em });
    }
  }
  return lidas;
}

/** O que `importar` fez, ou por que recusou (nada muda numa recusa). */
export type ResultadoDaImportacao =
  | { readonly ok: true; readonly importadas: number; readonly descartadas: number; readonly migradas: number; readonly substituidas: number }
  | { readonly ok: false; readonly motivo: 'arquivo-invalido' | 'encerrado' }
  | { readonly ok: false; readonly motivo: 'carteiras-invalidas'; readonly descartadas: number }
  | { readonly ok: false; readonly motivo: 'cheio'; readonly maximo: number }
  | { readonly ok: false; readonly motivo: 'ja-tem-carteiras'; readonly existentes: number };

/** O que `restaurar` fez, ou por que recusou (nada muda numa recusa). */
export type ResultadoDaRestauracao =
  | { readonly ok: true; readonly restauradas: number }
  | { readonly ok: false; readonly motivo: 'arquivo-invalido' | 'encerrado' | 'descartada-nao-encontrada' | 'descartada-invalida' | 'ja-existe' }
  | { readonly ok: false; readonly motivo: 'cheio'; readonly maximo: number };

/** Carteiras só na memória, sem guardar em lugar nenhum (os testes das salas, e quem não quer persistir). */
export class CarteirasEmMemoria extends CarteirasBase {
  protected persistir(): void {}
}
