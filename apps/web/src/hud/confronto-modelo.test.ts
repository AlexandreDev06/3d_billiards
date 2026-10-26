import { describe, expect, it } from 'vitest';
import type { ConfrontoPlacar, PlacarSala } from '@sinuca/protocolo';
import { CASA_MATA_MATA, DUPLAS_DE_TESTE, QUARTETO_POR_SI, TRIO_DE_TESTE, TRIO_POR_SI, partidaDeTeste } from '../jogo/para-testes';
import { confrontoNaTela, confrontoZerado, formacaoDaPartida, mesmaFormacao, placarDaTela, placarParaMostrar } from './confronto-modelo';

const confronto = (a: readonly string[], va: number, b: readonly string[], vb: number): ConfrontoPlacar => ({
  lados: [
    { nomes: a, vitorias: va },
    { nomes: b, vitorias: vb },
  ],
});

describe('confrontoNaTela', () => {
  it('"Ana 3 × 1 Beto": nome, vitórias, nome', () => {
    const c = confrontoNaTela(confronto(['Ana'], 3, ['Beto'], 1));
    expect(c.texto).toBe('Ana 3 × 1 Beto');
    expect(c.lados.map((l) => [l.nome, l.vitorias])).toEqual([
      ['Ana', 3],
      ['Beto', 1],
    ]);
  });

  it('com equipes, os nomes do lado vêm juntos: "Ana e Caio 2 × 0 Beto"', () => {
    expect(confrontoNaTela(confronto(['Ana', 'Caio'], 2, ['Beto'], 0)).texto).toBe('Ana e Caio 2 × 0 Beto');
    expect(confrontoNaTela(confronto(['Ana', 'Caio'], 0, ['Beto', 'Dani'], 4)).texto).toBe('Ana e Caio 0 × 4 Beto e Dani');
  });

  it('quem está na frente: o lado com mais vitórias; empate não tem líder', () => {
    expect(confrontoNaTela(confronto(['Ana'], 3, ['Beto'], 1)).lider).toBe(0);
    expect(confrontoNaTela(confronto(['Ana'], 1, ['Beto'], 3)).lider).toBe(1);
    expect(confrontoNaTela(confronto(['Ana'], 2, ['Beto'], 2)).lider).toBeNull();
    expect(confrontoNaTela(confronto(['Ana'], 0, ['Beto'], 0)).lider).toBeNull();
  });

  it('a ordem dos lados é a do fio, nunca reordenada', () => {
    expect(confrontoNaTela(confronto(['Beto'], 1, ['Ana'], 3)).texto).toBe('Beto 1 × 3 Ana');
  });
});

describe('confrontoZerado', () => {
  it('é a formação em 0 × 0, sem líder', () => {
    const c = confrontoZerado([['Ana', 'Caio'], ['Beto']]);
    expect(c.texto).toBe('Ana e Caio 0 × 0 Beto');
    expect(c.lider).toBeNull();
  });
});

