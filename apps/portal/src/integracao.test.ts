/**
 * O portal e o Banco juntos (L56), pelos Workers de verdade: `wrangler dev --local -c apps/portal/wrangler.jsonc -c apps/conta/wrangler.jsonc`
 * (o workerd da máquina, o service binding `CONTA` -> `Banco`, o Durable Object com SQLite em disco, os assets do portal com o `_headers`).
 * O `.dev.vars` de teste do `apps/conta` é criado aqui e apagado no fim. Nada de conta nem de rede da Cloudflare.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));
const WRANGLER = join(RAIZ, 'apps/portal/node_modules/wrangler/bin/wrangler.js');
const DEV_VARS = join(RAIZ, 'apps/conta/.dev.vars');
const MENSAGEM_ESQUECI = 'Se houver uma conta com este e-mail, mandamos um link para criar a senha nova. Confira também o spam.';

const portaLivre = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

function matarGrupo(filho: ChildProcess, sinal: NodeJS.Signals): void {
  try {
    if (filho.pid !== undefined) process.kill(-filho.pid, sinal);
  } catch {
    // já saiu
  }
}

interface Resposta {
  status: number;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
}

describe('o portal e o Banco no wrangler dev --local', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'portal-integracao-'));
  const saida: string[] = [];
  let filho: ChildProcess;
  let base = '';
  let cookie = '';

  /** O que o navegador faz: Origin do próprio endereço nos POST, cookie guardado de uma chamada para a outra. */
  async function api(acao: string, metodo: 'GET' | 'POST', corpo?: object, extra: { origem?: string | null; cookie?: string } = {}): Promise<Resposta> {
    const cabecalhos: Record<string, string> = {};
    const origem = extra.origem === undefined ? base : extra.origem;
    if (metodo === 'POST' && origem !== null) cabecalhos.Origin = origem;
    const c = extra.cookie ?? cookie;
    if (c) cabecalhos.Cookie = c;
    if (corpo) cabecalhos['Content-Type'] = 'application/json';
    const r = await fetch(`${base}/api/conta/${acao}`, { method: metodo, headers: cabecalhos, body: corpo ? JSON.stringify(corpo) : undefined });
    const set = r.headers.get('Set-Cookie');
    if (extra.cookie === undefined && set) cookie = /^becogames_sessao=([^;]*)/.exec(set)?.[1] ? `becogames_sessao=${/^becogames_sessao=([^;]*)/.exec(set)![1]}` : '';
    return { status: r.status, corpo: (await r.json()) as Record<string, unknown>, cabecalhos: r.headers };
  }

  beforeAll(async () => {
    const [porta, inspetor] = [await portaLivre(), await portaLivre()];
    base = `http://127.0.0.1:${porta}`;
    writeFileSync(
      DEV_VARS,
      [`PEPPER_DA_SENHA=${randomBytes(24).toString('hex')}`, 'DOMINIO_DO_COOKIE=""', 'COOKIE_SEGURO="0"', `ORIGENS_DE_DEV=${base}`, ''].join('\n'),
    );
    filho = spawn(
      process.execPath,
      [WRANGLER, 'dev', '--local', '-c', 'apps/portal/wrangler.jsonc', '-c', 'apps/conta/wrangler.jsonc', '--port', String(porta), '--ip', '127.0.0.1', '--inspector-port', String(inspetor), '--persist-to', join(pasta, 'estado')],
      {
        cwd: RAIZ,
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(pasta, 'logs'), NO_COLOR: '1', FORCE_COLOR: '0', CI: 'true' },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    await new Promise<void>((resolve, reject) => {
      const prazo = setTimeout(() => reject(new Error(`wrangler dev não ficou pronto em 150 s:\n${saida.join('')}`)), 150_000);
      const ler = (dado: Buffer): void => {
        const texto = dado.toString('utf8');
        saida.push(texto);
        if (/Ready on http/.test(texto)) {
          clearTimeout(prazo);
          resolve();
        }
      };
      filho.stdout!.on('data', ler);
      filho.stderr!.on('data', ler);
      filho.once('exit', (codigo) => reject(new Error(`wrangler dev saiu (${String(codigo)}) antes de ficar pronto:\n${saida.join('')}`)));
    }).catch((e: unknown) => {
      matarGrupo(filho, 'SIGKILL');
      throw e;
    });
    filho.removeAllListeners('exit');
  }, 180_000);

  afterAll(async () => {
    if (filho && filho.exitCode === null) {
      await new Promise<void>((resolve) => {
        const forcar = setTimeout(() => matarGrupo(filho, 'SIGKILL'), 10_000);
        filho.once('exit', () => {
          clearTimeout(forcar);
          resolve();
        });
        matarGrupo(filho, 'SIGTERM');
      });
    }
    rmSync(DEV_VARS, { force: true });
    rmSync(pasta, { recursive: true, force: true });
    rmSync(join(RAIZ, 'apps/portal/.wrangler'), { recursive: true, force: true });
    rmSync(join(RAIZ, 'apps/conta/.wrangler'), { recursive: true, force: true });
    expect(existsSync(DEV_VARS)).toBe(false);
  });

  it('serve as páginas de conta com a CSP que deixa o fetch da própria origem', async () => {
    for (const caminho of ['/entrar', '/criar-conta', '/esqueci-a-senha', '/nova-senha', '/minha-conta', '/conta.js']) {
      const r = await fetch(base + caminho);
      expect(r.status, caminho).toBe(200);
    }
    const csp = (await fetch(`${base}/entrar`)).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it('o resto de /api é 404 e o corpo grande é 413', async () => {
    expect((await fetch(`${base}/api/outra`)).status).toBe(404);
    const grande = await fetch(`${base}/api/conta/entrar`, { method: 'POST', headers: { Origin: base }, body: 'x'.repeat(9 * 1024) });
    expect(grande.status).toBe(413);
  });

  it('o fluxo de uma conta: criar, eu, sair, eu (401), entrar, esqueci, Origin de fora, nome, excluir, entrar (401)', async () => {
    const email = `fulano-${randomBytes(4).toString('hex')}@exemplo.com`;
    const senha = 'segredo-bom-123';

    const criada = await api('criar', 'POST', { email, senha, nome: 'Fulano' });
    expect(criada.status).toBe(201);
    expect(criada.corpo).toEqual({ conta: { nome: 'Fulano', email, saldo: 100 } });
    const setCookie = criada.cabecalhos.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/^becogames_sessao=[A-Za-z0-9_-]{43}; Max-Age=7776000; Path=\/; HttpOnly; SameSite=Lax$/);
    expect(criada.cabecalhos.get('Cache-Control')).toBe('no-store');
    expect(cookie).not.toBe('');

    const eu = await api('eu', 'GET');
    expect(eu.status).toBe(200);
    expect(eu.corpo).toEqual({ conta: { nome: 'Fulano', email, saldo: 100 } });

    const cookieAntigo = cookie;
    expect((await api('sair', 'POST', {})).status).toBe(200);
    expect((await api('eu', 'GET', undefined, { cookie: cookieAntigo })).status).toBe(401);

    const entrou = await api('entrar', 'POST', { email, senha });
    expect(entrou.status).toBe(200);
    expect(cookie).not.toBe('');

    const comConta = await api('esqueci', 'POST', { email });
    const semConta = await api('esqueci', 'POST', { email: `sem-${randomBytes(4).toString('hex')}@exemplo.com` });
    expect(comConta.status).toBe(200);
    expect(comConta.corpo).toEqual({ ok: true, mensagem: MENSAGEM_ESQUECI });
    expect(semConta.corpo).toEqual(comConta.corpo);

    expect((await api('nome', 'POST', { nome: 'Ciclano' }, { origem: 'https://evil.app' })).status).toBe(403);
    expect((await api('nome', 'POST', { nome: 'Ciclano' }, { origem: null })).status).toBe(403);

    const novoNome = await api('nome', 'POST', { nome: 'Ciclano' });
    expect(novoNome.status).toBe(200);
    expect(novoNome.corpo).toEqual({ conta: { nome: 'Ciclano', email, saldo: 100 } });
    expect((await api('eu', 'GET')).corpo).toEqual({ conta: { nome: 'Ciclano', email, saldo: 100 } });

    expect((await api('excluir', 'POST', { senha: 'senha-errada-1' })).status).toBe(401);
    expect((await api('excluir', 'POST', { senha })).status).toBe(200);
    const depois = await api('entrar', 'POST', { email, senha });
    expect(depois.status).toBe(401);
    expect(depois.corpo.erro).toBe('email-ou-senha');
  }, 60_000);

  it('nenhum e-mail, senha nem cookie foi a log', () => {
    const texto = saida.join('');
    expect(texto).not.toContain('segredo-bom-123');
    expect(texto).not.toMatch(/@exemplo\.com/);
    expect(texto).not.toMatch(/becogames_sessao=[A-Za-z0-9_-]{43}/);
  });
});
