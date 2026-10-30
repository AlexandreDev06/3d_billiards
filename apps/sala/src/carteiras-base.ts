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
import { randomBytes, randomInt } from 'node:crypto';
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
import type { ResultadoDeMoeda } from '@sinuca/conta/contrato';
import type { Modalidade } from '@sinuca/regras';
import type { BancoDaSala } from './banco-da-sala';
import {
  CaixaDeSaida,
  DespachanteDoBanco,
  ESPERA_MINIMA_MS,
  JOGO_NO_BANCO,
  chaveDaMissao,
  chaveDoPresente,
  esperaDepoisDeFalhar,
  type EntradaDaCaixa,
  type OperacaoDoBanco,
} from './caixa-do-banco';
import { idDoCodigo } from './id-da-carteira';
import { ComprasPendentes, chaveDaCompra, type CompraPendente, type TipoDeCompra } from './compras-pendentes';
import type { PresenteDeTeste } from './config-nucleo';
import type { ValoresDasMissoes } from './missoes';
import type { Logger } from './log';

/** 2 (L34): a carteira guarda `itens` (skin, semente e bolas) no lugar de `skins`. O 1 ainda abre: cada skin vira um item com semente sorteada. */
export const VERSAO_DO_ARQUIVO = 2;
/** 3 (L57, L59, L60b): o `carteiras.json` da sala Node com `SALDO_NO_BANCO=1` e operações na caixa de saída leva o campo `saida`, compras pendentes levam `compras`, operações mortas `mortas` e apostas abertas `apostas`. Sem nada disso continua sendo 2, que a versão anterior abre. */
export const VERSAO_DO_ARQUIVO_COM_SAIDA = 3;
export const VERSOES_QUE_ABREM = [1, 2, 3];
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
  /**
   * O Banco da Beco Games (L57, `SALDO_NO_BANCO=1`): com ele, o `saldo` da carteira é um espelho do saldo do Banco e cada escrita de
   * saldo também põe uma operação na caixa de saída. Ausente ou `null` = como sempre foi: sem caixa e sem chamada.
   */
  readonly banco?: BancoDaSala | null;
  /** Sorteia o último pedaço da chave de uma compra pelo Banco (L59); os testes injetam o seu. Padrão: `crypto.randomInt`. */
  readonly sortearChave?: () => number;
  /** A caixa de saída quer ser acordada de novo (a hora em `proximaTentativaDaCaixa` mudou): o Worker rearma o alarm. */
  readonly aoAgendarCaixa?: () => void;
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
  /**
   * A carteira é de uma conta da Beco Games (L61): só abre com uma sessão do mesmo `id`; o código dela sozinho vale `carteira-invalida`
   * (quem sai da conta, ou outra pessoa com o código, não entra na carteira da conta). Vale só na memória, como o `balao`: NUNCA vai na
   * linha da carteira (a versão anterior descarta a carteira com uma chave a mais). O Durable Object a guarda na tabela
   * `carteiras_da_conta`, e a sala Node no campo `daConta` do `carteiras.json`.
   */
  daConta?: true;
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
  | 'encerrado'
  /** L59: o Banco não respondeu (ou recusou por outro motivo que não o saldo) e nada foi cobrado nem dado; o HTTP responde 503. */
  | 'fora-do-ar'
  /** L60b: as carteiras estão congeladas para a migração do saldo (`congelar`); nada foi mudado; o HTTP responde 503. */
  | 'congelado';
export type ResultadoDeLoja = { readonly ok: true; readonly estado: EstadoCarteira } | { readonly ok: false; readonly erro: ErroDeLoja };

export interface Variacao {
  readonly id: string;
  readonly delta: number;
}

/** Quem quer saber que uma carteira mudou; `origem` é o que quem mudou passou (para não avisar a si mesmo). */
export type OuvinteDeCarteira = (id: string, origem?: unknown) => void;

const resumo = idDoCodigo;

/** Quanto a sala espera o Banco numa leitura (`saldo`, `operacao`) e num débito de compra antes de desistir de esperar (a operação, se chegou, a pendência resolve depois). */
const TEMPO_DA_LEITURA_MS = 5000;
const TEMPO_DO_DEBITO_MS = 15_000;
/** O log de "o Banco não respondeu" numa leitura sai no máximo uma vez por minuto. */
const INTERVALO_DO_LOG_DE_LEITURA_MS = 60_000;
const UMA_HORA_MS = 3_600_000;

/** Quanto dura o congelamento das carteiras para a migração do saldo (L60b): vence sozinho, ou `descongelar`. */
export const DURACAO_DO_CONGELAMENTO_MS = 15 * 60_000;

class ErroDeTempo extends Error {}

/** `promessa` ou o erro de tempo, o que vier primeiro; a promessa original continua sua vida (quem a criou cuida do que ela devolver). */
function comTempo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ErroDeTempo('o Banco não respondeu a tempo')), ms);
    (t as { unref?: () => void }).unref?.();
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error('desconhecido'));
      },
    );
  });
}

const oito = (id: string): string => id.slice(0, 8);

/** O sorteio da chave da compra: 0 a 999 999 999. */
const sorteioDaChave = (): number => randomInt(1_000_000_000);

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

/** A carteira como a versão anterior a lê (L47b): tudo menos o balão e a marca `daConta`, que são gravados à parte. É isto que vai à linha do SQLite e ao `carteiras.json`. */
export function linhaDaCarteira(c: Guardada): Omit<Guardada, 'balao' | 'daConta'> {
  return Object.fromEntries(Object.entries(c).filter(([chave]) => chave !== 'balao' && chave !== 'daConta')) as Omit<Guardada, 'balao' | 'daConta'>;
}

