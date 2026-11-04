/**
 * O construtor do `SalaDO` (L66b), sem o workerd: `cloudflare:workers` é trocado por uma classe vazia e o `ctx` é de mentira (SQLite do Node).
 * O que se prova aqui é que ao acordar o objeto migra os anexos antigos de TODOS os soquetes abertos, dentro do `blockConcurrencyWhile`, e só então
 * os adota: trocar `adotarTodos` por um laço de `adotar` deixa o token em claro no anexo.
 */
import { describe, expect, it, vi } from 'vitest';
import { banco } from '../para-testes-sqlite';
import { resumoDaSessao } from '../sessao-da-conta';
import type { SoqueteDoObjeto } from './soquetes';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    readonly ctx: unknown;
    readonly env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

class SoqueteDeAnexo implements SoqueteDoObjeto {
  readyState = 1;
  constructor(public anexo: unknown) {}
  send(): void {}
  close(): void {}
  serializeAttachment(valor: unknown): void {
    this.anexo = structuredClone(valor);
  }
  deserializeAttachment(): unknown {
    return this.anexo;
  }
}

describe('SalaDO: o construtor ao acordar com WebSockets abertos', () => {
  it('migra o anexo antigo de todos os soquetes (L66) antes de qualquer evento, e não deixa o token em nenhum', async () => {
    const { SalaDO } = await import('./sala-do');
    const id = 'c'.repeat(64);
    const tokens = ['A', 'B', 'C'].map((c) => c.repeat(43));
    const soquetes = tokens.map((sessao, i) => new SoqueteDeAnexo({ ip: `198.51.100.${i + 1}`, sinalEm: 5, idDaConta: id, sessao, sessaoConferidaEm: 9 }));
    const semConta = new SoqueteDeAnexo({ ip: '198.51.100.9', sinalEm: 5 });
    const b = banco();
    const bloqueios: Promise<unknown>[] = [];
    const ctx = {
      storage: { sql: b.sql, transactionSync: b.transacao, setAlarm: () => Promise.resolve(), deleteAlarm: () => Promise.resolve(), getAlarm: () => Promise.resolve(null) },
      getWebSockets: () => [...soquetes, semConta],
      blockConcurrencyWhile: (fn: () => Promise<unknown>) => {
        const p = fn();
        bloqueios.push(p);
        return p;
      },
    };
    new SalaDO(ctx as never, { MAX_SALAS: '10' } as never);
    expect(bloqueios).toHaveLength(1);
    await Promise.all(bloqueios);
    for (const [i, ws] of soquetes.entries()) {
      expect(ws.anexo).toEqual({ ip: `198.51.100.${i + 1}`, sinalEm: 5, idDaConta: id, resumoDaSessao: await resumoDaSessao(tokens[i]!), sessaoConferidaEm: 9 });
      expect(JSON.stringify(ws.anexo)).not.toContain(tokens[i]!);
    }
    expect(semConta.anexo).toEqual({ ip: '198.51.100.9', sinalEm: 5 });
  });
});
