/**
 * O ensaio completo da migração do saldo nos DOIS Workers de verdade (L60): `wrangler dev --local -c sala -c conta`, três subidas sobre a
 * MESMA pasta de estado (`--persist-to`), como será a janela de produção:
 *
 * 1. `SALDO_NO_BANCO` DESLIGADA (a sinuca como sempre foi, o Banco ainda sem conta): três carteiras com saldos diferentes (uma compra,
 *    duas jogam uma aposta). `levar-saldos-ao-banco` com sala aberta dá 409; sem sala dá `ok`, as somas batem e o Banco tem o saldo de
 *    cada uma; repetir dá `iguais === 3` e `criadas === 0`.
 * 2. Outra subida, agora com a chave LIGADA: uma compra cai nos dois lados (Banco e espelho); `espelhar-saldos` e `levar-saldos-ao-banco`
 *    com tudo em dia não mudam nada.
 * 3. O espelho de uma carteira é posto de volta no número velho (como uma sala que ficou para trás) e sobe de novo com a chave DESLIGADA:
 *    `espelhar-saldos` traz o saldo do Banco, inclusive a compra feita com a chave ligada.
 *
 * Também prova o congelamento (L60b): com ele ligado a compra e a criação dão 503 e nada muda no Banco nem no espelho; ele sobrevive à
 * troca do Worker e desliga por `descongelar-carteiras`. E uma carteira com saldo NEGATIVO (−50) migra, volta e fecha as somas.
 *
 * O Banco e os espelhos são lidos DIRETO dos SQLite dos dois objetos (a prova não passa pela própria sala). Nenhum código de carteira,
 * `id`, segredo nem pepper pode estar na saída dos Workers. Sobe com um `apps/conta/.dev.vars` de teste, que o teste cria e apaga.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diaDaMissao, precoDaSkinNoDia, type EstadoCarteira } from '@sinuca/protocolo';
import { PRESET_MATA_MATA } from '@sinuca/regras';
import { SEM_LIMITE } from './para-testes';
import { ClienteWs } from './para-testes-ws';
import { depoisDe, escolherTacada, http, reservarDevVarsDaConta, subirWrangler, type WranglerLocal } from './para-testes-worker';

const SEGREDO = 'segredo-so-de-teste-do-l60-0123456789';
const PEPPER_DE_TESTE = 'pepper-so-de-teste-do-l60-0123456789-abcdef';
const PASTA_DA_CONTA = fileURLToPath(new URL('../../conta/', import.meta.url));
const CONFIGS = ['wrangler.jsonc', '../conta/wrangler.jsonc'] as const;

type Carteira = EstadoCarteira & { codigo?: string };

interface RespostaDeLevar {
  ok: boolean;
  erro?: string;
  carteiras: number;
  criadas: number;
  iguais: number;
  conflitos: number;
  somaSinuca: number;
  somaBanco: number;
}
interface RespostaDeEspelhar {
  ok: boolean;
  erro?: string;
  carteiras: number;
  mudadas: number;
  semConta: number;
  somaAntes: number;
  somaDepois: number;
  somaBanco: number;
  somaSemConta: number;
}

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
    return []; // a tabela ainda não existe
  } finally {
    db.close();
  }
}

describe('a migração do saldo ao Banco e a volta (wrangler dev --local, três subidas sobre o mesmo estado)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-migracao-worker-'));
  const persistir = join(raiz, 'estado');
  const assets = join(raiz, 'assets-cf');
  const clientes: ClienteWs[] = [];
  const codigos: string[] = [];
  const saidas: string[] = [];
  let w: WranglerLocal | undefined;
  let soltarDevVars: (() => void) | undefined;
  let comprador = '';
  let negativa = '';
  let saldoAntesDaCompra = 0;
  let precoDaCompra = 0;

  const arquivoDoBanco = (): string | null => arquivoDoObjeto(persistir, 'becogames-conta-BancoDO');
  const arquivoDaSala = (): string | null => arquivoDoObjeto(persistir, 'sinuca-sala-SalaDO');
  const saldoDoBanco = (codigo: string): number | null => consultar<{ saldo: number }>(arquivoDoBanco(), 'SELECT saldo FROM contas WHERE id = ?', idDe(codigo))[0]?.saldo ?? null;
  const contasNoBanco = (): number => consultar<{ n: number }>(arquivoDoBanco(), 'SELECT COUNT(*) AS n FROM contas')[0]?.n ?? 0;
  const espelho = (codigo: string): number | null => {
    const linha = consultar<{ dados: string }>(arquivoDaSala(), 'SELECT dados FROM carteiras WHERE id = ?', idDe(codigo))[0];
    return linha ? (JSON.parse(linha.dados) as { saldo: number }).saldo : null;
  };
  const baseW = (): string => w!.base;
  const carteira = async (codigo: string): Promise<Carteira> => {
    const r = await http<Carteira>(baseW(), 'GET', '/carteira', { codigo });
    expect(r.status).toBe(200);
    return r.corpo;
  };
  const criarCarteira = async (): Promise<string> => {
    const r = await http<Carteira>(baseW(), 'POST', '/carteira');
    expect(r.status).toBe(201);
    codigos.push(r.corpo.codigo!);
    return r.corpo.codigo!;
  };
  const levar = () => http<RespostaDeLevar>(baseW(), 'POST', '/admin/levar-saldos-ao-banco', { codigo: SEGREDO });
  const espelhar = () => http<RespostaDeEspelhar>(baseW(), 'POST', '/admin/espelhar-saldos', { codigo: SEGREDO });
  const congelar = () => http<{ ok: boolean; ate?: number }>(baseW(), 'POST', '/admin/congelar-carteiras', { codigo: SEGREDO });
  const descongelar = () => http<{ ok: boolean; estava?: boolean }>(baseW(), 'POST', '/admin/descongelar-carteiras', { codigo: SEGREDO });
  const salasAbertas = async (): Promise<number> => (await http<{ salas: number }>(baseW(), 'GET', '/admin/uso', { codigo: SEGREDO })).corpo.salas;
  async function ate(descricao: string, ok: () => boolean | Promise<boolean>, ms = 30_000, passoMs = 100): Promise<void> {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
      if (await ok()) return;
      await dormir(passoMs);
    }
    throw new Error(`não aconteceu em ${ms} ms: ${descricao}`);
  }
  async function subir(saldoNoBanco: '0' | '1'): Promise<void> {
    w = await subirWrangler({ persistir, assets, configs: CONFIGS, vars: { SEGREDO_ADMIN: SEGREDO, SALDO_NO_BANCO: saldoNoBanco } });
  }
  async function descer(): Promise<void> {
    if (w === undefined) return;
    saidas.push(w.saida.join(''));
    await w.parar();
    w = undefined;
  }
  const somaDosEspelhos = (): number => codigos.reduce((t, c) => t + (espelho(c) ?? Number.NaN), 0);
  const somaDoBanco = (): number => codigos.reduce((t, c) => t + (saldoDoBanco(c) ?? Number.NaN), 0);

  beforeAll(async () => {
    ClienteWs.esperaPadraoMs = 20_000;
    soltarDevVars = await reservarDevVarsDaConta(PASTA_DA_CONTA, PEPPER_DE_TESTE);
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, 'index.html'), '<!doctype html><title>Sinuca</title>');
    await subir('0');
  }, 540_000);

  afterAll(async () => {
    for (const c of clientes) c.derrubar();
    await w?.parar();
    rmSync(raiz, { recursive: true, force: true });
    soltarDevVars?.(); // por último: apaga o .dev.vars e o .wrangler da conta e deixa o outro teste subir
  }, 60_000);

  it('1. chave desligada: três carteiras com saldos diferentes (uma compra, uma aposta) e o Banco ainda sem conta nenhuma', async () => {
    const [a, b, c] = [await criarCarteira(), await criarCarteira(), await criarCarteira()];
    const r = await http<Carteira>(baseW(), 'POST', '/carteira/comprar', { codigo: a, corpo: { skin: 'ebano' } });
    expect(r.status).toBe(200);

    const bb = await ClienteWs.conectar(w!.porta, 'Beto');
    const cc = await ClienteWs.conectar(w!.porta, 'Cida');
    clientes.push(bb, cc);
    const cs = [bb, cc];
    bb.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: b });
    const bv = await bb.esperarTipo('boas-vindas');
    cc.entrar(bv.codigo, undefined, c);
    await cc.esperarTipo('boas-vindas');
    await Promise.all(cs.map((x) => x.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Cida')));
    bb.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((x) => x.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));

    // com a sala aberta a migração é recusada, e nada chega ao Banco
    expect(await salasAbertas()).toBeGreaterThan(0);
    const recusada = await levar();
    expect(recusada.status).toBe(409);
    expect(recusada.corpo).toMatchObject({ ok: false, erro: 'salas-abertas' });
    expect((await espelhar()).status).toBe(409);
    expect(contasNoBanco()).toBe(0);

    const jogar = async (turno: number): Promise<void> => {
      const estado = bb.ultimoEstado!;
      expect(estado.seq).toBe(turno);
      const quem = cs[estado.vez!]!;
      const marcas = cs.map((x) => x.recebidas.length);
      quem.enviar(escolherTacada(quem.visao!, turno));
      await Promise.all(cs.map((x, i) => depoisDe(x, marcas[i]!, (m) => m.tipo === 'estado-sala' && m.seq === turno + 1)));
    };
    for (let turno = 0; turno < 200 && bb.ultimoEstado!.vez !== null; turno++) await jogar(turno);
    expect(bb.ultimoEstado!.vez, 'a partida não acabou em 200 tacadas').toBeNull();
    for (const x of cs) await x.esperar((m) => m.tipo === 'aposta-paga');
    // o anfitrião volta ao lobby e todos saem: a sala vazia no lobby expira em 60 s (`salaVaziaEsperaMs`, sem variável de ambiente)
    bb.enviar({ tipo: 'voltar-ao-lobby' });
    await dormir(500);
    for (const x of cs) x.derrubar();
    // o `/admin/uso` tem balde próprio por IP (30 de rajada, 1 a cada 10 s): consultas espaçadas
    await ate('as salas fecharem', async () => (await salasAbertas()) === 0, 120_000, 5_000);

    const saldos = codigos.map((cod) => espelho(cod)!);
    expect(new Set(saldos).size, `três saldos diferentes: ${saldos.join(', ')}`).toBe(3);
    expect(contasNoBanco()).toBe(0);
  }, 360_000);

  it('1. levar-saldos-ao-banco: ok, as somas batem, o Banco tem o saldo de cada carteira (inclusive uma negativa); repetir dá iguais 3 e criadas 0', async () => {
    // uma carteira fica devendo (−50): o Worker desce, o espelho é posto em −50 e sobe de novo, ainda com a chave desligada
    await descer();
    negativa = codigos[2]!;
    const edicao = new DatabaseSync(arquivoDaSala()!);
    try {
      edicao.prepare("UPDATE carteiras SET dados = json_set(dados, '$.saldo', -50) WHERE id = ?").run(idDe(negativa));
    } finally {
      edicao.close();
    }
    await subir('0');
    expect(espelho(negativa)).toBe(-50);
    const soma = somaDosEspelhos();
    const r = await levar();
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ ok: true, carteiras: 3, criadas: 3, iguais: 0, conflitos: 0, somaSinuca: soma, somaBanco: soma });
    for (const cod of codigos) expect(saldoDoBanco(cod), 'o Banco').toBe(espelho(cod));
    expect(saldoDoBanco(negativa), 'a negativa migrou').toBe(-50);
    expect(somaDoBanco()).toBe(soma);

    const outra = await levar();
    expect(outra.status).toBe(200);
    expect(outra.corpo).toEqual({ ok: true, carteiras: 3, criadas: 0, iguais: 3, conflitos: 0, somaSinuca: soma, somaBanco: soma });
    expect(contasNoBanco()).toBe(3);
    // a rota só lê: os espelhos seguem como estavam
    expect(somaDosEspelhos()).toBe(soma);
  });

  it('2. a chave LIGADA sobre o mesmo estado: uma compra cai nos dois lados e espelhar/levar com tudo em dia não mudam nada', async () => {
    await descer();
    await subir('1');
    const u = (await http<{ caixaDoBanco: { pendentes: number; comprasPendentes: number } }>(baseW(), 'GET', '/admin/uso', { codigo: SEGREDO })).corpo;
    expect(u.caixaDoBanco).toMatchObject({ pendentes: 0, comprasPendentes: 0 });

    // o congelamento: 503 em toda escrita de carteira, nada muda no Banco nem no espelho, e sobrevive à troca do Worker
    const antesDoGelo = { banco: codigos.map((c) => saldoDoBanco(c)), espelhos: codigos.map((c) => espelho(c)), contas: contasNoBanco() };
    comprador = [...codigos].sort((x, y) => espelho(y)! - espelho(x)!)[0]!;
    const congelou = await congelar();
    expect(congelou.status).toBe(200);
    expect(congelou.corpo.ok).toBe(true);
    await descer();
    await subir('1');
    const gelada = await http<{ erro?: string; mensagem?: string }>(baseW(), 'POST', '/carteira/comprar', { codigo: comprador, corpo: { skin: 'ebano' } });
    expect(gelada.status).toBe(503);
    expect(gelada.corpo).toEqual({ erro: 'limite', mensagem: 'A sala está em manutenção por alguns minutos.' });
    const criacao = await http(baseW(), 'POST', '/carteira');
    expect(criacao.status).toBe(503);
    expect((await carteira(comprador)).saldo, 'ler segue valendo').toBe(antesDoGelo.espelhos[codigos.indexOf(comprador)]);
    expect({ banco: codigos.map((c) => saldoDoBanco(c)), espelhos: codigos.map((c) => espelho(c)), contas: contasNoBanco() }).toEqual(antesDoGelo);
    const uso = (await http<{ congeladaAte: number | null }>(baseW(), 'GET', '/admin/uso', { codigo: SEGREDO })).corpo;
    expect(uso.congeladaAte).toBeGreaterThan(Date.now());
    expect((await descongelar()).corpo).toEqual({ ok: true, estava: true });

    // compra quem tem mais (a skin que ele ainda não tem)
    saldoAntesDaCompra = espelho(comprador)!;
    precoDaCompra = precoDaSkinNoDia('ebano', diaDaMissao(Date.now()));
    const tem = (await carteira(comprador)).skins.includes('ebano');
    const skin = tem ? 'xadrez-de-toalha' : 'ebano';
    if (tem) precoDaCompra = precoDaSkinNoDia('xadrez-de-toalha', diaDaMissao(Date.now()));
    expect(saldoAntesDaCompra, 'o comprador tem com o que pagar').toBeGreaterThanOrEqual(precoDaCompra);
    const compra = await http<Carteira>(baseW(), 'POST', '/carteira/comprar', { codigo: comprador, corpo: { skin } });
    expect(compra.status).toBe(200);
    expect(saldoDoBanco(comprador)).toBe(saldoAntesDaCompra - precoDaCompra);
    expect(espelho(comprador)).toBe(saldoAntesDaCompra - precoDaCompra);
    for (let i = 0; i < 2; i++) expect((await carteira(comprador)).saldo).toBe(saldoAntesDaCompra - precoDaCompra);

    const soma = somaDosEspelhos();
    const volta = await espelhar();
    expect(volta.status).toBe(200);
    expect(volta.corpo).toEqual({ ok: true, carteiras: 3, mudadas: 0, semConta: 0, somaAntes: soma, somaDepois: soma, somaBanco: soma, somaSemConta: 0 });
    const ida = await levar();
    expect(ida.corpo).toEqual({ ok: true, carteiras: 3, criadas: 0, iguais: 3, conflitos: 0, somaSinuca: soma, somaBanco: soma });
    expect(somaDoBanco()).toBe(soma);
  }, 240_000);

  it('3. de volta com a chave DESLIGADA: o espelho que ficou para trás recebe o saldo do Banco, inclusive a compra feita com a chave ligada', async () => {
    await descer();
    // o espelho do comprador fica no número de antes da compra (como uma sala que não viu o movimento do Banco)
    const db = new DatabaseSync(arquivoDaSala()!);
    try {
      db.prepare("UPDATE carteiras SET dados = json_set(dados, '$.saldo', ?) WHERE id = ?").run(saldoAntesDaCompra, idDe(comprador));
    } finally {
      db.close();
    }
    expect(espelho(comprador)).toBe(saldoAntesDaCompra);
    await subir('0');
    const noBanco = saldoAntesDaCompra - precoDaCompra;
    expect(saldoDoBanco(comprador)).toBe(noBanco);
    expect((await carteira(comprador)).saldo, 'chave desligada: o GET mostra o espelho velho').toBe(saldoAntesDaCompra);

    const somaAntes = somaDosEspelhos();
    const r = await espelhar();
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ ok: true, carteiras: 3, mudadas: 1, semConta: 0, somaAntes, somaDepois: somaAntes - precoDaCompra, somaBanco: somaAntes - precoDaCompra, somaSemConta: 0 });
    expect(espelho(comprador)).toBe(noBanco);
    expect((await carteira(comprador)).saldo).toBe(noBanco);
    expect(somaDosEspelhos()).toBe(somaDoBanco());
    // e é idempotente
    expect((await espelhar()).corpo).toMatchObject({ ok: true, mudadas: 0 });
  }, 240_000);

  it('nenhum código de carteira, id, segredo nem pepper foi a log; só contagens', async () => {
    await descer();
    const tudo = saidas.join('');
    for (const cod of codigos) {
      expect(tudo).not.toContain(cod);
      expect(tudo).not.toContain(idDe(cod));
    }
    // os 8 primeiros caracteres do id são o que a sala já loga em outros eventos (`conta=`); nas rotas da migração não aparecem
    const daMigracao = tudo.split('\n').filter((l) => l.includes('admin-levar-saldos') || l.includes('admin-espelhar-saldos')).join('\n');
    expect(daMigracao).not.toBe('');
    for (const cod of codigos) expect(daMigracao).not.toContain(idDe(cod).slice(0, 8));
    expect(tudo).not.toContain(SEGREDO);
    expect(tudo).not.toContain(PEPPER_DE_TESTE);
    expect(tudo).toContain('admin-levar-saldos');
    expect(tudo).toContain('admin-espelhar-saldos');
  });
});
