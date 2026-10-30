/**
 * A migração do saldo ao Banco e o caminho de volta (L60), sem o workerd: as carteiras são as de verdade (em memória) e o Banco é o
 * `Moedas` do apps/conta sobre `node:sqlite`. Prova: a ordem (importar, reler, conferir), o que é `ok`, o repetir, o conflito, a
 * recusa com sala ou caixa cheia, o caminho de volta numa persistência só, e que nenhum log leva `id` nem saldo.
 */
import { describe, expect, it } from 'vitest';
import type { BancoDaMigracao } from './banco-da-sala';
import { CarteirasEmMemoria } from './carteiras-base';
import { MigracaoDeSaldos, LOTE_DA_MIGRACAO } from './migracao-de-saldos';
import { bancoDeTeste, type BancoDeTeste } from './para-testes-banco';

const T0 = 1_800_000_000_000;

class Contando extends CarteirasEmMemoria {
  gravacoes = 0;
  protected override persistir(): void {
    this.gravacoes++;
  }
}

interface Mundo {
  readonly carteiras: Contando;
  readonly bt: BancoDeTeste;
  readonly logs: string[];
  readonly migracao: MigracaoDeSaldos;
  readonly chamadas: string[];
  readonly salas: { n: number };
  readonly banco: { atual: BancoDaMigracao | undefined };
  /** Cria `n` carteiras com os saldos dados, SEM a caixa (a chave desligada). */
  criar(saldos: readonly number[]): string[];
}

function mundo(opcoes: { chave?: boolean; max?: number } = {}): Mundo {
  const bt = bancoDeTeste(() => T0);
  const logs: string[] = [];
  const log = (e: string, c: Record<string, unknown> = {}) => logs.push(`${e} ${JSON.stringify(c)}`);
  const carteiras = new Contando({ maxCarteiras: opcoes.max ?? 100, relogio: () => T0, log, banco: opcoes.chave === true ? bt.banco : null });
  const chamadas: string[] = [];
  const registrado: BancoDaMigracao = {
    saldos: async (ids) => {
      chamadas.push(`saldos:${ids.length}`);
      return bt.local.migracao.saldos(ids);
    },
    importarSaldos: async (lote) => {
      chamadas.push(`importar:${lote.length}`);
      return bt.local.migracao.importarSaldos(lote);
    },
  };
  const banco = { atual: registrado as BancoDaMigracao | undefined };
  const salas = { n: 0 };
  const migracao = new MigracaoDeSaldos({
    get banco() {
      return banco.atual;
    },
    carteiras,
    salasAbertas: () => salas.n,
    log,
  } as ConstructorParameters<typeof MigracaoDeSaldos>[0]);
  return {
    carteiras,
    bt,
    logs,
    migracao,
    chamadas,
    salas,
    banco,
    criar: (saldos) => {
      const ids: string[] = [];
      for (const s of saldos) {
        const c = carteiras.criar()!;
        carteiras.trocarEspelhos(new Map([[c.id, s]]));
        ids.push(c.id);
      }
      carteiras.gravacoes = 0;
      return ids;
    },
  };
}

const soma = (xs: readonly number[]): number => xs.reduce((t, x) => t + x, 0);

