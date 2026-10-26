/**
 * Contrato cliente ↔ sala. Mensagens são uniões discriminadas por `tipo`.
 *
 * Fio (ver `fio.ts`): texto JSON para mensagens sem gravação; quadro binário
 * (JSON + gravação compacta) para as que a carregam (`tacada`,
 * `tacada-retransmitida`, `retrato` com `ultima`). Os eventos da tacada vão só
 * dentro da gravação (`gravacao.eventos`) e são a entrada das regras.
 *
 * Quem manda o quê:
 * - a sala é a verdade de lugares, vez e `seq`; a partida só avança por `aplicarTacada`
 *   (regras) rodando na sala; a gravação transmitida é a verdade da animação;
 * - ninguém re-simula: quem taca simula e manda gravação + partida e mesa resultantes.
 */
import type { EstadoMesa, Gravacao, ParametrosTacada } from '@sinuca/fisica';
import type { ConfigRegras, Consequencias, EstadoPartida, Modalidade } from '@sinuca/regras';
import type { ApostaSala, SkinTaco } from './carteira';
import type { IdMissao, MissoesDoDia } from './missoes';

/**
 * Muda quando uma mensagem muda de forma; `criar-sala` e `entrar` carregam a do cliente e a sala recusa a
 * diferente com o código `versao` ("recarregue a página"). A 2 trouxe o relógio da tacada (`relogio`, `prazoMs`,
 * `tempo-esgotado`) e o `diagnostico`: o esquema é estrito, então uma aba da versão 1 não entenderia o `estado-sala`.
 * Dentro da 2 o contrato só cresceu, sempre com campo ou mensagem novos e opcionais (`linha`, `voltar-ao-lobby`,
 * `configurar-sala`, o modo `2x1`, `expulsar`, `expulso`, `placar`): quem não os usa continua igual.
 * A 3 trouxe o mata-mata (L16): `modalidade`, os modos `1x1x1` e `1x1x1x1`, as regras `giz` e `forca` da sala, o placar
 * com 2 a 4 lados e a equipe de 0 a 3. Uma aba da versão 2 não entenderia o `estado-sala` (campos novos), então recarrega.
 * A 4 trouxe os emojis da sala (L18): `emoji` e `emoji-retransmitido`. O esquema é estrito, então uma aba da versão 3 não
 * saberia ler o `emoji-retransmitido` e recarrega.
 * A 5 cresceu o catálogo de emojis de 8 para 40 (L20): uma aba da versão 4 não saberia ler um emoji fora dos 8 primeiros
 * e recarrega.
 * A 6 trouxe a carteira e a aposta (L22): `aposta` na sala, `carteira` em `criar-sala`/`entrar`, `saldo` e `skin` em cada
 * `LugarSala` e a mensagem `aposta-paga`. O esquema é estrito, então uma aba da versão 5 não saberia ler o `estado-sala`
 * nem o `aposta-paga` e recarrega.
 * A 7 trouxe as missões diárias (L31): a mensagem `missoes` e, no HTTP da carteira, o campo `missoes` do `EstadoCarteira`.
 * O esquema é estrito, então uma aba da versão 6 não saberia ler a mensagem nova e recarrega.
 */
export const PROTOCOLO_VERSAO = 7;

/**
 * O catálogo de emojis que a sala retransmite. Lista fechada de propósito: nada de texto livre, e todo emoji é um ponto de
 * código só (sem seletor de apresentação U+FE0F, sem junção de largura zero, sem modificador de pele); o que não está aqui
 * é `mensagem-invalida`. Cada jogador escolhe no cliente quais 8 vão nas teclas 1 a 8; os 8 primeiros são os padrões
 * (`EMOJIS_PADRAO`), e a ordem do catálogo é a da grade de escolha.
 */
export const EMOJIS_DA_SALA = [
  '😂', '👏', '🔥', '😱', '😤', '🤡', '🍺', '🎱',
  '🤣', '😅', '😎', '🤔', '😏', '😬', '🙄', '😴', '😭', '😡', '🤯', '🥶', '🤠', '😈',
  '👍', '👎', '🙏', '💪', '👀', '💯', '🍻', '🎯', '🏆', '💀', '👑', '🐐', '🍀', '🦆', '🧂', '🐢', '🎉', '💩',
] as const;
export type EmojiSala = (typeof EMOJIS_DA_SALA)[number];

