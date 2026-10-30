import { LIMITES_PROTOCOLO, type TempoPorTacadaS } from '@sinuca/protocolo';

/**
 * O presente de teste (L34c): moedas que cada carteira ganha UMA vez por `rotulo`, na primeira vez que aparece (nova, ou antiga que
 * abre o jogo, `GET /carteira` ou entra numa sala). O rótulo é a marca guardada na carteira: trocar o rótulo paga de novo,
 * repetir o rótulo nunca paga duas vezes.
 */
export interface PresenteDeTeste {
  /** Inteiro de 1 a 1 000 000. */
  readonly valor: number;
  /** Letras minúsculas, dígitos, ponto, hífen e sublinhado (de 1 a 40, começando por letra ou dígito); é a chave guardada no `carteiras.json`. */
  readonly rotulo: string;
}

/**
 * O que o núcleo da sala (salas, regras, carteiras, HTTP da carteira) precisa saber, sem nada de processo, disco nem porta: é
 * o que as duas entradas (a sala Node e o Worker da Cloudflare) têm em comum. `ConfigSala` (config.ts) acrescenta porta, host e pastas.
 */
export interface ConfigDoNucleo {
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
  /** O presente de teste (L34c); `null` = desligado, o padrão: ninguém ganha nada. */
  readonly presenteDeTeste: PresenteDeTeste | null;
  /**
   * `SALDO_NO_BANCO=1` (L57): o Banco da Beco Games é o dono do saldo e a sinuca guarda o espelho e a caixa de saída. Desligado (o padrão),
   * não há caixa nem chamada ao Banco: tudo como sempre foi. Ligado exige o binding `CONTA` (Worker) ou o `BancoLocal` (sala Node).
   */
  readonly saldoNoBanco: boolean;
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

export const CONFIG_NUCLEO_PADRAO: ConfigDoNucleo = {
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
  presenteDeTeste: null,
  saldoNoBanco: false,
  missoesDiarias: true,
  lugarEsperaMs: 30_000,
  salaVaziaEsperaMs: 60_000,
  salaVaziaMs: 10 * 60_000,
  salaOciosaMs: 60 * 60_000,
  tickMs: 1000,
  relogioTacada: { tempoPadraoS: 30, margemAnimacaoMs: 3200, folgaMs: 1500, animacaoMaximaMs: 60_000 },
};

export function inteiro(env: Record<string, string | undefined>, chave: string, padrao: number, min: number, max: number): number {
  const bruto = env[chave];
  if (bruto === undefined) return padrao;
  const n = Number(bruto);
  if (bruto.trim() === '' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${chave}: precisa ser um inteiro entre ${min} e ${max} (veio "${bruto}")`);
  return n;
}

const ORIGEM = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

export function origens(env: Record<string, string | undefined>, padrao: readonly string[]): readonly string[] {
  const bruto = env.ORIGENS;
  if (bruto === undefined) return padrao;
  const lista = bruto.split(',').map((o) => o.trim()).filter((o) => o !== '');
  const ruim = lista.find((o) => !ORIGEM.test(o));
  if (ruim !== undefined) throw new Error(`ORIGENS: "${ruim}" não é uma origem (esquema://host[:porta], sem caminho nem barra no fim)`);
  return lista;
}

/** `0` ou `1`; ausente, o padrão; outro valor diz qual variável. */
export function ligado(env: Record<string, string | undefined>, chave: string, padrao: boolean): boolean {
  const bruto = env[chave];
  if (bruto === undefined) return padrao;
  if (bruto === '0') return false;
  if (bruto === '1') return true;
  throw new Error(`${chave}: use 0 ou 1 (veio "${bruto}")`);
}

/** Até 39 caracteres: a chave do presente no Banco é `sinuca:presente:<rótulo>:<id>` e tem de caber em 120 (`MAX_DO_ROTULO_DO_PRESENTE`). */
const FORMATO_DO_ROTULO = /^[a-z0-9][a-z0-9._-]{0,38}$/;

/**
 * `PRESENTE_DE_TESTE` (o valor) liga o presente e exige `PRESENTE_DE_TESTE_ROTULO` (a marca): sem rótulo a sala não sobe, para não
 * pagar duas vezes o mesmo presente por esquecimento. Sem `PRESENTE_DE_TESTE`, ou com `0`, o presente fica desligado (e um rótulo
 * sozinho é ignorado).
 */
export function presente(env: Record<string, string | undefined>): PresenteDeTeste | null {
  const valor = inteiro(env, 'PRESENTE_DE_TESTE', 0, 0, 1_000_000);
  if (valor === 0) return null;
  const rotulo = env.PRESENTE_DE_TESTE_ROTULO;
  if (rotulo === undefined) throw new Error('PRESENTE_DE_TESTE_ROTULO: obrigatório quando PRESENTE_DE_TESTE está ligado (ex.: PRESENTE_DE_TESTE_ROTULO=skins-cs)');
  if (!FORMATO_DO_ROTULO.test(rotulo)) throw new Error(`PRESENTE_DE_TESTE_ROTULO: use de 1 a 39 caracteres, minúsculas, dígitos, ponto, hífen e sublinhado, começando por letra ou dígito (veio "${rotulo}")`);
  return { valor, rotulo };
}

/**
 * Variáveis do núcleo: MAX_SALAS, MAX_SALAS_POR_IP, MAX_CONEXOES, MAX_CARTEIRAS, TOLERANCIA_VEZ_S, TETO_DA_VEZ_APOSTADA_S, MISSOES_DIARIAS
 * (`0` desliga), ORIGENS (lista separada por vírgula), PRESENTE_DE_TESTE e PRESENTE_DE_TESTE_ROTULO (L34c, o presente de teste: o valor
 * liga, o rótulo marca) e SALDO_NO_BANCO (L57, `1` liga o espelho e a caixa de saída do Banco). O resto é padrão. A sala Node lê o `process.env`; o Worker, os `vars` e `secrets` do Wrangler.
 */
export function configNucleoDoAmbiente(env: Record<string, string | undefined>): ConfigDoNucleo {
  const p = CONFIG_NUCLEO_PADRAO;
  return {
    ...p,
    maxCarteiras: inteiro(env, 'MAX_CARTEIRAS', p.maxCarteiras, 1, 1_000_000),
    maxSalas: inteiro(env, 'MAX_SALAS', p.maxSalas, 1, 10_000),
    maxSalasPorIp: inteiro(env, 'MAX_SALAS_POR_IP', p.maxSalasPorIp, 1, 10_000),
    origensPermitidas: origens(env, p.origensPermitidas),
    maxConexoes: inteiro(env, 'MAX_CONEXOES', p.maxConexoes, 1, 100_000),
    toleranciaVezMs: inteiro(env, 'TOLERANCIA_VEZ_S', p.toleranciaVezMs / 1000, 1, 86_400) * 1000,
    tetoDaVezApostadaMs: inteiro(env, 'TETO_DA_VEZ_APOSTADA_S', p.tetoDaVezApostadaMs / 1000, 1, 86_400) * 1000,
    presenteDeTeste: presente(env),
    saldoNoBanco: ligado(env, 'SALDO_NO_BANCO', p.saldoNoBanco),
    missoesDiarias: ligado(env, 'MISSOES_DIARIAS', p.missoesDiarias),
  };
}
