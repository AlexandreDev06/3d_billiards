/**
 * A compra pelo Banco, as pendências e o espelho relido (L59), com `SALDO_NO_BANCO` ligado. O Banco é o de verdade (o `Moedas` do
 * apps/conta sobre `node:sqlite`, via `para-testes-banco.ts`), atrás de uma casca que cai quando o teste manda. O que se prova:
 * o item só é dado depois do débito; a queda entre o débito e o item e o débito que nunca chegou se resolvem com a lápide do Banco (`anularSeNaoFeita`,
 * nunca estornando); comprar e reler o espelho não devolve as moedas; a pendência sobrevive ao objeto despejado (SQLite) e ao
 * arquivo da sala Node; o HTTP responde 402 e 503; o `GET /carteira` e o `entrar` leem o saldo do Banco.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SALDO_INICIAL, SKINS_DE_TACO, precoDaSkinNoDia, diaDaMissao, precoDoItemDoBalao, ITENS_GRATIS_DO_BALAO, type EstadoCarteira, type SkinTaco } from '@sinuca/protocolo';
import { criarHttpDaCarteira, type PedidoDaCarteira } from './carteira-http';
import { ArmazemDeCarteiras } from './carteiras';
import { CarteirasEmMemoria, VERSAO_DO_ARQUIVO_COM_SAIDA, type CarteirasBase } from './carteiras-base';
import { CarteirasNoDO } from './carteiras-sqlite';
import { chaveDaCompra } from './compras-pendentes';
import { CONFIG_SALA_PADRAO } from './config';
import { ClienteDeTeste, SEM_LIMITE, criarAmbiente } from './para-testes';
import { bancoDeTeste, type BancoDeTeste } from './para-testes-banco';
import { banco as bancoSqlite } from './para-testes-sqlite';
import { PRESET_BOTECO } from '@sinuca/regras';

const T0 = 1_800_000_000_000;
const NOMES_DAS_CHAMADAS = (bt: BancoDeTeste): string[] => bt.chamadas.slice();
const IDS_DAS_SKINS = SKINS_DE_TACO.map((s) => s.id);
const SKIN_BARATA = 'ebano' as const; // 50 moedas (a vitrine do dia pode baixar)
const precoDaSkin = (agora: number, skin: SkinTaco = SKIN_BARATA): number => precoDaSkinNoDia(skin, diaDaMissao(agora));
const ITEM_DO_BALAO = 'bigode_fino' as const;
const OUTRO_ITEM_DO_BALAO = 'bigode_chevron' as const;

interface Mundo {
  readonly bt: BancoDeTeste;
  readonly carteiras: CarteirasBase;
  readonly agora: { valor: number };
  readonly logs: string[];
  nova(): { codigo: string; id: string };
  /** Cria uma carteira, leva a caixa ao Banco e a deixa sem nada pendente. */
  pronta(): Promise<{ codigo: string; id: string }>;
}

function memoria(opcoes: { sortearChave?: () => number } = {}): Mundo {
  const agora = { valor: T0 };
  const bt = bancoDeTeste(() => agora.valor);
  const logs: string[] = [];
  const carteiras = new CarteirasEmMemoria({
    maxCarteiras: 100,
    relogio: () => agora.valor,
    log: (e, c = {}) => logs.push(`${e} ${JSON.stringify(c)}`),
    banco: bt.banco,
    ...opcoes,
  });
  const nova = () => carteiras.criar()!;
  return {
    bt,
    carteiras,
    agora,
    logs,
    nova,
    pronta: async () => {
      const c = nova();
      await carteiras.drenarCaixa();
      return c;
    },
  };
}

/** A chave da pendência gravada na tabela do Durable Object (a que o teste da janela precisa saber). */
const chaveDeUmaCompra = (db: { prepare(q: string): { get(): unknown } }): string => (db.prepare('SELECT chave FROM compras_pendentes').get() as { chave: string }).chave;

const saldoDe = (m: Mundo, id: string): number => m.carteiras.ler(id)!.saldo;
const temSkin = (m: Mundo, id: string, skin: SkinTaco = SKIN_BARATA): boolean => m.carteiras.ler(id)!.skins.includes(skin);

