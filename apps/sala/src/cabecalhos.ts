/** Cabeçalhos de segurança de toda resposta HTTP do servidor (página, arquivos e carteira). */
export const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
} as const;

const PARECE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Política de conteúdo do HTML: só scripts do próprio site (sem eval nem inline), imagens e áudio locais ou
 * gerados em memória (blob/data), e WebSocket só para o próprio host (`ws`/`wss` escritos, porque `'self'`
 * nem sempre vale para esquemas ws em todo navegador). Estilo inline fica: o HUD usa `style`. O `blob:` do
 * `connect-src` é das texturas embutidas no `.glb`: o GLTFLoader as lê com `fetch(blob:)` (ImageBitmapLoader).
 */
export function politicaDeConteudo(host: string | undefined): string {
  const proprio = host !== undefined && PARECE_HOST.test(host) ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self' blob:${proprio}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