describe('levar-saldos-ao-banco', () => {
  it('manda os três espelhos, confere e responde ok com as somas iguais; repetir dá iguais e nenhuma criada', async () => {
    const m = mundo();
    const saldos = [1000, 250, 0];
    const ids = m.criar(saldos);
    const r = await m.migracao.levar();
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ ok: true, carteiras: 3, criadas: 3, iguais: 0, conflitos: 0, somaSinuca: 1250, somaBanco: 1250 });
    ids.forEach((id, i) => expect(m.bt.saldo(id)).toBe(saldos[i]));

    const outra = await m.migracao.levar();
    expect(outra.corpo).toEqual({ ok: true, carteiras: 3, criadas: 0, iguais: 3, conflitos: 0, somaSinuca: 1250, somaBanco: 1250 });
  });

  it('a migração só lê os espelhos: a sinuca não muda nada nas carteiras', async () => {
    const m = mundo();
    m.criar([500, 600]);
    const antes = JSON.stringify(m.carteiras.espelhos());
    await m.migracao.levar();
    expect(JSON.stringify(m.carteiras.espelhos())).toBe(antes);
    expect(m.carteiras.gravacoes).toBe(0);
  });

  it('com um conflito (o Banco já tem a conta com outro saldo) NÃO é ok: 409, conflitos 1, os 8 primeiros caracteres do id, e nada muda no Banco para essa conta', async () => {
    const m = mundo();
    const ids = m.criar([1000, 250, 77]);
    m.bt.local.moedas.garantirConta(ids[1]!, 9); // o Banco já tem a conta, com outro saldo
    const r = await m.migracao.levar();
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ ok: false, erro: 'conflitos', carteiras: 3, criadas: 2, iguais: 0, conflitos: 1, idsEmConflito: [ids[1]!.slice(0, 8)] });
    expect(m.bt.saldo(ids[1]!)).toBe(9);
    expect(JSON.stringify(r.corpo)).not.toContain(ids[1]!);
  });

  it('responde ok:false e 409 quando a conferência acha o Banco diferente do que mandou, mesmo sem conflito declarado', async () => {
    const m = mundo();
    m.criar([100, 200]);
    // um Banco que diz que importou e não importou
    m.banco.atual = { saldos: m.bt.local.migracao.saldos, importarSaldos: async (lote) => ({ criadas: lote.length, iguais: 0, conflitos: [] }) };
    const r = await m.migracao.levar();
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ ok: false, erro: 'somas-diferentes', somaSinuca: 300, somaBanco: 0 });
  });

  it('um espelho que mudou enquanto a migração corria não é ok (o Banco ficou para trás): repetir quando estiver quieto', async () => {
    const m = mundo();
    const ids = m.criar([100, 200]);
    const real = m.bt.local.migracao;
    m.banco.atual = {
      saldos: real.saldos,
      importarSaldos: async (lote) => {
        const r = await real.importarSaldos(lote);
        m.carteiras.trocarEspelhos(new Map([[ids[0]!, 150]]));
        return r;
      },
    };
    const r = await m.migracao.levar();
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ ok: false, erro: 'mudou-durante' });
    // e a repetição, quieta, fecha
    m.banco.atual = real;
    expect((await m.migracao.levar()).status).toBe(409); // o Banco tem 100, o espelho agora tem 150: conflito de verdade
  });

  it('em lotes de 500: 1 200 carteiras viram 3 chamadas de importar e 3 de saldos, nenhuma com mais de 500', async () => {
    const m = mundo({ max: 2000 });
    m.criar(Array.from({ length: 1200 }, (_, i) => i));
    const r = await m.migracao.levar();
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, carteiras: 1200, criadas: 1200, somaSinuca: soma(Array.from({ length: 1200 }, (_, i) => i)) });
    expect(m.chamadas.filter((c) => c.startsWith('importar:'))).toEqual(['importar:500', 'importar:500', 'importar:200']);
    expect(m.chamadas.filter((c) => c.startsWith('saldos:'))).toEqual(['saldos:500', 'saldos:500', 'saldos:200']);
    expect(LOTE_DA_MIGRACAO).toBe(500);
  });

  it('com sala aberta: 409 salas-abertas e o Banco nem é chamado', async () => {
    const m = mundo();
    const ids = m.criar([100]);
    m.salas.n = 2;
    const r = await m.migracao.levar();
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: 'salas-abertas', salas: 2 } });
    expect(m.chamadas).toEqual([]);
    expect(m.bt.saldo(ids[0]!)).toBeNull();
  });

  it('com a caixa do Banco cheia (a chave ligada e o Banco fora): 409 caixa-cheia e nada é mandado', async () => {
    const m = mundo({ chave: true });
    m.bt.fora = true;
    const c = m.carteiras.criar()!;
    expect(m.carteiras.pendentesNaCaixa).toBeGreaterThan(0);
    const r = await m.migracao.levar();
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: 'caixa-cheia' } });
    expect(m.chamadas).toEqual([]);
    expect(c.id).toHaveLength(64);
  });

  it('Banco fora do ar: 502 banco-fora; sem o binding: 503 banco-indisponivel; repetir depois fecha', async () => {
    const m = mundo();
    m.criar([100, 200]);
    const real = m.bt.local.migracao;
    m.banco.atual = { saldos: real.saldos, importarSaldos: async () => { throw new Error('banco fora do ar'); } };
    expect(await m.migracao.levar()).toEqual({ status: 502, corpo: { ok: false, erro: 'banco-fora' } });
    m.banco.atual = undefined;
    expect(await m.migracao.levar()).toEqual({ status: 503, corpo: { ok: false, erro: 'banco-indisponivel' } });
    m.banco.atual = real;
    expect((await m.migracao.levar()).status).toBe(200);
  });

  it('saldo negativo (perder aposta não tem piso) migra como está e as somas batem', async () => {
    const m = mundo();
    const ids = m.criar([1000, -50, 0]);
    const r = await m.migracao.levar();
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ ok: true, carteiras: 3, criadas: 3, iguais: 0, conflitos: 0, somaSinuca: 950, somaBanco: 950 });
    expect(m.bt.saldo(ids[1]!)).toBe(-50);
    expect((await m.migracao.levar()).corpo).toMatchObject({ ok: true, criadas: 0, iguais: 3, somaSinuca: 950, somaBanco: 950 });
  });

  it('saldo que não é inteiro seguro é recusado antes de mandar qualquer coisa', async () => {
    const m = mundo();
    const ids = m.criar([100, 200]);
    // o espelho nunca fica torto pelos caminhos normais; força um valor ruim por dentro
    (m.carteiras as unknown as { carteiras: Map<string, { saldo: number }> }).carteiras.get(ids[0]!)!.saldo = 1.5;
    const r = await m.migracao.levar();
    expect(r).toEqual({ status: 422, corpo: { ok: false, erro: 'saldos-invalidos', invalidas: 1 } });
    expect(m.chamadas).toEqual([]);
  });

  it('linha inválida na caixa ou nas compras (guardada, nem enviada nem apagada) e operação morta contam como caixa cheia, nas duas rotas', async () => {
    for (const marca of ['invalida', 'morta'] as const) {
      const m = mundo({ chave: true });
      m.criar([100]);
      await m.carteiras.drenarCaixa();
      if (marca === 'invalida') (m.carteiras as unknown as { linhasInvalidasNoArmazenamento: number }).linhasInvalidasNoArmazenamento = 1;
      else {
        const caixa = (m.carteiras as unknown as { caixa: { empilhar(op: unknown): { ordem: number }; matar(o: number, e: string): void } }).caixa;
        caixa.matar(caixa.empilhar({ tipo: 'devolver', chave: 'sinuca:aposta:x' }).ordem, 'torta');
      }
      m.chamadas.length = 0;
      expect((await m.migracao.levar()).corpo, marca).toEqual({ ok: false, erro: 'caixa-cheia' });
      expect((await m.migracao.espelhar()).corpo, marca).toEqual({ ok: false, erro: 'caixa-cheia' });
      expect(m.chamadas, marca).toEqual([]);
    }
  });

  it('duas ao mesmo tempo: a segunda dá 409 em-andamento', async () => {
    const m = mundo();
    m.criar([100]);
    const a = m.migracao.levar();
    const b = m.migracao.levar();
    expect((await b).corpo).toEqual({ ok: false, erro: 'em-andamento' });
    expect((await a).status).toBe(200);
  });

  it('nenhum log leva id, saldo ou chave: só contagens e somas', async () => {
    const m = mundo();
    const ids = m.criar([123456, 654321]);
    m.bt.local.moedas.garantirConta(ids[1]!, 1);
    await m.migracao.levar();
    await m.migracao.espelhar();
    const tudo = m.logs.join('\n');
    for (const id of ids) {
      expect(tudo).not.toContain(id);
      expect(tudo).not.toContain(id.slice(0, 8));
    }
    expect(tudo).toContain('admin-levar-saldos');
    expect(tudo).toContain('"conflitos":1');
  });
});

