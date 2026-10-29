/**
 * As carteiras no SQLite do Durable Object (L41), com `node:sqlite` no lugar de `ctx.storage.sql`: o mesmo núcleo da sala Node,
 * guardado linha a linha na hora, tudo ou nada, voltando inteiro depois de o objeto ser despejado, e a importação do
 * `carteiras.json` da sala Node (o arquivo de verdade, escrito pelo `ArmazemDeCarteiras`).
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTAGEM_ZERADA, SALDO_INICIAL } from '@sinuca/protocolo';
import { ArmazemDeCarteiras } from './carteiras';
import { CarteirasNoDO, type CursorMinimo, type SqlMinimo } from './carteiras-sqlite';

const RELOGIO = Date.parse('2026-11-02T15:00:00Z');

/** `ctx.storage.sql` e `ctx.storage.transactionSync` de mentira, sobre o SQLite do Node. */
function banco(db: DatabaseSync = new DatabaseSync(':memory:')) {
  const estado = { falharNaEscritaN: 0, escritas: 0 };
  const sql: SqlMinimo = {
    exec(consulta, ...ligacoes): CursorMinimo {
      const st = db.prepare(consulta);
      if (st.columns().length > 0) {
        const linhas = st.all(...ligacoes) as Record<string, unknown>[];
        return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
      }
      if (/^\s*(INSERT|DELETE|UPDATE)/i.test(consulta) && estado.falharNaEscritaN > 0 && ++estado.escritas >= estado.falharNaEscritaN) throw new Error('cota de linhas escritas do dia');
      const r = st.run(...ligacoes);
      return { toArray: () => [], rowsRead: 0, rowsWritten: Number(r.changes) };
    },
  };
  const transacao = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  return { db, sql, transacao, estado };
}

type Banco = ReturnType<typeof banco>;

function abrir(b: Banco, extra: Partial<ConstructorParameters<typeof CarteirasNoDO>[0]> = {}) {
  const logs: string[] = [];
  const armazem = new CarteirasNoDO({
    sql: b.sql,
    transacao: b.transacao,
    maxCarteiras: 100,
    relogio: () => RELOGIO,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    ...extra,
  });
  return { armazem, logs };
}

