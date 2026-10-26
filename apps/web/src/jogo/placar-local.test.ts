import { describe, expect, it } from 'vitest';
import type { EstadoPartida, Jogador } from '@sinuca/regras';
import { JOGADORES_HOT_SEAT, jogadoresDoHotSeat } from '../config';
import { PlacarLocal } from './placar-local';
import { CASA_MATA_MATA, partidaDeTeste } from './para-testes';

/** Uma partida terminada com a roda dada e a equipe `vencedor` na frente. */
const terminada = (jogadores: readonly Jogador[], vencedor: 0 | 1): EstadoPartida => partidaDeTeste({ jogadores, vencedor, fase: 'fim', grupos: [null, null] });
const textos = (p: PlacarLocal): string[] => p.noFio().historico.map((c) => c.lados.map((l) => `${l.nomes.join(' e ')} ${l.vitorias}`).join(' x '));
const atual = (p: PlacarLocal): string => {
  const c = p.noFio().atual;
  return c === null ? '-' : c.lados.map((l) => `${l.nomes.join(' e ')} ${l.vitorias}`).join(' x ');
};

describe('PlacarLocal (o placar do mesmo PC, com a conta da sala)', () => {
  it('começa vazio', () => {
    expect(new PlacarLocal().noFio()).toEqual({ atual: null, historico: [] });
  });

  it('1×1: duas partidas seguidas do mesmo lado somam 1 × 0 e 2 × 0', () => {
    const p = new PlacarLocal();
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    expect(atual(p)).toBe('Jogador 1 1 x Jogador 2 0');
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    expect(atual(p)).toBe('Jogador 1 2 x Jogador 2 0');
    p.registrar(terminada(JOGADORES_HOT_SEAT, 1));
    expect(atual(p)).toBe('Jogador 1 2 x Jogador 2 1');
  });

  it('a roda que gira (quem sai na próxima) é a mesma formação: a vitória segue a pessoa, não a ordem', () => {
    const p = new PlacarLocal();
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    const girada = [JOGADORES_HOT_SEAT[1]!, JOGADORES_HOT_SEAT[0]!];
    p.registrar(terminada(girada, 1)); // a equipe fica com a pessoa (o Jogador 2 é a equipe 1), mesmo saindo primeiro
    expect(atual(p)).toBe('Jogador 1 1 x Jogador 2 1');
    expect(p.noFio().historico).toEqual([]);
  });

  it('formação diferente (outro modo) abre um confronto novo em 1 × 0 e o anterior vai para o histórico', () => {
    const p = new PlacarLocal();
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    p.registrar(terminada(jogadoresDoHotSeat('2x1'), 1));
    expect(atual(p)).toBe('Jogador 1 e Jogador 3 0 x Jogador 2 1');
    expect(textos(p)).toEqual(['Jogador 1 2 x Jogador 2 0']);
  });

  it('o 2×2 do mesmo PC soma enquanto são os mesmos quatro, e volta ao 1×1 num confronto novo (o antigo não é retomado)', () => {
    const p = new PlacarLocal();
    const duplas = jogadoresDoHotSeat('2x2');
    expect(duplas.map((j) => j.id)).toEqual(['j1', 'j2', 'j3', 'j4']);
    p.registrar(terminada(duplas, 1));
    p.registrar(terminada(duplas, 1));
    expect(atual(p)).toBe('Jogador 1 e Jogador 3 0 x Jogador 2 e Jogador 4 2');
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    p.registrar(terminada(duplas, 0));
    expect(atual(p)).toBe('Jogador 1 e Jogador 3 1 x Jogador 2 e Jogador 4 0');
    expect(textos(p)).toEqual(['Jogador 1 1 x Jogador 2 0', 'Jogador 1 e Jogador 3 0 x Jogador 2 e Jogador 4 2']);
  });

  it('a identidade é o id, não o apelido: mesmos ids com apelidos iguais soma, ids diferentes com o mesmo apelido abrem confronto novo', () => {
    const p = new PlacarLocal();
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    const outroPar: Jogador[] = [
      { id: 'x1', nome: 'Jogador 1', equipe: 0 },
      { id: 'x2', nome: 'Jogador 2', equipe: 1 },
    ];
    p.registrar(terminada(outroPar, 0));
    expect(atual(p)).toBe('Jogador 1 1 x Jogador 2 0');
    expect(p.noFio().historico).toHaveLength(1);
  });

  it('partida sem vencedor não conta, e a mesma partida registrada duas vezes conta uma só', () => {
    const p = new PlacarLocal();
    p.registrar(partidaDeTeste({ jogadores: JOGADORES_HOT_SEAT }));
    expect(p.noFio().atual).toBeNull();
    const fim = terminada(JOGADORES_HOT_SEAT, 1);
    p.registrar(fim);
    p.registrar(fim);
    expect(atual(p)).toBe('Jogador 1 0 x Jogador 2 1');
  });

  it('zerar volta ao começo, e a mesma partida pode ser contada de novo depois', () => {
    const p = new PlacarLocal();
    const fim = terminada(JOGADORES_HOT_SEAT, 0);
    p.registrar(fim);
    p.zerar();
    expect(p.noFio()).toEqual({ atual: null, historico: [] });
    p.registrar(fim);
    expect(atual(p)).toBe('Jogador 1 1 x Jogador 2 0');
  });

  it('o fio não leva o id de ninguém (o mesmo formato da sala)', () => {
    const p = new PlacarLocal();
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    expect(JSON.stringify(p.noFio())).not.toMatch(/"id"|j1|j2/);
  });

  it('guarda no máximo 10 confrontos: o atual e 9 no histórico', () => {
    const p = new PlacarLocal();
    for (let i = 0; i < 12; i++) {
      const par: Jogador[] = [
        { id: `a${i}`, nome: `A${i}`, equipe: 0 },
        { id: `b${i}`, nome: `B${i}`, equipe: 1 },
      ];
      p.registrar(terminada(par, 0));
    }
    expect(p.noFio().historico).toHaveLength(9);
    expect(atual(p)).toBe('A11 1 x B11 0');
    expect(textos(p)[0]).toBe('A10 1 x B10 0');
  });
});

