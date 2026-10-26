import { describe, expect, it } from 'vitest';
import { APOSTAS_DA_SALA, APOSTA_PADRAO, FAIXAS_DO_GIZ_DA_SALA, FORCA_DA_SALA_PADRAO, GIZ_DA_SALA_PADRAO, type GizSala, type ModoSala, type MsgEstadoSala } from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import { ArmazenamentoFalso } from '../online/para-testes';
import { LINHA_COMPLETA, LINHA_DESLIGADA, LINHA_DO_CAMINHO } from '../previsao/regra-da-linha';
import { CATALOGO } from './catalogo';
import {
  CONTROLES_DO_GIZ,
  FORCAS_NA_TELA,
  ROTULO_FORCA,
  TEMPO_PADRAO_DA_SALA,
  aplicarMudanca,
  esquecerRegras,
  lembrarRegras,
  lerRegrasLembradas,
  passoDoGiz,
  porcento,
  regrasDoEstado,
  regrasPadrao,
  resumoDasRegras,
  resumoDoGiz,
  sanearGiz,
  segundos,
  textoDaAposta,
  type RegrasDaSala,
} from './regras-da-sala';

const PADRAO = regrasPadrao(30);

describe('regrasPadrao', () => {
  it('par ou ímpar 1×1, o tempo e a linha dados, giz e força de fábrica da sala', () => {
    expect(PADRAO).toEqual({ modalidade: 'par-ou-impar', modo: '1x1', tempoS: 30, linha: LINHA_DESLIGADA, giz: GIZ_DA_SALA_PADRAO, forca: FORCA_DA_SALA_PADRAO, aposta: APOSTA_PADRAO });
    expect(regrasPadrao(null, LINHA_DO_CAMINHO).tempoS).toBeNull();
    expect(regrasPadrao(null, LINHA_DO_CAMINHO).linha).toBe(LINHA_DO_CAMINHO);
  });

  it('a força de fábrica é a linha: puxar e soltar', () => {
    expect(PADRAO.forca).toBe('linha');
  });

  it('a aposta de fábrica é a menor da sala: 10 moedas', () => {
    expect(PADRAO.aposta).toBe(10);
    expect(APOSTAS_DA_SALA).toEqual([10, 20, 50, 100]);
  });
});

describe('sanearGiz', () => {
  it('completa o que falta com o padrão e deixa o que está nas faixas', () => {
    expect(sanearGiz(undefined)).toEqual(GIZ_DA_SALA_PADRAO);
    expect(sanearGiz({ desgasteMin: 0.2 })).toEqual({ ...GIZ_DA_SALA_PADRAO, desgasteMin: 0.2 });
  });

  it('corta cada número na faixa que a sala aceita', () => {
    const f = FAIXAS_DO_GIZ_DA_SALA;
    expect(sanearGiz({ desgasteMin: -1, desgasteMax: 9, passada: 0, passadaS: 100 })).toEqual({ desgasteMin: f.desgaste.min, desgasteMax: f.desgaste.max, passada: f.passada.min, passadaS: f.passadaS.max });
  });

  it('número inválido (texto, NaN) volta ao padrão', () => {
    expect(sanearGiz({ desgasteMin: 'x', desgasteMax: NaN, passada: null, passadaS: {} })).toEqual(GIZ_DA_SALA_PADRAO);
  });

  it('se o mínimo passa do máximo, os dois trocam de lugar', () => {
    expect(sanearGiz({ desgasteMin: 0.4, desgasteMax: 0.1 })).toMatchObject({ desgasteMin: 0.1, desgasteMax: 0.4 });
  });
});

