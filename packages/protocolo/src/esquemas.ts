/**
 * Esquemas de validação de cada mensagem do contrato (`tipos.ts`). Valem para o
 * que chega pela rede: forma, tamanhos e faixas. Não substituem as conferências
 * de jogo da sala (vez, `seq`, regras) nem `coerenciaDaGravacao`.
 */
import type { EstadoMesa, Gravacao, ParametrosTacada } from '@sinuca/fisica';
import type { ConfigRegras, Consequencias, EstadoPartida, Modalidade } from '@sinuca/regras';
import { ALFABETO_CODIGO, LIMITES_PROTOCOLO as L, TAMANHO_CODIGO } from './limites';
import { LIMITES_GRAVACAO } from './gravacao-codec';
import { MISSOES } from './missoes';
import { apostaDaSala, codigoDaCarteira, esquemaMissoesDoDia, idDeMissao, skinDoCatalogo, valorEmMoedas } from './esquemas-carteira';
import {
  aposValidar,
  booleano,
  lista,
  literal,
  nulavel,
  numero,
  objeto,
  recusar,
  texto,
  unicos,
  validar,
  type Esquema,
  type Resultado,
} from './validacao';
import {
  EMOJIS_DA_SALA,
  FAIXAS_DO_GIZ_DA_SALA,
  FORCAS_DA_SALA,
  MODALIDADES_DE_SALA,
  MODALIDADE_PADRAO,
  MODOS_DE_SALA,
  MODOS_POR_MODALIDADE,
  TEMPOS_POR_TACADA_S,
  modoServeAModalidade,
  type CodigoErro,
  type GizSala,
  type LugarSala,
  type MensagemDaSala,
  type MensagemDoCliente,
  type MsgApostaPaga,
  type MsgBoasVindas,
  type MsgChat,
  type MsgChatRetransmitido,
  type MsgConfigurarSala,
  type MsgCriarSala,
  type MsgDiagnostico,
  type MsgEmoji,
  type MsgEmojiRetransmitido,
  type MsgEntrar,
  type MsgErro,
  type MsgEscolherLugar,
  type MsgEstadoSala,
  type MsgExpulsar,
  type MsgExpulso,
  type MsgIniciar,
  type MsgMira,
  type MsgMiraRetransmitida,
  type MsgMissoes,
  type MsgNovaPartida,
  type MsgPing,
  type MsgPong,
  type MsgRetrato,
  type MsgTacada,
  type MsgTacadaRetransmitida,
  type MsgTempoEsgotado,
  type MsgVoltarAoLobby,
  type ConfrontoPlacar,
  type LadoPlacar,
  type LinhaSala,
  type PlacarSala,
  type RelogioSala,
  type UltimaTacada,
  type VariacaoDaAposta,
} from './tipos';

const CODIGOS: Readonly<Record<CodigoErro, true>> = {
  versao: true,
  'mensagem-invalida': true,
  'mensagem-grande': true,
  'limite-mensagens': true,
  'sala-inexistente': true,
  'servidor-cheio': true,
  'sala-cheia': true,
  'nome-invalido': true,
  'token-invalido': true,
  'ja-na-sala': true,
  'fora-da-sala': true,
  'fase-errada': true,
  'lugar-invalido': true,
  'lugar-ocupado': true,
  'nao-anfitriao': true,
  'lugares-incompletos': true,
  'regras-invalidas': true,
  'nao-e-sua-vez': true,
  'seq-errado': true,
  'gravacao-invalida': true,
  'partida-diverge': true,
  'mesa-incoerente': true,
  'partida-acabou': true,
  'partida-em-andamento': true,
};
export const CODIGOS_DE_ERRO = Object.keys(CODIGOS) as CodigoErro[];

