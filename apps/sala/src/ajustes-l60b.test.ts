/**
 * Os ajustes da revisão do Juiz no L57, L59 e L60 (L60b), no Banco e nas carteiras, sem o workerd: o congelamento da migração, a compra
 * que segura a conta na caixa e não usa a resposta velha, o `reler` que descarta a operação em voo, a operação envenenada que vai para
 * `saida_morta`, as apostas abertas que voltam ao acordar, a carteira com compra em aberto que não é reaproveitada e o prazo do RPC da
 * compra. O Banco é o de verdade (o `Moedas` do apps/conta sobre `node:sqlite`, via `para-testes-banco.ts`).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SALDO_INICIAL, diaDaMissao, missoesDoDia, precoDaSkinNoDia, premioDaMissao } from '@sinuca/protocolo';
import { criarHttpDaCarteira, type PedidoDaCarteira } from './carteira-http';
import { ArmazemDeCarteiras } from './carteiras';
import { CarteirasEmMemoria, DURACAO_DO_CONGELAMENTO_MS, VERSAO_DO_ARQUIVO_COM_SAIDA, type CarteirasBase } from './carteiras-base';
import { CarteirasNoDO } from './carteiras-sqlite';
import { GOLPES_ATE_MORRER } from './caixa-do-banco';
import { CONFIG_SALA_PADRAO } from './config';
import { bancoDeTeste, type BancoDeTeste } from './para-testes-banco';
import { banco as bancoSqlite } from './para-testes-sqlite';

const T0 = 1_800_000_000_000;
const SKIN = 'ebano' as const;
const precoDaSkin = (agora: number): number => precoDaSkinNoDia(SKIN, diaDaMissao(agora));
const espera = (ms = 10): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Mundo {
  readonly bt: BancoDeTeste;
  readonly carteiras: CarteirasBase;
  readonly agora: { valor: number };
  readonly logs: string[];
  pronta(): Promise<{ codigo: string; id: string }>;
}

function memoria(maxCarteiras = 100): Mundo {
  const agora = { valor: T0 };
  const bt = bancoDeTeste(() => agora.valor);
  const logs: string[] = [];
  const carteiras = new CarteirasEmMemoria({ maxCarteiras, relogio: () => agora.valor, log: (e, c = {}) => logs.push(`${e} ${JSON.stringify(c)}`), banco: bt.banco });
  return {
    bt,
    carteiras,
    agora,
    logs,
    pronta: async () => {
      const c = carteiras.criar()!;
      await carteiras.drenarCaixa();
      return c;
    },
  };
}

/** Segura a resposta do `debitar` depois de o Banco aplicá-lo: o teste decide quando ela chega. */
function segurarODebito(bt: BancoDeTeste): { solta(): void; aplicado(): Promise<void> } {
  let solta!: () => void;
  const porta = new Promise<void>((r) => (solta = r));
  let aplicou!: () => void;
  const foiAplicado = new Promise<void>((r) => (aplicou = r));
  const real = bt.banco.debitar;
  (bt.banco as { debitar: typeof real }).debitar = async (...a) => {
    const r = await real(...a);
    aplicou();
    await porta;
    return r;
  };
  return { solta, aplicado: () => foiAplicado };
}

const premioDoDia = (agora: number) => missoesDoDia(diaDaMissao(agora))[0]!;

