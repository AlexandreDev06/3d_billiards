/**
 * As contas da Beco Games na sala, nos DOIS Workers de verdade (L61): `wrangler dev --local -c apps/sala/wrangler.jsonc -c apps/conta/wrangler.jsonc`
 * (workerd, service binding `CONTA` com RPC de verdade para o `Banco`), com `SALDO_NO_BANCO=1`. O Banco aceita o `Origin` do endereço do teste e
 * grava o cookie sem `Secure` nem `Domain` (um `apps/conta/.dev.vars` que o teste cria e apaga). O que se prova, em ordem:
 *
 * 1. um convidado que comprou uma skin vira conta (`POST /conta/criar` com o código): o código sozinho já não abre a carteira (401), o cookie
 *    abre, com a skin; o `id` entra na tabela `carteiras_da_conta` do objeto;
 * 2. a conta criada no portal (sem código) abre pelo cookie com a carteira vazia (só o clássico) e o saldo do Banco; o código de outro
 *    convidado que vier junto é ignorado;
 * 3. o cabeçalho interno `x-sinuca-conta`, forjado por quem chama, não vale nada (nem sem cookie, nem trocando a conta de quem tem cookie);
 * 4. o WebSocket com o cookie joga com a carteira da conta (a skin em uso aparece no lugar);
 * 5. excluir a conta apaga a carteira de itens e o cookie deixa de valer;
 * 6. a conta excluída pelo portal (o Banco marcou `excluida_em`, a sinuca não viu): na subida seguinte a varredura apaga a carteira de itens dela;
 * 7. (L61b) sair da conta com o WebSocket aberto deixa o lugar sem carteira; excluir e a varredura alimentam `contas_excluidas`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SALDO_INICIAL, diaDaMissao, precoDaSkinNoDia, type EstadoCarteira } from '@sinuca/protocolo';
import { PRESET_MATA_MATA } from '@sinuca/regras';
import { SEM_LIMITE } from './para-testes';
import { ClienteWs } from './para-testes-ws';
import { http, portaLivre, reservarDevVarsDaConta, subirWrangler, type WranglerLocal } from './para-testes-worker';

const SEGREDO = 'segredo-so-de-teste-do-l61-0123456789';
const PEPPER_DE_TESTE = 'pepper-so-de-teste-do-l61-0123456789-abcdef';
const SENHA = 'senha-de-teste-do-l61';
const PASTA_DA_CONTA = fileURLToPath(new URL('../../conta/', import.meta.url));
const CONFIGS = ['wrangler.jsonc', '../conta/wrangler.jsonc'];

type Carteira = EstadoCarteira & { codigo?: string };

const idDe = (codigo: string): string => createHash('sha256').update(codigo).digest('hex');
const dormir = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function arquivoDoObjeto(persistir: string, pasta: string): string | null {
  const dir = join(persistir, 'v3', 'do', pasta);
  if (!existsSync(dir)) return null;
  const nome = readdirSync(dir).find((n) => n.endsWith('.sqlite') && n !== 'metadata.sqlite');
  return nome ? join(dir, nome) : null;
}

function consultar<T>(arquivo: string | null, sql: string, ...args: (string | number)[]): T[] {
  if (arquivo === null) return [];
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as T[];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

describe('as contas da Beco Games na sala (wrangler dev --local com os dois Workers, workerd de verdade)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-conta-worker-'));
  const persistir = join(raiz, 'estado');
  const assets = join(raiz, 'assets-cf');
  const clientes: ClienteWs[] = [];
  let w: WranglerLocal;
  let porta = 0;
  let soltarDevVars: (() => void) | undefined;
  let seq = 0;

  const arquivoDaSala = (): string | null => arquivoDoObjeto(persistir, 'sinuca-sala-SalaDO');
  const arquivoDoBanco = (): string | null => arquivoDoObjeto(persistir, 'becogames-conta-BancoDO');
  const excluida = (id: string): boolean => consultar(arquivoDaSala(), 'SELECT id FROM contas_excluidas WHERE id = ?', id).length > 0;
  const daConta = (id: string): boolean => consultar(arquivoDaSala(), 'SELECT id FROM carteiras_da_conta WHERE id = ?', id).length > 0;
  const temCarteira = (id: string): boolean => consultar(arquivoDaSala(), 'SELECT id FROM carteiras WHERE id = ?', id).length > 0;
  const saldoDoBanco = (id: string): number | null => consultar<{ saldo: number }>(arquivoDoBanco(), 'SELECT saldo FROM contas WHERE id = ?', id)[0]?.saldo ?? null;
  const pedirConta = (acao: string, opcoes: { codigo?: string; cookie?: string; corpo?: object } = {}) =>
    http<{ erro?: string }>(w.base, acao === 'eu' ? 'GET' : 'POST', `/conta/${acao}`, {
      ...(opcoes.codigo ? { codigo: opcoes.codigo } : {}),
      ...(opcoes.corpo ? { corpo: opcoes.corpo } : {}),
      ...(opcoes.cookie ? { cabecalhos: { Cookie: opcoes.cookie } } : {}),
    });
  const cookieDe = (cabecalhos: Headers): string => {
    const m = /(becogames_sessao=[A-Za-z0-9_-]{43})/.exec(cabecalhos.get('set-cookie') ?? '');
    if (!m) throw new Error('sem cookie de sessão');
    return m[1]!;
  };
  const novaConta = async (codigo?: string): Promise<{ cookie: string; status: number; email: string }> => {
    const email = `conta${++seq}-${Date.now()}@exemplo.com`;
    const r = await pedirConta('criar', { ...(codigo ? { codigo } : {}), corpo: { email, senha: SENHA, nome: 'Ana' } });
    return { status: r.status, cookie: r.status === 201 ? cookieDe(r.cabecalhos) : '', email };
  };
  const carteiraPorCookie = (cookie: string, extra: Record<string, string> = {}) => http<Carteira>(w.base, 'GET', '/carteira', { cabecalhos: { Cookie: cookie, ...extra } });

  async function ate(descricao: string, ok: () => boolean | Promise<boolean>, ms = 30_000): Promise<void> {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
      if (await ok()) return;
      await dormir(100);
    }
    throw new Error(`não aconteceu em ${ms} ms: ${descricao}`);
  }

  const subir = async (): Promise<WranglerLocal> => subirWrangler({ persistir, assets, configs: CONFIGS, porta, vars: { SEGREDO_ADMIN: SEGREDO, SALDO_NO_BANCO: '1' } });

  beforeAll(async () => {
    ClienteWs.esperaPadraoMs = 20_000;
    porta = await portaLivre();
    soltarDevVars = await reservarDevVarsDaConta(PASTA_DA_CONTA, PEPPER_DE_TESTE, 360_000, {
      ORIGENS_DE_DEV: `http://127.0.0.1:${porta}`,
      COOKIE_SEGURO: '0',
      DOMINIO_DO_COOKIE: '',
    });
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, 'index.html'), '<!doctype html><title>Sinuca</title>');
    w = await subir();
  }, 540_000);

  afterAll(async () => {
    for (const c of clientes) c.derrubar();
    await w?.parar();
    rmSync(raiz, { recursive: true, force: true });
    soltarDevVars?.();
  }, 60_000);

  const convidadoComSkin = async (): Promise<string> => {
    const criado = await http<Carteira>(w.base, 'POST', '/carteira');
    expect(criado.status).toBe(201);
    const codigo = criado.corpo.codigo!;
    const comprou = await http<Carteira>(w.base, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    expect(comprou.status).toBe(200);
    await http(w.base, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'ebano' } });
    return codigo;
  };

  let codigoDoConvidado = '';
  let cookieDoConvidado = '';
  let cookieDoPortal = '';
  let emailDoPortal = '';
  /** A conta do teste de `sair`: a carteira dela segue na sinuca (sair não apaga) e o teste da varredura a exclui "pelo portal" (o Banco limita 3 contas novas por IP e hora). */
  let idDaContaQueSaiu = '';

  it('convidado que vira conta: o código deixa de abrir a carteira, o cookie abre (com a skin comprada) e o id entra em carteiras_da_conta', async () => {
    codigoDoConvidado = await convidadoComSkin();
    const preco = precoDaSkinNoDia('ebano', diaDaMissao(Date.now()));
    expect((await http(w.base, 'GET', '/carteira', { codigo: codigoDoConvidado })).status).toBe(200);

    const nova = await novaConta(codigoDoConvidado);
    expect(nova.status).toBe(201);
    cookieDoConvidado = nova.cookie;
    await ate('o id entrar em carteiras_da_conta', () => daConta(idDe(codigoDoConvidado)));

    expect((await http(w.base, 'GET', '/carteira', { codigo: codigoDoConvidado })).status).toBe(401);
    const r = await carteiraPorCookie(cookieDoConvidado);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ skin: 'ebano' });
    expect(r.corpo.skins).toContain('ebano');
    expect(r.corpo.saldo).toBe(SALDO_INICIAL - preco);
  });

  it('conta criada no portal (sem código): abre pelo cookie com a carteira vazia e o saldo do Banco; o código de outro convidado que vier junto é ignorado', async () => {
    const nova = await novaConta();
    expect(nova.status).toBe(201);
    cookieDoPortal = nova.cookie;
    emailDoPortal = nova.email;
    const antes = consultar<{ n: number }>(arquivoDaSala(), 'SELECT COUNT(*) AS n FROM carteiras')[0]?.n ?? 0;
    const sem = await http<Carteira>(w.base, 'POST', '/carteira', { cabecalhos: { Cookie: cookieDoPortal } });
    expect(sem.status).toBe(200);
    expect(sem.corpo.codigo).toBeUndefined();
    expect(sem.corpo.skins).toEqual(['classico']);
    expect(sem.corpo.saldo).toBe(SALDO_INICIAL);
    await ate('a carteira da conta nascer', () => (consultar<{ n: number }>(arquivoDaSala(), 'SELECT COUNT(*) AS n FROM carteiras')[0]?.n ?? 0) === antes + 1);

    const outro = await http<Carteira>(w.base, 'POST', '/carteira');
    const misto = await http<Carteira>(w.base, 'GET', '/carteira', { codigo: outro.corpo.codigo!, cabecalhos: { Cookie: cookieDoPortal } });
    expect(misto.status).toBe(200);
    expect(misto.corpo.skins).toEqual(['classico']);
    // abrir de novo não cria outra
    await http(w.base, 'POST', '/carteira', { cabecalhos: { Cookie: cookieDoPortal } });
    expect(consultar<{ n: number }>(arquivoDaSala(), 'SELECT COUNT(*) AS n FROM carteiras')[0]?.n).toBe(antes + 1 + 1); // + a do "outro" convidado
  });

  it('regra 5: entrar numa conta existente com a carteira de outro convidado no navegador não soma nada (a conta e o convidado ficam como estavam)', async () => {
    const idDaConta = consultar<{ id: string }>(arquivoDoBanco(), 'SELECT id FROM contas WHERE email = ?', emailDoPortal)[0]!.id;
    const outro = await convidadoComSkin();
    const idDoOutro = idDe(outro);
    const preco = precoDaSkinNoDia('ebano', diaDaMissao(Date.now()));
    await ate('o Banco ter o saldo do convidado', () => saldoDoBanco(idDoOutro) === SALDO_INICIAL - preco);
    const contaAntes = saldoDoBanco(idDaConta);
    const convidadoNoBancoAntes = saldoDoBanco(idDoOutro);
    const carteiraAntes = (await http<Carteira>(w.base, 'GET', '/carteira', { codigo: outro })).corpo;
    expect(contaAntes).toBe(SALDO_INICIAL);
    expect(carteiraAntes.saldo).toBe(SALDO_INICIAL - preco);

    const r = await pedirConta('entrar', { codigo: outro, corpo: { email: emailDoPortal, senha: SENHA } });
    expect(r.status).toBe(200);
    const cookieNovo = cookieDe(r.cabecalhos);
    await dormir(1500); // tempo para qualquer soma indevida chegar ao Banco e à caixa
    // a conta: o saldo no Banco igual, e a carteira dela sem os itens do convidado
    expect(saldoDoBanco(idDaConta)).toBe(contaAntes);
    const daConta2 = await carteiraPorCookie(cookieNovo);
    expect(daConta2.status).toBe(200);
    expect(daConta2.corpo.saldo).toBe(SALDO_INICIAL);
    expect(daConta2.corpo.skins).toEqual(['classico']);
    // o convidado: saldo no Banco, saldo, itens e código intactos (o código segue abrindo a carteira dele, que não virou conta)
    expect(saldoDoBanco(idDoOutro)).toBe(convidadoNoBancoAntes);
    const carteiraDepois = await http<Carteira>(w.base, 'GET', '/carteira', { codigo: outro });
    expect(carteiraDepois.status).toBe(200);
    expect(carteiraDepois.corpo.saldo).toBe(carteiraAntes.saldo);
    expect(carteiraDepois.corpo.skins).toEqual(carteiraAntes.skins);
    expect(carteiraDepois.corpo.itens).toEqual(carteiraAntes.itens);
    expect(daConta(idDoOutro)).toBe(false);
  }, 60_000);

  it('o cabeçalho interno x-sinuca-conta forjado não vale nada: sem cookie é 401 e com o cookie de uma conta não troca a conta', async () => {
    const idDoConvidado = idDe(codigoDoConvidado);
    const semCookie = await http(w.base, 'GET', '/carteira', { cabecalhos: { 'x-sinuca-conta': idDoConvidado } });
    expect(semCookie.status).toBe(401);
    const comCookieDoPortal = await carteiraPorCookie(cookieDoPortal, { 'x-sinuca-conta': idDoConvidado });
    expect(comCookieDoPortal.status).toBe(200);
    expect(comCookieDoPortal.corpo.skins).toEqual(['classico']);
    // nem no WebSocket
    const ws = await ClienteWs.conectar(w.porta, 'Forjador', { headers: { 'x-sinuca-conta': idDoConvidado } });
    clientes.push(ws);
    ws.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras);
    await ws.esperarTipo('boas-vindas');
    const estado = await ws.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.nome !== null);
    expect(estado.tipo === 'estado-sala' && estado.lugares[0]!.skin).toBe('classico');
  });

  it('WebSocket com o cookie joga com a carteira da conta (a skin em uso aparece no lugar)', async () => {
    const ana = await ClienteWs.conectar(w.porta, 'Ana', { headers: { Cookie: cookieDoConvidado } });
    clientes.push(ana);
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { carteira: 'x'.repeat(43) });
    await ana.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.skin === 'ebano');
    ana.derrubar();
  });

  it('sair da conta (L61b): o lugar segue na sala sem carteira (saldo null para todos), mesmo com o WebSocket aberto', async () => {
    const idsAntes = new Set(consultar<{ id: string }>(arquivoDaSala(), 'SELECT id FROM carteiras_da_conta').map((l) => l.id));
    const outra = await novaConta();
    expect(outra.status).toBe(201);
    const eu = await http<Carteira>(w.base, 'POST', '/carteira', { cabecalhos: { Cookie: outra.cookie } });
    expect(eu.status).toBe(200);
    await ate('a carteira da conta nascer', () => consultar<{ id: string }>(arquivoDaSala(), 'SELECT id FROM carteiras_da_conta').some((l) => !idsAntes.has(l.id)));
    idDaContaQueSaiu = consultar<{ id: string }>(arquivoDaSala(), 'SELECT id FROM carteiras_da_conta').map((l) => l.id).find((i) => !idsAntes.has(i))!;
    const ana = await ClienteWs.conectar(w.porta, 'Ana', { headers: { Cookie: outra.cookie } });
    clientes.push(ana);
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras);
    const boasVindas = await ana.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.saldo === SALDO_INICIAL);
    const beto = await ClienteWs.conectar(w.porta, 'Beto');
    clientes.push(beto);
    beto.entrar(boasVindas.codigo);
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.saldo === SALDO_INICIAL);

    const sair = await pedirConta('sair', { cookie: outra.cookie, corpo: {} });
    expect(sair.status).toBe(200);
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.nome === 'Ana' && (m.lugares[0]!.saldo ?? null) === null);
    ana.derrubar();
    beto.derrubar();
  });

  it('excluir a conta apaga a carteira de itens (a do convidado que virou conta) e o cookie deixa de valer', async () => {
    const id = idDe(codigoDoConvidado);
    expect(temCarteira(id)).toBe(true);
    const r = await pedirConta('excluir', { cookie: cookieDoConvidado, corpo: { senha: SENHA } });
    expect(r.status).toBe(200);
    await ate('a carteira sumir da sala', () => !temCarteira(id));
    expect(daConta(id)).toBe(false);
    expect(excluida(id)).toBe(true); // L61b: o id consta no registro dos excluídos, na mesma gravação que apagou a carteira
    expect((await carteiraPorCookie(cookieDoConvidado)).status).toBe(401);
    expect((await http(w.base, 'GET', '/carteira', { codigo: codigoDoConvidado })).status).toBe(401);
    // o Banco zerou a conta (a linha fica, marcada como excluída); a sinuca não a recriou nem mexeu na caixa dele
    expect(saldoDoBanco(id)).toBe(0);
  });

  it('conta excluída pelo portal (só o Banco soube): na subida seguinte a varredura apaga a carteira de itens dela', async () => {
    const idsAntes = new Set(consultar<{ id: string }>(arquivoDaSala(), 'SELECT id FROM carteiras_da_conta').map((l) => l.id));
    expect(idsAntes.size).toBeGreaterThanOrEqual(1);
    const idDoPortal = [...idsAntes].find((i) => i !== idDaContaQueSaiu);
    expect(temCarteira(idDoPortal!)).toBe(true);
    const idDaOutra = idDaContaQueSaiu;
    expect(idDaOutra).not.toBe('');
    expect(temCarteira(idDaOutra)).toBe(true);

    // o portal excluiu a conta: o Banco marca `excluida_em` e a sinuca não é avisada
    await w.parar();
    const banco = new DatabaseSync(arquivoDoBanco()!);
    try {
      banco.prepare('UPDATE contas SET excluida_em = ? WHERE id = ?').run(Date.now(), idDaOutra);
    } finally {
      banco.close();
    }
    w = await subir();
    await http(w.base, 'GET', '/admin/uso', { codigo: SEGREDO }); // acorda o objeto: a varredura roda no construtor
    await ate('a varredura apagar a carteira da conta excluída', () => !temCarteira(idDaOutra));
    expect(daConta(idDaOutra)).toBe(false);
    expect(excluida(idDaOutra)).toBe(true); // L61b: a varredura alimenta o registro dos excluídos
    expect(consultar<{ valor: string }>(arquivoDaSala(), "SELECT valor FROM carteiras_meta WHERE chave = 'excluidas_ate'")[0]?.valor).toBeDefined();
    expect(temCarteira(idDoPortal!)).toBe(true);
  }, 240_000);
});
