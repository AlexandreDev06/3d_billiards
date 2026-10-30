/**
 * O balão fora da linha da carteira (L47b): o que a versão ANTERIOR lê (a linha do SQLite, o `carteiras.json`) nunca leva dados do
 * balão, que moram à parte (tabela `carteiras_balao` no Durable Object, `carteiras-balao.json` na sala Node). Assim o caminho de
 * volta (`wrangler rollback`, a sala Node velha) não descarta carteira nenhuma, e quando a versão nova volta os itens estão lá.
 *
 * A "versão anterior" aqui é a cópia congelada em `versao-anterior/` (tirada do índice do git antes do L47).
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { APARENCIA_PADRAO, SALDO_INICIAL, precoDoItemDoBalao, type AparenciaDoBalao } from '@sinuca/protocolo';
import { CarteirasEmMemoria } from './carteiras-base';
import { ArmazemDeCarteiras } from './carteiras';
import { CarteirasNoDO } from './carteiras-sqlite';
import { banco, escritasDe, type BancoDeTeste } from './para-testes-sqlite';
import { ArmazemDeCarteiras as ArmazemAnterior } from './versao-anterior/carteiras';
import { CarteirasNoDO as CarteirasNoDOAnterior } from './versao-anterior/carteiras-sqlite';
import { CarteirasEmMemoria as CarteirasEmMemoriaAnterior } from './versao-anterior/carteiras-base';

const RELOGIO = Date.parse('2026-11-02T15:00:00Z');
const CHEIA: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' };
const ITENS_DA_CHEIA = ['coroa', 'bigodao', 'olho_kawaii', 'dourado'];

const log = () => {};
const abrirDO = (b: BancoDeTeste) => new CarteirasNoDO({ sql: b.sql, transacao: b.transacao, maxCarteiras: 100, relogio: () => RELOGIO, log });
const abrirDOAnterior = (b: BancoDeTeste) => new CarteirasNoDOAnterior({ sql: b.sql, transacao: b.transacao, maxCarteiras: 100, relogio: () => RELOGIO, log });

const linhas = (b: BancoDeTeste): Record<string, string> => Object.fromEntries((b.db.prepare('SELECT id, dados FROM carteiras').all() as { id: string; dados: string }[]).map((l) => [l.id, l.dados]));
const baloes = (b: BancoDeTeste): Record<string, string> => Object.fromEntries((b.db.prepare('SELECT id, dados FROM carteiras_balao').all() as { id: string; dados: string }[]).map((l) => [l.id, l.dados]));
const descartadasDe = (b: BancoDeTeste): number => (b.db.prepare('SELECT COUNT(*) AS n FROM carteiras_descartadas').get() as { n: number }).n;

/** Uma carteira com moedas e o visual completo equipado, e outra que nunca mexeu em balão. */
function comBalao(a: CarteirasNoDO | ArmazemDeCarteiras | CarteirasEmMemoria) {
  const dona = a.criar()!;
  const simples = a.criar()!;
  a.aplicar([{ id: dona.id, delta: 5000 }]);
  for (const item of ITENS_DA_CHEIA) expect(a.comprarItemDoBalao(dona.id, item).ok, item).toBe(true);
  expect(a.equiparAparencia(dona.id, CHEIA).ok).toBe(true);
  return { dona, simples };
}

/** O que a versão anterior entende de uma carteira: tudo menos o balão. */
const doFormatoAnterior = (e: { saldo: number; skins: readonly string[]; skin: string; itens?: readonly object[] } | undefined) => e && { saldo: e.saldo, skins: e.skins, skin: e.skin, itens: e.itens };

