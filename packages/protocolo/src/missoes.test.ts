import { describe, expect, it } from 'vitest';
import {
  MISSOES,
  PREMIO_POR_NIVEL,
  premioDaMissao,
  diaDaMissao,
  ehDiaDaMissao,
  ehIdDeMissao,
  fimDoDia,
  fimDoDiaMs,
  missaoDoCatalogo,
  missoesDoDia,
  validarEstadoDaCarteira,
  validarMensagemDaSala,
  type IdMissao,
} from './index';
import { quadroDeMissoes } from './para-testes';

const MS_DIA = 86_400_000;
const HORA = 3_600_000;

/** Meia-noite de Brasília (UTC−3) de um dia: 03:00 UTC. */
const meiaNoite = (dia: string): number => Date.parse(`${dia}T03:00:00Z`);

/** Os dias 'AAAA-MM-DD' de `de` a `de + n - 1`, pelo calendário. */
function dias(de: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.parse(`${de}T00:00:00Z`) + i * MS_DIA).toISOString().slice(0, 10));
}

describe('catálogo de missões (L31)', () => {
  it('são 15: 4 fáceis, 7 médias e 4 difíceis, com os ids do pedido', () => {
    expect(MISSOES).toHaveLength(15);
    const por = (nivel: string): string[] => MISSOES.filter((m) => m.nivel === nivel).map((m) => m.id);
    expect(por('facil')).toEqual(['fregues-da-casa', 'mao-quente', 'pelo-meio', 'saida-premiada']);
    expect(por('media')).toEqual(['embalado', 'na-pancada', 'no-carinho', 'efeito-ingles', 'siga', 'puxada', 'fecha-a-conta']);
    expect(por('dificil')).toEqual(['tabelada', 'de-longe', 'volta-ao-mundo', 'limpinho']);
  });

  it('as metas e os limiares estão como dado, nos números da decisão', () => {
    const m = (id: IdMissao) => missaoDoCatalogo(id);
    expect([m('fregues-da-casa').meta, m('mao-quente').meta, m('pelo-meio').meta, m('saida-premiada').meta]).toEqual([2, 5, 2, 1]);
    expect(m('embalado').meta).toBe(2);
    expect(m('na-pancada')).toMatchObject({ limiar: 3.4, meta: 1 });
    expect(m('no-carinho')).toMatchObject({ limiar: 1.0, meta: 1 });
    for (const id of ['efeito-ingles', 'siga', 'puxada'] as const) expect(m(id).limiar, id).toBe(0.5);
    expect(m('de-longe').limiar).toBe(1.5);
    expect(m('volta-ao-mundo').limiar).toBe(3);
    expect(m('embalado').acumulo).toBe('maximo');
    expect(m('mao-quente').acumulo).toBe('soma');
  });

  it('o prêmio é pelo nível: fácil 50, média 70, difícil 100 (até 220 por dia)', () => {
    expect(PREMIO_POR_NIVEL).toEqual({ facil: 50, media: 70, dificil: 100 });
    expect(premioDaMissao('mao-quente')).toBe(50);
    expect(premioDaMissao('embalado')).toBe(70);
    expect(premioDaMissao('limpinho')).toBe(100);
    const doDia = missoesDoDia('2026-10-26');
    expect(doDia.reduce((soma, m) => soma + premioDaMissao(m.id), 0)).toBe(220);
  });

  it('ids únicos, nome e descrição curtos preenchidos, meta inteira positiva', () => {
    expect(new Set(MISSOES.map((m) => m.id)).size).toBe(MISSOES.length);
    for (const m of MISSOES) {
      expect(m.nome.length, m.id).toBeGreaterThan(0);
      expect(m.descricao.length, m.id).toBeGreaterThan(0);
      expect(m.descricao.length, m.id).toBeLessThanOrEqual(80);
      expect(Number.isInteger(m.meta) && m.meta >= 1, m.id).toBe(true);
    }
  });

  it('ehIdDeMissao só aceita ids do catálogo (nada herdado do protótipo)', () => {
    expect(ehIdDeMissao('tabelada')).toBe(true);
    for (const ruim of ['Tabelada', '', 'toString', '__proto__', 'constructor', 3, null, undefined]) expect(ehIdDeMissao(ruim), String(ruim)).toBe(false);
  });
});

