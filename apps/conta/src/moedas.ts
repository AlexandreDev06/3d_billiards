import { ehChave, ehIdDeConta } from './campos';
import type { ErroDeMoeda, Lancamento, ResultadoDeMoeda, SaldoDaConta, Variacao } from './contrato';
import type { SqlMinimo, Transacao } from './sql';

/** Uma reserva sem liquidação por mais que isto volta sozinha. */
export const VALIDADE_DA_RESERVA_MS = 24 * 3600_000;
/** Quantas contas uma operação aceita (a aposta tem até 4). */
const MAX_VARIACOES = 100;
const FORMA_DO_JOGO = /^[a-z0-9-]{1,20}$/;
const MOTIVO_MAX = 60;
/** As chaves que o próprio Banco escreve (sufixos da reserva, abertura, migração e exclusão): quem chama de fora não as usa. */
const SUFIXOS_RESERVADOS = [':liquidar', ':devolver'] as const;
const PREFIXOS_RESERVADOS = ['excluir:', 'abertura:', 'migracao:'] as const;
/** Sobra para os sufixos `:liquidar` e `:devolver` caberem no tamanho de uma chave (120). */
const CHAVE_DA_RESERVA_MAX = 110;
/** Quantas contas `saldos` e `importarSaldos` aceitam por chamada. */
export const MAX_POR_LOTE = 500;
/** A assinatura da lápide de `anularSeNaoFeita`: nenhuma assinatura de operação real (um JSON) é igual a ela. */
const ASSINATURA_DA_LAPIDE = 'anulada';

type Saldos = Record<string, number>;
type Falha = { ok: false; erro: ErroDeMoeda };
type Tipo = 'aplicar' | 'debitar' | 'creditar' | 'reservar' | 'liquidar' | 'devolver';

const recusa = (erro: ErroDeMoeda): Falha => ({ ok: false, erro });
const inteiroSeguro = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);

/**
 * O saldo das contas, o livro e as reservas da aposta. Núcleo puro sobre `SqlMinimo`: cada operação pública é uma transação só (tudo ou
 * nada), toda a leitura e a escrita síncronas, sem `await`. Uma operação recusada não escreve nada, nem a chave.
 *
 * Idempotência: a mesma chave com o mesmo conteúdo devolve o resultado da primeira vez (`repetida: true`) sem efeito; com outro conteúdo,
 * `chave-reusada`. O `reservar` usa a chave, o `liquidar` usa `<chave>:liquidar` e o `devolver` usa `<chave>:devolver`.
 * Só o `liquidar` deixa o saldo abaixo de zero; `debitar` e `aplicar` exigem `disponivel >= |delta|` (saldo menos o reservado).
 */
export class Moedas {
  private readonly sql: SqlMinimo;
  private readonly transacao: Transacao;
  private readonly relogio: () => number;

  constructor(sql: SqlMinimo, transacao: Transacao, relogio: () => number) {
    this.sql = sql;
    this.transacao = transacao;
    this.relogio = relogio;
  }

  /** Cria a conta com o saldo inicial se ela não existe (o saldo entra no livro como abertura). Conta existente não muda. */
  garantirConta(id: string, saldoInicial: number, convidado = true): { criada: boolean; saldo: number } {
    if (!ehIdDeConta(id)) throw new RangeError('id de conta inválido');
    if (!inteiroSeguro(saldoInicial) || saldoInicial < 0) throw new RangeError('saldo inicial inválido');
    return this.transacao(() => {
      const linha = this.sql.exec('SELECT saldo, excluida_em FROM contas WHERE id = ?', id).toArray()[0];
      if (linha !== undefined) return { criada: false, saldo: linha.excluida_em === null ? Number(linha.saldo) : 0 };
      const agora = this.relogio();
      this.sql.exec('INSERT INTO contas (id, convidado, saldo, criada_em) VALUES (?, ?, ?, ?)', id, convidado ? 1 : 0, saldoInicial, agora);
      if (saldoInicial > 0) this.sql.exec('INSERT INTO livro (chave, conta, delta, jogo, motivo, em) VALUES (?, ?, ?, ?, ?, ?)', `abertura:${id}`, id, saldoInicial, 'banco', 'abertura', agora);
      return { criada: true, saldo: saldoInicial };
    });
  }

