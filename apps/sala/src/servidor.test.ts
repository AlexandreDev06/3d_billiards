import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CONFIG_SALA_PADRAO, type ConfigSala } from './config';
import { ClienteWs } from './para-testes-ws';
import { iniciarServidor, type Servidor } from './servidor';

let base: string;
let pasta: string;
const abertos: Servidor[] = [];
const clientes: ClienteWs[] = [];

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'sala-servidor-'));
  pasta = join(base, 'web');
  mkdirSync(join(pasta, 'assets'), { recursive: true });
  writeFileSync(join(pasta, 'index.html'), '<!doctype html><title>Sinuca</title>');
  writeFileSync(join(pasta, 'assets', 'app-1a2b3c.js'), 'console.log("sinuca");\n'.repeat(400));
  writeFileSync(join(pasta, 'assets', 'pequeno.js'), 'x');
  writeFileSync(join(pasta, '.env'), 'SEGREDO=1');
  writeFileSync(join(base, 'segredo.txt'), 'fora da raiz');
});
afterAll(() => rmSync(base, { recursive: true, force: true }));
afterEach(async () => {
  for (const c of clientes.splice(0)) c.derrubar();
  await Promise.all(abertos.splice(0).map((s) => s.fechar()));
});

/** Cada servidor tem a sua pasta de dados: a pasta tem um dono só (trava). */
let contadorDePastas = 0;
async function subir(mudanca: Partial<ConfigSala> = {}): Promise<Servidor> {
  const s = await iniciarServidor({ ...CONFIG_SALA_PADRAO, porta: 0, pastaWeb: pasta, pastaDados: join(base, `dados-${++contadorDePastas}`), ...mudanca });
  abertos.push(s);
  return s;
}

async function conectar(s: Servidor, nome = 'c'): Promise<ClienteWs> {
  const c = await ClienteWs.conectar(s.porta, nome);
  clientes.push(c);
  return c;
}

const url = (s: Servidor, caminho = '/') => `http://127.0.0.1:${s.porta}${caminho}`;

/** HTTP cru, sem normalização de URL do cliente, para os ataques de caminho. */
function bruto(porta: number, requisicao: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect(porta, '127.0.0.1', () => sock.write(requisicao));
    let saida = '';
    sock.on('data', (d) => (saida += d.toString('latin1')));
    sock.on('end', () => resolve(saida));
    sock.on('error', reject);
    sock.setTimeout(3000, () => {
      sock.destroy();
      resolve(saida);
    });
  });
}

