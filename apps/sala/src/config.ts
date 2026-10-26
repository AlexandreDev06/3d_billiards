import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITES_PROTOCOLO, type TempoPorTacadaS } from '@sinuca/protocolo';

export interface ConfigSala {
  readonly porta: number;
  /**
   * Só a máquina local: o ngrok encaminha para cá. O limite por IP confia no `X-Forwarded-For`,
   * então só abra para a rede (`HOST=0.0.0.0`) atrás de um proxy seu.
   */
  readonly host: string;
  /** Build do apps/web. */
  readonly pastaWeb: string;
  /** Onde ficam as carteiras (L22), um arquivo JSON. As salas ficam na memória; isto é o que sobrevive a reinício. */
  readonly pastaDados: string;
  /** Carteiras guardadas ao todo; passou disto, `POST /carteira` responde `limite` (503). */
  readonly maxCarteiras: number;
  /** Limites e tempos do HTTP da carteira (`/carteira`), todos por balde (rajada e ritmo por segundo). */
  readonly carteira: {
    /** Carteiras novas por IP (IPv6 por /64, IPv4 mapeado como IPv4): poucas por hora. */
    readonly criarPorIp: { readonly capacidade: number; readonly porSegundo: number };
    /** Qualquer requisição a `/carteira` por IP, para o custo de tudo o que não tem carteira para contar. */
    readonly requisicoesPorIp: { readonly capacidade: number; readonly porSegundo: number };
    /** Código que não existe, por IP: esgotado, a resposta vira `limite` (adivinhar código não rende). */
    readonly falhasPorIp: { readonly capacidade: number; readonly porSegundo: number };
    /** Ler, comprar e usar, por carteira (só as que existem têm balde). */
    readonly operacoesPorCarteira: { readonly capacidade: number; readonly porSegundo: number };
    /** Espera entre a mudança de uma carteira e a gravação em disco. */
    readonly atrasoGravacaoMs: number;
    /** Tempo para o corpo de uma requisição chegar inteiro; depois disto, 408 e a conexão cai. */
    readonly tempoDoCorpoMs: number;
    /** Ao subir, quanto esperar o dono anterior da pasta de dados soltar a trava (o servidor que está saindo) antes de desistir. */
    readonly esperaTravaMs: number;
  };
  readonly maxSalas: number;
  readonly maxConexoes: number;
  readonly maxConexoesPorIp: number;
  /** Conexões novas por IP: rajada e ritmo (por minuto = `porSegundo × 60`). A tolerância por conexão zera a cada reconexão; isto não. */
  readonly conexoesNovasPorIp: { readonly capacidade: number; readonly porSegundo: number };
  /** Falhas de entrada (código de sala que não existe) por IP, somando todas as conexões dele. */
  readonly falhasPorIp: { readonly capacidade: number; readonly porSegundo: number };
  /** Salas abertas ao mesmo tempo por IP. */
  readonly maxSalasPorIp: number;
  /**
   * Origin aceitos no upgrade (o navegador sempre manda). Além destes, o próprio servidor aceita
   * `http://localhost:<porta>` e `http://127.0.0.1:<porta>` da porta em que escuta.
   */
  readonly origensPermitidas: readonly string[];
  /** Espectadores por sala, além dos 4 lugares. */
  readonly maxEspectadores: number;
  readonly bytesPorMensagem: number;
  /** Cada mensagem gasta `1 + bytes / bytesPorFicha` fichas do balde da conexão: mensagem grande custa mais. */
  readonly bytesPorFicha: number;
  /** Mensagens por conexão: rajada e ritmo sustentado (mira ao vivo ~10/s). */
  readonly mensagens: { readonly capacidade: number; readonly porSegundo: number };
  /** Chat por participante. */
  readonly chat: { readonly capacidade: number; readonly porSegundo: number };
  /** Emojis por participante, balde à parte do chat; estourou, a sala descarta calada. O padrão é o do protocolo (o cliente segura o envio com os mesmos números). */
  readonly emoji: { readonly capacidade: number; readonly porSegundo: number };
  /** Excessos tolerados antes de derrubar a conexão (rajada e recarga por segundo). */
  readonly tolerancia: { readonly capacidade: number; readonly porSegundo: number };
  readonly heartbeatMs: number;
  /** Jogador da vez ausente por tanto tempo perde a vez. */
  readonly toleranciaVezMs: number;
  /**
   * Quando a partida vale moeda (aposta com contraparte com carteira), a vez de quem está conectado não passa disto, nem numa
   * sala "sem limite": quem está perdendo não segura o pote sem tacar. Passa como um tempo esgotado. Relógio menor, vale o relógio.
   */
  readonly tetoDaVezApostadaMs: number;
  /** As missões diárias (L31) andam e pagam. Desligada, a carteira ainda mostra o quadro do dia, mas nada conta nem paga. */
  readonly missoesDiarias: boolean;
  /** Na espera, quem caiu libera o lugar depois disto (o anfitrião nunca). */
  readonly lugarEsperaMs: number;
  /** Sala que nunca saiu da espera e ficou sem ninguém conectado some depois disto (quem abre e vai embora não segura vaga). */
  readonly salaVaziaEsperaMs: number;
  /** Sala com partida e sem ninguém conectado há tanto tempo some. */
  readonly salaVaziaMs: number;
  /** Sala sem jogada, chat, emoji nem lugar há tanto tempo some, mesmo com gente conectada. */
  readonly salaOciosaMs: number;
  readonly tickMs: number;
  /** Relógio da tacada (o tempo em si o anfitrião escolhe ao criar a sala). */
  readonly relogioTacada: {
    /** Tempo por tacada de quem não escolhe; `null` = sem limite. */
    readonly tempoPadraoS: TempoPorTacadaS | null;
    /** Depois que a gravação da tacada termina, o prazo da vez só começa depois disto (a animação tem rabo: queda na caçapa, parada). */
    readonly margemAnimacaoMs: number;
    /** A tacada que chega até tanto depois do prazo ainda vale (rede); só então a vez passa. */
    readonly folgaMs: number;
    /** A duração declarada numa gravação conta até aqui (a física corta em 60 s): o cliente não segura o relógio do próximo. */
    readonly animacaoMaximaMs: number;
  };
}

