/**
 * Esquemas da carteira (L22): as peças que as mensagens do WebSocket reaproveitam (`carteira`, `aposta`, saldo, skin) e os
 * corpos e respostas do HTTP de `/carteira`. Quem manda o quê: o cliente valida o que a sala devolve com os `validar*`
 * daqui, e a sala valida o corpo que recebe com `validarPedidoDeSkin`.
 */
import {
  IDS_DAS_CORES_DE_OLHO,
  IDS_DOS_BIGODES,
  IDS_DOS_CHAPEUS,
  IDS_DOS_ESTILOS_DE_OLHO,
  ITENS_DO_BALAO,
  ITENS_GRATIS_DO_BALAO,
  aparenciaCabeNosItens,
  ordemDoItemDoBalao,
  type AparenciaDoBalao,
  type EstadoDoBalao,
} from './balao';
import {
  APOSTAS_DA_SALA,
  SEMENTES_POR_ITEM,
  SKINS_DE_TACO,
  SKIN_PADRAO,
  TAMANHO_CODIGO_CARTEIRA,
  ordemDaSkin,
  type CarteiraCriada,
  type CodigoErroCarteira,
  type EstadoCarteira,
  type ErroDaCarteira,
  type ItemTaco,
  type PedidoDeItemDoBalao,
  type PedidoDeSkin,
} from './carteira';
import { totalDasModalidades, type ContagemDeEstatisticas, type EstatisticasDaCarteira, type ResumoDeEstatisticas } from './estatisticas';
import {
  MISSOES,
  SKINS_NA_VITRINE,
  ehDiaDaMissao,
  fimDoDia,
  missaoDoCatalogo,
  missoesDoDia,
  vitrineDoDia,
  type ItemDaVitrine,
  type ItemDeMissao,
  type MissoesDoDia,
  type VitrineDoDia,
} from './missoes';
import { MODALIDADES_DE_SALA } from './tipos';
import { aposValidar, booleano, lista, literal, nulavel, numero, objeto, recusar, texto, unicos, validar, type Esquema, type Resultado } from './validacao';

/** O código secreto da carteira, na forma que a sala cria. Que ela exista é com a sala. */
export const codigoDaCarteira: Esquema<string> = texto({ min: TAMANHO_CODIGO_CARTEIRA, max: TAMANHO_CODIGO_CARTEIRA, padrao: /^[A-Za-z0-9_-]+$/ });

/** Uma skin do catálogo, comparada exatamente. */
export const skinDoCatalogo = literal(...SKINS_DE_TACO.map((s) => s.id));

/** Uma das apostas que o anfitrião pode escolher. */
export const apostaDaSala = literal(...APOSTAS_DA_SALA);

/** O maior preço que um pedido ou a vitrine pode trazer (muito acima da skin mais cara do catálogo). */
const PRECO_MAXIMO = 1_000_000;

/** Saldo e variações são inteiros, com sinal, dentro do que um `number` conta sem perder unidade. */
export const valorEmMoedas: Esquema<number> = numero({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER, inteiro: true });

const skinsDaCarteira = unicos(lista(skinDoCatalogo, { min: 1, max: SKINS_DE_TACO.length }), (s) => s);

/** A semente de um taco (L34): inteiro de 0 a 999. */
export const sementeDoItem: Esquema<number> = numero({ min: 0, max: SEMENTES_POR_ITEM - 1, inteiro: true });

/** O contador de bolas de um taco. */
export const contadorDeBolas: Esquema<number> = numero({ min: 0, max: Number.MAX_SAFE_INTEGER, inteiro: true });

/** Um taco da carteira: a skin, a semente e o contador. */
export const esquemaItemTaco: Esquema<ItemTaco> = objeto({ skin: skinDoCatalogo, semente: sementeDoItem, bolas: contadorDeBolas });

const itensDaCarteira = unicos(lista(esquemaItemTaco, { min: 1, max: SKINS_DE_TACO.length }), (i) => i.skin);

/**
 * A lista de uma carteira sempre tem o clássico e a skin em uso está nela. Com `itens` (L34): eles estão na ordem da loja, têm
 * o clássico e as `skins` são as mesmas deles.
 */