describe('espelhar-saldos (o caminho de volta)', () => {
  it('grava em cada espelho o saldo do Banco numa persistência só, avisa quem olha, e responde as somas', async () => {
    const m = mundo();
    const ids = m.criar([1000, 250, 70]);
    await m.migracao.levar();
    // o Banco se mexe (outro jogo, o portal): a sinuca ficou para trás
    m.bt.local.moedas.creditar(ids[0]!, 500, 'k:a', { jogo: 'sinuca', motivo: 'teste' });
    m.bt.local.moedas.debitar(ids[1]!, 50, 'k:b', { jogo: 'sinuca', motivo: 'teste' });
    const avisadas: string[] = [];
    m.carteiras.aoMudar((id) => avisadas.push(id));
    m.carteiras.gravacoes = 0;
    const r = await m.migracao.espelhar();
    expect(r).toEqual({ status: 200, corpo: { ok: true, carteiras: 3, mudadas: 2, semConta: 0, somaAntes: 1320, somaDepois: 1770, somaBanco: 1770, somaSemConta: 0 } });
    expect(m.carteiras.gravacoes).toBe(1);
    expect(avisadas.sort()).toEqual([ids[0]!, ids[1]!].sort());
    expect(m.carteiras.ler(ids[0]!)!.saldo).toBe(1500);
    expect(m.carteiras.ler(ids[1]!)!.saldo).toBe(200);
    expect(m.carteiras.ler(ids[2]!)!.saldo).toBe(70);
  });

  it('carteira que o Banco não conhece fica como está e entra em semConta', async () => {
    const m = mundo();
    const ids = m.criar([100, 200]);
    m.bt.local.moedas.garantirConta(ids[0]!, 999);
    const r = await m.migracao.espelhar();
    // as somas contam só a carteira que o Banco conhece; a que ele não conhece entra à parte
    expect(r.corpo).toEqual({ ok: true, carteiras: 2, mudadas: 1, semConta: 1, somaAntes: 100, somaDepois: 999, somaBanco: 999, somaSemConta: 200 });
    expect(m.carteiras.ler(ids[1]!)!.saldo).toBe(200);
  });

  it('o Banco soma 200 (com uma conta negativa) e os espelhos 350: depois do espelhar somaDepois dá 200 e ok é verdadeiro', async () => {
    const m = mundo();
    const ids = m.criar([100, 250, 0]);
    m.bt.local.moedas.importarSaldos([{ id: ids[0]!, saldo: 250 }, { id: ids[1]!, saldo: -50 }, { id: ids[2]!, saldo: 0 }]);
    const r = await m.migracao.espelhar();
    expect(r).toEqual({ status: 200, corpo: { ok: true, carteiras: 3, mudadas: 2, semConta: 0, somaAntes: 350, somaDepois: 200, somaBanco: 200, somaSemConta: 0 } });
    expect(m.carteiras.ler(ids[1]!)!.saldo).toBe(-50);
    expect(m.carteiras.espelhos().reduce((t, x) => t + x.saldo, 0)).toBe(200);
  });

  it('ok só com somaDepois igual a somaBanco: se a troca não gravar tudo, 409 somas-diferentes', async () => {
    const m = mundo();
    const ids = m.criar([100, 200]);
    m.bt.local.moedas.importarSaldos([{ id: ids[0]!, saldo: 300 }, { id: ids[1]!, saldo: -10 }]);
    (m.carteiras as unknown as { trocarEspelhos(n: ReadonlyMap<string, number>): number }).trocarEspelhos = () => 0; // uma troca que não grava
    const r = await m.migracao.espelhar();
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ ok: false, erro: 'somas-diferentes', somaDepois: 300, somaBanco: 290 });
  });

  it('primeiro DRENA a caixa: o que a sinuca ainda não mandou chega ao Banco antes de o espelho ser trocado', async () => {
    const m = mundo({ chave: true });
    m.bt.fora = true;
    const c = m.carteiras.criar()!; // a conta nasce na caixa (garantir), com o Banco fora
    expect(m.carteiras.pendentesNaCaixa).toBeGreaterThan(0);
    expect(m.bt.saldo(c.id)).toBeNull();
    m.bt.fora = false;
    const r = await m.migracao.espelhar();
    expect(r.status).toBe(200);
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect(m.bt.saldo(c.id)).not.toBeNull(); // a caixa foi ao Banco
    expect(m.carteiras.ler(c.id)!.saldo).toBe(m.bt.saldo(c.id));
    expect(r.corpo).toMatchObject({ ok: true, semConta: 0 });
  });

  it('a caixa que não esvazia (o Banco segue fora): 409 caixa-cheia e nenhum espelho muda', async () => {
    const m = mundo({ chave: true });
    m.bt.fora = true;
    const c = m.carteiras.criar()!;
    const antes = m.carteiras.ler(c.id)!.saldo;
    const r = await m.migracao.espelhar();
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: 'caixa-cheia' } });
    expect(m.carteiras.ler(c.id)!.saldo).toBe(antes);
  });

  it('com sala aberta: 409 salas-abertas, sem ler o Banco', async () => {
    const m = mundo();
    m.criar([100]);
    m.salas.n = 1;
    expect(await m.migracao.espelhar()).toEqual({ status: 409, corpo: { ok: false, erro: 'salas-abertas', salas: 1 } });
    expect(m.chamadas).toEqual([]);
  });

  it('uma sala que abriu enquanto o Banco respondia: 409 e nada é gravado', async () => {
    const m = mundo();
    const ids = m.criar([100]);
    m.bt.local.moedas.garantirConta(ids[0]!, 500);
    const real = m.bt.local.migracao;
    m.banco.atual = { ...real, saldos: async (x) => { m.salas.n = 1; return real.saldos(x); } };
    const r = await m.migracao.espelhar();
    expect(r.status).toBe(409);
    expect(m.carteiras.ler(ids[0]!)!.saldo).toBe(100);
  });

  it('um espelho que mudou enquanto o Banco respondia: 409 mudou-durante e nada é gravado (não pisa numa compra)', async () => {
    const m = mundo();
    const ids = m.criar([100, 200]);
    m.bt.local.moedas.garantirConta(ids[0]!, 500);
    m.bt.local.moedas.garantirConta(ids[1]!, 500);
    const real = m.bt.local.migracao;
    m.banco.atual = { ...real, saldos: async (x) => { m.carteiras.trocarEspelhos(new Map([[ids[1]!, 150]])); return real.saldos(x); } };
    const r = await m.migracao.espelhar();
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: 'mudou-durante' } });
    expect(m.carteiras.ler(ids[0]!)!.saldo).toBe(100);
    expect(m.carteiras.ler(ids[1]!)!.saldo).toBe(150);
  });

  it('ida e volta com a chave ligada: o espelho fica com o saldo do Banco, inclusive a compra feita depois da ida', async () => {
    const m = mundo({ chave: true });
    const c = m.carteiras.criar()!;
    await m.carteiras.drenarCaixa();
    const depois = m.bt.saldo(c.id)!;
    expect((await m.migracao.levar()).corpo).toMatchObject({ ok: true, criadas: 0, iguais: 1 });
    m.bt.local.moedas.debitar(c.id, 40, 'k:compra', { jogo: 'sinuca', motivo: 'compra' });
    const r = await m.migracao.espelhar();
    expect(r.corpo).toMatchObject({ ok: true, mudadas: 1, somaAntes: depois, somaDepois: depois - 40 });
    expect(m.carteiras.ler(c.id)!.saldo).toBe(depois - 40);
  });
});
