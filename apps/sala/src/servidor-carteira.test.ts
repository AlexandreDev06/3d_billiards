import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  SALDO_INICIAL,
  ehSemente,
  missoesDoDia,
  validarCarteiraCriada,
  validarErroDaCarteira,
  validarEstadoDaCarteira,
  vitrineDoDia,
  type CodigoErroCarteira,
  type EstadoCarteira,
} from '@sinuca/protocolo';
import { CONFIG_SALA_PADRAO, type ConfigSala } from './config';
import { AmbienteDeRede, httpBruto } from './para-testes-ws';
import type { OpcoesDoServidor, Servidor } from './servidor';

const rede = new AmbienteDeRede();
const pastas: string[] = [];
afterAll(() => rede.encerrar());
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const pastaDeDados = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-http-carteira-'));
  pastas.push(p);
  return p;
};

const carteiraComLimites = (extra: Partial<ConfigSala['carteira']>): ConfigSala['carteira'] => ({ ...CONFIG_SALA_PADRAO.carteira, ...extra });

async function subir(config: Partial<ConfigSala> = {}, opcoes: OpcoesDoServidor = {}): Promise<Servidor> {
  return rede.subir({ pastaDados: pastaDeDados(), ...config }, opcoes);
}

interface Resposta {
  readonly status: number;
  readonly headers: Headers;
  readonly texto: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly corpo: any;
}

interface Pedido {
  readonly codigo?: string;
  readonly corpo?: string | object;
  readonly origem?: string | null;
  readonly tipo?: string | null;
  readonly ip?: string;
  readonly cabecalhos?: Record<string, string>;
}

/** Faz a requisição como o navegador da própria página faria: Origin do próprio servidor nos POST. */
async function chamar(s: Servidor, metodo: string, caminho: string, p: Pedido = {}): Promise<Resposta> {
  const cabecalhos: Record<string, string> = { ...p.cabecalhos };
  if (p.codigo !== undefined) cabecalhos.Authorization = `Bearer ${p.codigo}`;
  const origem = p.origem === undefined ? (metodo === 'GET' ? null : `http://localhost:${s.porta}`) : p.origem;
  if (origem !== null) cabecalhos.Origin = origem;
  if (p.ip) cabecalhos['X-Forwarded-For'] = p.ip;
  let corpo: string | undefined;
  if (p.corpo !== undefined) {
    corpo = typeof p.corpo === 'string' ? p.corpo : JSON.stringify(p.corpo);
    const tipo = p.tipo === undefined ? 'application/json' : p.tipo;
    if (tipo !== null) cabecalhos['Content-Type'] = tipo;
  }
  const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: cabecalhos, body: corpo });
  const texto = await r.text();
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    json = undefined;
  }
  return { status: r.status, headers: r.headers, texto, corpo: json };
}

const criar = async (s: Servidor, ip?: string) => {
  const r = await chamar(s, 'POST', '/carteira', { ip });
  expect(r.status).toBe(201);
  return r.corpo as { codigo: string; saldo: number; skins: string[]; skin: string };
};

const erroDe = (r: Resposta): CodigoErroCarteira => {
  const v = validarErroDaCarteira(r.corpo);
  if (!v.ok) throw new Error(`a resposta não é um erro da carteira: ${r.texto}`);
  return v.valor.erro;
};

