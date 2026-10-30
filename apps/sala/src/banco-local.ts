/**
 * O Banco da sala Node (L57): com `SALDO_NO_BANCO=1` ela não tem Worker do Banco por perto, então roda o MESMO núcleo `Moedas` do
 * `apps/conta` sobre `node:sqlite`, no arquivo `banco.sqlite` da pasta de dados. É o único arquivo da sala que importa o código do
 * Banco (e não só tipos); fica fora do Worker, que usa o service binding `CONTA`.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Contas, HttpDaConta, Moedas, aleatorioDoSistema, criarEsquema, lerPepper, transacaoReentrante, type CursorMinimo, type SqlMinimo } from '@sinuca/conta/nucleo';
import { SALDO_INICIAL } from '@sinuca/protocolo';
import type { BancoDaMigracao, BancoDaSala } from './banco-da-sala';
import type { BancoDaConta } from './conta-na-sinuca';
import type { Logger } from './log';

export const NOME_DO_BANCO_LOCAL = 'banco.sqlite';

export interface BancoLocal {
  readonly banco: BancoDaSala;
  /** Os mesmos `saldos` e `importarSaldos` do RPC (a migração do saldo, L60), sobre o mesmo arquivo. */
  readonly migracao: BancoDaMigracao;
  readonly moedas: Moedas;
  /**
   * As contas da Beco Games sobre o mesmo arquivo (L61): o `Contas` e o `HttpDaConta` do `apps/conta`, o mesmo código do Worker do Banco,
   * atrás da mesma interface (`tratar`, `contaDaSessao`, `excluidasDesde`). O cookie não leva `Domain` nem `Secure` (a sala Node é
   * `http://localhost`) e o e-mail de recuperação não existe (sem carteiro). `origensDeDev` é lido a cada pedido (a lista pode crescer
   * depois que a porta é conhecida). Sem `pepper` (ausente ou com menos de 32 caracteres) as operações de senha dão `nao-configurado`.
   */
  abrirConta(o: { readonly pepper: string | null | undefined; readonly origensDeDev: readonly string[]; readonly log: Logger }): BancoDaConta;
  /** Fecha o arquivo (pode ser chamado mais de uma vez). */
  fechar(): void;
}

/** `SqlMinimo` sobre um `DatabaseSync` (as leituras devolvem linhas, as escritas devolvem quantas mudaram). */
function sqlDoNode(db: DatabaseSync): SqlMinimo {
  return {
    exec(consulta, ...ligacoes): CursorMinimo {
      const st = db.prepare(consulta);
      if (st.columns().length > 0) {
        const linhas = st.all(...ligacoes) as Record<string, unknown>[];
        return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
      }
      const r = st.run(...ligacoes);
      return { toArray: () => [], rowsRead: 0, rowsWritten: Number(r.changes) };
    },
  };
}

/** Abre (ou cria) o Banco local. `arquivo` `null` = só memória (os testes). */
export function abrirBancoLocal(pasta: string | null, relogio: () => number = Date.now): BancoLocal {
  if (pasta !== null) mkdirSync(pasta, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(pasta === null ? ':memory:' : join(pasta, NOME_DO_BANCO_LOCAL));
  const sql = sqlDoNode(db);
  criarEsquema(sql);
  const transacao = transacaoReentrante(<T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  });
  const moedas = new Moedas(sql, transacao, relogio);
  // O mesmo contrato do RPC: tudo assíncrono, e argumento mal formado rejeita com `RangeError`
  const banco: BancoDaSala = {
    garantirConta: async (id, saldoInicial) => moedas.garantirConta(id, saldoInicial),
    creditar: async (id, valor, chave, lancamento) => moedas.creditar(id, valor, chave, lancamento),
    reservar: async (lote, chave, lancamento) => moedas.reservar(lote, chave, lancamento),
    liquidar: async (chave, variacoes, lancamento) => moedas.liquidar(chave, variacoes, lancamento),
    devolver: async (chave) => moedas.devolver(chave),
    debitar: async (id, valor, chave, lancamento) => moedas.debitar(id, valor, chave, lancamento),
    saldo: async (id) => moedas.saldo(id),
    operacao: async (chave) => moedas.operacao(chave),
    anularSeNaoFeita: async (chave) => moedas.anularSeNaoFeita(chave),
  };
  const migracao: BancoDaMigracao = {
    saldos: async (ids) => moedas.saldos(ids),
    importarSaldos: async (lote) => moedas.importarSaldos(lote),
  };
  let aberto = true;
  return {
    banco,
    migracao,
    moedas,
    abrirConta({ pepper, origensDeDev, log }) {
      const contas = new Contas({ sql, transacao, relogio, aleatorio: aleatorioDoSistema, moedas, pepper: lerPepper(pepper).pepper, saldoInicial: SALDO_INICIAL, maxContas: 50_000 });
      const http = new HttpDaConta({
        contas,
        carteiro: null,
        log: (evento, dados) => log(evento, dados as Record<string, string | number | boolean | null>),
        relogio,
        dominioDoCookie: null,
        cookieSeguro: false,
        origensDeDev,
        sql,
        depois: (p) => void p.catch(() => undefined),
      });
      return {
        tratar: (pedido) => http.tratar(pedido),
        contaDaSessao: async (token) => {
          const s = await contas.sessao(token);
          return s === null ? null : { id: s.conta.id, nome: s.conta.nome };
        },
        excluidasDesde: async (ms, limite) => contas.excluidasDesde(ms, limite),
      };
    },
    fechar: () => {
      if (!aberto) return;
      aberto = false;
      db.close();
    },
  };
}
