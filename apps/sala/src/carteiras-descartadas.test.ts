/**
 * As carteiras descartadas (L47b): o que o Durable Object guardou de lado por não conseguir ler (`carteiras_descartadas`) sai na
 * exportação, pode ser lido pela administração e uma delas pode voltar pela importação (`restaurar`), sem trocar carteira nenhuma.
 */
import { describe, expect, it } from 'vitest';
import { APARENCIA_PADRAO, SALDO_INICIAL } from '@sinuca/protocolo';
import { CarteirasEmMemoria } from './carteiras-base';
import { CarteirasNoDO } from './carteiras-sqlite';
import { banco, type BancoDeTeste } from './para-testes-sqlite';

const RELOGIO = Date.parse('2026-11-02T15:00:00Z');
const ID_DO_FORMATO_ANTIGO = '1'.repeat(64);
const ID_QUEBRADO = '2'.repeat(64);
const ID_SEM_FORMA = '3'.repeat(64);

/** Uma carteira como a sala gravava antes do L34: `skins` no lugar de `itens`. O Durable Object não a abre (não tem semente para dar). */
const DO_FORMATO_ANTIGO = { saldo: 321, skins: ['classico', 'ebano'], skin: 'ebano', criadaEm: 1_700_000_000_000, jogou: true };

const abrir = (b: BancoDeTeste, extra: Partial<ConstructorParameters<typeof CarteirasNoDO>[0]> = {}) => {
  const logs: string[] = [];
  const armazem = new CarteirasNoDO({
    sql: b.sql,
    transacao: b.transacao,
    maxCarteiras: 100,
    relogio: () => RELOGIO,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    sortearSemente: () => 7,
    ...extra,
  });
  return { armazem, logs };
};

/** Um banco com uma carteira boa e três linhas que a leitura descarta: formato antigo, JSON quebrado e forma errada. */
function comDescartadas() {
  const b = banco();
  abrir(b); // cria as tabelas
  const inserir = b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)');
  inserir.run(ID_DO_FORMATO_ANTIGO, JSON.stringify(DO_FORMATO_ANTIGO));
  inserir.run(ID_QUEBRADO, '{ isto não é json');
  inserir.run(ID_SEM_FORMA, JSON.stringify({ saldo: 'muito' }));
  const { armazem, logs } = abrir(b);
  const boa = armazem.criar()!;
  return { b, armazem, logs, boa };
}

const naTabela = (b: BancoDeTeste, tabela: string): string[] => (b.db.prepare(`SELECT id FROM ${tabela} ORDER BY id`).all() as { id: string }[]).map((l) => l.id);

describe('as descartadas saem na exportação', () => {
  it('exportar leva `carteiras_descartadas`: o id, o texto como estava, o motivo e o instante de cada linha que a leitura não aceitou', () => {
    const { armazem } = comDescartadas();
    const copia = JSON.parse(armazem.exportar()) as { carteiras_descartadas: { id: string; dados: string; motivo: string; em: number }[] };
    expect(copia.carteiras_descartadas.map((d) => [d.id, d.motivo]).sort()).toEqual(
      [
        [ID_DO_FORMATO_ANTIGO, 'forma-invalida'],
        [ID_QUEBRADO, 'json-quebrado'],
        [ID_SEM_FORMA, 'forma-invalida'],
      ].sort(),
    );
    const porId = Object.fromEntries(copia.carteiras_descartadas.map((d) => [d.id, d]));
    expect(porId[ID_QUEBRADO]!.dados).toBe('{ isto não é json');
    expect(JSON.parse(porId[ID_DO_FORMATO_ANTIGO]!.dados)).toEqual(DO_FORMATO_ANTIGO);
    expect(porId[ID_QUEBRADO]!.em).toBe(RELOGIO);
  });

  it('sem nada descartado a lista vem vazia (a chave está sempre na cópia)', () => {
    const b = banco();
    const { armazem } = abrir(b);
    armazem.criar();
    expect(JSON.parse(armazem.exportar())).toMatchObject({ versao: 2, baloes: {}, carteiras_descartadas: [] });
    expect(new CarteirasEmMemoria({ maxCarteiras: 5, relogio: () => RELOGIO, log: () => {} }).exportar()).toContain('"carteiras_descartadas":[]');
  });

  it('descartadas() lista as linhas da mais antiga para a mais nova', () => {
    const b = banco();
    abrir(b);
    b.db.prepare('INSERT INTO carteiras_descartadas (id, dados, motivo, em) VALUES (?, ?, ?, ?)').run('a'.repeat(64), 'x', 'json-quebrado', 30);
    b.db.prepare('INSERT INTO carteiras_descartadas (id, dados, motivo, em) VALUES (?, ?, ?, ?)').run('b'.repeat(64), 'y', 'forma-invalida', 10);
    const { armazem } = abrir(b);
    expect(armazem.descartadas().map((d) => d.em)).toEqual([10, 30]);
  });

  it('o balão com JSON quebrado também vai para as descartadas: a carteira abre sem balão e nada se apaga', () => {
    const b = banco();
    const { armazem } = abrir(b);
    const c = armazem.criar()!;
    b.db.prepare('INSERT INTO carteiras_balao (id, dados) VALUES (?, ?)').run(c.id, '{ balão quebrado');
    const { armazem: depois, logs } = abrir(b);
    expect(depois.ler(c.id)!.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['olho_normal', 'castanho'] });
    expect(depois.descartadas()).toEqual([{ id: c.id, dados: '{ balão quebrado', motivo: 'balao-json-quebrado', em: RELOGIO }]);
    expect(naTabela(b, 'carteiras_balao')).toEqual([]);
    expect(logs.join('\n')).toContain('carteiras-descartadas {"descartadas":0,"baloes":1');
  });

  it('o balão de uma carteira que não está na tabela principal fica onde está (nada se apaga)', () => {
    const b = banco();
    abrir(b);
    b.db.prepare('INSERT INTO carteiras_balao (id, dados) VALUES (?, ?)').run('c'.repeat(64), JSON.stringify({ itens: ['coroa'], aparencia: APARENCIA_PADRAO }));
    const { armazem } = abrir(b);
    expect(armazem.total).toBe(0);
    expect(naTabela(b, 'carteiras_balao')).toEqual(['c'.repeat(64)]);
    expect(JSON.parse(armazem.exportar()).baloes).toEqual({});
  });
});

