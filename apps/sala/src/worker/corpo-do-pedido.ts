/**
 * O HTTP da carteira (carteira-http.ts) e as rotas de administração em cima de `Request` e `Response`, as do Worker: traduz o pedido
 * no pedido neutro, lê o corpo com limite e prazo e devolve a resposta pronta. Nada de regra aqui.
 */
import type { LeituraDoCorpo, PedidoDaCarteira, RespostaDaCarteira } from '../carteira-http';

/** Lê o corpo até `limite` bytes e `tempoMs`; passou de um dos dois, desiste sem ler o resto. */
export async function lerCorpoDoPedido(request: Request, limite: number, tempoMs: number): Promise<LeituraDoCorpo> {
  if (request.body === null) return { tipo: 'texto', texto: '' };
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  let prazo: ReturnType<typeof setTimeout> | undefined;
  const lento = new Promise<'lento'>((resolve) => {
    prazo = setTimeout(() => resolve('lento'), tempoMs);
  });
  try {
    for (;;) {
      const r = await Promise.race([leitor.read(), lento]);
      if (r === 'lento') {
        leitor.cancel().catch(() => undefined);
        return { tipo: 'lento' };
      }
      if (r.done) break;
      total += r.value.length;
      if (total > limite) {
        leitor.cancel().catch(() => undefined);
        return { tipo: 'grande' };
      }
      partes.push(r.value);
    }
  } catch {
    return { tipo: 'abortado' };
  } finally {
    clearTimeout(prazo);
  }
  const inteiro = new Uint8Array(total);
  let ponta = 0;
  for (const p of partes) {
    inteiro.set(p, ponta);
    ponta += p.length;
  }
  try {
    return { tipo: 'texto', texto: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(inteiro) };
  } catch {
    return { tipo: 'ilegivel' };
  }
}

/** O pedido neutro da carteira para um `Request`; `ip` é a chave do balde (`ipDoCliente`). */
export function pedidoDoRequest(request: Request, ip: string): PedidoDaCarteira {
  return {
    metodo: request.method,
    caminho: new URL(request.url).pathname,
    ip,
    cabecalho: (nome) => request.headers.get(nome) ?? undefined,
    lerCorpo: (limite, tempoMs) => lerCorpoDoPedido(request, limite, tempoMs),
    // Num Worker não há conexão a fechar: o corpo que ninguém leu o runtime descarta.
    corpoPendente: () => false,
    descartarCorpo: () => undefined,
  };
}

export function respostaDoResultado(r: RespostaDaCarteira): Response {
  const cabecalhos = new Headers();
  for (const [nome, valor] of Object.entries(r.cabecalhos)) cabecalhos.set(nome, String(valor));
  return new Response(r.corpo, { status: r.status, headers: cabecalhos });
}
