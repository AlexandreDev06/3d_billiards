import { realpath, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

export type Resolucao =
  | { readonly tipo: 'arquivo'; readonly caminho: string; readonly contentType: string; readonly cache: string; readonly tamanho: number; readonly mtimeMs: number }
  | { readonly tipo: 'nao-encontrado' }
  | { readonly tipo: 'proibido' }
  | { readonly tipo: 'indisponivel' };

const TIPOS: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const dentroDe = (raiz: string, caminho: string): boolean => caminho === raiz || caminho.startsWith(raiz + sep);

async function arquivoOuNada(caminho: string): Promise<{ tamanho: number; mtimeMs: number } | null> {
  try {
    const s = await stat(caminho);
    return s.isFile() ? { tamanho: s.size, mtimeMs: s.mtimeMs } : null;
  } catch {
    return null;
  }
}

/**
 * Traduz o caminho de uma URL em um arquivo dentro de `raiz` (o build do web).
 * Barra `..`, dotfiles, NUL, barra invertida e atalhos que saem da raiz. Rota sem
 * extensão que não existe cai no `index.html` (SPA); arquivo com extensão que não existe é 404.
 */
export async function resolverEstatico(raiz: string, url: string): Promise<Resolucao> {
  let raizReal: string;
  try {
    raizReal = await realpath(raiz);
  } catch {
    return { tipo: 'indisponivel' };
  }
  const indice = join(raizReal, 'index.html');

  let decodificado: string;
  try {
    decodificado = decodeURIComponent(url.split(/[?#]/, 1)[0] ?? '');
  } catch {
    return { tipo: 'proibido' };
  }
  if (decodificado.includes('\0') || decodificado.includes('\\')) return { tipo: 'proibido' };

  const segmentos: string[] = [];
  for (const s of decodificado.split('/')) {
    if (s === '' || s === '.') continue;
    if (s.startsWith('.')) return { tipo: 'proibido' };
    segmentos.push(s);
  }

  const servir = async (caminho: string): Promise<Resolucao | null> => {
    const info = await arquivoOuNada(caminho);
    if (!info) return null;
    const extensao = extname(caminho).toLowerCase();
    const relativo = caminho.slice(raizReal.length + 1).split(sep);
    const cache =
      extensao === '.html' ? 'no-cache' : relativo[0] === 'assets' ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
    return { tipo: 'arquivo', caminho, contentType: TIPOS[extensao] ?? 'application/octet-stream', cache, ...info };
  };

  const candidato = join(raizReal, ...segmentos);
  let real: string | null;
  try {
    real = await realpath(candidato);
  } catch {
    real = null;
  }
  if (real !== null) {
    if (!dentroDe(raizReal, real)) return { tipo: 'proibido' };
    const direto = await servir(real);
    if (direto) return direto;
    const doIndice = await servir(join(real, 'index.html'));
    if (doIndice) return doIndice;
  }

  const ultimo = segmentos.at(-1) ?? '';
  if (extname(ultimo) !== '') return { tipo: 'nao-encontrado' };
  return (await servir(indice)) ?? { tipo: 'indisponivel' };
}
