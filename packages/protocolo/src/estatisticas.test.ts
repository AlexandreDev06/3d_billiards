/** As estatísticas por carteira (L38): a conta pura, o resumo público e os esquemas que validam o que a sala devolve. */
import { describe, expect, it } from 'vitest';
import { exemplosDeMensagens, type Solto } from './para-testes';
import { validarEstadoDaCarteira } from './esquemas-carteira';
import { validarMensagemDaSala } from './esquemas';
import { CONTAGEM_ZERADA, estatisticasDeModalidades, resumoPublico, somarContagens, totalDasModalidades, type ContagemDeEstatisticas } from './estatisticas';

const { sala } = exemplosDeMensagens();

const contagem = (c: Partial<ContagemDeEstatisticas>): ContagemDeEstatisticas => ({ ...CONTAGEM_ZERADA, ...c });
const ESTADO = { saldo: 100, skins: ['classico'], skin: 'classico' };

describe('somar contagens', () => {
  it('tudo soma, menos a sequência, que fica com a maior', () => {
    const a = contagem({ partidas: 2, vitorias: 1, bolas: 9, sequencia: 3, tabeladas: 1, missoes: 1, moedas: 70 });
    const b = contagem({ partidas: 1, vitorias: 1, bolas: 4, sequencia: 5, tabeladas: 0, missoes: 2, moedas: 120 });
    expect(somarContagens(a, b)).toEqual({ partidas: 3, vitorias: 2, bolas: 13, sequencia: 5, tabeladas: 1, missoes: 3, moedas: 190 });
    expect(somarContagens(b, a)).toEqual(somarContagens(a, b));
    expect(somarContagens(a, CONTAGEM_ZERADA)).toEqual(a);
  });

  it('o total das modalidades é a soma delas; sem nenhuma, zero', () => {
    const par = contagem({ partidas: 3, vitorias: 2, bolas: 20, sequencia: 4 });
    const mata = contagem({ partidas: 1, vitorias: 0, bolas: 5, sequencia: 2 });
    expect(totalDasModalidades({ 'par-ou-impar': par, 'mata-mata': mata })).toEqual(contagem({ partidas: 4, vitorias: 2, bolas: 25, sequencia: 4 }));
    expect(totalDasModalidades({})).toEqual(CONTAGEM_ZERADA);
    expect(estatisticasDeModalidades({ 'mata-mata': mata })).toEqual({ total: mata, modalidades: { 'mata-mata': mata } });
  });

  it('o resumo público é só partidas, vitórias e bolas do total', () => {
    const e = estatisticasDeModalidades({ 'par-ou-impar': contagem({ partidas: 3, vitorias: 2, bolas: 20, sequencia: 4, tabeladas: 1, missoes: 2, moedas: 100 }) });
    expect(resumoPublico(e)).toEqual({ partidas: 3, vitorias: 2, bolas: 20 });
  });

  it('não escreve nas contagens que recebeu', () => {
    expect(Object.isFrozen(CONTAGEM_ZERADA)).toBe(true);
    const a = contagem({ partidas: 1 });
    somarContagens(a, a);
    expect(a.partidas).toBe(1);
  });
});

describe('esquemas das estatísticas', () => {
  const par = contagem({ partidas: 3, vitorias: 2, bolas: 20, sequencia: 4, tabeladas: 1, missoes: 2, moedas: 100 });
  const mata = contagem({ partidas: 1, vitorias: 1, bolas: 5, sequencia: 5, missoes: 0, moedas: 20 });
  const certo = estatisticasDeModalidades({ 'par-ou-impar': par, 'mata-mata': mata });

  it('a carteira aceita as estatísticas zeradas, de uma modalidade e de duas', () => {
    for (const estatisticas of [estatisticasDeModalidades({}), estatisticasDeModalidades({ 'mata-mata': mata }), certo]) {
      expect(validarEstadoDaCarteira({ ...ESTADO, estatisticas }).ok).toBe(true);
    }
    expect(validarEstadoDaCarteira(ESTADO).ok).toBe(true); // opcional: o web de antes compila
  });

  it('recusa o total que não é a soma das modalidades', () => {
    expect(validarEstadoDaCarteira({ ...ESTADO, estatisticas: { ...certo, total: { ...certo.total, partidas: 5 } } }).ok).toBe(false);
    expect(validarEstadoDaCarteira({ ...ESTADO, estatisticas: { ...certo, total: { ...certo.total, sequencia: 9 } } }).ok).toBe(false);
  });

  it('recusa número que não é inteiro de 0 em diante, chave a mais, chave faltando, modalidade desconhecida e mais vitórias que partidas', () => {
    const com = (m: Solto) => validarEstadoDaCarteira({ ...ESTADO, estatisticas: { total: m, modalidades: { 'mata-mata': m } } }).ok;
    expect(com(mata)).toBe(true);
    expect(com({ ...mata, bolas: -1 })).toBe(false);
    expect(com({ ...mata, bolas: 1.5 })).toBe(false);
    expect(com({ ...mata, bolas: '5' })).toBe(false);
    expect(com({ ...mata, extra: 1 })).toBe(false);
    const { moedas: _m, ...faltando } = mata;
    void _m;
    expect(com(faltando)).toBe(false);
    expect(com({ ...mata, vitorias: 2 })).toBe(false);
    expect(validarEstadoDaCarteira({ ...ESTADO, estatisticas: { total: mata, modalidades: { treino: mata } } }).ok).toBe(false);
  });

  it('o lugar da sala leva o resumo público ou null; vitórias acima das partidas e chave a mais são recusadas', () => {
    const base = sala.filter((m) => m.tipo === 'estado-sala').find((m) => m.lugares.some((l) => l.estatisticas && l.estatisticas.partidas > 0)) as Solto;
    expect(base).toBeDefined();
    expect(validarMensagemDaSala(base).ok).toBe(true);
    const comLugar0 = (estatisticas: unknown) => validarMensagemDaSala({ ...base, lugares: base.lugares.map((l: Solto, i: number) => (i === 0 ? { ...l, estatisticas } : l)) }).ok;
    expect(comLugar0(null)).toBe(true);
    expect(comLugar0({ partidas: 5, vitorias: 5, bolas: 0 })).toBe(true);
    expect(comLugar0({ partidas: 5, vitorias: 6, bolas: 0 })).toBe(false);
    expect(comLugar0({ partidas: 5, vitorias: 1, bolas: 0, moedas: 10 })).toBe(false);
    expect(comLugar0({ partidas: 5, vitorias: 1 })).toBe(false);
    expect(comLugar0({ partidas: -1, vitorias: 0, bolas: 0 })).toBe(false);
  });
});