  /** `null` se a conta não existe ou foi excluída. */
  saldo(id: string): SaldoDaConta | null {
    return this.transacao(() => {
      this.vencer();
      return this.situacao(id);
    });
  }

  /** Os saldos de até `MAX_POR_LOTE` contas numa leitura só; `null` para a que não existe ou foi excluída. Lote grande ou id ruim lança. */
  saldos(ids: readonly string[]): Record<string, SaldoDaConta | null> {
    if (!Array.isArray(ids) || ids.length > MAX_POR_LOTE) throw new RangeError(`no máximo ${MAX_POR_LOTE} ids por chamada`);
    if (!ids.every(ehIdDeConta)) throw new RangeError('id de conta inválido');
    return this.transacao(() => {
      this.vencer();
      const saida: Record<string, SaldoDaConta | null> = {};
      for (const id of ids) saida[id] = this.situacao(id);
      return saida;
    });
  }

  /**
   * A migração das carteiras: cria só a conta de convidado que falta (com a abertura no livro sob a chave `migracao:<id>`). A que já
   * existe com o mesmo saldo conta em `iguais`; com outro saldo (ou excluída com saldo a importar) vai para `conflitos`, sem mudar
   * nada. O saldo pode ser negativo: perder aposta na sinuca não tem piso, e a conta que ficou devendo migra como está (a abertura
   * `migracao:<id>` leva o delta negativo ao livro). Tudo ou nada: lote malformado (mais de `MAX_POR_LOTE`, id ruim, saldo não inteiro
   * seguro, id repetido) lança. Repetir o mesmo lote não faz nada.
   */
  importarSaldos(lote: readonly { id: string; saldo: number }[]): { criadas: number; iguais: number; conflitos: string[] } {
    if (!Array.isArray(lote) || lote.length > MAX_POR_LOTE) throw new RangeError(`no máximo ${MAX_POR_LOTE} contas por chamada`);
    for (const x of lote) {
      if (typeof x !== 'object' || x === null || !ehIdDeConta(x.id) || !inteiroSeguro(x.saldo)) throw new RangeError('conta a importar inválida');
    }
    if (new Set(lote.map((x) => x.id)).size !== lote.length) throw new RangeError('id repetido no lote');
    return this.transacao(() => {
      const agora = this.relogio();
      let criadas = 0;
      let iguais = 0;
      const conflitos: string[] = [];
      for (const { id, saldo } of lote) {
        const linha = this.sql.exec('SELECT saldo, excluida_em FROM contas WHERE id = ?', id).toArray()[0];
        if (linha === undefined) {
          this.sql.exec('INSERT INTO contas (id, convidado, saldo, criada_em) VALUES (?, 1, ?, ?)', id, saldo, agora);
          if (saldo !== 0) this.sql.exec('INSERT INTO livro (chave, conta, delta, jogo, motivo, em) VALUES (?, ?, ?, ?, ?, ?)', `migracao:${id}`, id, saldo, 'banco', 'migracao', agora);
          criadas++;
        } else if ((linha.excluida_em === null ? Number(linha.saldo) : 0) === saldo) iguais++;
        else conflitos.push(id);
      }
      return { criadas, iguais, conflitos };
    });
  }

  /**
   * O resultado guardado em `operacoes` para esta chave exata (sempre com `repetida: true`), ou `null` se ela nunca foi aplicada (ou
   * foi anulada pela lápide de `anularSeNaoFeita`). Serve ao jogo que perdeu a resposta: pergunta se a operação aconteceu antes de
   * repetir. A chave da reserva é `<chave>`; a do pagamento, `<chave>:liquidar`; a da devolução, `<chave>:devolver`.
   */
  operacao(chave: string): ResultadoDeMoeda | null {
    const linha = this.sql.exec('SELECT assinatura, resultado FROM operacoes WHERE chave = ?', chave).toArray()[0];
    if (linha === undefined || linha.assinatura === ASSINATURA_DA_LAPIDE) return null;
    return { ok: true, saldos: JSON.parse(String(linha.resultado)) as Saldos, repetida: true };
  }

