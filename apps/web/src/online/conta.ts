import { apagarJson, gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';
import type { RespostaHttp } from './carteira';
import { MENSAGEM_CONTA_FORA_DO_AR } from './mensagens-da-conta';

/**
 * A conta da Beco Games vista pelo navegador (L62), pura: o `fetch` entra de fora. As rotas são as `/conta/*` da própria sinuca
 * (o Worker as repassa ao Banco). A sessão é um cookie `HttpOnly`: o cliente nunca a lê, só pergunta "quem sou eu" (`eu()`).
 * A senha existe só dentro do pedido que a leva: nunca é guardada, logada nem gravada no `localStorage`.
 */

/** Onde o navegador lembra que já teve uma conta (só um sinal, nunca e-mail, nome nem senha): é o que separa "sessão acabou" de "carteira perdida". */
export const CHAVE_DA_CONTA = 'sinuca.conta';
const VERSAO_DO_SINAL = 1;

/** Quanto se espera pelo Banco (a sala dá 10 s a ele) antes de dar a conta como fora do ar. */
export const ESPERA_MAXIMA_DA_CONTA_MS = 15_000;


export type EstadoDaConta = { readonly tipo: 'convidado' } | { readonly tipo: 'conta'; readonly nome: string; readonly email: string };

export interface PedidoDaContaHttp {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  /** Sempre `same-origin`: o cookie da sessão vai e volta só no endereço do jogo. */
  readonly credentials: 'same-origin';
  readonly cache: 'no-store';
  readonly signal?: AbortSignal;
}

export type PedirDaConta = (url: string, init: PedidoDaContaHttp) => Promise<RespostaHttp>;

/** O `fetch` do navegador, no formato acima. */
export const pedirContaPeloNavegador: PedirDaConta = (url, init) => fetch(url, init);

/** `fora-do-ar`: a rede caiu, o Banco não respondeu a tempo ou respondeu algo que não é da conta. Os outros são o `erro` da API. */
export interface FalhaDaConta {
  readonly ok: false;
  readonly erro: string;
  /** A frase da API (ou a de `fora-do-ar`), pronta para a tela. */
  readonly mensagem: string;
  readonly tenteEmS?: number;
}

export type ResultadoDaConta = { readonly ok: true; readonly estado: EstadoDaConta } | FalhaDaConta;
export type ResultadoDoEsqueci = { readonly ok: true; readonly mensagem: string } | FalhaDaConta;

export interface DependenciasDaConta {
  readonly pedir: PedirDaConta;
  readonly armazenamento: ArmazenamentoMinimo | null;
  readonly agendar: (fn: () => void, ms: number) => () => void;
  /** O código do convidado deste navegador; só o `criar` o leva, no `Authorization: Bearer`, para a carteira virar conta. */
  readonly codigoDoConvidado: () => string | undefined;
  readonly esperaMaximaMs?: number;
  /** Prefixo dos caminhos (`''` = o mesmo endereço da página). */
  readonly base?: string;
}

const fora = (): FalhaDaConta => ({ ok: false, erro: 'fora-do-ar', mensagem: MENSAGEM_CONTA_FORA_DO_AR });

const texto = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 400 ? v : null);

/** `{ conta: { nome, email } }` -> o estado; `null` se não tem essa forma. */
function contaDaResposta(corpo: unknown): EstadoDaConta | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const c = (corpo as { conta?: unknown }).conta;
  if (typeof c !== 'object' || c === null) return null;
  const nome = texto((c as { nome?: unknown }).nome);
  const email = texto((c as { email?: unknown }).email);
  return nome === null || email === null ? null : { tipo: 'conta', nome, email };
}

export class ContaDoAparelho {
  #estado: EstadoDaConta = { tipo: 'convidado' };
  readonly #ouvintes = new Set<(estado: EstadoDaConta) => void>();

  constructor(private readonly deps: DependenciasDaConta) {}

