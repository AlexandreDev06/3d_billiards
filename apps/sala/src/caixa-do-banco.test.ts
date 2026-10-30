/**
 * A caixa de saída do saldo (L57), sem carteira nem sala: a lista e a forma das operações, as chaves, e o despachante com um Banco de
 * mentira (as operações em ordem, a falha passageira que para e espera 5 s a 5 min, a recusa definitiva que sai da fila).
 */
import { describe, expect, it } from 'vitest';
import type { ResultadoDeMoeda } from '@sinuca/conta/contrato';
import type { BancoDaCaixa } from './banco-da-sala';
import {
  CaixaDeSaida,
  DespachanteDoBanco,
  ESPERA_MAXIMA_MS,
  ESPERA_MINIMA_MS,
  chaveDaAposta,
  chaveDaMissao,
  chaveDoPresente,
  entradaValida,
  entradasDoArquivo,
  entradaMortaValida,
  esperaDepoisDeFalhar,
  GOLPES_ATE_MORRER,
  MAX_DO_ROTULO_DO_PRESENTE,
  mortasDoArquivo,
  operacaoValida,
  type EntradaDaCaixa,
  type OperacaoDoBanco,
} from './caixa-do-banco';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const CHAVE_VALIDA = /^[a-z0-9:._-]{1,120}$/;

describe('a lista', () => {
  it('as ordens crescem, a primeira sai primeiro e apagar tira da frente', () => {
    const caixa = new CaixaDeSaida(() => 5);
    caixa.empilhar({ tipo: 'garantir', id: A, saldo: 100 });
    caixa.empilhar({ tipo: 'devolver', chave: 'aposta:x' });
    expect(caixa.entradas.map((e) => e.ordem)).toEqual([1, 2]);
    expect(caixa.primeira()).toMatchObject({ ordem: 1, tentativas: 0, criadaEm: 5 });
    caixa.apagar(1);
    expect(caixa.primeira()?.ordem).toBe(2);
    caixa.contarFalha(2);
    expect(caixa.primeira()?.tentativas).toBe(1);
  });

  it('carregar continua depois da maior ordem, inclusive a de uma linha que não prestou', () => {
    const caixa = new CaixaDeSaida(() => 0);
    caixa.carregar([{ ordem: 4, op: { tipo: 'devolver', chave: 'k' }, tentativas: 2, criadaEm: 1 }], 9);
    expect(caixa.empilhar({ tipo: 'devolver', chave: 'j' }).ordem).toBe(10);
  });

  it('só rastreia as sujas quando o armazenamento pede', () => {
    const caixa = new CaixaDeSaida(() => 0);
    caixa.empilhar({ tipo: 'devolver', chave: 'k' });
    expect(caixa.sujas.size).toBe(0);
    caixa.rastreiaSujas = true;
    const e = caixa.empilhar({ tipo: 'devolver', chave: 'k2' });
    caixa.apagar(e.ordem);
    expect([...caixa.sujas]).toEqual([e.ordem]);
    expect(caixa.buscar(e.ordem)).toBeUndefined();
  });
});

