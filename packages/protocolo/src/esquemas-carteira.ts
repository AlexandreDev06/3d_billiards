/**
 * Esquemas da carteira (L22): as peças que as mensagens do WebSocket reaproveitam (`carteira`, `aposta`, saldo, skin) e os
 * corpos e respostas do HTTP de `/carteira`. Quem manda o quê: o cliente valida o que a sala devolve com os `validar*`
 * daqui, e a sala valida o corpo que recebe com `validarPedidoDeSkin`.
 */
import {
  APOSTAS_DA_SALA,
  SKINS_DE_TACO,
  SKIN_PADRAO,
  TAMANHO_CODIGO_CARTEIRA,
  type CarteiraCriada,
  type CodigoErroCarteira,
  type EstadoCarteira,
  type ErroDaCarteira,
  type PedidoDeSkin,
} from './carteira';
import { MISSOES, ehDiaDaMissao, fimDoDia, missaoDoCatalogo, missoesDoDia, type ItemDeMissao, type MissoesDoDia } from './missoes';
import { aposValidar, booleano, lista, literal, numero, objeto, recusar, texto, unicos, validar, type Esquema, type Resultado } from './validacao';

/** O código secreto da carteira, na forma que a sala cria. Que ela exista é com a sala. */
export const codigoDaCarteira: Esquema<string> = texto({ min: TAMANHO_CODIGO_CARTEIRA, max: TAMANHO_CODIGO_CARTEIRA, padrao: /^[A-Za-z0-9_-]+$/ });

/** Uma skin do catálogo, comparada exatamente. */
export const skinDoCatalogo = literal(...SKINS_DE_TACO.map((s) => s.id));

/** Uma das apostas que o anfitrião pode escolher. */
export const apostaDaSala = literal(...APOSTAS_DA_SALA);

/** Saldo e variações são inteiros, com sinal, dentro do que um `number` conta sem perder unidade. */
export const valorEmMoedas: Esquema<number> = numero({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER, inteiro: true });

const skinsDaCarteira = unicos(lista(skinDoCatalogo, { min: 1, max: SKINS_DE_TACO.length }), (s) => s);

/** A lista de uma carteira sempre tem o clássico e a skin em uso está nela. */
const skinsEmOrdem = (e: Pick<EstadoCarteira, 'skins' | 'skin'>, c: string): void => {
  if (!e.skins.includes(SKIN_PADRAO)) recusar(`${c}.skins`, `precisa ter a skin ${SKIN_PADRAO}`);
  if (!e.skins.includes(e.skin)) recusar(`${c}.skin`, 'precisa ser uma das skins da carteira');
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

export const esquemaEstadoCarteira: Esquema<EstadoCarteira> = aposValidar(
  objeto({ saldo: valorEmMoedas, skins: skinsDaCarteira, skin: skinDoCatalogo }, { missoes: esquemaMissoesDoDia }),
  skinsEmOrdem,
);

export const esquemaCarteiraCriada: Esquema<CarteiraCriada> = aposValidar(
  objeto({ codigo: codigoDaCarteira, saldo: valorEmMoedas, skins: skinsDaCarteira, skin: skinDoCatalogo }, { missoes: esquemaMissoesDoDia }),
  skinsEmOrdem,
);

export const esquemaPedidoDeSkin: Esquema<PedidoDeSkin> = objeto({ skin: texto({ min: 1, max: 24 }) });

const CODIGOS_DO_ERRO_DA_CARTEIRA: readonly CodigoErroCarteira[] = [
  'carteira-invalida',
  'saldo-insuficiente',
  'skin-invalida',
  'ja-tem',
  'nao-tem',
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
export const validarErroDaCarteira = (valor: unknown): Resultado<ErroDaCarteira> => validar(esquemaErroDaCarteira, valor);
