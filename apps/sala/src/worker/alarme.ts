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
 * Caixa de saída do saldo (L57, `SALDO_NO_BANCO=1`): com operações esperando o Banco o objeto também precisa acordar para drená-las.
 * O próximo alarm é o menor entre o tique da sala (se há sala) e a próxima tentativa da caixa (`proximaDaCaixa`), e cada disparo
 * começa mandando a caixa ao Banco. Com a caixa vazia (ou a chave desligada) nada disto muda.
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
  /** Quando a caixa de saída do Banco quer ser acordada (ms desde 1970), ou `null` se está vazia ou desligada. */
  readonly proximaDaCaixa?: () => number | null;
  /** Uma passada da caixa de saída pelo Banco. */
  readonly drenarCaixa?: () => Promise<void>;
  /** A varredura das contas excluídas pelo portal (L61); ela mesma só roda se passou uma hora desde a última. */
  readonly varrer?: () => Promise<unknown>;
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

  /** O instante do próximo alarm que faz falta: o menor entre o tique da sala (se há sala) e a próxima tentativa da caixa; `null` se nada pede alarm. */
  private quandoPrecisa(): number | null {
    const sala = this.deps.salasAbertas() > 0 ? this.deps.relogio() + this.deps.intervaloMs : null;
    const caixa = this.deps.proximaDaCaixa?.() ?? null;
    if (sala === null || caixa === null) return sala ?? caixa;
    return Math.min(sala, caixa);
  }

  /**
   * Chamado quando uma sala pode ter aparecido (a cada mensagem) ou a caixa mudou: arma o alarm se algo o pede e ainda não há um alarm
   * igual ou mais cedo. Nunca adia um alarm armado. A resposta só diz se a gravação do alarm falhou (o próximo chamado tenta de novo).
   */
  async aoHaverSala(): Promise<void> {
    const quando = this.quandoPrecisa();
    if (quando === null || (this.armadoPara !== null && this.armadoPara <= quando)) return;
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
    try {
      await this.deps.drenarCaixa?.();
    } catch (e) {
      this.deps.log('erro-interno', { tipo: 'alarme-caixa', erro: e instanceof Error ? e.message : 'desconhecido' });
    }
    try {
      await this.deps.varrer?.();
    } catch (e) {
      this.deps.log('erro-interno', { tipo: 'alarme-varredura', erro: e instanceof Error ? e.message : 'desconhecido' });
    }
    const quando = this.quandoPrecisa();
    if (quando === null) return;
    this.armadoPara = quando;
    try {
      await this.deps.armar(quando);
    } catch (e) {
      this.armadoPara = null;
      throw e;
    }
  }

  /** A última sala fechou: o alarm de sobra sai (idempotente, e não faz nada se não há alarm armado por aqui). A caixa de saída com o que enviar o mantém. */
  async aoFicarSemSala(): Promise<void> {
    if (this.armadoPara === null || this.deps.salasAbertas() > 0 || this.deps.proximaDaCaixa?.() != null) return;
    this.armadoPara = null;
    try {
      await this.deps.desarmar();
    } catch (e) {
      this.deps.log('erro-interno', { tipo: 'alarme-desarmar', erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }
}
