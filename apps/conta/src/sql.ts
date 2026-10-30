/** O cursor que `SqlStorage.exec` devolve: só o que se usa aqui. `rowsRead` e `rowsWritten` valem depois de consumido. */
export interface CursorMinimo {
  toArray(): Record<string, unknown>[];
  readonly rowsRead: number;
  readonly rowsWritten: number;
}

/** O pedaço de `ctx.storage.sql` que o núcleo usa; nos testes, `node:sqlite` por trás (para-testes.ts). */
export interface SqlMinimo {
  exec(consulta: string, ...ligacoes: (string | number | null)[]): CursorMinimo;
}

/** Roda `fn` numa transação síncrona (`ctx.storage.transactionSync`): se lançar, nada do que ela escreveu fica. Sem `await` dentro. */
export type Transacao = <T>(fn: () => T) => T;

/**
 * Faz a transação ser reentrante: a de fora chama `base`, e uma chamada de dentro (com a profundidade > 0) só roda `fn()`, sem
 * SAVEPOINT. O `transactionSync` do Durable Object não garante transação aninhada, então é assim que `Moedas` roda dentro de `Contas`:
 * uma exceção de dentro sobe até a de fora, que desfaz tudo. Quem usa nunca captura a exceção de uma operação de dentro para seguir.
 */
export function transacaoReentrante(base: Transacao): Transacao {
  let profundidade = 0;
  return <T>(fn: () => T): T => {
    if (profundidade > 0) return fn();
    profundidade++;
    try {
      return base(fn);
    } finally {
      profundidade--;
    }
  };
}
