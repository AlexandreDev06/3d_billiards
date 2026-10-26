/**
 * O progresso das missões diárias dentro da carteira (L31): soma e máximo, o prêmio do nível pago uma vez por dia, o dia que
 * vira, o disco (arquivo de antes sem o campo, campo estragado) e os avisos às outras salas.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PREMIO_POR_NIVEL, SALDO_INICIAL, diaDaMissao, missaoDoCatalogo, missoesDoDia, type IdMissao } from '@sinuca/protocolo';
import { ArmazemDeCarteiras, type OpcoesDoArmazem } from './carteiras';

const HOJE = Date.parse('2026-10-26T15:00:00Z');
const DIA_MS = 86_400_000;

const pastas: string[] = [];
const abertos: ArmazemDeCarteiras[] = [];
afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.fechar()));
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function abrir(extra: Partial<OpcoesDoArmazem> & { agora?: { valor: number } } = {}) {
  const agora = extra.agora ?? { valor: HOJE };
  const logs: string[] = [];
  const armazem = new ArmazemDeCarteiras({
    pasta: null,
    maxCarteiras: 100,
    atrasoMs: 5,
    relogio: () => agora.valor,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    ...extra,
  });
  abertos.push(armazem);
  return { armazem, logs, agora };
}

const nova = (a: ArmazemDeCarteiras): string => a.criar()!.id;
/** As três de hoje, por nível. */
const doDia = (agora: number): { facil: IdMissao; media: IdMissao; dificil: IdMissao } => {
  const [facil, media, dificil] = missoesDoDia(diaDaMissao(agora)).map((m) => m.id);
  return { facil: facil!, media: media!, dificil: dificil! };
};
const meta = (id: IdMissao): number => missaoDoCatalogo(id).meta;
const itemDe = (a: ArmazemDeCarteiras, id: string, missao: IdMissao) => a.ler(id)!.missoes!.itens.find((i) => i.id === missao)!;

describe('o quadro de missões que a carteira mostra', () => {
  it('carteira nova: o dia, o fim do dia, as 3 de hoje (uma de cada nível) e tudo em zero', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    const q = armazem.ler(id)!.missoes!;
    expect(q.dia).toBe('2026-10-26');
    expect(q.fimMs).toBe(Date.parse('2026-10-27T03:00:00Z'));
    expect(q.itens.map((i) => i.id)).toEqual(missoesDoDia('2026-10-26').map((m) => m.id));
    expect(q.itens.map((i) => missaoDoCatalogo(i.id).nivel)).toEqual(['facil', 'media', 'dificil']);
    for (const i of q.itens) expect(i, i.id).toMatchObject({ progresso: 0, cumprida: false, meta: meta(i.id) });
  });

  it('é uma cópia: mexer no que ler não mexe na carteira', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    (armazem.ler(id)!.missoes!.itens as unknown as { progresso: number }[])[0]!.progresso = 99;
    expect(armazem.ler(id)!.missoes!.itens[0]!.progresso).toBe(0);
  });
});