/** Os emojis padrão das teclas 1 a 8, na ordem das teclas: os 8 primeiros do catálogo. */
export const EMOJIS_PADRAO: readonly [EmojiSala, EmojiSala, EmojiSala, EmojiSala, EmojiSala, EmojiSala, EmojiSala, EmojiSala] = [
  EMOJIS_DA_SALA[0],
  EMOJIS_DA_SALA[1],
  EMOJIS_DA_SALA[2],
  EMOJIS_DA_SALA[3],
  EMOJIS_DA_SALA[4],
  EMOJIS_DA_SALA[5],
  EMOJIS_DA_SALA[6],
  EMOJIS_DA_SALA[7],
];

/** Tempos por tacada que o anfitrião pode escolher ao criar a sala; "sem limite" é `tempoS: null`. */
export const TEMPOS_POR_TACADA_S = [15, 30, 45, 60] as const;
export type TempoPorTacadaS = (typeof TEMPOS_POR_TACADA_S)[number];

/**
 * O que acontece com quem estoura o tempo. `perde-a-vez`: a vez passa (`passarVez` das regras).
 * `falta`: ainda não existe; a sala recusa `criar-sala` com `regras-invalidas` e uma mensagem clara.
 */
export type AoEsgotar = 'perde-a-vez' | 'falta';

/** O relógio da tacada como a sala o aplica; o anfitrião o escolhe em `criar-sala`. */
export interface RelogioSala {
  /** Segundos por tacada; `null` = sem limite. */
  readonly tempoS: TempoPorTacadaS | null;
  readonly aoEsgotar: AoEsgotar;
}

/**
 * A linha de previsão da tacada, como a sala a aplica: igual para todos, escolhida pelo anfitrião ao criar (ou na
 * espera, com `configurar-sala`). Ninguém liga sozinho: nem o cliente online nem o painel dev.
 */
export interface LinhaSala {
  readonly previsao: boolean;
  /** Marca também a primeira bola atingida e para onde ela segue; só vale com `previsao` ligada. */
  readonly bolaAtingida?: boolean;
}

/**
 * O giz da mesa, regra da sala igual para todos (L16): quanto cada tacada gasta e como se passa o giz de novo. Os nomes e
 * o formato são os do `RegrasGiz` do cliente. Cada tacada gasta um desgaste sorteado entre `desgasteMin` e `desgasteMax`
 * (fração do giz inteiro); cada passada soma `passada` ao nível e leva `passadaS` segundos. Faixas: `FAIXAS_DO_GIZ_DA_SALA`,
 * com `desgasteMin` ≤ `desgasteMax`.
 */
export interface GizSala {
  readonly desgasteMin: number;
  readonly desgasteMax: number;
  readonly passada: number;
  readonly passadaS: number;
}

/** O giz de quem não escolhe: gasto de 10 a 30% por tacada, passadas de 10% que levam 3 s. */
export const GIZ_DA_SALA_PADRAO: GizSala = { desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 };

/** O que o anfitrião pode escolher no giz; o esquema recusa fora disto e a sala confere `desgasteMin` ≤ `desgasteMax` depois de completar. */
export const FAIXAS_DO_GIZ_DA_SALA = {
  desgaste: { min: 0, max: 0.5 },
  passada: { min: 0.05, max: 0.5 },
  passadaS: { min: 0.5, max: 6 },
} as const;

/**
 * Como se controla a força da tacada, regra da sala (L16). `empurrar`: o controle de antes (a força vem do recuo do
 * mouse com a curva do jogador). `linha`: segura-se o botão, puxa-se o mouse para trás e uma linha de força cresce;
 * ao soltar, taca.
 */
export type ForcaSala = 'empurrar' | 'linha';

/** Os controles de força que a sala conhece, na ordem em que o menu os oferece. */
export const FORCAS_DA_SALA = ['empurrar', 'linha'] as const satisfies readonly ForcaSala[];

/** O controle de força de quem não escolhe. */
export const FORCA_DA_SALA_PADRAO: ForcaSala = 'linha';

/**
 * Como a sala senta as pessoas. Par ou ímpar: '1x1': lugares 0 e 1; '2x1': lugares 0 a 2, equipe 0 = lugares 0 e 2,
 * equipe 1 = só o lugar 1; '2x2': lugares 0 a 3, equipe 0 = lugares 0 e 2, equipe 1 = lugares 1 e 3. Mata-mata (cada um
 * por si): '1x1' (2 pessoas), '1x1x1' (lugares 0 a 2) e '1x1x1x1' (lugares 0 a 3), uma equipe por lugar.
 * Que modos cada modalidade aceita está em `MODOS_POR_MODALIDADE`.
 */