/** Marca como `daConta` as carteiras de `ids` que existem em `carteiras`; id que não existe ou não é um id é ignorado. */
export function aplicarDaConta(ids: Iterable<unknown>, carteiras: Map<string, Guardada>): void {
  for (const id of ids) {
    const c = typeof id === 'string' && ID_VALIDO.test(id) ? carteiras.get(id) : undefined;
    if (c) c.daConta = true;
  }
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

  /** A caixa de saída do saldo (L57); `null` com `SALDO_NO_BANCO` desligado. */
  protected readonly caixa: CaixaDeSaida | null;
  private readonly despachante: DespachanteDoBanco | null;
  /** As compras que esperam a resposta do Banco (L59); `null` com `SALDO_NO_BANCO` desligado. */
  protected readonly compras: ComprasPendentes | null;
  /**
   * As chaves de débito de compra cuja chamada ao Banco ainda está em voo, com a conta de cada uma: a reconciliação não mexe nelas e a
   * caixa segura as operações dessa conta. Saem quando a chamada termina, ou quando o prazo dela (15 s) vence (aí fica só a pendência).
   */
  private readonly comprasEmVoo = new Map<string, string>();
  /** As contas cuja compra terminou com escrita concorrente: o espelho é relido assim que a fila da conta esvazia. */
  private readonly relerDepoisDaFila = new Set<string>();
  /** As chaves das apostas abertas (reservadas no Banco e ainda não liquidadas nem devolvidas): se o objeto reinicia, as salas somem e a reserva volta (L60b). */
  protected readonly apostasAbertas = new Set<string>();
  /** As chaves cuja linha em `apostas_abertas` pode estar diferente (gravar se ainda está aberta, apagar se não); só vale com `rastreiaSujas`. */
  protected readonly apostasSujas = new Set<string>();
  /**
   * O registro dos excluídos (L61b): os `id`s das contas que o Banco excluiu (pela sinuca ou pelo portal), mesmo os que nunca tiveram carteira
   * aqui. `garantirDaConta` nunca recria a carteira de um deles. Persistido (tabela `contas_excluidas`, campo `excluidas` do arquivo), na
   * mesma gravação que apaga a carteira, e nunca encolhe (nem a importação o esvazia).
   */
  protected readonly excluidas = new Set<string>();
  /** Os `id`s que entraram em `excluidas` e ainda não chegaram à tabela; só vale com `rastreiaSujas`. */
  protected readonly excluidasSujas = new Set<string>();
  /** As marcas `daConta` que não puderam ser postas (o `POST /conta/criar` com convidado deu certo e o efeito falhou), persistidas e tentadas de novo (L61b). */
  protected readonly marcasPendentes = new Set<string>();
  /** Os `id`s cuja linha em `marcas_pendentes` pode estar diferente (gravar se ainda pendente, apagar se não); só vale com `rastreiaSujas`. */
  protected readonly marcasSujas = new Set<string>();
  /** Onde a varredura das contas excluídas pelo portal parou (ms do Banco); 0 = nunca varreu. Guardado com as exclusões que ele cobre (`apagarDasContas`). */
  protected ateDaVarredura = 0;
  /** `ateDaVarredura` mudou e ainda não chegou à tabela; só vale com `rastreiaSujas`. */
  protected ateSujo = false;
  /** Linhas da caixa de saída ou das compras pendentes que o armazenamento tem e a leitura não aceitou (ficam lá, nem enviadas nem apagadas): contam como caixa cheia. */
  protected linhasInvalidasNoArmazenamento = 0;
  /** O instante em que o congelamento vence (ms desde 1970); 0 = nunca congelou. Persistido por quem guarda (`gravarCongelamento`). */
  private congeladaAte = 0;
  /** Uma fila por conta: as compras de uma mesma conta andam uma de cada vez (o espelho nunca recebe resposta fora de ordem). */
  private readonly filasDeCompra = new Map<string, Promise<void>>();
  /** Sobe a cada vez que o espelho de uma conta muda por outra via que não a leitura (resposta da caixa, compra): a leitura que começou antes é descartada. */
  private readonly versaoDoEspelho = new Map<string, number>();
  private reconciliando: Promise<void> | null = null;
  private falhasDeCompra = 0;
  private esperaDeCompraAte = 0;
  private ultimoLogDeLeitura = Number.NEGATIVE_INFINITY;

  constructor(protected readonly opcoes: OpcoesDasCarteiras) {
    this.caixa = opcoes.banco ? new CaixaDeSaida(opcoes.relogio) : null;
    this.compras = opcoes.banco ? new ComprasPendentes() : null;
    this.despachante =
      this.caixa && opcoes.banco
        ? new DespachanteDoBanco({
            caixa: this.caixa,
            banco: opcoes.banco,
            relogio: opcoes.relogio,
            log: opcoes.log,
            aoSair: (entrada, saldos) => this.sairDaCaixa(entrada, saldos),
            aoFalhar: (entrada) => this.falhouNaCaixa(entrada),
            aoMorrer: (entrada, erro) => this.morreuNaCaixa(entrada, erro),
            seguradas: () => new Set(this.comprasEmVoo.values()),
            aoAgendar: () => this.aoAgendarCaixa(),
            encerrado: () => this.encerrado,
          })
        : null;
  }

  /** O saldo mora no Banco e este armazém guarda o espelho e a caixa de saída (L57). */
  get saldoNoBanco(): boolean {
    return this.caixa !== null;
  }

  /** Quando a caixa (ou uma compra pendente, L59) quer ser acordada (ms desde 1970), ou `null` se não há nada a fazer ou a chave está desligada. */
  get proximaTentativaDaCaixa(): number | null {
    const caixa = this.despachante?.proximaTentativaEm ?? null;
    let compras: number | null = null;
    if (this.compras && !this.compras.vazia) {
      const agora = this.opcoes.relogio();
      compras = this.esperaDeCompraAte > agora ? this.esperaDeCompraAte : agora + ESPERA_MINIMA_MS;
    }
    return caixa === null ? compras : compras === null ? caixa : Math.min(caixa, compras);
  }

  /** Quantas compras esperam a conferência com o Banco. */
  get comprasPendentes(): number {
    return this.compras?.tamanho ?? 0;
  }

  /** Quantas operações esperam o Banco. */
  get pendentesNaCaixa(): number {
    return this.caixa?.entradas.length ?? 0;
  }

  /** Quantas operações o Banco recusou com exceção cinco vezes estando vivo (`saida_morta`): fora da fila até `reenviarMortas`. */
  get mortasNaCaixa(): number {
    return this.caixa?.mortas.length ?? 0;
  }

  /** Linhas que o armazenamento guarda e a leitura não aceitou (caixa ou compras): nada é enviado, mas a migração as conta como caixa cheia. */
  get linhasInvalidas(): number {
    return this.linhasInvalidasNoArmazenamento;
  }

  /** Põe todas as mortas de volta no fim da caixa (`POST /admin/reenviar-mortas`). Devolve quantas eram. */
  reenviarMortas(): number {
    if (!this.caixa || this.recusaPorEncerrado()) return 0;
    const n = this.caixa.reenviarMortas();
    if (n === 0) return 0;
    this.opcoes.log('banco-mortas-reenviadas', { operacoes: n });
    this.persistir();
    this.despachante!.cutucar();
    return n;
  }

  // ---------------------------------------------------------------- o congelamento (L60b)

  /** As escritas de carteira estão suspensas para a migração do saldo (vence sozinho em `DURACAO_DO_CONGELAMENTO_MS`). */
  get congelada(): boolean {
    return this.opcoes.relogio() < this.congeladaAte;
  }

  /** Quando o congelamento vence (ms desde 1970), ou `null` se não está congelada. */
  get congeladaAteMs(): number | null {
    return this.congelada ? this.congeladaAte : null;
  }

  /**
   * Liga o congelamento por `DURACAO_DO_CONGELAMENTO_MS` (de novo, se já estava ligado). Criar carteira, comprar, usar, equipar o balão,
   * o presente de teste, as missões, a partida e a aposta passam a ser recusados até vencer ou `descongelar`. Persistido por quem guarda:
   * sobrevive à publicação que reinicia o objeto. `null` se o armazém está fechando ou a gravação falhou (nada mudou).
   */
  congelar(): number | null {
    if (this.recusaPorEncerrado()) return null;
    const ate = this.opcoes.relogio() + DURACAO_DO_CONGELAMENTO_MS;
    try {
      this.gravarCongelamento(ate);
    } catch (e) {
      this.opcoes.log('carteiras-gravacao-falhou', { tipo: 'congelamento', erro: e instanceof Error ? e.message.slice(0, 100) : 'desconhecido' });
      return null;
    }
    this.congeladaAte = ate;
    this.opcoes.log('carteiras-congeladas', { minutos: DURACAO_DO_CONGELAMENTO_MS / 60_000 });
    return ate;
  }

  /** Desliga o congelamento. Devolve se estava ligado; `null` se a gravação falhou (continua como estava). */
  descongelar(): boolean | null {
    if (this.recusaPorEncerrado()) return null;
    const estava = this.congelada;
    try {
      this.gravarCongelamento(0);
    } catch (e) {
      this.opcoes.log('carteiras-gravacao-falhou', { tipo: 'congelamento', erro: e instanceof Error ? e.message.slice(0, 100) : 'desconhecido' });
      return null;
    }
    this.congeladaAte = 0;
    if (estava) this.opcoes.log('carteiras-descongeladas');
    return estava;
  }

  /** Quem guarda põe o que gravou de volta, ao abrir. */
  protected restaurarCongelamento(ate: number): void {
    if (Number.isFinite(ate) && ate > 0) this.congeladaAte = ate;
  }

  /** Quem guarda o congelamento (o Durable Object: `carteiras_meta`) o grava; lança se não der. O padrão não guarda (a sala Node não tem a rota). */
  protected gravarCongelamento(ate: number): void {
    void ate;
  }

  /** `true` se as escritas estão suspensas (sem log: durante os 15 minutos todo pedido passaria por aqui). */
  protected recusaPorCongelada(): boolean {
    return this.congelada;
  }

  /**
   * Uma passada pela caixa agora (o alarm, o fechamento, os testes) e depois pelas compras pendentes (L59); sem caixa não faz nada.
   * Dentro da espera depois de uma falha, também não.
   */
  async drenarCaixa(): Promise<void> {
    await (this.despachante?.drenar() ?? Promise.resolve());
    await this.reconciliarCompras();
  }

  /** Espera a passada em voo e as compras em andamento terminarem (o fechamento). */
  protected async esperarACaixa(): Promise<void> {
    await (this.despachante?.esperar() ?? Promise.resolve());
    await Promise.allSettled([...this.filasDeCompra.values(), this.reconciliando ?? Promise.resolve()]);
  }

  /** Começa a drenar o que uma gravação anterior deixou na caixa e a conferir as compras pendentes (as subclasses chamam depois de carregar). */
  protected cutucarACaixa(): void {
    this.devolverApostasAbertasDoDespertar();
    if (this.caixa && !this.caixa.vazia) this.despachante?.cutucar();
    if (this.compras && !this.compras.vazia) {
      queueMicrotask(() => void this.reconciliarCompras());
      this.aoAgendarCaixa();
    }
  }

  /** O armazenamento já tem a pendência `chave` (a compra só chama o Banco depois). O padrão serve a quem grava na hora; o arquivo espera a gravação. */
  protected garantirGravada(chave: string): Promise<boolean> {
    return Promise.resolve(!(this.compras?.sujas.has(chave) ?? false));
  }

  /** O momento da próxima tentativa mudou. A sala Node arma o seu temporizador; o Worker, o alarm (por `opcoes.aoAgendarCaixa`). */
  protected aoAgendarCaixa(): void {
    this.opcoes.aoAgendarCaixa?.();
  }

  private empilhar(op: OperacaoDoBanco): void {
    this.caixa!.empilhar(op);
    this.despachante!.cutucar();
  }

  /**
   * A operação saiu da caixa: o Banco aceitou (`saldos` são os dele depois dela) ou recusou de vez (`null`). Apagar a entrada e pôr o
   * espelho vão numa gravação só. O espelho recebe o saldo do Banco MAIS o que ainda espera na caixa para a mesma conta, então um
   * crédito ainda não enviado nunca some da tela enquanto o anterior chega. A compra (L59) tem o seu próprio caminho (`compraNoBanco`).
   */
  private sairDaCaixa(entrada: EntradaDaCaixa, saldos: Readonly<Record<string, number>> | null): void {
    this.caixa!.apagar(entrada.ordem);
    const mudaram: string[] = [];
    if (saldos !== null) {
      for (const [id, saldo] of Object.entries(saldos)) {
        this.versaoDoEspelho.set(id, (this.versaoDoEspelho.get(id) ?? 0) + 1);
        const c = this.carteiras.get(id);
        const novo = saldo + this.aindaNaCaixaPara(id);
        if (!c || !Number.isSafeInteger(novo) || c.saldo === novo) continue;
        c.saldo = novo;
        this.marcar(id);
        mudaram.push(id);
      }
    }
    if (mudaram.length > 0) this.opcoes.log('banco-espelho-corrigido', { contas: mudaram.length });
    this.persistir();
    for (const id of mudaram) this.avisar(id);
  }

  private falhouNaCaixa(entrada: EntradaDaCaixa): void {
    this.caixa!.contarFalha(entrada.ordem);
    this.persistir();
  }

  /** A operação lançou cinco vezes com o Banco vivo: sai da fila para `saida_morta` (na mesma gravação) e a fila segue. */
  private morreuNaCaixa(entrada: EntradaDaCaixa, erro: string): void {
    this.caixa!.matar(entrada.ordem, erro);
    this.persistir();
  }

  /** O que as operações que ainda esperam na caixa vão somar ao saldo de `id` no Banco. */
  private aindaNaCaixaPara(id: string): number {
    let soma = 0;
    for (const { op } of this.caixa!.entradas) {
      if (op.tipo === 'creditar' && op.id === id) soma += op.valor;
      else if (op.tipo === 'liquidar') soma += op.variacoes.find((v) => v.id === id)?.delta ?? 0;
    }
    return soma;
  }

  /**
   * Prende a aposta de cada carteira do lote no Banco (`reservar`) quando uma partida que vale moeda começa. Sem caixa não faz nada.
   * `chave` é a da aposta (`chaveDaAposta`); o mesmo vale para `aplicar` (que paga) e `devolverAposta`.
   */
  reservarAposta(chave: string, lote: readonly { readonly id: string; readonly valor: number }[]): void {
    if (!this.caixa || this.recusaPorEncerrado() || this.recusaPorCongelada()) return;
    this.empilhar({ tipo: 'reservar', chave, lote: lote.map((x) => ({ id: x.id, valor: x.valor })) });
    this.abrirAposta(chave); // a chave fica gravada junto com a operação: se o objeto reiniciar com a aposta aberta, a reserva volta ao acordar
    this.persistir();
  }

  /** Solta a reserva da aposta no Banco sem mexer em saldo (aposta anulada, sem dinheiro a mover, partida que não terminou, sala fechada). */
  devolverAposta(chave: string): void {
    if (!this.caixa || this.recusaPorEncerrado()) return;
    this.empilhar({ tipo: 'devolver', chave });
    this.fecharAposta(chave);
    this.persistir();
  }

  private abrirAposta(chave: string): void {
    this.apostasAbertas.add(chave);
    if (this.rastreiaSujas) this.apostasSujas.add(chave);
  }

  private fecharAposta(chave: string): void {
    if (!this.apostasAbertas.delete(chave)) return;
    if (this.rastreiaSujas) this.apostasSujas.add(chave);
  }

  /**
   * Ao acordar (o objeto reiniciou ou o servidor caiu) as salas da memória sumiram: toda aposta que o armazenamento diz aberta
   * ganha um `devolver` na caixa, e a lista é limpa. Antes disto a reserva ficava presa por 24 h no Banco.
   */
  private devolverApostasAbertasDoDespertar(): void {
    if (!this.caixa || this.apostasAbertas.size === 0) return;
    const chaves = [...this.apostasAbertas];
    for (const chave of chaves) {
      this.empilhar({ tipo: 'devolver', chave });
      this.fecharAposta(chave);
    }
    this.opcoes.log('apostas-abertas-devolvidas', { apostas: chaves.length });
    this.persistir();
  }

  /** As apostas abertas que o armazenamento tinha (já lidas); quem guarda chama ao abrir, antes de `cutucarACaixa`. */
  protected carregarApostasAbertas(chaves: Iterable<string>): void {
    for (const chave of chaves) this.apostasAbertas.add(chave);
  }

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
    if (this.recusaPorEncerrado() || this.recusaPorCongelada()) return null;
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
      if (this.caixa) this.empilhar({ tipo: 'garantir', id, saldo: SALDO_INICIAL });
      this.marcar(id);
      this.mudou();
      this.presentear(id);
      return { codigo, id };
    }
    this.opcoes.log('carteiras-codigo-repetido');
    return null;
  }

  /** A carteira tem uma compra pendente ou em voo (a pendência e o débito no Banco ainda precisam dela). */
  private temCompraEmAberto(id: string): boolean {
    return (this.compras?.lista.some((p) => p.id === id) ?? false) || [...this.comprasEmVoo.values()].includes(id);
  }

  /** Tira a carteira nunca usada mais velha para dar lugar a uma nova; `false` se todas estão em uso. */
  private reaproveitarUma(): boolean {
    let velha: [string, Guardada] | null = null;
    for (const par of this.carteiras) {
      const c = par[1];
      const nunca = c.daConta === undefined && !c.jogou && c.saldo === SALDO_INICIAL + totalDePresentes(c) && c.itens.length === 1 && c.skin === SKIN_PADRAO && c.balao === undefined && !this.temCompraEmAberto(par[0]); // o presente de teste não é uso; item de balão comprado é; compra pendente ou em voo também
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
    if (this.recusaPorEncerrado() || this.recusaPorCongelada()) return;
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
    const c = this.carteiras.get(id);
    // a carteira de uma conta (L61) só abre com a sessão: o código sozinho vale como carteira que não existe
    if (!c || c.daConta) return undefined;
    this.presentear(id);
    return id;
  }

  /** A carteira `id` é de uma conta (`daConta`)? `false` se ela não existe. */
  ehDaConta(id: string): boolean {
    return this.carteiras.get(id)?.daConta === true;
  }

  // ---------------------------------------------------------------- a conta da Beco Games (L61)

  /**
   * O convidado virou conta (`POST /conta/criar` com o código dele): a carteira desse `id` passa a só abrir com a sessão. Não mexe em
   * saldo, itens nem caixa. Devolve se a carteira existe na sinuca (se não, não há o que marcar: `garantirDaConta` marca quando ela
   * nascer). Vale mesmo com as carteiras congeladas (não toca em saldo) e é idempotente. Fechando, lança.
   */
  marcarDaConta(id: string): boolean {
    if (this.recusaPorEncerrado()) throw new Error('as carteiras estão fechando');
    const c = this.carteiras.get(id);
    if (!c) return false;
    if (c.daConta) {
      this.resolverMarcaPendente(id);
      return true;
    }
    c.daConta = true;
    this.marcar(id);
    this.resolverMarcaPendente(id, false);
    this.mudou();
    this.opcoes.log('carteira-da-conta', { carteiras: this.carteiras.size });
    return true;
  }

  /**
   * A carteira de itens da conta `id` (que o Banco acabou de confirmar por uma sessão), pronta para o HTTP e para a sala. Existe: marca
   * `daConta` (idempotente) e entrega o presente de teste, se ainda não o recebeu. Não existe (conta criada no portal, ou a sinuca ainda
   * não a viu): nasce agora, sem código, com os itens vazios (só o taco clássico), o saldo inicial como espelho provisório (`garantir`
   * na caixa; o Banco, que é quem manda, é relido por quem chama) e o presente uma vez. Só nasce com `SALDO_NO_BANCO=1`: sem o Banco
   * o saldo de uma conta não teria dono, e a resposta é `sem-banco`. Congelada, fechando ou cheia, também não nasce.
   */
  garantirDaConta(id: string): { readonly ok: true; readonly id: string } | { readonly ok: false; readonly erro: 'sem-banco' | 'congelado' | 'encerrado' | 'cheio' | 'excluida' } {
    if (!ID_VALIDO.test(id)) return { ok: false, erro: 'sem-banco' };
    // L61b: conta excluída nunca renasce (nem uma conexão que ainda traga o `id` dela, nem uma carteira que a importação trouxe de volta)
    if (this.excluidas.has(id)) return { ok: false, erro: 'excluida' };
    const c = this.carteiras.get(id);
    if (c) {
      if (!c.daConta && !this.recusaPorEncerrado() && !this.congelada) {
        c.daConta = true;
        this.marcar(id);
        this.mudou();
      }
      // a sessão apareceu: a marca está posta, a pendência (se havia) cumpriu seu papel
      this.resolverMarcaPendente(id);
      this.presentear(id);
      return { ok: true, id };
    }
    if (!this.caixa) return { ok: false, erro: 'sem-banco' };
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    if (this.recusaPorCongelada()) return { ok: false, erro: 'congelado' };
    if (this.carteiras.size >= this.opcoes.maxCarteiras && !this.reaproveitarUma()) {
      this.opcoes.log('carteiras-cheio', { maximo: this.opcoes.maxCarteiras });
      return { ok: false, erro: 'cheio' };
    }
    this.carteiras.set(id, {
      saldo: SALDO_INICIAL,
      itens: [{ skin: SKIN_PADRAO, semente: this.novaSemente(), bolas: 0 }],
      skin: SKIN_PADRAO,
      criadaEm: this.opcoes.relogio(),
      jogou: false,
      daConta: true,
    });
    this.opcoes.log('carteira-criada', { carteiras: this.carteiras.size, daConta: true });
    this.empilhar({ tipo: 'garantir', id, saldo: SALDO_INICIAL });
    this.marcar(id);
    this.mudou();
    this.presentear(id);
    return { ok: true, id };
  }

  /**
   * A conta foi excluída (pela sinuca, ou achada na varredura das excluídas pelo portal): apaga a carteira de itens desses `id`s por
   * inteiro (tacos, balão, missões, estatísticas, a marca), numa gravação só. NUNCA mexe na caixa do Banco: o Banco já zerou a conta, e o
   * que ainda esperava na caixa para ela o Banco recusa (conta inexistente) e sai da fila. Devolve quantas carteiras existiam. Quem está
   * sentado numa sala com ela vê o saldo sumir (`carteiraMudou`).
   */
  apagarDasContas(ids: Iterable<string>, ate?: number): number {
    if (this.recusaPorEncerrado()) throw new Error('as carteiras estão fechando');
    const apagadas: string[] = [];
    let registrou = false;
    // `ate`: onde a varredura das excluídas parou; vai na MESMA gravação que as exclusões que ele cobre (L61b)
    if (ate !== undefined && ate !== this.ateDaVarredura) {
      this.ateDaVarredura = ate;
      this.ateSujo = true;
      registrou = true;
    }
    for (const id of ids) {
      // L61b: o `id` entra no registro dos excluídos na mesma gravação que apaga a carteira (e mesmo sem carteira, para ela nunca nascer)
      if (ID_VALIDO.test(id) && !this.excluidas.has(id)) {
        this.excluidas.add(id);
        if (this.rastreiaSujas) this.excluidasSujas.add(id);
        registrou = true;
      }
      this.resolverMarcaPendente(id, false);
      if (!this.carteiras.delete(id)) continue;
      this.versaoDoEspelho.set(id, (this.versaoDoEspelho.get(id) ?? 0) + 1);
      this.marcar(id);
      apagadas.push(id);
    }
    if (apagadas.length === 0) {
      if (registrou) this.persistir();
      return 0;
    }
    this.opcoes.log('carteiras-de-contas-apagadas', { apagadas: apagadas.length });
    this.mudou();
    for (const id of apagadas) this.avisar(id);
    return apagadas.length;
  }

  /** Onde a varredura das excluídas pelo portal parou (ms do Banco); 0 = nunca varreu. */
  get varridasAte(): number {
    return this.ateDaVarredura;
  }

  /** A conta `id` foi excluída (L61b)? Vale mesmo sem carteira aqui. */
  ehExcluida(id: string): boolean {
    return this.excluidas.has(id);
  }

  /** Quantas contas excluídas o registro guarda. */
  get totalExcluidas(): number {
    return this.excluidas.size;
  }

  /**
   * A marca `daConta` de `id` não pôde ser posta agora (L61b): fica pendente, persistida, e `tentarMarcasPendentes` (o alarm, o tique da
   * sala Node) a tenta de novo; `garantirDaConta` também a cumpre quando a sessão aparece. Vale com as carteiras congeladas (não mexe em
   * saldo). Conta já excluída não precisa de marca. Devolve se ficou registrada.
   */
  adiarMarca(id: string): boolean {
    if (!ID_VALIDO.test(id) || this.excluidas.has(id) || this.recusaPorEncerrado()) return false;
    if (!this.marcasPendentes.has(id)) {
      this.marcasPendentes.add(id);
      if (this.rastreiaSujas) this.marcasSujas.add(id);
      this.persistir();
    }
    this.aoAgendarCaixa();
    return true;
  }

  /** Quantas marcas `daConta` esperam nova tentativa. */
  get totalMarcasPendentes(): number {
    return this.marcasPendentes.size;
  }

  /** Tenta de novo cada marca pendente; devolve quantas foram postas. Carteira que não existe (ainda) deixa de ser pendente: `garantirDaConta` marca quando ela nascer. */
  tentarMarcasPendentes(): number {
    if (this.marcasPendentes.size === 0) return 0;
    let postas = 0;
    for (const id of [...this.marcasPendentes]) {
      try {
        if (this.carteiras.has(id) && this.marcarDaConta(id)) postas++;
        this.resolverMarcaPendente(id);
      } catch {
        // continua pendente: a próxima tentativa repete
      }
    }
    if (postas > 0) this.opcoes.log('marcas-da-conta-postas', { postas });
    return postas;
  }

  /** `id` deixa de ser pendente (a marca foi posta, a carteira não existe ou a conta foi excluída). `gravar`: quem chamou grava depois, sem precisar de outra `persistir()`. */
  private resolverMarcaPendente(id: string, gravar = true): void {
    if (!this.marcasPendentes.delete(id)) return;
    if (this.rastreiaSujas) this.marcasSujas.add(id);
    if (gravar) this.persistir();
  }

  /**
   * O presente de teste (L34c): soma o valor ao saldo e marca o rótulo na carteira, juntos e sem `await` no meio (tudo ou nada: ou
   * as duas coisas, ou nenhuma). Uma vez por rótulo, nunca duas, venha de onde vier (duas abas, duas salas); rótulo novo paga de
   * novo. Desligado, ou com o armazém fechando, não faz nada. O log diz o valor e o rótulo, nunca o código nem o `id`.
   */
  private presentear(id: string): void {
    const presente = this.opcoes.presenteDeTeste;
    if (!presente || this.encerrado || this.congelada) return;
    const c = this.carteiras.get(id);
    if (!c || (c.presentes !== undefined && Object.hasOwn(c.presentes, presente.rotulo))) return;
    if (!Number.isSafeInteger(c.saldo + presente.valor)) return;
    c.saldo += presente.valor;
    c.presentes = { ...c.presentes, [presente.rotulo]: presente.valor };
    this.opcoes.log('presente', { apelido: this.apelidoDe(id), valor: presente.valor, rotulo: presente.rotulo });
    if (this.caixa) this.empilhar({ tipo: 'creditar', id, valor: presente.valor, chave: chaveDoPresente(presente.rotulo, id), motivo: 'presente' });
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
    if (this.recusaLocalComBanco()) return { ok: false, erro: 'fora-do-ar' };
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    if (this.recusaPorCongelada()) return { ok: false, erro: 'congelado' };
    const conf = this.conferirSkin(id, skin, precoVisto);
    if (!conf.ok) return conf;
    const { c, preco } = conf;
    if (c.saldo < preco) return { ok: false, erro: 'saldo-insuficiente' };
    const semente = this.novaSemente(); // antes de mexer em qualquer coisa
    c.saldo -= preco;
    this.darSkin(id, c, conf.skin, preco, semente);
    this.marcar(id);
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /** As conferências da compra de uma skin que não dependem do saldo: carteira, skin, `ja-tem` e `preco-mudou` (nessa ordem). */
  private conferirSkin(id: string, skin: string, precoVisto: number | undefined): { ok: true; c: Guardada; preco: number; skin: SkinTaco } | { ok: false; erro: ErroDeLoja } {
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    if (!ehSkinDeTaco(skin)) return { ok: false, erro: 'skin-invalida' };
    if (c.itens.some((i) => i.skin === skin)) return { ok: false, erro: 'ja-tem' };
    const preco = precoDaSkinNoDia(skin, diaDaMissao(this.opcoes.relogio()));
    if (precoVisto !== undefined && !(preco <= precoVisto)) return { ok: false, erro: 'preco-mudou' };
    return { ok: true, c, preco, skin };
  }

  /** Põe o taco na carteira (o saldo é de quem chama) e loga a compra. */
  private darSkin(id: string, c: Guardada, skin: SkinTaco, preco: number, semente: number): void {
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
  }

  /**
   * A compra de uma skin que o HTTP chama (L59). Sem o Banco é a `comprar` de sempre. Com `SALDO_NO_BANCO=1` o piso é o do Banco: a
   * conferência local (carteira, skin, `ja-tem`, `preco-mudou`) vale, o saldo não, e o item só é dado depois de o `debitar` voltar
   * `ok` (`compraNoBanco`). `fora-do-ar`: o Banco não respondeu, nada foi dado.
   */
  comprarSkin(id: string, skin: string, origem?: unknown, precoVisto?: number): Promise<ResultadoDeLoja> {
    if (!this.caixa) return Promise.resolve(this.comprar(id, skin, origem, precoVisto));
    return this.naFilaDaConta(id, () => this.compraNoBanco(id, { tipo: 'skin', item: skin }, origem, precoVisto));
  }

  /** O mesmo para um item do balão (`comprarItemDoBalao` sem o Banco). */
  comprarItemDoBalaoNoBanco(id: string, item: string, origem?: unknown, precoVisto?: number): Promise<ResultadoDeLoja> {
    if (!this.caixa) return Promise.resolve(this.comprarItemDoBalao(id, item, origem, precoVisto));
    return this.naFilaDaConta(id, () => this.compraNoBanco(id, { tipo: 'balao', item }, origem, precoVisto));
  }

  /** Com o Banco ligado a compra síncrona deixaria o espelho sem o débito; fica recusada (o HTTP usa as versões que esperam o Banco). */
  private recusaLocalComBanco(): boolean {
    if (!this.caixa) return false;
    this.opcoes.log('compra-local-recusada');
    return true;
  }

  /** Põe em uso uma skin que a carteira tem. */
  usar(id: string, skin: string, origem?: unknown): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    if (this.recusaPorCongelada()) return { ok: false, erro: 'congelado' };
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
    if (this.recusaLocalComBanco()) return { ok: false, erro: 'fora-do-ar' };
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    if (this.recusaPorCongelada()) return { ok: false, erro: 'congelado' };
    const conf = this.conferirItemDoBalao(id, item, precoVisto);
    if (!conf.ok) return conf;
    const { c, preco, item: id2 } = conf;
    if (c.saldo < preco) return { ok: false, erro: 'saldo-insuficiente' };
    c.saldo -= preco;
    this.darItemDoBalao(id, c, id2, preco);
    this.marcar(id);
    this.mudou(id, origem);
    return { ok: true, estado: this.ler(id)! };
  }

  /** As conferências da compra de um item do balão que não dependem do saldo: carteira, item, `ja-tem` (grátis também) e `preco-mudou`. */
  private conferirItemDoBalao(id: string, item: string, precoVisto: number | undefined): { ok: true; c: Guardada; preco: number; item: IdItemDoBalao } | { ok: false; erro: ErroDeLoja } {
    const c = this.carteiras.get(id);
    if (!c) return { ok: false, erro: 'carteira-invalida' };
    if (!ehIdDeItemDoBalao(item)) return { ok: false, erro: 'item-invalido' };
    const preco = precoDoItemDoBalao(item);
    if (preco === 0 || c.balao?.itens.includes(item)) return { ok: false, erro: 'ja-tem' };
    if (precoVisto !== undefined && !(preco <= precoVisto)) return { ok: false, erro: 'preco-mudou' };
    return { ok: true, c, preco, item };
  }

  /** Põe o item pago na carteira (o saldo é de quem chama) e loga a compra. */
  private darItemDoBalao(id: string, c: Guardada, item: IdItemDoBalao, preco: number): void {
    c.balao = { itens: itensPagosEmOrdem([...(c.balao?.itens ?? []), item]), aparencia: c.balao?.aparencia ?? { ...APARENCIA_PADRAO } };
    this.opcoes.log('compra-balao', { apelido: this.apelidoDe(id), item, tipo: itemDoBalao(item).tipo, preco });
  }

  // ---------------------------------------------------------------- a compra pelo Banco (L59)

  /** As compras de uma mesma conta andam uma de cada vez. */
  private naFilaDaConta<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const anterior = this.filasDeCompra.get(id) ?? Promise.resolve();
    const atual = anterior.then(fn);
    const guardada = atual.then(
      () => undefined,
      () => undefined,
    );
    this.filasDeCompra.set(id, guardada);
    void guardada.then(() => {
      if (this.filasDeCompra.get(id) !== guardada) return;
      this.filasDeCompra.delete(id);
      // a compra viu escrita concorrente na conta e não usou o saldo da resposta: com a fila vazia, o espelho é relido
      if (this.relerDepoisDaFila.delete(id)) void this.reler(id);
    });
    return atual;
  }

  private jaTemOItem(c: Guardada, tipo: TipoDeCompra, item: string): boolean {
    return tipo === 'skin' ? c.itens.some((i) => i.skin === item) : (c.balao?.itens as readonly string[] | undefined)?.includes(item) === true;
  }

  private conferirCompra(id: string, tipo: TipoDeCompra, item: string, precoVisto: number | undefined): { ok: true; c: Guardada; preco: number } | { ok: false; erro: ErroDeLoja } {
    return tipo === 'skin' ? this.conferirSkin(id, item, precoVisto) : this.conferirItemDoBalao(id, item, precoVisto);
  }

  /** Dá o item de uma compra paga (sem mexer no saldo). Quem chama já conferiu que a carteira não o tem. */
  private entregarCompra(id: string, c: Guardada, tipo: TipoDeCompra, item: string, preco: number): void {
    if (tipo === 'skin') this.darSkin(id, c, item as SkinTaco, preco, this.novaSemente());
    else this.darItemDoBalao(id, c, item as IdItemDoBalao, preco);
  }

  /**
   * A compra com `SALDO_NO_BANCO=1`. Ordem, que é a garantia de nunca cobrar sem dar nem dar sem cobrar:
   * 1. conferência local (sem o saldo: o piso é o do Banco) e a caixa em ordem (o Banco precisa da conta e dos créditos antes de debitar);
   * 2. grava a pendência (chave, quem, o quê, preço) na persistência das carteiras;
   * 3. `debitar` no Banco; SÓ com `ok` o item é dado, o espelho recebe o saldo devolvido e a pendência sai, numa gravação só;
   * 4. recusa do Banco: a pendência sai e o erro é o de hoje (`saldo-insuficiente`); exceção (Banco fora do ar): a pendência fica e
   *    nada é dado (`fora-do-ar`), e `reconciliarCompras` fecha a janela depois (`anularSeNaoFeita`): o débito aconteceu, ou nunca mais acontece.
   * Uma pendência velha da mesma coisa é resolvida antes de cobrar de novo, para a retentativa nunca cobrar duas vezes.
   */
  private async compraNoBanco(id: string, alvo: { tipo: TipoDeCompra; item: string }, origem: unknown, precoVisto: number | undefined): Promise<ResultadoDeLoja> {
    const { tipo, item } = alvo;
    const compras = this.compras!;
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    if (this.recusaPorCongelada()) return { ok: false, erro: 'congelado' };
    const velha = compras.doItem(id, tipo, item);
    if (velha) {
      if (this.comprasEmVoo.has(velha.chave) || (await this.reconciliar(velha)) === 'fora-do-ar') return { ok: false, erro: 'fora-do-ar' };
    }
    let conf = this.conferirCompra(id, tipo, item, precoVisto);
    if (!conf.ok) return conf;
    await (this.despachante?.drenar() ?? Promise.resolve());
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    if (this.recusaPorCongelada()) return { ok: false, erro: 'congelado' };
    if (this.caixaToca(id)) return { ok: false, erro: 'fora-do-ar' }; // o Banco ainda não tem tudo desta conta
    conf = this.conferirCompra(id, tipo, item, precoVisto);
    if (!conf.ok) return conf;
    const preco = conf.preco;

    const agora = this.opcoes.relogio();
    const chave = chaveDaCompra(id, agora, (this.opcoes.sortearChave ?? sorteioDaChave)());
    this.comprasEmVoo.set(chave, id); // a partir daqui a caixa segura as operações desta conta até o débito terminar
    compras.adicionar({ chave, id, tipo, item, preco, criadaEm: agora });
    this.persistir();
    this.aoAgendarCaixa();
    if (!(await this.garantirGravada(chave))) {
      compras.apagar(chave);
      this.soltarCompra(chave);
      this.persistir();
      this.opcoes.log('compra-sem-gravacao', { conta: oito(id) });
      return { ok: false, erro: 'fora-do-ar' };
    }

    return this.debitarEConcluir(id, alvo, chave, preco, origem);
  }

  /**
   * O débito e o que vem depois (L59). A chave fica em `comprasEmVoo` (e a caixa segura as operações da conta) até aqui terminar, de
   * qualquer jeito: resposta, recusa, exceção ou prazo vencido (15 s, aí fica só a pendência, que a lápide do Banco resolve depois).
   */
  private async debitarEConcluir(id: string, alvo: { tipo: TipoDeCompra; item: string }, chave: string, preco: number, origem: unknown): Promise<ResultadoDeLoja> {
    const { tipo, item } = alvo;
    const banco = this.opcoes.banco!;
    const compras = this.compras!;
    try {
      const versaoAntes = this.versaoDoEspelho.get(id) ?? 0;
      const chamada = (async () => banco.debitar(id, preco, chave, { jogo: JOGO_NO_BANCO, motivo: 'compra' }))();
      let resultado: ResultadoDeMoeda;
      try {
        resultado = await comTempo(chamada, TEMPO_DO_DEBITO_MS);
      } catch (e) {
        if (e instanceof RangeError) {
          // argumento mal formado: o Banco nem olhou; nada foi cobrado
          compras.apagar(chave);
          this.persistir();
          this.opcoes.log('banco-recusou', { tipo: 'compra', erro: 'argumento-invalido', conta: oito(id) });
        } else {
          this.logarBancoFora('compra', e);
        }
        return { ok: false, erro: 'fora-do-ar' };
      }
      // fechando: a pendência já está no armazenamento e a próxima subida pergunta ao Banco
      if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };

      if (!resultado.ok) {
        compras.apagar(chave);
        this.persistir();
        if (resultado.erro === 'saldo-insuficiente') return { ok: false, erro: 'saldo-insuficiente' };
        this.opcoes.log('banco-recusou', { tipo: 'compra', erro: resultado.erro, conta: oito(id) });
        return { ok: false, erro: 'fora-do-ar' };
      }

      // o débito aconteceu: o item, o espelho e o fim da pendência vão juntos
      const c = this.carteiras.get(id);
      if (c && !this.jaTemOItem(c, tipo, item)) this.entregarCompra(id, c, tipo, item, preco);
      const saldo = resultado.saldos[id];
      // escrita concorrente na conta durante o débito (o espelho mudou por outro caminho, ou há operação dela na caixa): a resposta é velha, não vale
      const concorrente = (this.versaoDoEspelho.get(id) ?? 0) !== versaoAntes || this.caixaToca(id);
      if (c && saldo !== undefined && !concorrente) {
        const novo = saldo + this.aindaNaCaixaPara(id);
        if (Number.isSafeInteger(novo)) c.saldo = novo;
      }
      if (concorrente) this.relerDepoisDaFila.add(id);
      compras.apagar(chave);
      this.versaoDoEspelho.set(id, (this.versaoDoEspelho.get(id) ?? 0) + 1);
      this.marcar(id);
      this.mudou(id, origem);
      this.aoAgendarCaixa();
      return c ? { ok: true, estado: this.ler(id)! } : { ok: false, erro: 'carteira-invalida' };
    } finally {
      this.soltarCompra(chave);
    }
  }

  /** A chamada do débito terminou (ou venceu o prazo): a chave sai do voo e a caixa solta as operações da conta que esperavam. */
  private soltarCompra(chave: string): void {
    if (!this.comprasEmVoo.delete(chave)) return;
    if (this.caixa && !this.caixa.vazia) this.despachante?.cutucar();
  }

  /** Alguma operação na caixa mexe nesta conta. */
  private caixaToca(id: string): boolean {
    for (const { op } of this.caixa?.entradas ?? []) {
      if (op.tipo === 'garantir' || op.tipo === 'creditar') {
        if (op.id === id) return true;
      } else if (op.tipo === 'reservar') {
        if (op.lote.some((x) => x.id === id)) return true;
      } else if (op.tipo === 'liquidar') {
        if (op.variacoes.some((v) => v.id === id)) return true;
      }
    }
    return false;
  }

  /** "O Banco não respondeu": o mesmo log da caixa (`banco-fora`), sem chave nem `id`. */
  private logarBancoFora(tipo: string, e: unknown): void {
    this.opcoes.log('banco-fora', { tipo, erro: e instanceof Error ? e.message.slice(0, 100) : 'desconhecido' });
  }

  /**
   * Confere as compras pendentes com o Banco (ao abrir o armazém, no alarm, antes de cobrar a mesma coisa de novo). Uma pendência de
   * cada vez; a chamada que ainda está em voo NESTE objeto é deixada em paz (esperar a resposta dela é melhor que anular). Se o
   * objeto caiu com o débito ainda a caminho, a lápide do Banco (`anularSeNaoFeita`) garante que ele não cobra depois. Falha do Banco: espera 5 s, 10 s, 20 s... até 5 min.
   */
  reconciliarCompras(): Promise<void> {
    if (!this.compras || this.compras.vazia || this.encerrado) return Promise.resolve();
    if (this.reconciliando) return this.reconciliando;
    if (this.opcoes.relogio() < this.esperaDeCompraAte) {
      this.aoAgendarCaixa();
      return Promise.resolve();
    }
    this.reconciliando = this.passarPelasCompras()
      .catch((e: unknown) => this.opcoes.log('erro-interno', { tipo: 'compras-pendentes', erro: e instanceof Error ? e.message.slice(0, 100) : 'desconhecido' }))
      .finally(() => {
        this.reconciliando = null;
        this.aoAgendarCaixa();
      });
    return this.reconciliando;
  }

  private async passarPelasCompras(): Promise<void> {
    for (const p of this.compras!.lista) {
      if (this.encerrado) return;
      if (this.comprasEmVoo.has(p.chave)) continue;
      if ((await this.reconciliar(p)) === 'fora-do-ar') {
        this.falhasDeCompra++;
        this.esperaDeCompraAte = this.opcoes.relogio() + esperaDepoisDeFalhar(this.falhasDeCompra);
        return;
      }
    }
    this.falhasDeCompra = 0;
    this.esperaDeCompraAte = 0;
  }

  /**
   * Fecha a pendência `p.chave` no Banco com a lápide (`anularSeNaoFeita`), numa transação do lado dele. Débito já aplicado (`feita`):
   * dá o item (se a carteira ainda não o tem) e apaga a pendência. Não aplicado (`anulada`): o Banco guarda a lápide, e um débito que
   * ainda esteja a caminho com essa chave é recusado (`chave-reusada`); a pendência é apagada, sem estornar nem dar nada. Sem
   * resposta: fica (e, com mais de 1 h, loga `compra-pendente-velha`).
   */
  private async reconciliar(p: CompraPendente): Promise<'resolvida' | 'fora-do-ar'> {
    let r: Awaited<ReturnType<BancoDaSala['anularSeNaoFeita']>>;
    try {
      r = await comTempo((async () => this.opcoes.banco!.anularSeNaoFeita(p.chave))(), TEMPO_DA_LEITURA_MS);
    } catch (e) {
      const velhice = this.opcoes.relogio() - p.criadaEm;
      if (velhice > UMA_HORA_MS) this.opcoes.log('compra-pendente-velha', { conta: oito(p.id), horas: Math.floor(velhice / UMA_HORA_MS) });
      this.logarBancoFora('compra-pendente', e);
      return 'fora-do-ar';
    }
    // enquanto esperava, outro caminho pode ter resolvido (ou o armazém fechou)
    if (this.encerrado || this.compras!.buscar(p.chave) === undefined) return 'resolvida';
    if ('anulada' in r || !r.feita.ok) {
      this.compras!.apagar(p.chave);
      this.persistir();
      this.opcoes.log('compra-pendente-descartada', { conta: oito(p.id), motivo: 'nunca-aplicada' });
      return 'resolvida';
    }
    const c = this.carteiras.get(p.id);
    if (c && !this.jaTemOItem(c, p.tipo, p.item)) this.entregarCompra(p.id, c, p.tipo, p.item, p.preco);
    this.compras!.apagar(p.chave);
    this.versaoDoEspelho.set(p.id, (this.versaoDoEspelho.get(p.id) ?? 0) + 1);
    this.marcar(p.id);
    this.mudou(p.id);
    this.opcoes.log('compra-pendente-entregue', { conta: oito(p.id), tipo: p.tipo });
    void this.reler(p.id); // o saldo que a resposta antiga guardou pode já ter mudado: o espelho pergunta de novo
    return 'resolvida';
  }

  // ---------------------------------------------------------------- o espelho relido (L59)

  /**
   * Pergunta o saldo de `id` ao Banco e põe no espelho (mais o que ainda espera na caixa para a conta), porque outro jogo pode ter
   * gastado ou ganho. O espelho só mostra: nunca escreve no Banco, e o piso de qualquer compra é o do Banco. Se mudou, grava e avisa as
   * salas (o `estado-sala` sai de novo). Nunca lança: Banco fora do ar deixa o espelho como está (log no máximo uma vez por minuto).
   * A leitura é descartada se, enquanto esperava, a caixa respondeu por essa conta, uma compra mexeu nela, ou a caixa ainda tem
   * operação dela (então o próprio Banco a trará com a conta certa). Devolve se o espelho mudou.
   */
  async reler(id: string): Promise<boolean> {
    if (!this.caixa || this.encerrado || this.congelada || !this.carteiras.has(id)) return false;
    const antes = this.versaoDoEspelho.get(id) ?? 0;
    let saldo: Awaited<ReturnType<BancoDaSala['saldo']>>;
    try {
      saldo = await comTempo((async () => this.opcoes.banco!.saldo(id))(), TEMPO_DA_LEITURA_MS);
    } catch (e) {
      const agora = this.opcoes.relogio();
      if (agora - this.ultimoLogDeLeitura >= INTERVALO_DO_LOG_DE_LEITURA_MS) {
        this.ultimoLogDeLeitura = agora;
        this.logarBancoFora('saldo', e);
      }
      return false;
    }
    const c = this.carteiras.get(id);
    if (saldo === null || !c || this.encerrado) return false; // conta que o Banco não tem (antes da migração): fica o espelho
    if ((this.versaoDoEspelho.get(id) ?? 0) !== antes || this.filasDeCompra.has(id) || this.caixaToca(id)) return false;
    const novo = saldo.saldo + this.aindaNaCaixaPara(id);
    if (!Number.isSafeInteger(novo) || novo === c.saldo) return false;
    c.saldo = novo;
    this.versaoDoEspelho.set(id, antes + 1);
    this.marcar(id);
    this.opcoes.log('banco-espelho-corrigido', { contas: 1 });
    this.mudou(id);
    return true;
  }

  /**
   * Põe em uso uma aparência do balão (L47): a aparência INTEIRA, de uma vez. Tudo ou nada: se algum campo não vale (id que não
   * existe, de outro tipo, campo faltando ou a mais) é `aparencia-invalida`, e se algum item pago não é da carteira é `nao-tem`; em
   * ambos nada muda, nem os campos que valiam. Os itens grátis todo mundo equipa. Pedir a aparência que já está em uso é `ok` e não
   * grava nem avisa ninguém. A aparência é sempre a desta carteira: não há como equipar a de outra.
   */
  equiparAparencia(id: string, aparencia: unknown, origem?: unknown): ResultadoDeLoja {
    if (this.recusaPorEncerrado()) return { ok: false, erro: 'encerrado' };
    if (this.recusaPorCongelada()) return { ok: false, erro: 'congelado' };
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
   *
   * `chaveDaAposta` (L57) é a chave com que a partida reservou no Banco (`reservarAposta`): com a caixa ligada, o dinheiro que muda de
   * mãos vira um `liquidar` com ela na MESMA gravação. Com a caixa ligada e variação sem chave a chamada é recusada (o espelho não
   * mexe no saldo sem deixar o Banco saber).
   */
  aplicar(variacoes: readonly Variacao[], origem?: unknown, partida: readonly EstatisticaDaPartida[] = [], chaveDaAposta?: string): boolean {
    if (this.recusaPorEncerrado() || this.recusaPorCongelada()) return false;
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
    const queMexem = alvos.filter((a) => a.delta !== 0);
    if (this.caixa && queMexem.length > 0 && chaveDaAposta === undefined) {
      this.opcoes.log('carteiras-variacao-recusada', { motivo: 'sem-chave-da-aposta' });
      return false;
    }
    if (this.caixa && chaveDaAposta !== undefined && queMexem.length > 0) {
      this.empilhar({ tipo: 'liquidar', chave: chaveDaAposta, variacoes: queMexem.map((a) => ({ id: a.id, delta: a.delta })) });
      this.fecharAposta(chaveDaAposta); // paga: a reserva sai pelo `liquidar`, não há mais o que devolver ao acordar
    }
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
    if (this.recusaPorEncerrado() || this.recusaPorCongelada()) return null;
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
    if (this.caixa) for (const m of cumpridas) this.empilhar({ tipo: 'creditar', id, valor: premioDaMissao(m), chave: chaveDaMissao(dia, m, id), motivo: 'missao' });
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

  /** Os espelhos de todas as carteiras (id e saldo), para a migração do saldo ao Banco (L60). Uma cópia: mexer nela não muda nada. */
  espelhos(): { id: string; saldo: number }[] {
    return [...this.carteiras].map(([id, c]) => ({ id, saldo: c.saldo }));
  }

  /**
   * Grava de uma vez o saldo de cada carteira de `novos` que existe e tem outro número, numa persistência só, e avisa quem olha (o
   * `estado-sala` sai de novo). É o caminho de volta da migração (`espelhar-saldos`): o espelho passa a ter o saldo do Banco. Devolve
   * quantas mudaram. O saldo pode ser negativo (perder aposta não tem piso, é regra do jogo); só o que não é inteiro seguro é ignorado.
   */
  trocarEspelhos(novos: ReadonlyMap<string, number>): number {
    if (this.recusaPorEncerrado()) return 0;
    const mudaram: string[] = [];
    for (const [id, saldo] of novos) {
      const c = this.carteiras.get(id);
      if (!c || !Number.isSafeInteger(saldo) || c.saldo === saldo) continue;
      c.saldo = saldo;
      this.versaoDoEspelho.set(id, (this.versaoDoEspelho.get(id) ?? 0) + 1);
      this.marcar(id);
      mudaram.push(id);
    }
    if (mudaram.length === 0) return 0;
    this.opcoes.log('espelhos-trocados', { contas: mudaram.length });
    this.mudou();
    for (const id of mudaram) this.avisar(id);
    return mudaram.length;
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
    // L61b: uma cópia anterior ao L61 não traz as marcas `daConta`; quem já era de conta continua sendo (o código não volta a abrir a carteira da conta)
    const jaEraDaConta = new Set(this.idsDaConta());
    this.carteiras.clear();
    for (const [id, c] of lidas.carteiras) {
      if (jaEraDaConta.has(id)) c.daConta = true;
      this.carteiras.set(id, c);
    }
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
    return JSON.stringify({ ...this.paraOArquivo(), baloes: this.baloesParaGuardar(), ...(this.idsDaConta().length > 0 ? { daConta: this.idsDaConta() } : {}), carteiras_descartadas: this.descartadas() });
  }

  /** O `{ versao, carteiras }` que a sala Node grava em `carteiras.json`: só o que a versão anterior lê, sem balão. */
  protected paraOArquivo(comSaida = false): {
    versao: number;
    carteiras: Record<string, Omit<Guardada, 'balao' | 'daConta'>>;
    saida?: ReturnType<CaixaDeSaida['paraOArquivo']>;
    daConta?: string[];
    compras?: ReturnType<ComprasPendentes['paraOArquivo']>;
    mortas?: ReturnType<CaixaDeSaida['paraOArquivoDasMortas']>;
    apostas?: string[];
    excluidas?: string[];
    marcasPendentes?: string[];
  } {
    const carteiras: Record<string, Omit<Guardada, 'balao' | 'daConta'>> = {};
    for (const [id, c] of this.carteiras) carteiras[id] = linhaDaCarteira(c);
    // Os campos `saida` e `compras` (versão 3) só existem enquanto há o que enviar ou conferir com o Banco: sem nada o arquivo segue sendo o da versão 2, que a anterior abre.
    const saida = comSaida && this.caixa && !this.caixa.vazia ? this.caixa.paraOArquivo() : null;
    const compras = comSaida && this.compras && !this.compras.vazia ? this.compras.paraOArquivo() : null;
    const mortas = comSaida && this.caixa && this.caixa.mortas.length > 0 ? this.caixa.paraOArquivoDasMortas() : null;
    const apostas = comSaida && this.caixa && this.apostasAbertas.size > 0 ? [...this.apostasAbertas] : null;
    // L61: as carteiras de conta (`daConta`) também fazem o arquivo ser o da versão 3, que a versão anterior não abre (ela não saberia que o código não basta)
    const daConta = comSaida ? this.idsDaConta() : [];
    // L61b: o registro dos excluídos e as marcas pendentes também (a versão anterior não os conheceria)
    const excluidas = comSaida ? [...this.excluidas].sort() : [];
    const marcasPendentes = comSaida ? [...this.marcasPendentes].sort() : [];
    if (saida !== null || compras !== null || mortas !== null || apostas !== null || daConta.length > 0 || excluidas.length > 0 || marcasPendentes.length > 0) {
      return {
        versao: VERSAO_DO_ARQUIVO_COM_SAIDA,
        carteiras,
        ...(daConta.length > 0 ? { daConta } : {}),
        ...(saida !== null ? { saida } : {}),
        ...(compras !== null ? { compras } : {}),
        ...(mortas !== null ? { mortas } : {}),
        ...(apostas !== null ? { apostas } : {}),
        ...(excluidas.length > 0 ? { excluidas } : {}),
        ...(marcasPendentes.length > 0 ? { marcasPendentes } : {}),
      };
    }
    return { versao: VERSAO_DO_ARQUIVO, carteiras };
  }

  /** Traz de um arquivo (sala Node) o registro dos excluídos e as marcas pendentes (L61b). Valor que não presta é ignorado; o que já existe fica. */
  protected carregarContas(excluidas: unknown, marcasPendentes: unknown): void {
    if (Array.isArray(excluidas)) for (const id of excluidas) if (typeof id === 'string' && ID_VALIDO.test(id)) this.excluidas.add(id);
    if (Array.isArray(marcasPendentes)) for (const id of marcasPendentes) if (typeof id === 'string' && ID_VALIDO.test(id) && !this.excluidas.has(id)) this.marcasPendentes.add(id);
  }

  /** Quantas carteiras são de conta (`daConta`). */
  get totalDaConta(): number {
    return this.idsDaConta().length;
  }

  protected idsDaConta(): string[] {
    const ids: string[] = [];
    for (const [id, c] of this.carteiras) if (c.daConta) ids.push(id);
    return ids.sort();
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
  protected interpretar(bruto: string): { carteiras: Map<string, Guardada>; descartadas: number; migradas: number; saida: unknown; compras: unknown; mortas: unknown; apostas: unknown; excluidas: unknown; marcasPendentes: unknown } | null {
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
    if (Array.isArray(dado.daConta)) aplicarDaConta(dado.daConta, lidas);
    return { carteiras: lidas, descartadas, migradas, saida: dado.saida, compras: dado.compras, mortas: dado.mortas, apostas: dado.apostas, excluidas: dado.excluidas, marcasPendentes: dado.marcasPendentes };
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
