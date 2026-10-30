/**
 * As contas da Beco Games na sala Node (L61), pelo servidor de verdade (`SALDO_NO_BANCO=1`, o Banco local no `banco.sqlite`): o
 * `/conta/*`, o cookie `becogames_sessao` como identidade em `/carteira*` e no WebSocket, o convidado que vira conta (o código deixa
 * de abrir a carteira), a conta nova do portal (carteira nasce vazia) e a exclusão (apaga a carteira de itens; a caixa é do Banco).
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { SALDO_INICIAL, type EstadoCarteira } from '@sinuca/protocolo';
import { PRESET_MATA_MATA } from '@sinuca/regras';
import { INSTANTE_SEM_VITRINE, SEM_LIMITE } from './para-testes';
import { INTERVALO_DA_RELEITURA_MS } from './registro';
import { NOME_DO_BANCO_LOCAL } from './banco-local';
import { AmbienteDeRede } from './para-testes-ws';
import type { Servidor } from './servidor';

const rede = new AmbienteDeRede();
const pastas: string[] = [];
afterAll(() => rede.encerrar());
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const PEPPER = 'pimenta-de-teste-com-mais-de-trinta-e-dois-caracteres';
const SENHA = 'senha-de-teste-123';

async function subir(extra: { pepper?: string | null; relogio?: () => number; pastaDados?: string } = {}): Promise<Servidor> {
  const pastaDados = extra.pastaDados ?? mkdtempSync(join(tmpdir(), 'sala-conta-'));
  pastas.push(pastaDados);
  return rede.subir({ pastaDados, saldoNoBanco: true, pepperDaSenha: extra.pepper === undefined ? PEPPER : extra.pepper }, extra.relogio === undefined ? {} : { relogio: extra.relogio });
}

interface Resp {
  readonly status: number;
  readonly headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly corpo: any;
}

async function http(s: Servidor, metodo: 'GET' | 'POST', caminho: string, o: { codigo?: string; cookie?: string; corpo?: object; extra?: Record<string, string> } = {}): Promise<Resp> {
  const cab: Record<string, string> = { ...o.extra };
  if (o.codigo) cab.Authorization = `Bearer ${o.codigo}`;
  if (o.cookie) cab.Cookie = o.cookie;
  if (metodo === 'POST') cab.Origin = `http://localhost:${s.porta}`;
  if (o.corpo) cab['Content-Type'] = 'application/json';
  const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: cab, ...(o.corpo ? { body: JSON.stringify(o.corpo) } : {}) });
  const texto = await r.text();
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    corpo = texto;
  }
  return { status: r.status, headers: r.headers, corpo };
}

const cookieDe = (r: Resp): string => {
  const sc = r.headers.get('set-cookie') ?? '';
  const m = /(becogames_sessao=[A-Za-z0-9_-]{43})/.exec(sc);
  if (!m) throw new Error(`sem cookie de sessão: ${sc}`);
  return m[1]!;
};

const novoConvidado = async (s: Servidor): Promise<string> => {
  const r = await http(s, 'POST', '/carteira');
  expect(r.status).toBe(201);
  return r.corpo.codigo as string;
};

let seq = 0;
const email = (): string => `ana${++seq}@exemplo.com`;
const corpoDeCriar = () => ({ email: email(), senha: SENHA, nome: 'Ana' });

describe('sala Node: /conta/*', () => {
  it('criar conta devolve o cookie; /conta/eu reconhece a sessão', async () => {
    const s = await subir();
    const r = await http(s, 'POST', '/conta/criar', { corpo: corpoDeCriar() });
    expect(r.status).toBe(201);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const cookie = cookieDe(r);
    const eu = await http(s, 'GET', '/conta/eu', { cookie });
    expect(eu.status).toBe(200);
  });

  it('rotas e métodos desconhecidos: 404 e 405', async () => {
    const s = await subir();
    expect((await http(s, 'GET', '/conta/nao-existe')).status).toBe(404);
    expect((await http(s, 'GET', '/conta/criar')).status).toBe(405);
  });

  it('sem SALDO_NO_BANCO não há conta: /conta/* é 404', async () => {
    const pastaDados = mkdtempSync(join(tmpdir(), 'sala-conta-'));
    pastas.push(pastaDados);
    const s = await rede.subir({ pastaDados });
    expect((await http(s, 'POST', '/conta/criar', { corpo: corpoDeCriar() })).status).toBe(404);
  });

  it('sem pepper as operações de senha dão 503 (não-configurado)', async () => {
    const s = await subir({ pepper: null });
    const r = await http(s, 'POST', '/conta/criar', { corpo: corpoDeCriar() });
    expect(r.status).toBe(503);
  });
});

describe('sala Node: a sessão manda na carteira', () => {
  it('convidado que vira conta: o código deixa de abrir a carteira; o cookie abre, com o que ele comprou', async () => {
    const s = await subir();
    const codigo = await novoConvidado(s);
    const comprou = await http(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    expect(comprou.status).toBe(200);
    expect(comprou.corpo.saldo).toBe(SALDO_INICIAL - 50);

    const criada = await http(s, 'POST', '/conta/criar', { codigo, corpo: corpoDeCriar() });
    expect(criada.status).toBe(201);
    const cookie = cookieDe(criada);

    expect(s.carteiras.ehDaConta(s.carteiras.resolver(codigo) ?? '')).toBe(false);
    const comCodigo = await http(s, 'GET', '/carteira', { codigo });
    expect(comCodigo.status).toBe(401);
    const comCookie = await http(s, 'GET', '/carteira', { cookie });
    expect(comCookie.status).toBe(200);
    const estado = comCookie.corpo as EstadoCarteira;
    expect(estado.skins).toContain('ebano');
    expect(estado.saldo).toBe(SALDO_INICIAL - 50);
    // com o cookie, o código que vier junto é ignorado (nem o de outro convidado desvia a carteira)
    const outro = await novoConvidado(s);
    const misto = await http(s, 'GET', '/carteira', { cookie, codigo: outro });
    expect((misto.corpo as EstadoCarteira).skins).toContain('ebano');
  });

  it('POST /carteira com sessão devolve a carteira da conta, sem código novo', async () => {
    const s = await subir();
    const cookie = cookieDe(await http(s, 'POST', '/conta/criar', { corpo: corpoDeCriar() }));
    const total = s.carteiras.total;
    const r = await http(s, 'POST', '/carteira', { cookie });
    expect(r.status).toBe(200);
    expect(r.corpo.codigo).toBeUndefined();
    expect(r.corpo.skins).toEqual(['classico']);
    expect(r.corpo.saldo).toBe(SALDO_INICIAL);
    expect(s.carteiras.total).toBe(total + 1);
    const de_novo = await http(s, 'POST', '/carteira', { cookie });
    expect(de_novo.status).toBe(200);
    expect(s.carteiras.total).toBe(total + 1);
  });

  it('cookie de sessão que o Banco não conhece vale como sem cookie (o código segue valendo)', async () => {
    const s = await subir();
    const codigo = await novoConvidado(s);
    const falso = `becogames_sessao=${'a'.repeat(43)}`;
    const r = await http(s, 'GET', '/carteira', { codigo, cookie: falso });
    expect(r.status).toBe(200);
  });

  it('o cabeçalho interno x-sinuca-conta que vier de fora não vale nada', async () => {
    const s = await subir();
    const cookie = cookieDe(await http(s, 'POST', '/conta/criar', { corpo: corpoDeCriar() }));
    const eu = await http(s, 'POST', '/carteira', { cookie });
    expect(eu.status).toBe(200);
    const r = await http(s, 'GET', '/carteira', { extra: { 'x-sinuca-conta': 'a'.repeat(64) } });
    expect(r.status).toBe(401);
  });

  it('excluir a conta apaga a carteira de itens e o cookie deixa de valer', async () => {
    const s = await subir();
    const codigo = await novoConvidado(s);
    await http(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    const criada = await http(s, 'POST', '/conta/criar', { codigo, corpo: corpoDeCriar() });
    const cookie = cookieDe(criada);
    const id = s.carteiras.resolver(codigo);
    expect(id).toBeUndefined(); // daConta: o código já não resolve
    const total = s.carteiras.total;
    const ex = await http(s, 'POST', '/conta/excluir', { cookie, corpo: { senha: SENHA } });
    expect(ex.status).toBe(200);
    expect(s.carteiras.total).toBe(total - 1);
    expect((await http(s, 'GET', '/carteira', { cookie })).status).toBe(401);
  });
});

describe('sala Node: WebSocket com a sessão', () => {
  it('quem entra com o cookie joga com a carteira da conta (a skin comprada aparece no lugar); sem ele, o código do convidado já não vale', async () => {
    const s = await subir();
    const codigo = await novoConvidado(s);
    await http(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    await http(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'ebano' } });
    const cookie = cookieDe(await http(s, 'POST', '/conta/criar', { codigo, corpo: corpoDeCriar() }));

    const ana = await rede.conectar(s, 'Ana', { headers: { Cookie: cookie } });
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { carteira: 'x'.repeat(43) });
    await ana.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.skin === 'ebano');

    const sem = await rede.conectar(s, 'Beto');
    sem.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { carteira: codigo });
    await sem.esperarTipo('boas-vindas');
    const estado = await sem.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.nome !== null);
    expect(estado.tipo === 'estado-sala' && estado.lugares[0]!.skin).toBe('classico');
  });

  it('sair da conta (L61b): o lugar segue na sala sem carteira (saldo null para todos)', async () => {
    const s = await subir();
    const cookie = cookieDe(await http(s, 'POST', '/conta/criar', { corpo: corpoDeCriar() }));
    const ana = await rede.conectar(s, 'Ana', { headers: { Cookie: cookie } });
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras);
    await ana.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.saldo === SALDO_INICIAL);
    const codigo = (await ana.esperarTipo('boas-vindas')).codigo;
    const beto = await rede.conectar(s, 'Beto');
    beto.entrar(codigo);
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.saldo === SALDO_INICIAL);

    const sair = await http(s, 'POST', '/conta/sair', { cookie, corpo: {} });
    expect(sair.status).toBe(200);
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.nome === 'Ana' && (m.lugares[0]!.saldo ?? null) === null);
    expect(s.registro.totalSalas).toBe(1);
  });

  it('a releitura (L61c): sessão apagada no Banco e o relógio 10 min adiante, o criar-sala seguinte sai sem a conta', async () => {
    const pastaDados = mkdtempSync(join(tmpdir(), 'sala-conta-'));
    const agora = { valor: INSTANTE_SEM_VITRINE };
    const s = await subir({ pastaDados, relogio: () => agora.valor });
    const cookie = cookieDe(await http(s, 'POST', '/conta/criar', { corpo: corpoDeCriar() }));
    const ana = await rede.conectar(s, 'Ana', { headers: { Cookie: cookie } });
    // o Banco esquece a sessão sem passar pela sinuca (o portal, a senha nova): só a releitura pode saber
    const db = new DatabaseSync(join(pastaDados, NOME_DO_BANCO_LOCAL));
    try {
      expect(db.prepare('DELETE FROM sessoes').run().changes).toBe(1);
    } finally {
      db.close();
    }
    agora.valor += INTERVALO_DA_RELEITURA_MS;
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras);
    await ana.esperarTipo('boas-vindas');
    const estado = await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.nome === 'Ana');
    expect(estado.tipo === 'estado-sala' && (estado.lugares[0]!.saldo ?? null)).toBeNull();
  });
});