describe('no SQLite do Durable Object: o balão mora numa tabela à parte, com a chave da carteira', () => {
  it('comprar e equipar gravam o balão em carteiras_balao e a linha da carteira fica sem a chave `balao`', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona, simples } = comBalao(a);
    const linha = JSON.parse(linhas(b)[dona.id]!) as Record<string, unknown>;
    expect(Object.keys(linha)).not.toContain('balao');
    expect(linha.saldo).toBe(SALDO_INICIAL + 5000 - ITENS_DA_CHEIA.reduce((s, i) => s + precoDoItemDoBalao(i as 'coroa'), 0));
    expect(JSON.parse(baloes(b)[dona.id]!)).toEqual({ itens: ['coroa', 'bigodao', 'olho_kawaii', 'dourado'], aparencia: CHEIA });
    // quem nunca mexeu no balão não tem linha lá
    expect(Object.keys(baloes(b))).toEqual([dona.id]);
    expect(Object.keys(JSON.parse(linhas(b)[simples.id]!) as object)).not.toContain('balao');
  });

  it('as chaves da linha de uma carteira com balão são as mesmas de uma sem (a versão anterior só conhece essas)', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona, simples } = comBalao(a);
    const chaves = (id: string) => Object.keys(JSON.parse(linhas(b)[id]!) as object).filter((k) => k !== 'jogou');
    // a `dona` jogou (aposta paga) e a `simples` não: o resto das chaves é o mesmo
    expect(chaves(dona.id).sort()).toEqual(chaves(simples.id).sort());
  });

  it('um objeto novo sobre as mesmas tabelas vê o balão e o saldo iguais', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona } = comBalao(a);
    const depois = abrirDO(banco(b.db));
    expect(depois.ler(dona.id)).toEqual(a.ler(dona.id));
    expect(depois.ler(dona.id)!.balao!.aparencia).toEqual(CHEIA);
  });

  it('a compra é uma transação só: se a escrita do balão falha, o saldo também não vai ao banco; a próxima tentativa leva os dois', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona } = comBalao(a);
    const saldoNoBanco = () => (JSON.parse(linhas(b)[dona.id]!) as { saldo: number }).saldo;
    const antes = saldoNoBanco();
    b.falharQuando = /carteiras_balao/;
    expect(a.comprarItemDoBalao(dona.id, 'cartola').ok).toBe(true); // a memória é a verdade e a compra já valeu para quem a fez
    expect(a.pendentes).toBe(1);
    expect(saldoNoBanco(), 'o desconto não pode chegar ao banco sem o item').toBe(antes);
    expect(JSON.parse(baloes(b)[dona.id]!).itens).not.toContain('cartola');
    // o objeto despejado agora volta sem a compra, inteiro: nem o dinheiro saiu nem o item entrou
    expect(abrirDO(banco(b.db)).ler(dona.id)!.saldo).toBe(antes);

    b.falharQuando = null;
    a.tentarPendentes();
    expect(a.pendentes).toBe(0);
    expect(saldoNoBanco()).toBe(antes - precoDoItemDoBalao('cartola'));
    expect(JSON.parse(baloes(b)[dona.id]!).itens).toContain('cartola');
  });

  it('o saldo que falha em ir ao banco também não deixa o item para trás', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona } = comBalao(a);
    const itensNoBanco = () => (JSON.parse(baloes(b)[dona.id]!) as { itens: string[] }).itens;
    const antes = itensNoBanco();
    b.falharQuando = /INTO carteiras \(/;
    a.comprarItemDoBalao(dona.id, 'cartola');
    expect(itensNoBanco()).toEqual(antes);
  });

  it('trocar só a aparência regrava o balão e deixa a linha da carteira como está', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona } = comBalao(a);
    const linhaAntes = linhas(b)[dona.id];
    const comandos = b.comandos.length;
    expect(a.equiparAparencia(dona.id, { ...CHEIA, chapeu: null }).ok).toBe(true);
    expect(linhas(b)[dona.id]).toBe(linhaAntes);
    expect(JSON.parse(baloes(b)[dona.id]!).aparencia.chapeu).toBeNull();
    expect(escritasDe(b.comandos.slice(comandos)).length).toBeGreaterThan(0);
  });

  it('importar com `sobrescrever` leva o balão do arquivo, troca o que havia e apaga o balão de quem saiu', () => {
    const origem = new CarteirasEmMemoria({ maxCarteiras: 100, relogio: () => RELOGIO, log });
    const { dona } = comBalao(origem);
    const b = banco();
    const a = abrirDO(b);
    const antiga = comBalao(a); // outra carteira com balão que vai sumir na troca
    expect(Object.keys(baloes(b))).toEqual([antiga.dona.id]);

    const r = a.importar(origem.exportar(), { sobrescrever: true });
    expect(r).toMatchObject({ ok: true, importadas: 2, substituidas: 2 });
    expect(Object.keys(baloes(b))).toEqual([dona.id]);
    expect(JSON.parse(baloes(b)[dona.id]!).aparencia).toEqual(CHEIA);
    expect(Object.keys(JSON.parse(linhas(b)[dona.id]!) as object)).not.toContain('balao');
    expect(abrirDO(banco(b.db)).ler(dona.id)).toEqual(origem.ler(dona.id));
  });

  it('importar uma cópia sem balão para uma carteira que o tinha apaga a linha do balão dela (a cópia manda)', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona } = comBalao(a);
    const semBalao = JSON.parse(a.exportar()) as { carteiras: object; baloes?: object };
    delete semBalao.baloes;
    expect(a.importar(JSON.stringify(semBalao), { sobrescrever: true })).toMatchObject({ ok: true });
    expect(baloes(b)).toEqual({});
    expect(a.ler(dona.id)!.balao!.aparencia).toEqual(APARENCIA_PADRAO);
  });

  it('exportar leva os dados do balão junto, e a linha de cada carteira continua sem eles', () => {
    const b = banco();
    const a = abrirDO(b);
    const { dona, simples } = comBalao(a);
    const copia = JSON.parse(a.exportar()) as { versao: number; carteiras: Record<string, object>; baloes: Record<string, unknown> };
    expect(copia.versao).toBe(2);
    expect(Object.keys(copia.carteiras).sort()).toEqual([dona.id, simples.id].sort());
    for (const linha of Object.values(copia.carteiras)) expect(Object.keys(linha)).not.toContain('balao');
    expect(copia.baloes).toEqual({ [dona.id]: { itens: ITENS_DA_CHEIA, aparencia: CHEIA } });
  });
});