describe('servidor — estático', () => {
  it('serve o index.html na raiz, sem cache e com cabeçalhos de segurança', async () => {
    const s = await subir();
    const r = await fetch(url(s));
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>Sinuca</title>');
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
  });

  it('assets com hash são imutáveis; gzip quando o cliente aceita e o arquivo é grande', async () => {
    const s = await subir();
    const texto = 'console.log("sinuca");\n'.repeat(400);
    const r = await fetch(url(s, '/assets/app-1a2b3c.js'), { headers: { 'accept-encoding': 'identity' } });
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(r.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await r.text()).toBe(texto);

    const z = await new Promise<{ cabecalhos: Record<string, string | string[] | undefined>; corpo: Buffer }>((resolve, reject) => {
      httpRequest(url(s, '/assets/app-1a2b3c.js'), { headers: { 'accept-encoding': 'gzip' } }, (res) => {
        const partes: Buffer[] = [];
        res.on('data', (d: Buffer) => partes.push(d));
        res.on('end', () => resolve({ cabecalhos: res.headers, corpo: Buffer.concat(partes) }));
      })
        .on('error', reject)
        .end();
    });
    expect(z.cabecalhos['content-encoding']).toBe('gzip');
    expect(z.cabecalhos['vary']).toContain('Accept-Encoding');
    expect(z.corpo.length).toBeLessThan(texto.length / 5);
    expect(gunzipSync(z.corpo).toString()).toBe(texto);

    const p = await fetch(url(s, '/assets/pequeno.js'), { headers: { 'accept-encoding': 'gzip' } });
    expect(p.headers.get('content-encoding')).toBeNull();
    expect(await p.text()).toBe('x');
  });

  it('ETag: segunda requisição condicional volta 304', async () => {
    const s = await subir();
    const a = await fetch(url(s, '/assets/app-1a2b3c.js'), { headers: { 'accept-encoding': 'identity' } });
    const etag = a.headers.get('etag')!;
    expect(etag).toBeTruthy();
    await a.arrayBuffer();
    const b = await fetch(url(s, '/assets/app-1a2b3c.js'), { headers: { 'if-none-match': etag, 'accept-encoding': 'identity' } });
    expect(b.status).toBe(304);
  });

  it('rotas do app caem no index.html; arquivo que não existe é 404; HEAD não traz corpo; outros métodos 405', async () => {
    const s = await subir();
    expect(await (await fetch(url(s, '/lobby/ABCDE'))).text()).toContain('<title>Sinuca</title>');
    expect((await fetch(url(s, '/assets/sumiu.js'))).status).toBe(404);
    const h = await fetch(url(s, '/'), { method: 'HEAD' });
    expect(h.status).toBe(200);
    expect(await h.text()).toBe('');
    const p = await fetch(url(s, '/'), { method: 'POST', body: 'x' });
    expect(p.status).toBe(405);
    expect(p.headers.get('allow')).toBe('GET, HEAD');
  });

  it('nunca serve nada fora da pasta nem dotfiles, em nenhuma grafia de ../', async () => {
    const s = await subir();
    const caminhos = ['/../segredo.txt', '/%2e%2e/segredo.txt', '/..%2fsegredo.txt', '/assets/../../segredo.txt', '/.env', '/%2eenv', '/assets/%2e%2e/%2e%2e/segredo.txt'];
    for (const c of caminhos) {
      const resposta = await bruto(s.porta, `GET ${c} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
      expect(resposta, c).not.toContain('fora da raiz');
      expect(resposta, c).not.toContain('SEGREDO');
      expect(resposta, c).toMatch(/^HTTP\/1\.1 (403|404|400)/);
    }
  });

  it('/saude responde ok; /sala sem upgrade pede upgrade (426)', async () => {
    const s = await subir();
    const r = await fetch(url(s, '/saude'));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('ok');
    const u = await fetch(url(s, '/sala'));
    expect(u.status).toBe(426);
  });

  it('sem build do web responde 503 com a dica, e o /saude segue ok', async () => {
    const s = await subir({ pastaWeb: join(base, 'nao-existe') });
    const r = await fetch(url(s));
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('pnpm');
    expect((await fetch(url(s, '/saude'))).status).toBe(200);
  });

  it('escuta só no endereço configurado', async () => {
    const s = await subir();
    expect(s.endereco).toBe('127.0.0.1');
  });
});

describe('servidor — WebSocket: limites e robustez', () => {
  it('só aceita upgrade em /sala', async () => {
    const s = await subir();
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${s.porta}/outra`);
        ws.on('open', resolve);
        ws.on('error', reject);
      }),
    ).rejects.toBeTruthy();
  });

  it('limita conexões totais (503) e por IP (429), e libera ao fechar', async () => {
    const s = await subir({ maxConexoes: 2 });
    const a = await conectar(s, 'a');
    await conectar(s, 'b');
    await expect(ClienteWs.conectar(s.porta, 'c')).rejects.toThrow(/503/);
    a.fechar();
    await a.esperarFechar();
    await new Promise((r) => setTimeout(r, 50));
    const d = await ClienteWs.conectar(s.porta, 'd');
    clientes.push(d);

    const s2 = await subir({ maxConexoesPorIp: 1 });
    const x = await conectar(s2, 'x');
    await expect(ClienteWs.conectar(s2.porta, 'y')).rejects.toThrow(/429/);
    x.fechar();
    await x.esperarFechar();
    await new Promise((r) => setTimeout(r, 50));
    clientes.push(await ClienteWs.conectar(s2.porta, 'z'));
  });

  it('quadro maior que o limite derruba a conexão (1009)', async () => {
    const s = await subir({ bytesPorMensagem: 2000 });
    const c = await conectar(s);
    c.enviarBruto('x'.repeat(5000));
    expect((await c.esperarFechar()).codigo).toBe(1009);
  });

  it('lixo, JSON de tipo desconhecido e binário inválido dão erro e a conexão continua', async () => {
    const s = await subir();
    const c = await conectar(s);
    c.enviarBruto('não é json');
    c.enviarBruto('{"tipo":"hackear"}');
    c.enviarBruto(Uint8Array.from([1, 2, 3, 4]));
    c.enviarBruto('{"tipo":"ping","t":"x"}');
    await c.esperar((m) => m.tipo === 'erro' && c.recebidas.filter((x) => x.tipo === 'erro').length === 4);
    expect(c.recebidas.filter((m) => m.tipo === 'erro').every((m) => m.tipo === 'erro' && m.codigo === 'mensagem-invalida')).toBe(true);
    c.enviar({ tipo: 'ping', t: 1 });
    expect(await c.esperarTipo('pong')).toEqual({ tipo: 'pong', t: 1 });
  });

  it('mira com giz que não é true dá mensagem-invalida e a conexão continua', async () => {
    const s = await subir();
    const c = await conectar(s);
    const mira = { tipo: 'mira', angulo: 0.5, lateral: 0, vertical: 0, recuo: 0.1 };
    for (const giz of [false, 1, 'sim', null]) c.enviarBruto(JSON.stringify({ ...mira, giz }));
    await c.esperar(() => c.recebidas.filter((x) => x.tipo === 'erro').length === 4);
    expect(c.recebidas.filter((m) => m.tipo === 'erro').every((m) => m.tipo === 'erro' && m.codigo === 'mensagem-invalida')).toBe(true);
    c.enviar({ tipo: 'ping', t: 2 });
    expect(await c.esperarTipo('pong')).toEqual({ tipo: 'pong', t: 2 });
  });

  it('inundar a conexão leva limite-mensagens e depois o fechamento (1008)', async () => {
    const s = await subir({ mensagens: { capacidade: 5, porSegundo: 1 }, tolerancia: { capacidade: 3, porSegundo: 0.001 } });
    const c = await conectar(s);
    for (let i = 0; i < 30; i++) c.enviar({ tipo: 'ping', t: i });
    const fim = await c.esperarFechar();
    expect(fim.codigo).toBe(1008);
    expect(c.recebidas.filter((m) => m.tipo === 'pong').length).toBe(5);
    expect(c.recebidas.some((m) => m.tipo === 'erro' && m.codigo === 'limite-mensagens')).toBe(true);
  });

  it('o ritmo normal de mira (10/s) passa sem punição', async () => {
    const s = await subir();
    const c = await conectar(s);
    for (let i = 0; i < 25; i++) {
      c.enviar({ tipo: 'ping', t: i });
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(c.recebidas.filter((m) => m.tipo === 'pong')).toHaveLength(25);
    expect(c.fechou).toBeNull();
  });

  it('heartbeat derruba quem não responde ao ping e mantém quem responde', async () => {
    const s = await subir({ heartbeatMs: 60 });
    const morto = await ClienteWs.conectar(s.porta, 'morto', { autoPong: false });
    clientes.push(morto);
    const vivo = await conectar(s, 'vivo');
    await morto.esperarFechar(2000);
    await new Promise((r) => setTimeout(r, 200));
    expect(vivo.fechou).toBeNull();
    vivo.enviar({ tipo: 'ping', t: 3 });
    expect(await vivo.esperarTipo('pong')).toEqual({ tipo: 'pong', t: 3 });
  });

  it('quem cai sai da sala (os outros veem conectado: false)', async () => {
    const s = await subir();
    const ana = await conectar(s, 'Ana');
    ana.criar();
    const bv = await ana.esperarTipo('boas-vindas');
    const beto = await conectar(s, 'Beto');
    beto.entrar(bv.codigo);
    await beto.esperarTipo('boas-vindas');
    ana.derrubar();
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.nome === 'Ana' && !m.lugares[0]!.conectado);
  });

  it('JSON puro de texto chega ao registro (aqui, chat sem sala dá fora-da-sala)', async () => {
    const s = await subir();
    const c = await conectar(s);
    c.enviarBruto(JSON.stringify({ tipo: 'chat', texto: 'x'.repeat(140) }));
    const r = await c.esperarTipo('erro');
    expect(r.codigo).toBe('fora-da-sala');
  });
});
