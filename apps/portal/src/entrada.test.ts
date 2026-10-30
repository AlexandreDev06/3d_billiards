import { describe, expect, it } from 'vitest';
import type { ApiDoBanco, PedidoDaConta, RespostaDaConta } from '@sinuca/conta/contrato';
import entrada, { type Ambiente } from './entrada';

function ambiente(resposta: RespostaDaConta = { status: 200, corpo: { ok: true } }) {
  const pedidos: PedidoDaConta[] = [];
  const assets: string[] = [];
  const env: Ambiente = {
    ASSETS: {
      fetch: (r) => {
        assets.push(new URL(r.url).pathname);
        return Promise.resolve(new Response('pagina'));
      },
    },
    CONTA: {
      tratar: (p: PedidoDaConta) => {
        pedidos.push(p);
        return Promise.resolve(resposta);
      },
    } as unknown as ApiDoBanco,
  };
  return { env, pedidos, assets };
}

const post = (caminho: string, corpo: string, extra: Record<string, string> = {}): Request =>
  new Request(`https://becogames.app${caminho}`, { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/json', ...extra } });

describe('o Worker do portal', () => {
  it('repassa ao Banco a ação, a Origin, o IP, o cookie e o corpo, com convidado nulo', async () => {
    const { env, pedidos } = ambiente();
    const corpo = JSON.stringify({ email: 'a@b.com', senha: 'segredo-bom' });
    await entrada.fetch(
      post('/api/conta/entrar', corpo, { Origin: 'https://becogames.app', 'CF-Connecting-IP': '203.0.113.7', Cookie: 'becogames_sessao=abc' }),
      env,
    );
    expect(pedidos).toEqual([
      { acao: 'entrar', metodo: 'POST', origem: 'https://becogames.app', ip: '203.0.113.7', cookie: 'becogames_sessao=abc', convidado: null, corpo },
    ]);
  });

  it('GET vai sem corpo e sem Origin', async () => {
    const { env, pedidos } = ambiente();
    await entrada.fetch(new Request('https://becogames.app/api/conta/eu'), env);
    expect(pedidos[0]).toMatchObject({ acao: 'eu', metodo: 'GET', origem: null, cookie: null, corpo: null });
  });

  it('corpo de 9 KB dá 413 sem chamar o Banco', async () => {
    const { env, pedidos } = ambiente();
    const r = await entrada.fetch(post('/api/conta/entrar', 'x'.repeat(9 * 1024)), env);
    expect(r.status).toBe(413);
    expect(pedidos).toHaveLength(0);
  });

  it('corpo grande sem Content-Length (em pedaços) também dá 413', async () => {
    const { env, pedidos } = ambiente();
    const parte = new TextEncoder().encode('y'.repeat(3000));
    const fluxo = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 4; i++) c.enqueue(parte);
        c.close();
      },
    });
    const pedido = new Request('https://becogames.app/api/conta/entrar', { method: 'POST', body: fluxo, duplex: 'half' } as RequestInit);
    const r = await entrada.fetch(pedido, env);
    expect(r.status).toBe(413);
    expect(pedidos).toHaveLength(0);
  });

  it('o resto de /api é 404 e não chega ao Banco', async () => {
    const { env, pedidos, assets } = ambiente();
    for (const caminho of ['/api/outra', '/api/conta', '/api/conta/Entrar', '/api/conta/entrar/x', '/api/conta/' + 'a'.repeat(21)]) {
      expect((await entrada.fetch(new Request(`https://becogames.app${caminho}`), env)).status).toBe(404);
    }
    expect(pedidos).toHaveLength(0);
    expect(assets).toHaveLength(0);
  });

  it('a raiz vai ao ASSETS', async () => {
    const { env, assets, pedidos } = ambiente();
    const r = await entrada.fetch(new Request('https://becogames.app/'), env);
    expect(await r.text()).toBe('pagina');
    expect(assets).toEqual(['/']);
    expect(pedidos).toHaveLength(0);
  });

  it('a resposta leva Set-Cookie, no-store e nosniff', async () => {
    const cookie = 'becogames_sessao=t; Max-Age=7776000; Path=/; HttpOnly; Secure; SameSite=Lax';
    const { env } = ambiente({ status: 201, corpo: { conta: { nome: 'A', email: 'a@b.com', saldo: 100 } }, cookie });
    const r = await entrada.fetch(post('/api/conta/criar', '{}'), env);
    expect(r.status).toBe(201);
    expect(r.headers.get('Set-Cookie')).toBe(cookie);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Content-Type')).toContain('application/json');
    expect(await r.json()).toEqual({ conta: { nome: 'A', email: 'a@b.com', saldo: 100 } });
  });

  it('o Banco que lança vira 503 sem vazar o erro', async () => {
    const { env } = ambiente();
    env.CONTA = { tratar: () => Promise.reject(new Error('segredo interno')) } as unknown as ApiDoBanco;
    const r = await entrada.fetch(new Request('https://becogames.app/api/conta/eu'), env);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('segredo');
  });
});