describe('POST /carteira — criar', () => {
  it('cria uma carteira com 100 moedas, só o clássico, e devolve o código uma única vez', async () => {
    const s = await subir();
    const r = await chamar(s, 'POST', '/carteira');
    expect(r.status).toBe(201);
    const v = validarCarteiraCriada(r.corpo);
    expect(v.ok, r.texto).toBe(true);
    expect(r.corpo).toMatchObject({ saldo: SALDO_INICIAL, skins: ['classico'], skin: 'classico' });
    expect(s.carteiras.total).toBe(1);
    expect(s.carteiras.resolver(r.corpo.codigo)).toBeDefined();
  });

  it('cabeçalhos de uma resposta de dinheiro: JSON, sem cache, sem sniffing, sem CORS', async () => {
    const s = await subir();
    const r = await chamar(s, 'POST', '/carteira');
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('aceita corpo vazio ou {}, e recusa qualquer outra coisa no corpo', async () => {
    const s = await subir();
    expect((await chamar(s, 'POST', '/carteira', { corpo: '{}' })).status).toBe(201);
    for (const corpo of ['{"saldo":999999}', '[]', 'oi', '{"codigo":"x"}']) {
      const r = await chamar(s, 'POST', '/carteira', { corpo });
      expect(r.status, corpo).toBe(400);
      expect(erroDe(r)).toBe('requisicao-invalida');
    }
    expect(s.carteiras.total).toBe(1);
  });

  it('POST /carteira não leva código: com Authorization é pedido errado e não cria nada', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    const r = await chamar(s, 'POST', '/carteira', { codigo });
    expect(r.status).toBe(400);
    expect(erroDe(r)).toBe('requisicao-invalida');
    expect(s.carteiras.total).toBe(1);
  });

  it('o corpo não carrega saldo escolhido pelo cliente: o saldo é sempre o inicial', async () => {
    const s = await subir();
    const r = await chamar(s, 'POST', '/carteira', { corpo: { saldo: 1_000_000 } });
    expect(r.status).toBe(400);
  });
});

describe('GET /carteira — ler', () => {
  it('devolve o estado, sem o código', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    const r = await chamar(s, 'GET', '/carteira', { codigo });
    expect(r.status).toBe(200);
    expect(validarEstadoDaCarteira(r.corpo).ok).toBe(true);
    expect(r.corpo).toMatchObject({ saldo: 100, skins: ['classico'], skin: 'classico' });
    expect(r.texto).not.toContain(codigo);
  });

  it('traz as 3 missões do dia (L31) com o progresso da carteira, e o que vira o dia zera', async () => {
    let agora = Date.parse('2026-10-26T15:00:00Z');
    const s = await subir({}, { relogio: () => agora });
    const { codigo } = await criar(s);
    const id = s.carteiras.resolver(codigo)!;
    const quadro = (await chamar(s, 'GET', '/carteira', { codigo })).corpo.missoes;
    expect(quadro.dia).toBe('2026-10-26');
    expect(quadro.itens.map((i: { id: string }) => i.id)).toEqual(missoesDoDia('2026-10-26').map((m) => m.id));
    const [facil] = missoesDoDia('2026-10-26');
    s.carteiras.registrarMissoes(id, { [facil.id]: 1 });
    const andou = await chamar(s, 'GET', '/carteira', { codigo });
    expect(validarEstadoDaCarteira(andou.corpo).ok).toBe(true);
    expect(andou.corpo.missoes.itens[0]).toMatchObject({ id: facil.id, progresso: 1 });
    agora = Date.parse('2026-10-27T03:00:00Z');
    const amanha = (await chamar(s, 'GET', '/carteira', { codigo })).corpo.missoes;
    expect(amanha.dia).toBe('2026-10-27');
    expect(amanha.itens.every((i: { progresso: number }) => i.progresso === 0)).toBe(true);
  });

  it('mostra o saldo negativo de quem perdeu apostas', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: -250 }]);
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.saldo).toBe(-150);
  });

  it('sem código, com código mal formado ou com código que não existe: 401 carteira-invalida, a mesma resposta nos três', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    const trocado = codigo.slice(0, -1) + (codigo.endsWith('A') ? 'B' : 'A');
    const semCodigo = await chamar(s, 'GET', '/carteira');
    const malFormado = await chamar(s, 'GET', '/carteira', { codigo: 'curto' });
    const inexistente = await chamar(s, 'GET', '/carteira', { codigo: trocado });
    for (const r of [semCodigo, malFormado, inexistente]) {
      expect(r.status).toBe(401);
      expect(erroDe(r)).toBe('carteira-invalida');
    }
    expect(malFormado.texto).toBe(inexistente.texto);
    expect(semCodigo.texto).toBe(inexistente.texto);
  });

  it.each(['Basic abc', 'bearer', 'Bearer', 'Token xxx', 'Bearer  ', `Bearer ${'a'.repeat(44)}`])('Authorization "%s" não é um código', async (cabecalho) => {
    const s = await subir();
    const r = await chamar(s, 'GET', '/carteira', { cabecalhos: { Authorization: cabecalho } });
    expect(r.status).toBe(401);
  });

  it('o código só vale no cabeçalho: na URL ou no corpo não conta', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    expect((await chamar(s, 'GET', `/carteira?codigo=${codigo}`)).status).toBe(401);
    expect((await chamar(s, 'GET', `/carteira?c=${codigo}`, { cabecalhos: { Cookie: `codigo=${codigo}` } })).status).toBe(401);
  });

  it('GET com corpo é pedido errado (o fetch nem deixa; na mão, 400)', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    const saida = await httpBruto(s.porta, `GET /carteira HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${codigo}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`);
    expect(saida).toMatch(/^HTTP\/1\.1 400/);
  });
});

