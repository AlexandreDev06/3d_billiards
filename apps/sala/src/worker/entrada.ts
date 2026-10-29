/**
 * A entrada do Worker da Cloudflare (L41): serve o cliente (os arquivos de `apps/web/dist` como static assets), o WebSocket `/sala`, o
 * HTTP `/carteira*` e as rotas `/admin/*`, tudo no mesmo endereço, como a sala Node. A sala em si vive num Durable Object só
 * (`SalaDO`, sala-do.ts); este arquivo é a borda: cabeçalhos de segurança, a política de conteúdo do HTML e a filtragem barata do
 * que nem precisa acordar o objeto.
 *
 * Quais requisições chegam aqui e quais o próprio static assets responde (de graça, sem invocar o Worker) é o `run_worker_first` do
 * wrangler.jsonc: as rotas dinâmicas e a página (`/`, `/index.html`, para a política de conteúdo levar o host); os demais arquivos
 * saem direto dos assets.
 */
import { SEGURANCA, politicaDeConteudo } from '../cabecalhos';
import { origemPermitida } from '../origem';
import { configDoWorker } from './config-do-env';
import { SalaDO } from './sala-do';

export { SalaDO };

const NOME_DO_OBJETO = 'sala';

const texto = (status: number, corpo: string, extra: Record<string, string> = {}): Response =>
  new Response(corpo, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURANCA, ...extra } });

/** O objeto único da sala. `LOCAL_DO` (uma dica de região, `sam` = América do Sul) só vale na criação do objeto. */
function objetoDaSala(env: Env): DurableObjectStub<SalaDO> {
  const id = env.SALA.idFromName(NOME_DO_OBJETO);
  const dica = env.LOCAL_DO as DurableObjectLocationHint | '';
  return dica === '' ? env.SALA.get(id) : env.SALA.get(id, { locationHint: dica });
}

const TEM_EXTENSAO = /\.[a-z0-9]+$/i;

/** A página e o que o static assets não achou: a rota sem extensão cai no `index.html` (o cliente é uma página só), arquivo que falta é 404. */
async function servirPagina(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let r = await env.ASSETS.fetch(request);
  if (r.status === 404 && !TEM_EXTENSAO.test(url.pathname)) r = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  const cabecalhos = new Headers(r.headers);
  for (const [nome, valor] of Object.entries(SEGURANCA)) cabecalhos.set(nome, valor);
  if (cabecalhos.get('content-type')?.startsWith('text/html')) cabecalhos.set('Content-Security-Policy', politicaDeConteudo(url.host));
  return new Response(r.status === 304 ? null : r.body, { status: r.status, statusText: r.statusText, headers: cabecalhos });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const caminho = url.pathname;

    if (caminho === '/saude') return texto(200, 'ok', { 'Cache-Control': 'no-store' });

    if (caminho === '/sala') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return texto(426, 'Use WebSocket em /sala.', { Upgrade: 'websocket' });
      // Conferido aqui também para o que é recusado de graça não acordar o objeto (que o objeto confere de novo)
      const config = configDoWorker(env);
      if (!origemPermitida(request.headers.get('origin') ?? undefined, [...config.origensPermitidas, url.origin])) return texto(403, 'Forbidden');
      return objetoDaSala(env).fetch(request);
    }

    if (caminho === '/carteira' || caminho.startsWith('/carteira/') || caminho.startsWith('/admin/')) return objetoDaSala(env).fetch(request);

    if (request.method !== 'GET' && request.method !== 'HEAD') return texto(405, 'Método não permitido.', { Allow: 'GET, HEAD' });
    return servirPagina(request, env);
  },
} satisfies ExportedHandler<Env>;