  /** O que se sabe agora; `convidado` até o `eu()` responder. Sem e-mail fora das telas da conta. */
  estado(): EstadoDaConta {
    return this.#estado;
  }

  /** O estado mudou (entrou, criou, saiu, trocou o nome). Devolve o cancelamento. */
  aoMudar(ouvinte: (estado: EstadoDaConta) => void): () => void {
    this.#ouvintes.add(ouvinte);
    return () => void this.#ouvintes.delete(ouvinte);
  }

  /** Este navegador já esteve numa conta e ainda não saiu dela de propósito? (A sessão pode ter vencido.) */
  teveConta(): boolean {
    const v = lerJson(CHAVE_DA_CONTA, this.deps.armazenamento);
    return typeof v === 'object' && v !== null && (v as { versao?: unknown }).versao === VERSAO_DO_SINAL;
  }

  /** "Jogar como convidado" depois de a sessão acabar: esquece o sinal, sem pedir nada à rede. */
  esquecerSinal(): void {
    apagarJson(CHAVE_DA_CONTA, this.deps.armazenamento);
  }

  /** Quem sou eu? Sem sessão (401) é convidado e dá certo; só rede caída ou resposta estranha é falha (o estado fica como estava). */
  async eu(): Promise<ResultadoDaConta> {
    const r = await this.#pedir('GET', 'eu', null, false);
    if (r === null) return fora();
    if (r.status === 401) return this.#virarConvidado(false);
    if (!r.ok) return this.#falha(r);
    return this.#adotar(r.corpo);
  }

  /** Cria a conta; levando o código do convidado deste navegador, a carteira dele (moedas e itens) vira a conta. */
  criar(dados: { readonly email: string; readonly senha: string; readonly nome: string }): Promise<ResultadoDaConta> {
    return this.#entrando('criar', { email: dados.email, senha: dados.senha, nome: dados.nome }, true);
  }

  entrar(dados: { readonly email: string; readonly senha: string }): Promise<ResultadoDaConta> {
    return this.#entrando('entrar', { email: dados.email, senha: dados.senha }, false);
  }

  /** Apaga a sessão no Banco e o cookie. Só vira convidado se o Banco confirmou. */
  async sair(): Promise<ResultadoDaConta> {
    const r = await this.#pedir('POST', 'sair', null, false);
    if (r === null) return fora();
    if (!r.ok && r.status !== 401) return this.#falha(r);
    return this.#virarConvidado(true);
  }

  async nome(nome: string): Promise<ResultadoDaConta> {
    const r = await this.#pedir('POST', 'nome', { nome }, false);
    if (r === null) return fora();
    if (!r.ok) return this.#falhaDeSessao(r);
    return this.#adotar(r.corpo);
  }

  /** Exclui a conta (pede a senha). Só vira convidado se o Banco confirmou. */
  async excluir(senha: string): Promise<ResultadoDaConta> {
    const r = await this.#pedir('POST', 'excluir', { senha }, false);
    if (r === null) return fora();
    if (!r.ok) return this.#falhaDeSessao(r);
    return this.#virarConvidado(true);
  }

  /** Pede o e-mail de nova senha. A API responde sempre a mesma frase, com ou sem conta. */
  async esqueci(email: string): Promise<ResultadoDoEsqueci> {
    const r = await this.#pedir('POST', 'esqueci', { email }, false);
    if (r === null) return fora();
    if (!r.ok) return this.#falha(r);
    const mensagem = typeof r.corpo === 'object' && r.corpo !== null ? texto((r.corpo as { mensagem?: unknown }).mensagem) : null;
    return mensagem === null ? fora() : { ok: true, mensagem };
  }

  // ---------------------------------------------------------------- por dentro