  /**
   * Fecha a janela de uma operação ainda a caminho: numa transação, se a chave já foi aplicada devolve o resultado guardado
   * (`feita`, com `repetida: true`); se não, grava uma lápide (a chave com a assinatura `anulada`) e um `debitar`, `creditar` ou
   * `aplicar` que chegue depois com essa chave dá `chave-reusada`, sem efeito. Repetir depois da lápide dá `anulada` outra vez.
   * Só chaves que um jogo pode mandar (as do Banco, de reserva e de migração, não); chave ruim lança `RangeError`.
   */
  anularSeNaoFeita(chave: string): { feita: ResultadoDeMoeda } | { anulada: true } {
    if (!ehChaveExterna(chave)) throw new RangeError('chave inválida');
    return this.transacao(() => {
      const linha = this.sql.exec('SELECT assinatura, resultado FROM operacoes WHERE chave = ?', chave).toArray()[0];
      if (linha === undefined) {
        this.sql.exec('INSERT INTO operacoes (chave, assinatura, resultado, em) VALUES (?, ?, ?, ?)', chave, ASSINATURA_DA_LAPIDE, '{}', this.relogio());
        return { anulada: true as const };
      }
      if (linha.assinatura === ASSINATURA_DA_LAPIDE) return { anulada: true as const };
      return { feita: { ok: true as const, saldos: JSON.parse(String(linha.resultado)) as Saldos, repetida: true as const } };
    });
  }

  aplicar(variacoes: readonly Variacao[], chave: string, l: Lancamento): ResultadoDeMoeda {
    return this.mover('aplicar', variacoes, chave, l);
  }

  debitar(id: string, valor: number, chave: string, l: Lancamento): ResultadoDeMoeda {
    if (!inteiroSeguro(valor) || valor <= 0) return recusa('valor-invalido');
    return this.mover('debitar', [{ id, delta: -valor }], chave, l);
  }

  creditar(id: string, valor: number, chave: string, l: Lancamento): ResultadoDeMoeda {
    if (!inteiroSeguro(valor) || valor <= 0) return recusa('valor-invalido');
    return this.mover('creditar', [{ id, delta: valor }], chave, l);
  }

  /** Prende `valor` do disponível de cada conta à partida `chave`. Não mexe no saldo e não tem piso. */
  reservar(lote: readonly { id: string; valor: number }[], chave: string, l: Lancamento): ResultadoDeMoeda {
    if (!ehChaveExterna(chave) || chave.length > CHAVE_DA_RESERVA_MAX || !lancamentoValido(l)) return recusa('valor-invalido');
    if (!Array.isArray(lote)) return recusa('valor-invalido');
    const itens = conferirLote(lote.map((x) => ({ id: x.id, delta: x.valor })));
    if (!Array.isArray(itens)) return itens;
    if (itens.some((x) => x.delta <= 0)) return recusa('valor-invalido');
    const assinatura = assinar('reservar', itens);
    return this.transacao(() => {
      this.vencer();
      const feita = this.jaFeita(chave, assinatura);
      if (feita !== null) return feita;
      const saldos: Saldos = {};
      for (const { id, delta } of itens) {
        const s = this.situacao(id);
        if (s === null) return recusa('conta-inexistente');
        // A soma do que a conta já tem reservado com esta reserva tem de caber num inteiro seguro (senão `disponivel` perde precisão).
        if (!Number.isSafeInteger(s.reservado + delta)) return recusa('valor-invalido');
        saldos[id] = s.saldo;
      }
      const agora = this.relogio();
      for (const { id, delta } of itens) {
        this.sql.exec('INSERT INTO reservas (chave, conta, valor, em) VALUES (?, ?, ?, ?)', chave, id, delta, agora);
      }
      this.registrar(chave, assinatura, saldos);
      return { ok: true, saldos, repetida: false };
    });
  }