describe('mesmaFormacao', () => {
  const c = confronto(['Ana', 'Caio'], 2, ['Beto', 'Dani'], 1);

  it('os mesmos apelidos de cada lado, em qualquer ordem dentro do lado', () => {
    expect(mesmaFormacao(c, [['Ana', 'Caio'], ['Beto', 'Dani']])).toBe(true);
    expect(mesmaFormacao(c, [['Caio', 'Ana'], ['Dani', 'Beto']])).toBe(true);
  });

  it('com os lados trocados de equipe, é o mesmo confronto', () => {
    expect(mesmaFormacao(c, [['Beto', 'Dani'], ['Ana', 'Caio']])).toBe(true);
  });

  it('trocou uma pessoa, ou mudou quem está com quem, é outro confronto', () => {
    expect(mesmaFormacao(c, [['Ana', 'Caio'], ['Beto', 'Edu']])).toBe(false);
    expect(mesmaFormacao(c, [['Ana', 'Beto'], ['Caio', 'Dani']])).toBe(false);
    expect(mesmaFormacao(c, [['Ana'], ['Beto']])).toBe(false);
    expect(mesmaFormacao(c, [['Ana', 'Caio'], ['Beto']])).toBe(false);
  });

  it('um lado igual não basta: os dois têm de bater, também com os lados trocados', () => {
    expect(mesmaFormacao(c, [['Zé'], ['Ana', 'Caio']])).toBe(false);
    expect(mesmaFormacao(c, [['Beto', 'Dani'], ['Zé']])).toBe(false);
    expect(mesmaFormacao(c, [['Ana', 'Caio'], ['Zé']])).toBe(false);
    expect(mesmaFormacao(c, [['Zé'], ['Beto', 'Dani']])).toBe(false);
  });

  it('um lado de uma pessoa e outro de duas não se confundem', () => {
    const c21 = confronto(['Ana', 'Caio'], 1, ['Beto'], 0);
    expect(mesmaFormacao(c21, [['Ana', 'Caio'], ['Beto']])).toBe(true);
    expect(mesmaFormacao(c21, [['Ana'], ['Beto']])).toBe(false);
    expect(mesmaFormacao(c21, [['Ana', 'Caio'], ['Beto', 'Dani']])).toBe(false);
  });
});

describe('formacaoDaPartida', () => {
  it('um 1×1: um nome por equipe', () => {
    expect(formacaoDaPartida(partidaDeTeste())).toEqual([['Ana'], ['Beto']]);
  });

  it('o 2×1 e o 2×2: os nomes de cada equipe, na ordem da roda', () => {
    expect(formacaoDaPartida(partidaDeTeste({ jogadores: TRIO_DE_TESTE }))).toEqual([['Ana', 'Caio'], ['Beto']]);
    expect(formacaoDaPartida(partidaDeTeste({ jogadores: DUPLAS_DE_TESTE }))).toEqual([['Ana', 'Caio'], ['Beto', 'Dani']]);
  });

  it('a equipe 0 vem primeiro mesmo quando a roda começa pela equipe 1 (a de 1 sai)', () => {
    const roda = [TRIO_DE_TESTE[1]!, TRIO_DE_TESTE[0]!, TRIO_DE_TESTE[2]!];
    expect(formacaoDaPartida(partidaDeTeste({ jogadores: roda }))).toEqual([['Ana', 'Caio'], ['Beto']]);
  });
});

