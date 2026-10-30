/**
 * A entrada do Worker `becogames-conta`. O Banco não atende a internet: os outros Workers (portal, sinuca, jogos novos) o chamam por service
 * binding (RPC) no entrypoint `Banco`, que repassa cada método ao Durable Object único (`banco-do.ts`). O `fetch` padrão só responde
 * `GET /saude`; todo o resto é 404 (nenhuma rota de conta fica exposta no `workers.dev`).
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { configDoBanco } from '../config';
import type { ApiDoBanco, Lancamento, PedidoDaConta, RespostaDaConta, ResultadoDeMoeda, SaldoDaConta, Variacao } from '../contrato';
import { BancoDO } from './banco-do';

export { BancoDO };

const NOME_DO_OBJETO = 'banco';

export class Banco extends WorkerEntrypoint<Env> implements ApiDoBanco {
  /** O objeto único. `LOCAL_DO` (uma dica de região, `sam` = América do Sul) só vale na criação; vazio = sem dica. */
  private objeto(): DurableObjectStub<BancoDO> {
    const id = this.env.BANCO.idFromName(NOME_DO_OBJETO);
    const { localDo } = configDoBanco(this.env as unknown as Record<string, unknown>);
    return localDo === '' ? this.env.BANCO.get(id) : this.env.BANCO.get(id, { locationHint: localDo });
  }

  async tratar(pedido: PedidoDaConta): Promise<RespostaDaConta> {
    return await this.objeto().tratar(pedido);
  }

  async contaDaSessao(token: string): Promise<{ id: string; nome: string } | null> {
    return await this.objeto().contaDaSessao(token);
  }

  async contaDoCodigo(codigo: string): Promise<{ id: string; convidado: boolean } | null> {
    return await this.objeto().contaDoCodigo(codigo);
  }

  async garantirConta(id: string, saldoInicial: number): Promise<{ criada: boolean; saldo: number }> {
    return await this.objeto().garantirConta(id, saldoInicial);
  }

  async saldo(id: string): Promise<SaldoDaConta | null> {
    return await this.objeto().saldo(id);
  }

  async aplicar(variacoes: readonly Variacao[], chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return await this.objeto().aplicar(variacoes, chave, lancamento);
  }

  async debitar(id: string, valor: number, chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return await this.objeto().debitar(id, valor, chave, lancamento);
  }

  async creditar(id: string, valor: number, chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return await this.objeto().creditar(id, valor, chave, lancamento);
  }

  async reservar(lote: readonly { id: string; valor: number }[], chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return await this.objeto().reservar(lote, chave, lancamento);
  }

  async liquidar(chave: string, variacoes: readonly Variacao[], lancamento: Lancamento): Promise<ResultadoDeMoeda> {
    return await this.objeto().liquidar(chave, variacoes, lancamento);
  }

  async devolver(chave: string): Promise<ResultadoDeMoeda> {
    return await this.objeto().devolver(chave);
  }

  async operacao(chave: string): Promise<ResultadoDeMoeda | null> {
    return await this.objeto().operacao(chave);
  }

  async anularSeNaoFeita(chave: string): Promise<{ feita: ResultadoDeMoeda } | { anulada: true }> {
    return await this.objeto().anularSeNaoFeita(chave);
  }

  async saldos(ids: readonly string[]): Promise<Readonly<Record<string, SaldoDaConta | null>>> {
    return await this.objeto().saldos(ids);
  }

  async importarSaldos(lote: readonly { id: string; saldo: number }[]): Promise<{ criadas: number; iguais: number; conflitos: readonly string[] }> {
    return await this.objeto().importarSaldos(lote);
  }

  async excluidasDesde(ms: number, limite: number): Promise<{ ids: string[]; ate: number }> {
    return await this.objeto().excluidasDesde(ms, limite);
  }
}

export default {
  fetch(pedido: Request): Response {
    const url = new URL(pedido.url);
    if (pedido.method === 'GET' && url.pathname === '/saude') return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    return new Response('não encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
  },
} satisfies ExportedHandler<Env>;