  /**
   * Paga da reserva `chave`: aplica os deltas (sem piso), apaga a reserva inteira e grava no livro como `<chave>:liquidar`. Cada delta
   * tem de ser no mínimo -(o que a conta reservou nesta chave) e a soma dos deltas no máximo zero; fora disso, `valor-invalido`.
   */
  liquidar(chave: string, variacoes: readonly Variacao[], l: Lancamento): ResultadoDeMoeda {
    if (!ehChave(chave) || chave.length > CHAVE_DA_RESERVA_MAX || !lancamentoValido(l)) return recusa('valor-invalido');
    const itens = conferirLote(variacoes);
    if (!Array.isArray(itens)) return itens;
    const chaveDoPagamento = `${chave}:liquidar`;
    const assinatura = assinar('liquidar', itens);
    return this.transacao(() => {
      this.vencer();
      const feita = this.jaFeita(chaveDoPagamento, assinatura);
      if (feita !== null) return feita;
      const reservadas = new Map(this.sql.exec('SELECT conta, valor FROM reservas WHERE chave = ?', chave).toArray().map((r) => [String(r.conta), Number(r.valor)] as const));
      if (reservadas.size === 0 || itens.some((x) => !reservadas.has(x.id))) return recusa('reserva-inexistente');
      // Teto: ninguém perde mais do que reservou nesta partida, e a soma dos deltas não cria moeda (o pote só muda de mãos).
      if (itens.some((x) => x.delta < -reservadas.get(x.id)!) || itens.reduce((t, x) => t + x.delta, 0) > 0) return recusa('valor-invalido');
      const novos: Saldos = {};
      for (const { id, delta } of itens) {
        const s = this.situacao(id);
        if (s === null) return recusa('conta-inexistente');
        const depois = s.saldo + delta;
        if (!Number.isSafeInteger(depois)) return recusa('valor-invalido');
        novos[id] = depois;
      }
      this.sql.exec('DELETE FROM reservas WHERE chave = ?', chave);
      this.gravar(itens, novos, chaveDoPagamento, l);
      this.registrar(chaveDoPagamento, assinatura, novos);
      return { ok: true, saldos: novos, repetida: false };
    });
  }

  /** Solta a reserva `chave` sem mexer em saldo nenhum (partida sem vencedor ou anulada). */
  devolver(chave: string): ResultadoDeMoeda {
    if (!ehChave(chave) || chave.length > CHAVE_DA_RESERVA_MAX) return recusa('valor-invalido');
    const chaveDaDevolucao = `${chave}:devolver`;
    const assinatura = assinar('devolver', []);
    return this.transacao(() => {
      this.vencer();
      const feita = this.jaFeita(chaveDaDevolucao, assinatura);
      if (feita !== null) return feita;
      const contas = this.sql.exec('SELECT conta FROM reservas WHERE chave = ?', chave).toArray().map((r) => String(r.conta));
      if (contas.length === 0) return recusa('reserva-inexistente');
      const saldos: Saldos = {};
      for (const id of contas) saldos[id] = this.situacao(id)?.saldo ?? 0;
      this.sql.exec('DELETE FROM reservas WHERE chave = ?', chave);
      this.registrar(chaveDaDevolucao, assinatura, saldos);
      return { ok: true, saldos, repetida: false };
    });
  }

  /** Leva o saldo a zero e solta as reservas da conta (excluir a conta). O que sai fica no livro sob `chave`. Repetir não faz nada. */
  zerar(id: string, chave: string): void {
    this.transacao(() => {
      const linha = this.sql.exec('SELECT saldo FROM contas WHERE id = ?', id).toArray()[0];
      if (linha === undefined) return;
      const saldo = Number(linha.saldo);
      if (saldo !== 0) {
        this.sql.exec('INSERT INTO livro (chave, conta, delta, jogo, motivo, em) VALUES (?, ?, ?, ?, ?, ?)', chave, id, -saldo, 'banco', 'exclusao', this.relogio());
        this.sql.exec('UPDATE contas SET saldo = 0 WHERE id = ?', id);
      }
      this.sql.exec('DELETE FROM reservas WHERE conta = ?', id);
    });
  }

  /** Apaga as reservas com mais de 24 h e diz quantas eram. */
  vencerReservas(): number {
    return this.transacao(() => this.vencer());
  }

  private vencer(): number {
    const limite = this.relogio() - VALIDADE_DA_RESERVA_MS;
    const n = Number(this.sql.exec('SELECT COUNT(*) AS n FROM reservas WHERE em < ?', limite).toArray()[0]?.n ?? 0);
    if (n > 0) this.sql.exec('DELETE FROM reservas WHERE em < ?', limite);
    return n;
  }

  private situacao(id: string): SaldoDaConta | null {
    const linha = this.sql
      .exec(
        `SELECT saldo, COALESCE((SELECT SUM(valor) FROM reservas WHERE conta = contas.id), 0) AS reservado
         FROM contas WHERE id = ? AND excluida_em IS NULL`,
        id,
      )
      .toArray()[0];
    if (linha === undefined) return null;
    const saldo = Number(linha.saldo);
    const reservado = Number(linha.reservado);
    return { saldo, reservado, disponivel: saldo - reservado };
  }