export const CONFIG_SALA_PADRAO: ConfigSala = {
  porta: 8001,
  host: '127.0.0.1',
  pastaWeb: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  pastaDados: fileURLToPath(new URL('../dados', import.meta.url)),
  maxCarteiras: 10_000,
  carteira: {
    criarPorIp: { capacidade: 3, porSegundo: 3 / 3600 },
    requisicoesPorIp: { capacidade: 30, porSegundo: 30 / 60 },
    falhasPorIp: { capacidade: 10, porSegundo: 10 / 600 },
    operacoesPorCarteira: { capacidade: 20, porSegundo: 20 / 60 },
    atrasoGravacaoMs: 250,
    tempoDoCorpoMs: 5000,
    esperaTravaMs: 10_000,
  },
  maxSalas: 20,
  maxConexoes: 80,
  maxConexoesPorIp: 12,
  conexoesNovasPorIp: { capacidade: 15, porSegundo: 15 / 60 },
  falhasPorIp: { capacidade: 30, porSegundo: 30 / 600 },
  maxSalasPorIp: 3,
  origensPermitidas: [
    'https://mayfly-one-mainly.ngrok-free.app',
    'http://localhost:8001',
    'http://127.0.0.1:8001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ],
  maxEspectadores: 8,
  bytesPorMensagem: 512 * 1024,
  bytesPorFicha: 16 * 1024,
  mensagens: { capacidade: 40, porSegundo: 20 },
  chat: { capacidade: 5, porSegundo: 1 },
  emoji: { capacidade: LIMITES_PROTOCOLO.emojiRajada, porSegundo: LIMITES_PROTOCOLO.emojiPorSegundo },
  tolerancia: { capacidade: 100, porSegundo: 5 },
  heartbeatMs: 25_000,
  toleranciaVezMs: 60_000,
  tetoDaVezApostadaMs: 120_000,
  missoesDiarias: true,
  lugarEsperaMs: 30_000,
  salaVaziaEsperaMs: 60_000,
  salaVaziaMs: 10 * 60_000,
  salaOciosaMs: 60 * 60_000,
  tickMs: 1000,
  relogioTacada: { tempoPadraoS: 30, margemAnimacaoMs: 3200, folgaMs: 1500, animacaoMaximaMs: 60_000 },
};

function inteiro(env: Record<string, string | undefined>, chave: string, padrao: number, min: number, max: number): number {
  const bruto = env[chave];
  if (bruto === undefined) return padrao;
  const n = Number(bruto);
  if (bruto.trim() === '' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${chave}: precisa ser um inteiro entre ${min} e ${max} (veio "${bruto}")`);
  return n;
}

const ORIGEM = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

function origens(env: Record<string, string | undefined>, padrao: readonly string[]): readonly string[] {
  const bruto = env.ORIGENS;
  if (bruto === undefined) return padrao;
  const lista = bruto.split(',').map((o) => o.trim()).filter((o) => o !== '');
  const ruim = lista.find((o) => !ORIGEM.test(o));
  if (ruim !== undefined) throw new Error(`ORIGENS: "${ruim}" não é uma origem (esquema://host[:porta], sem caminho nem barra no fim)`);
  return lista;
}

function pasta(env: Record<string, string | undefined>, chave: string, padrao: string): string {
  const bruto = env[chave];
  if (bruto === undefined) return padrao;
  if (bruto.trim() === '') throw new Error(`${chave}: não pode ser vazia`);
  return resolve(bruto);
}

/** `0` ou `1`; ausente, o padrão; outro valor diz qual variável. */
function ligado(env: Record<string, string | undefined>, chave: string, padrao: boolean): boolean {
  const bruto = env[chave];
  if (bruto === undefined) return padrao;
  if (bruto === '0') return false;
  if (bruto === '1') return true;
  throw new Error(`${chave}: use 0 ou 1 (veio "${bruto}")`);
}

/**
 * Variáveis aceitas: PORT, HOST, PASTA_WEB, PASTA_DADOS, MAX_SALAS, MAX_SALAS_POR_IP, MAX_CONEXOES, MAX_CARTEIRAS, TOLERANCIA_VEZ_S,
 * TETO_DA_VEZ_APOSTADA_S, MISSOES_DIARIAS (`0` desliga), ORIGENS (lista separada por vírgula). O resto é padrão.
 *
 * `PASTA_DADOS` relativa resolve a partir da pasta em que o processo roda, que com `pnpm online` e `pnpm --filter @sinuca/sala dev`
 * é `apps/sala` (o pnpm roda o script na pasta do pacote): prefira um caminho absoluto. Cada pasta tem um servidor só (trava).
 */
export function configDoAmbiente(env: Record<string, string | undefined>): ConfigSala {
  const p = CONFIG_SALA_PADRAO;
  return {
    ...p,
    porta: inteiro(env, 'PORT', p.porta, 1, 65535),
    host: env.HOST ?? p.host,
    pastaWeb: env.PASTA_WEB ?? p.pastaWeb,
    pastaDados: pasta(env, 'PASTA_DADOS', p.pastaDados),
    maxCarteiras: inteiro(env, 'MAX_CARTEIRAS', p.maxCarteiras, 1, 1_000_000),
    maxSalas: inteiro(env, 'MAX_SALAS', p.maxSalas, 1, 10_000),
    maxSalasPorIp: inteiro(env, 'MAX_SALAS_POR_IP', p.maxSalasPorIp, 1, 10_000),
    origensPermitidas: origens(env, p.origensPermitidas),
    maxConexoes: inteiro(env, 'MAX_CONEXOES', p.maxConexoes, 1, 100_000),
    toleranciaVezMs: inteiro(env, 'TOLERANCIA_VEZ_S', p.toleranciaVezMs / 1000, 1, 86_400) * 1000,
    tetoDaVezApostadaMs: inteiro(env, 'TETO_DA_VEZ_APOSTADA_S', p.tetoDaVezApostadaMs / 1000, 1, 86_400) * 1000,
    missoesDiarias: ligado(env, 'MISSOES_DIARIAS', p.missoesDiarias),
  };
}
