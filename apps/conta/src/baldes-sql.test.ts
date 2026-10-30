import { beforeEach, describe, expect, it } from 'vitest';
import { BaldesNoSql, limparBaldesAntigos } from './baldes-sql';
import { BaldeDeTokens } from './limite-taxa';
import { bancoDeTeste, relogioFalso, type BancoDeTeste } from './para-testes';

const DIA = 24 * 3600_000;
let b: BancoDeTeste;
let relogio: ReturnType<typeof relogioFalso>;

const linhas = () => b.sql.exec('SELECT chave, fichas, atualizado_em FROM baldes ORDER BY chave').toArray();

beforeEach(() => {
  b = bancoDeTeste();
  relogio = relogioFalso();
});

describe('BaldesNoSql', () => {
  it('gasta, recusa sem escrever e repõe como o BaldeDeTokens', () => {
    const sql = new BaldesNoSql(b.sql, 'x', 3, 1 / 60, relogio.agora);
    const memoria = new BaldeDeTokens(3, 1 / 60, relogio.agora);
    const passos = [0, 0, 0, 0, 30_000, 0, 30_000, 90_000, 0, 0, 0, 10 * 60_000, 0, 0, 0, 0];
    for (const [i, avanco] of passos.entries()) {
      relogio.avancar(avanco);
      expect(sql.tentar('k'), `passo ${i}`).toBe(memoria.tentar());
    }
  });
  it('uma linha por chave, nomeada nome:chave, e chaves independentes', () => {
    const x = new BaldesNoSql(b.sql, 'x', 2, 1, relogio.agora);
    const y = new BaldesNoSql(b.sql, 'y', 2, 1, relogio.agora);
    for (let i = 0; i < 5; i++) x.tentar('k');
    y.tentar('k');
    x.tentar('outra');
    expect(linhas().map((l) => l.chave)).toEqual(['x:k', 'x:outra', 'y:k']);
    expect(linhas().find((l) => l.chave === 'x:k')!.fichas).toBe(0);
  });
  it('a recusa não escreve nada', () => {
    const x = new BaldesNoSql(b.sql, 'x', 1, 1 / 3600, relogio.agora);
    expect(x.tentar('k')).toBe(true);
    b.comandos.length = 0;
    expect(x.tentar('k')).toBe(false);
    expect(b.comandos.filter((c) => /^\s*(INSERT|UPDATE|DELETE)/i.test(c))).toEqual([]);
  });
  it('sobrevive a outra instância sobre o mesmo banco', () => {
    new BaldesNoSql(b.sql, 'x', 2, 1 / 3600, relogio.agora).tentar('k');
    new BaldesNoSql(b.sql, 'x', 2, 1 / 3600, relogio.agora).tentar('k');
    expect(new BaldesNoSql(b.sql, 'x', 2, 1 / 3600, relogio.agora).tentar('k')).toBe(false);
  });
  it('relógio que anda para trás não repõe nem quebra', () => {
    const x = new BaldesNoSql(b.sql, 'x', 1, 1, relogio.agora);
    expect(x.tentar('k')).toBe(true);
    relogio.avancar(-5000);
    expect(x.tentar('k')).toBe(false);
  });
  it('recusa balde que demora mais de 1 dia para encher (a limpeza apagaria um balde ainda gasto)', () => {
    expect(() => new BaldesNoSql(b.sql, 'x', 1, 1 / (2 * 24 * 3600), relogio.agora)).toThrow(RangeError);
    expect(() => new BaldesNoSql(b.sql, 'x', 1, 0, relogio.agora)).toThrow(RangeError);
  });
});

describe('limparBaldesAntigos', () => {
  const guarde = (n: number, idade: number) => {
    for (let i = 0; i < n; i++) b.sql.exec('INSERT INTO baldes (chave, fichas, atualizado_em) VALUES (?, 0, ?)', `x:${idade}-${i}`, relogio.agora() - idade);
  };
  it('apaga só o que está parado há mais de 1 dia, no máximo 50 por chamada, as mais velhas primeiro', () => {
    guarde(60, 3 * DIA);
    guarde(60, 2 * DIA);
    guarde(5, DIA); // exatamente 1 dia ainda fica
    guarde(5, 1000);
    limparBaldesAntigos(b.sql, relogio.agora());
    expect(linhas()).toHaveLength(130 - 50);
    expect(linhas().filter((l) => String(l.chave).startsWith(`x:${3 * DIA}-`))).toHaveLength(10);
    limparBaldesAntigos(b.sql, relogio.agora());
    limparBaldesAntigos(b.sql, relogio.agora());
    expect(linhas()).toHaveLength(10);
  });
});