const inteiro = (min: number, max: number) => numero({ min, max, inteiro: true });
const idBola = inteiro(0, 15);
const lugar = inteiro(0, 3);
/** Equipe de 0 a 3: duas no par ou ímpar, até quatro (uma por pessoa) no mata-mata. */
const equipe = inteiro(0, 3);
const nome = texto({ min: 1, max: L.nome });
const coordenada = numero({ min: -L.coordenada, max: L.coordenada });
const unitario = numero({ min: -1, max: 1 });
const versao = inteiro(0, 1000);
const semente = inteiro(0, 2 ** 32 - 1);
/** Enumeração das regras que pode crescer sem quebrar o protocolo: só o formato é conferido aqui. */
const rotulo = texto({ min: 1, max: 40, padrao: /^[a-z0-9-]+$/ });
/** `ping.t`/`pong.t`: relativo ao início da conexão (ver `MsgPing`); o teto recusa o relógio de parede. */
const t = numero({ min: -1e12, max: 1e12 });

const tempoPorTacada = nulavel(literal(...TEMPOS_POR_TACADA_S));
const aoEsgotar = literal('perde-a-vez', 'falta');
const modoDaSala = literal(...MODOS_DE_SALA);
const modalidadeDaSala = literal(...MODALIDADES_DE_SALA);
const forcaDaSala = literal(...FORCAS_DA_SALA);
const esquemaRelogio: Esquema<RelogioSala> = objeto({ tempoS: tempoPorTacada, aoEsgotar });
const esquemaLinha: Esquema<LinhaSala> = objeto({ previsao: booleano }, { bolaAtingida: booleano });

const desgasteDoGiz = numero({ min: FAIXAS_DO_GIZ_DA_SALA.desgaste.min, max: FAIXAS_DO_GIZ_DA_SALA.desgaste.max });
const passadaDoGiz = numero({ min: FAIXAS_DO_GIZ_DA_SALA.passada.min, max: FAIXAS_DO_GIZ_DA_SALA.passada.max });
const duracaoDaPassada = numero({ min: FAIXAS_DO_GIZ_DA_SALA.passadaS.min, max: FAIXAS_DO_GIZ_DA_SALA.passadaS.max });

const desgasteEmOrdem = (g: Partial<GizSala>, c: string): void => {
  if (g.desgasteMin !== undefined && g.desgasteMax !== undefined && g.desgasteMin > g.desgasteMax) {
    recusar(`${c}.desgasteMin`, 'maior que desgasteMax');
  }
};

/** O giz completo (`estado-sala`). */
const esquemaGiz: Esquema<GizSala> = aposValidar(
  objeto({ desgasteMin: desgasteDoGiz, desgasteMax: desgasteDoGiz, passada: passadaDoGiz, passadaS: duracaoDaPassada }),
  desgasteEmOrdem,
);
/** O giz do pedido (`criar-sala`, `configurar-sala`): cada número é opcional e a sala completa com o que tem. */
const esquemaGizParcial: Esquema<Partial<GizSala>> = aposValidar(
  objeto({}, { desgasteMin: desgasteDoGiz, desgasteMax: desgasteDoGiz, passada: passadaDoGiz, passadaS: duracaoDaPassada }),
  desgasteEmOrdem,
);

const modosDe = (modalidade: Modalidade): string => MODOS_POR_MODALIDADE[modalidade].join(', ');

const codigoSala = texto({ min: TAMANHO_CODIGO, max: TAMANHO_CODIGO, padrao: new RegExp(`^[${ALFABETO_CODIGO}]+$`) });
const token = texto({ min: 16, max: L.token, padrao: /^[A-Za-z0-9_-]+$/ });

// ---- peças da física e das regras

const vetor3 = objeto({ x: coordenada, y: coordenada, z: coordenada });
const quaternion = objeto({ x: numero({ min: -2, max: 2 }), y: numero({ min: -2, max: 2 }), z: numero({ min: -2, max: 2 }), w: numero({ min: -2, max: 2 }) });

export const esquemaParametros: Esquema<ParametrosTacada> = objeto({
  angulo: numero({ min: -100, max: 100 }),
  velocidadeTaco: numero({ min: 0, max: L.velocidadeTaco }),
  efeito: objeto({ lateral: unitario, vertical: unitario }),
  elevacao: numero({ min: 0, max: 1.6 }),
  giz: numero({ min: 0, max: 1 }),
});