describe('POST /carteira/comprar e /carteira/usar', () => {
  /** Uma carteira com `saldo` moedas e o código dela. */
  async function comSaldo(s: Servidor, saldo: number) {
    const c = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(c.codigo)!, delta: saldo - SALDO_INICIAL }]);
    return c.codigo;
  }

  it('compra: desconta o preço, guarda a skin e devolve o estado; a skin em uso não muda', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 500);
    const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'marfim' } });
    expect(r.status).toBe(200);
    expect(validarEstadoDaCarteira(r.corpo).ok).toBe(true);
    expect(r.corpo).toMatchObject({ saldo: 400, skins: ['classico', 'marfim'], skin: 'classico' });
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo).toEqual(r.corpo);
  });

  it('compra só com saldo: saldo-insuficiente (402) e nada muda; igual ao preço compra e fica em zero', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 99);
    const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'marfim' } });
    expect(r.status).toBe(402);
    expect(erroDe(r)).toBe('saldo-insuficiente');
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.saldo).toBe(99);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 1 }]);
    const ok = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'marfim' } });
    expect(ok.status).toBe(200);
    expect(ok.corpo.saldo).toBe(0);
  });

  it('com saldo negativo não compra nada, nem a mais barata', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, -20);
    const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    expect(r.status).toBe(402);
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.saldo).toBe(-20);
  });

  it('já ter a skin é ja-tem (409), inclusive o clássico, e não cobra de novo', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 500);
    expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } })).status).toBe(200);
    for (const skin of ['ebano', 'classico']) {
      const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin } });
      expect(r.status, skin).toBe(409);
      expect(erroDe(r)).toBe('ja-tem');
    }
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.saldo).toBe(450);
  });

  it('skin fora do catálogo é skin-invalida (400), em comprar e em usar', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 500);
    for (const rota of ['/carteira/comprar', '/carteira/usar']) {
      for (const skin of ['diamante', 'Ouro', 'toString', '__proto__']) {
        const r = await chamar(s, 'POST', rota, { codigo, corpo: { skin } });
        expect(r.status, `${rota} ${skin}`).toBe(400);
        expect(erroDe(r)).toBe('skin-invalida');
      }
    }
  });

  it('usar: só skin que se tem. Sem ela é nao-tem (409); com ela troca e a troca fica', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 500);
    const semTer = await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'ouro' } });
    expect(semTer.status).toBe(409);
    expect(erroDe(semTer)).toBe('nao-tem');
    await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    const r = await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'ebano' } });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ saldo: 450, skins: ['classico', 'ebano'], skin: 'ebano' });
    expect((await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'classico' } })).corpo.skin).toBe('classico');
  });

  it('exigem o código: sem ele, ou com um errado, é 401 e nenhuma carteira muda', async () => {
    const s = await subir();
    const dono = await comSaldo(s, 500);
    const outro = await comSaldo(s, 500);
    for (const rota of ['/carteira/comprar', '/carteira/usar']) {
      expect((await chamar(s, 'POST', rota, { corpo: { skin: 'classico' } })).status, rota).toBe(401);
      expect((await chamar(s, 'POST', rota, { codigo: 'x'.repeat(43), corpo: { skin: 'classico' } })).status, rota).toBe(401);
    }
    // o código de um não mexe na carteira do outro
    await chamar(s, 'POST', '/carteira/comprar', { codigo: dono, corpo: { skin: 'ebano' } });
    expect((await chamar(s, 'GET', '/carteira', { codigo: outro })).corpo).toMatchObject({ saldo: 500, skins: ['classico'], skin: 'classico' });
  });

  it('corpo malformado, com chave a mais, sem a skin ou com tipo errado é requisicao-invalida (400), sem tocar na carteira', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 500);
    const ruins = ['', '{', 'skin=ebano', '{"skin":"ebano","saldo":999}', '{}', '[]', '"ebano"', '{"skin":3}', '{"skin":null}', '{"skin":["ebano"]}', '{"skin":"ebano","skin":"ouro","x":1}', '{"skin":"ebano","__proto__":{"saldo":1}}'];
    for (const corpo of ruins) {
      const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo });
      expect(r.status, corpo).toBe(400);
      expect(erroDe(r), corpo).toBe('requisicao-invalida');
    }
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo).toMatchObject({ saldo: 500, skins: ['classico'], skin: 'classico' });
  });

  it('exigem corpo JSON: sem Content-Type, ou com outro, é 415, e nada é comprado', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 500);
    for (const tipo of [null, 'text/plain', 'application/x-www-form-urlencoded', 'text/json', 'application/jsonx', 'multipart/form-data; boundary=x']) {
      const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: '{"skin":"ebano"}', tipo });
      expect(r.status, String(tipo)).toBe(415);
      expect(erroDe(r)).toBe('requisicao-invalida');
    }
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.saldo).toBe(500);
    for (const tipo of ['application/json', 'application/json; charset=utf-8', 'Application/JSON;charset=UTF-8']) {
      expect((await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: '{"skin":"classico"}', tipo })).status, tipo).toBe(200);
    }
  });

  it('duas compras ao mesmo tempo da mesma skin: uma passa e nove são ja-tem; o dinheiro sai uma vez só', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 200);
    const respostas = await Promise.all(Array.from({ length: 10 }, () => chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } })));
    const status = respostas.map((r) => r.status).sort();
    expect(status.filter((x) => x === 200)).toHaveLength(1);
    expect(status.filter((x) => x === 409)).toHaveLength(9);
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.saldo).toBe(150);
  });

  it('compras diferentes ao mesmo tempo que juntas passam do saldo: só entra o que cabe, e o saldo nunca fica negativo', async () => {
    const s = await subir();
    const codigo = await comSaldo(s, 100);
    const pedidos = ['ebano', 'boteco', 'marfim', 'carbono', 'chamas'];
    const respostas = await Promise.all(pedidos.map((skin) => chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin } })));
    const ok = respostas.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const estado = (await chamar(s, 'GET', '/carteira', { codigo })).corpo as EstadoCarteira;
    expect(estado.saldo).toBeGreaterThanOrEqual(0);
    expect(estado.skins).toHaveLength(1 + ok.length);
    expect(respostas.filter((r) => r.status !== 200).every((r) => r.status === 402)).toBe(true);
  });
});

describe('o que a rota aceita', () => {
  it('métodos errados: 405 com Allow, e nada é feito', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    const casos: [string, string, string][] = [
      ['DELETE', '/carteira', 'GET, POST'],
      ['PUT', '/carteira', 'GET, POST'],
      ['PATCH', '/carteira', 'GET, POST'],
      ['GET', '/carteira/comprar', 'POST'],
      ['GET', '/carteira/usar', 'POST'],
      ['PUT', '/carteira/comprar', 'POST'],
      ['HEAD', '/carteira', 'GET, POST'],
      ['OPTIONS', '/carteira', 'GET, POST'],
      ['OPTIONS', '/carteira/comprar', 'POST'],
    ];
    for (const [metodo, caminho, allow] of casos) {
      const r = await chamar(s, metodo, caminho, { codigo, corpo: metodo === 'HEAD' || metodo === 'GET' ? undefined : '{"skin":"ebano"}' });
      expect(r.status, `${metodo} ${caminho}`).toBe(405);
      expect(r.headers.get('allow')).toBe(allow);
    }
    expect(s.carteiras.total).toBe(1);
  });

  it('caminho desconhecido sob /carteira é 404 em JSON (e não a página do jogo)', async () => {
    const s = await subir();
    for (const caminho of ['/carteira/', '/carteira/vender', '/carteira/comprar/', '/carteira/usar/ebano']) {
      const r = await chamar(s, 'GET', caminho);
      expect(r.status, caminho).toBe(404);
      expect(r.headers.get('content-type')).toContain('application/json');
    }
    // o fetch normaliza os pontos; na mão, o caminho chega como veio
    const saida = await httpBruto(s.porta, 'GET /carteira/../sala HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    expect(saida).toMatch(/^HTTP\/1\.1 404/);
    expect(saida).toContain('application/json');
  });

  it('a query string não muda a rota; outros caminhos continuam sendo do site', async () => {
    const s = await subir();
    expect((await chamar(s, 'POST', '/carteira?x=1')).status).toBe(201);
    const pagina = await fetch(`http://127.0.0.1:${s.porta}/carteiras`);
    expect(pagina.headers.get('content-type')).toContain('text/html'); // cai no index.html, como qualquer rota do site
  });
});