const linhasDe = (b: Banco): { id: string; dados: string }[] => b.db.prepare('SELECT id, dados FROM carteiras').all() as { id: string; dados: string }[];

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('o armazenamento SQLite guarda cada mudança na hora e volta inteiro', () => {
  it('criar, comprar, usar, aplicar com estatísticas e missões: um objeto novo sobre a mesma tabela vê exatamente o mesmo', () => {
    const b = banco();
    const { armazem } = abrir(b);
    const ana = armazem.criar()!;
    const beto = armazem.criar()!;
    expect(linhasDe(b)).toHaveLength(2);

    expect(armazem.comprar(ana.id, 'ebano').ok).toBe(true);
    expect(armazem.usar(ana.id, 'ebano').ok).toBe(true);
    armazem.registrarPartida([ana.id, beto.id]);
    expect(armazem.aplicar([{ id: ana.id, delta: 25 }, { id: beto.id, delta: -25 }], undefined, [{ id: ana.id, modalidade: 'mata-mata', contagem: { ...CONTAGEM_ZERADA, partidas: 1, vitorias: 1, bolas: 4, sequencia: 3 } }])).toBe(true);
    armazem.registrarMissoes(ana.id, {}, undefined, 3);

    const antes = [armazem.ler(ana.id), armazem.ler(beto.id)];
    expect(antes[0]!.skin).toBe('ebano');
    expect(antes[0]!.itens!.find((i) => i.skin === 'ebano')!.bolas).toBe(3);

    // "o objeto foi despejado": outra instância sobre a mesma tabela
    const { armazem: depois } = abrir(b);
    expect([depois.ler(ana.id), depois.ler(beto.id)]).toEqual(antes);
    expect(depois.total).toBe(2);
    // o código é o que abre a carteira, e o que o objeto novo conhece é só o resumo
    expect(depois.resolver(ana.codigo)).toBe(ana.id);
    expect(depois.resolver(beto.codigo)).toBe(beto.id);
  });

  it('não guarda o código em lugar nenhum da tabela nem do log', () => {
    const b = banco();
    const { armazem, logs } = abrir(b);
    const c = armazem.criar()!;
    armazem.comprar(c.id, 'ebano');
    const tudo = JSON.stringify(b.db.prepare('SELECT * FROM carteiras').all()) + JSON.stringify(b.db.prepare('SELECT * FROM carteiras_meta').all()) + logs.join('\n');
    expect(tudo).not.toContain(c.codigo);
    expect(logs.join('\n')).not.toContain(c.id);
  });

  it('tira da tabela a carteira que o teto reaproveita, e só ela', () => {
    const b = banco();
    const { armazem } = abrir(b, { maxCarteiras: 2 });
    const velha = armazem.criar()!;
    const usada = armazem.criar()!;
    armazem.comprar(usada.id, 'ebano');
    const nova = armazem.criar()!;
    expect(nova).not.toBeNull();
    expect(armazem.ler(velha.id)).toBeUndefined();
    expect(linhasDe(b).map((l) => l.id).sort()).toEqual([usada.id, nova.id].sort());
  });

  it('a tabela é WITHOUT ROWID, com uma linha só por carteira, e conta as linhas escritas', () => {
    const b = banco();
    const { armazem } = abrir(b);
    const antes = armazem.contadores.linhasEscritas;
    const c = armazem.criar()!;
    expect(armazem.contadores.linhasEscritas - antes).toBe(1);
    armazem.usar(c.id, 'classico');
    expect(armazem.contadores.linhasEscritas - antes).toBe(2);
    expect((b.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'carteiras'").get() as { sql: string }).sql).toMatch(/WITHOUT ROWID/);
  });
});

describe('tudo ou nada', () => {
  it('a gravação que falha no meio não deixa linha pela metade; a mudança segue na memória e a próxima gravação leva o que ficou', () => {
    const b = banco();
    const { armazem, logs } = abrir(b);
    const ana = armazem.criar()!;
    const beto = armazem.criar()!;
    b.estado.escritas = 0;
    b.estado.falharNaEscritaN = 2; // a segunda escrita da transação cai: a primeira tem de ser desfeita
    expect(armazem.aplicar([{ id: ana.id, delta: 10 }, { id: beto.id, delta: -10 }])).toBe(true);
    expect(armazem.ler(ana.id)!.saldo).toBe(SALDO_INICIAL + 10);
    expect(armazem.pendentes).toBe(2);
    expect(armazem.contadores.gravacoesFalhas).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.startsWith('carteiras-gravacao-falhou'))).toBe(true);
    // na tabela nada mudou: nenhuma das duas, nem a primeira
    const naTabela = (id: string) => (JSON.parse(linhasDe(b).find((l) => l.id === id)!.dados) as { saldo: number }).saldo;
    expect(naTabela(ana.id)).toBe(SALDO_INICIAL);
    expect(naTabela(beto.id)).toBe(SALDO_INICIAL);

    // o disco voltou: a próxima tentativa leva as duas juntas
    b.estado.falharNaEscritaN = 0;
    armazem.tentarPendentes();
    expect(armazem.pendentes).toBe(0);
    expect(naTabela(ana.id)).toBe(SALDO_INICIAL + 10);
    expect(naTabela(beto.id)).toBe(SALDO_INICIAL - 10);
  });

  it('a recusa do `aplicar` (id que não existe) não escreve nada', () => {
    const b = banco();
    const { armazem } = abrir(b);
    const ana = armazem.criar()!;
    const escritas = armazem.contadores.linhasEscritas;
    expect(armazem.aplicar([{ id: ana.id, delta: 10 }, { id: 'f'.repeat(64), delta: 1 }])).toBe(false);
    expect(armazem.contadores.linhasEscritas).toBe(escritas);
    expect(armazem.ler(ana.id)!.saldo).toBe(SALDO_INICIAL);
  });
});