describe('a compra e a caixa não contam a mesma operação duas vezes (L60b, médio 1)', () => {
  it('um crédito da conta durante o débito espera a compra acabar: o Banco só o vê depois, e o espelho fecha no Banco', async () => {
    const m = memoria();
    const c = await m.pronta();
    const preco = precoDaSkin(T0);
    const debito = segurarODebito(m.bt);
    const compra = m.carteiras.comprarSkin(c.id, SKIN);
    await debito.aplicado();
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - preco); // o Banco já debitou, a resposta ainda não chegou

    const missao = premioDoDia(T0);
    expect(m.carteiras.registrarMissoes(c.id, { [missao.id]: missao.meta })?.cumpridas).toEqual([missao.id]);
    await espera();
    // a conta tem compra em voo: o crédito fica na caixa, o Banco não o recebeu
    expect(m.carteiras.pendentesNaCaixa).toBe(1);
    expect(m.bt.chamadas.filter((n) => n === 'creditar')).toEqual([]);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - preco);

    debito.solta();
    expect((await compra).ok).toBe(true);
    await m.carteiras.drenarCaixa();
    await espera();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    const esperado = SALDO_INICIAL - preco + premioDaMissao(missao.id);
    expect(m.bt.saldo(c.id)).toBe(esperado);
    expect(m.carteiras.ler(c.id)!.saldo).toBe(esperado);
  });

  it('as outras contas seguem enquanto uma tem compra em voo', async () => {
    const m = memoria();
    const a = await m.pronta();
    const debito = segurarODebito(m.bt);
    const compra = m.carteiras.comprarSkin(a.id, SKIN);
    await debito.aplicado();
    const b = m.carteiras.criar()!; // a conta de b nasce na caixa e vai ao Banco mesmo com a compra de a em voo
    await espera();
    expect(m.bt.saldo(b.id)).toBe(SALDO_INICIAL);
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    debito.solta();
    await compra;
  });

  it('escrita concorrente na conta durante o débito: o saldo da resposta não vale, e o espelho é relido assim que a fila da conta esvazia', async () => {
    const m = memoria();
    const c = await m.pronta();
    const preco = precoDaSkin(T0);
    const debito = segurarODebito(m.bt);
    const compra = m.carteiras.comprarSkin(c.id, SKIN);
    await debito.aplicado();
    // outro jogo credita a mesma conta no Banco e, em paralelo, o espelho é trocado por fora (versão do espelho muda)
    m.bt.local.moedas.creditar(c.id, 20, 'outro-jogo:premio', { jogo: 'outro', motivo: 'teste' });
    m.carteiras.trocarEspelhos(new Map([[c.id, 777]]));
    debito.solta();
    expect((await compra).ok).toBe(true);
    await espera();
    // a resposta do débito dizia SALDO_INICIAL - preco; o Banco tem 20 a mais, e é isso que o espelho mostra
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - preco + 20);
    expect(m.carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL - preco + 20);
  });

  it('sem escrita concorrente o saldo da resposta é o do espelho, e nada é relido', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.leituras.length = 0;
    expect((await m.carteiras.comprarSkin(c.id, SKIN)).ok).toBe(true);
    await espera();
    expect(m.bt.leituras).toEqual([]);
    expect(m.carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL - precoDaSkin(T0));
  });
});

describe('o reler descarta a leitura quando a caixa ainda tem operação da conta (L60b, médio 3)', () => {
  it('a resposta da caixa fica presa: o Banco já aplicou a operação, o reler a vê e não a conta duas vezes', async () => {
    const m = memoria();
    const c = await m.pronta();
    let solta!: () => void;
    const porta = new Promise<void>((r) => (solta = r));
    const real = m.bt.banco.creditar;
    (m.bt.banco as { creditar: typeof real }).creditar = async (...a) => {
      const r = await real(...a); // o Banco aplica...
      await porta; // ...e a resposta demora
      return r;
    };
    const missao = premioDoDia(T0);
    m.carteiras.registrarMissoes(c.id, { [missao.id]: missao.meta });
    const premio = premioDaMissao(missao.id);
    await espera();
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL + premio); // aplicada no Banco
    expect(m.carteiras.pendentesNaCaixa).toBe(1); // e ainda em voo na caixa
    expect(m.carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL + premio);

    // sem o descarte, o reler somaria o prêmio de novo (Banco + o que "ainda espera na caixa")
    expect(await m.carteiras.reler(c.id)).toBe(false);
    expect(m.carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL + premio);
    solta();
    await m.carteiras.drenarCaixa();
    expect(m.carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL + premio);
  });
});