describe('comprar a skin com o saldo no Banco', () => {
  it('debita no Banco, dá o item e põe o saldo devolvido no espelho; reler o espelho depois NÃO devolve as moedas', async () => {
    const m = memoria();
    const c = await m.pronta();
    const preco = precoDaSkin(m.agora.valor);
    const r = await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    expect(r.ok).toBe(true);
    expect(temSkin(m, c.id)).toBe(true);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL - preco);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - preco);
    expect(m.carteiras.comprasPendentes).toBe(0);
    // o furo do L57: o espelho vindo do Banco desfazia a compra local
    await m.carteiras.reler(c.id);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL - preco);
    expect(NOMES_DAS_CHAMADAS(m.bt)).toEqual(['garantirConta', 'debitar']);
  });

  it('o livro do Banco leva o débito com jogo sinuca e motivo compra, na chave sinuca:compra:<id>:<ms>:<sorteio>', async () => {
    const m = memoria({ sortearChave: () => 42 });
    const c = await m.pronta();
    await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    const chave = chaveDaCompra(c.id, T0, 42);
    expect(chave).toBe(`sinuca:compra:${c.id}:${T0}:42`);
    expect(m.bt.local.moedas.operacao(chave)).toMatchObject({ ok: true, saldos: { [c.id]: SALDO_INICIAL - precoDaSkin(T0) } });
    expect(chave.length).toBeLessThanOrEqual(120);
  });

  it('o item do balão tem o mesmo caminho', async () => {
    const m = memoria();
    const c = await m.pronta();
    const preco = precoDoItemDoBalao(ITEM_DO_BALAO);
    const r = await m.carteiras.comprarItemDoBalaoNoBanco(c.id, ITEM_DO_BALAO);
    expect(r).toMatchObject({ ok: true });
    expect((r as { estado: EstadoCarteira }).estado.balao?.itens).toContain(ITEM_DO_BALAO);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL - preco);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - preco);
    await m.carteiras.reler(c.id);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL - preco);
    expect(ITENS_GRATIS_DO_BALAO.length).toBeGreaterThan(0);
  });

  it('a conferência local continua: skin que não existe, ja-tem e preco-mudou não chamam o Banco', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.chamadas.length = 0;
    expect(await m.carteiras.comprarSkin(c.id, 'nao-existe')).toEqual({ ok: false, erro: 'skin-invalida' });
    expect(await m.carteiras.comprarSkin(c.id, 'classico')).toEqual({ ok: false, erro: 'ja-tem' });
    expect(await m.carteiras.comprarSkin(c.id, SKIN_BARATA, undefined, 1)).toEqual({ ok: false, erro: 'preco-mudou' });
    expect(await m.carteiras.comprarSkin('0'.repeat(64), SKIN_BARATA)).toEqual({ ok: false, erro: 'carteira-invalida' });
    expect(m.bt.chamadas).toEqual([]);
    expect(m.carteiras.comprasPendentes).toBe(0);
  });

  it('sem saldo no Banco: saldo-insuficiente, a pendência sai, nada é dado e o Banco não muda', async () => {
    const m = memoria();
    const c = await m.pronta();
    // o Banco gastou fora da sinuca: o espelho ainda diz 100
    m.bt.local.moedas.debitar(c.id, 95, 'outro-jogo:1', { jogo: 'outro', motivo: 'teste' });
    const r = await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    expect(r).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(temSkin(m, c.id)).toBe(false);
    expect(m.carteiras.comprasPendentes).toBe(0);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - 95);
  });

  it('o piso é o do Banco: o espelho velho (alto) não deixa gastar o que o Banco não tem', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.local.moedas.debitar(c.id, SALDO_INICIAL, 'outro-jogo:2', { jogo: 'outro', motivo: 'teste' });
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL);
    expect(await m.carteiras.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
  });

  it('o Banco recusando por outro motivo (conta que ele não tem): fora-do-ar, a pendência sai e nada é dado', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.recusar('debitar', 'conta-inexistente');
    expect(await m.carteiras.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(temSkin(m, c.id)).toBe(false);
    expect(m.carteiras.comprasPendentes).toBe(0);
    expect(m.logs.some((l) => l.startsWith('banco-recusou') && l.includes('conta-inexistente'))).toBe(true);
  });

  it('o Banco fora do ar: 503 (fora-do-ar), o item NÃO é dado, a pendência fica e o débito não aconteceu', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.fora = true;
    const r = await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    expect(r).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(temSkin(m, c.id)).toBe(false);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL);
    expect(m.carteiras.comprasPendentes).toBe(1);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL);
  });

  it('a conta recém-criada ainda na caixa: a compra leva a caixa ao Banco antes de debitar (o Banco precisa da conta e do presente)', async () => {
    const m = memoria();
    const c = m.nova(); // o garantirConta ainda está na caixa
    expect(m.bt.saldo(c.id)).toBeNull();
    const r = await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    expect(r.ok).toBe(true);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0));
    expect(NOMES_DAS_CHAMADAS(m.bt)).toEqual(['garantirConta', 'debitar']);
  });

  it('com a caixa travada para a conta (Banco fora), a compra nem cria pendência: fora-do-ar', async () => {
    const m = memoria();
    const c = m.nova();
    m.bt.fora = true;
    expect(await m.carteiras.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(m.carteiras.comprasPendentes).toBe(0);
  });

  it('duas compras ao mesmo tempo da mesma coisa: uma cobra, a outra vê ja-tem; de coisas diferentes, as duas passam em fila', async () => {
    const m = memoria();
    const c = await m.pronta();
    const [a, b] = await Promise.all([m.carteiras.comprarSkin(c.id, SKIN_BARATA), m.carteiras.comprarSkin(c.id, SKIN_BARATA)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(b).toEqual({ ok: false, erro: 'ja-tem' });
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0));
    m.bt.local.moedas.creditar(c.id, 1000, 'outro-jogo:rico', { jogo: 'outro', motivo: 'teste' });
    await m.carteiras.reler(c.id);
    const [x, y] = await Promise.all([m.carteiras.comprarItemDoBalaoNoBanco(c.id, ITEM_DO_BALAO), m.carteiras.comprarSkin(c.id, IDS_DAS_SKINS[2]!)]);
    expect([x.ok, y.ok]).toEqual([true, true]);
    expect(saldoDe(m, c.id)).toBe(m.bt.saldo(c.id));
  });

  it('a compra síncrona de antes fica recusada com o Banco ligado (ela deixaria o espelho sem o débito)', async () => {
    const m = memoria();
    const c = await m.pronta();
    expect(m.carteiras.comprar(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(m.carteiras.comprarItemDoBalao(c.id, ITEM_DO_BALAO)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(temSkin(m, c.id)).toBe(false);
  });

  it('sem o Banco (chave desligada) a compra é a de sempre, síncrona', async () => {
    const carteiras = new CarteirasEmMemoria({ maxCarteiras: 10, relogio: () => T0, log: () => {} });
    const c = carteiras.criar()!;
    const r = await carteiras.comprarSkin(c.id, SKIN_BARATA);
    expect(r.ok).toBe(true);
    expect(carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL - precoDaSkin(T0));
    expect(carteiras.saldoNoBanco).toBe(false);
  });
});

describe('a queda entre o débito e o item, e o débito que não chegou', () => {
  it('o débito foi aplicado e a resposta se perdeu: a pendência dá o item depois, pela lápide (feita), e o Banco cobrou uma vez só', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.cair(1, { depois: true }); // a próxima escrita aplica no Banco e depois lança
    const r = await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    expect(r).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(temSkin(m, c.id)).toBe(false);
    expect(m.carteiras.comprasPendentes).toBe(1);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0)); // o Banco cobrou
    m.bt.leituras.length = 0;
    await m.carteiras.drenarCaixa();
    expect(m.bt.leituras).toContain('anularSeNaoFeita');
    expect(temSkin(m, c.id)).toBe(true);
    expect(m.carteiras.comprasPendentes).toBe(0);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0)); // nada de segunda cobrança
    await m.carteiras.reler(c.id);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0));
    expect(NOMES_DAS_CHAMADAS(m.bt)).toEqual(['garantirConta', 'debitar']);
  });

  it('o débito nunca chegou: a pendência some, sem estornar (nenhum creditar) e sem dar o item', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.cair(1); // a próxima escrita lança ANTES de aplicar
    expect(await m.carteiras.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(m.carteiras.comprasPendentes).toBe(1);
    await m.carteiras.drenarCaixa();
    expect(m.carteiras.comprasPendentes).toBe(0);
    expect(temSkin(m, c.id)).toBe(false);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL);
    expect(NOMES_DAS_CHAMADAS(m.bt)).not.toContain('creditar');
    expect(NOMES_DAS_CHAMADAS(m.bt)).toEqual(['garantirConta', 'debitar']);
  });

  it('a janela (L60): o objeto cai com o débito a caminho, a reconciliação do objeto novo vem ANTES dele e o débito que chega depois é recusado: nada cobrado, nada dado', async () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const abrir = () =>
      new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
    const antigo = abrir();
    const c = antigo.criar()!;
    await antigo.drenarCaixa();
    // o débito do objeto antigo fica a caminho (preso) enquanto o objeto cai
    let solta!: () => void;
    const porta = new Promise<void>((r) => (solta = r));
    const debitarReal = bt.banco.debitar;
    const presa = { valor: true };
    (bt.banco as { debitar: typeof debitarReal }).debitar = async (...a) => {
      if (presa.valor) await porta;
      return debitarReal(...a);
    };
    const compra = antigo.comprarSkin(c.id, SKIN_BARATA);
    await new Promise((r) => setTimeout(r, 10));
    expect(antigo.comprasPendentes).toBe(1);
    const chave = chaveDeUmaCompra(sqlite.db);

    // o objeto novo acorda com a pendência no SQLite e pergunta ao Banco antes de o débito antigo chegar
    const novo = abrir();
    expect(novo.comprasPendentes).toBe(1);
    await novo.drenarCaixa();
    expect(novo.comprasPendentes).toBe(0);
    expect(novo.ler(c.id)!.skins).not.toContain(SKIN_BARATA);

    // agora o débito antigo chega: a lápide o recusa, sem efeito
    solta();
    expect(await compra).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(bt.saldo(c.id)).toBe(SALDO_INICIAL);
    expect(bt.local.moedas.operacao(chave)).toBeNull(); // só a lápide
    expect(bt.local.moedas.debitar(c.id, 1, chave, { jogo: 'sinuca', motivo: 'compra' })).toEqual({ ok: false, erro: 'chave-reusada' });
    expect(novo.ler(c.id)!.skins).not.toContain(SKIN_BARATA);
    expect(antigo.ler(c.id)!.skins).not.toContain(SKIN_BARATA);
  });

  it('com o Banco fora, a pendência espera (5 s, 10 s...) e entrega quando ele volta; a compra repetida antes não cobra duas vezes', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.cair(1, { depois: true });
    await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    m.bt.foraLeitura = true;
    await m.carteiras.drenarCaixa();
    expect(m.carteiras.comprasPendentes).toBe(1);
    expect(m.carteiras.proximaTentativaDaCaixa).toBe(T0 + 5000);
    await m.carteiras.drenarCaixa(); // dentro da espera: nem pergunta
    expect(m.bt.leituras.filter((n) => n === 'anularSeNaoFeita')).toHaveLength(1);
    m.agora.valor += 5000;
    m.bt.foraLeitura = false;
    // o jogador tenta comprar de novo antes do alarm: a pendência é resolvida primeiro, e vira ja-tem (o débito já tinha acontecido)
    expect(await m.carteiras.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'ja-tem' });
    expect(temSkin(m, c.id)).toBe(true);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0));
    expect(NOMES_DAS_CHAMADAS(m.bt).filter((n) => n === 'debitar')).toHaveLength(1);
  });

  it('retentativa com a pendência que nunca foi aplicada: resolve (apaga) e cobra uma vez só', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.cair(1);
    await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    const r = await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    expect(r.ok).toBe(true);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0));
    expect(m.carteiras.comprasPendentes).toBe(0);
  });

  it('a chamada ainda em voo não é reconciliada (perguntar antes de ela chegar daria "nunca aplicada" e cobraria sem dar)', async () => {
    const m = memoria();
    const c = await m.pronta();
    let solta!: () => void;
    const porta = new Promise<void>((r) => (solta = r));
    const debitarReal = m.bt.banco.debitar;
    (m.bt.banco as { debitar: typeof debitarReal }).debitar = async (...a) => {
      await porta;
      return debitarReal(...a);
    };
    const compra = m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    await new Promise((r) => setTimeout(r, 10));
    expect(m.carteiras.comprasPendentes).toBe(1);
    m.bt.leituras.length = 0;
    await m.carteiras.reconciliarCompras();
    expect(m.bt.leituras).not.toContain('anularSeNaoFeita');
    expect(m.carteiras.comprasPendentes).toBe(1);
    solta();
    expect((await compra).ok).toBe(true);
    expect(m.carteiras.comprasPendentes).toBe(0);
  });

  it('pendência com mais de 1 hora e o Banco mudo: loga compra-pendente-velha (sem a chave nem o id inteiro)', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.cair(1, { depois: true });
    await m.carteiras.comprarSkin(c.id, SKIN_BARATA);
    m.bt.foraLeitura = true;
    m.agora.valor += 3_700_000;
    await m.carteiras.drenarCaixa();
    const velhas = m.logs.filter((l) => l.startsWith('compra-pendente-velha'));
    expect(velhas).toHaveLength(1);
    expect(velhas[0]).toContain(c.id.slice(0, 8));
    expect(velhas[0]).not.toContain(c.id);
    expect(m.logs.some((l) => l.includes('compra:'))).toBe(false);
  });
});