export type ModoSala = '1x1' | '2x1' | '2x2' | '1x1x1' | '1x1x1x1';

/** Os modos que a sala conhece, na ordem em que o menu os oferece. */
export const MODOS_DE_SALA = ['1x1', '2x1', '2x2', '1x1x1', '1x1x1x1'] as const satisfies readonly ModoSala[];

/** Como um modo senta as pessoas: `formacao` = tamanho de cada equipe (como a `Formacao` das regras) e `equipes` = a equipe de cada lugar, de 0 em diante. */
export interface FormatoDoModo {
  readonly formacao: readonly number[];
  readonly equipes: readonly number[];
}

export const FORMATO_DO_MODO: Readonly<Record<ModoSala, FormatoDoModo>> = {
  '1x1': { formacao: [1, 1], equipes: [0, 1] },
  '2x1': { formacao: [2, 1], equipes: [0, 1, 0] },
  '2x2': { formacao: [2, 2], equipes: [0, 1, 0, 1] },
  '1x1x1': { formacao: [1, 1, 1], equipes: [0, 1, 2] },
  '1x1x1x1': { formacao: [1, 1, 1, 1], equipes: [0, 1, 2, 3] },
};

/** Quantos lugares cada modo usa (os primeiros, de 0 em diante); `estado-sala.lugares` traz sempre 4, os de fora não contam. */
export const LUGARES_POR_MODO: Readonly<Record<ModoSala, number>> = Object.fromEntries(
  MODOS_DE_SALA.map((modo) => [modo, FORMATO_DO_MODO[modo].equipes.length]),
) as Record<ModoSala, number>;

/**
 * O catálogo: que modos cada modalidade aceita, na ordem em que o menu os mostra (quando a troca de modalidade deixa o
 * modo atual sem serventia, a sala vai ao primeiro daqui com o mesmo número de lugares e, se nenhum tiver, ao primeiro). Modalidade nova = um preset nas regras
 * (`PRESETS_DE_FABRICA`) mais uma entrada aqui; o `Record` não compila sem ela, e um teste da sala confere que cada lista
 * bate com `formacoesAceitas` das regras (um modo é aceito quando a formação dele, ou o espelho dela, está lá).
 */
export const MODOS_POR_MODALIDADE: Readonly<Record<Modalidade, readonly ModoSala[]>> = {
  'par-ou-impar': ['1x1', '2x1', '2x2'],
  'mata-mata': ['1x1', '1x1x1', '1x1x1x1'],
};

/** As modalidades que a sala conhece, na ordem do catálogo. */
export const MODALIDADES_DE_SALA = Object.keys(MODOS_POR_MODALIDADE) as readonly Modalidade[];

/** A modalidade de uma sala que não escolhe. */
export const MODALIDADE_PADRAO: Modalidade = 'par-ou-impar';

/** A modalidade joga neste modo? */
export const modoServeAModalidade = (modalidade: Modalidade, modo: ModoSala): boolean => MODOS_POR_MODALIDADE[modalidade].includes(modo);

/**
 * Equipe de um lugar no modo: nos modos de duas equipes, `lugar % 2` (os pares são da equipe 0, os ímpares da 1; no 2x1
 * os lugares 0 e 2 jogam juntos contra o 1); no mata-mata, a equipe é o próprio lugar. Lugar fora do modo (`estado-sala`
 * traz sempre 4) segue a mesma conta.
 */
export function equipeDoLugar(modo: ModoSala, lugar: number): number;
/** @deprecated Forma de antes do mata-mata, só para o par ou ímpar (`lugar % 2`). Passe o modo; sai quando o cliente adotar a nova. */
export function equipeDoLugar(lugar: number): number;
export function equipeDoLugar(modoOuLugar: ModoSala | number, lugar?: number): number {
  if (typeof modoOuLugar === 'number') return modoOuLugar % 2;
  const { formacao, equipes } = FORMATO_DO_MODO[modoOuLugar];
  return equipes[lugar!] ?? (formacao.length === 2 ? lugar! % 2 : lugar!);
}

/**
 * `espera`: juntando gente (ou de volta do fim da partida, com os mesmos lugares); `jogando`: há partida em curso
 * (ou terminada, à espera de `voltar-ao-lobby`).
 */
export type FaseSala = 'espera' | 'jogando';