describe('a forma das operações guardadas', () => {
  const boas: OperacaoDoBanco[] = [
    { tipo: 'garantir', id: A, saldo: 100 },
    { tipo: 'creditar', id: A, valor: 50, chave: `presente:skins-cs:${A}`, motivo: 'presente' },
    { tipo: 'reservar', chave: 'aposta:sinuca-7k2p:1:2', lote: [{ id: A, valor: 10 }, { id: B, valor: 10 }] },
    { tipo: 'liquidar', chave: 'aposta:sinuca-7k2p:1:2', variacoes: [{ id: A, delta: 10 }, { id: B, delta: -10 }] },
    { tipo: 'devolver', chave: 'aposta:sinuca-7k2p:1:2' },
  ];
  it.each(boas.map((o) => [o.tipo, o] as const))('%s presta e volta igual', (_t, op) => {
    expect(operacaoValida(JSON.parse(JSON.stringify(op)))).toEqual(op);
  });
  it.each([
    ['tipo desconhecido', { tipo: 'aplicar' }],
    ['id curto', { tipo: 'garantir', id: 'abc', saldo: 100 }],
    ['saldo negativo', { tipo: 'garantir', id: A, saldo: -1 }],
    ['crédito zero', { tipo: 'creditar', id: A, valor: 0, chave: 'k', motivo: 'missao' }],
    ['motivo desconhecido', { tipo: 'creditar', id: A, valor: 1, chave: 'k', motivo: 'compra' }],
    ['chave com maiúscula', { tipo: 'devolver', chave: 'Aposta:X' }],
    ['chave longa', { tipo: 'devolver', chave: 'a'.repeat(121) }],
    ['reserva vazia', { tipo: 'reservar', chave: 'k', lote: [] }],
    ['variação zero', { tipo: 'liquidar', chave: 'k', variacoes: [{ id: A, delta: 0 }] }],
    ['não é objeto', 'garantir'],
  ])('%s não presta', (_nome, op) => {
    expect(operacaoValida(op)).toBeNull();
  });

  it('a entrada pede ordem, tentativas e criadaEm; o campo saida do arquivo conta as que não prestam e ignora ordem repetida', () => {
    const boa = { ordem: 1, op: { tipo: 'devolver', chave: 'k' }, tentativas: 0, criadaEm: 7 };
    expect(entradaValida(boa)).toEqual(boa);
    expect(entradaValida({ ...boa, ordem: 0 })).toBeNull();
    expect(entradaValida({ ...boa, tentativas: -1 })).toBeNull();
    expect(entradasDoArquivo([boa, boa, { ordem: 2 }, { ...boa, ordem: 3 }])).toMatchObject({ invalidas: 2, entradas: [{ ordem: 1 }, { ordem: 3 }] });
    expect(entradasDoArquivo(undefined)).toEqual({ entradas: [], invalidas: 0 });
    expect(entradasDoArquivo('x')).toMatchObject({ invalidas: 1 });
  });
});

describe('as chaves cabem no ehChave do Banco (minúsculas, até 120)', () => {
  it('presente, missão e aposta, nos tamanhos mais largos', () => {
    const rotulo = 'a'.repeat(MAX_DO_ROTULO_DO_PRESENTE);
    expect(chaveDoPresente(rotulo, A)).toMatch(CHAVE_VALIDA);
    expect(chaveDaMissao('2026-10-29', 'volta-ao-mundo', A)).toMatch(CHAVE_VALIDA);
    expect(chaveDaAposta('SINUCA-7K2P', 1_800_000_000_000, 4_294_967_295)).toBe('sinuca:aposta:sinuca-7k2p:1800000000000:4294967295');
    expect(chaveDaAposta('SINUCA-7K2P', 1_800_000_000_000, 4_294_967_295)).toMatch(CHAVE_VALIDA);
    expect(chaveDoPresente(rotulo, A).length).toBeLessThanOrEqual(120);
  });
  it('todas começam com o nome do jogo (o Banco é de todos) e a da aposta cabe nos 110 da reserva', () => {
    expect(chaveDoPresente('skins-cs', A)).toBe(`sinuca:presente:skins-cs:${A}`);
    expect(chaveDaMissao('2026-10-29', 'maos-quentes', A)).toBe(`sinuca:missao:2026-10-29:maos-quentes:${A}`);
    // o rótulo de 39 caracteres é o mais largo que cabe; a sala de código longo e os maiores números da aposta também
    expect(chaveDoPresente('a'.repeat(MAX_DO_ROTULO_DO_PRESENTE), A).length).toBe(120);
    expect(chaveDaAposta('Z'.repeat(40), Number.MAX_SAFE_INTEGER, 4_294_967_295).length).toBeLessThanOrEqual(110);
    expect(chaveDaAposta('SINUCA-7K2P', 1_800_000_000_000, 4_294_967_295).length).toBeLessThanOrEqual(110);
  });
});

describe('a espera depois de falhar', () => {
  it('5 s, 10 s, 20 s... e nunca mais de 5 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(esperaDepoisDeFalhar)).toEqual([5000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000]);
    expect(ESPERA_MINIMA_MS).toBe(5000);
    expect(ESPERA_MAXIMA_MS).toBe(300_000);
  });
});