describe('passoDoGiz: um clique em menos ou mais', () => {
  const giz: GizSala = { desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 };

  it('cada número anda o seu passo, sem sujeira de ponto flutuante', () => {
    expect(passoDoGiz(giz, 'desgasteMin', 1).desgasteMin).toBe(0.15);
    expect(passoDoGiz(giz, 'desgasteMax', -1).desgasteMax).toBe(0.25);
    expect(passoDoGiz(giz, 'passada', 1).passada).toBe(0.15);
    expect(passoDoGiz(giz, 'passadaS', -1).passadaS).toBe(2.5);
    expect(passoDoGiz({ ...giz, desgasteMin: 0.05 }, 'desgasteMin', 1).desgasteMin).toBe(0.1);
  });

  it('nunca sai das faixas', () => {
    expect(passoDoGiz({ ...giz, desgasteMin: 0, desgasteMax: 0.5 }, 'desgasteMin', -1).desgasteMin).toBe(0);
    expect(passoDoGiz({ ...giz, desgasteMax: 0.5 }, 'desgasteMax', 1).desgasteMax).toBe(0.5);
    expect(passoDoGiz({ ...giz, passada: 0.05 }, 'passada', -1).passada).toBe(0.05);
    expect(passoDoGiz({ ...giz, passadaS: 6 }, 'passadaS', 1).passadaS).toBe(6);
    expect(passoDoGiz({ ...giz, passadaS: 0.5 }, 'passadaS', -1).passadaS).toBe(0.5);
  });

  it('o mínimo do gasto não passa do máximo: subir o mínimo além dele leva o máximo junto, e descer o máximo leva o mínimo', () => {
    const colado: GizSala = { ...giz, desgasteMin: 0.3, desgasteMax: 0.3 };
    expect(passoDoGiz(colado, 'desgasteMin', 1)).toMatchObject({ desgasteMin: 0.35, desgasteMax: 0.35 });
    expect(passoDoGiz(colado, 'desgasteMax', -1)).toMatchObject({ desgasteMin: 0.25, desgasteMax: 0.25 });
  });

  it('os passos e as faixas dos controles são os da sala (as faixas vêm do protocolo)', () => {
    expect(CONTROLES_DO_GIZ.desgaste.min).toBe(FAIXAS_DO_GIZ_DA_SALA.desgaste.min);
    expect(CONTROLES_DO_GIZ.passadaS.max).toBe(FAIXAS_DO_GIZ_DA_SALA.passadaS.max);
    // cada passo cabe várias vezes na faixa: o clique sempre muda alguma coisa no meio dela
    for (const c of [CONTROLES_DO_GIZ.desgaste, CONTROLES_DO_GIZ.passada, CONTROLES_DO_GIZ.passadaS]) expect((c.max - c.min) / c.passo).toBeGreaterThan(3);
  });

  it('o mínimo e o máximo percorrem a faixa inteira em passos, sempre válidos e dentro da faixa da sala', () => {
    let g: GizSala = giz;
    for (let i = 0; i < 40; i++) {
      g = passoDoGiz(g, i % 3 === 0 ? 'desgasteMax' : 'desgasteMin', i % 5 < 2 ? -1 : 1);
      expect(g.desgasteMin).toBeLessThanOrEqual(g.desgasteMax);
      expect(sanearGiz(g)).toEqual(g);
    }
  });
});

describe('textos das regras', () => {
  it('a força aparece com o padrão primeiro: Linha (puxar e soltar) e depois Empurrar', () => {
    expect(FORCAS_NA_TELA[0]).toBe(FORCA_DA_SALA_PADRAO);
    expect(FORCAS_NA_TELA.map((f) => ROTULO_FORCA[f])).toEqual(['Linha (puxar e soltar)', 'Empurrar']);
  });

  it('porcento e segundos usam vírgula', () => {
    expect(porcento(0.1)).toBe('10%');
    expect(porcento(0.075)).toBe('7,5%');
    expect(porcento(0.3)).toBe('30%');
    expect(segundos(3)).toBe('3 s');
    expect(segundos(1.5)).toBe('1,5 s');
  });

  it('o resumo do giz, da sala e dos outros', () => {
    expect(resumoDoGiz(GIZ_DA_SALA_PADRAO)).toBe('giz gasta 10 a 30%, passada de 10% em 3 s');
    expect(resumoDoGiz({ ...GIZ_DA_SALA_PADRAO, desgasteMin: 0.2, desgasteMax: 0.2 })).toBe('giz gasta 20%, passada de 10% em 3 s');
    expect(resumoDasRegras(PADRAO)).toEqual(['Valendo 10 moedas', '30 s por tacada', 'sem linha de previsão', 'giz gasta 10 a 30%, passada de 10% em 3 s', 'força: linha (puxar e soltar)']);
    expect(resumoDasRegras({ ...PADRAO, aposta: 100, tempoS: null, linha: LINHA_COMPLETA, forca: 'empurrar' })).toEqual([
      'Valendo 100 moedas',
      'Sem limite por tacada',
      'linha de previsão com a bola atingida',
      'giz gasta 10 a 30%, passada de 10% em 3 s',
      'força: empurrar',
    ]);
    expect(resumoDasRegras({ ...PADRAO, linha: LINHA_DO_CAMINHO })[2]).toBe('linha de previsão ligada');
  });

  it('a aposta em uma frase', () => {
    expect(textoDaAposta(10)).toBe('Valendo 10 moedas');
    expect(textoDaAposta(20)).toBe('Valendo 20 moedas');
  });
});