describe('a operação envenenada (L60b, médio 2)', () => {
  /** Um Banco vivo cujo `creditar` sempre lança (a operação é que está torta). */
  function envenenado(): Mundo {
    const m = memoria();
    (m.bt.banco as { creditar: BancoDeTeste['banco']['creditar'] }).creditar = async () => {
      throw new Error('operação torta');
    };
    return m;
  }

  async function atéMorrer(m: Mundo): Promise<void> {
    for (let i = 0; i < GOLPES_ATE_MORRER; i++) {
      m.agora.valor += 300_000;
      await m.carteiras.drenarCaixa();
    }
  }

  it('sai da fila depois de 5 golpes, vai para as mortas com o log banco-envenenada, e as de trás passam', async () => {
    const m = envenenado();
    const c = await m.pronta();
    const missao = premioDoDia(T0);
    m.carteiras.registrarMissoes(c.id, { [missao.id]: missao.meta }); // o creditar que nunca passa
    const b = m.carteiras.criar()!; // o garantir de trás
    await m.carteiras.drenarCaixa();
    expect(m.carteiras.pendentesNaCaixa).toBe(2);
    await atéMorrer(m);
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect(m.carteiras.mortasNaCaixa).toBe(1);
    expect(m.bt.saldo(b.id)).toBe(SALDO_INICIAL); // a de trás passou
    const envenenada = m.logs.filter((l) => l.startsWith('banco-envenenada '));
    expect(envenenada).toHaveLength(1);
    expect(envenenada[0]).toContain('"tipo":"creditar"');
    expect(envenenada[0]).toContain('operação torta');
    expect(m.logs.join('\n')).not.toContain(c.id);
    expect(m.logs.filter((l) => l.startsWith('banco-golpe '))).toHaveLength(GOLPES_ATE_MORRER - 1);
  });

  it('com o Banco fora do ar a entrada espera e nunca morre', async () => {
    const m = memoria();
    await m.pronta();
    m.bt.fora = true;
    m.carteiras.criar();
    for (let i = 0; i < GOLPES_ATE_MORRER * 2; i++) {
      m.agora.valor += 300_000;
      await m.carteiras.drenarCaixa();
    }
    expect(m.carteiras.mortasNaCaixa).toBe(0);
    expect(m.carteiras.pendentesNaCaixa).toBe(1);
  });

  it('reenviarMortas põe todas de volta no fim da caixa; com o Banco curado elas passam', async () => {
    const m = envenenado();
    const c = await m.pronta();
    const missao = premioDoDia(T0);
    m.carteiras.registrarMissoes(c.id, { [missao.id]: missao.meta });
    await atéMorrer(m);
    expect(m.carteiras.mortasNaCaixa).toBe(1);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL);
    (m.bt.banco as { creditar: BancoDeTeste['banco']['creditar'] }).creditar = m.bt.local.banco.creditar;
    expect(m.carteiras.reenviarMortas()).toBe(1);
    expect(m.carteiras.mortasNaCaixa).toBe(0);
    expect(m.carteiras.pendentesNaCaixa).toBe(1);
    await m.carteiras.drenarCaixa();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL + premioDaMissao(missao.id));
    expect(m.carteiras.reenviarMortas()).toBe(0);
  });

  it('Durable Object: saida_morta é persistida na mesma transação em que a linha sai de saida_do_banco, e o objeto novo a encontra', async () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    (bt.banco as { creditar: BancoDeTeste['banco']['creditar'] }).creditar = async () => {
      throw new Error('operação torta');
    };
    const sqlite = bancoSqlite();
    const abrir = () => new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
    const antes = abrir();
    const c = antes.criar()!;
    await antes.drenarCaixa();
    const missao = premioDoDia(T0);
    antes.registrarMissoes(c.id, { [missao.id]: missao.meta });
    for (let i = 0; i < GOLPES_ATE_MORRER; i++) {
      agora.valor += 300_000;
      await antes.drenarCaixa();
    }
    expect(antes.mortasNaCaixa).toBe(1);
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM saida_do_banco').get()).toEqual({ n: 0 });
    const linha = sqlite.db.prepare('SELECT ordem, op, erro FROM saida_morta').get() as { ordem: number; op: string; erro: string };
    expect(JSON.parse(linha.op)).toMatchObject({ tipo: 'creditar', id: c.id });
    expect(linha.erro).toBe('operação torta');
    expect(antes.pendentes).toBe(0);

    const depois = abrir(); // o objeto foi despejado e acordou
    expect(depois.mortasNaCaixa).toBe(1);
    expect(depois.pendentesNaCaixa).toBe(0);
    (bt.banco as { creditar: BancoDeTeste['banco']['creditar'] }).creditar = bt.local.banco.creditar;
    expect(depois.reenviarMortas()).toBe(1);
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM saida_morta').get()).toEqual({ n: 0 });
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM saida_do_banco').get()).toEqual({ n: 1 });
    await depois.drenarCaixa();
    expect(bt.saldo(c.id)).toBe(SALDO_INICIAL + premioDaMissao(missao.id));
  });

  it('sala Node: o carteiras.json é a versão 3 com o campo mortas, e o armazém novo as lê', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-mortas-'));
    try {
      const agora = { valor: T0 };
      const bt = bancoDeTeste(() => agora.valor);
      (bt.banco as { creditar: BancoDeTeste['banco']['creditar'] }).creditar = async () => {
        throw new Error('operação torta');
      };
      const abrir = () => new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
      const a = abrir();
      const c = a.criar()!;
      await a.drenarCaixa();
      const missao = premioDoDia(T0);
      a.registrarMissoes(c.id, { [missao.id]: missao.meta });
      for (let i = 0; i < GOLPES_ATE_MORRER; i++) {
        agora.valor += 300_000;
        await a.drenarCaixa();
      }
      expect(a.mortasNaCaixa).toBe(1);
      await a.fechar();
      const arquivo = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; saida?: unknown; mortas?: { op: { tipo: string }; erro: string }[] };
      expect(arquivo.versao).toBe(VERSAO_DO_ARQUIVO_COM_SAIDA);
      expect(arquivo.saida).toBeUndefined();
      expect(arquivo.mortas).toHaveLength(1);
      expect(arquivo.mortas![0]).toMatchObject({ op: { tipo: 'creditar' }, erro: 'operação torta' });
      const b = abrir();
      expect(b.mortasNaCaixa).toBe(1);
      expect(b.pendentesNaCaixa).toBe(0);
      await b.fechar();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe('as apostas abertas voltam ao acordar (L60b, médio 5)', () => {
  const CHAVE = 'sinuca:aposta:abcde:1800000000000:123';

  it('Durable Object: a chave é gravada junto com o reservar; recarregar o armazém com a aposta aberta devolve a reserva e limpa a tabela', async () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const abrir = () => new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
    const antes = abrir();
    const a = antes.criar()!;
    const b = antes.criar()!;
    await antes.drenarCaixa();
    const marca = sqlite.comandos.length;
    antes.reservarAposta(CHAVE, [{ id: a.id, valor: 40 }, { id: b.id, valor: 40 }]);
    // a mesma gravação leva a operação da caixa e a chave da aposta aberta
    const escritas = sqlite.comandos.slice(marca).filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q));
    expect(escritas.filter((q) => /saida_do_banco/.test(q))).toHaveLength(1);
    expect(escritas.filter((q) => /apostas_abertas/.test(q))).toHaveLength(1);
    expect(sqlite.db.prepare('SELECT chave FROM apostas_abertas').all()).toEqual([{ chave: CHAVE }]);
    await antes.drenarCaixa();
    expect(bt.reservado(a.id)).toBe(40);

    // o objeto reiniciou no meio da aposta: as salas da memória sumiram
    const depois = abrir();
    expect(depois.pendentesNaCaixa).toBe(1);
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM apostas_abertas').get()).toEqual({ n: 0 });
    await depois.drenarCaixa();
    expect(bt.reservado(a.id)).toBe(0);
    expect(bt.reservado(b.id)).toBe(0);
    expect(abrir().pendentesNaCaixa).toBe(0); // e não devolve de novo no próximo acordar
  });

  it('o fim normal (liquidar) e a anulação (devolver) tiram a chave da tabela', async () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const armazem = new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
    const a = armazem.criar()!;
    const b = armazem.criar()!;
    await armazem.drenarCaixa();
    const abertas = (): string[] => (sqlite.db.prepare('SELECT chave FROM apostas_abertas').all() as { chave: string }[]).map((l) => l.chave);

    armazem.reservarAposta(CHAVE, [{ id: a.id, valor: 40 }, { id: b.id, valor: 40 }]);
    expect(abertas()).toEqual([CHAVE]);
    expect(armazem.aplicar([{ id: a.id, delta: 40 }, { id: b.id, delta: -40 }], undefined, [], CHAVE)).toBe(true);
    expect(abertas()).toEqual([]);

    const outra = 'sinuca:aposta:fghij:1800000000001:456';
    armazem.reservarAposta(outra, [{ id: a.id, valor: 10 }, { id: b.id, valor: 10 }]);
    expect(abertas()).toEqual([outra]);
    armazem.devolverAposta(outra);
    expect(abertas()).toEqual([]);
    await armazem.drenarCaixa();
    expect(bt.reservado(a.id)).toBe(0);
  });

  it('sala Node: o carteiras.json leva o campo apostas e o armazém novo devolve a reserva', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-apostas-'));
    try {
      const agora = { valor: T0 };
      const bt = bancoDeTeste(() => agora.valor);
      const abrir = () => new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
      const a = abrir();
      const c = a.criar()!;
      await a.drenarCaixa();
      bt.chamadas.length = 0;
      // o Banco fora do ar: a reserva fica na caixa e o processo cai
      bt.fora = true;
      a.reservarAposta(CHAVE, [{ id: c.id, valor: 30 }]);
      await a.fechar();
      const arquivo = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; apostas?: string[]; saida?: unknown[] };
      expect(arquivo.versao).toBe(VERSAO_DO_ARQUIVO_COM_SAIDA);
      expect(arquivo.apostas).toEqual([CHAVE]);
      expect(arquivo.saida).toHaveLength(1);

      bt.fora = false;
      const b = abrir();
      expect(b.pendentesNaCaixa).toBe(2); // o reservar de antes e o devolver do acordar, nessa ordem
      await b.drenarCaixa();
      expect(bt.chamadas).toEqual(['reservar', 'devolver']);
      expect(bt.reservado(c.id)).toBe(0);
      await b.fechar();
      const depois = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; apostas?: unknown };
      expect(depois.versao).toBe(2);
      expect(depois.apostas).toBeUndefined();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe('a carteira com compra em aberto não é reaproveitada no teto (L60b, baixo 5)', () => {
  it('compra em voo', async () => {
    const m = memoria(1);
    const c = await m.pronta(); // a única carteira, nunca usada: candidata ao reaproveitamento
    const debito = segurarODebito(m.bt);
    const compra = m.carteiras.comprarSkin(c.id, SKIN);
    await debito.aplicado();
    expect(m.carteiras.criar()).toBeNull(); // sem lugar: a do débito em voo não é apagada
    expect(m.carteiras.ler(c.id)).toBeDefined();
    debito.solta();
    expect((await compra).ok).toBe(true);
    expect(m.carteiras.ler(c.id)!.skins).toContain(SKIN);
  });

  it('compra pendente (o débito não chegou a ser confirmado)', async () => {
    const m = memoria(1);
    const c = await m.pronta();
    m.bt.cair(1, { depois: true });
    expect(await m.carteiras.comprarSkin(c.id, SKIN)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(m.carteiras.comprasPendentes).toBe(1);
    expect(m.carteiras.criar()).toBeNull();
    await m.carteiras.drenarCaixa(); // a reconciliação dá o item
    expect(m.carteiras.ler(c.id)!.skins).toContain(SKIN);
  });

  it('sem compra em aberto a nunca usada continua cedendo o lugar', async () => {
    const m = memoria(1);
    const c = await m.pronta();
    expect(m.carteiras.criar()).not.toBeNull();
    expect(m.carteiras.ler(c.id)).toBeUndefined();
  });
});

describe('o RPC da compra tem prazo de 15 s (L60b, baixo 7)', () => {
  afterEach(() => vi.useRealTimers());

  it('vencido, a chave sai de comprasEmVoo e fica só a pendência, que a reconciliação resolve com a lápide', async () => {
    vi.useFakeTimers();
    const m = memoria();
    const c = await m.pronta();
    let solta!: () => void;
    const porta = new Promise<void>((r) => (solta = r));
    const real = m.bt.banco.debitar;
    (m.bt.banco as { debitar: typeof real }).debitar = async (...a) => {
      await porta; // o RPC nunca responde a tempo
      return real(...a);
    };
    const compra = m.carteiras.comprarSkin(c.id, SKIN);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await compra).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(m.carteiras.comprasPendentes).toBe(1);

    // a chave não está mais em voo: a reconciliação pergunta ao Banco (lápide) em vez de esperar para sempre
    m.bt.leituras.length = 0;
    await m.carteiras.reconciliarCompras();
    expect(m.bt.leituras).toContain('anularSeNaoFeita');
    expect(m.carteiras.comprasPendentes).toBe(0);
    expect(m.carteiras.ler(c.id)!.skins).not.toContain(SKIN);

    // o débito atrasado, que enfim chega, é recusado pela lápide: nada cobrado
    solta();
    await vi.advanceTimersByTimeAsync(10);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL);
  });
});