  async #entrando(acao: 'criar' | 'entrar', corpo: object, comCodigo: boolean): Promise<ResultadoDaConta> {
    const r = await this.#pedir('POST', acao, corpo, comCodigo);
    if (r === null) return fora();
    if (!r.ok) return this.#falha(r);
    return this.#adotar(r.corpo);
  }

  #adotar(corpo: unknown): ResultadoDaConta {
    const estado = contaDaResposta(corpo);
    if (estado === null) return fora();
    gravarJson(CHAVE_DA_CONTA, { versao: VERSAO_DO_SINAL }, this.deps.armazenamento);
    this.#mudar(estado);
    return { ok: true, estado };
  }

  #virarConvidado(esquecer: boolean): ResultadoDaConta {
    if (esquecer) apagarJson(CHAVE_DA_CONTA, this.deps.armazenamento);
    const estado: EstadoDaConta = { tipo: 'convidado' };
    this.#mudar(estado);
    return { ok: true, estado };
  }

  #mudar(estado: EstadoDaConta): void {
    const igual = estado.tipo === this.#estado.tipo && (estado.tipo === 'convidado' || (this.#estado.tipo === 'conta' && estado.nome === this.#estado.nome && estado.email === this.#estado.email));
    this.#estado = estado;
    if (!igual) for (const ouvinte of this.#ouvintes) ouvinte(estado);
  }

  /** Falha de um pedido que exige sessão: 401 `sem-sessao` quer dizer que ela acabou, então o aparelho já é convidado. */
  #falhaDeSessao(r: { status: number; corpo: unknown }): FalhaDaConta {
    const f = this.#falha(r);
    if (r.status === 401 && f.erro === 'sem-sessao') this.#mudar({ tipo: 'convidado' });
    return f;
  }

  #falha(r: { status: number; corpo: unknown }): FalhaDaConta {
    const c = typeof r.corpo === 'object' && r.corpo !== null ? (r.corpo as { erro?: unknown; mensagem?: unknown; tenteEmS?: unknown }) : {};
    const mensagem = texto(c.mensagem);
    const erro = typeof c.erro === 'string' && /^[a-z-]{1,40}$/.test(c.erro) ? c.erro : null;
    if (mensagem === null || erro === null) return fora();
    const tenteEmS = typeof c.tenteEmS === 'number' && Number.isFinite(c.tenteEmS) && c.tenteEmS > 0 ? Math.ceil(c.tenteEmS) : undefined;
    return { ok: false, erro, mensagem, ...(tenteEmS === undefined ? {} : { tenteEmS }) };
  }

  /** `null` = a rede caiu, passou do prazo ou a resposta não é JSON. */
  async #pedir(metodo: 'GET' | 'POST', acao: string, corpo: object | null, comCodigo: boolean): Promise<{ ok: boolean; status: number; corpo: unknown } | null> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (corpo !== null) headers['Content-Type'] = 'application/json';
    if (comCodigo) {
      const codigo = this.deps.codigoDoConvidado();
      if (codigo !== undefined) headers.Authorization = `Bearer ${codigo}`;
    }
    const aborto = new AbortController();
    const limite = this.deps.esperaMaximaMs ?? ESPERA_MAXIMA_DA_CONTA_MS;
    const comPrazo = async <T>(promessa: Promise<T>): Promise<T | 'prazo'> => {
      let cancelar: () => void = () => {};
      const prazo = new Promise<'prazo'>((resolver) => {
        cancelar = this.deps.agendar(() => {
          aborto.abort();
          resolver('prazo');
        }, limite);
      });
      try {
        return await Promise.race([promessa, prazo]);
      } finally {
        cancelar();
      }
    };
    try {
      const init: PedidoDaContaHttp = { method: metodo, headers, credentials: 'same-origin', cache: 'no-store', signal: aborto.signal, ...(corpo === null ? {} : { body: JSON.stringify(corpo) }) };
      const resposta = await comPrazo(this.deps.pedir(`${this.deps.base ?? ''}/conta/${acao}`, init));
      if (resposta === 'prazo') return null;
      const json = await comPrazo(resposta.json());
      if (json === 'prazo') return null;
      return { ok: resposta.ok, status: resposta.status, corpo: json };
    } catch {
      return null;
    }
  }
}
