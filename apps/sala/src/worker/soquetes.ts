/**
 * Os WebSockets do `SalaDO` (L41b), sem o runtime: uma ligação por soquete (`LigacaoDaSala`), o que a sala Node faz sozinha com a
 * biblioteca `ws` e o Worker tem de fazer à mão, e a cota do dia.
 *
 * - **Tamanho** (igual ao `maxPayload` do `ws`): o que passa de `bytesPorMensagem` fecha com 1009 antes de ser codificado. No
 *   workerd o quadro chega inteiro (até 32 MiB), e sem este corte um soquete só mandaria 5 por segundo sem cair.
 * - **Cota por endereço**: cada mensagem recebida custa 1/20 de requisição ao objeto, seja qual for o conteúdo, e o balde da
 *   conexão (20/s) deixa 12 conexões do mesmo endereço gastarem 12 requisições por segundo. Um balde por IP, somando as conexões:
 *   esgotado, quem mandou a mensagem cai com 1008 (descartar calado não adianta: já foi cobrada).
 * - **Silêncio**: o Worker não pode pingar, então quem some sem fechar é achado por não dar sinal em 3 x `heartbeatMs` (75 s; o
 *   cliente pinga a cada 15 s) e é fechado com 4003. Fechar não basta: com o outro lado morto o handshake não volta e o
 *   `webSocketClose` pode nunca chegar, e a sala seguiria vendo o jogador conectado (a tolerância da vez nem começaria). Por isso
 *   toda queda decidida aqui também solta a ligação na hora, como o `terminate()` do Node dispara o `close` na hora.
 * - **Hibernação**: o último sinal de cada soquete vai no anexo (`serializeAttachment`, sobrevive à hibernação), e ao acordar
 *   `adotar` refaz a ligação de cada soquete com ele, para o silêncio enxergar quem voltou sem falar e não zerar a cada despertar.
 */
import { LigacaoDaSala } from '../ligacao';
import { BaldesPorChave } from '../limite-taxa';
import type { Logger } from '../log';
import type { OrigemDaQueda } from '../rastro';
import type { Registro } from '../registro';
import type { ConfigDoWorker } from './config-do-env';

const ABERTO = 1;


/** O que o `SalaDO` precisa de um WebSocket (o do workerd tem isto e mais). */
export interface SoqueteDoObjeto {
  readonly readyState: number;
  send(dado: string | ArrayBuffer | Uint8Array): void;
  close(codigo?: number, motivo?: string): void;
  serializeAttachment(valor: unknown): void;
  deserializeAttachment(): unknown;
}

/** O que cada WebSocket guarda para sobreviver à hibernação (no máximo 16 KiB; aqui são poucos bytes). */
export interface AnexoDoSoquete {
  /** A CHAVE do balde do IP (`ipDoCliente`). */
  readonly ip: string;
  /** Quando o cliente deu o último sinal (ms do relógio da sala), para o silêncio sobreviver à hibernação. */
  readonly sinalEm?: number;
}

export interface DependenciasDosSoquetes {
  readonly config: ConfigDoWorker;
  readonly registro: Registro;
  readonly relogio: () => number;
  readonly log: Logger;
}

/** Quantas conexões a sala encerrou por cada causa, desde que o objeto acordou (vai ao `/admin/uso`). */
export interface EncerradosPorCausa {
  tamanho: number;
  cotaPorIp: number;
  silencio: number;
}

/** Por que a sala encerra uma conexão por conta própria: o que o rastro anota, o código de fechamento e o motivo (até 123 bytes). */
const CAUSAS = {
  /** Como o `ws` do Node fecha o que passa de `maxPayload`. */
  tamanho: { origem: 'tamanho', codigo: 1009, motivo: 'Mensagem grande demais.' },
  /** Política violada: o endereço gastou a cota de mensagens. */
  cotaPorIp: { origem: 'cota-por-ip', codigo: 1008, motivo: 'Mensagens demais deste endereço.' },
  /** De 4000 a 4999 é do aplicativo. */
  silencio: { origem: 'heartbeat', codigo: 4003, motivo: 'Sem sinal do cliente.' },
} as const satisfies Record<keyof EncerradosPorCausa, { origem: OrigemDaQueda; codigo: number; motivo: string }>;

/** Fechar um WebSocket que já caiu lança; quem fecha não quer saber. */
export function fecharSemErro(ws: Pick<SoqueteDoObjeto, 'close'>, codigo: number, motivo: string): void {
  try {
    ws.close(codigo, motivo);
  } catch {
    // já fechado
  }
}

export class SoquetesDaSala {
  private readonly ligacoes = new Map<SoqueteDoObjeto, LigacaoDaSala>();
  private readonly encerrados = new WeakSet<SoqueteDoObjeto>();
  private readonly mensagensPorIp: BaldesPorChave;
  readonly encerradosPorCausa: EncerradosPorCausa = { tamanho: 0, cotaPorIp: 0, silencio: 0 };

  constructor(private readonly deps: DependenciasDosSoquetes) {
    const { mensagensPorIp } = deps.config;
    this.mensagensPorIp = new BaldesPorChave(mensagensPorIp.capacidade, mensagensPorIp.porSegundo, deps.relogio);
  }

  /** Quantas ligações a sala acompanha. */
  get total(): number {
    return this.ligacoes.size;
  }