describe('linha inválida no armazenamento conta como caixa cheia (L60b, baixo 3)', () => {
  it('Durable Object: linha torta em saida_do_banco e em compras_pendentes fica onde está, vai ao log e soma em linhasInvalidas', () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const logs: string[] = [];
    const abrir = () => new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: (e, c = {}) => logs.push(`${e} ${JSON.stringify(c)}`), banco: bt.banco });
    expect(abrir().linhasInvalidas).toBe(0);
    sqlite.db.prepare("INSERT INTO saida_do_banco (ordem, op, tentativas, criada_em) VALUES (7, '{nao e json', 0, 1)").run();
    sqlite.db.prepare("INSERT INTO compras_pendentes (chave, id, tipo, item, preco, criada_em) VALUES ('x', 'curto', 'skin', 'ebano', 5, 1)").run();
    logs.length = 0;
    const depois = abrir();
    expect(depois.linhasInvalidas).toBe(2);
    expect(depois.pendentesNaCaixa).toBe(0);
    expect(logs.some((l) => l.startsWith('saida-invalida '))).toBe(true);
    expect(logs.some((l) => l.startsWith('compras-pendentes-invalidas '))).toBe(true);
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM saida_do_banco').get()).toEqual({ n: 1 }); // nem enviada, nem apagada
  });
});

