import { describe, expect, it } from 'vitest';
import { Moedas } from './moedas';
import { bancoDeTeste, relogioFalso } from './para-testes';
import { transacaoReentrante, type Transacao } from './sql';

const A = 'a'.repeat(64);
const L = { jogo: 'sinuca', motivo: 'teste' };

describe('transacaoReentrante', () => {
  it('só a de fora chama a base; a de dentro roda a função direto', () => {
    const chamadas: number[] = [];
    let n = 0;
    const base: Transacao = (fn) => {
      chamadas.push(++n);
      return fn();
    };
    const t = transacaoReentrante(base);
    const r = t(() => t(() => t(() => 'fundo')));
    expect(r).toBe('fundo');
    expect(chamadas).toEqual([1]);
    t(() => undefined);
    expect(chamadas).toEqual([1, 2]);
  });
  it('depois de uma exceção a profundidade volta a zero', () => {
    let abertas = 0;
    const t = transacaoReentrante((fn) => {
      abertas++;
      return fn();
    });
    expect(() => t(() => t(() => { throw new Error('x'); }))).toThrow('x');
    t(() => undefined);
    expect(abertas).toBe(2);
  });
  it('uma exceção de dentro desfaz também o crédito feito antes dela (sem SAVEPOINT)', () => {
    const b = bancoDeTeste();
    const m = new Moedas(b.sql, b.transacao, relogioFalso().agora);
    m.garantirConta(A, 100);
    expect(() =>
      b.transacao(() => {
        expect(m.creditar(A, 50, 'k1', L)).toMatchObject({ ok: true });
        throw new Error('depois do crédito');
      }),
    ).toThrow('depois do crédito');
    expect(m.saldo(A)!.saldo).toBe(100);
    expect(m.operacao('k1')).toBeNull();
    expect(b.sql.exec('SELECT COUNT(*) AS n FROM livro').toArray()[0]!.n).toBe(1);
  });
  it('o banco de teste não usa SAVEPOINT', () => {
    const b = bancoDeTeste();
    const m = new Moedas(b.sql, b.transacao, relogioFalso().agora);
    m.garantirConta(A, 100);
    const comandosDoBanco: string[] = [];
    const exec = b.db.exec.bind(b.db);
    b.db.exec = (s: string) => (comandosDoBanco.push(s), exec(s));
    b.transacao(() => m.creditar(A, 1, 'k', L));
    expect(comandosDoBanco).toEqual(['BEGIN', 'COMMIT']);
  });
});