describe('a pendência sobrevive ao objeto despejado e ao arquivo', () => {
  it('Durable Object: a linha de compras_pendentes é gravada ANTES do débito; o objeto novo dá o item ao acordar', async () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const abrir = () =>
      new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
    const antes = abrir();
    const c = antes.criar()!;
    await antes.drenarCaixa();
    let vistaAntesDoDebito = 0;
    bt.antesDoDebito = () => {
      vistaAntesDoDebito = (sqlite.db.prepare('SELECT COUNT(*) AS n FROM compras_pendentes').get() as { n: number }).n;
    };
    bt.cair(1, { depois: true });
    expect(await antes.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(vistaAntesDoDebito).toBe(1);
    const linha = sqlite.db.prepare('SELECT chave, id, tipo, item, preco FROM compras_pendentes').get() as { chave: string; id: string; tipo: string; item: string; preco: number };
    expect(linha).toMatchObject({ id: c.id, tipo: 'skin', item: SKIN_BARATA, preco: precoDaSkin(T0) });
    expect(linha.chave).toMatch(new RegExp(`^sinuca:compra:${c.id}:${T0}:\\d+$`));

    // o objeto é despejado e acorda: o armazém novo lê a pendência e pergunta ao Banco sozinho
    const depois = abrir();
    expect(depois.comprasPendentes).toBe(1);
    expect(depois.ler(c.id)!.skins).not.toContain(SKIN_BARATA);
    await depois.drenarCaixa();
    expect(depois.ler(c.id)!.skins).toContain(SKIN_BARATA);
    expect(depois.comprasPendentes).toBe(0);
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM compras_pendentes').get()).toEqual({ n: 0 });
    // e o item está na tabela das carteiras
    expect(abrir().ler(c.id)!.skins).toContain(SKIN_BARATA);
  });

  it('Durable Object: o item, o saldo e o fim da pendência vão numa gravação só', async () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const c0 = new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
    const c = c0.criar()!;
    await c0.drenarCaixa();
    const marca = sqlite.comandos.length;
    await c0.comprarSkin(c.id, SKIN_BARATA);
    const escritas = sqlite.comandos.slice(marca).filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q));
    // 1ª gravação: a pendência (antes do débito); 2ª: carteira e DELETE da pendência juntos
    expect(escritas.filter((q) => /compras_pendentes/.test(q))).toHaveLength(2);
    expect(escritas.filter((q) => /INTO carteiras \(/.test(q))).toHaveLength(1);
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM compras_pendentes').get()).toEqual({ n: 0 });
  });

  it('Durable Object: gravação que falha (cota) não chega a cobrar: fora-do-ar e o Banco nem foi chamado', async () => {
    const agora = { valor: T0 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const armazem = new CarteirasNoDO({ sql: sqlite.sql, transacao: sqlite.transacao, maxCarteiras: 100, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
    const c = armazem.criar()!;
    await armazem.drenarCaixa();
    bt.chamadas.length = 0;
    sqlite.falharQuando = /compras_pendentes/;
    expect(await armazem.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'fora-do-ar' });
    expect(bt.chamadas).toEqual([]);
    expect(armazem.comprasPendentes).toBe(0);
  });

  it('sala Node: o carteiras.json é a versão 3 com o campo compras; o armazém novo o lê e dá o item', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-compra-'));
    try {
      const agora = { valor: T0 };
      const bt = bancoDeTeste(() => agora.valor);
      const abrir = () => new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 5, relogio: () => agora.valor, log: () => {}, banco: bt.banco });
      const a = abrir();
      const c = a.criar()!;
      await a.drenarCaixa();
      bt.cair(1, { depois: true });
      expect(await a.comprarSkin(c.id, SKIN_BARATA)).toEqual({ ok: false, erro: 'fora-do-ar' });
      await a.fechar();
      const arquivo = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; compras?: { chave: string; id: string; item: string }[] };
      expect(arquivo.versao).toBe(VERSAO_DO_ARQUIVO_COM_SAIDA);
      expect(arquivo.compras).toHaveLength(1);
      expect(arquivo.compras![0]).toMatchObject({ id: c.id, item: SKIN_BARATA });

      const b = abrir();
      expect(b.comprasPendentes).toBe(1);
      await b.drenarCaixa();
      expect(b.ler(c.id)!.skins).toContain(SKIN_BARATA);
      await b.fechar();
      const depois = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; compras?: unknown };
      expect(depois.versao).toBe(2); // sem nada pendente volta a ser o arquivo que a versão anterior abre
      expect(depois.compras).toBeUndefined();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe('o espelho relido', () => {
  it('reler põe no espelho o saldo do Banco (outro jogo mexeu) e avisa quem olha a carteira; nunca escreve no Banco', async () => {
    const m = memoria();
    const c = await m.pronta();
    const avisos: string[] = [];
    m.carteiras.aoMudar((id) => avisos.push(id));
    m.bt.local.moedas.creditar(c.id, 25, 'outro-jogo:premio', { jogo: 'outro', motivo: 'teste' });
    m.bt.chamadas.length = 0;
    expect(await m.carteiras.reler(c.id)).toBe(true);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL + 25);
    expect(avisos).toEqual([c.id]);
    expect(m.bt.chamadas).toEqual([]); // só leu
    expect(await m.carteiras.reler(c.id)).toBe(false); // igual: nada a fazer, nada a avisar
    expect(avisos).toHaveLength(1);
  });

  it('a leitura é descartada enquanto a caixa tem operação da conta (o Banco a trará já com a conta certa)', async () => {
    const m = memoria();
    m.bt.fora = true;
    const c = m.nova(); // o garantirConta fica na caixa
    expect(m.carteiras.pendentesNaCaixa).toBe(1);
    m.bt.fora = false;
    expect(await m.carteiras.reler(c.id)).toBe(false);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL);
  });

  it('conta que o Banco não tem (antes da migração) ou Banco fora do ar: o espelho fica como está, e o log sai no máximo uma vez por minuto', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.foraLeitura = true;
    expect(await m.carteiras.reler(c.id)).toBe(false);
    expect(await m.carteiras.reler(c.id)).toBe(false);
    expect(m.logs.filter((l) => l.startsWith('banco-fora') && l.includes('"saldo"'))).toHaveLength(1);
    m.agora.valor += 61_000;
    expect(await m.carteiras.reler(c.id)).toBe(false);
    expect(m.logs.filter((l) => l.startsWith('banco-fora') && l.includes('"saldo"'))).toHaveLength(2);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL);
  });

  it('a leitura que começou antes de uma compra é descartada (não desfaz a compra)', async () => {
    const m = memoria();
    const c = await m.pronta();
    const saldoReal = m.bt.banco.saldo;
    let solta!: () => void;
    const porta = new Promise<void>((r) => (solta = r));
    (m.bt.banco as { saldo: typeof saldoReal }).saldo = async (id) => {
      const antes = await saldoReal(id); // lê o saldo de ANTES da compra...
      await porta; // ...e demora
      return antes;
    };
    const leitura = m.carteiras.reler(c.id);
    await new Promise((r) => setTimeout(r, 5));
    expect((await m.carteiras.comprarSkin(c.id, SKIN_BARATA)).ok).toBe(true);
    solta();
    expect(await leitura).toBe(false);
    expect(saldoDe(m, c.id)).toBe(SALDO_INICIAL - precoDaSkin(T0));
  });

  it('com a chave desligada, reler não faz nada', async () => {
    const carteiras = new CarteirasEmMemoria({ maxCarteiras: 10, relogio: () => T0, log: () => {} });
    const c = carteiras.criar()!;
    expect(await carteiras.reler(c.id)).toBe(false);
  });
});