const skinsEmOrdem = (e: Pick<EstadoCarteira, 'skins' | 'skin' | 'itens'>, c: string): void => {
  if (!e.skins.includes(SKIN_PADRAO)) recusar(`${c}.skins`, `precisa ter a skin ${SKIN_PADRAO}`);
  if (!e.skins.includes(e.skin)) recusar(`${c}.skin`, 'precisa ser uma das skins da carteira');
  if (e.itens === undefined) return;
  if (e.itens.some((i, k) => k > 0 && ordemDaSkin(i.skin) <= ordemDaSkin(e.itens![k - 1]!.skin))) recusar(`${c}.itens`, 'precisam estar na ordem da loja');
  if (e.itens.length !== e.skins.length || e.itens.some((i, k) => i.skin !== e.skins[k])) recusar(`${c}.itens`, 'precisam ser um por skin da carteira');
};

/** Um id do catálogo de missões, comparado exatamente. */
export const idDeMissao = literal(...MISSOES.map((m) => m.id));

const esquemaItemDeMissao: Esquema<ItemDeMissao> = aposValidar(
  objeto({
    id: idDeMissao,
    progresso: numero({ min: 0, max: 1000, inteiro: true }),
    meta: numero({ min: 1, max: 1000, inteiro: true }),
    cumprida: booleano,
  }),
  (i, c) => {
    if (i.meta !== missaoDoCatalogo(i.id).meta) recusar(`${c}.meta`, 'precisa ser a meta da missão no catálogo');
    if (i.progresso > i.meta) recusar(`${c}.progresso`, 'não pode passar da meta');
    if (i.cumprida !== i.progresso >= i.meta) recusar(`${c}.cumprida`, 'precisa valer só quando o progresso chega à meta');
  },
);

/** O quadro de missões de um dia: as 3 que o catálogo sorteia para o `dia`, na ordem, com o fim do dia certo. */
export const esquemaMissoesDoDia: Esquema<MissoesDoDia> = aposValidar(
  objeto({
    dia: texto({ min: 10, max: 10 }),
    fimMs: numero({ min: 0, max: Number.MAX_SAFE_INTEGER, inteiro: true }),
    itens: unicos(lista(esquemaItemDeMissao, { min: 1, max: MISSOES.length }), (i) => i.id),
  }),
  (m, c) => {
    if (!ehDiaDaMissao(m.dia)) return recusar(`${c}.dia`, 'precisa ser uma data AAAA-MM-DD');
    if (m.fimMs !== fimDoDia(m.dia)) recusar(`${c}.fimMs`, 'precisa ser o fim do dia');
    const doDia = missoesDoDia(m.dia).map((x) => x.id);
    if (m.itens.length !== doDia.length || m.itens.some((i, k) => i.id !== doDia[k])) recusar(`${c}.itens`, 'precisam ser as missões sorteadas para o dia');
  },
);

const esquemaItemDaVitrine: Esquema<ItemDaVitrine> = aposValidar(
  objeto({ skin: skinDoCatalogo, precoCheio: numero({ min: 1, max: PRECO_MAXIMO, inteiro: true }), preco: numero({ min: 1, max: PRECO_MAXIMO, inteiro: true }) }),
  (i, c) => {
    const doCatalogo = SKINS_DE_TACO.find((s) => s.id === i.skin)!;
    if (i.precoCheio !== doCatalogo.preco) recusar(`${c}.precoCheio`, 'precisa ser o preço da skin no catálogo');
  },
);

/** A vitrine de um dia: as skins, o desconto e o preço de cada uma são os que o catálogo e o sorteio dão para o `dia`. */
export const esquemaVitrineDoDia: Esquema<VitrineDoDia> = aposValidar(
  objeto({
    dia: texto({ min: 10, max: 10 }),
    fimMs: numero({ min: 0, max: Number.MAX_SAFE_INTEGER, inteiro: true }),
    desconto: numero({ min: 0, max: 100, inteiro: true }),
    itens: unicos(lista(esquemaItemDaVitrine, { min: 1, max: SKINS_NA_VITRINE }), (i) => i.skin),
  }),
  (v, c) => {
    if (!ehDiaDaMissao(v.dia)) return recusar(`${c}.dia`, 'precisa ser uma data AAAA-MM-DD');
    const certa = vitrineDoDia(v.dia);
    if (v.fimMs !== certa.fimMs) recusar(`${c}.fimMs`, 'precisa ser o fim do dia');
    if (v.desconto !== certa.desconto) recusar(`${c}.desconto`, 'precisa ser o desconto da vitrine');
    if (v.itens.length !== certa.itens.length || v.itens.some((i, k) => i.skin !== certa.itens[k]!.skin || i.preco !== certa.itens[k]!.preco)) {
      recusar(`${c}.itens`, 'precisam ser as skins e os preços sorteados para o dia');
    }
  },
);

