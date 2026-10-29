// Filma o visor do balão quadro a quadro, sem relógio: abre UMA página no Chrome sem janela (protocolo DevTools), chama `window.passo(...)` para cada quadro
// e grava cada tela em PNG. Serve para folhas de prova e para o vídeo (montado depois com ffmpeg).
//
// Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório (nunca a 8001).
// uso: node arte/ferramentas/filmar_visor.mjs <trabalhos.json> <pasta_de_saida> [LxA] [query_da_pagina]
//   trabalhos.json: [{ "arquivo": "caras/neutro.png", "passo": { "cara": "cara_neutro", "cam": "rosto", ... } }, ...]
//   query_da_pagina: o que vai depois de `?captura&tam=LxA&` (por exemplo `glb=/.outros/lote-p7/antes/balao.glb&lod=alta&cam=rosto`);
//     com `fundo=transparente` a captura sai com alfa (ícones da loja)
// Mostra os erros do console da página e sai com código 1 se houve algum.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const [, , arqTrabalhos, pasta, tamanho = '480x480', query = ''] = process.argv;
const [L, A] = tamanho.split('x').map(Number);
const trabalhos = JSON.parse(readFileSync(arqTrabalhos, 'utf8'));
const porta = 9300 + Math.floor(Math.random() * 500);
const perfil = mkdtempSync(join(tmpdir(), 'sinuca-chrome-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', `--user-data-dir=${perfil}`, `--remote-debugging-port=${porta}`, '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', `--window-size=${L},${A}`, 'about:blank',
], { stdio: 'ignore' });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function alvo() {
  for (let i = 0; i < 100; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
      const p = lista.find((x) => x.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* ainda subindo */ }
    await esperar(150);
  }
  throw new Error('o Chrome não subiu');
}

let id = 0;
const pendentes = new Map();
const erros = [];
const ws = new WebSocket(await alvo());
await new Promise((r) => { ws.onopen = r; });
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pendentes.has(d.id)) { pendentes.get(d.id)(d); pendentes.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') erros.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !String(d.params.entry.url).endsWith('favicon.ico')) erros.push(`${d.params.entry.text} ${d.params.entry.url || ''}`);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') erros.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
};
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pendentes.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const avaliar = async (expressao) => (await cdp('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true })).result;

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Log.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: L, height: A, deviceScaleFactor: 1, mobile: false });
// fundo transparente (ícones da loja): a página e o canvas ficam sem cor e a captura sai com alfa
if (/(^|&)fundo=transparente(&|$)/.test(query)) await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
await cdp('Page.navigate', { url: `http://127.0.0.1:8731/arte/visor/balao.html?captura&tam=${L}x${A}&${query}` });
let pronto = false;
for (let i = 0; i < 400 && !pronto; i++) {
  await esperar(250);
  pronto = (await avaliar('!!window.passo')).result?.value === true;
}
if (!pronto) { console.error('a página não ficou pronta', erros.join('\n')); chrome.kill(); process.exit(2); }

const t0 = Date.now();
for (const [i, t] of trabalhos.entries()) {
  const r = await avaliar(`window.passo(${JSON.stringify(t.passo)})`);
  if (r.exceptionDetails || r.result?.value !== true) { console.error('passo falhou', t.arquivo, JSON.stringify(r).slice(0, 300)); continue; }
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  const caminho = join(pasta, t.arquivo);
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, Buffer.from(shot.result.data, 'base64'));
  if ((i + 1) % 100 === 0) console.log(`${i + 1}/${trabalhos.length} em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`${trabalhos.length} quadros em ${((Date.now() - t0) / 1000).toFixed(1)} s; erros no console: ${erros.length}`);
for (const e of erros) console.log('  erro:', String(e).slice(0, 300));
ws.close();
chrome.kill();
await esperar(300);
rmSync(perfil, { recursive: true, force: true });
process.exit(erros.length ? 1 : 0);