export type CodigoErro =
  | 'versao'
  | 'mensagem-invalida'
  | 'mensagem-grande'
  | 'limite-mensagens'
  | 'sala-inexistente'
  | 'servidor-cheio'
  | 'sala-cheia'
  | 'nome-invalido'
  | 'token-invalido'
  | 'ja-na-sala'
  | 'fora-da-sala'
  | 'fase-errada'
  | 'lugar-invalido'
  | 'lugar-ocupado'
  | 'nao-anfitriao'
  | 'lugares-incompletos'
  | 'regras-invalidas'
  | 'nao-e-sua-vez'
  | 'seq-errado'
  | 'gravacao-invalida'
  | 'partida-diverge'
  | 'mesa-incoerente'
  | 'partida-acabou'
  | 'partida-em-andamento';

// ---------------------------------------------------------------- cliente → sala

export interface MsgCriarSala {
  readonly tipo: 'criar-sala';
  readonly versao: number;
  readonly nome: string;
  readonly modo: ModoSala;
  /**
   * O jeito de jogar (L16). Ausente = `par-ou-impar`. O `modo` precisa estar no catálogo dela
   * (`MODOS_POR_MODALIDADE`) e `regras.modalidade` precisa ser a mesma, senão `regras-invalidas`.
   */
  readonly modalidade?: Modalidade;
  /** Nome do preset de origem (rótulo para a sala mostrar), p.ex. "Boteco". */
  readonly preset: string;
  /**
   * A casa completa escolhida na tela "Regras da casa", da `modalidade` da sala; a sala confere cada chave. Se o anfitrião
   * trocar de modalidade na espera, a sala joga a nova com o preset de fábrica dela e guarda esta casa para quando voltar.
   */
  readonly regras: ConfigRegras;
  /**
   * Relógio da tacada. Ausente, ou campo ausente: o padrão da sala (30 s, `perde-a-vez`).
   * `{ tempoS: null }` = sem limite.
   */
  readonly relogio?: Partial<RelogioSala>;
  /** A linha de previsão da sala. Ausente = desligada. `bolaAtingida` ausente = desligada. */
  readonly linha?: LinhaSala;
  /** O giz da sala (L16), parcial: o que faltar vem de `GIZ_DA_SALA_PADRAO`. Com `desgasteMin` > `desgasteMax` depois de completar, `regras-invalidas`. */
  readonly giz?: Partial<GizSala>;
  /** O controle de força da sala (L16). Ausente = `FORCA_DA_SALA_PADRAO` (`linha`). */
  readonly forca?: ForcaSala;
  /** Quanto cada jogador com carteira põe em cada partida (L22). Ausente = `APOSTA_PADRAO`. */
  readonly aposta?: ApostaSala;
  /**
   * O código secreto da carteira de quem cria (L22; vem de `POST /carteira`). Ausente, ou código que a sala não conhece
   * (servidor que perdeu os dados): joga sem carteira, não aposta nem recebe. O código nunca sai da sala nem vai a log.
   */
  readonly carteira?: string;
}

export interface MsgEntrar {
  readonly tipo: 'entrar';
  readonly versao: number;
  readonly codigo: string;
  readonly nome: string;
  /** O que a sala deu em `boas-vindas`; com ele, volta ao mesmo lugar. */
  readonly token?: string;
  /**
   * O código secreto da carteira de quem entra (L22). Vale na entrada nova; quem volta com `token` conserva a carteira
   * com que se sentou. Ausente ou desconhecido: sem carteira, como em `criar-sala`.
   */
  readonly carteira?: string;
}

/** `lugar: null` vira espectador. Só na fase `espera`. */
export interface MsgEscolherLugar {
  readonly tipo: 'escolher-lugar';
  readonly lugar: number | null;
}

/** Anfitrião, com os lugares do modo cheios e conectados. */
export interface MsgIniciar {
  readonly tipo: 'iniciar';
}

/**
 * Só de quem tem a vez. `seq` = o `seq` do último `estado-sala`/`retrato`/`tacada-retransmitida`
 * (quantas tacadas a partida já teve). `partida` e `mesa` são o resultado da tacada, como o
 * cliente os calculou; a sala confere `partida` com a sua conta das regras.
 */
export interface MsgTacada {
  readonly tipo: 'tacada';
  readonly seq: number;
  readonly parametros: ParametrosTacada;
  readonly gravacao: Gravacao;
  readonly partida: EstadoPartida;
  readonly mesa: EstadoMesa;
}

/** Mira ao vivo do jogador da vez (~10/s, opcional): ângulo do taco, efeito e recuo do taco (m). */
export interface MsgMira {
  readonly tipo: 'mira';
  readonly angulo: number;
  readonly lateral: number;
  readonly vertical: number;
  readonly recuo: number;
  /** `true` = o jogador está passando giz agora; ausente = não está. O esquema estrito só aceita `true` (`false`, número ou texto são `mensagem-invalida`). */
  readonly giz?: true;
}