describe('regrasDoEstado: o que a sala mandou', () => {
  const base: MsgEstadoSala = {
    tipo: 'estado-sala',
    codigo: 'K7M2P',
    modo: '1x1x1',
    modalidade: 'mata-mata',
    preset: 'Mata-mata',
    fase: 'espera',
    seq: 0,
    vez: null,
    lugares: [],
    espectadores: 0,
    relogio: { tempoS: 45, aoEsgotar: 'perde-a-vez' },
    linha: { previsao: true, bolaAtingida: false },
    giz: { desgasteMin: 0.2, desgasteMax: 0.25, passada: 0.15, passadaS: 2 },
    forca: 'empurrar',
    aposta: 20,
  };

  it('lê modalidade, formato, tempo, linha, giz, força e aposta do estado', () => {
    expect(regrasDoEstado(base, 30)).toEqual({ modalidade: 'mata-mata', modo: '1x1x1', tempoS: 45, linha: LINHA_DO_CAMINHO, giz: base.giz, forca: 'empurrar', aposta: 20 });
  });

  it('o que a sala não manda (só em montagens de teste) vale o padrão: par ou ímpar, giz, força e aposta de fábrica, o tempo dado', () => {
    const sem: MsgEstadoSala = { tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1', preset: 'Boteco', fase: 'espera', seq: 0, vez: null, lugares: [], espectadores: 0 };
    expect(regrasDoEstado(sem, 30)).toEqual({ ...PADRAO, tempoS: 30 });
    expect(regrasDoEstado(sem, TEMPO_PADRAO_DA_SALA).tempoS).toBe(30);
  });

  it('tempo sem limite é null, não ausente', () => {
    expect(regrasDoEstado({ ...base, relogio: { tempoS: null, aoEsgotar: 'perde-a-vez' } }, 30).tempoS).toBeNull();
  });
});

describe('aplicarMudanca: a aposta', () => {
  it('escolher a aposta muda só ela', () => {
    expect(aplicarMudanca(PADRAO, { aposta: 50 })).toEqual({ ...PADRAO, aposta: 50 });
  });
});

describe('aplicarMudanca', () => {
  it('uma escolha de cada vez: tempo, linha, força e giz mudam só o seu campo', () => {
    expect(aplicarMudanca(PADRAO, { tempoS: 60 }).tempoS).toBe(60);
    expect(aplicarMudanca(PADRAO, { linha: LINHA_COMPLETA }).linha).toBe(LINHA_COMPLETA);
    expect(aplicarMudanca(PADRAO, { forca: 'empurrar' })).toEqual({ ...PADRAO, forca: 'empurrar' });
    expect(aplicarMudanca(PADRAO, { giz: { ...GIZ_DA_SALA_PADRAO, passadaS: 4 } }).giz.passadaS).toBe(4);
  });

  it('escolher o formato fica como escolhido', () => {
    expect(aplicarMudanca(PADRAO, { modo: '2x2' })).toEqual({ ...PADRAO, modo: '2x2' });
    expect(aplicarMudanca({ ...PADRAO, modalidade: 'mata-mata' }, { modo: '1x1x1x1' }).modo).toBe('1x1x1x1');
  });

  it('trocar a modalidade leva ao formato com o mesmo número de lugares (a mesma regra da sala)', () => {
    const quatro: RegrasDaSala = { ...PADRAO, modo: '2x2' };
    expect(aplicarMudanca(quatro, { modalidade: 'mata-mata' })).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1x1' });
    expect(aplicarMudanca({ ...PADRAO, modalidade: 'mata-mata', modo: '1x1x1' }, { modalidade: 'par-ou-impar' })).toMatchObject({ modalidade: 'par-ou-impar', modo: '2x1' });
    expect(aplicarMudanca(PADRAO, { modalidade: 'mata-mata' })).toMatchObject({ modalidade: 'mata-mata', modo: '1x1' });
  });

  it('modalidade e formato juntos: o formato dito vale', () => {
    expect(aplicarMudanca(PADRAO, { modalidade: 'mata-mata', modo: '1x1x1' })).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1' });
  });

  it('o giz volta saneado', () => {
    expect(aplicarMudanca(PADRAO, { giz: { desgasteMin: 0.5, desgasteMax: 0.05, passada: 0.1, passadaS: 3 } }).giz).toMatchObject({ desgasteMin: 0.05, desgasteMax: 0.5 });
  });

  it('só considera os formatos que as regras jogam: sem o de 4 jogadores, o mata-mata cai no primeiro que joga', () => {
    const sem4 = (_m: Modalidade, modo: ModoSala): boolean => modo !== '1x1x1x1';
    expect(aplicarMudanca({ ...PADRAO, modo: '2x2' }, { modalidade: 'mata-mata' }, CATALOGO, sem4).modo).toBe('1x1');
    expect(aplicarMudanca({ ...PADRAO, modo: '2x1' }, { modalidade: 'mata-mata' }, CATALOGO, sem4).modo).toBe('1x1x1');
  });
});

describe('o navegador lembra a última escolha, como o tempo', () => {
  const lembradas = (): ArmazenamentoFalso => new ArmazenamentoFalso();
  const ESCOLHA: RegrasDaSala = {
    modalidade: 'mata-mata',
    modo: '1x1x1x1',
    tempoS: 45,
    linha: LINHA_COMPLETA,
    giz: { desgasteMin: 0.05, desgasteMax: 0.2, passada: 0.25, passadaS: 1.5 },
    forca: 'empurrar',
    aposta: 50,
  };

  it('grava e lê de volta cada campo, uma chave por tela (criar sala e mesmo PC)', () => {
    const a = lembradas();
    lembrarRegras('sala', ESCOLHA, a);
    expect(lerRegrasLembradas('sala', PADRAO, a)).toEqual(ESCOLHA);
    expect(lerRegrasLembradas('local', PADRAO, a)).toEqual(PADRAO);
    lembrarRegras('local', { ...ESCOLHA, modalidade: 'par-ou-impar', modo: '2x2', tempoS: null }, a);
    expect(lerRegrasLembradas('local', PADRAO, a)).toMatchObject({ modalidade: 'par-ou-impar', modo: '2x2', tempoS: null });
    expect(lerRegrasLembradas('sala', PADRAO, a)).toEqual(ESCOLHA);
  });

  it('as chaves são sinuca.lobby.sala e sinuca.lobby.local', () => {
    const a = lembradas();
    lembrarRegras('sala', ESCOLHA, a);
    lembrarRegras('local', ESCOLHA, a);
    expect([...a.dados.keys()].sort()).toEqual(['sinuca.lobby.local', 'sinuca.lobby.sala']);
  });

  it('esquecer apaga só a da tela pedida', () => {
    const a = lembradas();
    lembrarRegras('sala', ESCOLHA, a);
    lembrarRegras('local', ESCOLHA, a);
    esquecerRegras('sala', a);
    expect(lerRegrasLembradas('sala', PADRAO, a)).toEqual(PADRAO);
    expect(lerRegrasLembradas('local', PADRAO, a)).toEqual(ESCOLHA);
  });

  it('sem nada lembrado, sem armazenamento ou com lixo, vale o padrão', () => {
    expect(lerRegrasLembradas('sala', PADRAO, lembradas())).toEqual(PADRAO);
    expect(lerRegrasLembradas('sala', PADRAO, null)).toEqual(PADRAO);
    const a = lembradas();
    a.setItem('sinuca.lobby.sala', 'isto não é json');
    expect(lerRegrasLembradas('sala', PADRAO, a)).toEqual(PADRAO);
    a.setItem('sinuca.lobby.sala', '42');
    expect(lerRegrasLembradas('sala', PADRAO, a)).toEqual(PADRAO);
    a.setItem('sinuca.lobby.sala', JSON.stringify({ versao: 99, modalidade: 'mata-mata' }));
    expect(lerRegrasLembradas('sala', PADRAO, a)).toEqual(PADRAO);
  });

  it('gravar sem armazenamento não lança', () => {
    expect(() => lembrarRegras('sala', ESCOLHA, null)).not.toThrow();
  });

  it('cada campo é conferido: o que o catálogo ou as faixas não aceitam volta ao padrão, e o resto fica', () => {
    const a = lembradas();
    a.setItem(
      'sinuca.lobby.sala',
      JSON.stringify({ versao: 1, modalidade: 'rodada', modo: 'zzz', tempoS: 7, linha: { previsao: true, bolaAtingida: true }, giz: { desgasteMin: 9 }, forca: 'telepatia', aposta: 15 }),
    );
    expect(lerRegrasLembradas('sala', PADRAO, a)).toEqual({
      ...PADRAO,
      linha: LINHA_COMPLETA,
      // 9 vira o teto (0,5), passa do máximo de fábrica (0,3) e os dois trocam de lugar
      giz: { ...GIZ_DA_SALA_PADRAO, desgasteMin: 0.3, desgasteMax: 0.5 },
    });
  });

  it('a aposta lembrada é uma das quatro; um formato sem aposta (o de antes do L24) volta ao padrão e o resto fica', () => {
    const a = lembradas();
    lembrarRegras('sala', { ...ESCOLHA, aposta: 100 }, a);
    expect(lerRegrasLembradas('sala', PADRAO, a).aposta).toBe(100);
    a.setItem('sinuca.lobby.sala', JSON.stringify({ versao: 1, modalidade: 'mata-mata', modo: '1x1x1', tempoS: 45, linha: { previsao: false, bolaAtingida: false }, giz: GIZ_DA_SALA_PADRAO, forca: 'linha' }));
    expect(lerRegrasLembradas('sala', PADRAO, a)).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1', tempoS: 45, aposta: APOSTA_PADRAO });
    a.setItem('sinuca.lobby.sala', JSON.stringify({ versao: 1, aposta: '20' }));
    expect(lerRegrasLembradas('sala', PADRAO, a).aposta).toBe(APOSTA_PADRAO);
  });

  it('o formato lembrado que a modalidade não tem segue a regra de troca', () => {
    const a = lembradas();
    a.setItem('sinuca.lobby.sala', JSON.stringify({ versao: 1, modalidade: 'mata-mata', modo: '2x2', tempoS: 30, linha: { previsao: false, bolaAtingida: false }, giz: GIZ_DA_SALA_PADRAO, forca: 'linha' }));
    // 2x2 não é do mata-mata: cai no padrão do lobby (1x1), que serve
    expect(lerRegrasLembradas('sala', PADRAO, a)).toMatchObject({ modalidade: 'mata-mata', modo: '1x1' });
  });

  it('só os formatos que as regras jogam voltam', () => {
    const a = lembradas();
    lembrarRegras('sala', ESCOLHA, a);
    const sem4 = (_m: Modalidade, modo: ModoSala): boolean => modo !== '1x1x1x1';
    expect(lerRegrasLembradas('sala', PADRAO, a, CATALOGO, sem4).modo).toBe('1x1');
  });

  it('o tempo sem limite (null) é lembrado, e a linha desligada também', () => {
    const a = lembradas();
    lembrarRegras('sala', { ...ESCOLHA, tempoS: null, linha: LINHA_DESLIGADA }, a);
    const volta = lerRegrasLembradas('sala', { ...PADRAO, tempoS: 15, linha: LINHA_COMPLETA }, a);
    expect(volta.tempoS).toBeNull();
    expect(volta.linha).toBe(LINHA_DESLIGADA);
  });
});
