/**
 * O HTTP da carteira (carteira-http.ts) em cima do `node:http`: traduz o `IncomingMessage` no pedido neutro, lê o corpo com limite e
 * prazo e escreve a resposta pronta. Nada de regra aqui.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HttpDaCarteira, LeituraDoCorpo, PedidoDaCarteira, RespostaDaCarteira } from './carteira-http';

/** Lê o corpo até `limite` bytes e `tempoMs`; passou de um dos dois, desiste sem ler o resto. */
function lerCorpo(req: IncomingMessage, limite: number, tempoMs: number): Promise<LeituraDoCorpo> {
  return new Promise((resolve) => {
    const partes: Buffer[] = [];
    let total = 0;
    let pronto = false;
    const terminar = (r: LeituraDoCorpo): void => {
      if (pronto) return;
      pronto = true;
      clearTimeout(prazo);
      req.off('data', aoChegar);
      req.off('end', aoFim);
      req.off('error', aoErro);
      req.off('close', aoErro);
      resolve(r);
    };
    const aoChegar = (parte: Buffer): void => {
      total += parte.length;
      if (total > limite) return terminar({ tipo: 'grande' });
      partes.push(parte);
    };
    const aoFim = (): void => {
      try {
        terminar({ tipo: 'texto', texto: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes)) });
      } catch {
        terminar({ tipo: 'ilegivel' });
      }
    };
    const aoErro = (): void => terminar({ tipo: 'abortado' });
    const prazo = setTimeout(() => terminar({ tipo: 'lento' }), tempoMs);
    req.on('data', aoChegar);
    req.once('end', aoFim);
    req.once('error', aoErro);
    req.once('close', aoErro);
  });
}

/** O pedido neutro de um `IncomingMessage`; `idDaConta` (L61) é o da sessão, se o servidor já a resolveu. */
export function pedidoDoNode(req: IncomingMessage, ip: string, idDaConta?: string): PedidoDaCarteira {
  return {
    metodo: req.method ?? 'GET',
    caminho: (req.url ?? '/').split(/[?#]/, 1)[0] ?? '/',
    ip,
    ...(idDaConta === undefined ? {} : { idDaConta }),
    cabecalho(nome) {
      const v = req.headers[nome];
      return Array.isArray(v) ? v.join(', ') : v;
    },
    lerCorpo: (limite, tempoMs) => lerCorpo(req, limite, tempoMs),
    corpoPendente: () => !req.complete,
    descartarCorpo: () => void req.resume(),
  };
}

export interface CarteiraNoNode {
  /** `true` se a requisição era da carteira (e foi respondida); `false` deixa o caminho para o resto do servidor. */
  tratar(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  limpar(): void;
}

/** Escreve a resposta pronta (a da carteira ou a da conta). */
export function escreverResposta(res: ServerResponse, r: RespostaDaCarteira): void {
  res.writeHead(r.status, r.cabecalhos as Record<string, string | number>);
  res.end(r.corpo);
}

/**
 * Liga o HTTP neutro da carteira ao servidor Node; `ipDe` devolve a chave do balde do IP do pedido. `idDaConta` (L61) diz de quem é a
 * sessão do cookie do pedido, ou `undefined` (sem cookie ou sessão que o Banco não reconhece: vale o código).
 */
export function carteiraNoNode(http: HttpDaCarteira, ipDe: (req: IncomingMessage) => string, idDaConta: (req: IncomingMessage) => Promise<string | undefined> = async () => undefined): CarteiraNoNode {
  return {
    async tratar(req, res) {
      const caminho = (req.url ?? '/').split(/[?#]/, 1)[0] ?? '/';
      if (caminho !== '/carteira' && !caminho.startsWith('/carteira/')) return false;
      const r = await http.tratar(pedidoDoNode(req, ipDe(req), await idDaConta(req)));
      if (r === 'nao-e-da-carteira') return false;
      if (r === 'abortada') return true;
      escreverResposta(res, r);
      return true;
    },
    limpar: () => http.limpar(),
  };
}
