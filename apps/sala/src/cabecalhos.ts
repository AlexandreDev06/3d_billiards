/** Cabeçalhos de segurança de toda resposta HTTP do servidor (página, arquivos e carteira). */
export const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
} as const;

const PARECE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** O único host que mostra anúncio (AdSense, L52). No `workers.dev`, em `localhost` e na sala Node a política segue fechada. */
export const HOST_COM_ANUNCIO = 'sinuca.becogames.app';

/** Só o host exato (sem porta, sem subdomínio, sem diferença de caixa). */
export const temAnuncio = (host: string | undefined): boolean => host?.toLowerCase() === HOST_COM_ANUNCIO;

/**
 * O que o AdSense precisa além do `script-src` (L52, medido com o `adsbygoogle.js` de verdade; fonte e data no CLAUDE.md):
 * os quadros do anúncio e do selo de qualidade/captcha, e o `getconfig` do selo. O consentimento (Funding Choices) é a origem
 * `fundingchoicesmessages.google.com`, em quadro e conexão.
 */
const ANUNCIO_FRAME = [
  'https://googleads.g.doubleclick.net',
  'https://*.googlesyndication.com',
  'https://*.adtrafficquality.google',
  'https://www.google.com',
  'https://fundingchoicesmessages.google.com',
];
const ANUNCIO_CONEXAO = ['https://*.googlesyndication.com', 'https://*.adtrafficquality.google', 'https://fundingchoicesmessages.google.com'];
/** L52b: no ar, o loader pede `pagead2.googlesyndication.com/pagead/gen_204` e `ep1.adtrafficquality.google/pagead/sodar` como imagem (o teste local não pedia). */
const ANUNCIO_IMAGEM = ['https://*.googlesyndication.com', 'https://*.adtrafficquality.google', 'https://*.g.doubleclick.net', 'https://www.google.com'];

/**
 * Política de conteúdo do HTML: só scripts do próprio site (sem eval nem inline), imagens e áudio locais ou
 * gerados em memória (blob/data), e WebSocket só para o próprio host (`ws`/`wss` escritos, porque `'self'`
 * nem sempre vale para esquemas ws em todo navegador). Estilo inline fica: o HUD usa `style`. O `blob:` do
 * `connect-src` é das texturas embutidas no `.glb`: o GLTFLoader as lê com `fetch(blob:)` (ImageBitmapLoader).
 *
 * Com `nonce` (só a entrada do Worker passa, e só no host com anúncio) o `script-src` vira a forma estrita que o Google
 * suporta para o AdSense: `'nonce-…' 'strict-dynamic'` (o `adsbygoogle.js` marcado com o nonce carrega os demais scripts), com
 * `'self'` só de reserva para navegador velho (um navegador que entende `strict-dynamic` o ignora). Sem `'unsafe-inline'`
 * nem `'unsafe-eval'`. `frame-src`, `connect-src` e `img-src` ganham só as origens do Google acima (nunca `https:` solto).
 */
export function politicaDeConteudo(host: string | undefined, nonce?: string): string {
  const proprio = host !== undefined && PARECE_HOST.test(host) ? ` ws://${host} wss://${host}` : '';
  const anuncio = nonce !== undefined;
  return [
    "default-src 'self'",
    anuncio ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'` : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${anuncio ? ` ${ANUNCIO_IMAGEM.join(' ')}` : ''}`,
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self' blob:${proprio}${anuncio ? ` ${ANUNCIO_CONEXAO.join(' ')}` : ''}`,
    ...(anuncio ? [`frame-src ${ANUNCIO_FRAME.join(' ')}`] : []),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
