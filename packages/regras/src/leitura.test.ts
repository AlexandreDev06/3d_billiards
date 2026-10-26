import { describe, expect, it } from 'vitest';
import {
  bolaDeCastigo,
  bolasAlvo,
  bolasDaCasa,
  bolasRestantes,
  grupoDaBola,
  jogadoresDaProxima,
  nomeDaBolaFinal,
  objetivo,
  rotuloDaFalta,
  ROTULO_FALTA,
  ROTULO_GRUPO,
} from './leitura';
import { aplicarTacada, novaPartida } from './partida';
import {
  ANA,
  BETO,
  CAIO,
  CASTIGO_1,
  DANI,
  DUPLAS,
  JOGADORES,
  SEM_FINAL,
  config,
  eventos,
  numeros,
  partidaCom,
  rngDeTeste,
} from './para-testes';

describe('bolasDaCasa', () => {
  it('2 a 14 no Boteco (sem a 1 e a 15); 1 a 15 e 2 a 15 como opção', () => {
    expect(bolasDaCasa(config())).toEqual(numeros(2, 14));
    expect(bolasDaCasa(config(CASTIGO_1))).toEqual(numeros(1, 15));
    expect(bolasDaCasa(config(SEM_FINAL))).toEqual(numeros(2, 15));
  });
});

describe('grupoDaBola', () => {
  it('Boteco: ímpares 3 a 13 e pares 2, 4, 6, 10, 12, 14; a 8 é a final e a 1 e a 15 não estão na mesa', () => {
    const c = config();
    expect(numeros(1, 15).filter((b) => grupoDaBola(b, c) === 'impar')).toEqual([3, 5, 7, 9, 11, 13]);
    expect(numeros(1, 15).filter((b) => grupoDaBola(b, c) === 'par')).toEqual([2, 4, 6, 10, 12, 14]);
    for (const b of [0, 1, 8, 15]) expect(grupoDaBola(b, c)).toBeNull();
  });

  it('1-15: 2 a 15 pela paridade; o bolão e a 1 (castigo) não são de grupo', () => {
    const c = config(CASTIGO_1);
    expect(grupoDaBola(2, c)).toBe('par');
    expect(grupoDaBola(8, c)).toBe('par');
    expect(grupoDaBola(14, c)).toBe('par');
    expect(grupoDaBola(3, c)).toBe('impar');
    expect(grupoDaBola(15, c)).toBe('impar');
    expect(grupoDaBola(0, c)).toBeNull();
    expect(grupoDaBola(1, c)).toBeNull();
  });

  it('2-15 sem bola final: 2 a 15 pela paridade', () => {
    const c = config(SEM_FINAL);
    expect(numeros(2, 15).every((b) => grupoDaBola(b, c) === (b % 2 === 0 ? 'par' : 'impar'))).toBe(true);
    expect(grupoDaBola(1, c)).toBeNull();
  });
});

describe('bolaDeCastigo', () => {
  it('a 8 no Boteco, a 1 em 1-15, nenhuma sem bola final', () => {
    expect(bolaDeCastigo(config())).toBe(8);
    expect(bolaDeCastigo(config(CASTIGO_1))).toBe(1);
    expect(bolaDeCastigo(config(SEM_FINAL))).toBeNull();
  });
});

describe('nomeDaBolaFinal e rotuloDaFalta', () => {
  it('"a 8", "o castigo" (a 1) ou nada', () => {
    expect(nomeDaBolaFinal(config())).toBe('a 8');
    expect(nomeDaBolaFinal(config(CASTIGO_1))).toBe('o castigo');
    expect(nomeDaBolaFinal(config(SEM_FINAL))).toBeNull();
  });

  it('a falta de tocar a bola final antes da hora leva o nome dela; as outras são as de ROTULO_FALTA', () => {
    expect(rotuloDaFalta('castigo-fora-de-hora', config())).toBe('A 8 fora de hora');
    expect(rotuloDaFalta('castigo-fora-de-hora', config(CASTIGO_1))).toBe('Castigo fora de hora');
    expect(rotuloDaFalta('direta', config())).toBe('Direta');
  });
});

describe('bolasRestantes', () => {
  it('as do grupo do jogador na mesa, em ordem, sem a bola final; nenhuma com a mesa aberta', () => {
    const p = partidaCom({ naMesa: [7, 8, 4, 2, 3] });
    expect(bolasRestantes(p, ANA)).toEqual([2, 4]);
    expect(bolasRestantes(p, BETO)).toEqual([3, 7]);
    expect(bolasRestantes(partidaCom({ naMesa: numeros(2, 14), grupos: [null, null] }), ANA)).toEqual([]);
    expect(bolasRestantes(partidaCom({ naMesa: [7, 1, 4, 8, 3], regras: CASTIGO_1 }), ANA)).toEqual([4, 8]);
  });
});

describe('objetivo', () => {
  it('qualquer com a mesa aberta, grupo enquanto houver, a bola final depois', () => {
    expect(objetivo(partidaCom({ naMesa: numeros(2, 14), grupos: [null, null], fase: 'saida' }), ANA)).toBe('qualquer');
    const p = partidaCom({ naMesa: [3, 8] });
    expect(objetivo(p, ANA)).toBe('castigo');
    expect(objetivo(p, BETO)).toBe('grupo');
    expect(objetivo(partidaCom({ naMesa: [1, 3], regras: CASTIGO_1 }), ANA)).toBe('castigo');
    expect(objetivo(partidaCom({ naMesa: [3, 5], regras: SEM_FINAL }), ANA)).toBe('grupo');
  });
});