describe('Origin — a mesma checagem do WebSocket', () => {
  it('origem de outro site: 403 e nada é feito (nem criar, nem comprar)', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 1000 }]);
    const antes = s.carteiras.total;
    for (const origem of ['https://evil.example', 'http://localhost:1', 'null', 'http://localhost:' + s.porta + '.evil.example']) {
      const criada = await chamar(s, 'POST', '/carteira', { origem });
      expect(criada.status, origem).toBe(403);
      expect(erroDe(criada)).toBe('requisicao-invalida');
      const compra = await chamar(s, 'POST', '/carteira/comprar', { origem, codigo, corpo: { skin: 'ebano' } });
      expect(compra.status, origem).toBe(403);
      expect((await chamar(s, 'GET', '/carteira', { origem, codigo })).status).toBe(403);
    }
    expect(s.carteiras.total).toBe(antes);
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.skins).toEqual(['classico']);
  });

  it('as origens da lista (o próprio servidor, o Vite dev) passam; sem Origin (curl, testes) passa', async () => {
    const s = await subir();
    const origens = [`http://localhost:${s.porta}`, `http://127.0.0.1:${s.porta}`, 'http://localhost:5173', 'https://mayfly-one-mainly.ngrok-free.app', null];
    for (const [i, origem] of origens.entries()) {
      expect((await chamar(s, 'POST', '/carteira', { origem, ip: `10.9.0.${i}` })).status, String(origem)).toBe(201);
    }
  });

  it('a lista vem da config: ORIGENS manda também aqui', async () => {
    const s = await subir({ origensPermitidas: ['https://meu.jogo.example'] });
    expect((await chamar(s, 'POST', '/carteira', { origem: 'https://meu.jogo.example' })).status).toBe(201);
    expect((await chamar(s, 'POST', '/carteira', { origem: 'http://localhost:5173' })).status).toBe(403);
  });
});