describe('o caminho de volta no Durable Object: a versão anterior lê o que a nova gravou', () => {
  it('lê todas as carteiras, sem descartar nem mudar nenhuma linha, e o roll-forward devolve o balão', () => {
    const b = banco();
    const nova = abrirDO(b);
    const { dona, simples } = comBalao(nova);
    nova.comprar(dona.id, 'ebano');
    const antes = linhas(b);
    const esperado = [dona.id, simples.id].map((id) => doFormatoAnterior(nova.ler(id)));

    // `wrangler rollback`: o objeto acorda com o código anterior sobre o mesmo armazenamento
    const velha = abrirDOAnterior(banco(b.db));
    expect(velha.total).toBe(2);
    expect([dona.id, simples.id].map((id) => doFormatoAnterior(velha.ler(id)))).toEqual(esperado);
    expect(descartadasDe(b), 'a versão anterior não descarta nenhuma').toBe(0);
    expect(linhas(b), 'nem muda uma linha só por abrir').toEqual(antes);

    // e vive: paga uma aposta, compra um taco, cria uma carteira
    expect(velha.aplicar([{ id: dona.id, delta: -123 }, { id: simples.id, delta: 123 }])).toBe(true);
    const criada = velha.criar()!;
    expect(descartadasDe(b)).toBe(0);

    // roll-forward: o código novo acorda sobre o que a anterior deixou e os itens estão lá, com o saldo que a anterior mexeu
    const devolta = abrirDO(banco(b.db));
    expect(devolta.total).toBe(3);
    expect(devolta.ler(dona.id)!.balao).toEqual(nova.ler(dona.id)!.balao);
    expect(devolta.ler(dona.id)!.balao!.aparencia).toEqual(CHEIA);
    expect(devolta.ler(dona.id)!.saldo).toBe(nova.ler(dona.id)!.saldo - 123);
    expect(devolta.ler(simples.id)!.saldo).toBe(nova.ler(simples.id)!.saldo + 123);
    expect(devolta.ler(criada.id)).toBeDefined();
  });

  it('o banco do formato anterior abre na versão nova sem regravar nenhuma carteira: só as tabelas do balão e da conta são criadas (vazias)', () => {
    const b = banco();
    const velha = abrirDOAnterior(b);
    const a = velha.criar()!;
    velha.comprar(a.id, 'ebano');
    velha.aplicar([{ id: a.id, delta: 40 }]);
    const antes = linhas(b);
    const esperado = doFormatoAnterior(velha.ler(a.id));
    const tabelas = () => (b.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
    const tabelasDeAntes = tabelas();

    const primeira = banco(b.db);
    const nova = abrirDO(primeira);
    expect(nova.pendentes).toBe(0);
    expect(doFormatoAnterior(nova.ler(a.id))).toEqual(esperado);
    expect(linhas(b)).toEqual(antes);
    expect(baloes(b)).toEqual({});
    expect(descartadasDe(b)).toBe(0);
    // as únicas coisas novas no banco são as tabelas do balão e da conta (L61: `carteiras_da_conta`; L61b: `contas_excluidas` e `marcas_pendentes`), vazias e ignoradas pela versão anterior; nenhum INSERT, UPDATE nem DELETE, nem na primeira vez nem na segunda
    expect(tabelas()).toEqual([...tabelasDeAntes, 'carteiras_balao', 'carteiras_da_conta', 'contas_excluidas', 'marcas_pendentes'].sort());
    expect(escritasDe(primeira.comandos)).toEqual([]);
    const segunda = banco(b.db);
    abrirDO(segunda);
    expect(escritasDe(segunda.comandos)).toEqual([]);
  });
});

describe('o caminho de volta na sala Node: a versão anterior lê o que a nova gravou', () => {
  const pastas: string[] = [];
  const abertos: (ArmazemDeCarteiras | ArmazemAnterior)[] = [];
  afterEach(async () => {
    await Promise.all(abertos.splice(0).map((a) => a.fechar()));
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
  });
  const pasta = () => {
    const p = mkdtempSync(join(tmpdir(), 'sala-fora-'));
    pastas.push(p);
    return p;
  };
  const opcoes = (p: string) => ({ pasta: p, maxCarteiras: 100, atrasoMs: 1, relogio: () => RELOGIO, log });
  const abrirNode = (p: string) => {
    const a = new ArmazemDeCarteiras(opcoes(p));
    abertos.push(a);
    return a;
  };
  const abrirAnterior = (p: string) => {
    const a = new ArmazemAnterior(opcoes(p));
    abertos.push(a);
    return a;
  };
  const fechar = async (a: ArmazemDeCarteiras | ArmazemAnterior) => {
    await a.fechar();
    abertos.splice(abertos.indexOf(a), 1);
  };
  interface Lido {
    versao: number;
    carteiras: Record<string, { saldo: number } & Record<string, unknown>>;
    baloes: Record<string, { itens: string[]; aparencia?: unknown }>;
  }
  const lerJson = (p: string, nome: string) => JSON.parse(readFileSync(join(p, nome), 'utf8')) as Lido;

  it('o balão vai a carteiras-balao.json; o carteiras.json fica como a versão anterior o grava', async () => {
    const p = pasta();
    const a = abrirNode(p);
    const { dona, simples } = comBalao(a);
    await fechar(a);
    const principal = lerJson(p, 'carteiras.json');
    expect(Object.keys(principal).sort()).toEqual(['carteiras', 'versao']);
    expect(principal.versao).toBe(2);
    for (const linha of Object.values(principal.carteiras)) expect(Object.keys(linha as object)).not.toContain('balao');
    expect(lerJson(p, 'carteiras-balao.json')).toEqual({ versao: 1, baloes: { [dona.id]: { itens: ITENS_DA_CHEIA, aparencia: CHEIA } } });
    expect(Object.keys(principal.carteiras).sort()).toEqual([dona.id, simples.id].sort());
  });

  it('sem nenhum balão nenhum arquivo novo aparece: a pasta é a de sempre', async () => {
    const p = pasta();
    const a = abrirNode(p);
    a.criar();
    a.aplicar([{ id: a.criar()!.id, delta: 5 }]);
    await fechar(a);
    expect(readdirSync(p).sort()).toEqual(['carteiras.json']);
  });

  it('um armazém novo sobre a mesma pasta vê o balão e o saldo iguais', async () => {
    const p = pasta();
    const a = abrirNode(p);
    const { dona } = comBalao(a);
    const esperado = a.ler(dona.id);
    await fechar(a);
    expect(abrirNode(p).ler(dona.id)).toEqual(esperado);
  });

  it('a versão anterior abre a pasta sem descartar nem guardar de lado nada, e o roll-forward devolve o balão', async () => {
    const p = pasta();
    const a = abrirNode(p);
    const { dona, simples } = comBalao(a);
    const esperado = [dona.id, simples.id].map((id) => doFormatoAnterior(a.ler(id)));
    const saldoDaDona = a.ler(dona.id)!.saldo;
    const balaoEsperado = a.ler(dona.id)!.balao;
    await fechar(a);
    const textoAntes = readFileSync(join(p, 'carteiras.json'), 'utf8');
    const balaoAntes = readFileSync(join(p, 'carteiras-balao.json'), 'utf8');

    const velha = abrirAnterior(p);
    expect([dona.id, simples.id].map((id) => doFormatoAnterior(velha.ler(id)))).toEqual(esperado);
    expect(readdirSync(p).filter((n) => n.includes('corrompido') || n.includes('antes-da-migracao'))).toEqual([]);
    await velha.descarregar();
    expect(readFileSync(join(p, 'carteiras.json'), 'utf8'), 'abrir não regrava o arquivo').toBe(textoAntes);

    // vive um pouco com a versão anterior: o arquivo dela é regravado, o do balão ela nem conhece
    expect(velha.aplicar([{ id: dona.id, delta: -77 }, { id: simples.id, delta: 77 }])).toBe(true);
    await fechar(velha);
    expect(readFileSync(join(p, 'carteiras-balao.json'), 'utf8')).toBe(balaoAntes);
    expect(readdirSync(p).filter((n) => n.includes('corrompido'))).toEqual([]);

    const devolta = abrirNode(p);
    expect(devolta.total).toBe(2);
    expect(devolta.ler(dona.id)!.balao).toEqual(balaoEsperado);
    expect(devolta.ler(dona.id)!.balao!.aparencia).toEqual(CHEIA);
    expect(devolta.ler(dona.id)!.saldo).toBe(saldoDaDona - 77);
  });

  it('a gravação é balão primeiro, carteira depois: se o balão não grava, o desconto da compra não chega ao disco', async () => {
    const p = pasta();
    const a = abrirNode(p);
    const { dona } = comBalao(a);
    await a.descarregar();
    const saldoNoDisco = () => (lerJson(p, 'carteiras.json').carteiras[dona.id] as { saldo: number }).saldo;
    const antes = saldoNoDisco();
    // o arquivo do balão não pode ser trocado por rename: no lugar dele há uma pasta
    rmSync(join(p, 'carteiras-balao.json'));
    mkdirSync(join(p, 'carteiras-balao.json'));
    expect(a.comprarItemDoBalao(dona.id, 'cartola').ok).toBe(true);
    await a.descarregar();
    expect(saldoNoDisco(), 'o desconto não pode chegar ao disco sem o item').toBe(antes);
    expect(readdirSync(p).filter((n) => n.endsWith('.tmp'))).toEqual([]);

    rmdirSync(join(p, 'carteiras-balao.json'));
    await a.descarregar();
    expect(saldoNoDisco()).toBe(antes - precoDoItemDoBalao('cartola'));
    expect(lerJson(p, 'carteiras-balao.json').baloes[dona.id]!.itens).toContain('cartola');
  });

  it('o arquivo do balão que não se lê é guardado de lado (nunca sobrescrito) e a sala sobe com as carteiras', async () => {
    const p = pasta();
    const a = abrirNode(p);
    const { dona } = comBalao(a);
    await fechar(a);
    writeFileSync(join(p, 'carteiras-balao.json'), '{ isto não é json');
    const b = abrirNode(p);
    expect(b.total).toBe(2);
    expect(b.ler(dona.id)!.balao!.aparencia).toEqual(APARENCIA_PADRAO);
    const guardados = readdirSync(p).filter((n) => n.startsWith('carteiras-balao.corrompido-'));
    expect(guardados).toHaveLength(1);
    expect(readFileSync(join(p, guardados[0]!), 'utf8')).toBe('{ isto não é json');
    expect(existsSync(join(p, 'carteiras.json'))).toBe(true);
  });

  it('o balão de uma carteira que não está mais no arquivo é ignorado, e quem sai da memória leva o balão do disco junto', async () => {
    const p = pasta();
    const a = abrirNode(p);
    const { dona } = comBalao(a);
    await fechar(a);
    const balao = lerJson(p, 'carteiras-balao.json');
    balao.baloes['f'.repeat(64)] = { itens: ['coroa'], aparencia: APARENCIA_PADRAO };
    writeFileSync(join(p, 'carteiras-balao.json'), JSON.stringify(balao));
    const b = abrirNode(p);
    expect(b.total).toBe(2);
    expect(b.ler(dona.id)!.balao!.aparencia).toEqual(CHEIA);
    // importar com sobrescrever uma cópia sem balão limpa o arquivo do balão
    const vazia = new CarteirasEmMemoria({ maxCarteiras: 100, relogio: () => RELOGIO, log });
    vazia.criar();
    expect(b.importar(vazia.exportar(), { sobrescrever: true })).toMatchObject({ ok: true });
    await fechar(b);
    expect(lerJson(p, 'carteiras-balao.json').baloes).toEqual({});
  });
});

describe('a versão anterior lê o formato de antes e a exportação da nova', () => {
  it('a exportação da nova (com `baloes`) é importada pela anterior sem descartar nenhuma carteira', () => {
    const origem = new CarteirasEmMemoria({ maxCarteiras: 100, relogio: () => RELOGIO, log });
    const { dona, simples } = comBalao(origem);
    const velha = new CarteirasEmMemoriaAnterior({ maxCarteiras: 100, relogio: () => RELOGIO, log });
    expect(velha.importar(origem.exportar())).toEqual({ ok: true, importadas: 2, descartadas: 0, migradas: 0, substituidas: 0 });
    expect([dona.id, simples.id].map((id) => doFormatoAnterior(velha.ler(id)))).toEqual([dona.id, simples.id].map((id) => doFormatoAnterior(origem.ler(id))));
  });

  it('a nova abre no banco criado com `new DatabaseSync` só com as tabelas de antes (nada de `carteiras_balao` esperando)', () => {
    const db = new DatabaseSync(':memory:');
    abrirDOAnterior(banco(db));
    expect(() => abrirDO(banco(db))).not.toThrow();
    expect((db.prepare("SELECT name FROM sqlite_master WHERE name = 'carteiras_balao'").get() as { name: string } | undefined)?.name).toBe('carteiras_balao');
  });
});

describe('o balão que uma linha ainda trazia (o L47, que nunca foi publicado) passa para o lugar dele na hora', () => {
  const ID = 'a'.repeat(64);
  const NA_LINHA = {
    saldo: 900,
    itens: [{ skin: 'classico', semente: 3, bolas: 0 }],
    skin: 'classico',
    criadaEm: 1_700_000_000_000,
    jogou: true,
    balao: { itens: ['coroa'], aparencia: { ...APARENCIA_PADRAO, chapeu: 'coroa' } },
  };
  const SEM_BALAO = Object.fromEntries(Object.entries(NA_LINHA).filter(([chave]) => chave !== 'balao'));

  it('no Durable Object: abrir move o balão para carteiras_balao e deixa a linha como a versão anterior a lê', () => {
    const b = banco();
    abrirDO(b);
    b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run(ID, JSON.stringify(NA_LINHA));
    const a = abrirDO(banco(b.db));
    expect(a.ler(ID)!.balao!.aparencia.chapeu).toBe('coroa');
    expect(JSON.parse(linhas(b)[ID]!)).toEqual(SEM_BALAO);
    expect(JSON.parse(baloes(b)[ID]!)).toEqual(NA_LINHA.balao);
    expect(descartadasDe(b)).toBe(0);
    // e a versão anterior abre o banco sem descartar nada
    expect(abrirDOAnterior(banco(b.db)).ler(ID)!.saldo).toBe(900);
    expect(descartadasDe(b)).toBe(0);
  });

  it('na sala Node: abrir cria o carteiras-balao.json e o carteiras.json fica sem a chave', async () => {
    const p = mkdtempSync(join(tmpdir(), 'sala-legado-'));
    try {
      writeFileSync(join(p, 'carteiras.json'), JSON.stringify({ versao: 2, carteiras: { [ID]: NA_LINHA } }));
      const a = new ArmazemDeCarteiras({ pasta: p, maxCarteiras: 100, atrasoMs: 1, relogio: () => RELOGIO, log });
      expect(a.ler(ID)!.balao!.aparencia.chapeu).toBe('coroa');
      await a.fechar();
      expect(JSON.parse(readFileSync(join(p, 'carteiras.json'), 'utf8'))).toEqual({ versao: 2, carteiras: { [ID]: SEM_BALAO } });
      expect(JSON.parse(readFileSync(join(p, 'carteiras-balao.json'), 'utf8'))).toEqual({ versao: 1, baloes: { [ID]: NA_LINHA.balao } });
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  });
});
