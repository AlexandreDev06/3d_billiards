/**
 * Só para testes: `ctx.storage.sql` e `ctx.storage.transactionSync` de mentira sobre o SQLite do Node (`node:sqlite`), com um registro de
 * tudo o que foi executado e um gancho para fazer uma escrita falhar (a cota de linhas do dia, o disco).
 */
import { DatabaseSync } from 'node:sqlite';
import type { CursorMinimo, SqlMinimo } from './carteiras-sqlite';

export interface BancoDeTeste {
  readonly db: DatabaseSync;
  readonly sql: SqlMinimo;
  readonly transacao: <T>(fn: () => T) => T;
  /** Todo comando que chegou ao banco, na ordem (leituras também). */
  readonly comandos: string[];
  /** Enquanto houver um padrão aqui, o INSERT/UPDATE/DELETE que casar com ele lança (e nada dele fica). `null` = tudo funciona. */
  falharQuando: RegExp | null;
}

/** Um banco de teste; passe um `DatabaseSync` já aberto para reabrir o mesmo banco com outro armazém (o objeto despejado e acordado de novo). */
export function banco(db: DatabaseSync = new DatabaseSync(':memory:')): BancoDeTeste {
  const b: BancoDeTeste = {
    db,
    comandos: [],
    falharQuando: null,
    sql: {
      exec(consulta, ...ligacoes): CursorMinimo {
        b.comandos.push(consulta);
        const st = db.prepare(consulta);
        if (st.columns().length > 0) {
          const linhas = st.all(...ligacoes) as Record<string, unknown>[];
          return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
        }
        if (b.falharQuando !== null && /^\s*(INSERT|DELETE|UPDATE)/i.test(consulta) && b.falharQuando.test(consulta)) throw new Error('cota de linhas escritas do dia');
        const r = st.run(...ligacoes);
        return { toArray: () => [], rowsRead: 0, rowsWritten: Number(r.changes) };
      },
    },
    transacao: <T>(fn: () => T): T => {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return b;
}

/** Os comandos que gravam ou apagam linhas (INSERT, UPDATE, DELETE, REPLACE) num trecho, sem espaço a mais; `CREATE TABLE IF NOT EXISTS` não conta. */
export const escritasDe = (comandos: readonly string[]): string[] => comandos.filter((c) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(c)).map((c) => c.replace(/\s+/g, ' ').trim());
