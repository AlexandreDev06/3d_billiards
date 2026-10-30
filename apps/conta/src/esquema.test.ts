import { describe, expect, it } from 'vitest';
import { bancoDeTeste } from './para-testes';

describe('esquema', () => {
  it('cria as sete tabelas e é repetível', () => {
    const b = bancoDeTeste();
    const nomes = () => b.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).toArray().map((l) => l.name);
    expect(nomes()).toEqual(['baldes', 'contas', 'livro', 'operacoes', 'recuperacoes', 'reservas', 'sessoes']);
  });
  it('o e-mail é único mas pode faltar em várias contas (convidados)', () => {
    const { sql } = bancoDeTeste();
    const nova = (id: string, email: string | null) => sql.exec('INSERT INTO contas (id, email, convidado, saldo, criada_em) VALUES (?, ?, 0, 0, 1)', id, email);
    nova('a', null);
    nova('b', null);
    nova('c', 'x@y.com');
    expect(() => nova('d', 'x@y.com')).toThrow();
  });
  it('hash e sal são TEXT: guardam hexadecimal e o Durable Object devolveria BLOB como ArrayBuffer', () => {
    const { sql } = bancoDeTeste();
    const tipos = Object.fromEntries(sql.exec(`SELECT name, type FROM pragma_table_info('contas')`).toArray().map((c) => [c.name, c.type]));
    expect(tipos).toMatchObject({ hash: 'TEXT', sal: 'TEXT', iteracoes: 'INTEGER' });
    expect(JSON.stringify(tipos)).not.toContain('BLOB');
  });
});