describe('o congelamento das carteiras para a migração do saldo (L60b, alto 1)', () => {
  function livre(opcoes: { banco?: boolean; presente?: boolean } = {}) {
    const agora = { valor: T0 };
    const logs: string[] = [];
    const bt = bancoDeTeste(() => agora.valor);
    const carteiras = new CarteirasEmMemoria({
      maxCarteiras: 10,
      relogio: () => agora.valor,
      log: (e, c = {}) => logs.push(`${e} ${JSON.stringify(c)}`),
      ...(opcoes.banco === true ? { banco: bt.banco } : {}),
      ...(opcoes.presente === true ? { presenteDeTeste: { valor: 500, rotulo: 'teste' } } : {}),
    });
    return { agora, logs, bt, carteiras };
  }

  it('congelada, nenhuma escrita passa (criar, comprar, usar, balão, missão, aposta, presente) e o espelho não muda', () => {
    const { carteiras, agora } = livre({ presente: true });
    const c = carteiras.criar()!;
    const antes = JSON.stringify(carteiras.espelhos());
    const estado = JSON.stringify(carteiras.ler(c.id));
    expect(carteiras.congelar()).toBe(agora.valor + DURACAO_DO_CONGELAMENTO_MS);
    expect(carteiras.congelada).toBe(true);

    expect(carteiras.criar()).toBeNull();
    expect(carteiras.comprar(c.id, SKIN)).toEqual({ ok: false, erro: 'congelado' });
    expect(carteiras.usar(c.id, 'classico')).toEqual({ ok: false, erro: 'congelado' });
    expect(carteiras.comprarItemDoBalao(c.id, 'bigode_fino')).toEqual({ ok: false, erro: 'congelado' });
    expect(carteiras.equiparAparencia(c.id, {})).toEqual({ ok: false, erro: 'congelado' });
    const missao = premioDoDia(agora.valor);
    expect(carteiras.registrarMissoes(c.id, { [missao.id]: missao.meta })).toBeNull();
    expect(carteiras.aplicar([{ id: c.id, delta: 5 }])).toBe(false);
    expect(carteiras.total).toBe(1);
    expect(JSON.stringify(carteiras.espelhos())).toBe(antes);
    expect(JSON.stringify(carteiras.ler(c.id))).toBe(estado);
  });

  it('o presente de teste não é dado durante o congelamento; vale depois', () => {
    const { carteiras, agora } = livre({ presente: true });
    carteiras.congelar();
    // a carteira nasceu antes: simula uma que ainda não recebeu o rótulo
    carteiras.descongelar();
    const c = carteiras.criar()!;
    expect(carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL + 500);
    const outra = livre({ presente: true });
    outra.carteiras.congelar();
    expect(outra.carteiras.criar()).toBeNull();
    outra.agora.valor += DURACAO_DO_CONGELAMENTO_MS;
    expect(outra.carteiras.criar()).not.toBeNull();
    expect(agora.valor).toBe(T0);
  });

  it('vence sozinho em 15 minutos, ou por descongelar; descongelar diz se estava ligado', () => {
    const { carteiras, agora } = livre();
    const c = carteiras.criar()!;
    expect(carteiras.descongelar()).toBe(false);
    carteiras.congelar();
    agora.valor += DURACAO_DO_CONGELAMENTO_MS - 1;
    expect(carteiras.usar(c.id, 'classico')).toEqual({ ok: false, erro: 'congelado' });
    expect(carteiras.congeladaAteMs).toBe(T0 + DURACAO_DO_CONGELAMENTO_MS);
    agora.valor += 1;
    expect(carteiras.congelada).toBe(false);
    expect(carteiras.congeladaAteMs).toBeNull();
    expect(carteiras.usar(c.id, 'classico').ok).toBe(true);
    carteiras.congelar();
    expect(carteiras.descongelar()).toBe(true);
    expect(carteiras.usar(c.id, 'classico').ok).toBe(true);
  });

  it('com o Banco ligado a compra e a criação também são recusadas, nada vai ao Banco, e o reler não mexe no espelho', async () => {
    const { carteiras, bt } = livre({ banco: true });
    const c = carteiras.criar()!;
    await carteiras.drenarCaixa();
    bt.chamadas.length = 0;
    bt.leituras.length = 0;
    carteiras.congelar();
    expect(await carteiras.comprarSkin(c.id, SKIN)).toEqual({ ok: false, erro: 'congelado' });
    expect(await carteiras.comprarItemDoBalaoNoBanco(c.id, 'bigode_fino')).toEqual({ ok: false, erro: 'congelado' });
    expect(carteiras.criar()).toBeNull();
    bt.local.moedas.creditar(c.id, 25, 'outro-jogo:premio', { jogo: 'outro', motivo: 'teste' });
    expect(await carteiras.reler(c.id)).toBe(false);
    expect(carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL);
    expect(bt.chamadas).toEqual([]);
    expect(bt.leituras).toEqual([]);
    expect(carteiras.comprasPendentes).toBe(0);
  });

  it('a reserva da aposta não sobe durante o congelamento; devolver segue valendo (só solta uma reserva)', async () => {
    const { carteiras, bt } = livre({ banco: true });
    const c = carteiras.criar()!;
    await carteiras.drenarCaixa();
    carteiras.congelar();
    carteiras.reservarAposta('sinuca:aposta:x:1:2', [{ id: c.id, valor: 10 }]);
    expect(carteiras.pendentesNaCaixa).toBe(0);
    carteiras.devolverAposta('sinuca:aposta:x:1:2');
    expect(carteiras.pendentesNaCaixa).toBe(1);
    await carteiras.drenarCaixa();
    expect(bt.reservado(c.id)).toBe(0);
  });

  it('Durable Object: o congelamento é gravado em carteiras_meta e o objeto novo (a publicação) o encontra; descongelar o apaga', () => {
    const agora = { valor: T0 };
    const sqlite = bancoSqlite();
    const abrir = () => new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 10, relogio: () => agora.valor, log: () => {} });
    const antes = abrir();
    const c = antes.criar()!;
    const ate = antes.congelar()!;
    expect(sqlite.db.prepare("SELECT valor FROM carteiras_meta WHERE chave = 'congelada_ate'").get()).toEqual({ valor: String(ate) });

    const depois = abrir();
    expect(depois.congelada).toBe(true);
    expect(depois.criar()).toBeNull();
    expect(depois.usar(c.id, 'classico')).toEqual({ ok: false, erro: 'congelado' });
    agora.valor += DURACAO_DO_CONGELAMENTO_MS;
    expect(abrir().congelada).toBe(false); // vencido, mesmo com a linha ainda lá
    agora.valor = T0;
    expect(depois.descongelar()).toBe(true);
    expect(sqlite.db.prepare("SELECT COUNT(*) AS n FROM carteiras_meta WHERE chave = 'congelada_ate'").get()).toEqual({ n: 0 });
    expect(abrir().congelada).toBe(false);
  });

  it('Durable Object: gravação que falha não congela (a rota responde erro)', () => {
    const agora = { valor: T0 };
    const sqlite = bancoSqlite();
    const armazem = new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 10, relogio: () => agora.valor, log: () => {} });
    sqlite.falharQuando = /carteiras_meta/;
    expect(armazem.congelar()).toBeNull();
    expect(armazem.congelada).toBe(false);
  });

  describe('o HTTP da carteira', () => {
    function http(carteiras: CarteirasBase, agora: { valor: number }) {
      const h = criarHttpDaCarteira({ config: CONFIG_SALA_PADRAO, carteiras, relogio: () => agora.valor, origensAceitas: () => [] });
      const pedido = (metodo: string, caminho: string, autorizacao?: string, corpo?: string): PedidoDaCarteira => ({
        metodo,
        caminho,
        ip: '1.2.3.4',
        cabecalho: (nome) => ({ ...(autorizacao ? { authorization: `Bearer ${autorizacao}` } : {}), ...(corpo ? { 'content-type': 'application/json', 'content-length': String(corpo.length) } : {}) })[nome],
        lerCorpo: async () => ({ tipo: 'texto', texto: corpo ?? '' }),
        corpoPendente: () => false,
        descartarCorpo: () => {},
      });
      return { h, pedido };
    }

    it('criar, comprar, usar e o balão respondem 503 limite com a mensagem da manutenção; ler segue valendo; vencido, volta ao normal', async () => {
      const { carteiras, agora } = livre();
      const c = carteiras.criar()!;
      const { h, pedido } = http(carteiras, agora);
      carteiras.congelar();
      const antes = JSON.stringify(carteiras.espelhos());
      const tentativas = [
        pedido('POST', '/carteira'),
        pedido('POST', '/carteira/comprar', c.codigo, JSON.stringify({ skin: SKIN })),
        pedido('POST', '/carteira/usar', c.codigo, JSON.stringify({ skin: 'classico' })),
        pedido('POST', '/carteira/balao/comprar', c.codigo, JSON.stringify({ item: 'bigode_fino' })),
        pedido('POST', '/carteira/balao/equipar', c.codigo, JSON.stringify({ aparencia: {} })),
      ];
      for (const t of tentativas) {
        const r = await h.tratar(t);
        if (r === 'nao-e-da-carteira' || r === 'abortada') throw new Error('resposta inesperada');
        expect(r.status, t.caminho).toBe(503);
        expect(JSON.parse(r.corpo), t.caminho).toEqual({ erro: 'limite', mensagem: 'A sala está em manutenção por alguns minutos.' });
      }
      expect(JSON.stringify(carteiras.espelhos())).toBe(antes);
      expect(carteiras.total).toBe(1);
      expect(carteiras.ler(c.id)!.skins).toEqual(['classico']);

      const leitura = await h.tratar(pedido('GET', '/carteira', c.codigo));
      expect(leitura).toMatchObject({ status: 200 });

      agora.valor += DURACAO_DO_CONGELAMENTO_MS;
      const criada = await h.tratar(pedido('POST', '/carteira'));
      expect(criada).toMatchObject({ status: 201 });
    });

    it('a compra pelo Banco sem resposta dá 503 com a mensagem nova, sem prometer que nada foi cobrado', async () => {
      const { carteiras, agora, bt } = livre({ banco: true });
      const c = carteiras.criar()!;
      await carteiras.drenarCaixa();
      const { h, pedido } = http(carteiras, agora);
      bt.cair(1, { depois: true });
      const r = await h.tratar(pedido('POST', '/carteira/comprar', c.codigo, JSON.stringify({ skin: SKIN })));
      if (r === 'nao-e-da-carteira' || r === 'abortada') throw new Error('resposta inesperada');
      expect(r.status).toBe(503);
      expect(JSON.parse(r.corpo)).toEqual({ erro: 'limite', mensagem: 'Não deu para falar com o banco agora. Se a compra entrar, o item aparece sozinho.' });
    });
  });
});
