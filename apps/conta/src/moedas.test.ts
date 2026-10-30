import { beforeEach, describe, expect, it } from 'vitest';
import type { Lancamento } from './contrato';
import { Moedas } from './moedas';
import { bancoDeTeste, escritasDe, relogioFalso, type BancoDeTeste } from './para-testes';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const SEM_CONTA = 'd'.repeat(64);
const L: Lancamento = { jogo: 'sinuca', motivo: 'teste' };
const HORA = 3600_000;

let b: BancoDeTeste;
let relogio: ReturnType<typeof relogioFalso>;
let m: Moedas;

const escritas = (): string[] => escritasDe(b.comandos);
const livro = () =>
  b.sql.exec('SELECT chave, conta, delta, jogo, motivo FROM livro ORDER BY rowid').toArray();
const operacoes = () => b.sql.exec('SELECT chave FROM operacoes ORDER BY rowid').toArray().map((l) => l.chave);

beforeEach(() => {
  b = bancoDeTeste();
  relogio = relogioFalso();
  m = new Moedas(b.sql, b.transacao, relogio.agora);
  m.garantirConta(A, 100);
  m.garantirConta(B, 100);
  m.garantirConta(C, 100);
  b.comandos.length = 0;
});

describe('Moedas: conta e saldo', () => {
  it('garantirConta cria uma vez com o saldo inicial', () => {
    expect(m.garantirConta('e'.repeat(64), 100)).toEqual({ criada: true, saldo: 100 });
    expect(m.garantirConta('e'.repeat(64), 500)).toEqual({ criada: false, saldo: 100 });
  });
  it('garantirConta com id ou saldo inicial ruim lança', () => {
    expect(() => m.garantirConta('x', 100)).toThrow();
    expect(() => m.garantirConta('e'.repeat(64), -1)).toThrow();
    expect(() => m.garantirConta('e'.repeat(64), 1.5)).toThrow();
  });
  it('o saldo de quem não existe é nulo, e o de conta excluída também', () => {
    expect(m.saldo(SEM_CONTA)).toBeNull();
    b.sql.exec('UPDATE contas SET excluida_em = 1 WHERE id = ?', C);
    expect(m.saldo(C)).toBeNull();
    expect(m.creditar(C, 5, 'k:ex', L)).toEqual({ ok: false, erro: 'conta-inexistente' });
    expect(m.garantirConta(C, 100)).toEqual({ criada: false, saldo: 0 });
  });
  it('a abertura da conta entra no livro: a soma do livro é o saldo', () => {
    m.creditar(A, 50, 'k:soma1', L);
    m.debitar(A, 20, 'k:soma2', L);
    m.reservar([{ id: A, valor: 80 }, { id: B, valor: 80 }], 'aposta:soma', L);
    m.liquidar('aposta:soma', [{ id: A, delta: -80 }, { id: B, delta: 80 }], L);
    for (const id of [A, B, C]) {
      const soma = Number(b.sql.exec('SELECT SUM(delta) AS s FROM livro WHERE conta = ?', id).toArray()[0]!.s);
      expect(soma).toBe(m.saldo(id)!.saldo);
    }
  });
});

