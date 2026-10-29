#!/usr/bin/env node
/**
 * Prepara a pasta que o Worker serve como static assets (L41): copia o build do apps/web (`apps/web/dist`, ou o caminho do primeiro
 * argumento) para `apps/sala/dist/cf-assets/` e escreve ali o `_headers` (cabeçalhos de segurança e cache dos arquivos). Confere os
 * limites do plano gratuito dos static assets (25 MiB por arquivo, 20 000 arquivos) e para com o motivo se algum estourar.
 *
 *   node scripts/preparar-assets-cf.mjs [pasta-do-build] [pasta-de-saida]
 *
 * Não faz rede nem toca na conta Cloudflare. A saída é refeita do zero a cada vez.
 */
import console from 'node:console';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const origem = resolve(process.argv[2] ?? join(aqui, '../../web/dist'));
const destino = resolve(process.argv[3] ?? join(aqui, '../dist/cf-assets'));

const MAX_BYTES_POR_ARQUIVO = 25 * 1024 * 1024;
const MAX_ARQUIVOS = 20_000;

if (!existsSync(join(origem, 'index.html'))) {
  console.error(`Sem build do cliente em ${origem} (falta o index.html). Rode "pnpm build" na raiz primeiro.`);
  process.exit(1);
}

function listar(pasta, base = pasta) {
  const achados = [];
  for (const nome of readdirSync(pasta)) {
    if (nome === '.gitignore') continue; // as pastas copiadas de `arte/` levam um, que não é do jogo
    const caminho = join(pasta, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) achados.push(...listar(caminho, base));
    else achados.push({ relativo: caminho.slice(base.length + 1), bytes: info.size });
  }
  return achados;
}

const arquivos = listar(origem);
const grandes = arquivos.filter((a) => a.bytes > MAX_BYTES_POR_ARQUIVO);
if (grandes.length > 0) {
  for (const g of grandes) console.error(`Arquivo grande demais para os static assets (${(g.bytes / 1048576).toFixed(1)} MiB, o limite é 25 MiB): ${g.relativo}`);
  process.exit(1);
}
if (arquivos.length > MAX_ARQUIVOS) {
  console.error(`Arquivos demais para os static assets: ${arquivos.length} (o limite é ${MAX_ARQUIVOS}).`);
  process.exit(1);
}

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(origem, destino, { recursive: true, filter: (de) => basename(de) !== '.gitignore' });

// Mesmas regras da sala Node: `assets/` tem nome com hash (imutável); o resto, 5 minutos; o HTML sempre revalida (o padrão do static assets).
const pastasDeCima = readdirSync(origem).filter((n) => statSync(join(origem, n)).isDirectory() && n !== 'assets');
const linhas = ['/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: no-referrer', '  X-Frame-Options: DENY', ''];
if (existsSync(join(origem, 'assets'))) linhas.push('/assets/*', '  Cache-Control: public, max-age=31536000, immutable', '');
for (const pasta of pastasDeCima) linhas.push(`/${pasta}/*`, '  Cache-Control: public, max-age=300', '');
writeFileSync(join(destino, '_headers'), linhas.join('\n'));

const total = arquivos.reduce((soma, a) => soma + a.bytes, 0);
const maior = arquivos.reduce((m, a) => (a.bytes > m.bytes ? a : m), { relativo: '-', bytes: 0 });
console.log(`Assets prontos em ${destino}: ${arquivos.length} arquivos, ${(total / 1048576).toFixed(1)} MiB; o maior é ${maior.relativo} (${(maior.bytes / 1048576).toFixed(1)} MiB, limite 25 MiB).`);
