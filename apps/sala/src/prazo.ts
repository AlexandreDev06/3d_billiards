/**
 * O prazo da vez em curso: quando o tempo de quem joga acaba. Sem timers: o tempo entra como argumento
 * (o relógio da sala), então tudo é determinístico nos testes.
 */
export class PrazoDaVez {
  private fim: number | null = null;

  /** `tempoS` nulo = sem limite. `folgaMs`: a tacada que chega até tanto depois do fim ainda vale. */
  constructor(
    private readonly tempoS: number | null,
    private readonly folgaMs: number,
  ) {}

  /**
   * O tempo de quem joga começa a correr em `inicio` (ms do relógio da sala). `tetoMs`: a vez nunca passa disso, nem numa sala
   * sem limite (a partida que vale moeda); o que for menor entre o relógio e o teto vale. Cada chamada decide de novo.
   */
  iniciar(inicio: number, tetoMs: number | null = null): void {
    const duracoes = [this.tempoS === null ? null : this.tempoS * 1000, tetoMs].filter((d): d is number => d !== null);
    this.fim = duracoes.length === 0 ? null : inicio + Math.min(...duracoes);
  }

  /** Sem vez em curso (espera ou partida terminada). */
  parar(): void {
    this.fim = null;
  }

  /** Quanto falta (ms inteiros, nunca negativo); `null` sem prazo. */
  restanteMs(agora: number): number | null {
    return this.fim === null ? null : Math.max(0, Math.round(this.fim - agora));
  }

  /** Instante a partir do qual a vez é tirada de quem a tem (fim + folga); `null` sem prazo. */
  get vencimento(): number | null {
    return this.fim === null ? null : this.fim + this.folgaMs;
  }

  venceu(agora: number): boolean {
    return this.fim !== null && agora >= this.fim + this.folgaMs;
  }
}