describe('placarParaMostrar', () => {
  const atual = confronto(['Ana'], 3, ['Beto'], 1);
  const antigo = confronto(['Ana', 'Caio'], 2, ['Beto'], 2);
  const maisAntigo = confronto(['Ana'], 0, ['Dani'], 5);
  const placar: PlacarSala = { atual, historico: [antigo, maisAntigo] };

  it('sem placar da sala e sem formação, não há o que mostrar', () => {
    expect(placarParaMostrar(undefined, null)).toEqual({ atual: null, novo: false, historico: [], contou: false });
    expect(placarParaMostrar({ atual: null, historico: [] }, null)).toMatchObject({ atual: null, contou: false });
  });

  it('uma sala que não manda o placar (versão antiga) não ganha um 0 × 0 inventado, mesmo sabendo quem joga', () => {
    expect(placarParaMostrar(undefined, [['Ana'], ['Beto']])).toEqual({ atual: null, novo: false, historico: [], contou: false });
    expect(placarParaMostrar(null, [['Ana'], ['Beto']]).atual).toBeNull();
  });

  it('antes da primeira partida, quem joga já aparece em 0 × 0 (o HUD mostra desde o começo), sem contar como placar', () => {
    const p = placarParaMostrar({ atual: null, historico: [] }, [['Ana'], ['Beto']]);
    expect(p.atual?.texto).toBe('Ana 0 × 0 Beto');
    expect(p.contou).toBe(false);
    expect(p.novo).toBe(true);
    expect(placarParaMostrar({ atual: null, historico: [] }, null).novo).toBe(false);
  });

  it('a mesma formação continua o confronto da sala, com o histórico do mais recente ao mais antigo', () => {
    const p = placarParaMostrar(placar, [['Ana'], ['Beto']]);
    expect(p.atual?.texto).toBe('Ana 3 × 1 Beto');
    expect(p.novo).toBe(false);
    expect(p.contou).toBe(true);
    expect(p.historico.map((c) => c.texto)).toEqual(['Ana e Caio 2 × 2 Beto', 'Ana 0 × 5 Dani']);
  });

  it('os lados trocados contam como o mesmo confronto, mostrado como a sala o mandou', () => {
    const p = placarParaMostrar(placar, [['Beto'], ['Ana']]);
    expect(p.atual?.texto).toBe('Ana 3 × 1 Beto');
    expect(p.novo).toBe(false);
  });

  it('formação diferente: já mostra o confronto novo em 0 × 0 e o anterior desce para o histórico, como a sala fará ao fim da partida', () => {
    const p = placarParaMostrar(placar, [['Ana', 'Caio'], ['Beto']]);
    expect(p.atual?.texto).toBe('Ana e Caio 0 × 0 Beto');
    expect(p.novo).toBe(true);
    expect(p.contou).toBe(true);
    expect(p.historico.map((c) => c.texto)).toEqual(['Ana 3 × 1 Beto', 'Ana e Caio 2 × 2 Beto', 'Ana 0 × 5 Dani']);
  });

  it('sem formação (lugar vago na espera) o confronto fica como a sala o mandou: quem volta continua nele', () => {
    const p = placarParaMostrar(placar, null);
    expect(p.atual?.texto).toBe('Ana 3 × 1 Beto');
    expect(p.novo).toBe(false);
    expect(p.historico).toHaveLength(2);
  });

  it('não muda o placar recebido', () => {
    const copia = JSON.parse(JSON.stringify(placar)) as PlacarSala;
    placarParaMostrar(placar, [['Zé'], ['Beto']]);
    expect(placar).toEqual(copia);
  });
});

describe('placarDaTela: o placar bruto que a tela usa', () => {
  const antes: PlacarSala = { atual: confronto(['Ana'], 1, ['Beto'], 0), historico: [] };
  const depois: PlacarSala = { atual: confronto(['Ana'], 2, ['Beto'], 0), historico: [] };
  const local: PlacarSala = { atual: confronto(['Jogador 1'], 5, ['Jogador 2'], 4), historico: [] };

  it('no hot-seat é sempre o contado neste PC, toque ou não', () => {
    expect(placarDaTela({ online: false, tocando: false, mostrado: antes, sala: depois, local })).toBe(local);
    expect(placarDaTela({ online: false, tocando: true, mostrado: antes, sala: depois, local })).toBe(local);
  });

  it('online, parado, é o que a sala mandou', () => {
    expect(placarDaTela({ online: true, tocando: false, mostrado: antes, sala: depois, local })).toBe(depois);
  });

  it('online, com a tacada que decide ainda tocando, fica o de antes (o número novo estragaria o suspense)', () => {
    expect(placarDaTela({ online: true, tocando: true, mostrado: antes, sala: depois, local })).toBe(antes);
  });

  it('online sem placar da sala (antes de ela mandar, ou aba antiga) não mostra nada', () => {
    expect(placarDaTela({ online: true, tocando: false, mostrado: antes, sala: undefined, local })).toBeNull();
  });
});

// ---------------------------------------------------------------- L17: três ou quatro lados e a modalidade (mata-mata)

const lados = (...itens: readonly [string, number][]): ConfrontoPlacar['lados'] => itens.map(([nome, vitorias]) => ({ nomes: [nome], vitorias })) as unknown as ConfrontoPlacar['lados'];
const mata = (...itens: readonly [string, number][]): ConfrontoPlacar => ({ modalidade: 'mata-mata', lados: lados(...itens) });