describe('corpo de até 1 KB, lido com pressa', () => {
  it('1024 bytes passam; 1025 não (413), com Content-Length', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 1000 }]);
    const base = '{"skin":"ebano"}';
    const justo = base + ' '.repeat(1024 - base.length);
    expect(justo.length).toBe(1024);
    expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: justo })).status).toBe(200);
    const grande = base + ' '.repeat(1025 - base.length);
    const r = await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: grande });
    expect(r.status).toBe(413);
    expect(erroDe(r)).toBe('requisicao-invalida');
  });

  it('corpo que passa do limite sem Content-Length (chunked) também cai em 413, e o servidor não lê o resto', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 1000 }]);
    const pedaco = new TextEncoder().encode('{"skin":"ebano","x":"' + 'a'.repeat(900));
    const fluxo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(pedaco);
        c.enqueue(pedaco);
        c.enqueue(pedaco);
        c.close();
      },
    });
    const r = await fetch(`http://127.0.0.1:${s.porta}/carteira/comprar`, {
      method: 'POST',
      headers: { Origin: `http://localhost:${s.porta}`, 'Content-Type': 'application/json', Authorization: `Bearer ${codigo}` },
      body: fluxo,
      duplex: 'half',
    });
    expect(r.status).toBe(413);
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo.skins).toEqual(['classico']);
  });

  it('corpo que não chega a tempo: 408 e a conexão cai (quem manda o corpo devagar não segura a conexão)', async () => {
    const s = await subir({ carteira: carteiraComLimites({ tempoDoCorpoMs: 120 }) });
    const { codigo } = await criar(s);
    const t0 = Date.now();
    const saida = await httpBruto(
      s.porta,
      `POST /carteira/comprar HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://localhost:${s.porta}\r\nAuthorization: Bearer ${codigo}\r\nContent-Type: application/json\r\nContent-Length: 16\r\n\r\n{"sk`,
    );
    expect(saida).toMatch(/^HTTP\/1\.1 408/);
    expect(Date.now() - t0).toBeLessThan(2500);
  });

  it('Content-Length absurdo é recusado na hora, sem esperar o corpo', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    const t0 = Date.now();
    const saida = await httpBruto(
      s.porta,
      `POST /carteira/comprar HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://localhost:${s.porta}\r\nAuthorization: Bearer ${codigo}\r\nContent-Type: application/json\r\nContent-Length: 99999999\r\nConnection: close\r\n\r\n`,
    );
    expect(saida).toMatch(/^HTTP\/1\.1 413/);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('limites', () => {
  it('criar carteira: poucas por hora por IP; o IP seguinte não é afetado; passada a hora, volta', async () => {
    let agora = 1_000_000;
    const s = await subir({ carteira: carteiraComLimites({ criarPorIp: { capacidade: 2, porSegundo: 1 / 3600 } }) }, { relogio: () => agora });
    expect((await chamar(s, 'POST', '/carteira', { ip: '203.0.113.7' })).status).toBe(201);
    expect((await chamar(s, 'POST', '/carteira', { ip: '203.0.113.7' })).status).toBe(201);
    const barrada = await chamar(s, 'POST', '/carteira', { ip: '203.0.113.7' });
    expect(barrada.status).toBe(429);
    expect(erroDe(barrada)).toBe('limite');
    expect(barrada.headers.get('retry-after')).not.toBeNull();
    expect(s.carteiras.total).toBe(2);
    expect((await chamar(s, 'POST', '/carteira', { ip: '203.0.113.8' })).status).toBe(201);
    agora += 3600_000;
    expect((await chamar(s, 'POST', '/carteira', { ip: '203.0.113.7' })).status).toBe(201);
  });

  it('o IP é o último item do X-Forwarded-For (o que o proxy viu), não o que o cliente escreveu', async () => {
    const s = await subir({ carteira: carteiraComLimites({ criarPorIp: { capacidade: 1, porSegundo: 1e-6 } }) });
    expect((await chamar(s, 'POST', '/carteira', { ip: '1.1.1.1, 203.0.113.7' })).status).toBe(201);
    expect((await chamar(s, 'POST', '/carteira', { ip: '2.2.2.2, 203.0.113.7' })).status).toBe(429);
  });

  it('IPv6 conta por /64: quatro endereços da mesma rede esgotam o balde de uma, e outra rede não é afetada', async () => {
    const s = await subir({ carteira: carteiraComLimites({ criarPorIp: { capacidade: 3, porSegundo: 1e-6 } }) });
    const status: number[] = [];
    for (const ip of ['2001:db8:aa:bb::1', '2001:db8:aa:bb:ffff:ffff:ffff:ffff', '2001:db8:aa:bb:2:3:4:5', '2001:db8:aa:bb::9']) status.push((await chamar(s, 'POST', '/carteira', { ip })).status);
    expect(status).toEqual([201, 201, 201, 429]);
    expect((await chamar(s, 'POST', '/carteira', { ip: '2001:db8:aa:bc::1' })).status).toBe(201);
  });

  it('IPv4 mapeado em IPv6 é o mesmo IP do IPv4: não dá para dobrar o balde trocando a grafia', async () => {
    const s = await subir({ carteira: carteiraComLimites({ criarPorIp: { capacidade: 1, porSegundo: 1e-6 } }) });
    expect((await chamar(s, 'POST', '/carteira', { ip: '203.0.113.7' })).status).toBe(201);
    expect((await chamar(s, 'POST', '/carteira', { ip: '::ffff:203.0.113.7' })).status).toBe(429);
    expect((await chamar(s, 'POST', '/carteira', { ip: '::ffff:cb00:7107' })).status).toBe(429);
  });

  it('não há balde global de criação: 40 IPs diferentes criam uma carteira cada um, só o balde de cada IP segura o ritmo (L26)', async () => {
    const s = await subir();
    for (let i = 1; i <= 40; i++) expect((await chamar(s, 'POST', '/carteira', { ip: `198.51.100.${i}` })).status, `IP ${i}`).toBe(201);
    expect(s.carteiras.total).toBe(40);
    // o mesmo IP, porém, continua limitado
    const mesmo = '203.0.113.99';
    for (let i = 0; i < CONFIG_SALA_PADRAO.carteira.criarPorIp.capacidade; i++) expect((await chamar(s, 'POST', '/carteira', { ip: mesmo })).status).toBe(201);
    expect((await chamar(s, 'POST', '/carteira', { ip: mesmo })).status).toBe(429);
  });

  it('a configuração padrão não tem o balde global de criação (L26)', () => {
    expect(CONFIG_SALA_PADRAO.carteira).not.toHaveProperty('criarNoTotal');
  });

  it('ler, comprar e usar: limite por carteira. Uma carteira esgotada não atrapalha as outras', async () => {
    let agora = 1_000_000;
    const s = await subir({ carteira: carteiraComLimites({ operacoesPorCarteira: { capacidade: 3, porSegundo: 1 / 60 } }) }, { relogio: () => agora });
    const a = await criar(s, '10.0.0.1');
    const b = await criar(s, '10.0.0.2');
    for (let i = 0; i < 3; i++) expect((await chamar(s, 'GET', '/carteira', { codigo: a.codigo, ip: `10.1.0.${i}` })).status).toBe(200);
    const barrada = await chamar(s, 'GET', '/carteira', { codigo: a.codigo, ip: '10.1.0.9' });
    expect(barrada.status).toBe(429);
    expect(erroDe(barrada)).toBe('limite');
    expect((await chamar(s, 'POST', '/carteira/comprar', { codigo: a.codigo, corpo: { skin: 'ebano' }, ip: '10.1.0.10' })).status).toBe(429);
    expect((await chamar(s, 'GET', '/carteira', { codigo: b.codigo })).status).toBe(200);
    agora += 60_000;
    expect((await chamar(s, 'GET', '/carteira', { codigo: a.codigo })).status).toBe(200);
  });

  it('o limite por carteira vale por código e não por IP: trocar de IP não renova o balde', async () => {
    const s = await subir({ carteira: carteiraComLimites({ operacoesPorCarteira: { capacidade: 1, porSegundo: 1e-6 } }) });
    const a = await criar(s, '10.0.0.1');
    expect((await chamar(s, 'GET', '/carteira', { codigo: a.codigo, ip: '9.9.9.1' })).status).toBe(200);
    expect((await chamar(s, 'GET', '/carteira', { codigo: a.codigo, ip: '9.9.9.2' })).status).toBe(429);
  });

  it('códigos que não existem: depois de algumas tentativas o IP leva `limite` em vez de carteira-invalida, sem criar balde por código chutado', async () => {
    const s = await subir({ carteira: carteiraComLimites({ falhasPorIp: { capacidade: 3, porSegundo: 1e-6 } }) });
    const chute = (i: number) => `${String(i).padStart(2, '0')}${'x'.repeat(41)}`;
    const codigos: CodigoErroCarteira[] = [];
    for (let i = 0; i < 6; i++) codigos.push(erroDe(await chamar(s, 'GET', '/carteira', { codigo: chute(i), ip: '198.51.100.9' })));
    expect(codigos).toEqual(['carteira-invalida', 'carteira-invalida', 'carteira-invalida', 'limite', 'limite', 'limite']);
    // outro IP segue normal; e quem tem o código certo não é barrado por chutes errados (só a falha gasta o balde)
    expect(erroDe(await chamar(s, 'GET', '/carteira', { codigo: chute(9), ip: '198.51.100.10' }))).toBe('carteira-invalida');
    const boa = await criar(s, '198.51.100.20');
    expect((await chamar(s, 'GET', '/carteira', { codigo: boa.codigo, ip: '198.51.100.9' })).status).toBe(200);
  });

  it('qualquer requisição a /carteira conta no limite geral do IP', async () => {
    const s = await subir({ carteira: carteiraComLimites({ requisicoesPorIp: { capacidade: 4, porSegundo: 1e-6 } }) });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await chamar(s, 'GET', '/carteira', { ip: '192.0.2.5' })).status);
    expect(statuses).toEqual([401, 401, 401, 401, 429, 429]);
  });

  it('teto de carteiras: com todas em uso, POST /carteira é 503 limite e as que existem seguem valendo', async () => {
    const s = await subir({ maxCarteiras: 2 });
    const a = await criar(s, '10.0.0.1');
    const b = await criar(s, '10.0.0.2');
    s.carteiras.registrarPartida([s.carteiras.resolver(a.codigo)!, s.carteiras.resolver(b.codigo)!]);
    const cheio = await chamar(s, 'POST', '/carteira', { ip: '10.0.0.3' });
    expect(cheio.status).toBe(503);
    expect(erroDe(cheio)).toBe('limite');
    expect((await chamar(s, 'GET', '/carteira', { codigo: a.codigo })).status).toBe(200);
  });

  it('teto de carteiras: com uma nunca usada, a nova toma o lugar da mais velha (o código dela deixa de valer) e o total não passa do teto', async () => {
    const s = await subir({ maxCarteiras: 2 });
    const velha = await criar(s, '10.0.0.1');
    const usada = await criar(s, '10.0.0.2');
    s.carteiras.registrarPartida([s.carteiras.resolver(usada.codigo)!]);
    const nova = await criar(s, '10.0.0.3');
    expect(s.carteiras.total).toBe(2);
    expect((await chamar(s, 'GET', '/carteira', { codigo: velha.codigo })).status).toBe(401);
    expect((await chamar(s, 'GET', '/carteira', { codigo: usada.codigo })).status).toBe(200);
    expect((await chamar(s, 'GET', '/carteira', { codigo: nova.codigo })).status).toBe(200);
  });
});

