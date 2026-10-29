import { CONTAGEM_ZERADA, MODALIDADES_DE_SALA, SKINS_DE_TACO, type ContagemDeEstatisticas, type EstadoCarteira, type EstatisticasDaCarteira } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import {
  NOTA_DO_PERFIL,
  SEM_PARTIDAS_NA_ESPERA,
  estatisticasNaTela,
  perfilNaTela,
  porcentagemDeVitorias,
  resumoDoLugar,
  textoDaPorcentagem,
} from './perfil-modelo';

const contagem = (parcial: Partial<ContagemDeEstatisticas>): ContagemDeEstatisticas => ({ ...CONTAGEM_ZERADA, ...parcial });
const carteira = (parcial: Partial<EstadoCarteira> = {}): EstadoCarteira => ({ saldo: 100, skins: ['classico'], skin: 'classico', ...parcial });

/** 2 partidas de par ou ímpar (1 vitória) e 1 de mata-mata (1 vitória): o total 3 partidas e 2 vitórias. */
const ESTATISTICAS: EstatisticasDaCarteira = {
  total: contagem({ partidas: 3, vitorias: 2, bolas: 21, sequencia: 5, tabeladas: 2, missoes: 3, moedas: 170 }),
  modalidades: {
    'par-ou-impar': contagem({ partidas: 2, vitorias: 1, bolas: 14, sequencia: 5, tabeladas: 1, missoes: 2, moedas: 120 }),
    'mata-mata': contagem({ partidas: 1, vitorias: 1, bolas: 7, sequencia: 3, tabeladas: 1, missoes: 1, moedas: 50 }),
  },
};

describe('porcentagemDeVitorias', () => {
  it('arredonda para o inteiro mais perto e fica entre 0 e 100', () => {
    expect(porcentagemDeVitorias(1, 2)).toBe(50);
    expect(porcentagemDeVitorias(2, 3)).toBe(67);
    expect(porcentagemDeVitorias(1, 3)).toBe(33);
    expect(porcentagemDeVitorias(0, 7)).toBe(0);
    expect(porcentagemDeVitorias(7, 7)).toBe(100);
    expect(porcentagemDeVitorias(9, 7)).toBe(100);
  });

  it('sem partidas não há porcentagem (nada de 0%, nada de divisão por zero)', () => {
    expect(porcentagemDeVitorias(0, 0)).toBeNull();
    expect(porcentagemDeVitorias(3, 0)).toBeNull();
    expect(porcentagemDeVitorias(Number.NaN, 4)).toBeNull();
    expect(textoDaPorcentagem(0, 0)).toBe('—');
    expect(textoDaPorcentagem(2, 3)).toBe('67%');
  });
});

describe('resumoDoLugar (a linha de baixo do nome na sala de espera)', () => {
  it('"12 vitórias em 30 · 85 bolas"', () => {
    expect(resumoDoLugar({ partidas: 30, vitorias: 12, bolas: 85 })).toBe('12 vitórias em 30 · 85 bolas');
  });

  it('o singular fala certo', () => {
    expect(resumoDoLugar({ partidas: 1, vitorias: 1, bolas: 1 })).toBe('1 vitória em 1 · 1 bola');
    expect(resumoDoLugar({ partidas: 4, vitorias: 0, bolas: 0 })).toBe('0 vitórias em 4 · 0 bolas');
  });

  it('carteira que nunca teve partida contada diz isso, curto', () => {
    expect(resumoDoLugar({ partidas: 0, vitorias: 0, bolas: 0 })).toBe(SEM_PARTIDAS_NA_ESPERA);
  });

  it('quem não tem resumo fica sem a linha: sem carteira, vago, sala que não manda o campo, número estragado', () => {
    expect(resumoDoLugar(null)).toBeNull();
    expect(resumoDoLugar(undefined)).toBeNull();
    expect(resumoDoLugar({ partidas: -1, vitorias: 0, bolas: 0 })).toBeNull();
    expect(resumoDoLugar({ partidas: 2.5, vitorias: 1, bolas: 3 })).toBeNull();
    expect(resumoDoLugar({ partidas: Number.NaN, vitorias: 1, bolas: 3 })).toBeNull();
  });
});