describe('o despachante', () => {
  interface Chamada {
    nome: string;
    args: unknown[];
  }
  function montar() {
    const caixa = new CaixaDeSaida(() => agora.valor);
    const agora = { valor: 1000 };
    const chamadas: Chamada[] = [];
    const saidas: { ordem: number; saldos: Record<string, number> | null }[] = [];
    const logs: string[] = [];
    const comportamento: { proximo: (nome: string) => ResultadoDeMoeda | Error | 'ok' } = { proximo: () => 'ok' };
    /** A sonda (`saldo`): com o Banco vivo ela responde; fora do ar ela lança como as escritas. */
    const sonda = { viva: false, chamadas: 0 };
    const mortas: { ordem: number; erro: string }[] = [];
    const seguradas = new Set<string>();
    const resposta = (nome: string): ResultadoDeMoeda => {
      const r = comportamento.proximo(nome);
      if (r instanceof Error) throw r;
      return r === 'ok' ? { ok: true, saldos: { [A]: 100 }, repetida: false } : r;
    };
    const banco: BancoDaCaixa = {
      garantirConta: async (...args) => (chamadas.push({ nome: 'garantirConta', args }), { criada: true, saldo: (resposta('garantirConta') as { saldos: Record<string, number> }).saldos[A] ?? 0 }),
      creditar: async (...args) => (chamadas.push({ nome: 'creditar', args }), resposta('creditar')),
      reservar: async (...args) => (chamadas.push({ nome: 'reservar', args }), resposta('reservar')),
      liquidar: async (...args) => (chamadas.push({ nome: 'liquidar', args }), resposta('liquidar')),
      devolver: async (...args) => (chamadas.push({ nome: 'devolver', args }), resposta('devolver')),
      saldo: async () => {
        sonda.chamadas++;
        if (!sonda.viva) throw new Error('banco fora do ar');
        return null;
      },
    };
    let agendou = 0;
    const d = new DespachanteDoBanco({
      caixa,
      banco,
      relogio: () => agora.valor,
      log: (e, c = {}) => logs.push(`${e} ${JSON.stringify(c)}`),
      aoSair: (entrada: EntradaDaCaixa, saldos) => {
        caixa.apagar(entrada.ordem);
        saidas.push({ ordem: entrada.ordem, saldos: saldos === null ? null : { ...saldos } });
      },
      aoFalhar: (entrada) => caixa.contarFalha(entrada.ordem),
      aoMorrer: (entrada, erro) => {
        caixa.matar(entrada.ordem, erro);
        mortas.push({ ordem: entrada.ordem, erro });
      },
      seguradas: () => seguradas,
      aoAgendar: () => void agendou++,
      encerrado: () => false,
    });
    return { caixa, d, agora, chamadas, saidas, logs, comportamento, sonda, mortas, seguradas, agendadas: () => agendou };
  }

  it('manda em ordem, uma de cada vez, e a caixa esvazia; sem nada, não chama o Banco', async () => {
    const m = montar();
    await m.d.drenar();
    expect(m.chamadas).toEqual([]);
    m.caixa.empilhar({ tipo: 'garantir', id: A, saldo: 100 });
    m.caixa.empilhar({ tipo: 'creditar', id: A, valor: 5, chave: 'k:1', motivo: 'missao' });
    m.caixa.empilhar({ tipo: 'devolver', chave: 'aposta:z' });
    await m.d.drenar();
    expect(m.chamadas.map((c) => c.nome)).toEqual(['garantirConta', 'creditar', 'devolver']);
    expect(m.chamadas[1]!.args).toEqual([A, 5, 'k:1', { jogo: 'sinuca', motivo: 'missao' }]);
    expect(m.saidas.map((s) => s.ordem)).toEqual([1, 2, 3]);
    expect(m.caixa.vazia).toBe(true);
    expect(m.d.proximaTentativaEm).toBeNull();
  });

  it('o lançamento leva jogo sinuca e o motivo (aposta na reserva e no pagamento)', async () => {
    const m = montar();
    m.caixa.empilhar({ tipo: 'reservar', chave: 'k', lote: [{ id: A, valor: 10 }] });
    m.caixa.empilhar({ tipo: 'liquidar', chave: 'k', variacoes: [{ id: A, delta: 10 }] });
    await m.d.drenar();
    expect(m.chamadas.map((c) => c.args.at(-1))).toEqual([{ jogo: 'sinuca', motivo: 'aposta' }, { jogo: 'sinuca', motivo: 'aposta' }]);
  });

  it('falha passageira: para na operação que falhou, conta a tentativa, deixa o resto e espera 5 s', async () => {
    const m = montar();
    for (const chave of ['a', 'b', 'c']) m.caixa.empilhar({ tipo: 'devolver', chave });
    let n = 0;
    m.comportamento.proximo = () => (++n === 2 ? new Error('rede') : 'ok');
    await m.d.drenar();
    expect(m.saidas.map((s) => s.ordem)).toEqual([1]);
    expect(m.caixa.entradas.map((e) => [e.ordem, e.tentativas])).toEqual([[2, 1], [3, 0]]);
    expect(m.logs.some((l) => l.startsWith('banco-fora ') && l.includes('"esperaS":5'))).toBe(true);
    expect(m.d.proximaTentativaEm).toBe(1000 + 5000);

    // dentro da espera, nada é chamado; cada nova tentativa que falha dobra a espera
    const antes = m.chamadas.length;
    await m.d.drenar();
    expect(m.chamadas.length).toBe(antes);
    m.comportamento.proximo = () => new Error('rede');
    m.agora.valor += 5000;
    await m.d.drenar();
    expect(m.d.proximaTentativaEm).toBe(m.agora.valor + 10_000);
    expect(m.caixa.primeira()?.tentativas).toBe(2);

    // volta o Banco: drena o resto, a espera zera
    m.comportamento.proximo = () => 'ok';
    m.agora.valor += 10_000;
    await m.d.drenar();
    expect(m.caixa.vazia).toBe(true);
    expect(m.saidas.map((s) => s.ordem)).toEqual([1, 2, 3]);
    expect(m.d.falhasConsecutivas).toBe(0);
  });

  it('recusa definitiva: loga banco-recusou com o tipo e o erro, tira a operação e segue; o log não leva o id inteiro', async () => {
    const m = montar();
    m.caixa.empilhar({ tipo: 'creditar', id: A, valor: 5, chave: `presente:x:${A}`, motivo: 'presente' });
    m.caixa.empilhar({ tipo: 'devolver', chave: 'aposta:z' });
    let n = 0;
    m.comportamento.proximo = () => (++n === 1 ? { ok: false, erro: 'conta-inexistente' } : 'ok');
    await m.d.drenar();
    expect(m.saidas).toEqual([{ ordem: 1, saldos: null }, { ordem: 2, saldos: { [A]: 100 } }]);
    const recusou = m.logs.filter((l) => l.startsWith('banco-recusou '));
    expect(recusou).toEqual([`banco-recusou {"tipo":"creditar","erro":"conta-inexistente","conta":"${A.slice(0, 8)}"}`]);
    expect(m.logs.join('\n')).not.toContain(A);
    expect(m.logs.join('\n')).not.toContain('presente:x');
  });

  it('argumento mal formado (RangeError) é recusa definitiva, não falha passageira', async () => {
    const m = montar();
    m.caixa.empilhar({ tipo: 'devolver', chave: 'a' });
    m.caixa.empilhar({ tipo: 'devolver', chave: 'b' });
    let n = 0;
    m.comportamento.proximo = () => (++n === 1 ? new RangeError('id de conta inválido') : 'ok');
    await m.d.drenar();
    expect(m.caixa.vazia).toBe(true);
    expect(m.logs.some((l) => l.startsWith('banco-recusou ') && l.includes('argumento-invalido'))).toBe(true);
    expect(m.d.falhasConsecutivas).toBe(0);
  });

  it('uma passada só por vez: dois drenar ao mesmo tempo mandam cada operação uma vez', async () => {
    const m = montar();
    m.caixa.empilhar({ tipo: 'devolver', chave: 'a' });
    m.caixa.empilhar({ tipo: 'devolver', chave: 'b' });
    await Promise.all([m.d.drenar(), m.d.drenar(), m.d.drenar()]);
    expect(m.chamadas.length).toBe(2);
  });

  it('cutucar agenda a passada para depois do código de agora (nunca dentro dele) e avisa quem acorda', async () => {
    const m = montar();
    const antes = m.agendadas();
    m.caixa.empilhar({ tipo: 'devolver', chave: 'a' });
    m.d.cutucar();
    expect(m.chamadas.length).toBe(0);
    expect(m.agendadas()).toBeGreaterThan(antes);
    await m.d.esperar();
    await Promise.resolve();
    await m.d.esperar();
    expect(m.chamadas.length).toBe(1);
  });

  it('com a caixa cheia e sem falha, a próxima tentativa é daqui a 5 s (o prazo de uma passada normal)', () => {
    const m = montar();
    m.caixa.empilhar({ tipo: 'devolver', chave: 'a' });
    expect(m.d.proximaTentativaEm).toBe(1000 + ESPERA_MINIMA_MS);
  });
  describe('a operação envenenada (L60b)', () => {
    it('com o Banco vivo, uma entrada que sempre lança leva golpes (5 s, 10 s, 20 s, 40 s) e no quinto vai para as mortas; as de trás passam', async () => {
      const m = montar();
      m.sonda.viva = true;
      m.caixa.empilhar({ tipo: 'creditar', id: A, valor: 5, chave: `sinuca:presente:x:${A}`, motivo: 'presente' });
      m.caixa.empilhar({ tipo: 'devolver', chave: 'sinuca:aposta:z' });
      m.caixa.empilhar({ tipo: 'devolver', chave: 'sinuca:aposta:y' });
      m.comportamento.proximo = (nome) => (nome === 'creditar' ? new Error('operação torta') : 'ok');

      await m.d.drenar();
      expect(m.caixa.entradas.map((e) => e.ordem)).toEqual([1, 2, 3]); // o primeiro golpe: a fila espera atrás dela
      expect(m.d.proximaTentativaEm).toBe(1000 + 5000);
      const esperas = [5000, 10_000, 20_000, 40_000];
      for (let golpe = 2; golpe <= GOLPES_ATE_MORRER; golpe++) {
        m.agora.valor += esperas[golpe - 2]!;
        await m.d.drenar();
        if (golpe < GOLPES_ATE_MORRER) expect(m.caixa.entradas.map((e) => e.ordem)).toEqual([1, 2, 3]);
      }
      expect(m.caixa.entradas.map((e) => e.ordem)).toEqual([]);
      expect(m.mortas).toEqual([{ ordem: 1, erro: 'operação torta' }]);
      expect(m.caixa.mortas.map((e) => e.ordem)).toEqual([1]);
      expect(m.saidas.map((s) => s.ordem)).toEqual([2, 3]); // as de trás passaram no mesmo instante da morte
      expect(m.chamadas.filter((c) => c.nome === 'creditar')).toHaveLength(GOLPES_ATE_MORRER);
      expect(m.d.falhasConsecutivas).toBe(0);
    });

    it('o log banco-envenenada leva o tipo e o erro, sem o id inteiro nem a chave', async () => {
      const m = montar();
      m.sonda.viva = true;
      m.caixa.empilhar({ tipo: 'creditar', id: A, valor: 5, chave: `sinuca:presente:x:${A}`, motivo: 'presente' });
      m.comportamento.proximo = () => new Error('operação torta');
      for (let i = 0; i < GOLPES_ATE_MORRER; i++) {
        m.agora.valor += 300_000;
        await m.d.drenar();
      }
      const envenenada = m.logs.filter((l) => l.startsWith('banco-envenenada '));
      expect(envenenada).toHaveLength(1);
      expect(envenenada[0]).toContain('"tipo":"creditar"');
      expect(envenenada[0]).toContain('operação torta');
      expect(m.logs.join('\n')).not.toContain(A);
      expect(m.logs.join('\n')).not.toContain('sinuca:presente');
    });

    it('com o Banco fora do ar (a sonda também falha), é espera sem golpe: a entrada nunca morre', async () => {
      const m = montar();
      m.sonda.viva = false;
      m.caixa.empilhar({ tipo: 'devolver', chave: 'sinuca:aposta:a' });
      m.comportamento.proximo = () => new Error('rede');
      for (let i = 0; i < GOLPES_ATE_MORRER * 3; i++) {
        m.agora.valor += 300_000;
        await m.d.drenar();
      }
      expect(m.caixa.entradas).toHaveLength(1);
      expect(m.mortas).toEqual([]);
      expect(m.logs.some((l) => l.startsWith('banco-golpe ') || l.startsWith('banco-envenenada '))).toBe(false);
      expect(m.d.falhasConsecutivas).toBe(GOLPES_ATE_MORRER * 3);
    });

    it('reenviarMortas põe todas de volta no fim da fila, com ordem nova e zero tentativas', () => {
      const caixa = new CaixaDeSaida(() => 7);
      for (const chave of ['a', 'b', 'c']) caixa.empilhar({ tipo: 'devolver', chave });
      caixa.contarFalha(1);
      caixa.matar(1, 'x'.repeat(300));
      caixa.matar(2, 'y');
      expect(caixa.entradas.map((e) => e.ordem)).toEqual([3]);
      expect(caixa.mortas.map((e) => [e.ordem, e.erro.length])).toEqual([[1, 100], [2, 1]]);
      expect(caixa.reenviarMortas()).toBe(2);
      expect(caixa.mortas).toEqual([]);
      expect(caixa.entradas.map((e) => [e.ordem, e.tentativas])).toEqual([[3, 0], [4, 0], [5, 0]]);
      expect(caixa.reenviarMortas()).toBe(0);
    });

    it('a forma da morta guardada: a que não presta não é lida; a ordem nova passa da maior das duas listas', () => {
      const boa = { ordem: 4, op: { tipo: 'devolver', chave: 'a' }, tentativas: 1, criadaEm: 1, morreuEm: 2, erro: 'x' };
      expect(entradaMortaValida(boa)).toMatchObject({ ordem: 4, morreuEm: 2 });
      expect(mortasDoArquivo([boa, boa, { ...boa, ordem: 5, erro: 7 }, { ...boa, ordem: 6, morreuEm: 'x' }])).toMatchObject({ invalidas: 3, mortas: [{ ordem: 4 }] });
      expect(mortasDoArquivo(undefined)).toEqual({ mortas: [], invalidas: 0 });
      const caixa = new CaixaDeSaida(() => 1);
      caixa.carregarMortas([entradaMortaValida(boa)!], 9);
      caixa.carregar([], 2);
      expect(caixa.empilhar({ tipo: 'devolver', chave: 'n' }).ordem).toBe(10);
    });
  });

  describe('a compra em voo segura a conta (L60b)', () => {
    it('as operações da conta esperam; as das outras contas seguem; a ordem de cada conta não se inverte', async () => {
      const m = montar();
      m.seguradas.add(A);
      m.caixa.empilhar({ tipo: 'creditar', id: A, valor: 5, chave: 'k:1', motivo: 'missao' });
      m.caixa.empilhar({ tipo: 'creditar', id: B, valor: 7, chave: 'k:2', motivo: 'missao' });
      m.caixa.empilhar({ tipo: 'reservar', chave: 'sinuca:aposta:r', lote: [{ id: A, valor: 1 }, { id: B, valor: 1 }] });
      m.caixa.empilhar({ tipo: 'creditar', id: B, valor: 9, chave: 'k:3', motivo: 'missao' }); // B depois de uma operação parada que também é de B
      m.caixa.empilhar({ tipo: 'liquidar', chave: 'sinuca:aposta:r', variacoes: [{ id: B, delta: 1 }] }); // a reserva está parada
      m.caixa.empilhar({ tipo: 'devolver', chave: 'sinuca:aposta:r' });
      m.caixa.empilhar({ tipo: 'devolver', chave: 'sinuca:aposta:outra' });
      await m.d.drenar();
      expect(m.chamadas.map((c) => c.nome)).toEqual(['creditar', 'devolver']);
      expect(m.chamadas.map((c) => c.args[2] ?? c.args[0])).toEqual(['k:2', 'sinuca:aposta:outra']);
      expect(m.caixa.entradas.map((e) => e.ordem)).toEqual([1, 3, 4, 5, 6]);

      m.seguradas.clear();
      await m.d.drenar();
      expect(m.caixa.vazia).toBe(true);
      expect(m.chamadas.slice(2).map((c) => c.nome)).toEqual(['creditar', 'reservar', 'creditar', 'liquidar', 'devolver']);
    });

    it('com todas as entradas seguradas a passada termina sem chamar o Banco', async () => {
      const m = montar();
      m.seguradas.add(A);
      m.caixa.empilhar({ tipo: 'creditar', id: A, valor: 5, chave: 'k:1', motivo: 'missao' });
      await m.d.drenar();
      expect(m.chamadas).toEqual([]);
      expect(m.caixa.entradas).toHaveLength(1);
    });
  });
});
