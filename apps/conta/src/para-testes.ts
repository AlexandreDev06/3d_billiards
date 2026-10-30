/**
 * Só para testes: `ctx.storage.sql` e `ctx.storage.transactionSync` de mentira sobre o SQLite do Node (`node:sqlite`), com o esquema
 * aplicado e um registro de tudo o que foi executado; mais o relógio e o aleatório fixos.
 */
import { DatabaseSync } from 'node:sqlite';
import { criarEsquema } from './esquema';
import type { Carteiro, MensagemDeEmail } from './carteiro';
import type { Aleatorio } from './cripto';
import { transacaoReentrante, type CursorMinimo, type SqlMinimo, type Transacao } from './sql';

export interface BancoDeTeste {
  readonly db: DatabaseSync;
  readonly sql: SqlMinimo;
  readonly transacao: Transacao;
  /** Todo comando que chegou ao banco, na ordem (leituras também). */
  readonly comandos: string[];
}

export function bancoDeTeste(db: DatabaseSync = new DatabaseSync(':memory:')): BancoDeTeste {
  const comandos: string[] = [];
  const sql: SqlMinimo = {
    exec(consulta, ...ligacoes): CursorMinimo {
      comandos.push(consulta);
      const st = db.prepare(consulta);
      if (st.columns().length > 0) {
        const linhas = st.all(...ligacoes) as Record<string, unknown>[];
        return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
      }
      const r = st.run(...ligacoes);
      return { toArray: () => [], rowsRead: 0, rowsWritten: Number(r.changes) };
    },
  };
  // Como o `transactionSync` do Durable Object: BEGIN/COMMIT/ROLLBACK simples, sem SAVEPOINT. A reentrância (Moedas dentro de Contas) é
  // a de `transacaoReentrante`, a mesma que o objeto usa em produção.
  const simples: Transacao = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const transacao = transacaoReentrante(simples);
  criarEsquema(sql);
  comandos.length = 0;
  return { db, sql, transacao, comandos };
}

/** Os comandos que gravam ou apagam linhas (INSERT, UPDATE, DELETE, REPLACE), com os espaços normalizados. */
export const escritasDe = (comandos: readonly string[]): string[] =>
  comandos.filter((c) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(c)).map((c) => c.replace(/\s+/g, ' ').trim());

export function relogioFalso(inicio = 1_800_000_000_000): { agora: () => number; avancar: (ms: number) => void } {
  let t = inicio;
  return { agora: () => t, avancar: (ms) => void (t += ms) };
}

/** Bytes determinísticos (mulberry32) a partir de uma semente: o mesmo número, a mesma sequência. */
export function aleatorioFixo(semente: number): Aleatorio {
  let s = semente >>> 0;
  const proximo = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 0xff;
  };
  return (n) => Uint8Array.from({ length: n }, proximo);
}

/** O carteiro de mentira: guarda o que seria enviado e responde `resposta` (200 por padrão). */
export function carteiroFalso(resposta: { ok: boolean; status: number } = { ok: true, status: 200 }): { carteiro: Carteiro; enviados: MensagemDeEmail[] } {
  const enviados: MensagemDeEmail[] = [];
  return {
    carteiro: {
      async enviar(m) {
        enviados.push(m);
        return resposta;
      },
    },
    enviados,
  };
}