describe('estatisticasNaTela', () => {
  it('colunas: o total e depois uma por modalidade do catálogo da sala, na ordem dele', () => {
    const e = estatisticasNaTela(carteira({ estatisticas: ESTATISTICAS }));
    expect(e.colunas.map((c) => c.id)).toEqual(['total', ...MODALIDADES_DE_SALA]);
    expect(e.colunas.map((c) => c.rotulo)).toEqual(['Total', 'Par ou ímpar', 'Mata-mata']);
    expect(e.colunas.every((c) => c.temDados)).toBe(true);
    expect(e.vazio).toBe(false);
    expect(e.semDadosDaSala).toBe(false);
  });

  it('as oito linhas, na ordem da tela', () => {
    const e = estatisticasNaTela(carteira({ estatisticas: ESTATISTICAS }));
    expect(e.linhas.map((l) => l.rotulo)).toEqual(['Partidas', 'Vitórias', 'Aproveitamento', 'Bolas matadas', 'Maior sequência', 'Tabeladas', 'Missões cumpridas', 'Moedas ganhas']);
    expect(e.linhas.every((l) => l.valores.length === e.colunas.length && l.dica !== '')).toBe(true);
  });

  it('os números do total e de cada modalidade, com a porcentagem calculada por coluna', () => {
    const e = estatisticasNaTela(carteira({ estatisticas: ESTATISTICAS }));
    const linha = (chave: string): readonly string[] => e.linhas.find((l) => l.chave === chave)!.valores;
    expect(linha('partidas')).toEqual(['3', '2', '1']);
    expect(linha('vitorias')).toEqual(['2', '1', '1']);
    expect(linha('aproveitamento')).toEqual(['67%', '50%', '100%']);
    expect(linha('bolas')).toEqual(['21', '14', '7']);
    expect(linha('sequencia')).toEqual(['5', '5', '3']);
    expect(linha('tabeladas')).toEqual(['2', '1', '1']);
    expect(linha('missoes')).toEqual(['3', '2', '1']);
    expect(linha('moedas')).toEqual(['170', '120', '50']);
  });

  it('modalidade em que nunca jogou: a coluna existe, só com traços, e não conta como dados', () => {
    const so = estatisticasNaTela(
      carteira({ estatisticas: { total: contagem({ partidas: 2, vitorias: 2, bolas: 9, sequencia: 4 }), modalidades: { 'par-ou-impar': contagem({ partidas: 2, vitorias: 2, bolas: 9, sequencia: 4 }) } } }),
    );
    const mata = so.colunas.findIndex((c) => c.id === 'mata-mata');
    expect(so.colunas[mata]!.temDados).toBe(false);
    expect(so.linhas.map((l) => l.valores[mata])).toEqual(Array(8).fill('—'));
    expect(so.linhas.find((l) => l.chave === 'aproveitamento')!.valores[0]).toBe('100%');
  });

  it('sem dados: carteira zerada, sem carteira e sala que não manda as estatísticas', () => {
    const zerada = estatisticasNaTela(carteira({ estatisticas: { total: CONTAGEM_ZERADA, modalidades: {} } }));
    expect(zerada.vazio).toBe(true);
    expect(zerada.semDadosDaSala).toBe(false);
    expect(zerada.linhas.every((l) => l.valores.every((v) => v === '—'))).toBe(true);

    const sem = estatisticasNaTela(null);
    expect(sem.vazio).toBe(true);
    expect(sem.semDadosDaSala).toBe(false);

    const antiga = estatisticasNaTela(carteira());
    expect(antiga.vazio).toBe(true);
    expect(antiga.semDadosDaSala).toBe(true);
  });

  it('o total vem do campo `total` da sala, não de uma soma feita aqui', () => {
    const e = estatisticasNaTela(carteira({ estatisticas: { total: contagem({ partidas: 9, vitorias: 3 }), modalidades: {} } }));
    expect(e.linhas.find((l) => l.chave === 'partidas')!.valores[0]).toBe('9');
    expect(e.linhas.find((l) => l.chave === 'aproveitamento')!.valores[0]).toBe('33%');
  });
});

describe('perfilNaTela', () => {
  it('apelido, taco em uso com a semente, quantas skins tem e a nota', () => {
    const p = perfilNaTela(
      carteira({ skin: 'ebano', skins: ['classico', 'ebano'], itens: [{ skin: 'classico', semente: 3, bolas: 0 }, { skin: 'ebano', semente: 186, bolas: 12 }], estatisticas: ESTATISTICAS }),
      '  Ana ',
    );
    expect(p).toMatchObject({ apelido: 'Ana', temApelido: true, temCarteira: true, skinsQueTem: 2, skinsNoCatalogo: SKINS_DE_TACO.length, nota: NOTA_DO_PERFIL });
    expect(p.taco).toMatchObject({ skin: 'ebano', nome: 'Ébano', semente: 186 });
    expect(p.textoDasSkins).toBe(`2 de ${SKINS_DE_TACO.length} skins`);
    expect(p.estatisticas.vazio).toBe(false);
  });

  it('sem carteira (ainda não lida ou sala fora do ar): o taco de fábrica, traço nas skins e estatísticas vazias', () => {
    const p = perfilNaTela(null, '');
    expect(p).toMatchObject({ apelido: 'Sem apelido', temApelido: false, temCarteira: false, skinsQueTem: null, textoDasSkins: '—' });
    expect(p.taco.skin).toBe('classico');
    expect(p.estatisticas.vazio).toBe(true);
  });

  it('a nota diz que só contam as partidas online com a física padrão', () => {
    expect(NOTA_DO_PERFIL).toMatch(/online/);
    expect(NOTA_DO_PERFIL).toMatch(/física padrão/);
  });

  it('carteira de uma sala de antes do `itens` conta as skins pela lista antiga', () => {
    expect(perfilNaTela(carteira({ skins: ['classico', 'ebano', 'marfim'] }), 'Ana').skinsQueTem).toBe(3);
  });
});