describe('bolasAlvo', () => {
  const saida = (regras = {}) => novaPartida(config(regras), JOGADORES, rngDeTeste(1)).partida;
  const semA8 = numeros(2, 14).filter((b) => b !== 8);

  it('Boteco na saída: as numeradas sem a 8, para quem sai e para o outro', () => {
    expect(bolasAlvo(saida())).toEqual(semA8);
    expect(bolasAlvo(saida(), BETO)).toEqual(semA8);
  });

  it('mesa aberta com a 8 livre: a 8 também vale', () => {
    expect(bolasAlvo(saida({ castigoPrimeiroMesaAberta: 'livre' }))).toEqual(numeros(2, 14));
    expect(bolasAlvo(partidaCom({ naMesa: numeros(2, 14), grupos: [null, null], regras: { castigoPrimeiroMesaAberta: 'livre' } }))).toEqual(numeros(2, 14));
  });

  it('1-15: na saída o castigo ainda não está na mesa, nem livre; depois dela, só livre', () => {
    expect(bolasAlvo(saida(CASTIGO_1))).toEqual(numeros(2, 15));
    expect(bolasAlvo(saida({ ...CASTIGO_1, castigoPrimeiroMesaAberta: 'livre' }))).toEqual(numeros(2, 15));
    const aberta = (regras: object) => partidaCom({ naMesa: numeros(1, 15), grupos: [null, null], regras: { ...CASTIGO_1, ...regras } });
    expect(bolasAlvo(aberta({}))).toEqual(numeros(2, 15));
    expect(bolasAlvo(aberta({ castigoPrimeiroMesaAberta: 'livre' }))).toEqual(numeros(1, 15));
  });

  it('grupos: as do grupo de cada um que estão na mesa, em ordem; sem o jogador, quem tem a vez', () => {
    const p = partidaCom({ naMesa: [12, 3, 8, 2, 7], retiradas: [4] });
    expect(bolasAlvo(p)).toEqual([2, 12]);
    expect(bolasAlvo(p, ANA)).toEqual([2, 12]);
    expect(bolasAlvo(p, BETO)).toEqual([3, 7]);
    expect(bolasAlvo({ ...p, vez: BETO })).toEqual([3, 7]);
  });

  it('castigo: só a bola final', () => {
    const p = partidaCom({ naMesa: [3, 8], fase: 'castigo' });
    expect(bolasAlvo(p, ANA)).toEqual([8]);
    expect(bolasAlvo(p, BETO)).toEqual([3]);
    expect(bolasAlvo(partidaCom({ naMesa: [1, 3], regras: CASTIGO_1 }), ANA)).toEqual([1]);
  });

  it('sem bola final: a última do grupo é alvo como as outras', () => {
    const p = partidaCom({ naMesa: [3, 5, 14], regras: SEM_FINAL });
    expect(bolasAlvo(p, ANA)).toEqual([14]);
    expect(bolasAlvo(p, BETO)).toEqual([3, 5]);
  });

  it('duplas: as do grupo da equipe', () => {
    const p = partidaCom({ naMesa: [2, 3, 8, 13], jogadores: DUPLAS, vez: CAIO });
    expect(bolasAlvo(p)).toEqual([2]);
    expect(bolasAlvo(p, ANA)).toEqual([2]);
    expect(bolasAlvo(p, DANI)).toEqual([3, 13]);
    expect(bolasAlvo(partidaCom({ naMesa: [3, 8, 13], jogadores: DUPLAS }), CAIO)).toEqual([8]);
  });

  it('partida encerrada: nenhuma; jogador que não existe: erro', () => {
    const { partida } = aplicarTacada(partidaCom({ naMesa: [3, 8] }), eventos({ toca: 8, caem: [8] }));
    expect(bolasAlvo(partida)).toEqual([]);
    expect(bolasAlvo(partida, ANA)).toEqual([]);
    expect(() => bolasAlvo(partidaCom({ naMesa: [2, 3, 8] }), 2)).toThrow(/não existe/);
  });
});

describe('jogadoresDaProxima', () => {
  it('põe quem sai na próxima em primeiro, sem mudar a ordem da roda', () => {
    const { partida } = aplicarTacada(partidaCom({ naMesa: [3, 8] }), eventos({ toca: 8, caem: [8] }));
    expect(partida.vez).toBe(BETO);
    expect(jogadoresDaProxima(partida)).toEqual([JOGADORES[1], JOGADORES[0]]);
  });

  it('só depois do fim', () => {
    expect(() => jogadoresDaProxima(partidaCom({ naMesa: [3, 8] }))).toThrow(/terminou/);
  });
});

describe('ROTULO_FALTA', () => {
  it('nomes curtos para o HUD', () => {
    expect(ROTULO_FALTA).toEqual({
      suicidio: 'Suicídio',
      cegar: 'Cegou',
      direta: 'Direta',
      'branca-fora': 'Bolão fora da mesa',
      'castigo-fora-de-hora': 'Castigo fora de hora',
      'bola-fora': 'Bola fora da mesa',
    });
  });
});

describe('ROTULO_GRUPO', () => {
  it('nome de cada grupo para o placar', () => {
    expect(ROTULO_GRUPO).toEqual({ par: 'Pares', impar: 'Ímpares' });
  });
});