export const esquemaMesa: Esquema<EstadoMesa> = objeto({
  bolas: unicos(
    lista(
      objeto({
        id: idBola,
        posicao: vetor3,
        velocidade: vetor3,
        angular: vetor3,
        orientacao: quaternion,
        movimento: literal('parada', 'girando', 'deslizando', 'rolando'),
        naMesa: booleano,
      }),
      { min: 1, max: L.bolas },
    ),
    (b) => b.id,
  ),
});

const valorDeRegra: Esquema<string | number | boolean> = (v, c) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length <= 40) return v;
  return recusar(c, 'precisa ser texto curto, número ou verdadeiro/falso');
};

/** A forma da casa; que cada chave tenha um valor permitido é com `validarPreset` (regras), na sala. */
const esquemaConfigRegras: Esquema<ConfigRegras> = (v, c) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return recusar(c, 'precisa ser um objeto');
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return recusar(c, 'precisa ser um objeto simples');
  const chaves = Object.keys(v);
  if (chaves.length > L.chaveRegras) return recusar(c, `mais de ${L.chaveRegras} chaves`);
  const saida: Record<string, string | number | boolean> = {};
  for (const chave of chaves) {
    if (!/^[A-Za-z]{1,40}$/.test(chave)) return recusar(`${c}.${chave}`, 'nome de chave inválido');
    saida[chave] = valorDeRegra((v as Record<string, unknown>)[chave], `${c}.${chave}`);
  }
  return saida as unknown as ConfigRegras;
};

/**
 * Quem perde a próxima vez (mata-mata, L19): índices de `jogadores`, crescentes e sem repetição, de 1 a `jogadores - 1`
 * (a roda sempre para em alguém que não perde). Que cada índice exista na partida é conferido com `jogadores` em `esquemaPartida`.
 */
const quemPerdeAVez: Esquema<number[]> = (v, c) => {
  const indices = lista(inteiro(0, L.jogadores - 1), { min: 1, max: L.jogadores - 1 })(v, c);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i]! <= indices[i - 1]!) return recusar(`${c}[${i}]`, 'precisa vir em ordem crescente, sem repetição');
  }
  return indices;
};

const partidaComJogadores: Esquema<EstadoPartida> = objeto({
  config: esquemaConfigRegras,
  jogadores: unicos(lista(objeto({ id: texto({ min: 1, max: 32 }), nome, equipe }), { min: 2, max: L.jogadores }), (j) => j.id),
  vez: lugar,
  grupos: lista(nulavel(rotulo), { min: 2, max: L.jogadores }),
  fase: rotulo,
  naMesa: lista(idBola, { max: L.bolas }),
  encacapadas: lista(objeto({ bola: idBola, jogador: lugar }), { max: L.bolas }),
  retiradas: lista(idBola, { max: L.bolas }),
  vencedor: nulavel(equipe),
}, {
  /** Duplas: quem a roda escolheu, quando quem taca é o parceiro (só existe se difere de `vez`). */
  vezDaRoda: lugar,
  /** Equipes de tamanhos diferentes (2×1): a quem a roda passa depois (índice em `jogadores`); no 1×1 e no 2×2 nunca aparece. */
  proximoDaRoda: lugar,
  /** Mata-mata com `suicidioNoMataMata` ligado: quem cometeu suicídio e ainda não cumpriu a pena; ausente = ninguém. */
  perdemAProximaVez: quemPerdeAVez,
}) as unknown as Esquema<EstadoPartida>;

export const esquemaPartida: Esquema<EstadoPartida> = aposValidar(partidaComJogadores, (partida, c) => {
  const perdem = partida.perdemAProximaVez;
  if (perdem === undefined) return;
  const quantos = partida.jogadores.length;
  perdem.forEach((indice, i) => {
    if (indice >= quantos) recusar(`${c}.perdemAProximaVez[${i}]`, `não é um jogador (a partida tem ${quantos})`);
  });
  if (perdem.length > quantos - 1) recusar(`${c}.perdemAProximaVez`, `mais de ${quantos - 1} itens`);
});