describe('registrarMissoes: progresso e prêmio', () => {
  it('missão de soma acumula entre chamadas e só paga ao chegar à meta; o prêmio é o do nível', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    const { facil } = doDia(HOJE);
    const m = meta(facil);
    for (let i = 1; i < m; i++) {
      const r = armazem.registrarMissoes(id, { [facil]: 1 })!;
      expect(r.cumpridas).toEqual([]);
      expect(itemDe(armazem, id, facil)).toMatchObject({ progresso: i, cumprida: false });
      expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL);
    }
    const r = armazem.registrarMissoes(id, { [facil]: 1 })!;
    expect(r.cumpridas).toEqual([facil]);
    expect(r.missoes.itens.find((i) => i.id === facil)).toMatchObject({ progresso: m, cumprida: true });
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + PREMIO_POR_NIVEL.facil);
  });

  it('cada nível paga o seu: fácil 50, média 70, difícil 100; as três na mesma chamada somam 220', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    const { facil, media, dificil } = doDia(HOJE);
    const r = armazem.registrarMissoes(id, { [facil]: meta(facil), [media]: meta(media), [dificil]: meta(dificil) })!;
    expect([...r.cumpridas].sort()).toEqual([facil, media, dificil].sort());
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + 50 + 70 + 100);
  });

  it('missão de máximo (Embalado) guarda o melhor valor, não a soma: 1 e depois 1 de novo continua 1; 2 cumpre e paga 70', () => {
    let dia = HOJE;
    while (!missoesDoDia(diaDaMissao(dia)).some((m) => m.id === 'embalado')) dia += DIA_MS;
    const { armazem } = abrir({ agora: { valor: dia } });
    const id = nova(armazem);
    armazem.registrarMissoes(id, { embalado: 1 });
    expect(armazem.registrarMissoes(id, { embalado: 1 })).toBeNull(); // 1 não passa do melhor, que já é 1
    expect(itemDe(armazem, id, 'embalado')).toMatchObject({ progresso: 1, cumprida: false });
    const r = armazem.registrarMissoes(id, { embalado: 2 })!;
    expect(r.cumpridas).toEqual(['embalado']);
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + PREMIO_POR_NIVEL.media);
  });

  it('o catálogo todo funciona: toda missão de máximo pega o maior valor e a de soma soma (dia a dia até cobrir o catálogo)', () => {
    const vistas = new Set<IdMissao>();
    for (let d = 0; d < 400 && vistas.size < 15; d++) {
      const agora = { valor: HOJE + d * DIA_MS };
      const { armazem } = abrir({ agora });
      const id = nova(armazem);
      for (const m of missoesDoDia(diaDaMissao(agora.valor))) {
        vistas.add(m.id);
        armazem.registrarMissoes(id, { [m.id]: 1 });
        armazem.registrarMissoes(id, { [m.id]: 1 });
        const esperado = Math.min(m.acumulo === 'soma' ? 2 : 1, m.meta);
        expect(itemDe(armazem, id, m.id).progresso, `${m.id} no dia ${diaDaMissao(agora.valor)}`).toBe(esperado);
      }
    }
    expect(vistas.size).toBe(15);
  });

  it('pago uma vez por dia: depois da meta, mais valores não pagam nem mexem no progresso; a chamada devolve null', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    const { dificil } = doDia(HOJE);
    expect(armazem.registrarMissoes(id, { [dificil]: meta(dificil) })!.cumpridas).toEqual([dificil]);
    const saldo = armazem.ler(id)!.saldo;
    expect(armazem.registrarMissoes(id, { [dificil]: 5 })).toBeNull();
    expect(armazem.ler(id)!.saldo).toBe(saldo);
    expect(itemDe(armazem, id, dificil)).toMatchObject({ progresso: meta(dificil), cumprida: true });
  });

  it('o progresso não passa da meta quando o valor passa (5 de uma vez numa de meta 2)', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    const { facil } = doDia(HOJE);
    armazem.registrarMissoes(id, { [facil]: 50 });
    expect(itemDe(armazem, id, facil).progresso).toBe(meta(facil));
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + 50);
  });

  it('missão que não é das 3 de hoje é ignorada: nada anda, null', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    const hoje = new Set(missoesDoDia('2026-10-26').map((m) => m.id));
    const fora = (['mao-quente', 'tabelada', 'fecha-a-conta', 'siga', 'limpinho', 'pelo-meio'] as IdMissao[]).find((m) => !hoje.has(m))!;
    expect(armazem.registrarMissoes(id, { [fora]: 9 })).toBeNull();
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.registrarMissoes(id, {})).toBeNull();
  });

  it('carteira que não existe: null', () => {
    const { armazem } = abrir();
    expect(armazem.registrarMissoes('f'.repeat(64), { 'mao-quente': 1 })).toBeNull();
  });

  it('valor inválido (zero, negativo, quebrado, NaN, infinito) recusa a chamada inteira, até o que era válido nela', () => {
    const { armazem, logs } = abrir();
    const id = nova(armazem);
    const { facil, media } = doDia(HOJE);
    for (const ruim of [0, -1, 1.5, NaN, Infinity, 2 ** 60]) {
      expect(armazem.registrarMissoes(id, { [facil]: 1, [media]: ruim }), String(ruim)).toBeNull();
    }
    expect(itemDe(armazem, id, facil).progresso).toBe(0);
    expect(logs.some((l) => l.startsWith('carteiras-missao-recusada'))).toBe(true);
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL);
  });

  it('o prêmio que estouraria o limite seguro do saldo recusa tudo, sem mexer no progresso', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    armazem.aplicar([{ id, delta: Number.MAX_SAFE_INTEGER - SALDO_INICIAL - 10 }]);
    const { facil } = doDia(HOJE);
    expect(armazem.registrarMissoes(id, { [facil]: meta(facil) })).toBeNull();
    expect(itemDe(armazem, id, facil).progresso).toBe(0);
  });

  it('duas carteiras andam cada uma por si', () => {
    const { armazem } = abrir();
    const a = nova(armazem);
    const b = nova(armazem);
    const { facil } = doDia(HOJE);
    armazem.registrarMissoes(a, { [facil]: meta(facil) });
    expect(itemDe(armazem, a, facil).cumprida).toBe(true);
    expect(itemDe(armazem, b, facil)).toMatchObject({ progresso: 0, cumprida: false });
    expect(armazem.ler(b)!.saldo).toBe(SALDO_INICIAL);
  });

  it('encerrado (o servidor está saindo): recusa', async () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    await armazem.fechar();
    const { facil } = doDia(HOJE);
    expect(armazem.registrarMissoes(id, { [facil]: 1 })).toBeNull();
  });

  it('quem recebe o prêmio nunca mais é reaproveitado no teto de carteiras (dinheiro que mexe é de quem jogou)', () => {
    const { armazem } = abrir({ maxCarteiras: 1 });
    const id = nova(armazem);
    const { facil } = doDia(HOJE);
    armazem.registrarMissoes(id, { [facil]: meta(facil) });
    armazem.aplicar([{ id, delta: -(50) }]); // o saldo volta a 100, como uma carteira nunca usada
    expect(armazem.criar()).toBeNull();
  });
});