describe('entrar numa sala lê o saldo do Banco em segundo plano', () => {
  it('criar e entrar com a carteira: se o Banco tem outro número, o espelho muda e o estado-sala sai de novo', async () => {
    const bt = bancoDeTeste();
    const ref: { amb?: ReturnType<typeof criarAmbiente> } = {};
    const carteiras = new CarteirasEmMemoria({ maxCarteiras: 100, relogio: () => ref.amb!.agora(), log: () => {}, banco: bt.banco });
    const amb = criarAmbiente({ missoesDiarias: false }, { carteiras });
    ref.amb = amb;
    const a = carteiras.criar()!;
    const b = carteiras.criar()!;
    await carteiras.drenarCaixa();
    bt.local.moedas.creditar(b.id, 40, 'outro-jogo:x', { jogo: 'outro', motivo: 'teste' });
    const ana = new ClienteDeTeste(amb, 'Ana');
    const beto = new ClienteDeTeste(amb, 'Beto');
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: a.codigo });
    beto.entrar(ana.codigo, undefined, b.codigo);
    expect(carteiras.ler(b.id)!.saldo).toBe(SALDO_INICIAL); // ainda o espelho velho: a leitura é em segundo plano
    await new Promise((r) => setTimeout(r, 20));
    expect(carteiras.ler(b.id)!.saldo).toBe(SALDO_INICIAL + 40);
    const lugar = ana.estado.lugares.find((l) => l?.nome === 'Beto');
    expect(lugar?.saldo).toBe(SALDO_INICIAL + 40);
    expect(bt.leituras).toContain('saldo');
  });
});