describe('Moedas: movimentos', () => {
  it('debitar acima do disponível recusa sem escrever', () => {
    const antes = escritas();
    expect(m.debitar(A, 101, 'compra:1', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(escritas()).toEqual(antes);
    expect(m.saldo(A)!.saldo).toBe(100);
  });
  it('debitar tudo o que tem deixa zero, e um a mais não', () => {
    expect(m.debitar(A, 100, 'compra:2', L)).toEqual({ ok: true, saldos: { [A]: 0 }, repetida: false });
    expect(m.debitar(A, 1, 'compra:3', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
  });
  it('a mesma chave com o mesmo conteúdo aplica uma vez', () => {
    expect(m.creditar(A, 50, 'missao:2026-10-29:x', L)).toEqual({ ok: true, saldos: { [A]: 150 }, repetida: false });
    expect(m.creditar(A, 50, 'missao:2026-10-29:x', L)).toEqual({ ok: true, saldos: { [A]: 150 }, repetida: true });
    expect(m.saldo(A)!.saldo).toBe(150);
    expect(livro().filter((l) => l.chave === 'missao:2026-10-29:x')).toHaveLength(1);
  });
  it('repetir depois que o saldo mudou devolve o resultado de antes, sem efeito', () => {
    m.creditar(A, 50, 'k1', L);
    m.creditar(A, 7, 'k2', L);
    expect(m.creditar(A, 50, 'k1', L)).toEqual({ ok: true, saldos: { [A]: 150 }, repetida: true });
    expect(m.saldo(A)!.saldo).toBe(157);
  });
  it('a mesma chave com outro conteúdo é chave-reusada', () => {
    m.creditar(A, 50, 'k1', L);
    expect(m.creditar(A, 60, 'k1', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.creditar(B, 50, 'k1', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.debitar(A, 50, 'k1', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.saldo(A)!.saldo).toBe(150);
  });
  it('duas contas diferentes com a mesma chave colidem: por isso a sinuca põe o id inteiro na chave', () => {
    expect(m.creditar(A, 50, 'bonus:dia', L)).toMatchObject({ ok: true, repetida: false });
    expect(m.creditar(B, 50, 'bonus:dia', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.creditar(B, 50, `bonus:dia:${B}`, L)).toMatchObject({ ok: true, repetida: false });
  });
  it('operacao devolve o que a chave aplicada guardou e null para a que nunca foi aplicada', () => {
    m.creditar(A, 50, 'k1', L);
    m.creditar(A, 7, 'k2', L);
    expect(m.operacao('k1')).toEqual({ ok: true, saldos: { [A]: 150 }, repetida: true });
    expect(m.operacao('k2')).toEqual({ ok: true, saldos: { [A]: 157 }, repetida: true });
    expect(m.operacao('k3')).toBeNull();
    expect(m.debitar(A, 9999, 'k4', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(m.operacao('k4')).toBeNull();
  });
  it('anularSeNaoFeita: a lápide antes do débito recusa o débito e não mexe no saldo', () => {
    expect(m.anularSeNaoFeita('compra:x')).toEqual({ anulada: true });
    expect(m.debitar(A, 10, 'compra:x', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.creditar(A, 10, 'compra:x', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.aplicar([{ id: A, delta: -10 }], 'compra:x', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.saldo(A)).toMatchObject({ saldo: 100 });
    expect(livro().filter((l) => l.chave === 'compra:x')).toEqual([]);
    expect(m.operacao('compra:x')).toBeNull();
  });
  it('anularSeNaoFeita: a lápide depois do débito devolve feita, com o resultado guardado, sem lápide nem efeito', () => {
    m.debitar(A, 10, 'compra:y', L);
    expect(m.anularSeNaoFeita('compra:y')).toEqual({ feita: { ok: true, saldos: { [A]: 90 }, repetida: true } });
    expect(m.saldo(A)).toMatchObject({ saldo: 90 });
    expect(m.debitar(A, 10, 'compra:y', L)).toMatchObject({ ok: true, repetida: true });
  });
  it('anularSeNaoFeita: repetir a lápide dá anulada de novo; chave reservada ou ruim lança', () => {
    expect(m.anularSeNaoFeita('compra:z')).toEqual({ anulada: true });
    expect(m.anularSeNaoFeita('compra:z')).toEqual({ anulada: true });
    expect(() => m.anularSeNaoFeita('abertura:x')).toThrow(RangeError);
    expect(() => m.anularSeNaoFeita('k:liquidar')).toThrow(RangeError);
    expect(() => m.anularSeNaoFeita('')).toThrow(RangeError);
  });
  it('a ordem das variações não muda a assinatura', () => {
    m.aplicar([{ id: A, delta: 10 }, { id: B, delta: -10 }], 'k:ordem', L);
    expect(m.aplicar([{ id: B, delta: -10 }, { id: A, delta: 10 }], 'k:ordem', L)).toMatchObject({ ok: true, repetida: true });
  });
  it('recusa que falhou não grava a chave: depois de resolvida, a mesma chave serve', () => {
    expect(m.debitar(A, 500, 'k:tenta', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    m.creditar(A, 1000, 'k:rico', L);
    expect(m.debitar(A, 500, 'k:tenta', L)).toMatchObject({ ok: true, repetida: false });
  });
  it('aplicar é tudo ou nada', () => {
    expect(m.aplicar([{ id: A, delta: 10 }, { id: SEM_CONTA, delta: 5 }], 'k2', L)).toEqual({ ok: false, erro: 'conta-inexistente' });
    expect(m.aplicar([{ id: A, delta: 10 }, { id: A, delta: 5 }], 'k3', L)).toEqual({ ok: false, erro: 'conta-repetida' });
    expect(m.saldo(A)!.saldo).toBe(100);
  });
  it('aplicar com um débito sem fundo não credita o outro lado', () => {
    const antes = escritas();
    expect(m.aplicar([{ id: A, delta: 500 }, { id: B, delta: -101 }], 'k:piso', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(escritas()).toEqual(antes);
    expect([m.saldo(A)!.saldo, m.saldo(B)!.saldo]).toEqual([100, 100]);
    expect(operacoes()).not.toContain('k:piso');
  });
  it('aplicar move moedas entre várias contas de uma vez', () => {
    expect(m.aplicar([{ id: A, delta: -30 }, { id: B, delta: 10 }, { id: C, delta: 20 }], 'k:tres', L)).toEqual({
      ok: true,
      saldos: { [A]: 70, [B]: 110, [C]: 120 },
      repetida: false,
    });
    expect(livro().filter((l) => l.chave === 'k:tres')).toHaveLength(3);
  });
  it('um erro de escrita no meio desfaz tudo', () => {
    b.db.exec(`CREATE TRIGGER falha BEFORE INSERT ON livro WHEN NEW.conta = '${C}' BEGIN SELECT RAISE(ABORT, 'disco'); END`);
    expect(() => m.aplicar([{ id: A, delta: 10 }, { id: B, delta: 10 }, { id: C, delta: 10 }], 'k:queda', L)).toThrow();
    expect([m.saldo(A)!.saldo, m.saldo(B)!.saldo, m.saldo(C)!.saldo]).toEqual([100, 100, 100]);
    expect(operacoes()).not.toContain('k:queda');
  });
  it('valores inválidos', () => {
    for (const v of [0, -5, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '5' as unknown as number]) {
      expect(m.creditar(A, v, 'k:v', L), String(v)).toEqual({ ok: false, erro: 'valor-invalido' });
      expect(m.debitar(A, v, 'k:v', L), String(v)).toEqual({ ok: false, erro: 'valor-invalido' });
    }
    expect(m.aplicar([], 'k:v', L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.aplicar([{ id: A, delta: 0 }], 'k:v', L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.aplicar([{ id: 'x', delta: 1 }], 'k:v', L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.saldo(A)!.saldo).toBe(100);
  });
  it('o saldo que passa do inteiro seguro é valor-invalido', () => {
    m.creditar(A, Number.MAX_SAFE_INTEGER - 100, 'k:grande', L);
    expect(m.creditar(A, 1, 'k:estoura', L)).toEqual({ ok: false, erro: 'valor-invalido' });
  });
  it('chave e lançamento inválidos', () => {
    for (const k of ['', 'A', 'a b', 'a'.repeat(121)]) expect(m.creditar(A, 1, k, L), k).toEqual({ ok: false, erro: 'valor-invalido' });
    for (const l of [{ jogo: 'Sinuca', motivo: 'x' }, { jogo: '', motivo: 'x' }, { jogo: 'a'.repeat(21), motivo: 'x' }, { jogo: 'sinuca', motivo: 'x'.repeat(61) }]) {
      expect(m.creditar(A, 1, 'k:l', l)).toEqual({ ok: false, erro: 'valor-invalido' });
    }
    expect(m.creditar(A, 1, 'k:l', { jogo: 'sinuca', motivo: 'x'.repeat(60) })).toMatchObject({ ok: true });
  });
  it('a mesma chave com outra operação é chave-reusada: reservar e depois creditar, creditar e depois aplicar', () => {
    expect(m.reservar([{ id: A, valor: 10 }], 'k:tipo1', L)).toMatchObject({ ok: true });
    expect(m.creditar(A, 10, 'k:tipo1', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.saldo(A)!.saldo).toBe(100);
    expect(m.creditar(A, 10, 'k:tipo2', L)).toMatchObject({ ok: true });
    expect(m.aplicar([{ id: A, delta: 10 }], 'k:tipo2', L)).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(m.saldo(A)!.saldo).toBe(110);
    // debitar e aplicar com o mesmo delta também são operações diferentes
    expect(m.debitar(A, 10, 'k:tipo3', L)).toMatchObject({ ok: true });
    expect(m.aplicar([{ id: A, delta: -10 }], 'k:tipo3', L)).toEqual({ ok: false, erro: 'chave-reusada' });
  });
  it('o jogo e o motivo não entram na assinatura: repetir com outro rótulo é a mesma operação, e o livro guarda o primeiro', () => {
    expect(m.creditar(A, 5, 'k:rotulo', { jogo: 'sinuca', motivo: 'primeiro' })).toMatchObject({ ok: true, repetida: false });
    expect(m.creditar(A, 5, 'k:rotulo', { jogo: 'xadrez', motivo: 'segundo' })).toMatchObject({ ok: true, repetida: true });
    expect(m.saldo(A)!.saldo).toBe(105);
    expect(livro().filter((l) => l.chave === 'k:rotulo')).toEqual([{ chave: 'k:rotulo', conta: A, delta: 5, jogo: 'sinuca', motivo: 'primeiro' }]);
  });
  it('chaves do Banco são reservadas: :liquidar, :devolver, excluir:, abertura: e migracao: são valor-invalido', () => {
    const reservadas = ['aposta:1:liquidar', 'aposta:1:devolver', 'excluir:abc', `excluir:${A}`, `abertura:${A}`, `migracao:${A}`, 'x:liquidar', 'x:devolver'];
    for (const k of reservadas) {
      expect(m.creditar(A, 1, k, L), `creditar ${k}`).toEqual({ ok: false, erro: 'valor-invalido' });
      expect(m.debitar(A, 1, k, L), `debitar ${k}`).toEqual({ ok: false, erro: 'valor-invalido' });
      expect(m.aplicar([{ id: A, delta: 1 }], k, L), `aplicar ${k}`).toEqual({ ok: false, erro: 'valor-invalido' });
      expect(m.reservar([{ id: A, valor: 1 }], k, L), `reservar ${k}`).toEqual({ ok: false, erro: 'valor-invalido' });
    }
    expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 0, disponivel: 100 });
    expect(operacoes()).toEqual([]);
    // o que só parece: o prefixo no meio ou o sufixo sem os dois-pontos passa
    for (const k of ['a:excluir:1', 'aposta-liquidar', 'abertura', 'x:liquidarr', 'migracao-1']) expect(m.creditar(A, 1, k, L), k).toMatchObject({ ok: true });
  });
  it('cada movimento vai ao livro com a chave, o jogo e o motivo', () => {
    m.creditar(A, 5, 'presente:skins-cs', { jogo: 'sinuca', motivo: 'presente' });
    expect(livro()).toContainEqual({ chave: 'presente:skins-cs', conta: A, delta: 5, jogo: 'sinuca', motivo: 'presente' });
    m.debitar(A, 3, 'compra:taco', { jogo: 'sinuca', motivo: 'taco' });
    expect(livro()).toContainEqual({ chave: 'compra:taco', conta: A, delta: -3, jogo: 'sinuca', motivo: 'taco' });
  });
});

describe('Moedas: reservas e a aposta', () => {
  it('a reserva prende o disponível sem tirar do saldo', () => {
    m.reservar([{ id: A, valor: 80 }, { id: B, valor: 80 }], 'aposta:p1', L);
    expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 80, disponivel: 20 });
    expect(m.debitar(A, 30, 'compra:2', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(m.debitar(A, 20, 'compra:3', L)).toMatchObject({ ok: true });
  });
  it('aplicar também respeita o disponível', () => {
    m.reservar([{ id: A, valor: 80 }], 'aposta:p1', L);
    expect(m.aplicar([{ id: A, delta: -30 }, { id: B, delta: 30 }], 'k:ap', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
  });
  it('reservar não tem piso: a aposta de hoje deixa o saldo negativo', () => {
    expect(m.reservar([{ id: A, valor: 5000 }], 'aposta:alta', L)).toEqual({ ok: true, saldos: { [A]: 100 }, repetida: false });
    expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 5000, disponivel: -4900 });
  });
  it('reservar é tudo ou nada e repetível', () => {
    expect(m.reservar([{ id: A, valor: 10 }, { id: SEM_CONTA, valor: 10 }], 'aposta:x', L)).toEqual({ ok: false, erro: 'conta-inexistente' });
    expect(m.reservar([{ id: A, valor: 10 }, { id: A, valor: 10 }], 'aposta:x', L)).toEqual({ ok: false, erro: 'conta-repetida' });
    expect(m.reservar([{ id: A, valor: 0 }], 'aposta:x', L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.reservar([], 'aposta:x', L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.saldo(A)!.reservado).toBe(0);
    expect(m.reservar([{ id: A, valor: 10 }], 'aposta:x', L)).toMatchObject({ ok: true, repetida: false });
    expect(m.reservar([{ id: A, valor: 10 }], 'aposta:x', L)).toMatchObject({ ok: true, repetida: true });
    expect(m.saldo(A)!.reservado).toBe(10);
    expect(m.reservar([{ id: A, valor: 11 }], 'aposta:x', L)).toEqual({ ok: false, erro: 'chave-reusada' });
  });
  it('liquidar paga da reserva e só ele deixa negativo', () => {
    m.reservar([{ id: A, valor: 150 }, { id: B, valor: 150 }], 'aposta:p2', L);
    expect(m.liquidar('aposta:p2', [{ id: A, delta: -150 }, { id: B, delta: 150 }], L)).toMatchObject({ ok: true, saldos: { [A]: -50, [B]: 250 } });
    expect(m.saldo(A)).toEqual({ saldo: -50, reservado: 0, disponivel: -50 });
    expect(m.liquidar('aposta:p2', [{ id: C, delta: 1 }], L)).toEqual({ ok: false, erro: 'chave-reusada' });
  });
  it('liquidar tem teto: ninguém perde mais do que reservou, e ninguém leva mais do que o pote', () => {
    m.reservar([{ id: A, valor: 50 }, { id: B, valor: 50 }], 'aposta:t1', L);
    const intacto = () => {
      expect([m.saldo(A), m.saldo(B)]).toEqual([{ saldo: 100, reservado: 50, disponivel: 50 }, { saldo: 100, reservado: 50, disponivel: 50 }]);
      expect(operacoes()).toEqual(['aposta:t1']);
      expect(livro().filter((l) => String(l.chave).includes(':liquidar'))).toEqual([]);
    };
    // perdedor com -(reserva + 1)
    expect(m.liquidar('aposta:t1', [{ id: A, delta: -51 }, { id: B, delta: 51 }], L)).toEqual({ ok: false, erro: 'valor-invalido' });
    intacto();
    // vencedor leva mais do que o pote (a soma passa de zero)
    expect(m.liquidar('aposta:t1', [{ id: A, delta: -50 }, { id: B, delta: 51 }], L)).toEqual({ ok: false, erro: 'valor-invalido' });
    intacto();
    // vencedor sozinho sem ninguém perder
    expect(m.liquidar('aposta:t1', [{ id: B, delta: 1 }], L)).toEqual({ ok: false, erro: 'valor-invalido' });
    intacto();
    // a recusa não grava a chave: o pagamento certo ainda passa
    expect(m.liquidar('aposta:t1', [{ id: A, delta: -50 }, { id: B, delta: 50 }], L)).toMatchObject({ ok: true, saldos: { [A]: 50, [B]: 150 } });
  });
  it('liquidar: o pote que sobra (soma negativa) e o perdedor exato passam; o teto vale por conta', () => {
    m.reservar([{ id: A, valor: 50 }, { id: B, valor: 30 }], 'aposta:t2', L);
    // a reserva de A é 50, a de B é 30: B não pode perder 31 só porque A reservou mais
    expect(m.liquidar('aposta:t2', [{ id: A, delta: 40 }, { id: B, delta: -31 }], L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.liquidar('aposta:t2', [{ id: A, delta: 20 }, { id: B, delta: -30 }], L)).toMatchObject({ ok: true, saldos: { [A]: 120, [B]: 70 } });
  });
  it('liquidar é repetível sem efeito', () => {
    m.reservar([{ id: A, valor: 50 }, { id: B, valor: 50 }], 'aposta:p5', L);
    const vars = [{ id: A, delta: -50 }, { id: B, delta: 50 }];
    expect(m.liquidar('aposta:p5', vars, L)).toEqual({ ok: true, saldos: { [A]: 50, [B]: 150 }, repetida: false });
    const antes = escritas();
    expect(m.liquidar('aposta:p5', vars, L)).toEqual({ ok: true, saldos: { [A]: 50, [B]: 150 }, repetida: true });
    expect(escritas()).toEqual(antes);
    expect(operacoes()).toEqual(['aposta:p5', 'aposta:p5:liquidar']);
    expect(livro().filter((l) => l.chave === 'aposta:p5:liquidar')).toHaveLength(2);
  });
  it('liquidar com conta fora da reserva recusa e a reserva fica', () => {
    m.reservar([{ id: A, valor: 10 }], 'aposta:p3', L);
    expect(m.liquidar('aposta:p3', [{ id: B, delta: 10 }], L)).toEqual({ ok: false, erro: 'reserva-inexistente' });
    expect(m.liquidar('aposta:p3', [{ id: A, delta: -10 }, { id: B, delta: 10 }], L)).toEqual({ ok: false, erro: 'reserva-inexistente' });
    expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 10, disponivel: 90 });
  });
  it('liquidar sem reserva nenhuma recusa', () => {
    expect(m.liquidar('aposta:nunca', [{ id: A, delta: 1 }], L)).toEqual({ ok: false, erro: 'reserva-inexistente' });
  });
  it('liquidar libera a reserva de quem não recebeu variação', () => {
    m.reservar([{ id: A, valor: 10 }, { id: B, valor: 10 }, { id: C, valor: 10 }], 'aposta:p6', L);
    m.liquidar('aposta:p6', [{ id: A, delta: -10 }, { id: B, delta: 10 }], L);
    expect(m.saldo(C)).toEqual({ saldo: 100, reservado: 0, disponivel: 100 });
  });
  it('liquidar com variação repetida, zero ou vazia recusa', () => {
    m.reservar([{ id: A, valor: 10 }, { id: B, valor: 10 }], 'aposta:p7', L);
    expect(m.liquidar('aposta:p7', [{ id: A, delta: 1 }, { id: A, delta: 2 }], L)).toEqual({ ok: false, erro: 'conta-repetida' });
    expect(m.liquidar('aposta:p7', [{ id: A, delta: 0 }], L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.liquidar('aposta:p7', [], L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(m.saldo(A)!.reservado).toBe(10);
  });
  it('liquidar de uma conta excluída no meio recusa', () => {
    m.reservar([{ id: A, valor: 10 }, { id: B, valor: 10 }], 'aposta:p8', L);
    b.sql.exec('UPDATE contas SET excluida_em = 1 WHERE id = ?', B);
    expect(m.liquidar('aposta:p8', [{ id: A, delta: -10 }, { id: B, delta: 10 }], L)).toEqual({ ok: false, erro: 'conta-inexistente' });
    expect(m.saldo(A)!.saldo).toBe(100);
  });
  it('a soma das reservas de uma conta tem de caber num inteiro seguro', () => {
    const metade = 2 ** 52;
    expect(m.reservar([{ id: A, valor: metade }], 'aposta:s1', L)).toMatchObject({ ok: true });
    const antes = escritas().length;
    expect(m.reservar([{ id: A, valor: metade }, { id: B, valor: 5 }], 'aposta:s2', L)).toEqual({ ok: false, erro: 'valor-invalido' });
    expect(escritas().length).toBe(antes);
    expect(operacoes()).toEqual(['aposta:s1']);
    expect(m.saldo(B)!.reservado).toBe(0);
    // um a menos ainda cabe
    expect(m.reservar([{ id: A, valor: metade - 1 }], 'aposta:s3', L)).toMatchObject({ ok: true });
  });
  it('devolver solta a reserva sem mexer no saldo, e é repetível', () => {
    m.reservar([{ id: A, valor: 60 }, { id: B, valor: 60 }], 'aposta:d1', L);
    expect(m.devolver('aposta:d1')).toEqual({ ok: true, saldos: { [A]: 100, [B]: 100 }, repetida: false });
    expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 0, disponivel: 100 });
    expect(m.devolver('aposta:d1')).toEqual({ ok: true, saldos: { [A]: 100, [B]: 100 }, repetida: true });
    expect(operacoes()).toEqual(['aposta:d1', 'aposta:d1:devolver']);
  });
  it('devolver sem reserva recusa; liquidar depois de devolver também', () => {
    expect(m.devolver('aposta:nada')).toEqual({ ok: false, erro: 'reserva-inexistente' });
    m.reservar([{ id: A, valor: 60 }], 'aposta:d2', L);
    m.devolver('aposta:d2');
    expect(m.liquidar('aposta:d2', [{ id: A, delta: -60 }], L)).toEqual({ ok: false, erro: 'reserva-inexistente' });
    expect(m.saldo(A)!.saldo).toBe(100);
  });
  it('devolver depois de liquidar recusa', () => {
    m.reservar([{ id: A, valor: 10 }], 'aposta:d3', L);
    m.liquidar('aposta:d3', [{ id: A, delta: -10 }], L);
    expect(m.devolver('aposta:d3')).toEqual({ ok: false, erro: 'reserva-inexistente' });
  });
  it('devolver com chave ruim recusa', () => {
    expect(m.devolver('A b')).toEqual({ ok: false, erro: 'valor-invalido' });
  });
  it('a reserva com mais de 24 h volta sozinha', () => {
    m.reservar([{ id: A, valor: 60 }], 'aposta:p4', L);
    relogio.avancar(24 * HORA + 1);
    expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 0, disponivel: 100 });
    expect(m.liquidar('aposta:p4', [{ id: A, delta: -60 }], L)).toEqual({ ok: false, erro: 'reserva-inexistente' });
  });
  it('com exatamente 24 h a reserva ainda vale', () => {
    m.reservar([{ id: A, valor: 60 }], 'aposta:p9', L);
    relogio.avancar(24 * HORA);
    expect(m.saldo(A)!.reservado).toBe(60);
    expect(m.liquidar('aposta:p9', [{ id: A, delta: -60 }], L)).toMatchObject({ ok: true });
  });
  it('qualquer operação vence as reservas antes de olhar o piso', () => {
    m.reservar([{ id: A, valor: 90 }], 'aposta:p10', L);
    relogio.avancar(24 * HORA + 1);
    expect(m.debitar(A, 100, 'compra:livre', L)).toMatchObject({ ok: true });
  });
  it('vencerReservas devolve quantas saíram e não escreve se não há nenhuma', () => {
    expect(m.vencerReservas()).toBe(0);
    expect(escritas()).toEqual([]);
    m.reservar([{ id: A, valor: 1 }, { id: B, valor: 1 }], 'aposta:p11', L);
    relogio.avancar(25 * HORA);
    expect(m.vencerReservas()).toBe(2);
    expect(m.vencerReservas()).toBe(0);
  });
});

describe('Moedas: zerar', () => {
  it('zerar leva o saldo a zero, deixa o rastro no livro e é repetível', () => {
    m.reservar([{ id: A, valor: 10 }], 'aposta:z', L);
    m.zerar(A, 'exclusao:a');
    expect(m.garantirConta(A, 100)).toEqual({ criada: false, saldo: 0 });
    expect(livro()).toContainEqual({ chave: 'exclusao:a', conta: A, delta: -100, jogo: 'banco', motivo: 'exclusao' });
    expect(() => m.zerar(A, 'exclusao:a')).not.toThrow();
    const soma = Number(b.sql.exec('SELECT SUM(delta) AS s FROM livro WHERE conta = ?', A).toArray()[0]!.s);
    expect(soma).toBe(0);
    expect(b.sql.exec('SELECT 1 FROM reservas WHERE conta = ?', A).toArray()).toHaveLength(0);
  });
});

describe('Moedas: saldos e importarSaldos (a API do Banco)', () => {
  it('saldos lê várias contas numa leitura só, com null para a que não existe', () => {
    m.reservar([{ id: A, valor: 30 }], 'aposta:s1', L);
    expect(m.saldos([A, B, SEM_CONTA])).toEqual({ [A]: { saldo: 100, reservado: 30, disponivel: 70 }, [B]: { saldo: 100, reservado: 0, disponivel: 100 }, [SEM_CONTA]: null });
    expect(m.saldos([])).toEqual({});
  });
  it('saldos aceita 500 ids e recusa 501 (e id ruim) sem tocar no banco', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i.toString(16).padStart(64, '0'));
    expect(Object.keys(m.saldos(ids(500)))).toHaveLength(500);
    b.comandos.length = 0;
    expect(() => m.saldos(ids(501))).toThrow(RangeError);
    expect(() => m.saldos([A, 'x'])).toThrow(RangeError);
    expect(b.comandos).toEqual([]);
  });
  it('saldos de conta excluída é null', () => {
    m.zerar(A, 'exclusao:a');
    b.sql.exec('UPDATE contas SET excluida_em = 1 WHERE id = ?', A);
    expect(m.saldos([A])[A]).toBeNull();
  });
  it('importarSaldos cria só a que falta, com a abertura migracao:<id> no livro', () => {
    const novo = 'e'.repeat(64);
    const zero = 'f'.repeat(64);
    expect(m.importarSaldos([{ id: novo, saldo: 250 }, { id: zero, saldo: 0 }])).toEqual({ criadas: 2, iguais: 0, conflitos: [] });
    expect(m.saldo(novo)).toEqual({ saldo: 250, reservado: 0, disponivel: 250 });
    expect(m.saldo(zero)?.saldo).toBe(0);
    expect(livro()).toContainEqual({ chave: `migracao:${novo}`, conta: novo, delta: 250, jogo: 'banco', motivo: 'migracao' });
    expect(Number(b.sql.exec('SELECT convidado FROM contas WHERE id = ?', novo).toArray()[0]!.convidado)).toBe(1);
    expect(Number(b.sql.exec('SELECT SUM(delta) AS s FROM livro WHERE conta = ?', novo).toArray()[0]!.s)).toBe(250);
  });
  it('conta que já existe: saldo igual vai para iguais, outro vai para conflitos e NADA muda', () => {
    const antes = b.db.prepare('SELECT * FROM contas ORDER BY id').all();
    const livroAntes = livro();
    b.comandos.length = 0;
    expect(m.importarSaldos([{ id: A, saldo: 100 }, { id: B, saldo: 999 }, { id: C, saldo: 0 }])).toEqual({ criadas: 0, iguais: 1, conflitos: [B, C] });
    expect(escritas()).toEqual([]);
    expect(b.db.prepare('SELECT * FROM contas ORDER BY id').all()).toEqual(antes);
    expect(livro()).toEqual(livroAntes);
  });
  it('saldo negativo migra como está (perder aposta não tem piso): a abertura leva o delta negativo e a soma do livro é o saldo', () => {
    const devedor = 'd'.repeat(64);
    expect(m.importarSaldos([{ id: devedor, saldo: -50 }])).toEqual({ criadas: 1, iguais: 0, conflitos: [] });
    expect(m.saldo(devedor)).toEqual({ saldo: -50, reservado: 0, disponivel: -50 });
    expect(livro()).toContainEqual({ chave: `migracao:${devedor}`, conta: devedor, delta: -50, jogo: 'banco', motivo: 'migracao' });
    expect(Number(b.sql.exec('SELECT SUM(delta) AS s FROM livro WHERE conta = ?', devedor).toArray()[0]!.s)).toBe(-50);
    expect(m.importarSaldos([{ id: devedor, saldo: -50 }])).toEqual({ criadas: 0, iguais: 1, conflitos: [] });
    expect(m.importarSaldos([{ id: devedor, saldo: -49 }])).toEqual({ criadas: 0, iguais: 0, conflitos: [devedor] });
    expect(m.debitar(devedor, 1, 'compra:x', L)).toMatchObject({ ok: false, erro: 'saldo-insuficiente' });
  });
  it('repetir o mesmo lote não faz nada', () => {
    const lote = [{ id: 'e'.repeat(64), saldo: 40 }];
    expect(m.importarSaldos(lote).criadas).toBe(1);
    b.comandos.length = 0;
    expect(m.importarSaldos(lote)).toEqual({ criadas: 0, iguais: 1, conflitos: [] });
    expect(escritas()).toEqual([]);
  });
  it('lote malformado lança e não escreve nada, nem as contas boas que vinham antes', () => {
    const boa = { id: 'e'.repeat(64), saldo: 5 };
    const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: (i + 1).toString(16).padStart(64, '0'), saldo: 1 }));
    expect(m.importarSaldos(ids(500)).criadas).toBe(500);
    b.comandos.length = 0;
    expect(() => m.importarSaldos(ids(501))).toThrow(RangeError);
    for (const ruim of [{ id: 'x', saldo: 1 }, { id: 'f'.repeat(64), saldo: 1.5 }, { id: 'f'.repeat(64), saldo: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(() => m.importarSaldos([boa, ruim])).toThrow(RangeError);
    }
    expect(() => m.importarSaldos([boa, boa])).toThrow(RangeError);
    expect(escritas()).toEqual([]);
    expect(m.saldo(boa.id)).toBeNull();
  });
});