describe('persistência e log', () => {
  it('a carteira sobrevive ao reinício: o servidor descarrega ao fechar e o código antigo continua valendo', async () => {
    const pastaDados = pastaDeDados();
    const s1 = await rede.subir({ pastaDados });
    const { codigo } = await criar(s1);
    s1.carteiras.aplicar([{ id: s1.carteiras.resolver(codigo)!, delta: 300 }]);
    expect((await chamar(s1, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'carbono' } })).status).toBe(200);
    await chamar(s1, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'carbono' } });
    await s1.fechar();

    const texto = readFileSync(join(pastaDados, 'carteiras.json'), 'utf8');
    expect(texto).not.toContain(codigo);

    const s2 = await rede.subir({ pastaDados });
    const r = await chamar(s2, 'GET', '/carteira', { codigo });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ saldo: 250, skins: ['classico', 'carbono'], skin: 'carbono' });
  });

  it('o log nunca leva o código da carteira, nem IP', async () => {
    const logs: string[] = [];
    const s = await subir({}, { log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) });
    const { codigo } = await criar(s, '203.0.113.77');
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 500 }]);
    await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro' } });
    await chamar(s, 'GET', '/carteira', { codigo: 'y'.repeat(43), ip: '203.0.113.77' });
    await chamar(s, 'POST', '/carteira', { origem: 'https://evil.example', ip: '203.0.113.77' });
    const tudo = logs.join('\n');
    expect(tudo).not.toContain(codigo);
    expect(tudo).not.toContain('y'.repeat(43));
    expect(tudo).not.toContain('203.0.113.77');
    expect(logs.some((l) => l.startsWith('carteira-criada'))).toBe(true);
  });

  it('um arquivo de carteiras estragado não impede o servidor de subir', async () => {
    const pastaDados = pastaDeDados();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(pastaDados, 'carteiras.json'), '{ quebrado');
    const s = await rede.subir({ pastaDados });
    expect((await chamar(s, 'POST', '/carteira')).status).toBe(201);
  });
});