export const esquemaConsequencias: Esquema<Consequencias> = objeto({
  faltas: lista(objeto({ nome: rotulo }), { max: 8 }),
  retirar: lista(idBola, { max: L.bolas }),
  recolocar: lista(objeto({ bola: idBola, lugar: rotulo }), { max: L.bolas }),
  proximo: lugar,
  vencedor: nulavel(equipe),
  texto: texto({ max: L.textoConsequencia }),
}) as unknown as Esquema<Consequencias>;

/**
 * Uma `Gravacao` já montada (vinda do codec). JSON não carrega buffers, então uma
 * gravação que veio em texto não passa: o quadro binário é o único caminho.
 */
export const esquemaGravacao: Esquema<Gravacao> = (v, c) => {
  if (typeof v !== 'object' || v === null) return recusar(c, 'precisa ser uma gravação');
  const g = v as Partial<Record<keyof Gravacao, unknown>>;
  if (!(g.posicoes instanceof Float32Array) || !(g.orientacoes instanceof Float32Array) || !(g.naMesa instanceof Uint8Array)) {
    return recusar(c, 'posicoes, orientacoes e naMesa precisam ser buffers numéricos');
  }
  const frequencia = numero({ min: LIMITES_GRAVACAO.frequenciaMin, max: LIMITES_GRAVACAO.frequenciaMax })(g.frequencia, `${c}.frequencia`);
  const duracao = numero({ min: 0, max: 1e6 })(g.duracao, `${c}.duracao`);
  const quadros = inteiro(1, LIMITES_GRAVACAO.quadros)(g.quadros, `${c}.quadros`);
  const ids = unicos(lista(inteiro(0, LIMITES_GRAVACAO.idMaximo), { min: 1, max: LIMITES_GRAVACAO.bolas }), (x) => x)(g.ids, `${c}.ids`);
  const eventos = g.eventos;
  if (!Array.isArray(eventos) || eventos.length > LIMITES_GRAVACAO.eventos) return recusar(`${c}.eventos`, 'lista de eventos inválida');
  const n = ids.length;
  if (g.posicoes.length !== quadros * n * 3 || g.orientacoes.length !== quadros * n * 4 || g.naMesa.length !== quadros * n) {
    return recusar(c, 'buffers não batem com quadros × bolas');
  }
  return { frequencia, ids, quadros, duracao, posicoes: g.posicoes, orientacoes: g.orientacoes, naMesa: g.naMesa, eventos: eventos as Gravacao['eventos'] };
};

// ---- cliente → sala

const esquemaCriarSala: Esquema<MsgCriarSala> = aposValidar(
  objeto({
    tipo: literal('criar-sala'),
    versao,
    nome,
    modo: modoDaSala,
    preset: texto({ min: 1, max: L.preset }),
    regras: esquemaConfigRegras,
  }, {
    modalidade: modalidadeDaSala,
    relogio: objeto({}, { tempoS: tempoPorTacada, aoEsgotar }),
    linha: esquemaLinha,
    giz: esquemaGizParcial,
    forca: forcaDaSala,
    aposta: apostaDaSala,
    carteira: codigoDaCarteira,
  }),
  (m, c) => {
    const modalidade = m.modalidade ?? MODALIDADE_PADRAO;
    if (!modoServeAModalidade(modalidade, m.modo)) recusar(`${c}.modo`, `${modalidade} não joga em ${m.modo} (aceita ${modosDe(modalidade)})`);
  },
);

const esquemaEntrar: Esquema<MsgEntrar> = objeto({ tipo: literal('entrar'), versao, codigo: codigoSala, nome }, { token, carteira: codigoDaCarteira });

const esquemaEscolherLugar: Esquema<MsgEscolherLugar> = objeto({ tipo: literal('escolher-lugar'), lugar: nulavel(lugar) });
const esquemaIniciar: Esquema<MsgIniciar> = objeto({ tipo: literal('iniciar') });