  /**
   * Algum endereço ainda está devendo ao balde de mensagens. Enquanto isso o objeto não pode hibernar: a hibernação zera a
   * memória, e quem esvaziou o balde, parando 10 s, o receberia cheio de novo (o objeto fica acordado pelo tick até recarregar).
   */
  get comDivida(): boolean {
    return this.mensagensPorIp.tamanho > 0;
  }

  /** Quantos endereços têm balde de mensagens (cheio ou não). */
  get enderecosComBalde(): number {
    return this.mensagensPorIp.tamanho;
  }

  /** Esquece os baldes que já voltaram a ficar cheios; roda a cada tick. */
  limpar(): void {
    this.mensagensPorIp.limparCheios();
  }

  /** A ligação deste WebSocket; depois de uma hibernação ela não existe mais na memória e é refeita do anexo (o IP e o último sinal). */
  adotar(ws: SoqueteDoObjeto): LigacaoDaSala {
    let ligacao = this.ligacoes.get(ws);
    if (ligacao) return ligacao;
    const { config, registro, relogio, log } = this.deps;
    const anexo = ws.deserializeAttachment() as Partial<AnexoDoSoquete> | null;
    ligacao = new LigacaoDaSala({
      config,
      registro,
      relogio,
      log,
      ip: anexo?.ip ?? 'desconhecido',
      ...(typeof anexo?.sinalEm === 'number' ? { sinalEm: anexo.sinalEm } : {}),
      soquete: {
        aberto: () => ws.readyState === ABERTO,
        enviar: (dado) => ws.send(dado),
        fechar: (codigo, motivo) => fecharSemErro(ws, codigo, motivo),
        // não há como derrubar sem handshake: o outro lado fecha em seguida
        derrubar: () => fecharSemErro(ws, 1011, 'Conexão encerrada.'),
        presos: () => 0,
      },
    });
    this.ligacoes.set(ws, ligacao);
    return ligacao;
  }

  /** Uma mensagem chegou ao objeto (`webSocketMessage`). */
  aoReceber(ws: SoqueteDoObjeto, mensagem: string | ArrayBuffer): void {
    // Já encerrado por aqui (ou fechando): o que ainda chega na fila do soquete não vale nada, nem recria a ligação
    if (this.encerrados.has(ws) || ws.readyState !== ABERTO) return;
    const ligacao = this.adotar(ws);
    const { config, relogio } = this.deps;
    // Toda mensagem custa à cota do dia, mesmo a que a sala recusa: conta antes de olhar o que ela é
    if (!this.mensagensPorIp.tentar(ligacao.conn.ip)) return this.encerrar(ws, ligacao, 'cotaPorIp');
    const binario = typeof mensagem !== 'string';
    // Um texto de N unidades UTF-16 tem ao menos N bytes em UTF-8: se N já passa do teto, não há o que codificar
    if ((binario ? mensagem.byteLength : mensagem.length) > config.bytesPorMensagem) return this.encerrar(ws, ligacao, 'tamanho');
    const bruto = binario ? new Uint8Array(mensagem) : new TextEncoder().encode(mensagem);
    if (bruto.length > config.bytesPorMensagem) return this.encerrar(ws, ligacao, 'tamanho');
    ligacao.aoReceber(bruto, binario);
    this.guardarSinal(ws, ligacao.conn.ip, relogio());
  }

  /** O soquete fechou ou deu erro (`webSocketClose`, `webSocketError`). */
  aoFechar(ws: SoqueteDoObjeto, codigo: number, motivo: string): void {
    this.soltar(ws, codigo, motivo);
  }

  /** Fecha e solta quem passou de 3 x `heartbeatMs` sem dar sinal. Roda a cada tick e a cada conexão nova. */
  vigiarSilencio(): void {
    const limiteDeSilencio = 3 * this.deps.config.heartbeatMs;
    for (const [ws, ligacao] of this.ligacoes) {
      if (ligacao.rastro.silencioMs() <= limiteDeSilencio) continue;
      this.encerrar(ws, ligacao, 'silencio');
    }
  }

  /**
   * O servidor decide encerrar: anota a causa no rastro (o log `saiu` a mostra), fecha com handshake e, sem esperar o outro
   * lado, solta a ligação, para a sala ver o jogador sair já. O `webSocketClose` que vier depois não acha mais a ligação.
   */
  private encerrar(ws: SoqueteDoObjeto, ligacao: LigacaoDaSala, causa: keyof EncerradosPorCausa): void {
    const { origem, codigo, motivo } = CAUSAS[causa];
    this.encerradosPorCausa[causa]++;
    ligacao.rastro.encerrando(origem, 0);
    this.encerrados.add(ws);
    fecharSemErro(ws, codigo, motivo);
    this.soltar(ws, codigo, motivo);
  }

  private soltar(ws: SoqueteDoObjeto, codigo: number, motivo: string): void {
    const ligacao = this.ligacoes.get(ws);
    if (!ligacao) return;
    this.ligacoes.delete(ws);
    ligacao.aoFechar(codigo, motivo);
  }

  private guardarSinal(ws: SoqueteDoObjeto, ip: string, agora: number): void {
    if (ws.readyState !== ABERTO) return;
    try {
      ws.serializeAttachment({ ip, sinalEm: agora } satisfies AnexoDoSoquete);
    } catch {
      // soquete que fechou entre a conferência e a gravação: o anexo não importa mais
    }
  }
}
