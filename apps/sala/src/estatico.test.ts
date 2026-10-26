import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolverEstatico } from './estatico';

let base: string;
let raiz: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'sala-estatico-'));
  raiz = join(base, 'dist');
  mkdirSync(join(raiz, 'assets'), { recursive: true });
  mkdirSync(join(raiz, 'sub'), { recursive: true });
  writeFileSync(join(raiz, 'index.html'), '<html></html>');
  writeFileSync(join(raiz, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(raiz, 'assets', 'mesa.hdr'), 'x');
  writeFileSync(join(raiz, 'favicon.ico'), 'x');
  writeFileSync(join(raiz, '.env'), 'SEGREDO=1');
  writeFileSync(join(raiz, 'sub', 'index.html'), '<html>sub</html>');
  writeFileSync(join(base, 'segredo.txt'), 'fora da raiz');
  symlinkSync(join(base, 'segredo.txt'), join(raiz, 'atalho.txt'));
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('resolverEstatico', () => {
  it('serve arquivo com tipo e cache: html sem cache, assets com hash imutáveis', async () => {
    const js = await resolverEstatico(raiz, '/assets/app-abc123.js');
    expect(js).toMatchObject({ tipo: 'arquivo', contentType: 'text/javascript; charset=utf-8', cache: 'public, max-age=31536000, immutable' });
    const idx = await resolverEstatico(raiz, '/index.html');
    expect(idx).toMatchObject({ tipo: 'arquivo', contentType: 'text/html; charset=utf-8', cache: 'no-cache' });
    expect(await resolverEstatico(raiz, '/favicon.ico')).toMatchObject({ tipo: 'arquivo', contentType: 'image/x-icon' });
    expect(await resolverEstatico(raiz, '/assets/mesa.hdr')).toMatchObject({ tipo: 'arquivo', contentType: 'application/octet-stream' });
  });

  it('raiz e rotas sem extensão caem no index.html (fallback de SPA); pasta usa o index dela', async () => {
    for (const url of ['/', '/lobby', '/sala/ABCDE', '/x/y/z']) {
      const r = await resolverEstatico(raiz, url);
      expect(r, url).toMatchObject({ tipo: 'arquivo', caminho: join(raiz, 'index.html') });
    }
    expect(await resolverEstatico(raiz, '/sub/')).toMatchObject({ tipo: 'arquivo', caminho: join(raiz, 'sub', 'index.html') });
  });

  it('arquivo com extensão que não existe é 404, não index.html', async () => {
    expect(await resolverEstatico(raiz, '/assets/sumiu.js')).toEqual({ tipo: 'nao-encontrado' });
    expect(await resolverEstatico(raiz, '/foto.png')).toEqual({ tipo: 'nao-encontrado' });
  });

  it('ignora a query string', async () => {
    expect(await resolverEstatico(raiz, '/assets/app-abc123.js?v=2')).toMatchObject({ tipo: 'arquivo' });
  });

  it('barra travessia de diretório em todas as grafias', async () => {
    const ataques = [
      '/../segredo.txt',
      '/..%2fsegredo.txt',
      '/%2e%2e/segredo.txt',
      '/%2E%2E%2Fsegredo.txt',
      '/assets/../../segredo.txt',
      '/assets/..%5c..%5csegredo.txt',
      '/..\\segredo.txt',
      '//segredo.txt',
      '/%00.html',
      '/index.html%00.png',
      '/%c0%ae%c0%ae/segredo.txt',
      '/%',
      '/%zz',
    ];
    for (const a of ataques) {
      const r = await resolverEstatico(raiz, a);
      expect(['proibido', 'nao-encontrado'], a).toContain(r.tipo);
      if (r.tipo === 'arquivo') expect(r.caminho.startsWith(raiz)).toBe(true);
    }
  });

  it('NUL e barra invertida em qualquer ponto do caminho são proibidos, não "não encontrado"', async () => {
    for (const url of ['/%00.html', '/index.html%00.png', '/assets/app%00.js', '/assets\\app-abc123.js', '/a%5cb']) {
      expect(await resolverEstatico(raiz, url), url).toEqual({ tipo: 'proibido' });
    }
  });

  it('não serve dotfiles nem segue atalho para fora da raiz', async () => {
    expect((await resolverEstatico(raiz, '/.env')).tipo).toBe('proibido');
    expect((await resolverEstatico(raiz, '/.git/config')).tipo).toBe('proibido');
    expect((await resolverEstatico(raiz, '/atalho.txt')).tipo).toBe('proibido');
  });

  it('raiz inexistente é indisponível, sem lançar', async () => {
    expect(await resolverEstatico(join(base, 'nao-existe'), '/')).toEqual({ tipo: 'indisponivel' });
  });
});