// ---------------------------------------------------------------- estatísticas (L38)

const naturalDaContagem = numero({ min: 0, max: Number.MAX_SAFE_INTEGER, inteiro: true });

/** Os 7 números de uma contagem, inteiros de 0 em diante; ninguém vence mais partidas do que jogou. */
const esquemaContagem: Esquema<ContagemDeEstatisticas> = aposValidar(
  objeto({
    partidas: naturalDaContagem,
    vitorias: naturalDaContagem,
    bolas: naturalDaContagem,
    sequencia: naturalDaContagem,
    tabeladas: naturalDaContagem,
    missoes: naturalDaContagem,
    moedas: naturalDaContagem,
  }),
  (c, caminho) => {
    if (c.vitorias > c.partidas) recusar(`${caminho}.vitorias`, 'não pode passar das partidas');
  },
);

/** A contagem de cada modalidade em que a carteira já jogou: só as que o catálogo da sala conhece. */
const esquemaContagemPorModalidade = objeto({}, Object.fromEntries(MODALIDADES_DE_SALA.map((m) => [m, esquemaContagem])));

/** O total é a soma das modalidades (a sequência, o maior valor delas): os dois nunca divergem, nem num dado que vem de fora. */
export const esquemaEstatisticasDaCarteira: Esquema<EstatisticasDaCarteira> = aposValidar(
  objeto({ total: esquemaContagem, modalidades: esquemaContagemPorModalidade }) as unknown as Esquema<EstatisticasDaCarteira>,
  (e, c) => {
    const certo = totalDasModalidades(e.modalidades);
    if (Object.keys(certo).some((chave) => certo[chave as keyof ContagemDeEstatisticas] !== e.total[chave as keyof ContagemDeEstatisticas])) {
      recusar(`${c}.total`, 'precisa ser a soma das modalidades');
    }
  },
);

/** O resumo público de um lugar da sala: partidas, vitórias e bolas. */
export const esquemaResumoDeEstatisticas: Esquema<ResumoDeEstatisticas> = aposValidar(
  objeto({ partidas: naturalDaContagem, vitorias: naturalDaContagem, bolas: naturalDaContagem }),
  (r, c) => {
    if (r.vitorias > r.partidas) recusar(`${c}.vitorias`, 'não pode passar das partidas');
  },
);

// ---------------------------------------------------------------- balão (L47)

/**
 * A aparência do balão: exatamente os quatro campos, cada um com um id do SEU tipo (bigode no campo do chapéu não passa). `chapeu`
 * e `bigode` aceitam `null` (sem o item), mas a chave precisa vir; `olhos` e `corDosOlhos` sempre têm um id.
 */
export const esquemaAparenciaDoBalao: Esquema<AparenciaDoBalao> = objeto({
  chapeu: nulavel(literal(...IDS_DOS_CHAPEUS)),
  bigode: nulavel(literal(...IDS_DOS_BIGODES)),
  olhos: literal(...IDS_DOS_ESTILOS_DE_OLHO),
  corDosOlhos: literal(...IDS_DAS_CORES_DE_OLHO),
});

const idDeItemDoBalao = literal(...ITENS_DO_BALAO.map((i) => i.id));

/**
 * O balão de uma carteira: a aparência e os itens que ela tem. Os itens vêm na ordem da loja, sem repetir, com os grátis, e a
 * aparência só usa o que está neles.
 */
