/**
 * O que a sala sabe de uma conexão para explicar por que ela caiu: quanto durou, quando o cliente deu o último
 * sinal, quem encerrou e quantos bytes estavam presos no envio. Sem timers: o tempo vem do relógio injetado.
 */

/**
 * `heartbeat`: o servidor derrubou por falta de resposta ao ping (no Worker, por silêncio); `envio-lento`: o buffer de envio
 * estourou; `tolerancia`: o cliente gastou a tolerância de recusas; `tamanho` (só no Worker, L41b): a mensagem passou de
 * `bytesPorMensagem` (o `ws` do Node fecha esse com 1009 sozinho); `cota-por-ip` (só no Worker, L41b): o endereço gastou o
 * balde de mensagens de todas as suas conexões; `cliente-ou-rede`: ninguém do servidor encerrou (fechou a aba, a rede sumiu, o
 * navegador travou).
 */
export type OrigemDaQueda = 'cliente-ou-rede' | 'heartbeat' | 'envio-lento' | 'tolerancia' | 'tamanho' | 'cota-por-ip';

export interface DetalheDeSaida {
  /** Código de fechamento do WebSocket (1006 = a conexão sumiu sem fechar direito). */
  readonly codigo: number;
  /** Texto de fechamento, sem controle e com até 60 caracteres. */
  readonly motivo: string;
  readonly duracaoMs: number;
  readonly origem: OrigemDaQueda;
  /** O maior acúmulo visto no buffer de envio (amostrado a cada heartbeat e ao encerrar). */
  readonly presosNoEnvio: number;
  /** Tempo desde a última mensagem ou pong do cliente. */
  readonly silencioMs: number;
}

const MOTIVO_MAXIMO = 60;

/** Troca por espaço os caracteres de controle (evita que o motivo quebre ou forje uma linha do log). */
function semControle(texto: string): string {
  return Array.from(texto, (c) => {
    const k = c.codePointAt(0)!;
    return k <= 0x1f || (k >= 0x7f && k <= 0x9f) ? ' ' : c;
  }).join('');
}

export class RastroDaConexao {
  private readonly nasceuEm: number;
  private ultimoSinal: number;
  private origem: OrigemDaQueda = 'cliente-ou-rede';
  private presos = 0;

  /** `ultimoSinal`: quando o cliente deu o último sinal, se já se sabe (o Worker o guarda no anexo do soquete e o recupera ao acordar da hibernação). */
  constructor(
    private readonly relogio: () => number,
    ultimoSinal?: number,
  ) {
    this.nasceuEm = relogio();
    this.ultimoSinal = ultimoSinal ?? this.nasceuEm;
  }

  /** O cliente deu sinal de vida (mensagem ou pong). */
  sinal(): void {
    this.ultimoSinal = this.relogio();
  }

  /** Há quanto tempo o cliente não dá sinal (ms); o transporte que não pode pingar (o Worker) derruba o que passa do limite dele. */
  silencioMs(): number {
    return this.relogio() - this.ultimoSinal;
  }

  amostrar(presosAgora: number): void {
    if (presosAgora > this.presos) this.presos = presosAgora;
  }

  /** O servidor vai encerrar a conexão por esta causa; só a primeira vale, as seguintes são consequência dela. */
  encerrando(origem: Exclude<OrigemDaQueda, 'cliente-ou-rede'>, presosAgora: number): void {
    if (this.origem === 'cliente-ou-rede') this.origem = origem;
    this.amostrar(presosAgora);
  }

  saida(codigo: number, motivo: Uint8Array | string, presosAgora: number): DetalheDeSaida {
    this.amostrar(presosAgora);
    const agora = this.relogio();
    const texto = semControle(typeof motivo === 'string' ? motivo : new TextDecoder().decode(motivo));
    return {
      codigo,
      motivo: [...texto].slice(0, MOTIVO_MAXIMO).join(''),
      duracaoMs: agora - this.nasceuEm,
      origem: this.origem,
      presosNoEnvio: this.presos,
      silencioMs: agora - this.ultimoSinal,
    };
  }
}