export interface MsgChat {
  readonly tipo: 'chat';
  readonly texto: string;
}

/**
 * Solta um emoji da lista fechada `EMOJIS_DA_SALA`, em qualquer fase e também de espectador. A sala retransmite
 * `emoji-retransmitido` a todos, inclusive a quem mandou. Rajada acima de `LIMITES_PROTOCOLO.emojiRajada` (recarga de
 * `emojiPorSegundo`) é descartada sem erro.
 */
export interface MsgEmoji {
  readonly tipo: 'emoji';
  readonly emoji: EmojiSala;
}

/**
 * Anfitrião, só na fase `espera`: tira da sala quem está no `lugar` (conectado ou não). Recusas: `nao-anfitriao`,
 * `fase-errada`, e `lugar-invalido` para lugar fora do modo, vago, ou o do próprio anfitrião. O expulso recebe `expulso`
 * e a conexão dele é fechada com o código 4002; o token dele deixa de valer (`entrar` com ele dá `token-invalido`),
 * mas `entrar` sem token, pelo mesmo link, é uma entrada nova. Todos os outros recebem o `estado-sala` novo.
 */
export interface MsgExpulsar {
  readonly tipo: 'expulsar';
  readonly lugar: number;
}

/**
 * Anfitrião, com a partida terminada: começa outra direto, sem passar pela espera. O cliente novo usa
 * `voltar-ao-lobby`; esta segue valendo.
 */
export interface MsgNovaPartida {
  readonly tipo: 'nova-partida';
}

/**
 * Anfitrião, com a partida terminada: a sala volta para a fase `espera` com os mesmos lugares (quem saiu da sala
 * perde o lugar). Na espera o anfitrião pode `configurar-sala` e `iniciar` de novo; quem sai segue
 * `jogadoresDaProxima` das regras (enquanto o modo e os lugares forem os mesmos).
 */
export interface MsgVoltarAoLobby {
  readonly tipo: 'voltar-ao-lobby';
}

/**
 * Anfitrião, só na fase `espera`: muda o que vier. Cada campo é parcial e completa o que a sala já tem (o relógio, a
 * linha e o giz como em `criar-sala`); campo ausente não muda nada. Trocar o modo para um com menos lugares tira dos que
 * sobram quem estiver neles (viram espectadores). Trocar a `modalidade` sem dizer o `modo` leva, se o atual não servir à
 * nova, ao modo do catálogo (`MODOS_POR_MODALIDADE`) com o mesmo número de lugares (2x2 → 1x1x1x1, 2x1 → 1x1x1) e, só se não
 * houver, ao primeiro do catálogo; dizendo o `modo`, ele precisa servir, senão
 * `regras-invalidas` e nada muda. A sala responde com um `estado-sala` para todos.
 */
export interface MsgConfigurarSala {
  readonly tipo: 'configurar-sala';
  readonly modalidade?: Modalidade;
  readonly modo?: ModoSala;
  readonly relogio?: Partial<RelogioSala>;
  readonly linha?: Partial<LinhaSala>;
  readonly giz?: Partial<GizSala>;
  readonly forca?: ForcaSala;
  /** A aposta por jogador com carteira (L22). Vale para a partida que começar depois. */
  readonly aposta?: ApostaSala;
}

export interface MsgPing {
  readonly tipo: 'ping';
  /**
   * Instante em ms RELATIVO ao início da conexão (por exemplo `performance.now()`), nunca o relógio de
   * parede: `Date.now()` (~1,8e12) passa do teto de 1e12 e a mensagem é recusada. A sala devolve o mesmo
   * valor em `pong`; o cliente calcula a latência com o relógio dele.
   */
  readonly t: number;
}

/**
 * Medidas do cliente para o log da sala (opcional; sem IP, sem identificador): no máximo uma a cada
 * `LIMITES_PROTOCOLO.intervaloDiagnosticoMs` por conexão (a que vier antes é descartada em silêncio) e até
 * `LIMITES_PROTOCOLO.bytesDiagnostico` bytes. Serve para achar o computador que trava.
 */
