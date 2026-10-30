/**
 * O `/conta/*` da sinuca (L61), igual na sala Node e no Worker: traduz o pedido HTTP no `PedidoDaConta` do Banco, o entrega
 * (`banco.tratar`: service binding `CONTA` no Worker, o `HttpDaConta` local na sala Node) e devolve a resposta dele com o `Set-Cookie`.
 * Nenhuma regra de conta mora aqui: rotas, Origin, limites, cookie e mensagens são do Banco (`apps/conta/src/http.ts`).
 *
 * O que a sinuca faz além de repassar, só depois de o Banco dizer que deu certo:
 * - `criar` com o código de um convidado (o `Authorization: Bearer` de sempre) que virou conta: a carteira desse `id` passa a só abrir
 *   com a sessão (`marcarDaConta`). Sem isto o código, que continua no `localStorage` do navegador, seguiria abrindo a carteira da conta.
 * - `excluir`: a carteira de itens da conta (tacos, balão, missões, estatísticas) é apagada (`apagarDaConta`). O `id` sai da sessão,
 *   resolvida ANTES do Banco (depois dele a sessão já não existe). A sinuca nunca mexe na caixa do Banco: ele já zerou a conta.
 * - `sair` e `excluir` (L61b): a conta é esquecida (`esquecerConta`): as conexões abertas perdem o `id` e os lugares que usam a carteira dela
 *   ficam sem carteira. Sem isto quem saiu da conta seguiria jogando com a carteira dela pela mesma conexão, ou pelo token do lugar.
 * O que falhar aqui não desfaz o que o Banco já fez: vai ao log (sem `id`) e a varredura das excluídas (`varredura-de-excluidas.ts`)
 * apaga a carteira da conta excluída mesmo assim.
 */
import type { ApiDoBanco, PedidoDaConta, RespostaDaConta } from '@sinuca/conta/contrato';
import { ehCodigoDeCarteira, TAMANHO_CODIGO_CARTEIRA } from '@sinuca/protocolo';
import { SEGURANCA } from './cabecalhos';
import type { PedidoDaCarteira, RespostaDaCarteira } from './carteira-http';
import { idDoCodigo } from './id-da-carteira';
import type { Logger } from './log';
import { tokenDaSessao } from './sessao-da-conta';

/** O Banco como o `/conta/*` e a identidade o usam: o HTTP da conta, a conta da sessão e a varredura das excluídas. */
export type BancoDaConta = Pick<ApiDoBanco, 'tratar' | 'contaDaSessao' | 'excluidasDesde'>;

/** O que a sinuca faz com a carteira de itens quando a conta muda. No Worker são chamadas ao `SalaDO`; na sala Node, as carteiras direto. */
export interface EfeitosNaCarteira {
  marcarDaConta(id: string): Promise<unknown> | unknown;
  apagarDaConta(id: string): Promise<unknown> | unknown;
  /** A conta saiu ou foi excluída (L61b): as conexões e os lugares que a trazem a esquecem. No `sair` vai a `sessao` que saiu: só ela é esquecida (L61c). */
  esquecerConta(id: string, sessao?: string): Promise<unknown> | unknown;
  /**
   * A marca `daConta` não pôde ser posta (as duas tentativas falharam): fica pendente, persistida, para o alarm e a sessão a cumprirem (L61b).
   * Opcional só para quem não guarda estado (os testes de rota).
   */
  adiarMarca?(id: string): Promise<unknown> | unknown;
}

/** O corpo de um pedido da conta tem no máximo isto (o mesmo teto do Banco, `MAX_CORPO`); mais que isso é 413 sem ler o resto. */
export const MAX_CORPO_DA_CONTA = 8 * 1024;
/** Quanto a sinuca espera o Banco responder antes de dizer que a conta está fora do ar. */
export const PRAZO_DO_BANCO_MS = 10_000;

const PREFIXO = '/conta/';
const MAX_ACAO = 32;
const ROTAS: ReadonlyMap<string, 'GET' | 'POST'> = new Map([
  ['criar', 'POST'],
  ['entrar', 'POST'],
  ['eu', 'GET'],
  ['sair', 'POST'],
  ['nome', 'POST'],
  ['excluir', 'POST'],
  ['esqueci', 'POST'],
  ['nova-senha', 'POST'],
]);

const FORA_DO_AR = 'A conta está fora do ar. Tente mais tarde.';
const BEARER = new RegExp(`^Bearer ([A-Za-z0-9_-]{${TAMANHO_CODIGO_CARTEIRA}})$`, 'i');
const codificador = new TextEncoder();

/** `true` se o caminho é do `/conta/*` (o resto do servidor segue seu rumo). */
export const ehCaminhoDaConta = (caminho: string): boolean => caminho.startsWith(PREFIXO);

function responder(status: number, corpo: object, extra: Record<string, string | number> = {}): RespostaDaCarteira {
  const dado = JSON.stringify(corpo);
  return {
    status,
    corpo: dado,
    cabecalhos: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURANCA, 'Content-Length': codificador.encode(dado).length, ...extra },
  };
}

const falha = (status: number, erro: string, mensagem: string, extra: Record<string, string | number> = {}): RespostaDaCarteira => responder(status, { erro, mensagem }, extra);

/** Espera `promessa`, ou desiste depois de `ms` (a promessa segue a vida dela). */
export function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('o Banco não respondeu a tempo')), ms);
    (t as { unref?: () => void }).unref?.();
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error('desconhecido'));
      },
    );
  });
}