const mira = { angulo: numero({ min: -100, max: 100 }), lateral: unitario, vertical: unitario, recuo: numero({ min: 0, max: 2 }) };
/** Só `true`: o campo some quando o jogador não está passando giz, nunca vai como `false`. */
const gizDaMira = { giz: literal(true) };
const esquemaMira: Esquema<MsgMira> = objeto({ tipo: literal('mira'), ...mira }, gizDaMira);
const esquemaChat: Esquema<MsgChat> = objeto({ tipo: literal('chat'), texto: texto({ min: 1, max: L.chat }) });
/** Comparação exata com a lista fechada: outro emoji, texto, vazio ou emoji com modificador de pele não passam. */
const emojiDaSala = literal(...EMOJIS_DA_SALA);
const esquemaEmoji: Esquema<MsgEmoji> = objeto({ tipo: literal('emoji'), emoji: emojiDaSala });
const esquemaNovaPartida: Esquema<MsgNovaPartida> = objeto({ tipo: literal('nova-partida') });
const esquemaVoltarAoLobby: Esquema<MsgVoltarAoLobby> = objeto({ tipo: literal('voltar-ao-lobby') });
const esquemaConfigurarSala: Esquema<MsgConfigurarSala> = aposValidar(
  objeto(
    { tipo: literal('configurar-sala') },
    {
      modalidade: modalidadeDaSala,
      modo: modoDaSala,
      relogio: objeto({}, { tempoS: tempoPorTacada, aoEsgotar }),
      linha: objeto({}, { previsao: booleano, bolaAtingida: booleano }),
      giz: esquemaGizParcial,
      forca: forcaDaSala,
      aposta: apostaDaSala,
    },
  ),
  (m, c) => {
    // Só dá para conferir aqui quando a mensagem diz os dois; com um só, a sala confere contra o que ela tem.
    if (m.modalidade !== undefined && m.modo !== undefined && !modoServeAModalidade(m.modalidade, m.modo)) {
      recusar(`${c}.modo`, `${m.modalidade} não joga em ${m.modo} (aceita ${modosDe(m.modalidade)})`);
    }
  },
);
const esquemaExpulsar: Esquema<MsgExpulsar> = objeto({ tipo: literal('expulsar'), lugar });
const esquemaDiagnostico: Esquema<MsgDiagnostico> = objeto(
  {
    tipo: literal('diagnostico'),
    fpsMedio: numero({ min: 0, max: 1000 }),
    piorQuadroMs: numero({ min: 0, max: 600_000 }),
    qualidade: texto({ min: 1, max: L.qualidade }),
    gpu: texto({ max: L.gpu }),
  },
  { memoriaMb: numero({ min: 0, max: 1_000_000 }) },
);
const esquemaPing: Esquema<MsgPing> = objeto({ tipo: literal('ping'), t });

function porTipo<T>(esquemas: Readonly<Record<string, Esquema<unknown>>>): Esquema<T> {
  return (v, c) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return recusar(c, 'precisa ser um objeto');
    const tipo = (v as { tipo?: unknown }).tipo;
    if (typeof tipo !== 'string' || !Object.hasOwn(esquemas, tipo)) return recusar(`${c}.tipo`, 'tipo desconhecido');
    return esquemas[tipo]!(v, c) as T;
  };
}

// ---- sala → cliente

const esquemaBoasVindas: Esquema<MsgBoasVindas> = objeto({
  tipo: literal('boas-vindas'),
  versao,
  codigo: codigoSala,
  token,
  lugar: nulavel(lugar),
  anfitriao: booleano,
});

const esquemaLugarSala: Esquema<LugarSala> = objeto(
  { lugar, equipe, nome: nulavel(nome), conectado: booleano, anfitriao: booleano },
  { saldo: nulavel(valorEmMoedas), skin: skinDoCatalogo },
);

const esquemaLadoPlacar: Esquema<LadoPlacar> = objeto({ nomes: lista(nome, { min: 1, max: 2 }), vitorias: inteiro(0, L.vitoriasNoPlacar) });
const esquemaConfronto: Esquema<ConfrontoPlacar> = objeto({ lados: lista(esquemaLadoPlacar, { min: 2, max: L.jogadores }) }, { modalidade: modalidadeDaSala }) as unknown as Esquema<ConfrontoPlacar>;
const esquemaPlacar: Esquema<PlacarSala> = objeto({
  atual: nulavel(esquemaConfronto),
  historico: lista(esquemaConfronto, { max: L.confrontosNoPlacar - 1 }),
});

