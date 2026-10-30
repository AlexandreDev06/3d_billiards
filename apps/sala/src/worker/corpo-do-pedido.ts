/**
 * O HTTP da carteira (carteira-http.ts) e as rotas de administração em cima de `Request` e `Response`, as do Worker: traduz o pedido
 * no pedido neutro, lê o corpo com limite e prazo e devolve a resposta pronta. Nada de regra aqui.
 */
import type { LeituraDoCorpo, PedidoDaCarteira, RespostaDaCarteira } from '../carteira-http';
import { CABECALHO_DA_CONTA, CABECALHO_DA_SESSAO, idDaContaDoCabecalho } from '../sessao-da-conta';

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

/**
 * O pedido neutro da carteira para um `Request`; `ip` é a chave do balde (`ipDoCliente`). O `id` da conta (L61) é o do cabeçalho
 * interno que só a borda do Worker põe (`CABECALHO_DA_CONTA`); o objeto não tem endereço público, então o que chega aqui passou por ela.
 * `vindoDaBorda: false` (o `/conta/*`, tratado na própria borda com o pedido cru) não lê o cabeçalho.
 */
export function pedidoDoRequest(request: Request, ip: string, vindoDaBorda = true): PedidoDaCarteira {
  // L61b: o `/conta/*` é tratado NA borda, com o pedido cru do navegador: o cabeçalho interno que vier nele não é de ninguém e não é lido
  const idDaConta = vindoDaBorda ? idDaContaDoCabecalho(request.headers.get(CABECALHO_DA_CONTA)) : undefined;
  return {
    metodo: request.method,
    caminho: new URL(request.url).pathname,
    ip,
    ...(idDaConta === undefined ? {} : { idDaConta }),
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

/**
 * O pedido como o objeto o recebe (L61): o cabeçalho interno da conta que veio de fora é SEMPRE apagado (nenhum navegador diz ao objeto
 * quem é), e só então a borda põe o `id` que o Banco provou pela sessão, se houve. O `Cookie` não segue: o objeto não precisa dele.
 */
export function paraOObjeto(request: Request, idDaConta: string | undefined, sessao?: string): Request {
  const cabecalhos = new Headers(request.headers);
  cabecalhos.delete(CABECALHO_DA_CONTA);
  cabecalhos.delete(CABECALHO_DA_SESSAO);
  cabecalhos.delete('cookie');
  if (idDaConta !== undefined) {
    cabecalhos.set(CABECALHO_DA_CONTA, idDaConta);
    // L61b: só o upgrade do WebSocket leva o token (o objeto relê a sessão antes de mexer em moeda); o HTTP da carteira não precisa dele
    if (sessao !== undefined) cabecalhos.set(CABECALHO_DA_SESSAO, sessao);
  }
  return new Request(request, { headers: cabecalhos });
}