describe('confrontoNaTela com três ou quatro lados (mata-mata)', () => {
  it('"Ana 2 · Beto 1 · Caio 0": cada um com os seus pontos, na ordem do fio', () => {
    const c = confrontoNaTela(mata(['Ana', 2], ['Beto', 1], ['Caio', 0]));
    expect(c.texto).toBe('Ana 2 · Beto 1 · Caio 0');
    expect(c.lados.map((l) => [l.nome, l.vitorias])).toEqual([
      ['Ana', 2],
      ['Beto', 1],
      ['Caio', 0],
    ]);
    expect(confrontoNaTela(mata(['Ana', 0], ['Beto', 3], ['Caio', 1], ['Dani', 1])).texto).toBe('Ana 0 · Beto 3 · Caio 1 · Dani 1');
  });

  it('dois lados do mata-mata continuam "Ana 3 × 1 Beto"', () => {
    expect(confrontoNaTela(mata(['Ana', 3], ['Beto', 1])).texto).toBe('Ana 3 × 1 Beto');
  });

  it('o líder é o índice de quem tem mais vitórias; empate no topo, ou todo mundo em zero, não tem líder', () => {
    expect(confrontoNaTela(mata(['Ana', 2], ['Beto', 1], ['Caio', 0])).lider).toBe(0);
    expect(confrontoNaTela(mata(['Ana', 0], ['Beto', 1], ['Caio', 4], ['Dani', 4])).lider).toBeNull();
    expect(confrontoNaTela(mata(['Ana', 0], ['Beto', 1], ['Caio', 5], ['Dani', 4])).lider).toBe(2);
    expect(confrontoNaTela(mata(['Ana', 0], ['Beto', 0], ['Caio', 0])).lider).toBeNull();
  });

  it('leva a modalidade e o nome dela na tela; sem modalidade no fio é par ou ímpar', () => {
    const c = confrontoNaTela(mata(['Ana', 1], ['Beto', 0], ['Caio', 0]));
    expect(c.modalidade).toBe('mata-mata');
    expect(c.rotuloDaModalidade).toBe('Mata-mata');
    const antigo = confrontoNaTela(confronto(['Ana'], 1, ['Beto'], 0));
    expect(antigo.modalidade).toBe('par-ou-impar');
    expect(antigo.rotuloDaModalidade).toBe('Par ou ímpar');
  });
});

describe('confrontoZerado e formacaoDaPartida no mata-mata', () => {
  it('a formação de três vira "Ana 0 · Beto 0 · Caio 0", sem líder, na modalidade dada', () => {
    const c = confrontoZerado([['Ana'], ['Beto'], ['Caio']], 'mata-mata');
    expect(c.texto).toBe('Ana 0 · Beto 0 · Caio 0');
    expect(c.lider).toBeNull();
    expect(c.modalidade).toBe('mata-mata');
    expect(confrontoZerado([['Ana'], ['Beto']]).modalidade).toBe('par-ou-impar');
  });

  it('a formação da partida tem um lado por equipe, na ordem das equipes (cada um por si: 3 ou 4 lados)', () => {
    expect(formacaoDaPartida(partidaDeTeste({ config: CASA_MATA_MATA, jogadores: TRIO_POR_SI, grupos: [null, null, null] }))).toEqual([['Ana'], ['Beto'], ['Caio']]);
    expect(formacaoDaPartida(partidaDeTeste({ config: CASA_MATA_MATA, jogadores: QUARTETO_POR_SI, grupos: [null, null, null, null] }))).toEqual([['Ana'], ['Beto'], ['Caio'], ['Dani']]);
  });

  it('a roda girada não muda a ordem dos lados: cada pessoa mantém a equipe', () => {
    const girada = [TRIO_POR_SI[1]!, TRIO_POR_SI[2]!, TRIO_POR_SI[0]!];
    expect(formacaoDaPartida(partidaDeTeste({ config: CASA_MATA_MATA, jogadores: girada, grupos: [null, null, null] }))).toEqual([['Ana'], ['Beto'], ['Caio']]);
  });
});

