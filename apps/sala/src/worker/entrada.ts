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
import { SEGURANCA, politicaDeConteudo, temAnuncio } from '../cabecalhos';
import { ehCaminhoDaConta, tratarContaDaSinuca, type BancoDaConta } from '../conta-na-sinuca';
import { ipDoCliente } from '../ip';
import { origemPermitida } from '../origem';
import { tokenDaSessao } from '../sessao-da-conta';
import { configDoWorker } from './config-do-env';
import { paraOObjeto, pedidoDoRequest, respostaDoResultado } from './corpo-do-pedido';
import { SalaDO, logEmJson } from './sala-do';

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

/** Quanto a borda espera o Banco dizer de quem é a sessão antes de dar a conta por fora do ar. */
const PRAZO_DA_SESSAO_MS = 5000;

/**
 * De quem é a sessão do cookie `becogames_sessao`, perguntado ao Banco por RPC. Sem cookie, ou com cookie que o Banco não reconhece, não
 * há conta (`id` ausente) e vale o código do convidado, como sempre. Banco que não responde é `foraDoAr`: quem tem sessão espera a
 * conta, e cair no código abriria outra carteira em silêncio.
 */
async function contaDaSessao(request: Request, env: Env): Promise<{ readonly id?: string; readonly token?: string; readonly foraDoAr?: true }> {
  const token = tokenDaSessao(request.headers.get('cookie'));
  if (token === null || env.CONTA === undefined) return {};
  const banco = env.CONTA as unknown as BancoDaConta;
  try {
    let prazo: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      prazo = setTimeout(() => rejeitar(new Error('prazo')), PRAZO_DA_SESSAO_MS);
    });
    try {
      const conta = await Promise.race([banco.contaDaSessao(token), limite]);
      return conta === null ? {} : { id: conta.id, token };
    } finally {
      clearTimeout(prazo);
    }
  } catch {
    logEmJson('conta-fora', { acao: 'sessao' });
    return { foraDoAr: true };
  }
}

/** `/conta/*`: o pedido vai ao Banco pelo RPC e a resposta dele volta; a carteira de itens só é tocada em `criar` e `excluir` (conta-na-sinuca.ts). */
async function tratarConta(request: Request, env: Env): Promise<Response> {
  const config = configDoWorker(env);
  // L61b: com a chave do saldo no Banco desligada não há conta na sinuca (como na sala Node): o convidado não vira conta, com 100 no Banco, antes da migração dos saldos
  if (!config.saldoNoBanco) return texto(404, 'Não encontrado.', { 'Cache-Control': 'no-store' });
  if (env.CONTA === undefined) return texto(503, 'A conta está fora do ar.', { 'Cache-Control': 'no-store' });
  const bruto = request.headers.get('cf-connecting-ip') ?? '';
  const r = await tratarContaDaSinuca({
    pedido: pedidoDoRequest(request, ipDoCliente(bruto === '' ? undefined : bruto, undefined), false),
    ipParaOBanco: bruto,
    banco: env.CONTA as unknown as BancoDaConta,
    efeitos: {
      marcarDaConta: (id) => objetoDaSala(env).marcarDaConta(id),
      apagarDaConta: (id) => objetoDaSala(env).apagarDaConta(id),
      esquecerConta: (id, sessao) => objetoDaSala(env).esquecerConta(id, sessao),
      adiarMarca: (id) => objetoDaSala(env).adiarMarca(id),
    },
    tempoDoCorpoMs: config.carteira.tempoDoCorpoMs,
    log: logEmJson,
  });
  if (r === 'abortada') return texto(400, 'Pedido abortado.');
  return respostaDoResultado(r);
}

const TEM_EXTENSAO = /\.[a-z0-9]+$/i;

/** Um valor novo por resposta (16 bytes aleatórios em base64), como o CSP pede para o nonce. */
function novoNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Pedido sem validadores: com nonce novo a cada resposta, um 304 deixaria o corpo guardado (nonce velho) com a política nova. */
function semValidadores(request: Request): Request {
  const cabecalhos = new Headers(request.headers);
  cabecalhos.delete('if-none-match');
  cabecalhos.delete('if-modified-since');
  return new Request(request, { headers: cabecalhos });
}

/**
 * A página e o que o static assets não achou: a rota sem extensão cai no `index.html` (o cliente é uma página só), arquivo que falta é 404.
 * No host com anúncio (L52) o HTML ganha um nonce por resposta, posto em todo `<script>` e `modulepreload` da página, e a política
 * que o libera; sem ETag nem 304 (`no-cache`), para o corpo e o nonce nunca se separarem no cache do navegador. Nos outros hosts nada muda.
 */
async function servirPagina(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const anuncio = temAnuncio(url.host);
  const pedido = anuncio ? semValidadores(request) : request;
  let r = await env.ASSETS.fetch(pedido);
  if (r.status === 404 && !TEM_EXTENSAO.test(url.pathname)) r = await env.ASSETS.fetch(new Request(new URL('/', url), pedido));
  const cabecalhos = new Headers(r.headers);
  for (const [nome, valor] of Object.entries(SEGURANCA)) cabecalhos.set(nome, valor);
  const html = cabecalhos.get('content-type')?.startsWith('text/html') === true;
  if (html && anuncio) {
    const nonce = novoNonce();
    cabecalhos.set('Content-Security-Policy', politicaDeConteudo(url.host, nonce));
    cabecalhos.set('Cache-Control', 'no-cache');
    cabecalhos.delete('etag');
    cabecalhos.delete('last-modified');
    cabecalhos.delete('content-length');
    const marcar = { element: (e: Element) => void e.setAttribute('nonce', nonce) };
    const resposta = new Response(r.body, { status: r.status, statusText: r.statusText, headers: cabecalhos });
    return new HTMLRewriter().on('script', marcar).on('link[rel="modulepreload"]', marcar).transform(resposta);
  }
  if (html) cabecalhos.set('Content-Security-Policy', politicaDeConteudo(url.host));
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
      const conta = await contaDaSessao(request, env);
      if (conta.foraDoAr) return texto(503, 'A conta está fora do ar.', { 'Retry-After': '30' });
      return objetoDaSala(env).fetch(paraOObjeto(request, conta.id, conta.token));
    }

    if (ehCaminhoDaConta(caminho)) return tratarConta(request, env);

    if (caminho === '/carteira' || caminho.startsWith('/carteira/')) {
      const conta = await contaDaSessao(request, env);
      if (conta.foraDoAr) return texto(503, 'A conta está fora do ar.', { 'Retry-After': '30', 'Cache-Control': 'no-store' });
      return objetoDaSala(env).fetch(paraOObjeto(request, conta.id));
    }

    if (caminho.startsWith('/admin/')) return objetoDaSala(env).fetch(paraOObjeto(request, undefined));

    if (request.method !== 'GET' && request.method !== 'HEAD') return texto(405, 'Método não permitido.', { Allow: 'GET, HEAD' });
    return servirPagina(request, env);
  },
} satisfies ExportedHandler<Env>;
