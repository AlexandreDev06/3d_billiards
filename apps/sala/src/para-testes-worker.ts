/**
 * Apoio dos testes do Worker (L41): sobe o `wrangler dev --local` de verdade (o mesmo `wrangler.jsonc` que vai ao ar, com os static
 * assets, o Durable Object com SQLite e o estado em disco numa pasta de teste) e dá o que os testes de partida precisam: a loja pelo
 * HTTP, a escolha de tacada e o laço de uma partida. Nada de conta Cloudflare: é `--local`, o workerd da própria máquina.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import type { MensagemDaSala } from '@sinuca/protocolo';
import { numeradasNosEventos, tacadaDaVisao, type VisaoDoCliente } from './para-testes';
import type { ClienteWs } from './para-testes-ws';

const PASTA_DA_SALA = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

export interface WranglerLocal {
  readonly porta: number;
  readonly base: string;
  /** Tudo o que o Worker e o wrangler escreveram (stdout e stderr), para conferir que nenhum código foi a log. */
  readonly saida: string[];
  parar(): Promise<void>;
}

export interface OpcoesDoWrangler {
  /** Onde o `wrangler dev` guarda o estado dos Durable Objects; a mesma pasta em duas subidas é "o mesmo objeto despejado e acordado". */
  readonly persistir: string;
  /** Os static assets (a cópia do build, com o `_headers`). */
  readonly assets: string;
  readonly vars?: Readonly<Record<string, string>>;
}

const portaLivre = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

export async function subirWrangler(opcoes: OpcoesDoWrangler): Promise<WranglerLocal> {
  const [porta, inspetor] = [await portaLivre(), await portaLivre()];
  const vars = Object.entries(opcoes.vars ?? {}).flatMap(([k, v]) => ['--var', `${k}:${v}`]);
  const filho: ChildProcess = spawn(
    process.execPath,
    [WRANGLER, 'dev', '--local', '--port', String(porta), '--ip', '127.0.0.1', '--inspector-port', String(inspetor), '--assets', opcoes.assets, '--persist-to', opcoes.persistir, ...vars],
    {
      cwd: PASTA_DA_SALA,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(tmpdir(), 'sala-wrangler-logs'), NO_COLOR: '1', FORCE_COLOR: '0', CI: 'true' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const saida: string[] = [];
  let pronto!: () => void;
  let falhou!: (e: Error) => void;
  const subiu = new Promise<void>((resolve, reject) => {
    pronto = resolve;
    falhou = reject;
  });
  const ler = (dado: Buffer): void => {
    const texto = dado.toString('utf8');
    saida.push(texto);
    if (/Ready on http/.test(texto)) pronto();
  };
  filho.stdout!.on('data', ler);
  filho.stderr!.on('data', ler);
  filho.once('exit', (codigo) => falhou(new Error(`wrangler dev saiu (${String(codigo)}) antes de ficar pronto:\n${saida.join('')}`)));
  // com o disco e a CPU da máquina disputados (dump de banco, outros times) o workerd já levou mais de 90 s para ficar pronto
  const prazo = setTimeout(() => falhou(new Error(`wrangler dev não ficou pronto em 150 s:\n${saida.join('')}`)), 150_000);
  try {
    await subiu;
  } catch (e) {
    matarGrupo(filho, 'SIGKILL');
    throw e;
  } finally {
    clearTimeout(prazo);
  }
  filho.removeAllListeners('exit');
  return {
    porta,
    base: `http://127.0.0.1:${porta}`,
    saida,
    parar: () =>
      new Promise<void>((resolve) => {
        if (filho.exitCode !== null || filho.signalCode !== null) return resolve();
        const forcar = setTimeout(() => matarGrupo(filho, 'SIGKILL'), 10_000);
        filho.once('exit', () => {
          clearTimeout(forcar);
          resolve();
        });
        matarGrupo(filho, 'SIGTERM');
      }),
  };
}

/** O wrangler e o workerd formam um grupo de processos (`detached`): derruba o grupo todo, sem deixar workerd órfão. */
function matarGrupo(filho: ChildProcess, sinal: NodeJS.Signals): void {
  try {
    if (filho.pid !== undefined) process.kill(-filho.pid, sinal);
  } catch {
    // já saiu
  }
}

/** O que o navegador da página faz: o Origin é o do próprio endereço e o código vai no `Authorization`. */
export async function http<T = unknown>(
  base: string,
  metodo: 'GET' | 'POST',
  caminho: string,
  opcoes: { codigo?: string; corpo?: object | string; cabecalhos?: Record<string, string>; semOrigin?: boolean } = {},
): Promise<{ status: number; corpo: T; cabecalhos: Headers; bruto: string }> {
  const cabecalhos: Record<string, string> = { ...opcoes.cabecalhos };
  if (opcoes.codigo) cabecalhos.Authorization = `Bearer ${opcoes.codigo}`;
  if (metodo === 'POST' && !opcoes.semOrigin) cabecalhos.Origin = base;
  let body: string | undefined;
  if (opcoes.corpo !== undefined) {
    body = typeof opcoes.corpo === 'string' ? opcoes.corpo : JSON.stringify(opcoes.corpo);
    cabecalhos['Content-Type'] ??= 'application/json';
  }
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: cabecalhos, ...(body !== undefined ? { body } : {}) });
  const bruto = await r.text();
  let corpo: unknown = bruto;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    // texto puro ou HTML
  }
  return { status: r.status, corpo: corpo as T, cabecalhos: r.headers, bruto };
}

/** A tacada que a física acha: encaçapa numeradas sem derrubar a branca; sem nenhuma, um toque de leve. */
export function escolherTacada(v: VisaoDoCliente, turno: number) {
  let melhor: { m: ReturnType<typeof tacadaDaVisao>; n: number } | null = null;
  for (const velocidadeTaco of [3, 5, 7]) {
    for (let a = -Math.PI; a < Math.PI; a += 0.03) {
      const p: ParametrosTacada = { angulo: a, velocidadeTaco, efeito: { lateral: 0, vertical: 0.1 }, elevacao: 0, giz: 1 };
      const sim = simularTacada(v.mesa, p, criarRng(11), CONFIG_FISICA_PADRAO);
      const brancaCaiu = sim.eventos.some((e) => (e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa') && e.bola === 0);
      const n = numeradasNosEventos(sim.eventos).length;
      if (brancaCaiu || n === 0) continue;
      if (!melhor || n > melhor.n) melhor = { m: tacadaDaVisao(v, p, 11), n };
      if (n >= 2) return melhor.m;
    }
    if (melhor) return melhor.m;
  }
  return tacadaDaVisao(v, { angulo: 0.3 + turno * 0.7, velocidadeTaco: 1.5, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, 11);
}

/** Espera a primeira mensagem de `c`, recebida depois da posição `marca` da lista, que `serve`. */
export const depoisDe = (c: ClienteWs, marca: number, serve: (m: MensagemDaSala) => boolean) => c.esperar((m) => c.recebidas.indexOf(m) >= marca && serve(m));