describe('mesmaFormacao no mata-mata', () => {
  const c = mata(['Ana', 2], ['Beto', 1], ['Caio', 0]);

  it('as mesmas pessoas em qualquer ordem são o mesmo confronto', () => {
    expect(mesmaFormacao(c, [['Ana'], ['Beto'], ['Caio']], 'mata-mata')).toBe(true);
    expect(mesmaFormacao(c, [['Caio'], ['Ana'], ['Beto']], 'mata-mata')).toBe(true);
  });

  it('uma pessoa a mais, a menos ou trocada é outro confronto', () => {
    expect(mesmaFormacao(c, [['Ana'], ['Beto']], 'mata-mata')).toBe(false);
    expect(mesmaFormacao(c, [['Ana'], ['Beto'], ['Caio'], ['Dani']], 'mata-mata')).toBe(false);
    expect(mesmaFormacao(c, [['Ana'], ['Beto'], ['Dani']], 'mata-mata')).toBe(false);
  });

  it('a modalidade é parte da chave: o mesmo 1×1 de par ou ímpar e de mata-mata não se misturam', () => {
    const doMata = mata(['Ana', 1], ['Beto', 0]);
    expect(mesmaFormacao(doMata, [['Ana'], ['Beto']], 'mata-mata')).toBe(true);
    expect(mesmaFormacao(doMata, [['Ana'], ['Beto']], 'par-ou-impar')).toBe(false);
    expect(mesmaFormacao(doMata, [['Ana'], ['Beto']])).toBe(false);
    // o confronto sem modalidade no fio é de par ou ímpar
    expect(mesmaFormacao(confronto(['Ana'], 1, ['Beto'], 0), [['Ana'], ['Beto']], 'mata-mata')).toBe(false);
    expect(mesmaFormacao(confronto(['Ana'], 1, ['Beto'], 0), [['Ana'], ['Beto']], 'par-ou-impar')).toBe(true);
  });
});

describe('placarParaMostrar com a modalidade', () => {
  const doMata: PlacarSala = { atual: mata(['Ana', 2], ['Beto', 1], ['Caio', 0]), historico: [confronto(['Ana'], 3, ['Beto'], 1)] };

  it('mesma modalidade e mesmas pessoas: continua o confronto da sala', () => {
    const p = placarParaMostrar(doMata, [['Ana'], ['Beto'], ['Caio']], 'mata-mata');
    expect(p.atual?.texto).toBe('Ana 2 · Beto 1 · Caio 0');
    expect(p.novo).toBe(false);
    expect(p.historico.map((h) => h.texto)).toEqual(['Ana 3 × 1 Beto']);
  });

  it('as mesmas pessoas em outra modalidade: já mostra o confronto novo em 0, e o do mata-mata desce ao histórico', () => {
    const p = placarParaMostrar({ atual: mata(['Ana', 2], ['Beto', 1]), historico: [] }, [['Ana'], ['Beto']], 'par-ou-impar');
    expect(p.atual?.texto).toBe('Ana 0 × 0 Beto');
    expect(p.atual?.modalidade).toBe('par-ou-impar');
    expect(p.novo).toBe(true);
    expect(p.historico.map((h) => [h.texto, h.modalidade])).toEqual([['Ana 2 × 1 Beto', 'mata-mata']]);
  });

  it('sem partida contada, a formação de três já aparece em 0 · 0 · 0, na modalidade dela', () => {
    const p = placarParaMostrar({ atual: null, historico: [] }, [['Ana'], ['Beto'], ['Caio']], 'mata-mata');
    expect(p.atual?.texto).toBe('Ana 0 · Beto 0 · Caio 0');
    expect(p.atual?.rotuloDaModalidade).toBe('Mata-mata');
    expect(p.contou).toBe(false);
  });
});