export interface DependenciasDoPedidoDaConta {
  /** O pedido neutro (o mesmo da carteira): método, caminho, cabeçalhos e o corpo sob demanda. */
  readonly pedido: PedidoDaCarteira;
  /** O IP como o Banco o quer: o `CF-Connecting-IP` cru no Worker (o Banco calcula a chave do balde), a chave do balde na sala Node. Nunca vai a log. */
  readonly ipParaOBanco: string;
  readonly banco: Pick<BancoDaConta, 'tratar' | 'contaDaSessao'>;
  readonly efeitos: EfeitosNaCarteira;
  /** Tempo para o corpo chegar inteiro (o mesmo do HTTP da carteira). */
  readonly tempoDoCorpoMs: number;
  readonly log: Logger;
  readonly prazoDoBancoMs?: number;
}

/**
 * Trata um pedido a `/conta/<acao>`: confere rota e método, lê o corpo (até 8 KB), repassa ao Banco e aplica os efeitos na carteira.
 * `'abortada'`: quem pediu foi embora. Nunca lança.
 */
export async function tratarContaDaSinuca(d: DependenciasDoPedidoDaConta): Promise<RespostaDaCarteira | 'abortada'> {
  const { pedido, banco, efeitos, log } = d;
  const prazo = d.prazoDoBancoMs ?? PRAZO_DO_BANCO_MS;
  const acao = pedido.caminho.slice(PREFIXO.length);
  const metodo = acao.length > MAX_ACAO ? undefined : ROTAS.get(acao);
  if (metodo === undefined) return falha(404, 'nao-encontrado', 'Não encontrado.');
  if (pedido.metodo !== metodo) return falha(405, 'metodo', 'Método não permitido.', { Allow: metodo });

  // o corpo só existe no POST; o limite vale antes de ler (o declarado) e durante (o lido)
  let corpo: string | null = null;
  if (metodo === 'POST') {
    const declarado = pedido.cabecalho('content-length');
    if (declarado !== undefined && Number(declarado) > MAX_CORPO_DA_CONTA) return falha(413, 'corpo-grande', 'Pedido grande demais.');
    const leitura = await pedido.lerCorpo(MAX_CORPO_DA_CONTA, d.tempoDoCorpoMs);
    switch (leitura.tipo) {
      case 'abortado':
        return 'abortada';
      case 'grande':
        return falha(413, 'corpo-grande', 'Pedido grande demais.');
      case 'lento':
        return falha(408, 'corpo-lento', 'O pedido demorou demais.');
      case 'ilegivel':
        return falha(400, 'corpo-invalido', 'Pedido inválido.');
      case 'texto':
        corpo = leitura.texto === '' ? null : leitura.texto;
    }
  }

  const cookie = pedido.cabecalho('cookie') ?? null;
  const codigo = BEARER.exec(pedido.cabecalho('authorization') ?? '')?.[1];
  const convidado = ehCodigoDeCarteira(codigo) ? codigo : null;

  try {
    // excluir e sair apagam a sessão: o `id` da conta tem de ser lido antes do Banco (L61b: o `sair` também)
    let idAntes: string | null = null;
    let tokenAntes: string | null = null;
    if (acao === 'excluir' || acao === 'sair') {
      const token = tokenDaSessao(cookie);
      tokenAntes = token;
      if (token !== null) idAntes = (await comPrazo(Promise.resolve(banco.contaDaSessao(token)), prazo))?.id ?? null;
    }
    const pedidoDoBanco: PedidoDaConta = { acao, metodo: pedido.metodo, origem: pedido.cabecalho('origin') ?? null, ip: d.ipParaOBanco, cookie, convidado, corpo };
    const r: RespostaDaConta = await comPrazo(Promise.resolve(banco.tratar(pedidoDoBanco)), prazo);

    if (acao === 'criar' && r.status === 201 && convidado !== null) {
      const id = idDoCodigo(convidado);
      if (!(await aplicar('conta-marca-falhou', () => efeitos.marcarDaConta(id), log)) && efeitos.adiarMarca) {
        const adiarMarca = efeitos.adiarMarca.bind(efeitos);
        await aplicar('conta-marca-perdida', () => adiarMarca(id), log);
      }
    }
    if (acao === 'excluir' && r.status === 200 && idAntes !== null) await aplicar('conta-apagar-falhou', () => efeitos.apagarDaConta(idAntes), log);
    if ((acao === 'excluir' || acao === 'sair') && r.status === 200 && idAntes !== null) {
      // o `sair` apaga só a sessão daquele aparelho no Banco: a sinuca esquece só as conexões dela; o `excluir` leva a conta toda
      const sessao = acao === 'sair' && tokenAntes !== null ? tokenAntes : undefined;
      await aplicar('conta-esquecer-falhou', () => efeitos.esquecerConta(idAntes, sessao), log);
    }

    return responder(r.status, r.corpo, r.cookie === undefined ? {} : { 'Set-Cookie': r.cookie });
  } catch {
    log('conta-fora', { acao });
    return falha(503, 'fora-do-ar', FORA_DO_AR, { 'Retry-After': 30 });
  }
}

/** Um efeito na carteira, com uma segunda tentativa; se falhar de novo só vai ao log (o Banco já fez a parte dele). */
async function aplicar(evento: string, efeito: () => Promise<unknown> | unknown, log: Logger): Promise<boolean> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      await efeito();
      return true;
    } catch {
      // tenta de novo uma vez
    }
  }
  log(evento);
  return false;
}