export const esquemaEstadoDoBalao: Esquema<EstadoDoBalao> = aposValidar(
  objeto({ aparencia: esquemaAparenciaDoBalao, itens: unicos(lista(idDeItemDoBalao, { min: ITENS_GRATIS_DO_BALAO.length, max: ITENS_DO_BALAO.length }), (i) => i) }),
  (b, c) => {
    if (b.itens.some((id, k) => k > 0 && ordemDoItemDoBalao(id) <= ordemDoItemDoBalao(b.itens[k - 1]!))) recusar(`${c}.itens`, 'precisam estar na ordem da loja');
    if (!ITENS_GRATIS_DO_BALAO.every((id) => b.itens.includes(id))) recusar(`${c}.itens`, 'precisam ter os itens grátis');
    if (!aparenciaCabeNosItens(b.aparencia, b.itens)) recusar(`${c}.aparencia`, 'precisa usar só itens que a carteira tem');
  },
);

const camposOpcionaisDaCarteira = {
  itens: itensDaCarteira,
  vitrine: esquemaVitrineDoDia,
  missoes: esquemaMissoesDoDia,
  estatisticas: esquemaEstatisticasDaCarteira,
  balao: esquemaEstadoDoBalao,
};

export const esquemaEstadoCarteira: Esquema<EstadoCarteira> = aposValidar(
  objeto({ saldo: valorEmMoedas, skins: skinsDaCarteira, skin: skinDoCatalogo }, camposOpcionaisDaCarteira),
  skinsEmOrdem,
);

export const esquemaCarteiraCriada: Esquema<CarteiraCriada> = aposValidar(
  objeto({ codigo: codigoDaCarteira, saldo: valorEmMoedas, skins: skinsDaCarteira, skin: skinDoCatalogo }, camposOpcionaisDaCarteira),
  skinsEmOrdem,
);

export const esquemaPedidoDeSkin: Esquema<PedidoDeSkin> = objeto(
  { skin: texto({ min: 1, max: 24 }) },
  { preco: numero({ min: 1, max: PRECO_MAXIMO, inteiro: true }) },
);

/** O corpo de `POST /carteira/balao/comprar`: o id do item e, opcional, o preço que a tela mostrou (o teto). */
export const esquemaPedidoDeItemDoBalao: Esquema<PedidoDeItemDoBalao> = objeto(
  { item: texto({ min: 1, max: 24 }) },
  { preco: numero({ min: 1, max: PRECO_MAXIMO, inteiro: true }) },
);

/** O corpo de `POST /carteira/balao/equipar`: só a forma `{ aparencia }`; o que a aparência diz é conferido à parte (`validarAparenciaDoBalao`). */
export const esquemaPedidoDeAparencia: Esquema<{ readonly aparencia: unknown }> = objeto({ aparencia: (valor) => valor });

const CODIGOS_DO_ERRO_DA_CARTEIRA: readonly CodigoErroCarteira[] = [
  'carteira-invalida',
  'saldo-insuficiente',
  'skin-invalida',
  'ja-tem',
  'nao-tem',
  'preco-mudou',
  'item-invalido',
  'aparencia-invalida',
  'limite',
  'requisicao-invalida',
];

export const esquemaErroDaCarteira: Esquema<ErroDaCarteira> = objeto({
  erro: literal(...CODIGOS_DO_ERRO_DA_CARTEIRA),
  mensagem: texto({ max: 200 }),
});

export const validarEstadoDaCarteira = (valor: unknown): Resultado<EstadoCarteira> => validar(esquemaEstadoCarteira, valor);
export const validarCarteiraCriada = (valor: unknown): Resultado<CarteiraCriada> => validar(esquemaCarteiraCriada, valor);
export const validarPedidoDeSkin = (valor: unknown): Resultado<PedidoDeSkin> => validar(esquemaPedidoDeSkin, valor);
export const validarPedidoDeItemDoBalao = (valor: unknown): Resultado<PedidoDeItemDoBalao> => validar(esquemaPedidoDeItemDoBalao, valor);
export const validarPedidoDeAparencia = (valor: unknown): Resultado<{ readonly aparencia: unknown }> => validar(esquemaPedidoDeAparencia, valor);
/** A aparência é de verdade: quatro campos, cada id do seu tipo. Devolve uma cópia. */
export const validarAparenciaDoBalao = (valor: unknown): Resultado<AparenciaDoBalao> => validar(esquemaAparenciaDoBalao, valor);
export const validarErroDaCarteira = (valor: unknown): Resultado<ErroDaCarteira> => validar(esquemaErroDaCarteira, valor);