// ---------------------------------------------------------------- L17: mata-mata no mesmo PC (3 e 4 lados) e a modalidade

/** Uma partida de mata-mata terminada: a roda dada, e a equipe `vencedor` na frente. */
const mataTerminada = (jogadores: readonly Jogador[], vencedor: number): EstadoPartida =>
  partidaDeTeste({ config: CASA_MATA_MATA, jogadores, vencedor, fase: 'fim', grupos: jogadores.map(() => null) });
const lados = (p: PlacarLocal): string => {
  const c = p.noFio().atual;
  return c === null ? '-' : `${c.modalidade}: ${c.lados.map((l) => `${l.nomes.join(' e ')} ${l.vitorias}`).join(' · ')}`;
};

describe('PlacarLocal no mata-mata', () => {
  it('três jogadores: um lado por pessoa, e cada vitória soma para quem a ganhou', () => {
    const p = new PlacarLocal();
    const trio = jogadoresDoHotSeat('1x1x1');
    p.registrar(mataTerminada(trio, 0));
    expect(lados(p)).toBe('mata-mata: Jogador 1 1 · Jogador 2 0 · Jogador 3 0');
    p.registrar(mataTerminada(trio, 2));
    p.registrar(mataTerminada(trio, 2));
    expect(lados(p)).toBe('mata-mata: Jogador 1 1 · Jogador 2 0 · Jogador 3 2');
  });

  it('quatro jogadores: quatro lados', () => {
    const p = new PlacarLocal();
    p.registrar(mataTerminada(jogadoresDoHotSeat('1x1x1x1'), 3));
    expect(lados(p)).toBe('mata-mata: Jogador 1 0 · Jogador 2 0 · Jogador 3 0 · Jogador 4 1');
  });

  it('a roda que gira (quem sai na próxima) é o mesmo confronto: a vitória segue a pessoa, não a posição na roda', () => {
    const p = new PlacarLocal();
    const trio = jogadoresDoHotSeat('1x1x1');
    p.registrar(mataTerminada(trio, 1));
    // a roda girou (o Jogador 2 sai primeiro), mas cada um mantém a equipe: o Jogador 3 é a equipe 2
    const girada = [trio[1]!, trio[2]!, trio[0]!];
    p.registrar(mataTerminada(girada, 2));
    expect(lados(p)).toBe('mata-mata: Jogador 1 0 · Jogador 2 1 · Jogador 3 1');
    expect(p.noFio().historico).toEqual([]);
  });

  it('o mesmo 1×1 de par ou ímpar e de mata-mata são confrontos diferentes: trocar de modalidade abre um confronto novo e manda o antigo ao histórico', () => {
    const p = new PlacarLocal();
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    p.registrar(terminada(JOGADORES_HOT_SEAT, 0));
    p.registrar(mataTerminada(JOGADORES_HOT_SEAT, 1));
    expect(lados(p)).toBe('mata-mata: Jogador 1 0 · Jogador 2 1');
    expect(p.noFio().historico).toHaveLength(1);
    expect(p.noFio().historico[0]!.modalidade).toBe('par-ou-impar');
    expect(textos(p)).toEqual(['Jogador 1 2 x Jogador 2 0']);
    // voltar ao par ou ímpar não retoma o confronto antigo
    p.registrar(terminada(JOGADORES_HOT_SEAT, 1));
    expect(atual(p)).toBe('Jogador 1 0 x Jogador 2 1');
    expect(p.noFio().historico).toHaveLength(2);
  });

  it('de 3 para 4 jogadores é formação diferente: confronto novo', () => {
    const p = new PlacarLocal();
    p.registrar(mataTerminada(jogadoresDoHotSeat('1x1x1'), 0));
    p.registrar(mataTerminada(jogadoresDoHotSeat('1x1x1x1'), 0));
    expect(lados(p)).toBe('mata-mata: Jogador 1 1 · Jogador 2 0 · Jogador 3 0 · Jogador 4 0');
    expect(p.noFio().historico).toHaveLength(1);
  });

  it('o fio do mata-mata também não leva o id de ninguém', () => {
    const p = new PlacarLocal();
    p.registrar(mataTerminada(jogadoresDoHotSeat('1x1x1'), 1));
    expect(JSON.stringify(p.noFio())).not.toMatch(/"id"|j1|j2|j3/);
  });
});
