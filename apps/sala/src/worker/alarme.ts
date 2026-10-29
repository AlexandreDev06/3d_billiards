/**
 * O alarm que segura o objeto na memória enquanto há sala aberta (L41b).
 *
 * As salas e as partidas vivem na memória do Durable Object. A doc do ciclo de vida diz que um objeto parado que não pode
 * hibernar (e com sala aberta ele não pode: o `setInterval` do tick impede) é despejado 70 a 140 s depois do último pedido ou
 * evento, e que um `setInterval` pendente segura a memória por no máximo 15 minutos desde que foi criado, não para sempre.
 * Com todos da sala sem rede (o Wi-Fi da casa caiu, as abas congelaram) a sala some em uns 2 minutos, mais cedo do que no Node
 * (`salaVaziaMs`, 10 min). Um alarm é um evento: rearmado a cada `intervaloMs` (45 s, abaixo dos 70 s do despejo mais cedo), o
 * objeto não fica ocioso por tempo bastante para ser despejado.
 *
 * Só há alarm com sala aberta. Sem sala nada o segura, e um alarm de sobra acordaria um objeto que dorme (e o acordar lê as
 * carteiras todas, até 10 000 linhas).
 *
 * Custo (docs oficiais: cada disparo é uma requisição ao objeto e cada `setAlarm` é uma linha escrita): no máximo
 * 86 400 / 45 = 1 920 requisições e 1 920 linhas por dia, e só nas horas em que há sala aberta.
 */
import type { Logger } from '../log';

export interface DependenciasDoAlarme {
  /** De quanto em quanto tempo o alarm se rearma enquanto há sala. */
  readonly intervaloMs: number;
  readonly relogio: () => number;
  /** Quantas salas o `Registro` tem agora. */
  readonly salasAbertas: () => number;
  /** `ctx.storage.setAlarm`: substitui o alarm que existir. */
  readonly armar: (quando: number) => Promise<void>;
  /** `ctx.storage.deleteAlarm`. */
  readonly desarmar: () => Promise<void>;
  readonly log: Logger;
}

export class AlarmeDaSala {
  private armadoPara: number | null = null;
  private disparosTotal = 0;

  constructor(private readonly deps: DependenciasDoAlarme) {}

  /** Quando o próximo alarm dispara (ms desde 1970), ou `null` se não há alarm armado por aqui. */
  get proximoEm(): number | null {
    return this.armadoPara;
  }

  /** Quantas vezes o alarm disparou desde que o objeto acordou. */
  get disparos(): number {
    return this.disparosTotal;
  }

  /**
   * Chamado quando uma sala pode ter aparecido (a cada mensagem): arma o alarm se há sala e ainda não há alarm. Não faz nada
   * se já está armado ou se não há sala. A resposta só diz se a gravação do alarm falhou (o próximo chamado tenta de novo).
   */
  async aoHaverSala(): Promise<void> {
    if (this.armadoPara !== null || this.deps.salasAbertas() === 0) return;
    const quando = this.deps.relogio() + this.deps.intervaloMs;
    this.armadoPara = quando;
    try {
      await this.deps.armar(quando);
    } catch (e) {
      if (this.armadoPara === quando) this.armadoPara = null;
      this.deps.log('erro-interno', { tipo: 'alarme-armar', erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }

  /**
   * O alarm disparou. Com sala aberta, rearma; sem sala, deixa morrer. Se o rearmar falhar, a exceção sobe: o runtime tenta o
   * `alarm()` de novo com espera crescente, que é o que se quer (um alarm perdido com sala aberta é o despejo que isto evita).
   */
  async aoDisparar(): Promise<void> {
    this.disparosTotal++;
    this.armadoPara = null;
    if (this.deps.salasAbertas() === 0) return;
    const quando = this.deps.relogio() + this.deps.intervaloMs;
    this.armadoPara = quando;
    try {
      await this.deps.armar(quando);
    } catch (e) {
      this.armadoPara = null;
      throw e;
    }
  }

  /** A última sala fechou: o alarm de sobra sai (idempotente, e não faz nada se não há alarm armado por aqui). */
  async aoFicarSemSala(): Promise<void> {
    if (this.armadoPara === null || this.deps.salasAbertas() > 0) return;
    this.armadoPara = null;
    try {
      await this.deps.desarmar();
    } catch (e) {
      this.deps.log('erro-interno', { tipo: 'alarme-desarmar', erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }
}