describe('L34: itens, semente, vitrine e preço do servidor pelo HTTP', () => {
  const diaDeVitrine = (dia: string) => vitrineDoDia(dia);
  const agoraNoDia = (dia: string) => Date.parse(`${dia}T15:00:00Z`);

  it('a carteira nova traz o item do clássico (semente de 0 a 999, contador 0) e a vitrine do dia do servidor', async () => {
    const dia = '2026-10-26';
    const s = await subir({}, { relogio: () => agoraNoDia(dia) });
    const criada = await chamar(s, 'POST', '/carteira');
    expect(validarCarteiraCriada(criada.corpo).ok, criada.texto).toBe(true);
    expect(criada.corpo.itens).toEqual([{ skin: 'classico', semente: expect.any(Number), bolas: 0 }]);
    expect(ehSemente(criada.corpo.itens[0].semente)).toBe(true);
    expect(criada.corpo.vitrine).toEqual(diaDeVitrine(dia));
    expect(criada.corpo.vitrine.itens).toHaveLength(3);
    const lida = await chamar(s, 'GET', '/carteira', { codigo: criada.corpo.codigo });
    expect(validarEstadoDaCarteira(lida.corpo).ok, lida.texto).toBe(true);
    expect(lida.corpo.itens).toEqual(criada.corpo.itens);
    expect(lida.corpo.vitrine).toEqual(criada.corpo.vitrine);
  });

  it('comprar uma skin da vitrine cobra o preço do dia e devolve o item novo com a semente; o desconto vale para quem pede', async () => {
    const dia = '2026-10-26';
    const naVitrine = diaDeVitrine(dia).itens.find((i) => i.skin === 'ouro')!; // 500 → 400
    expect(naVitrine.preco).toBe(400);
    const s = await subir({}, { relogio: () => agoraNoDia(dia) });
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 700 }]); // 800
    const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro' } });
    expect(r.status).toBe(200);
    expect(validarEstadoDaCarteira(r.corpo).ok, r.texto).toBe(true);
    expect(r.corpo.saldo).toBe(800 - 400);
    const item = (r.corpo.itens as { skin: string; semente: number; bolas: number }[]).find((i) => i.skin === 'ouro')!;
    expect(ehSemente(item.semente)).toBe(true);
    expect(item.bolas).toBe(0);
    expect(r.corpo.skin).toBe('classico');
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo).toEqual(r.corpo);
  });

  it('fora da vitrine o preço é o cheio, e a mesma skin custa o cheio em outro dia', async () => {
    let agora = agoraNoDia('2026-10-26');
    const s = await subir({}, { relogio: () => agora });
    expect(diaDeVitrine('2026-10-26').itens.some((i) => i.skin === 'marfim')).toBe(false);
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 400 }]);
    expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'marfim' } })).corpo.saldo).toBe(500 - 100);
    // virou o dia para um em que o ouro não está na vitrine: o mesmo ouro custa 500
    const dia = ['2026-11-02', '2026-11-03', '2026-11-04'].find((d) => !diaDeVitrine(d).itens.some((i) => i.skin === 'ouro'))!;
    agora = agoraNoDia(dia);
    expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro' } })).status).toBe(402); // 400 não basta para o cheio
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 100 }]); // 500
    expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro' } })).corpo.saldo).toBe(0);
  });

  it('o cliente nunca manda semente, contador nem itens: essas chaves no corpo são pedido errado e nada é cobrado', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 400 }]);
    for (const corpo of ['{"skin":"ouro","semente":999}', '{"skin":"ouro","bolas":9999}', '{"skin":"ouro","itens":[]}', '{"skin":"ouro","saldo":1000}']) {
      const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo });
      expect(r.status, corpo).toBe(400);
      expect(erroDe(r), corpo).toBe('requisicao-invalida');
    }
    expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo).toMatchObject({ saldo: 500, skins: ['classico'] });
  });

  describe('L34b: preco no pedido de compra é só o teto do que a tela mostrou', () => {
    const DIA_COM_OURO = '2026-10-26'; // ouro na vitrine: 500 → 400
    /** O primeiro dia depois de DIA_COM_OURO em que o ouro não está na vitrine. */
    const diaSemOuro = ['2026-11-02', '2026-11-03', '2026-11-04'].find((d) => !diaDeVitrine(d).itens.some((i) => i.skin === 'ouro'))!;

    it('a virada do dia com a skin saindo da vitrine: 409 preco-mudou, saldo e itens intactos; com o preço novo compra', async () => {
      let agora = agoraNoDia(DIA_COM_OURO);
      const s = await subir({}, { relogio: () => agora });
      const { codigo } = await criar(s);
      s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 700 }]); // 800
      const tela = (await chamar(s, 'GET', '/carteira', { codigo })).corpo.vitrine.itens.find((i: { skin: string }) => i.skin === 'ouro').preco;
      expect(tela).toBe(400);
      agora = agoraNoDia(diaSemOuro);

      const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: tela } });
      expect(r.status).toBe(409);
      expect(erroDe(r)).toBe('preco-mudou');
      expect(r.corpo.mensagem).toBe('O preço dessa skin mudou. Confira o preço novo e tente de novo.');
      const lida = (await chamar(s, 'GET', '/carteira', { codigo })).corpo;
      expect(lida).toMatchObject({ saldo: 800, skins: ['classico'] });
      expect(lida.itens).toHaveLength(1);

      const ok = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: 500 } });
      expect(ok.status).toBe(200);
      expect(ok.corpo.saldo).toBe(300);
    });

    it('a skin entrando na vitrine: o cliente viu 500 e a sala cobra os 400 dela, nunca o número do pedido', async () => {
      const s = await subir({}, { relogio: () => agoraNoDia(DIA_COM_OURO) });
      const { codigo } = await criar(s);
      s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 700 }]);
      const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: 500 } });
      expect(r.status).toBe(200);
      expect(validarEstadoDaCarteira(r.corpo).ok, r.texto).toBe(true);
      expect(r.corpo.saldo).toBe(800 - 400);
    });

    it('preco igual ao da sala compra; um a menos é preco-mudou; sem preco segue como sempre', async () => {
      const s = await subir({}, { relogio: () => agoraNoDia(DIA_COM_OURO) });
      const { codigo } = await criar(s);
      s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 1200 }]); // 1300
      expect(erroDe(await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: 399 } }))).toBe('preco-mudou');
      expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: 400 } })).corpo.saldo).toBe(900);
      expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'marfim' } })).corpo.saldo).toBe(800);
    });

    it('preco-mudou vem antes de saldo-insuficiente, e skin-invalida e ja-tem vêm antes de preco-mudou', async () => {
      const s = await subir({}, { relogio: () => agoraNoDia(DIA_COM_OURO) });
      const { codigo } = await criar(s); // 100 moedas
      expect(erroDe(await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: 1 } }))).toBe('preco-mudou');
      expect(erroDe(await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: 400 } }))).toBe('saldo-insuficiente');
      expect(erroDe(await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'fantasma', preco: 1 } }))).toBe('skin-invalida');
      expect(erroDe(await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'classico', preco: 1 } }))).toBe('ja-tem');
    });

    it('preço negativo, zero, fracionário, absurdo ou de outro tipo é requisicao-invalida (400) e nada é cobrado', async () => {
      const s = await subir({}, { relogio: () => agoraNoDia(DIA_COM_OURO) });
      const { codigo } = await criar(s);
      s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 700 }]);
      const tortos = ['-1', '-400', '0', '399.5', '0.1', '1000001', '1e21', '1e400', '"400"', 'null', 'true', '[400]', '{"valor":400}'];
      for (const preco of tortos) {
        const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: `{"skin":"ouro","preco":${preco}}` });
        expect(r.status, preco).toBe(400);
        expect(erroDe(r), preco).toBe('requisicao-invalida');
      }
      expect((await chamar(s, 'GET', '/carteira', { codigo })).corpo).toMatchObject({ saldo: 800, skins: ['classico'] });
      // as pontas do que o esquema aceita passam pelo esquema e caem na conferência da sala
      expect((await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro', preco: 1_000_000 } })).corpo.saldo).toBe(400);
    });

    it('trocar de skin não leva preço: preco em /usar é requisicao-invalida', async () => {
      const s = await subir();
      const { codigo } = await criar(s);
      const r = await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'classico', preco: 0 } });
      expect(r.status).toBe(400);
      expect(erroDe(r)).toBe('requisicao-invalida');
      expect((await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'classico', preco: 400 } })).status).toBe(400);
      expect((await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'classico' } })).status).toBe(200);
    });
  });

  it('a semente fica com o taco: comprar de novo é ja-tem e não a sorteia outra vez; trocar e voltar de skin não a muda', async () => {
    const s = await subir();
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 900 }]);
    const comprou = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'neon' } });
    const semente = (comprou.corpo.itens as { skin: string; semente: number }[]).find((i) => i.skin === 'neon')!.semente;
    expect(erroDe(await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'neon' } }))).toBe('ja-tem');
    await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'neon' } });
    await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'classico' } });
    const depois = (await chamar(s, 'GET', '/carteira', { codigo })).corpo;
    expect((depois.itens as { skin: string; semente: number }[]).find((i) => i.skin === 'neon')!.semente).toBe(semente);
  });

  it('o log da compra traz skin, preço, semente e se é rara; nunca o código', async () => {
    const logs: string[] = [];
    const s = await subir({}, { log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) });
    const { codigo } = await criar(s);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 400 }]);
    const r = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    const linha = logs.find((l) => l.startsWith('compra '))!;
    const campos = JSON.parse(linha.slice('compra '.length));
    expect(campos).toMatchObject({ skin: 'ebano', preco: 50, vitrine: false, rara: expect.any(Boolean) });
    expect(campos.semente).toBe((r.corpo.itens as { skin: string; semente: number }[]).find((i) => i.skin === 'ebano')!.semente);
    expect(linha).not.toContain(codigo);
  });

  it('o contador e a semente sobrevivem ao reinício do servidor', async () => {
    const pastaDados = pastaDeDados();
    const s1 = await rede.subir({ pastaDados });
    const { codigo } = await criar(s1);
    const id = s1.carteiras.resolver(codigo)!;
    s1.carteiras.registrarMissoes(id, {}, undefined, 7);
    const antes = (await chamar(s1, 'GET', '/carteira', { codigo })).corpo.itens;
    expect(antes).toEqual([{ skin: 'classico', semente: expect.any(Number), bolas: 7 }]);
    await s1.fechar();
    const s2 = await rede.subir({ pastaDados });
    expect((await chamar(s2, 'GET', '/carteira', { codigo })).corpo.itens).toEqual(antes);
  });
});