describe('o HTTP da carteira com o saldo no Banco', () => {
  function pedido(metodo: string, caminho: string, codigo: string, corpo?: object): PedidoDaCarteira {
    const texto = corpo === undefined ? '' : JSON.stringify(corpo);
    const cabecalhos: Record<string, string> = { origin: 'http://t', authorization: `Bearer ${codigo}` };
    if (corpo !== undefined) {
      cabecalhos['content-type'] = 'application/json';
      cabecalhos['content-length'] = String(texto.length);
    }
    return {
      metodo,
      caminho,
      ip: 'ip-1',
      cabecalho: (n) => cabecalhos[n],
      lerCorpo: async () => ({ tipo: 'texto', texto }),
      corpoPendente: () => false,
      descartarCorpo: () => {},
    };
  }
  async function http(m: Mundo, p: PedidoDaCarteira): Promise<{ status: number; corpo: Record<string, unknown> }> {
    const h = criarHttpDaCarteira({ config: CONFIG_SALA_PADRAO, carteiras: m.carteiras, relogio: () => m.agora.valor, origensAceitas: () => ['http://t'] });
    const r = await h.tratar(p);
    if (r === 'nao-e-da-carteira' || r === 'abortada') throw new Error(r);
    return { status: r.status, corpo: JSON.parse(r.corpo) as Record<string, unknown> };
  }

  it('POST /carteira/comprar: 200 com o saldo novo; sem saldo no Banco 402; Banco fora do ar 503 sem dar o item', async () => {
    const m = memoria();
    const c = await m.pronta();
    const ok = await http(m, pedido('POST', '/carteira/comprar', c.codigo, { skin: SKIN_BARATA }));
    expect(ok.status).toBe(200);
    expect(ok.corpo.saldo).toBe(SALDO_INICIAL - precoDaSkin(T0));
    expect(ok.corpo.skins).toContain(SKIN_BARATA);

    m.bt.local.moedas.debitar(c.id, m.bt.saldo(c.id)!, 'outro-jogo:zerar', { jogo: 'outro', motivo: 'teste' });
    const outra = IDS_DAS_SKINS.filter((s) => s !== 'classico' && s !== SKIN_BARATA)[0]!;
    const sem = await http(m, pedido('POST', '/carteira/comprar', c.codigo, { skin: outra }));
    expect(sem.status).toBe(402);
    expect(sem.corpo.erro).toBe('saldo-insuficiente');

    const d = await m.pronta();
    m.bt.fora = true;
    const fora = await http(m, pedido('POST', '/carteira/comprar', d.codigo, { skin: SKIN_BARATA }));
    expect(fora.status).toBe(503);
    expect(fora.corpo.erro).toBe('limite');
    expect(temSkin(m, d.id)).toBe(false);
  });

  it('POST /carteira/balao/comprar tem os mesmos 200, 402 e 503', async () => {
    const m = memoria();
    const c = await m.pronta();
    const ok = await http(m, pedido('POST', '/carteira/balao/comprar', c.codigo, { item: ITEM_DO_BALAO }));
    expect(ok.status).toBe(200);
    m.bt.local.moedas.debitar(c.id, m.bt.saldo(c.id)!, 'outro-jogo:zerar2', { jogo: 'outro', motivo: 'teste' });
    expect((await http(m, pedido('POST', '/carteira/balao/comprar', c.codigo, { item: OUTRO_ITEM_DO_BALAO }))).status).toBe(402);
    const d = await m.pronta();
    m.bt.fora = true;
    expect((await http(m, pedido('POST', '/carteira/balao/comprar', d.codigo, { item: ITEM_DO_BALAO }))).status).toBe(503);
  });

  it('GET /carteira lê o saldo do Banco; com o Banco fora responde o espelho', async () => {
    const m = memoria();
    const c = await m.pronta();
    m.bt.local.moedas.creditar(c.id, 30, 'outro-jogo:g', { jogo: 'outro', motivo: 'teste' });
    const lido = await http(m, pedido('GET', '/carteira', c.codigo));
    expect(lido.status).toBe(200);
    expect(lido.corpo.saldo).toBe(SALDO_INICIAL + 30);
    m.bt.local.moedas.creditar(c.id, 30, 'outro-jogo:h', { jogo: 'outro', motivo: 'teste' });
    m.bt.foraLeitura = true;
    const fora = await http(m, pedido('GET', '/carteira', c.codigo));
    expect(fora.status).toBe(200);
    expect(fora.corpo.saldo).toBe(SALDO_INICIAL + 30);
  });
});

describe('a soma do Banco é a dos espelhos depois de drenar', () => {
  it('compras, reler e a caixa juntas', async () => {
    const m = memoria();
    const cs = [await m.pronta(), await m.pronta(), await m.pronta()];
    await m.carteiras.comprarSkin(cs[0]!.id, SKIN_BARATA);
    await m.carteiras.comprarItemDoBalaoNoBanco(cs[1]!.id, ITEM_DO_BALAO);
    for (const c of cs) await m.carteiras.reler(c.id);
    await m.carteiras.drenarCaixa();
    const banco = cs.reduce((s, c) => s + m.bt.saldo(c.id)!, 0);
    const espelhos = cs.reduce((s, c) => s + saldoDe(m, c.id), 0);
    expect(banco).toBe(espelhos);
  });
});