export interface MsgDiagnostico {
  readonly tipo: 'diagnostico';
  /** Quadros por segundo, média da janela medida. */
  readonly fpsMedio: number;
  /** O quadro mais demorado da janela, em ms. */
  readonly piorQuadroMs: number;
  /** Rótulo curto da qualidade gráfica em uso (até 24 caracteres). */
  readonly qualidade: string;
  /** Renderizador da GPU (`WEBGL_debug_renderer_info`), até 120 caracteres; `desconhecida` se o navegador esconde. */
  readonly gpu: string;
  /** Memória do JavaScript em uso (MB); ausente se o navegador não informa. */
  readonly memoriaMb?: number;
}

export type MensagemDoCliente =
  | MsgCriarSala
  | MsgEntrar
  | MsgEscolherLugar
  | MsgIniciar
  | MsgTacada
  | MsgMira
  | MsgChat
  | MsgEmoji
  | MsgNovaPartida
  | MsgVoltarAoLobby
  | MsgConfigurarSala
  | MsgExpulsar
  | MsgDiagnostico
  | MsgPing;

// ---------------------------------------------------------------- sala → cliente

/** Primeira resposta a `criar-sala`/`entrar`; vem sempre antes do `estado-sala`. */
export interface MsgBoasVindas {
  readonly tipo: 'boas-vindas';
  readonly versao: number;
  readonly codigo: string;
  /** Guarde (localStorage) e mande em `entrar` para voltar ao mesmo lugar. */
  readonly token: string;
  /** `null` = espectador. */
  readonly lugar: number | null;
  readonly anfitriao: boolean;
}

export interface LugarSala {
  readonly lugar: number;
  /** Equipe do lugar, de 0 a 3 (`equipeDoLugar`): 1x1 cada um é uma equipe; 2x1: 0 e 2 contra 1; 2x2: 0 e 2 contra 1 e 3; 1x1x1 e 1x1x1x1: cada lugar é a própria equipe. */
  readonly equipe: number;
  /** `null` = vago. */
  readonly nome: string | null;
  readonly conectado: boolean;
  readonly anfitriao: boolean;
  /**
   * Saldo da carteira de quem está no lugar (L22), público na sala; `null` = sem carteira (ou vago). Pode ser negativo.
   * A sala sempre manda; ausente só em montagens de teste = `null`.
   */
  readonly saldo?: number | null;
  /** A skin do taco de quem está no lugar (L22); `SKIN_PADRAO` sem carteira ou vago. A sala sempre manda; ausente só em montagens de teste. */
  readonly skin?: SkinTaco;
}

/** Um lado de um confronto do placar da sala. */
export interface LadoPlacar {
  /**
   * Apelidos de quem jogou deste lado (1 ou 2), na ordem em que o confronto foi aberto. Quem saiu da sala ou foi
   * expulso continua aqui, pelo apelido.
   */
  readonly nomes: readonly string[];
  /** Partidas que este lado venceu no confronto. */
  readonly vitorias: number;
}

/**
 * Os lados frente a frente numa modalidade, contados até alguém mudar de lado (ou de modalidade): dois no par ou ímpar (cada um com 1 ou 2 pessoas), de 2 a
 * 4 no mata-mata (cada pessoa é um lado). A orientação é a de quando o confronto abriu e não gira: se as pessoas trocarem
 * de equipe depois, `lados[0]` continua sendo o mesmo grupo de pessoas. O tipo garante os dois primeiros lados.
 */
export interface ConfrontoPlacar {
  /**
   * A modalidade em que o confronto foi jogado (L16b): o mesmo 1×1 de par ou ímpar e de mata-mata são confrontos
   * diferentes. A sala sempre manda; ausente (montagens de teste, hot-seat antigo) = `par-ou-impar`.
   */
  readonly modalidade?: Modalidade;
  readonly lados: readonly [LadoPlacar, LadoPlacar, ...LadoPlacar[]];
}

/**
 * O placar da sala: o confronto em curso e os anteriores. Fica na memória da sala (some quando ela expira) e não é
 * zerado por `voltar-ao-lobby`, `configurar-sala` nem por quem entra ou sai.
 */
export interface PlacarSala {
  /** O confronto da última partida terminada; `null` até a primeira terminar. */
  readonly atual: ConfrontoPlacar | null;
  /** Os confrontos anteriores, do mais recente para o mais antigo; no máximo `LIMITES_PROTOCOLO.confrontosNoPlacar - 1`. */
  readonly historico: readonly ConfrontoPlacar[];
}

