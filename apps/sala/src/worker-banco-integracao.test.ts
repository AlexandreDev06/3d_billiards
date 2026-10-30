/**
 * A sala com o saldo no Banco, nos DOIS Workers de verdade (L59): `wrangler dev --local -c apps/sala/wrangler.jsonc -c apps/conta/wrangler.jsonc`
 * sobe o `sinuca-sala` e o `becogames-conta` no mesmo workerd, ligados pelo service binding `CONTA` (RPC de verdade para o entrypoint
 * `Banco`), com `SALDO_NO_BANCO=1`. Dois clientes WebSocket reais jogam, com a física e as regras reais.
 *
 * O Banco e o espelho são lidos DIRETO dos arquivos SQLite dos dois objetos (`--persist-to`, abertos só para leitura), então a prova
 * não passa pela própria sala: o saldo do Banco (`contas.saldo`) contra o espelho (o JSON da tabela `carteiras` do `SalaDO`).
 *
 * Em ordem (o estado dos Workers é o mesmo de um teste ao outro): a carteira nova chega ao Banco (`garantirConta` pela caixa); a compra de
 * uma skin cai nos dois e ler o espelho de novo não devolve as moedas; a compra sem saldo dá 402 e não dá o item; uma partida de
 * mata-mata de 2 com aposta, até o fim; no fim, drenada a caixa, a soma do Banco é a soma dos espelhos e não sobra reserva.
 *
 * Sobe com um `apps/conta/.dev.vars` de teste (pepper de 32 caracteres ou mais), que o teste cria e apaga (`reservarDevVarsDaConta`: os testes de dois Workers se revezam nele).
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
import { depoisDe, escolherTacada, http, reservarDevVarsDaConta, subirWrangler, type WranglerLocal } from './para-testes-worker';

const SEGREDO = 'segredo-so-de-teste-do-l59-0123456789';
const PEPPER_DE_TESTE = 'pepper-so-de-teste-do-l59-0123456789-abcdef';
const PASTA_DA_CONTA = fileURLToPath(new URL('../../conta/', import.meta.url));

type Carteira = EstadoCarteira & { codigo?: string };

interface Uso {
  caixaDoBanco?: { pendentes: number; comprasPendentes: number };
}

const idDe = (codigo: string): string => createHash('sha256').update(codigo).digest('hex');
const dormir = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** O arquivo SQLite do objeto na pasta `<persistir>/v3/do/<nome>/`: o que não é o `metadata.sqlite`. */
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