describe('o dia vira', () => {
  it('à meia-noite de Brasília o progresso de ontem some, o quadro troca e as missões pagam de novo', () => {
    const { armazem, agora } = abrir({ agora: { valor: Date.parse('2026-10-26T23:00:00Z') } }); // 20h em Brasília
    const id = nova(armazem);
    const ontem = doDia(agora.valor);
    armazem.registrarMissoes(id, { [ontem.facil]: meta(ontem.facil) });
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + 50);

    agora.valor = Date.parse('2026-10-27T02:59:59Z'); // 23h59 ainda
    expect(armazem.ler(id)!.missoes!.dia).toBe('2026-10-26');
    expect(itemDe(armazem, id, ontem.facil).cumprida).toBe(true);

    agora.valor = Date.parse('2026-10-27T03:00:00Z'); // meia-noite
    const q = armazem.ler(id)!.missoes!;
    expect(q.dia).toBe('2026-10-27');
    for (const i of q.itens) expect(i, i.id).toMatchObject({ progresso: 0, cumprida: false });
    const hoje = doDia(agora.valor);
    const r = armazem.registrarMissoes(id, { [hoje.facil]: meta(hoje.facil) })!;
    expect(r.cumpridas).toEqual([hoje.facil]);
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + 100);
  });

  it('a mesma missão que se repete em dois dias (catálogo pequeno) paga em cada dia', () => {
    const { armazem, agora } = abrir();
    const id = nova(armazem);
    let pagos = 0;
    for (let d = 0; d < 6; d++) {
      agora.valor = HOJE + d * DIA_MS;
      const { facil } = doDia(agora.valor);
      pagos += armazem.registrarMissoes(id, { [facil]: meta(facil) })!.cumpridas.length;
    }
    expect(pagos).toBe(6);
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + 6 * 50);
  });
});

describe('avisos às outras salas', () => {
  it('o prêmio avisa os ouvintes (o saldo mudou), com a origem; progresso sem prêmio não avisa ninguém', () => {
    const { armazem } = abrir();
    const id = nova(armazem);
    const avisos: [string, unknown][] = [];
    armazem.aoMudar((i, origem) => avisos.push([i, origem]));
    const origem = { sala: 'x' };
    const { facil } = doDia(HOJE);
    if (meta(facil) > 1) {
      armazem.registrarMissoes(id, { [facil]: 1 }, origem);
      expect(avisos).toEqual([]);
    }
    armazem.registrarMissoes(id, { [facil]: meta(facil) }, origem);
    expect(avisos).toEqual([[id, origem]]);
  });
});