/** Enviado a todos a cada mudança (entrada, saída, lugar, início, tacada, vez). */
export interface MsgEstadoSala {
  readonly tipo: 'estado-sala';
  readonly codigo: string;
  readonly modo: ModoSala;
  /** O jeito de jogar da sala; a sala sempre manda (ausente só em montagens de teste = `par-ou-impar`). */
  readonly modalidade?: Modalidade;
  /** Rótulo do preset em uso (o da `modalidade` atual). */
  readonly preset: string;
  readonly fase: FaseSala;
  /** Tacadas já aceitas na partida atual; a próxima `tacada` leva este número. */
  readonly seq: number;
  /** Lugar de quem tem a vez; `null` fora da partida ou com ela terminada. */
  readonly vez: number | null;
  /** Sempre os 4 lugares, 0 a 3; só os `LUGARES_POR_MODO[modo]` primeiros contam (1x1: 0 e 1; 2x1 e 1x1x1: 0 a 2). */
  readonly lugares: readonly LugarSala[];
  readonly espectadores: number;
  /** O relógio da sala (a sala sempre manda; ausente só em montagens de teste). */
  readonly relogio?: RelogioSala;
  /** A linha de previsão da sala, sempre completa (`bolaAtingida` presente); ausente só em montagens de teste = desligada. */
  readonly linha?: LinhaSala;
  /** O giz da sala, sempre completo (L16); ausente só em montagens de teste = `GIZ_DA_SALA_PADRAO`. */
  readonly giz?: GizSala;
  /** O controle de força da sala (L16); ausente só em montagens de teste = `FORCA_DA_SALA_PADRAO`. */
  readonly forca?: ForcaSala;
  /** Quanto cada jogador com carteira põe na partida (L22); a sala sempre manda, ausente só em montagens de teste = `APOSTA_PADRAO`. */
  readonly aposta?: ApostaSala;
  /**
   * Quanto falta, EM MS A PARTIR DO ENVIO, para acabar o tempo de quem tem a vez: o cliente soma o instante
   * em que recebeu e nunca depende de relógio absoluto. Já conta a animação da tacada anterior e uma margem
   * curta (o prazo só corre depois que ela termina). `0` = tempo acabando (a tacada que chegar até a folga
   * da sala ainda vale); `null` = sem prazo (sem limite, na espera, ou partida terminada).
   */
  readonly prazoMs?: number | null;
  /**
   * O placar da sala, igual para todos, inclusive quem entra ou volta e os espectadores; a sala sempre manda
   * (`atual: null` e histórico vazio até a primeira partida terminar; ausente só em montagens de teste).
   * Muda quando uma partida termina, na mesma rodada do `estado-sala` que vem logo depois da `tacada-retransmitida`
   * final.
   */
  readonly placar?: PlacarSala;
}

/** A última tacada aceita, para quem volta acompanhar (ou rever) a animação. */
export interface UltimaTacada {
  readonly seq: number;
  readonly lugar: number;
  readonly parametros: ParametrosTacada;
  readonly gravacao: Gravacao;
  readonly consequencias: Consequencias;
}

export type MotivoRetrato = 'entrada' | 'inicio' | 'nova-partida' | 'vez-passou' | 'ressincronia';

/**
 * Estado completo da partida, para quem entra ou volta, e a cada início de partida.
 * `mesa` é `null` antes da primeira tacada: monte-a com
 * `mesaInicial(arrumacao, config, criarRng(semente))`. A cada `retrato`, recomece do zero.
 */
export interface MsgRetrato {
  readonly tipo: 'retrato';
  readonly motivo: MotivoRetrato;
  readonly seq: number;
  readonly partida: EstadoPartida;
  readonly arrumacao: readonly number[];
  readonly semente: number;
  readonly mesa: EstadoMesa | null;
  readonly ultima: UltimaTacada | null;
}

/** Para todos, inclusive quem tacou (que a usa como confirmação: mesmo `seq`, mais `consequencias`). */
export interface MsgTacadaRetransmitida {
  readonly tipo: 'tacada-retransmitida';
  readonly seq: number;
  readonly lugar: number;
  readonly parametros: ParametrosTacada;
  readonly gravacao: Gravacao;
  readonly partida: EstadoPartida;
  readonly mesa: EstadoMesa;
  /** Calculadas pela sala (`aplicarTacada`): faltas, bolas retiradas/recolocadas, texto do HUD. */
  readonly consequencias: Consequencias;
}

/** Para todos menos quem mirou. */
export interface MsgMiraRetransmitida {
  readonly tipo: 'mira-retransmitida';
  readonly lugar: number;
  readonly angulo: number;
  readonly lateral: number;
  readonly vertical: number;
  readonly recuo: number;
  /** O `giz` de `MsgMira`, repassado tal qual: `true` = está passando giz agora; ausente = não está (a sala nunca escreve `false`). */
  readonly giz?: true;
}