describe('o dia da missão vira à meia-noite de Brasília (UTC−3 fixo)', () => {
  it('diaDaMissao: 02:59 UTC ainda é o dia anterior e 03:00 UTC já é o seguinte', () => {
    expect(diaDaMissao(meiaNoite('2026-10-26') - 1)).toBe('2026-10-25');
    expect(diaDaMissao(meiaNoite('2026-10-26'))).toBe('2026-10-26');
    expect(diaDaMissao(meiaNoite('2026-10-26') + 24 * HORA - 1)).toBe('2026-10-26');
    expect(diaDaMissao(meiaNoite('2026-10-26') + 24 * HORA)).toBe('2026-10-27');
  });

  it('vira o mês e o ano, e o 29 de fevereiro existe', () => {
    expect(diaDaMissao(meiaNoite('2027-01-01') - 1)).toBe('2026-12-31');
    expect(diaDaMissao(meiaNoite('2028-03-01') - 1)).toBe('2028-02-29');
    expect(diaDaMissao(Date.parse('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });

  it('fimDoDiaMs é a próxima meia-noite de Brasília; fimDoDia, a de um dia dado', () => {
    expect(fimDoDiaMs(meiaNoite('2026-10-26'))).toBe(meiaNoite('2026-10-27'));
    expect(fimDoDiaMs(meiaNoite('2026-10-27') - 1)).toBe(meiaNoite('2026-10-27'));
    expect(fimDoDia('2026-12-31')).toBe(meiaNoite('2027-01-01'));
    expect(fimDoDia('2026-10-26')).toBe(fimDoDiaMs(Date.parse('2026-10-26T15:00:00Z')));
  });

  it('ehDiaDaMissao confere a forma e que a data existe', () => {
    expect(ehDiaDaMissao('2028-02-29')).toBe(true);
    for (const ruim of ['2027-02-29', '2026-13-01', '2026-10-32', '26-10-26', '2026-10-26T00:00', '', 20261026, null]) expect(ehDiaDaMissao(ruim), String(ruim)).toBe(false);
    expect(() => fimDoDia('2027-02-29')).toThrow(RangeError);
    expect(() => missoesDoDia('ontem')).toThrow(RangeError);
  });
});

describe('missoesDoDia: o cardápio do dia', () => {
  it('uma de cada nível, na ordem fácil, média, difícil', () => {
    for (const dia of dias('2026-10-26', 60)) {
      expect(missoesDoDia(dia).map((m) => m.nivel), dia).toEqual(['facil', 'media', 'dificil']);
    }
  });

  it('é determinística: o mesmo dia dá as mesmas missões, sempre', () => {
    const a = missoesDoDia('2026-10-26').map((m) => m.id);
    expect(missoesDoDia('2026-10-26').map((m) => m.id)).toEqual(a);
    expect(missoesDoDia(diaDaMissao(meiaNoite('2026-10-26') + 5 * HORA)).map((m) => m.id)).toEqual(a);
  });

  it('nunca repete a mesma trinca em dois dias seguidos (3 anos de dias, virando mês e ano)', () => {
    const lista = dias('2026-01-01', 365 * 3);
    let anterior = missoesDoDia(lista[0]!).map((m) => m.id).join('|');
    for (const dia of lista.slice(1)) {
      const atual = missoesDoDia(dia).map((m) => m.id).join('|');
      expect(atual, dia).not.toBe(anterior);
      anterior = atual;
    }
  });

  it('com o tempo todas as missões do catálogo aparecem, e nenhuma domina', () => {
    const vezes = new Map<string, number>(MISSOES.map((m) => [m.id, 0]));
    const lista = dias('2026-01-01', 730);
    for (const dia of lista) for (const m of missoesDoDia(dia)) vezes.set(m.id, vezes.get(m.id)! + 1);
    for (const [id, n] of vezes) {
      expect(n, id).toBeGreaterThan(0);
      expect(n, id).toBeLessThan(lista.length * 0.7);
    }
  });
});

describe('o quadro de missões no fio', () => {
  it('quadroDeMissoes monta o que a carteira mostra e o esquema o aceita dentro do estado da carteira', () => {
    const quadro = quadroDeMissoes('2026-10-26', [1, 0, 1]);
    const r = validarEstadoDaCarteira({ saldo: 100, skins: ['classico'], skin: 'classico', missoes: quadro });
    expect(r).toEqual({ ok: true, valor: { saldo: 100, skins: ['classico'], skin: 'classico', missoes: quadro } });
    expect(validarEstadoDaCarteira({ saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(true);
  });

  it('o esquema recusa quadro com progresso além da meta, cumprida torta, id de outro dia, fim errado, dia que não existe e item repetido', () => {
    const base = quadroDeMissoes('2026-10-26', [1, 0, 0]);
    const com = (missoes: unknown) => validarEstadoDaCarteira({ saldo: 0, skins: ['classico'], skin: 'classico', missoes }).ok;
    expect(com(base)).toBe(true);
    const item = (i: number, mudar: object) => ({ ...base, itens: base.itens.map((x, k) => (k === i ? { ...x, ...mudar } : x)) });
    expect(com(item(0, { progresso: base.itens[0]!.meta + 1 }))).toBe(false);
    expect(com(item(0, { cumprida: false, progresso: base.itens[0]!.meta }))).toBe(false);
    expect(com(item(1, { cumprida: true }))).toBe(false);
    expect(com(item(0, { meta: base.itens[0]!.meta + 1 }))).toBe(false);
    expect(com(item(2, { id: base.itens[0]!.id }))).toBe(false);
    expect(com({ ...base, fimMs: base.fimMs + 1 })).toBe(false);
    expect(com({ ...base, dia: '2027-02-29', fimMs: 0 })).toBe(false);
    expect(com({ ...base, itens: base.itens.slice(0, 2) })).toBe(false);
    expect(com({ ...base, itens: [...base.itens].reverse() })).toBe(false);
    expect(com({ ...base, extra: 1 })).toBe(false);
    expect(com({ ...base, itens: base.itens.map((x) => ({ ...x, progresso: -1 })) })).toBe(false);
  });

  it('a mensagem `missoes`: aceita as cumpridas que fecharam no quadro e recusa o resto', () => {
    const quadro = quadroDeMissoes('2026-10-26', [9, 0, 0]);
    const fechada = quadro.itens[0]!.id;
    expect(validarMensagemDaSala({ tipo: 'missoes', missoes: quadro, cumpridas: [fechada] }).ok).toBe(true);
    expect(validarMensagemDaSala({ tipo: 'missoes', missoes: quadro, cumpridas: [] }).ok).toBe(true);
    expect(validarMensagemDaSala({ tipo: 'missoes', missoes: quadro, cumpridas: [quadro.itens[1]!.id] }).ok).toBe(false);
    expect(validarMensagemDaSala({ tipo: 'missoes', missoes: quadro, cumpridas: [fechada, fechada] }).ok).toBe(false);
    expect(validarMensagemDaSala({ tipo: 'missoes', missoes: quadro, cumpridas: ['nao-existe'] }).ok).toBe(false);
    expect(validarMensagemDaSala({ tipo: 'missoes', missoes: quadro }).ok).toBe(false);
    expect(validarMensagemDaSala({ tipo: 'missoes', missoes: quadro, cumpridas: [], extra: true }).ok).toBe(false);
  });
});
