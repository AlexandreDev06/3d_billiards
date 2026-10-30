/**
 * A carteira de itens de uma conta da Beco Games (L61) no núcleo: `daConta` impede abrir só pelo código; `garantirDaConta` faz a
 * carteira da conta nascer (só com o Banco ligado); `apagarDasContas` a leva embora sem tocar na caixa; e tudo isso volta inteiro do
 * arquivo (sala Node), do SQLite (Durable Object) e da exportação.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SALDO_INICIAL } from '@sinuca/protocolo';
import { ArmazemDeCarteiras } from './carteiras';
import { CarteirasEmMemoria, type CarteirasBase } from './carteiras-base';
import { CarteirasNoDO, type CursorMinimo, type SqlMinimo } from './carteiras-sqlite';
import type { PresenteDeTeste } from './config-nucleo';
import { bancoDeTeste } from './para-testes-banco';

const RELOGIO = Date.parse('2026-11-02T15:00:00Z');
const ID_NOVO = 'b'.repeat(64);
const PRESENTE: PresenteDeTeste = { valor: 500, rotulo: 'teste-conta' };

function memoria(extra: { comBanco?: boolean; presente?: PresenteDeTeste; max?: number } = {}) {
  const bt = extra.comBanco ? bancoDeTeste() : null;
  const logs: string[] = [];
  const carteiras = new CarteirasEmMemoria({
    maxCarteiras: extra.max ?? 100,
    relogio: () => RELOGIO,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    ...(bt ? { banco: bt.banco } : {}),
    ...(extra.presente ? { presenteDeTeste: extra.presente } : {}),
  });
  return { carteiras, bt, logs };
}

describe('marcarDaConta: o código deixa de abrir a carteira', () => {
  it('marca, não resolve mais pelo código, e guarda itens e saldo', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    expect(carteiras.comprar(c.id, 'ebano').ok).toBe(true);
    const antes = carteiras.ler(c.id);
    expect(carteiras.ehDaConta(c.id)).toBe(false);
    expect(carteiras.marcarDaConta(c.id)).toBe(true);
    expect(carteiras.ehDaConta(c.id)).toBe(true);
    expect(carteiras.resolver(c.codigo)).toBeUndefined();
    expect(carteiras.ler(c.id)).toEqual(antes);
  });

  it('é idempotente; carteira que não existe devolve false', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    expect(carteiras.marcarDaConta(c.id)).toBe(true);
    expect(carteiras.marcarDaConta(c.id)).toBe(true);
    expect(carteiras.marcarDaConta(ID_NOVO)).toBe(false);
  });

  it('vale mesmo congelada (não mexe em saldo)', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    // sem a rota, o congelar da base não persiste mas liga o estado
    expect(carteiras.congelar()).not.toBeNull();
    expect(carteiras.marcarDaConta(c.id)).toBe(true);
    expect(carteiras.ehDaConta(c.id)).toBe(true);
  });

  it('a carteira da conta não é reaproveitada pelo teto', () => {
    const { carteiras } = memoria({ max: 2 });
    const a = carteiras.criar()!;
    const b = carteiras.criar()!;
    carteiras.marcarDaConta(a.id);
    carteiras.marcarDaConta(b.id);
    expect(carteiras.criar()).toBeNull();
    expect(carteiras.total).toBe(2);
  });
});

describe('garantirDaConta: a carteira da conta, pela sessão', () => {
  it('sem o Banco ligado, a conta nova não tem carteira (sem-banco); a que existe segue valendo', () => {
    const { carteiras } = memoria();
    expect(carteiras.garantirDaConta(ID_NOVO)).toEqual({ ok: false, erro: 'sem-banco' });
    expect(carteiras.total).toBe(0);
    const c = carteiras.criar()!;
    expect(carteiras.garantirDaConta(c.id)).toEqual({ ok: true, id: c.id });
    expect(carteiras.ehDaConta(c.id)).toBe(true);
  });

  it('com o Banco, a conta nova nasce na primeira vez, vazia (só o clássico), com o saldo inicial e na caixa', async () => {
    const { carteiras, bt } = memoria({ comBanco: true });
    expect(carteiras.garantirDaConta(ID_NOVO)).toEqual({ ok: true, id: ID_NOVO });
    const e = carteiras.ler(ID_NOVO)!;
    expect(e.skins).toEqual(['classico']);
    expect(e.saldo).toBe(SALDO_INICIAL);
    expect(carteiras.ehDaConta(ID_NOVO)).toBe(true);
    await carteiras.drenarCaixa();
    expect(bt!.chamadas.length).toBeGreaterThan(0);
    // chamar de novo não cria outra
    expect(carteiras.garantirDaConta(ID_NOVO)).toEqual({ ok: true, id: ID_NOVO });
    expect(carteiras.total).toBe(1);
  });

  it('id de forma errada é recusado e nada nasce', () => {
    const { carteiras } = memoria({ comBanco: true });
    expect(carteiras.garantirDaConta('curto').ok).toBe(false);
    expect(carteiras.garantirDaConta('B'.repeat(64)).ok).toBe(false);
    expect(carteiras.total).toBe(0);
  });

  it('congelada não nasce (congelado); cheia não nasce (cheio)', () => {
    const a = memoria({ comBanco: true });
    a.carteiras.congelar();
    expect(a.carteiras.garantirDaConta(ID_NOVO)).toEqual({ ok: false, erro: 'congelado' });
    const b = memoria({ comBanco: true, max: 1 });
    const c = b.carteiras.criar()!;
    b.carteiras.marcarDaConta(c.id);
    expect(b.carteiras.garantirDaConta(ID_NOVO)).toEqual({ ok: false, erro: 'cheio' });
  });

  it('o presente de teste é entregue uma vez só à carteira da conta', () => {
    const { carteiras } = memoria({ comBanco: true, presente: PRESENTE });
    carteiras.garantirDaConta(ID_NOVO);
    const depois1 = carteiras.ler(ID_NOVO)!.saldo;
    expect(depois1).toBe(SALDO_INICIAL + PRESENTE.valor);
    carteiras.garantirDaConta(ID_NOVO);
    expect(carteiras.ler(ID_NOVO)!.saldo).toBe(depois1);
  });
});

describe('apagarDasContas: a exclusão leva a carteira de itens embora e nunca mexe na caixa', () => {
  it('apaga as que existem, conta quantas e é inofensivo repetir', async () => {
    const { carteiras, bt } = memoria({ comBanco: true });
    const c = carteiras.criar()!;
    carteiras.marcarDaConta(c.id);
    carteiras.garantirDaConta(ID_NOVO);
    await carteiras.drenarCaixa();
    const chamadas = bt!.chamadas.length;
    expect(carteiras.apagarDasContas([c.id, ID_NOVO, 'c'.repeat(64)])).toBe(2);
    expect(carteiras.total).toBe(0);
    expect(carteiras.ler(c.id)).toBeUndefined();
    expect(carteiras.apagarDasContas([c.id, ID_NOVO])).toBe(0);
    await carteiras.drenarCaixa();
    expect(bt!.chamadas.length).toBe(chamadas);
  });

  it('avisa quem está olhando (a sala vê o saldo sumir)', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    carteiras.marcarDaConta(c.id);
    const vistos: string[] = [];
    carteiras.aoMudar((id) => vistos.push(id));
    carteiras.apagarDasContas([c.id]);
    expect(vistos).toContain(c.id);
  });
});

describe('o daConta e a exclusão sobrevivem ao disco', () => {
  const pastas: string[] = [];
  const abertos: ArmazemDeCarteiras[] = [];
  afterEach(async () => {
    await Promise.all(abertos.splice(0).map((a) => a.fechar()));
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
  });
  const abrirArquivo = (pasta: string): ArmazemDeCarteiras => {
    const a = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => RELOGIO, log: () => {} });
    abertos.push(a);
    return a;
  };

  it('arquivo da sala Node: marca e apagar voltam; o campo fica fora da linha comum e a versão sobe a 3', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-da-conta-'));
    pastas.push(pasta);
    const a = abrirArquivo(pasta);
    const c1 = a.criar()!;
    const c2 = a.criar()!;
    a.marcarDaConta(c1.id);
    await a.fechar();
    const json = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; carteiras: Record<string, Record<string, unknown>> };
    expect(json.versao).toBe(3);
    expect(Object.keys(json.carteiras[c1.id]!)).not.toContain('daConta');

    const b = abrirArquivo(pasta);
    expect(b.ehDaConta(c1.id)).toBe(true);
    expect(b.ehDaConta(c2.id)).toBe(false);
    expect(b.resolver(c1.codigo)).toBeUndefined();
    expect(b.resolver(c2.codigo)).toBe(c2.id);
    b.apagarDasContas([c1.id]);
    await b.fechar();

    const c = abrirArquivo(pasta);
    expect(c.total).toBe(1);
    expect(c.ehDaConta(c1.id)).toBe(false);
  });

  it('exportar/importar leva o daConta junto', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    carteiras.marcarDaConta(c.id);
    const texto = carteiras.exportar();
    const outra = memoria().carteiras;
    outra.importar(texto);
    expect(outra.ehDaConta(c.id)).toBe(true);
    expect(outra.resolver(c.codigo)).toBeUndefined();
  });
});

describe('o daConta e a exclusão no SQLite do Durable Object', () => {
  function banco(db: DatabaseSync = new DatabaseSync(':memory:')) {
    const sql: SqlMinimo = {
      exec(consulta, ...ligacoes): CursorMinimo {
        const st = db.prepare(consulta);
        if (st.columns().length > 0) {
          const linhas = st.all(...ligacoes) as Record<string, unknown>[];
          return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
        }
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
    return { db, sql, transacao };
  }
  const abrir = (b: ReturnType<typeof banco>): CarteirasBase => new CarteirasNoDO({ sql: b.sql, transacao: b.transacao, maxCarteiras: 100, relogio: () => RELOGIO, log: () => {} });

  it('marcar volta ao reabrir, fica numa tabela à parte, e apagar leva a linha e a marca', () => {
    const b = banco();
    const a = abrir(b);
    const c1 = a.criar()!;
    const c2 = a.criar()!;
    a.marcarDaConta(c1.id);
    expect((b.db.prepare('SELECT id FROM carteiras_da_conta').all() as { id: string }[]).map((l) => l.id)).toEqual([c1.id]);
    // a linha da carteira não ganha campo novo (rollback do código antigo continua lendo)
    const linha = JSON.parse((b.db.prepare('SELECT dados FROM carteiras WHERE id = ?').get(c1.id) as { dados: string }).dados) as Record<string, unknown>;
    expect(Object.keys(linha)).not.toContain('daConta');

    const de_novo = abrir(b);
    expect(de_novo.ehDaConta(c1.id)).toBe(true);
    expect(de_novo.ehDaConta(c2.id)).toBe(false);
    expect(de_novo.resolver(c1.codigo)).toBeUndefined();

    de_novo.apagarDasContas([c1.id]);
    expect(b.db.prepare('SELECT id FROM carteiras_da_conta').all()).toEqual([]);
    expect((b.db.prepare('SELECT id FROM carteiras').all() as { id: string }[]).map((l) => l.id)).toEqual([c2.id]);
    expect(abrir(b).total).toBe(1);
  });
});

describe('o registro dos excluídos (L61b): a conta apagada nunca renasce', () => {
  it('apagarDasContas registra o id, com ou sem carteira, e garantirDaConta nunca o recria', async () => {
    const { carteiras, bt } = memoria({ comBanco: true });
    const c = carteiras.criar()!;
    carteiras.marcarDaConta(c.id);
    expect(carteiras.apagarDasContas([c.id, ID_NOVO])).toBe(1);
    expect(carteiras.ehExcluida(c.id)).toBe(true);
    expect(carteiras.ehExcluida(ID_NOVO)).toBe(true); // nunca teve carteira aqui e mesmo assim consta
    expect(carteiras.totalExcluidas).toBe(2);
    for (const id of [c.id, ID_NOVO]) expect(carteiras.garantirDaConta(id)).toEqual({ ok: false, erro: 'excluida' });
    expect(carteiras.total).toBe(0);
    await carteiras.drenarCaixa();
    expect(bt!.chamadas.filter((x) => x.includes('garantir'))).toHaveLength(1); // só a do `criar` do convidado: a conta excluída não pediu outra ao Banco
  });

  it('uma carteira que a importação trouxe de volta também não vira carteira de conta', () => {
    const { carteiras } = memoria({ comBanco: true });
    const c = carteiras.criar()!;
    const copia = carteiras.exportar();
    carteiras.apagarDasContas([c.id]);
    expect(carteiras.importar(copia, { sobrescrever: true }).ok).toBe(true);
    expect(carteiras.garantirDaConta(c.id)).toEqual({ ok: false, erro: 'excluida' });
  });

  it('o ponto da varredura (`ate`) vai junto, e só id de forma certa entra', () => {
    const { carteiras } = memoria();
    carteiras.apagarDasContas(['torto', ID_NOVO], 4321);
    expect(carteiras.varridasAte).toBe(4321);
    expect(carteiras.totalExcluidas).toBe(1);
  });

  it('volta do arquivo da sala Node (campo `excluidas`, arquivo na versão 3)', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-excluidas-'));
    try {
      const a = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => RELOGIO, log: () => {} });
      const c = a.criar()!;
      a.apagarDasContas([c.id, ID_NOVO]);
      await a.fechar();
      const json = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; excluidas: string[] };
      expect(json.versao).toBe(3);
      expect(json.excluidas).toEqual([c.id, ID_NOVO].sort());
      const b = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => RELOGIO, log: () => {} });
      expect(b.ehExcluida(ID_NOVO)).toBe(true);
      expect(b.garantirDaConta(c.id)).toEqual({ ok: false, erro: 'excluida' });
      await b.fechar();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('o id sem carteira nenhuma persiste sozinho no arquivo, antes de fechar (L61c; o ponto da varredura só o SQLite guarda)', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-excluidas-solta-'));
    try {
      const a = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => RELOGIO, log: () => {} });
      expect(a.apagarDasContas([ID_NOVO], 777)).toBe(0);
      await vi.waitFor(() => expect(existsSync(join(pasta, 'carteiras.json'))).toBe(true));
      const json = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { excluidas: string[]; excluidasAte?: number };
      expect(json.excluidas).toEqual([ID_NOVO]);
      await a.fechar();
      const b = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => RELOGIO, log: () => {} });
      expect(b.ehExcluida(ID_NOVO)).toBe(true);
      await b.fechar();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe('restaurar uma cópia anterior ao L61 com sobrescrever (L61b)', () => {
  it('mantém as marcas daConta e o registro de excluídos que já existem', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    const outra = carteiras.criar()!;
    const copiaAntiga = carteiras.exportar(); // sem nenhuma marca: é o que uma cópia de antes do L61 traz
    expect(JSON.parse(copiaAntiga)).not.toHaveProperty('daConta');
    carteiras.marcarDaConta(c.id);
    carteiras.apagarDasContas([ID_NOVO]);
    expect(carteiras.importar(copiaAntiga, { sobrescrever: true }).ok).toBe(true);
    expect(carteiras.ehDaConta(c.id)).toBe(true);
    expect(carteiras.resolver(c.codigo)).toBeUndefined();
    expect(carteiras.ehDaConta(outra.id)).toBe(false);
    expect(carteiras.ehExcluida(ID_NOVO)).toBe(true);
  });
});

describe('a marca daConta que falhou fica pendente (L61b)', () => {
  it('adiarMarca persiste e tentarMarcasPendentes a põe, também congelada', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    expect(carteiras.adiarMarca(c.id)).toBe(true);
    expect(carteiras.totalMarcasPendentes).toBe(1);
    expect(carteiras.ehDaConta(c.id)).toBe(false);
    expect(carteiras.congelar()).not.toBeNull();
    expect(carteiras.tentarMarcasPendentes()).toBe(1);
    expect(carteiras.ehDaConta(c.id)).toBe(true);
    expect(carteiras.totalMarcasPendentes).toBe(0);
    expect(carteiras.resolver(c.codigo)).toBeUndefined();
  });

  it('a sessão que aparece (garantirDaConta) cumpre a pendência; carteira que não existe deixa de ser pendente; conta excluída não adia', () => {
    const { carteiras } = memoria();
    const c = carteiras.criar()!;
    carteiras.adiarMarca(c.id);
    carteiras.garantirDaConta(c.id);
    expect(carteiras.ehDaConta(c.id)).toBe(true);
    expect(carteiras.totalMarcasPendentes).toBe(0);
    carteiras.adiarMarca(ID_NOVO);
    expect(carteiras.tentarMarcasPendentes()).toBe(0);
    expect(carteiras.totalMarcasPendentes).toBe(0);
    carteiras.apagarDasContas([ID_NOVO]);
    expect(carteiras.adiarMarca(ID_NOVO)).toBe(false);
  });

  it('volta do arquivo da sala Node e do SQLite do Durable Object', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-pendente-'));
    try {
      const a = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => RELOGIO, log: () => {} });
      const c = a.criar()!;
      a.adiarMarca(c.id);
      await a.fechar();
      const b = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => RELOGIO, log: () => {} });
      expect(b.totalMarcasPendentes).toBe(1);
      expect(b.tentarMarcasPendentes()).toBe(1);
      expect(b.ehDaConta(c.id)).toBe(true);
      await b.fechar();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
    const db = new DatabaseSync(':memory:');
    const sql: SqlMinimo = {
      exec(consulta, ...ligacoes): CursorMinimo {
        const st = db.prepare(consulta);
        if (st.columns().length > 0) {
          const linhas = st.all(...ligacoes) as Record<string, unknown>[];
          return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
        }
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
    const abrir = (): CarteirasBase => new CarteirasNoDO({ sql, transacao, maxCarteiras: 100, relogio: () => RELOGIO, log: () => {} });
    const s = abrir();
    const d = s.criar()!;
    s.adiarMarca(d.id);
    expect((db.prepare('SELECT id FROM marcas_pendentes').all() as { id: string }[]).map((l) => l.id)).toEqual([d.id]);
    const t = abrir();
    expect(t.totalMarcasPendentes).toBe(1);
    t.tentarMarcasPendentes();
    expect(db.prepare('SELECT id FROM marcas_pendentes').all()).toEqual([]);
    expect((db.prepare('SELECT id FROM carteiras_da_conta').all() as { id: string }[]).map((l) => l.id)).toEqual([d.id]);
  });
});

describe('o registro dos excluídos no SQLite do Durable Object (L61b)', () => {
  function montar() {
    const db = new DatabaseSync(':memory:');
    const falhar = { quando: null as string | null };
    const sql: SqlMinimo = {
      exec(consulta, ...ligacoes): CursorMinimo {
        if (falhar.quando !== null && consulta.includes(falhar.quando)) throw new Error('disco cheio');
        const st = db.prepare(consulta);
        if (st.columns().length > 0) {
          const linhas = st.all(...ligacoes) as Record<string, unknown>[];
          return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
        }
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
    const abrir = (): CarteirasNoDO => new CarteirasNoDO({ sql, transacao, maxCarteiras: 100, relogio: () => RELOGIO, log: () => {} });
    return { db, falhar, abrir };
  }

  it('o registro, a carteira apagada e o ponto da varredura vão na mesma transação e voltam ao reabrir', () => {
    const { db, abrir } = montar();
    const a = abrir();
    const c = a.criar()!;
    a.marcarDaConta(c.id);
    a.apagarDasContas([c.id, ID_NOVO], 999);
    expect((db.prepare('SELECT id FROM contas_excluidas ORDER BY id').all() as { id: string }[]).map((l) => l.id)).toEqual([c.id, ID_NOVO].sort());
    expect(db.prepare('SELECT id FROM carteiras').all()).toEqual([]);
    expect((db.prepare("SELECT valor FROM carteiras_meta WHERE chave = 'excluidas_ate'").get() as { valor: string }).valor).toBe('999');
    const b = abrir();
    expect(b.ehExcluida(ID_NOVO)).toBe(true);
    expect(b.varridasAte).toBe(999);
    expect(b.garantirDaConta(c.id)).toEqual({ ok: false, erro: 'excluida' });
  });

  it('o id sem carteira nenhuma persiste sozinho e volta ao reabrir, com o ponto da varredura (L61c)', () => {
    const { db, abrir } = montar();
    const a = abrir();
    expect(a.apagarDasContas([ID_NOVO], 555)).toBe(0);
    expect((db.prepare('SELECT id FROM contas_excluidas').all() as { id: string }[]).map((l) => l.id)).toEqual([ID_NOVO]);
    expect((db.prepare("SELECT valor FROM carteiras_meta WHERE chave = 'excluidas_ate'").get() as { valor: string }).valor).toBe('555');
    const b = abrir();
    expect(b.ehExcluida(ID_NOVO)).toBe(true);
    expect(b.varridasAte).toBe(555);
  });

  it('se a gravação do registro falha, a carteira não é apagada no disco sem ele; a próxima tentativa leva tudo', () => {
    const { db, falhar, abrir } = montar();
    const a = abrir();
    const c = a.criar()!;
    falhar.quando = 'contas_excluidas';
    a.apagarDasContas([c.id], 5);
    expect(db.prepare('SELECT id FROM carteiras').all()).toHaveLength(1); // tudo ou nada: a carteira continua na tabela
    expect(db.prepare('SELECT id FROM contas_excluidas').all()).toEqual([]);
    expect(a.pendentes).toBeGreaterThan(0);
    falhar.quando = null;
    a.tentarPendentes();
    expect(a.pendentes).toBe(0);
    expect(db.prepare('SELECT id FROM carteiras').all()).toEqual([]);
    expect(db.prepare('SELECT id FROM contas_excluidas').all()).toHaveLength(1);
  });
});
