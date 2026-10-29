/**
 * As estatísticas dentro da carteira (L38): somam por modalidade (o total é derivado), entram na mesma mudança do saldo (tudo ou
 * nada), vão ao disco junto com ele, e o arquivo de antes, sem o campo, abre.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTAGEM_ZERADA, SALDO_INICIAL, type ContagemDeEstatisticas } from '@sinuca/protocolo';
import { ArmazemDeCarteiras, type EstatisticaDaPartida, type OpcoesDoArmazem } from './carteiras';

const pastas: string[] = [];
const abertos: ArmazemDeCarteiras[] = [];
const pastaNova = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-estatisticas-'));
  pastas.push(p);
  return p;
};
afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.fechar()));
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function abrir(pasta: string | null, extra: Partial<OpcoesDoArmazem> = {}) {
  const logs: string[] = [];
  const armazem = new ArmazemDeCarteiras({
    pasta,
    maxCarteiras: 100,
    atrasoMs: 5,
    relogio: () => 1_700_000_000_000,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    ...extra,
  });
  abertos.push(armazem);
  return { armazem, logs };
}

const lerArquivo = (pasta: string) => JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; carteiras: Record<string, Record<string, unknown>> };
const contagem = (c: Partial<ContagemDeEstatisticas>): ContagemDeEstatisticas => ({ ...CONTAGEM_ZERADA, ...c });
const partida = (id: string, modalidade: EstatisticaDaPartida['modalidade'], c: Partial<ContagemDeEstatisticas>): EstatisticaDaPartida => ({ id, modalidade, contagem: contagem({ partidas: 1, ...c }) });

describe('uma carteira que nunca jogou uma partida que contou', () => {
  it('mostra tudo zerado, no total e sem modalidade nenhuma', () => {
    const { armazem } = abrir(null);
    const c = armazem.criar()!;
    expect(armazem.ler(c.id)!.estatisticas).toEqual({ total: CONTAGEM_ZERADA, modalidades: {} });
  });
});

describe('aplicar com as estatísticas da partida', () => {
  it('soma por modalidade, o total sai da soma e a maior sequência é a maior, não a soma', () => {
    const { armazem } = abrir(null);
    const id = armazem.criar()!.id;
    expect(armazem.aplicar([{ id, delta: 10 }], undefined, [partida(id, 'par-ou-impar', { vitorias: 1, bolas: 6, sequencia: 3, tabeladas: 1, missoes: 1, moedas: 60 })])).toBe(true);
    expect(armazem.aplicar([{ id, delta: -10 }], undefined, [partida(id, 'par-ou-impar', { bolas: 4, sequencia: 2 })])).toBe(true);
    expect(armazem.aplicar([], undefined, [partida(id, 'mata-mata', { vitorias: 1, bolas: 5, sequencia: 5, moedas: 20 })])).toBe(true);
    const e = armazem.ler(id)!.estatisticas!;
    expect(e.modalidades['par-ou-impar']).toEqual(contagem({ partidas: 2, vitorias: 1, bolas: 10, sequencia: 3, tabeladas: 1, missoes: 1, moedas: 60 }));
    expect(e.modalidades['mata-mata']).toEqual(contagem({ partidas: 1, vitorias: 1, bolas: 5, sequencia: 5, moedas: 20 }));
    expect(e.total).toEqual(contagem({ partidas: 3, vitorias: 2, bolas: 15, sequencia: 5, tabeladas: 1, missoes: 1, moedas: 80 }));
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL);
  });

  it('uma partida sem dinheiro (variações vazias) também entra, e avisa quem olha a carteira', () => {
    const { armazem } = abrir(null);
    const id = armazem.criar()!.id;
    const avisos: string[] = [];
    armazem.aoMudar((quem) => avisos.push(quem));
    expect(armazem.aplicar([], undefined, [partida(id, 'par-ou-impar', {})])).toBe(true);
    expect(armazem.ler(id)!.estatisticas!.total.partidas).toBe(1);
    expect(avisos).toEqual([id]);
  });

  it('o ouvinte recebe a origem de quem pagou, para a sala que pagou não ser reavisada (ela manda o próprio estado)', () => {
    const { armazem } = abrir(null);
    const id = armazem.criar()!.id;
    const origem = {};
    const vistos: unknown[] = [];
    armazem.aoMudar((_, o) => vistos.push(o));
    armazem.aplicar([{ id, delta: 1 }], origem, [partida(id, 'par-ou-impar', {})]);
    expect(vistos).toEqual([origem]);
  });

  it('a leitura é uma cópia: mexer no que ler não mexe na carteira', () => {
    const { armazem } = abrir(null);
    const id = armazem.criar()!.id;
    armazem.aplicar([], undefined, [partida(id, 'par-ou-impar', { bolas: 2 })]);
    const lida = armazem.ler(id)!.estatisticas!;
    (lida.modalidades['par-ou-impar'] as { bolas: number }).bolas = 99;
    expect(armazem.ler(id)!.estatisticas!.modalidades['par-ou-impar']!.bolas).toBe(2);
  });
});

describe('tudo ou nada com o saldo', () => {
  function duas() {
    const { armazem, logs } = abrir(null);
    return { armazem, logs, a: armazem.criar()!.id, b: armazem.criar()!.id };
  }

  it('estatística de carteira que não existe recusa também as variações', () => {
    const { armazem, logs, a } = duas();
    expect(armazem.aplicar([{ id: a, delta: 50 }], undefined, [partida('f'.repeat(64), 'par-ou-impar', {})])).toBe(false);
    expect(armazem.ler(a)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.ler(a)!.estatisticas!.total.partidas).toBe(0);
    expect(logs.some((l) => l.startsWith('carteiras-estatistica-recusada '))).toBe(true);
  });

  it('variação recusada (id repetido, delta torto) recusa também as estatísticas', () => {
    const { armazem, a, b } = duas();
    expect(armazem.aplicar([{ id: a, delta: 5 }, { id: a, delta: 5 }], undefined, [partida(b, 'par-ou-impar', { bolas: 3 })])).toBe(false);
    expect(armazem.aplicar([{ id: a, delta: 1.5 }], undefined, [partida(b, 'par-ou-impar', { bolas: 3 })])).toBe(false);
    expect(armazem.ler(a)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.ler(b)!.estatisticas!.total).toEqual(CONTAGEM_ZERADA);
  });

  it('contagem torta, repetida ou que estoura um inteiro recusa tudo: a primeira boa do lote não fica', () => {
    const { armazem, a, b } = duas();
    const boa = partida(a, 'par-ou-impar', { vitorias: 1, bolas: 2 });
    const tortas: EstatisticaDaPartida[] = [
      partida(b, 'par-ou-impar', { bolas: -1 }),
      partida(b, 'par-ou-impar', { bolas: 1.5 }),
      partida(b, 'par-ou-impar', { bolas: Number.NaN }),
      partida(b, 'par-ou-impar', { vitorias: 2 }), // mais vitórias que partidas
      partida(b, 'treino' as never, {}),
      partida(a, 'par-ou-impar', {}), // a mesma carteira e modalidade duas vezes
    ];
    for (const torta of tortas) {
      expect(armazem.aplicar([{ id: a, delta: 7 }], undefined, [boa, torta]), JSON.stringify(torta)).toBe(false);
    }
    expect(armazem.ler(a)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.ler(a)!.estatisticas!.total).toEqual(CONTAGEM_ZERADA);
    expect(armazem.ler(b)!.estatisticas!.total).toEqual(CONTAGEM_ZERADA);

    // no limite de um inteiro exato: a conta que estouraria recusa sem perder o que já havia
    armazem.aplicar([], undefined, [partida(a, 'par-ou-impar', { bolas: Number.MAX_SAFE_INTEGER - 1 })]);
    expect(armazem.aplicar([{ id: a, delta: 7 }], undefined, [partida(a, 'par-ou-impar', { bolas: 2 })])).toBe(false);
    expect(armazem.ler(a)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.ler(a)!.estatisticas!.total.bolas).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  it('duas carteiras no mesmo lote: valem as duas ou nenhuma', () => {
    const { armazem, a, b } = duas();
    expect(armazem.aplicar([{ id: a, delta: 10 }, { id: b, delta: -10 }], undefined, [partida(a, 'mata-mata', { vitorias: 1 }), partida(b, 'mata-mata', {})])).toBe(true);
    expect([armazem.ler(a)!.saldo, armazem.ler(b)!.saldo]).toEqual([110, 90]);
    expect([armazem.ler(a)!.estatisticas!.total.vitorias, armazem.ler(b)!.estatisticas!.total.partidas]).toEqual([1, 1]);
    expect(armazem.aplicar([{ id: a, delta: 10 }, { id: b, delta: -10 }], undefined, [partida(a, 'mata-mata', {}), partida('e'.repeat(64), 'mata-mata', {})])).toBe(false);
    expect([armazem.ler(a)!.saldo, armazem.ler(b)!.saldo]).toEqual([110, 90]);
    expect(armazem.ler(a)!.estatisticas!.total.partidas).toBe(1);
  });

  it('armazém fechando recusa tudo', async () => {
    const { armazem, a } = duas();
    await armazem.fechar();
    expect(armazem.aplicar([{ id: a, delta: 5 }], undefined, [partida(a, 'par-ou-impar', {})])).toBe(false);
    expect(armazem.ler(a)!.saldo).toBe(SALDO_INICIAL);
  });

  it('o saldo e as estatísticas vão ao disco na MESMA gravação', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const id = armazem.criar()!.id;
    armazem.aplicar([{ id, delta: 30 }], undefined, [partida(id, 'par-ou-impar', { vitorias: 1, bolas: 7, sequencia: 4, moedas: 30 })]);
    await armazem.descarregar();
    const guardada = lerArquivo(pasta).carteiras[id]!;
    expect(guardada.saldo).toBe(130);
    expect(guardada.estatisticas).toEqual({ 'par-ou-impar': contagem({ partidas: 1, vitorias: 1, bolas: 7, sequencia: 4, moedas: 30 }) });
    // o total NÃO é guardado: sai da soma, então nunca diverge
    expect(JSON.stringify(guardada.estatisticas)).not.toContain('total');
  });
});

describe('o arquivo', () => {
  it('reabre com as estatísticas de antes do reinício', async () => {
    const pasta = pastaNova();
    const primeiro = abrir(pasta);
    const c = primeiro.armazem.criar()!;
    primeiro.armazem.aplicar([{ id: c.id, delta: 20 }], undefined, [partida(c.id, 'mata-mata', { vitorias: 1, bolas: 3, tabeladas: 1, moedas: 20 })]);
    await primeiro.armazem.fechar();
    const { armazem } = abrir(pasta);
    expect(armazem.ler(c.id)).toMatchObject({ saldo: 120, estatisticas: { total: contagem({ partidas: 1, vitorias: 1, bolas: 3, tabeladas: 1, moedas: 20 }), modalidades: { 'mata-mata': contagem({ partidas: 1, vitorias: 1, bolas: 3, tabeladas: 1, moedas: 20 }) } } });
  });

  it('o arquivo de antes, sem o campo, abre com tudo zerado e as outras coisas intactas', async () => {
    const pasta = pastaNova();
    const primeiro = abrir(pasta);
    const c = primeiro.armazem.criar()!;
    primeiro.armazem.comprar(c.id, 'ebano');
    await primeiro.armazem.fechar();
    const original = lerArquivo(pasta);
    expect(original.carteiras[c.id]).not.toHaveProperty('estatisticas'); // quem nunca jogou uma que contou não ganha chave
    const { armazem, logs } = abrir(pasta);
    const lida = armazem.ler(c.id)!;
    expect(lida.estatisticas).toEqual({ total: CONTAGEM_ZERADA, modalidades: {} });
    expect(lida.skins).toEqual(['classico', 'ebano']);
    expect(logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(false);
  });

  it('estatística estragada abre zerada sem perder a carteira (não é dinheiro); a modalidade boa fica e a torta sai', async () => {
    const pasta = pastaNova();
    const primeiro = abrir(pasta);
    const c = primeiro.armazem.criar()!;
    primeiro.armazem.aplicar([{ id: c.id, delta: 5 }], undefined, [partida(c.id, 'par-ou-impar', { bolas: 2 })]);
    await primeiro.armazem.fechar();
    const arquivo = lerArquivo(pasta);
    const bom = contagem({ partidas: 2, vitorias: 1, bolas: 8 });
    const variantes: [string, unknown, unknown][] = [
      ['texto', 'muitas', undefined],
      ['lista', [1, 2], undefined],
      ['modalidade desconhecida', { treino: bom }, undefined],
      ['número negativo', { 'par-ou-impar': { ...bom, bolas: -1 } }, undefined],
      ['mais vitórias que partidas', { 'par-ou-impar': { ...bom, vitorias: 3 } }, undefined],
      ['chave faltando', { 'par-ou-impar': { partidas: 1 } }, undefined],
      ['número fracionário', { 'par-ou-impar': { ...bom, moedas: 1.5 } }, undefined],
      ['número em texto', { 'par-ou-impar': { ...bom, moedas: '5' } }, undefined],
      ['uma boa e uma torta', { 'par-ou-impar': bom, 'mata-mata': { ...bom, bolas: -1 } }, { 'par-ou-impar': bom }],
    ];
    for (const [nome, estatisticas, esperado] of variantes) {
      arquivo.carteiras[c.id] = { ...arquivo.carteiras[c.id]!, estatisticas };
      writeFileSync(join(pasta, 'carteiras.json'), JSON.stringify(arquivo));
      const { armazem, logs } = abrir(pasta);
      const lida = armazem.ler(c.id)!;
      expect(lida.saldo, nome).toBe(105);
      expect(logs.some((l) => l.startsWith('carteiras-corrompidas')), nome).toBe(false);
      const certo = esperado === undefined ? { total: CONTAGEM_ZERADA, modalidades: {} } : { total: bom, modalidades: esperado };
      expect(lida.estatisticas, nome).toEqual(certo);
      await armazem.fechar();
    }
  });
});