describe('ao abrir', () => {
  it('a linha que não presta vai para carteiras_descartadas com o motivo, sem derrubar as outras nem se perder', () => {
    const b = banco();
    const { armazem } = abrir(b);
    const boa = armazem.criar()!;
    const ruim = 'a'.repeat(64);
    b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run(ruim, '{"saldo":"muito"}');
    b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run('b'.repeat(64), '{quebrado');
    b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run('c'.repeat(64), JSON.stringify({ saldo: 5, skins: ['classico'], skin: 'classico', criadaEm: 1 }));
    const { armazem: depois, logs } = abrir(b);
    expect(depois.total).toBe(1);
    expect(depois.ler(boa.id)).toEqual(armazem.ler(boa.id));
    const descartadas = b.db.prepare('SELECT id, dados, motivo FROM carteiras_descartadas ORDER BY id').all() as { id: string; dados: string; motivo: string }[];
    expect(descartadas.map((d) => [d.id[0], d.motivo])).toEqual([['a', 'forma-invalida'], ['b', 'json-quebrado'], ['c', 'forma-invalida']]);
    expect(descartadas[0]!.dados).toBe('{"saldo":"muito"}');
    expect(linhasDe(b)).toHaveLength(1);
    expect(logs.find((l) => l.startsWith('carteiras-descartadas'))).toContain('"descartadas":3');
  });

  it('um formato guardado que esta versão não conhece não abre, e nada é escrito', () => {
    const b = banco();
    abrir(b);
    b.db.prepare("UPDATE carteiras_meta SET valor = '3' WHERE chave = 'formato'").run();
    expect(() => abrir(b)).toThrow(/formato 3/);
    expect(linhasDe(b)).toHaveLength(0);
  });
});