const esquemaEstadoSala: Esquema<MsgEstadoSala> = objeto({
  tipo: literal('estado-sala'),
  codigo: codigoSala,
  modo: modoDaSala,
  preset: texto({ min: 1, max: L.preset }),
  fase: literal('espera', 'jogando'),
  seq: inteiro(0, 1e6),
  vez: nulavel(lugar),
  lugares: lista(esquemaLugarSala, { min: 4, max: 4 }),
  espectadores: inteiro(0, 1000),
}, {
  modalidade: modalidadeDaSala,
  relogio: esquemaRelogio,
  linha: esquemaLinha,
  giz: esquemaGiz,
  forca: forcaDaSala,
  aposta: apostaDaSala,
  prazoMs: nulavel(inteiro(0, 600_000)),
  placar: esquemaPlacar,
});

const esquemaMiraRetransmitida: Esquema<MsgMiraRetransmitida> = objeto({ tipo: literal('mira-retransmitida'), lugar, ...mira }, gizDaMira);
const esquemaChatRetransmitido: Esquema<MsgChatRetransmitido> = objeto({
  tipo: literal('chat-retransmitido'),
  lugar: nulavel(lugar),
  nome,
  texto: texto({ min: 1, max: L.chat }),
});
const esquemaEmojiRetransmitido: Esquema<MsgEmojiRetransmitido> = objeto({
  tipo: literal('emoji-retransmitido'),
  lugar: nulavel(lugar),
  nome,
  emoji: emojiDaSala,
});
const esquemaVariacaoDaAposta: Esquema<VariacaoDaAposta> = objeto({ lugar, nome, delta: valorEmMoedas, saldo: valorEmMoedas });
const esquemaApostaPaga: Esquema<MsgApostaPaga> = aposValidar(
  objeto(
    { tipo: literal('aposta-paga'), valor: apostaDaSala, variacoes: unicos(lista(esquemaVariacaoDaAposta, { max: L.jogadores }), (v) => v.lugar) },
    { anulada: literal('carteira-repetida') },
  ),
  (m, c) => {
    if (m.anulada !== undefined && m.variacoes.length > 0) recusar(`${c}.variacoes`, 'a aposta anulada não leva variações');
  },
);
const esquemaMissoes: Esquema<MsgMissoes> = aposValidar(
  objeto({ tipo: literal('missoes'), missoes: esquemaMissoesDoDia, cumpridas: unicos(lista(idDeMissao, { max: MISSOES.length }), (id) => id) }),
  (m, c) => {
    const fechadas = new Set(m.missoes.itens.filter((i) => i.cumprida).map((i) => i.id));
    if (m.cumpridas.some((id) => !fechadas.has(id))) recusar(`${c}.cumpridas`, 'só pode listar missões já cumpridas no quadro');
  },
);
const esquemaErro: Esquema<MsgErro> = objeto({
  tipo: literal('erro'),
  codigo: literal(...CODIGOS_DE_ERRO),
  mensagem: texto({ max: 200 }),
});
const esquemaTempoEsgotado: Esquema<MsgTempoEsgotado> = objeto({
  tipo: literal('tempo-esgotado'),
  lugar,
  proximo: lugar,
  motivo: literal('tempo', 'ausencia'),
  consequencia: aoEsgotar,
});
const esquemaExpulso: Esquema<MsgExpulso> = objeto({ tipo: literal('expulso') }, { motivo: literal('anfitriao') });
const esquemaPong: Esquema<MsgPong> = objeto({ tipo: literal('pong'), t });

/**
 * Todos os esquemas de mensagem, dado o esquema do campo `gravacao`: o completo (gravação já decodificada)
 * ou o marcador da etapa 1 do fio (cabeçalho lido, bytes da gravação ainda sem decodificar).
 */