describe('uma descartada volta pela importação (restaurar)', () => {
  it('a do formato antigo volta como carteira, com semente sorteada, sai da lista e fica no banco', () => {
    const { b, armazem, boa } = comDescartadas();
    const copia = armazem.exportar();
    expect(armazem.restaurar(copia, [ID_DO_FORMATO_ANTIGO])).toEqual({ ok: true, restauradas: 1 });
    const volta = armazem.ler(ID_DO_FORMATO_ANTIGO)!;
    expect(volta).toMatchObject({ saldo: 321, skin: 'ebano', skins: ['classico', 'ebano'], itens: [{ skin: 'classico', semente: 7, bolas: 0 }, { skin: 'ebano', semente: 7, bolas: 0 }] });
    expect(armazem.ler(boa.id)).toBeDefined();
    expect(naTabela(b, 'carteiras')).toEqual([boa.id, ID_DO_FORMATO_ANTIGO].sort());
    expect(naTabela(b, 'carteiras_descartadas').sort()).toEqual([ID_QUEBRADO, ID_SEM_FORMA].sort());
    // um objeto novo sobre o mesmo banco a encontra e não descarta de novo
    const { armazem: acordado } = abrir(banco(b.db));
    expect(acordado.ler(ID_DO_FORMATO_ANTIGO)).toEqual(volta);
  });

  it('leva o balão que a cópia traz para o mesmo id', () => {
    const { armazem } = comDescartadas();
    const copia = JSON.parse(armazem.exportar()) as Record<string, unknown>;
    copia.baloes = { [ID_DO_FORMATO_ANTIGO]: { itens: ['coroa'], aparencia: { ...APARENCIA_PADRAO, chapeu: 'coroa' } } };
    expect(armazem.restaurar(JSON.stringify(copia), [ID_DO_FORMATO_ANTIGO])).toEqual({ ok: true, restauradas: 1 });
    expect(armazem.ler(ID_DO_FORMATO_ANTIGO)!.balao).toEqual({ aparencia: { ...APARENCIA_PADRAO, chapeu: 'coroa' }, itens: ['coroa', 'olho_normal', 'castanho'] });
  });

  it('nunca troca uma carteira que já existe: `ja-existe`, e nada muda', () => {
    const { b, armazem, boa } = comDescartadas();
    const copia = JSON.parse(armazem.exportar()) as { carteiras_descartadas: object[] };
    copia.carteiras_descartadas.push({ id: boa.id, dados: JSON.stringify(DO_FORMATO_ANTIGO), motivo: 'forma-invalida', em: 1 });
    const antes = armazem.ler(boa.id);
    expect(armazem.restaurar(JSON.stringify(copia), [boa.id])).toEqual({ ok: false, motivo: 'ja-existe' });
    expect(armazem.ler(boa.id)).toEqual(antes);
    expect(naTabela(b, 'carteiras_descartadas')).toHaveLength(3);
  });

  it('é tudo ou nada: um id que a cópia não tem, ou que ainda não presta, recusa todos', () => {
    const { b, armazem } = comDescartadas();
    const copia = armazem.exportar();
    const total = armazem.total;
    expect(armazem.restaurar(copia, [ID_DO_FORMATO_ANTIGO, 'f'.repeat(64)])).toEqual({ ok: false, motivo: 'descartada-nao-encontrada' });
    expect(armazem.restaurar(copia, [ID_DO_FORMATO_ANTIGO, ID_QUEBRADO])).toEqual({ ok: false, motivo: 'descartada-invalida' });
    expect(armazem.restaurar(copia, [ID_DO_FORMATO_ANTIGO, ID_SEM_FORMA])).toEqual({ ok: false, motivo: 'descartada-invalida' });
    expect(armazem.restaurar(copia, [])).toEqual({ ok: false, motivo: 'descartada-nao-encontrada' });
    expect(armazem.restaurar(copia, ['não é um id'])).toEqual({ ok: false, motivo: 'descartada-nao-encontrada' });
    expect(armazem.total).toBe(total);
    expect(naTabela(b, 'carteiras_descartadas')).toHaveLength(3);
  });

  it('arquivo que não se entende recusa; `baloes` torto também', () => {
    const { armazem } = comDescartadas();
    expect(armazem.restaurar('isto não é json', [ID_DO_FORMATO_ANTIGO])).toEqual({ ok: false, motivo: 'arquivo-invalido' });
    expect(armazem.restaurar(JSON.stringify({ versao: 9, carteiras: {} }), [ID_DO_FORMATO_ANTIGO])).toEqual({ ok: false, motivo: 'arquivo-invalido' });
    const copia = JSON.parse(armazem.exportar()) as Record<string, unknown>;
    copia.baloes = 'coroa';
    expect(armazem.restaurar(JSON.stringify(copia), [ID_DO_FORMATO_ANTIGO])).toEqual({ ok: false, motivo: 'arquivo-invalido' });
  });

  it('com o teto de carteiras cheio recusa (`cheio`)', () => {
    const b = banco();
    const { armazem } = abrir(b, { maxCarteiras: 1 });
    armazem.criar();
    const copia = { versao: 2, carteiras: {}, carteiras_descartadas: [{ id: ID_DO_FORMATO_ANTIGO, dados: JSON.stringify(DO_FORMATO_ANTIGO), motivo: 'forma-invalida', em: 1 }] };
    expect(armazem.restaurar(JSON.stringify(copia), [ID_DO_FORMATO_ANTIGO])).toEqual({ ok: false, motivo: 'cheio', maximo: 1 });
  });

  it('de duas descartadas com o mesmo id vale a mais recente', () => {
    const b = banco();
    const { armazem } = abrir(b);
    const copia = {
      versao: 2,
      carteiras: {},
      carteiras_descartadas: [
        { id: ID_DO_FORMATO_ANTIGO, dados: JSON.stringify({ ...DO_FORMATO_ANTIGO, saldo: 5 }), motivo: 'forma-invalida', em: 1 },
        { id: ID_DO_FORMATO_ANTIGO, dados: JSON.stringify({ ...DO_FORMATO_ANTIGO, saldo: 9 }), motivo: 'forma-invalida', em: 2 },
      ],
    };
    armazem.restaurar(JSON.stringify(copia), [ID_DO_FORMATO_ANTIGO]);
    expect(armazem.ler(ID_DO_FORMATO_ANTIGO)!.saldo).toBe(9);
  });

  it('com a gravação falhando a carteira volta na memória e a cópia fica na lista de descartadas até a gravação passar', () => {
    const { b, armazem } = comDescartadas();
    const copia = armazem.exportar();
    b.falharQuando = /INTO carteiras \(/;
    expect(armazem.restaurar(copia, [ID_DO_FORMATO_ANTIGO])).toEqual({ ok: true, restauradas: 1 });
    expect(armazem.pendentes).toBe(1);
    expect(naTabela(b, 'carteiras_descartadas')).toContain(ID_DO_FORMATO_ANTIGO);
    b.falharQuando = null;
    armazem.tentarPendentes();
    expect(naTabela(b, 'carteiras')).toContain(ID_DO_FORMATO_ANTIGO);
  });

  it('avisa quem olha a carteira, e o log diz só quantas voltaram', () => {
    const { armazem, logs } = comDescartadas();
    const avisos: string[] = [];
    armazem.aoMudar((id) => avisos.push(id));
    armazem.restaurar(armazem.exportar(), [ID_DO_FORMATO_ANTIGO]);
    expect(avisos).toEqual([ID_DO_FORMATO_ANTIGO]);
    expect(logs.filter((l) => l.startsWith('carteiras-restauradas'))).toEqual(['carteiras-restauradas {"restauradas":1}']);
    expect(logs.join('\n')).not.toContain(ID_DO_FORMATO_ANTIGO);
  });

  it('as carteiras novas, o que já existe e o saldo inicial não mudam com uma restauração que recusa', () => {
    const { armazem, boa } = comDescartadas();
    armazem.restaurar(armazem.exportar(), [ID_QUEBRADO]);
    expect(armazem.ler(boa.id)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.total).toBe(1);
  });
});