describe('importar o carteiras.json da sala Node', () => {
  /** Um arquivo de verdade: o `ArmazemDeCarteiras` grava duas carteiras, com compra, presente e estatística. */
  async function arquivoReal(): Promise<{ texto: string; codigos: string[]; estados: unknown[] }> {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-importacao-'));
    pastas.push(pasta);
    const node = new ArmazemDeCarteiras({
      pasta,
      maxCarteiras: 100,
      atrasoMs: 1,
      relogio: () => RELOGIO,
      log: () => {},
      presenteDeTeste: { valor: 500, rotulo: 'skins-cs' },
    });
    const a = node.criar()!;
    const bb = node.criar()!;
    node.comprar(a.id, 'ebano');
    node.usar(a.id, 'ebano');
    node.aplicar([{ id: a.id, delta: 30 }, { id: bb.id, delta: -30 }], undefined, [{ id: a.id, modalidade: 'par-ou-impar', contagem: { ...CONTAGEM_ZERADA, partidas: 1, vitorias: 1, bolas: 7, sequencia: 4, tabeladas: 1 } }]);
    node.registrarMissoes(a.id, {}, undefined, 5);
    const estados = [node.ler(a.id), node.ler(bb.id)];
    await node.fechar();
    return { texto: readFileSync(join(pasta, 'carteiras.json'), 'utf8'), codigos: [a.codigo, bb.codigo], estados };
  }

  it('importa uma vez, com saldo, itens, sementes, presentes, estatísticas e missões idênticos, e os códigos antigos continuam abrindo as carteiras', async () => {
    const { texto, codigos, estados } = await arquivoReal();
    const b = banco();
    const { armazem, logs } = abrir(b, { presenteDeTeste: { valor: 500, rotulo: 'skins-cs' } });
    const r = armazem.importar(texto);
    expect(r).toEqual({ ok: true, importadas: 2, descartadas: 0, migradas: 0, substituidas: 0 });
    const ids = codigos.map((c) => armazem.resolver(c)!);
    expect(ids.every((id) => id !== undefined)).toBe(true);
    expect(ids.map((id) => armazem.ler(id))).toEqual(estados);
    expect(linhasDe(b)).toHaveLength(2);
    // o presente de teste já constava do arquivo: o mesmo rótulo não paga outra vez
    expect(armazem.ler(ids[0]!)!.saldo).toBe(estados.length > 0 ? (estados[0] as { saldo: number }).saldo : -1);
    // e sobrevive a "despejar o objeto"
    const { armazem: depois } = abrir(b);
    expect(ids.map((id) => depois.ler(id))).toEqual(estados);
    // nenhum código nem id no log
    for (const x of [...codigos, ...ids]) expect(logs.join('\n')).not.toContain(x);
    expect(logs.find((l) => l.startsWith('carteiras-importadas'))).toBe('carteiras-importadas {"importadas":2,"descartadas":0,"migradas":0,"substituidas":0}');
  });

  it('recusa se já há carteiras, sem mudar nada, a menos que se peça para sobrescrever (e então o que não estava no arquivo sai)', async () => {
    const { texto } = await arquivoReal();
    const b = banco();
    const { armazem } = abrir(b);
    const intrusa = armazem.criar()!;
    expect(armazem.importar(texto)).toEqual({ ok: false, motivo: 'ja-tem-carteiras', existentes: 1 });
    expect(armazem.total).toBe(1);
    expect(linhasDe(b)).toHaveLength(1);

    expect(armazem.importar(texto, { sobrescrever: true })).toEqual({ ok: true, importadas: 2, descartadas: 0, migradas: 0, substituidas: 1 });
    expect(armazem.total).toBe(2);
    expect(armazem.ler(intrusa.id)).toBeUndefined();
    expect(linhasDe(b)).toHaveLength(2);
    expect(linhasDe(b).some((l) => l.id === intrusa.id)).toBe(false);
  });

  it('o arquivo que não se entende, o que passa do teto e o que tem carteira estragada são recusados inteiros', async () => {
    const { texto } = await arquivoReal();
    const b = banco();
    const { armazem } = abrir(b, { maxCarteiras: 1 });
    expect(armazem.importar('isto não é json')).toEqual({ ok: false, motivo: 'arquivo-invalido' });
    expect(armazem.importar(JSON.stringify({ versao: 9, carteiras: {} }))).toEqual({ ok: false, motivo: 'arquivo-invalido' });
    expect(armazem.importar(texto)).toEqual({ ok: false, motivo: 'cheio', maximo: 1 });

    const dois = abrir(banco()).armazem;
    const estragado = JSON.parse(texto) as { versao: number; carteiras: Record<string, unknown> };
    estragado.carteiras['d'.repeat(64)] = { saldo: 'x' };
    expect(dois.importar(JSON.stringify(estragado))).toEqual({ ok: false, motivo: 'carteiras-invalidas', descartadas: 1 });
    expect(dois.total).toBe(0);
    expect(dois.importar(JSON.stringify(estragado), { aceitarDescartadas: true })).toMatchObject({ ok: true, importadas: 2, descartadas: 1 });
    expect(armazem.total).toBe(0);
    expect(linhasDe(b)).toHaveLength(0);
  });

  it('o arquivo no formato 1 (skins, sem itens) importa e cada skin ganha a sua semente, uma vez só', () => {
    const b = banco();
    let n = 0;
    const { armazem } = abrir(b, { sortearSemente: () => 100 + n++ });
    const id = 'e'.repeat(64);
    const texto = JSON.stringify({ versao: 1, carteiras: { [id]: { saldo: 40, skins: ['classico', 'ebano'], skin: 'ebano', criadaEm: 1 } } });
    expect(armazem.importar(texto)).toEqual({ ok: true, importadas: 1, descartadas: 0, migradas: 1, substituidas: 0 });
    const lida = armazem.ler(id)!;
    expect(lida.itens!.map((i) => i.skin)).toEqual(['classico', 'ebano']);
    expect(lida.itens!.map((i) => i.semente)).toEqual([100, 101]);
    const { armazem: depois } = abrir(b, { sortearSemente: () => 999 });
    expect(depois.ler(id)!.itens!.map((i) => i.semente)).toEqual([100, 101]);
  });

  it('o arquivo real, gravado no disco por quem o importa depois, é lido do mesmo jeito', async () => {
    const { texto } = await arquivoReal();
    const arquivo = join(pastas[0]!, 'copia.json');
    writeFileSync(arquivo, texto);
    const { armazem } = abrir(banco());
    expect(armazem.importar(readFileSync(arquivo, 'utf8')).ok).toBe(true);
  });
});
