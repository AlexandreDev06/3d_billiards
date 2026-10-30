/**
 * O Banco da Beco Games num Durable Object só (`idFromName('banco')`): contas, sessões, moedas e recuperação, tudo no SQLite do objeto.
 * Monta `Moedas`, `Contas` e `HttpDaConta` uma vez e expõe `ApiDoBanco`; o entrypoint `Banco` (entrada.ts) só repassa as chamadas.
 *
 * Todo o trabalho é síncrono sobre o SQLite, e o único `await` é o Web Crypto (hash e resumo), sempre ANTES de uma transação
 * (`ctx.storage.transactionSync`, reentrante por `transacaoReentrante`). O hash da senha (PBKDF2) ocupa o objeto por uns 15 a 30 ms a cada
 * entrar ou criar; os baldes do `HttpDaConta` limitam quantos chegam.
 */
import { DurableObject } from 'cloudflare:workers';
import { carteiroDoResend, type Carteiro } from '../carteiro';
import { configDoBanco, lerPepper, PEPPER_MINIMO } from '../config';
import { Contas } from '../contas';
import type { ApiDoBanco, Lancamento, PedidoDaConta, RespostaDaConta, ResultadoDeMoeda, SaldoDaConta, Variacao } from '../contrato';
import { aleatorioDoSistema } from '../cripto';
import { criarEsquema } from '../esquema';
import { HttpDaConta } from '../http';
import { Moedas } from '../moedas';
import { transacaoReentrante } from '../sql';

/** Uma linha JSON por evento (os Workers Logs indexam os campos). Quem chama só passa contagens, status e `conta` de 8 caracteres. */
const logEmJson = (evento: string, dados: Record<string, unknown>): void => console.log(JSON.stringify({ evento, ...dados }));

export class BancoDO extends DurableObject<Env> implements ApiDoBanco {
  private readonly moedas: Moedas;
  private readonly contas: Contas;
  private readonly http: HttpDaConta;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const config = configDoBanco(env as unknown as Record<string, unknown>);
    const relogio = (): number => Date.now();
    const transacao = transacaoReentrante((fn) => ctx.storage.transactionSync(fn));
    void ctx.blockConcurrencyWhile(async () => criarEsquema(ctx.storage.sql));
    this.moedas = new Moedas(ctx.storage.sql, transacao, relogio);
    // Sem o pepper (ausente ou com menos de 32 caracteres) nenhuma operação de senha funciona (`nao-configurado`) e o esqueci não grava
    // nada; sem a chave do Resend o esqueci só registra o evento.
    const { pepper, curto } = lerPepper(env.PEPPER_DA_SENHA);
    if (curto) logEmJson('pepper-curto', { minimo: PEPPER_MINIMO });
    const carteiro: Carteiro | null = env.RESEND_API_KEY !== undefined && env.RESEND_API_KEY !== '' ? carteiroDoResend(env.RESEND_API_KEY, (...a) => fetch(...a)) : null;
    this.contas = new Contas({
      sql: ctx.storage.sql,
      transacao,
      relogio,
      aleatorio: aleatorioDoSistema,
      moedas: this.moedas,
      pepper,
      saldoInicial: config.saldoInicial,
      maxContas: config.maxContas,
    });
    this.http = new HttpDaConta({
      contas: this.contas,
      carteiro,
      log: logEmJson,
      relogio,
      sql: ctx.storage.sql,
      dominioDoCookie: config.dominioDoCookie,
      cookieSeguro: config.cookieSeguro,
      origensDeDev: config.origensDeDev,
      depois: (p) => this.ctx.waitUntil(p),
    });
  }

  tratar(pedido: PedidoDaConta): Promise<RespostaDaConta> {
    return this.http.tratar(pedido);
  }

  async contaDaSessao(token: string): Promise<{ id: string; nome: string } | null> {
    const s = await this.contas.sessao(token);
    return s === null ? null : { id: s.conta.id, nome: s.conta.nome };
  }

  contaDoCodigo(codigo: string): Promise<{ id: string; convidado: boolean } | null> {
    return this.contas.contaDoCodigo(codigo);
  }

  async garantirConta(id: string, saldoInicial: number): Promise<{ criada: boolean; saldo: number }> {
    return this.moedas.garantirConta(id, saldoInicial);
  }

  async saldo(id: string): Promise<SaldoDaConta | null> {
    return this.moedas.saldo(id);
  }

  async aplicar(variacoes: readonly Variacao[], chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return this.moedas.aplicar(variacoes, chave, lancamento);
  }

  async debitar(id: string, valor: number, chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return this.moedas.debitar(id, valor, chave, lancamento);
  }

  async creditar(id: string, valor: number, chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return this.moedas.creditar(id, valor, chave, lancamento);
  }

  async reservar(lote: readonly { id: string; valor: number }[], chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return this.moedas.reservar(lote, chave, lancamento);
  }

  async liquidar(chave: string, variacoes: readonly Variacao[], lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return this.moedas.liquidar(chave, variacoes, lancamento);
  }

  async devolver(chave: string): Promise<ResultadoDeMoeda> {
    return this.moedas.devolver(chave);
  }

  async operacao(chave: string): Promise<ResultadoDeMoeda | null> {
    return this.moedas.operacao(chave);
  }

  async anularSeNaoFeita(chave: string): Promise<{ feita: ResultadoDeMoeda } | { anulada: true }> {
    return this.moedas.anularSeNaoFeita(chave);
  }

  async saldos(ids: readonly string[]): Promise<Readonly<Record<string, SaldoDaConta | null>>> {
    return this.moedas.saldos(ids);
  }

  async importarSaldos(lote: readonly { id: string; saldo: number }[]): Promise<{ criadas: number; iguais: number; conflitos: readonly string[] }> {
    return this.moedas.importarSaldos(lote);
  }

  async excluidasDesde(ms: number, limite: number): Promise<{ ids: string[]; ate: number }> {
    return this.contas.excluidasDesde(ms, limite);
  }
}