describe('no disco', () => {
  const pasta = (): string => {
    const p = mkdtempSync(join(tmpdir(), 'sala-carteiras-missoes-'));
    pastas.push(p);
    return p;
  };

  it('o progresso e o dia sobrevivem a fechar e reabrir; no dia seguinte o reaberto já vê o quadro novo', async () => {
    const p = pasta();
    const { armazem } = abrir({ pasta: p });
    const id = nova(armazem);
    const { facil, media } = doDia(HOJE);
    armazem.registrarMissoes(id, { [facil]: meta(facil), [media]: 1 });
    await armazem.fechar();

    const reaberto = abrir({ pasta: p }).armazem;
    expect(itemDe(reaberto, id, facil)).toMatchObject({ progresso: meta(facil), cumprida: true });
    expect(itemDe(reaberto, id, media).progresso).toBe(Math.min(1, meta(media)));
    expect(reaberto.ler(id)!.saldo).toBe(SALDO_INICIAL + 50 + (meta(media) === 1 ? 70 : 0));
    // pagou antes de fechar: reabrir e repetir não paga outra vez
    expect(reaberto.registrarMissoes(id, { [facil]: 1 })).toBeNull();
    await reaberto.fechar();

    const amanha = abrir({ pasta: p, agora: { valor: HOJE + DIA_MS } }).armazem;
    expect(amanha.ler(id)!.missoes!.itens.every((i) => i.progresso === 0)).toBe(true);
  });

  it('arquivo de antes do L31 (sem o campo `missoes`) abre, a carteira intacta e as missões em zero', async () => {
    const p = pasta();
    const id = 'c'.repeat(64);
    writeFileSync(join(p, 'carteiras.json'), JSON.stringify({ versao: 1, carteiras: { [id]: { saldo: 230, skins: ['classico', 'ebano'], skin: 'ebano', criadaEm: 1, jogou: true } } }));
    const { armazem, logs } = abrir({ pasta: p });
    expect(armazem.ler(id)).toMatchObject({ saldo: 230, skins: ['classico', 'ebano'], skin: 'ebano' });
    expect(armazem.ler(id)!.missoes!.itens.every((i) => i.progresso === 0)).toBe(true);
    expect(logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(false);
  });

  it('arquivo de antes do L25 (4 chaves, sem `jogou` nem `missoes`) também abre', () => {
    const p = pasta();
    const id = 'd'.repeat(64);
    writeFileSync(join(p, 'carteiras.json'), JSON.stringify({ versao: 1, carteiras: { [id]: { saldo: 10, skins: ['classico'], skin: 'classico', criadaEm: 1 } } }));
    const { armazem, logs } = abrir({ pasta: p });
    expect(armazem.ler(id)!.saldo).toBe(10);
    expect(logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(false);
  });

  it('campo `missoes` estragado não derruba a carteira (é dado do dia, não dinheiro): ela abre com as missões em zero', async () => {
    const p = pasta();
    const id = 'e'.repeat(64);
    const base = { saldo: 77, skins: ['classico'], skin: 'classico', criadaEm: 1, jogou: true };
    for (const estragado of [7, 'x', null, [], { dia: 'ontem', progresso: {} }, { dia: '2026-10-26', progresso: 3 }]) {
      writeFileSync(join(p, 'carteiras.json'), JSON.stringify({ versao: 1, carteiras: { [id]: { ...base, missoes: estragado } } }));
      const { armazem, logs } = abrir({ pasta: p });
      expect(armazem.ler(id)!.saldo, JSON.stringify(estragado)).toBe(77);
      expect(armazem.ler(id)!.missoes!.itens.every((i) => i.progresso === 0)).toBe(true);
      expect(logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(false);
      await abertos.pop()!.fechar();
    }
  });

  it('progresso guardado: missão que saiu do catálogo some, valor negativo ou quebrado some, e o que passa da meta volta a ela', () => {
    const p = pasta();
    const id = 'a'.repeat(64);
    const { facil } = doDia(HOJE);
    const missoes = { dia: '2026-10-26', progresso: { [facil]: 999, 'missao-que-saiu': 3, 'no-carinho': -2, 'saida-premiada': 1.5 } };
    writeFileSync(join(p, 'carteiras.json'), JSON.stringify({ versao: 1, carteiras: { [id]: { saldo: 100, skins: ['classico'], skin: 'classico', criadaEm: 1, jogou: true, missoes } } }));
    const { armazem } = abrir({ pasta: p });
    expect(itemDe(armazem, id, facil).progresso).toBe(meta(facil));
    expect(armazem.ler(id)!.missoes!.itens.filter((i) => i.id !== facil).every((i) => i.progresso === 0)).toBe(true);
  });

  it('o arquivo gravado leva o dia e o progresso, e nunca o código da carteira', async () => {
    const p = pasta();
    const { armazem } = abrir({ pasta: p });
    const nova1 = armazem.criar()!;
    const { facil } = doDia(HOJE);
    armazem.registrarMissoes(nova1.id, { [facil]: 1 });
    await armazem.descarregar();
    const texto = readFileSync(join(p, 'carteiras.json'), 'utf8');
    expect(JSON.parse(texto).carteiras[nova1.id].missoes).toEqual({ dia: '2026-10-26', progresso: { [facil]: 1 } });
    expect(texto).not.toContain(nova1.codigo);
  });
});
