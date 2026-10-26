import { describe, expect, it } from 'vitest';
import type { Encacapada } from '@sinuca/regras';
import { CASA_8, CASA_MATA_MATA, QUARTETO_POR_SI, TRIO_POR_SI, partidaDeTeste } from '../jogo/para-testes';
import { classificacaoDaPartida, textoDaClassificacao } from './classificacao-modelo';

const quem = (jogador: number, ...bolas: number[]): Encacapada[] => bolas.map((bola) => ({ bola, jogador }));

const mata = (encacapadas: readonly Encacapada[], vencedor: number | null, trio = true) =>
  partidaDeTeste({
    config: CASA_MATA_MATA,
    jogadores: trio ? TRIO_POR_SI : QUARTETO_POR_SI,
    grupos: trio ? [null, null, null] : [null, null, null, null],
    fase: vencedor === null ? 'aberta' : 'fim',
    naMesa: [],
    encacapadas,
    vencedor,
  });

describe('classificacaoDaPartida', () => {
  it('do primeiro ao último, com os pontos de cada um (uma bola, um ponto)', () => {
    const c = classificacaoDaPartida(mata([...quem(0, 1, 2, 3, 4, 5, 6), ...quem(2, 7, 8, 9, 10, 11), ...quem(1, 12, 13, 14, 15)], 0))!;
    expect(c.map((l) => [l.posicao, l.nome, l.pontos, l.vencedor])).toEqual([
      [1, 'Ana', 6, true],
      [2, 'Caio', 5, false],
      [3, 'Beto', 4, false],
    ]);
  });

  it('cada linha leva a equipe, para o nome ter a mesma cor do placar das bolas', () => {
    const c = classificacaoDaPartida(mata([...quem(0, 1, 2, 3, 4, 5, 6), ...quem(2, 7, 8, 9, 10, 11), ...quem(1, 12, 13, 14, 15)], 0))!;
    expect(c.map((l) => l.equipe)).toEqual([0, 2, 1]);
  });

  it('no empate, quem as regras deram a vitória vem primeiro, e os outros seguem a ordem da roda', () => {
    // Beto e Caio empatam com 5; Ana fica com 5 também; Beto matou por último e as regras deram a ele
    const bolas = [...quem(0, 1, 2, 3, 4, 5), ...quem(2, 6, 7, 8, 9, 10), ...quem(1, 11, 12, 13, 14, 15)];
    const c = classificacaoDaPartida(mata(bolas, 1))!;
    expect(c.map((l) => [l.nome, l.pontos, l.vencedor])).toEqual([
      ['Beto', 5, true],
      ['Ana', 5, false],
      ['Caio', 5, false],
    ]);
  });

  it('quatro jogadores', () => {
    const c = classificacaoDaPartida(mata([...quem(3, 1, 2, 3, 4), ...quem(1, 5, 6, 7), ...quem(0, 8, 9, 10), ...quem(2, 11, 12, 13, 14, 15)], 2, false))!;
    expect(c.map((l) => l.nome)).toEqual(['Caio', 'Dani', 'Ana', 'Beto']);
    expect(c.map((l) => l.pontos)).toEqual([5, 4, 3, 3]);
    expect(c.map((l) => l.posicao)).toEqual([1, 2, 3, 4]);
  });

  it('quem não matou nenhuma bola aparece com zero', () => {
    const c = classificacaoDaPartida(mata(quem(1, 1, 2), 1))!;
    expect(c.map((l) => [l.nome, l.pontos])).toEqual([
      ['Beto', 2],
      ['Ana', 0],
      ['Caio', 0],
    ]);
  });

  it('partida sem vencedor (em andamento) também classifica, sem ninguém marcado como vencedor', () => {
    const c = classificacaoDaPartida(mata(quem(0, 1), null))!;
    expect(c[0]).toMatchObject({ nome: 'Ana', pontos: 1, vencedor: false });
  });

  it('par ou ímpar não tem classificação: joga-se por grupo', () => {
    expect(classificacaoDaPartida(partidaDeTeste({ config: CASA_8 }))).toBeNull();
  });

  it('o texto para dica e gancho: "1º Ana 6 · 2º Caio 5"', () => {
    const c = classificacaoDaPartida(mata([...quem(0, 1, 2, 3, 4, 5, 6), ...quem(2, 7, 8, 9, 10, 11), ...quem(1, 12, 13, 14, 15)], 0))!;
    expect(textoDaClassificacao(c)).toBe('1º Ana 6 · 2º Caio 5 · 3º Beto 4');
  });
});