describe('a sala com o saldo no Banco (wrangler dev --local com os dois Workers, workerd de verdade)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-banco-worker-'));
  const persistir = join(raiz, 'estado');
  const assets = join(raiz, 'assets-cf');
  const clientes: ClienteWs[] = [];
  const codigos: string[] = [];
  let w: WranglerLocal;
  let soltarDevVars: (() => void) | undefined;

  const saldoDoBanco = (codigo: string): number | null => consultar<{ saldo: number }>(arquivoDoObjeto(persistir, 'becogames-conta-BancoDO'), 'SELECT saldo FROM contas WHERE id = ?', idDe(codigo))[0]?.saldo ?? null;
  const espelho = (codigo: string): number | null => {
    const linha = consultar<{ dados: string }>(arquivoDoObjeto(persistir, 'sinuca-sala-SalaDO'), 'SELECT dados FROM carteiras WHERE id = ?', idDe(codigo))[0];
    return linha ? (JSON.parse(linha.dados) as { saldo: number }).saldo : null;
  };
  const reservas = (): number => consultar<{ n: number }>(arquivoDoObjeto(persistir, 'becogames-conta-BancoDO'), 'SELECT COUNT(*) AS n FROM reservas')[0]?.n ?? 0;
  const conectar = async (nome: string): Promise<ClienteWs> => {
    const c = await ClienteWs.conectar(w.porta, nome);
    clientes.push(c);
    return c;
  };
  const carteira = async (codigo: string): Promise<Carteira> => {
    const r = await http<Carteira>(w.base, 'GET', '/carteira', { codigo });
    expect(r.status).toBe(200);
    return r.corpo;
  };
  const criarCarteira = async (): Promise<string> => {
    const r = await http<Carteira>(w.base, 'POST', '/carteira');
    expect(r.status).toBe(201);
    codigos.push(r.corpo.codigo!);
    return r.corpo.codigo!;
  };
  const uso = async (): Promise<Uso> => (await http<Uso>(w.base, 'GET', '/admin/uso', { codigo: SEGREDO })).corpo;
  /** Espera até `ok()`, olhando a cada 100 ms. */
  async function ate(descricao: string, ok: () => boolean | Promise<boolean>, ms = 30_000): Promise<void> {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
      if (await ok()) return;
      await dormir(100);
    }
    throw new Error(`não aconteceu em ${ms} ms: ${descricao}`);
  }
  /** A caixa da sala esvaziou (o Banco recebeu tudo) e nenhuma compra espera. */
  const drenado = async (): Promise<void> => {
    await ate('a caixa de saída e as compras pendentes esvaziarem', async () => {
      const u = (await uso()).caixaDoBanco;
      return u !== undefined && u.pendentes === 0 && u.comprasPendentes === 0;
    });
  };

  beforeAll(async () => {
    ClienteWs.esperaPadraoMs = 20_000;
    // o pepper de teste do Banco (32 caracteres ou mais); .dev.vars já está no .gitignore e o teste o apaga
    soltarDevVars = await reservarDevVarsDaConta(PASTA_DA_CONTA, PEPPER_DE_TESTE);
    // o cliente de mentira que o Worker serve (só precisa existir)
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, 'index.html'), '<!doctype html><title>Sinuca</title>');
    w = await subirWrangler({ persistir, assets, configs: ['wrangler.jsonc', '../conta/wrangler.jsonc'], vars: { SEGREDO_ADMIN: SEGREDO, SALDO_NO_BANCO: '1' } });
  }, 540_000);

  afterAll(async () => {
    for (const c of clientes) c.derrubar();
    await w?.parar();
    rmSync(raiz, { recursive: true, force: true });
    soltarDevVars?.(); // por último: apaga o .dev.vars e o .wrangler da conta e deixa o outro teste subir
  }, 60_000);

  it('a carteira nova chega ao Banco pela caixa (garantirConta pelo RPC de verdade) e os dois saldos são o inicial', async () => {
    const codigo = await criarCarteira();
    await ate('o Banco ter a conta', () => saldoDoBanco(codigo) !== null);
    await drenado();
    expect(saldoDoBanco(codigo)).toBe(SALDO_INICIAL);
    expect(espelho(codigo)).toBe(SALDO_INICIAL);
    expect(await carteira(codigo)).toMatchObject({ saldo: SALDO_INICIAL, skins: ['classico'] });
  });

  it('comprar uma skin: o saldo cai no Banco e no espelho, e reler o espelho (GET /carteira) não devolve as moedas', async () => {
    const codigo = codigos[0]!;
    const preco = precoDaSkinNoDia('ebano', diaDaMissao(Date.now()));
    const r = await http<Carteira>(w.base, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ saldo: SALDO_INICIAL - preco, skins: ['classico', 'ebano'] });
    expect(saldoDoBanco(codigo)).toBe(SALDO_INICIAL - preco);
    expect(espelho(codigo)).toBe(SALDO_INICIAL - preco);
    // o furo do L57: o espelho que vem do Banco desfazia a compra local
    for (let i = 0; i < 3; i++) expect(await carteira(codigo)).toMatchObject({ saldo: SALDO_INICIAL - preco, skins: ['classico', 'ebano'] });
    expect(espelho(codigo)).toBe(SALDO_INICIAL - preco);
    expect((await uso()).caixaDoBanco).toMatchObject({ comprasPendentes: 0 });
    // o mesmo débito não se repete: comprar de novo é ja-tem, sem tocar no Banco
    expect((await http(w.base, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } })).status).toBe(409);
    expect(saldoDoBanco(codigo)).toBe(SALDO_INICIAL - preco);
  });

  it('comprar sem saldo no Banco dá 402 e não dá o item', async () => {
    const codigo = codigos[0]!;
    const antes = saldoDoBanco(codigo)!;
    const r = await http<{ erro: string }>(w.base, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ouro' } }); // 500 moedas
    expect(r.status).toBe(402);
    expect(r.corpo.erro).toBe('saldo-insuficiente');
    expect((await carteira(codigo)).skins).not.toContain('ouro');
    expect(saldoDoBanco(codigo)).toBe(antes);
    expect(espelho(codigo)).toBe(antes);
    expect((await uso()).caixaDoBanco).toMatchObject({ pendentes: 0, comprasPendentes: 0 });
  });

  it('uma partida de mata-mata de 2 com aposta, até o fim; drenada a caixa, o Banco e os espelhos dizem o mesmo e não sobra reserva', async () => {
    const codigoAna = await criarCarteira();
    const codigoBeto = await criarCarteira();
    await ate('o Banco ter as duas contas', () => saldoDoBanco(codigoAna) !== null && saldoDoBanco(codigoBeto) !== null);
    const ana = await conectar('Ana');
    const beto = await conectar('Beto');
    const cs = [ana, beto];
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: codigoAna });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo, undefined, codigoBeto);
    await beto.esperarTipo('boas-vindas');
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto')));
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    // a partida começou: a aposta está reservada no Banco, de verdade
    await ate('a reserva da aposta chegar ao Banco', () => reservas() === 2);

    const jogar = async (turno: number): Promise<void> => {
      const estado = ana.ultimoEstado!;
      expect(estado.seq).toBe(turno);
      const quem = cs[estado.vez!]!;
      const marcas = cs.map((c) => c.recebidas.length);
      quem.enviar(escolherTacada(quem.visao!, turno));
      await Promise.all(cs.map((c, i) => depoisDe(c, marcas[i]!, (x) => x.tipo === 'estado-sala' && x.seq === turno + 1)));
    };
    let tacadas = 0;
    for (let turno = 0; turno < 200 && ana.ultimoEstado!.vez !== null; turno++) {
      await jogar(turno);
      tacadas++;
    }
    expect(ana.ultimoEstado!.vez, 'a partida não acabou em 200 tacadas').toBeNull();
    expect(tacadas).toBeGreaterThan(0);
    for (const c of cs) await c.esperar((m) => m.tipo === 'aposta-paga');

    await drenado();
    await ate('a reserva sair do Banco', () => reservas() === 0);
    for (const codigo of [codigoAna, codigoBeto]) {
      expect(saldoDoBanco(codigo), 'o Banco').toBe(espelho(codigo));
      expect((await carteira(codigo)).saldo, 'GET /carteira').toBe(espelho(codigo));
    }
    // o pote só muda de mãos (a soma das duas contas não cai) e os prêmios de missão que a partida fechou só somam
    expect(saldoDoBanco(codigoAna)! + saldoDoBanco(codigoBeto)!).toBeGreaterThanOrEqual(2 * SALDO_INICIAL);
  }, 240_000);

  it('depois de drenar, a soma do Banco é igual à soma dos espelhos, de todas as carteiras', async () => {
    await drenado();
    const doBanco = codigos.reduce((soma, c) => soma + (saldoDoBanco(c) ?? Number.NaN), 0);
    const dosEspelhos = codigos.reduce((soma, c) => soma + (espelho(c) ?? Number.NaN), 0);
    expect(doBanco).toBe(dosEspelhos);
    expect(reservas()).toBe(0);
  });

  it('nenhum código de carteira nem o segredo foi a log', () => {
    const tudo = w.saida.join('');
    for (const codigo of codigos) expect(tudo).not.toContain(codigo);
    expect(tudo).not.toContain(SEGREDO);
    expect(tudo).not.toContain(PEPPER_DE_TESTE);
  });
});