function montarMensagens(esquemaDaGravacao: Esquema<Gravacao>): { cliente: Esquema<MensagemDoCliente>; sala: Esquema<MensagemDaSala> } {
  const esquemaTacada: Esquema<MsgTacada> = objeto({
    tipo: literal('tacada'),
    seq: inteiro(0, 1e6),
    parametros: esquemaParametros,
    gravacao: esquemaDaGravacao,
    partida: esquemaPartida,
    mesa: esquemaMesa,
  });

  const esquemaUltima: Esquema<UltimaTacada> = objeto({
    seq: inteiro(0, 1e6),
    lugar,
    parametros: esquemaParametros,
    gravacao: esquemaDaGravacao,
    consequencias: esquemaConsequencias,
  });

  const esquemaRetrato: Esquema<MsgRetrato> = objeto({
    tipo: literal('retrato'),
    motivo: literal('entrada', 'inicio', 'nova-partida', 'vez-passou', 'ressincronia'),
    seq: inteiro(0, 1e6),
    partida: esquemaPartida,
    arrumacao: lista(idBola, { max: 15 }),
    semente,
    mesa: nulavel(esquemaMesa),
    ultima: nulavel(esquemaUltima),
  });

  const esquemaTacadaRetransmitida: Esquema<MsgTacadaRetransmitida> = objeto({
    tipo: literal('tacada-retransmitida'),
    seq: inteiro(0, 1e6),
    lugar,
    parametros: esquemaParametros,
    gravacao: esquemaDaGravacao,
    partida: esquemaPartida,
    mesa: esquemaMesa,
    consequencias: esquemaConsequencias,
  });

  return {
    cliente: porTipo<MensagemDoCliente>({
      'criar-sala': esquemaCriarSala,
      entrar: esquemaEntrar,
      'escolher-lugar': esquemaEscolherLugar,
      iniciar: esquemaIniciar,
      tacada: esquemaTacada,
      mira: esquemaMira,
      chat: esquemaChat,
      emoji: esquemaEmoji,
      'nova-partida': esquemaNovaPartida,
      'voltar-ao-lobby': esquemaVoltarAoLobby,
      'configurar-sala': esquemaConfigurarSala,
      expulsar: esquemaExpulsar,
      diagnostico: esquemaDiagnostico,
      ping: esquemaPing,
    }),
    sala: porTipo<MensagemDaSala>({
      'boas-vindas': esquemaBoasVindas,
      'estado-sala': esquemaEstadoSala,
      retrato: esquemaRetrato,
      'tacada-retransmitida': esquemaTacadaRetransmitida,
      'mira-retransmitida': esquemaMiraRetransmitida,
      'chat-retransmitido': esquemaChatRetransmitido,
      'emoji-retransmitido': esquemaEmojiRetransmitido,
      'aposta-paga': esquemaApostaPaga,
      missoes: esquemaMissoes,
      'tempo-esgotado': esquemaTempoEsgotado,
      expulso: esquemaExpulso,
      erro: esquemaErro,
      pong: esquemaPong,
    }),
  };
}

const completos = montarMensagens(esquemaGravacao);
export const esquemaMensagemDoCliente: Esquema<MensagemDoCliente> = completos.cliente;
export const esquemaMensagemDaSala: Esquema<MensagemDaSala> = completos.sala;

/** Marcador da etapa 1 do fio: o cabeçalho foi lido e validado, os bytes da gravação ainda não foram decodificados. */
export const GRAVACAO_PENDENTE = Object.freeze({ pendente: true }) as unknown as Gravacao;
const gravacaoPendente: Esquema<Gravacao> = (v, c) => (v === GRAVACAO_PENDENTE ? GRAVACAO_PENDENTE : recusar(c, 'gravação não decodificada'));
const pendentes = montarMensagens(gravacaoPendente);
/** Mesmas mensagens, com `gravacao` = `GRAVACAO_PENDENTE`: valida tudo menos a gravação, que é a parte cara. */
export const esquemaCabecalhoDoCliente: Esquema<MensagemDoCliente> = pendentes.cliente;
export const esquemaCabecalhoDaSala: Esquema<MensagemDaSala> = pendentes.sala;

export const validarMensagemDoCliente = (valor: unknown): Resultado<MensagemDoCliente> => validar(esquemaMensagemDoCliente, valor);
export const validarMensagemDaSala = (valor: unknown): Resultado<MensagemDaSala> => validar(esquemaMensagemDaSala, valor);