export interface MsgChatRetransmitido {
  readonly tipo: 'chat-retransmitido';
  /** `null` = espectador. */
  readonly lugar: number | null;
  readonly nome: string;
  readonly texto: string;
}

/** Para todos, inclusive quem soltou o emoji. */
export interface MsgEmojiRetransmitido {
  readonly tipo: 'emoji-retransmitido';
  /** `null` = espectador. */
  readonly lugar: number | null;
  readonly nome: string;
  readonly emoji: EmojiSala;
}

/**
 * A vez passou porque o tempo acabou, ou porque o dono da vez sumiu por tempo demais (vale o menor dos dois
 * prazos). Vem antes do `estado-sala` e do `retrato` `vez-passou` que mostram a vez nova, para o cliente
 * avisar quem perdeu.
 */
export interface MsgTempoEsgotado {
  readonly tipo: 'tempo-esgotado';
  /** Quem perdeu a vez. */
  readonly lugar: number;
  /** Quem tem a vez agora. */
  readonly proximo: number;
  /** `tempo`: o relógio da tacada; `ausencia`: o jogador estava desconectado. */
  readonly motivo: 'tempo' | 'ausencia';
  readonly consequencia: AoEsgotar;
}

/** O que mudou na carteira de quem estava num lugar quando a partida acabou. */
export interface VariacaoDaAposta {
  readonly lugar: number;
  /** O apelido de quem estava no lugar quando a partida começou. */
  readonly nome: string;
  /** Quanto a carteira ganhou (positivo) ou perdeu (negativo) com a partida; a soma das variações de uma partida é zero. */
  readonly delta: number;
  /** O saldo da carteira depois. */
  readonly saldo: number;
}

/**
 * O fim de uma partida apostada (L22): vem logo depois da `tacada-retransmitida` que a acabou e antes do `estado-sala` que
 * já leva os saldos novos, para a tela de fim mostrar "+20" / "−10". Só existe quando algum dinheiro mudou de mãos, ou
 * quando a aposta foi anulada. Quem não tem carteira não aparece (não apostou, não recebe).
 */
export interface MsgApostaPaga {
  readonly tipo: 'aposta-paga';
  /** A aposta da partida. */
  readonly valor: ApostaSala;
  /** Uma por lugar com carteira, em ordem de lugar; vazia quando `anulada`. */
  readonly variacoes: readonly VariacaoDaAposta[];
  /** `carteira-repetida`: a mesma carteira estava em dois lugares; ninguém pagou nem recebeu. */
  readonly anulada?: 'carteira-repetida';
}

/**
 * Missão do dia que andou numa tacada (L31), só para o dono da carteira (nenhum outro cliente recebe). Vem depois da
 * `tacada-retransmitida` e da `aposta-paga` e antes do `estado-sala`, que já leva o saldo com o prêmio.
 */
export interface MsgMissoes {
  readonly tipo: 'missoes';
  /** O quadro de missões depois da tacada. */
  readonly missoes: MissoesDoDia;
  /** As que fecharam nesta tacada (cada uma acabou de pagar o prêmio do nível dela (`premioDaMissao`)); vazia quando só andaram. */
  readonly cumpridas: readonly IdMissao[];
}

/** Quem decidiu a expulsão; por enquanto só o anfitrião, e o campo pode ganhar valores. */
export type MotivoExpulsao = 'anfitriao';

/**
 * Só para quem foi expulso (`expulsar` do anfitrião), logo antes de a sala fechar a conexão dele com o código 4002.
 * O cliente não reconecta nem guarda mais o token dessa sala; o link dela serve para entrar de novo, como entrada nova.
 */
export interface MsgExpulso {
  readonly tipo: 'expulso';
  readonly motivo?: MotivoExpulsao;
}

export interface MsgErro {
  readonly tipo: 'erro';
  readonly codigo: CodigoErro;
  readonly mensagem: string;
}

export interface MsgPong {
  readonly tipo: 'pong';
  /** O `t` do `ping` que se responde, sem mudança. */
  readonly t: number;
}

export type MensagemDaSala =
  | MsgBoasVindas
  | MsgEstadoSala
  | MsgRetrato
  | MsgTacadaRetransmitida
  | MsgMiraRetransmitida
  | MsgChatRetransmitido
  | MsgEmojiRetransmitido
  | MsgApostaPaga
  | MsgMissoes
  | MsgTempoEsgotado
  | MsgExpulso
  | MsgErro
  | MsgPong;

export type Mensagem = MensagemDoCliente | MensagemDaSala;
