/**
 * O Worker do portal: serve os assets e repassa `/api/conta/<acao>` ao Banco (service binding, entrypoint `Banco`). Só separa o pedido
 * em partes e devolve a resposta; as regras (Origin, limites, cookie, mensagens) são do Banco. Mapa e rotas em apps/portal/CLAUDE.md.
 */
import type { ApiDoBanco, PedidoDaConta, RespostaDaConta } from '@sinuca/conta/contrato';

/** O mesmo teto do Banco (`MAX_CORPO`): o portal nem lê além disso. */
const MAX_CORPO = 8 * 1024;

export interface Ambiente {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CONTA: ApiDoBanco;
}

const CABECALHOS_BASE = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function json(status: number, corpo: object): Response {
  return new Response(JSON.stringify(corpo), { status, headers: CABECALHOS_BASE });
}

/** O JSON da resposta do Banco, com `Set-Cookie` quando houver, `no-store` e `nosniff`. */
export function respostaDaConta(r: RespostaDaConta): Response {
  const cabecalhos = new Headers(CABECALHOS_BASE);
  if (r.cookie) cabecalhos.append('Set-Cookie', r.cookie);
  return new Response(JSON.stringify(r.corpo), { status: r.status, headers: cabecalhos });
}

/** Lê o corpo até `MAX_CORPO` bytes; passou disso, devolve `null` sem ler o resto. */
async function lerCorpo(request: Request): Promise<string | null | 'grande'> {
  const declarado = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declarado) && declarado > MAX_CORPO) return 'grande';
  if (!request.body) return null;
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CORPO) {
      await leitor.cancel();
      return 'grande';
    }
    partes.push(value);
  }
  if (total === 0) return null;
  const todo = new Uint8Array(total);
  let ao = 0;
  for (const p of partes) {
    todo.set(p, ao);
    ao += p.byteLength;
  }
  return new TextDecoder().decode(todo);
}

/** O pedido do Banco, ou direto a resposta 413 se o corpo passa de 8 KB. O `convidado` é sempre `null` no portal. */
export async function pedidoDoRequest(request: Request, acao: string): Promise<PedidoDaConta | Response> {
  const corpo = await lerCorpo(request);
  if (corpo === 'grande') return json(413, { erro: 'corpo-grande', mensagem: 'Pedido grande demais.' });
  return {
    acao,
    metodo: request.method.toUpperCase(),
    origem: request.headers.get('Origin'),
    ip: request.headers.get('CF-Connecting-IP') ?? '',
    cookie: request.headers.get('Cookie'),
    convidado: null,
    corpo,
  };
}

export default {
  async fetch(request: Request, env: Ambiente): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const acao = /^\/api\/conta\/([a-z-]{1,20})$/.exec(pathname)?.[1];
    if (acao === undefined) return json(404, { erro: 'nao-encontrado', mensagem: 'Não encontrado.' });
    const pedido = await pedidoDoRequest(request, acao);
    if (pedido instanceof Response) return pedido;
    try {
      return respostaDaConta(await env.CONTA.tratar(pedido));
    } catch {
      return json(503, { erro: 'cheio', mensagem: 'A conta está fora do ar. Tente mais tarde.' });
    }
  },
};