  /** O resultado guardado se a chave já foi aplicada com esta assinatura; `chave-reusada` se foi com outra; `null` se é nova. */
  private jaFeita(chave: string, assinatura: string): ResultadoDeMoeda | null {
    const linha = this.sql.exec('SELECT assinatura, resultado FROM operacoes WHERE chave = ?', chave).toArray()[0];
    if (linha === undefined) return null;
    if (linha.assinatura !== assinatura) return recusa('chave-reusada');
    return { ok: true, saldos: JSON.parse(String(linha.resultado)) as Saldos, repetida: true };
  }

  private registrar(chave: string, assinatura: string, saldos: Saldos): void {
    this.sql.exec('INSERT INTO operacoes (chave, assinatura, resultado, em) VALUES (?, ?, ?, ?)', chave, assinatura, JSON.stringify(saldos), this.relogio());
  }

  private gravar(itens: readonly Variacao[], novos: Saldos, chave: string, l: Lancamento): void {
    const agora = this.relogio();
    for (const { id, delta } of itens) {
      this.sql.exec('UPDATE contas SET saldo = ? WHERE id = ?', novos[id]!, id);
      this.sql.exec('INSERT INTO livro (chave, conta, delta, jogo, motivo, em) VALUES (?, ?, ?, ?, ?, ?)', chave, id, delta, l.jogo, l.motivo, agora);
    }
  }

  /** `aplicar`, `debitar` e `creditar`: valida, confere o piso do disponível e grava saldo, livro e a chave numa transação só. */
  private mover(tipo: Tipo, variacoes: readonly Variacao[], chave: string, l: Lancamento): ResultadoDeMoeda {
    if (!ehChaveExterna(chave) || !lancamentoValido(l)) return recusa('valor-invalido');
    const itens = conferirLote(variacoes);
    if (!Array.isArray(itens)) return itens;
    const assinatura = assinar(tipo, itens);
    return this.transacao(() => {
      this.vencer();
      const feita = this.jaFeita(chave, assinatura);
      if (feita !== null) return feita;
      const novos: Saldos = {};
      for (const { id, delta } of itens) {
        const s = this.situacao(id);
        if (s === null) return recusa('conta-inexistente');
        if (delta < 0 && s.disponivel < -delta) return recusa('saldo-insuficiente');
        const depois = s.saldo + delta;
        if (!Number.isSafeInteger(depois)) return recusa('valor-invalido');
        novos[id] = depois;
      }
      this.gravar(itens, novos, chave, l);
      this.registrar(chave, assinatura, novos);
      return { ok: true, saldos: novos, repetida: false };
    });
  }
}

/** Chave que um jogo pode mandar (`aplicar`, `debitar`, `creditar`, `reservar`): bem formada e fora do espaço que o Banco usa para si. */
function ehChaveExterna(chave: string): boolean {
  return ehChave(chave) && !SUFIXOS_RESERVADOS.some((x) => chave.endsWith(x)) && !PREFIXOS_RESERVADOS.some((x) => chave.startsWith(x));
}

function lancamentoValido(l: Lancamento): boolean {
  return typeof l === 'object' && l !== null && typeof l.jogo === 'string' && FORMA_DO_JOGO.test(l.jogo) && typeof l.motivo === 'string' && l.motivo.length <= MOTIVO_MAX;
}

/** A lista como as operações a querem: ids bem formados e distintos, deltas inteiros seguros e diferentes de zero. */
function conferirLote(variacoes: readonly Variacao[]): Variacao[] | Falha {
  if (!Array.isArray(variacoes) || variacoes.length === 0 || variacoes.length > MAX_VARIACOES) return recusa('valor-invalido');
  for (const v of variacoes) {
    if (typeof v !== 'object' || v === null || !ehIdDeConta(v.id) || !inteiroSeguro(v.delta) || v.delta === 0) return recusa('valor-invalido');
  }
  if (new Set(variacoes.map((v) => v.id)).size !== variacoes.length) return recusa('conta-repetida');
  return variacoes.map((v) => ({ id: v.id, delta: v.delta }));
}

function assinar(tipo: Tipo, itens: readonly Variacao[]): string {
  const ordenadas = [...itens].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({ tipo, itens: ordenadas.map((v) => [v.id, v.delta]) });
}
