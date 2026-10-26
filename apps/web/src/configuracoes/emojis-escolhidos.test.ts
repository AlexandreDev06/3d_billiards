import { describe, expect, it } from 'vitest';
import { EMOJIS_DA_SALA, EMOJIS_PADRAO, type EmojiSala } from '@sinuca/protocolo';
import type { ArmazenamentoMinimo } from '../armazenamento';
import {
  CHAVE_DOS_EMOJIS,
  EmojisEscolhidos,
  QUANTOS_EMOJIS,
  ehEmojiDaSala,
  ehSlotDeEmoji,
  escolhaValida,
  sanearEmojis,
  trocarEmoji,
} from './emojis-escolhidos';

function memoria(inicial: Record<string, string> = {}): ArmazenamentoMinimo & { dados: Map<string, string> } {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (c) => dados.get(c) ?? null,
    setItem: (c, v) => void dados.set(c, v),
    removeItem: (c) => void dados.delete(c),
  };
}

const guardado = (emojis: unknown, versao: unknown = 1): string => JSON.stringify({ versao, emojis });
const PADRAO = [...EMOJIS_PADRAO];
const FORA = EMOJIS_DA_SALA.slice(8);
const OUTROS: readonly EmojiSala[] = ['🐐', '👑', '🍀', '🦆', '🧂', '🐢', '🎉', '💩'];

describe('o catálogo e o padrão do protocolo, que o modelo supõe', () => {
  it('são 8 teclas, o padrão é feito dos 8 primeiros do catálogo e o catálogo tem emojis de sobra', () => {
    expect(QUANTOS_EMOJIS).toBe(8);
    expect(PADRAO).toEqual(EMOJIS_DA_SALA.slice(0, 8));
    expect(EMOJIS_DA_SALA.length).toBeGreaterThan(QUANTOS_EMOJIS);
    expect(new Set(EMOJIS_DA_SALA).size).toBe(EMOJIS_DA_SALA.length);
  });
});

describe('ehEmojiDaSala / ehSlotDeEmoji', () => {
  it('todo o catálogo vale; texto qualquer, vazio, número e emoji de fora não', () => {
    for (const e of EMOJIS_DA_SALA) expect(ehEmojiDaSala(e)).toBe(true);
    for (const e of ['', 'A', '🔥🔥', '🔥 ', 'fire', '\u{1F9D9}', 3, null, undefined, {}, ['🔥']]) expect(ehEmojiDaSala(e)).toBe(false);
  });

  it('o slot é um inteiro de 1 a 8', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) expect(ehSlotDeEmoji(n)).toBe(true);
    for (const n of [0, 9, -1, 1.5, Number.NaN, Infinity, '3', null, undefined]) expect(ehSlotDeEmoji(n)).toBe(false);
  });
});

describe('escolhaValida / sanearEmojis', () => {
  it('8 do catálogo, sem repetir, em qualquer ordem, valem', () => {
    expect(escolhaValida(OUTROS)).toBe(true);
    expect(escolhaValida([...PADRAO].reverse())).toBe(true);
    expect(sanearEmojis(OUTROS)).toEqual(OUTROS);
  });

  it('tamanho errado, repetido, fora do catálogo ou de outro tipo: padrão', () => {
    const casos: unknown[] = [
      [],
      PADRAO.slice(0, 7),
      [...PADRAO, FORA[0]],
      [...PADRAO.slice(0, 7), PADRAO[0]],
      [...PADRAO.slice(0, 7), 'A'],
      [...PADRAO.slice(0, 7), ''],
      [...PADRAO.slice(0, 7), 7],
      [...PADRAO.slice(0, 7), null],
      [...PADRAO.slice(0, 7), '🔥🔥'],
      'ABCDEFGH',
      PADRAO.join(''),
      { 0: '😂' },
      null,
      undefined,
      42,
    ];
    for (const caso of casos) {
      expect(escolhaValida(caso)).toBe(false);
      expect(sanearEmojis(caso)).toEqual(PADRAO);
    }
  });

  it('o que devolve é uma cópia: mexer nela não muda o que se passou', () => {
    const entrada = [...OUTROS];
    const saida = sanearEmojis(entrada) as EmojiSala[];
    saida[0] = '😂';
    expect(entrada[0]).toBe('🐐');
  });
});

describe('trocarEmoji', () => {
  it('um emoji que ainda não está na lista toma o lugar do slot', () => {
    const novo = trocarEmoji(PADRAO, 3, '🐐');
    expect(novo).toEqual(['😂', '👏', '🐐', '😱', '😤', '🤡', '🍺', '🎱']);
    expect(PADRAO[2]).toBe('🔥');
  });

  it('um emoji que já está em outro slot troca os dois de lugar, sem repetir', () => {
    // O 🎱 está no slot 8: pô-lo no 3 manda o 🔥 para o 8.
    expect(trocarEmoji(PADRAO, 3, '🎱')).toEqual(['😂', '👏', '🎱', '😱', '😤', '🤡', '🍺', '🔥']);
    expect(trocarEmoji(PADRAO, 1, '👏')).toEqual(['👏', '😂', '🔥', '😱', '😤', '🤡', '🍺', '🎱']);
  });

  it('o emoji que já está naquele slot não muda nada (null)', () => {
    expect(trocarEmoji(PADRAO, 3, '🔥')).toBeNull();
  });

  it('slot fora de 1 a 8 ou emoji fora do catálogo é pedido inválido (null)', () => {
    for (const slot of [0, 9, -1, 2.5, Number.NaN, '3', null]) expect(trocarEmoji(PADRAO, slot, '🐐')).toBeNull();
    for (const emoji of ['A', '', 5, null, '🔥🔥']) expect(trocarEmoji(PADRAO, 3, emoji)).toBeNull();
  });

  it('o resultado nunca tem repetido nem tira nada do catálogo, em todas as combinações', () => {
    for (let slot = 1; slot <= QUANTOS_EMOJIS; slot++) {
      for (const emoji of EMOJIS_DA_SALA) {
        const novo = trocarEmoji(OUTROS, slot, emoji);
        if (novo === null) {
          expect(OUTROS[slot - 1]).toBe(emoji);
          continue;
        }
        expect(novo[slot - 1]).toBe(emoji);
        expect(escolhaValida(novo)).toBe(true);
      }
    }
  });
});

describe('EmojisEscolhidos: o que vale ao abrir', () => {
  it('sem nada guardado, os padrões', () => {
    const e = new EmojisEscolhidos(memoria());
    expect(e.emojis).toEqual(PADRAO);
    expect(e.padrao).toBe(true);
  });

  it('sem armazenamento (bloqueado), os padrões, e escolher vale até fechar a página', () => {
    const e = new EmojisEscolhidos(null);
    expect(e.emojis).toEqual(PADRAO);
    expect(e.escolher(3, '🐐')).toBe(true);
    expect(e.doSlot(3)).toBe('🐐');
  });

  it('a escolha guardada volta como estava', () => {
    const e = new EmojisEscolhidos(memoria({ [CHAVE_DOS_EMOJIS]: guardado(OUTROS) }));
    expect(e.emojis).toEqual(OUTROS);
    expect(e.padrao).toBe(false);
  });

  it('guardado estragado, de outra versão, repetido, fora do catálogo ou do tamanho errado: padrão, sem lançar', () => {
    const estragados: string[] = [
      '{não é json',
      '',
      'null',
      '42',
      '"😂"',
      JSON.stringify(OUTROS),
      guardado(OUTROS, 0),
      guardado(OUTROS, 2),
      guardado(OUTROS, '1'),
      guardado(OUTROS.slice(0, 7)),
      guardado([...OUTROS, '😂']),
      guardado([...OUTROS.slice(0, 7), OUTROS[0]]),
      guardado([...OUTROS.slice(0, 7), 'A']),
      guardado([...OUTROS.slice(0, 7), 9]),
      guardado('🐐👑🍀🦆🧂🐢🎉💩'),
      guardado(null),
      JSON.stringify({ versao: 1 }),
    ];
    for (const texto of estragados) {
      const e = new EmojisEscolhidos(memoria({ [CHAVE_DOS_EMOJIS]: texto }));
      expect(e.emojis, texto).toEqual(PADRAO);
      expect(e.padrao).toBe(true);
    }
  });

  it('armazenamento que lança ao ler ou ao gravar não derruba nada', () => {
    const ruim: ArmazenamentoMinimo = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cheio');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    const e = new EmojisEscolhidos(ruim);
    expect(e.emojis).toEqual(PADRAO);
    expect(e.escolher(1, '🐐')).toBe(true);
    expect(e.doSlot(1)).toBe('🐐');
    expect(() => e.restaurar()).not.toThrow();
    expect(e.padrao).toBe(true);
  });
});

describe('EmojisEscolhidos: escolher', () => {
  it('trocar o slot 3 por 🐐 grava neste aparelho com versão e vale na hora', () => {
    const arm = memoria();
    const e = new EmojisEscolhidos(arm);
    expect(e.escolher(3, '🐐')).toBe(true);
    expect(e.emojis).toEqual(['😂', '👏', '🐐', '😱', '😤', '🤡', '🍺', '🎱']);
    expect(e.doSlot(3)).toBe('🐐');
    expect(JSON.parse(arm.dados.get(CHAVE_DOS_EMOJIS)!)).toEqual({ versao: 1, emojis: e.emojis });
    // Outra página aberta depois lê o mesmo.
    expect(new EmojisEscolhidos(arm).emojis).toEqual(e.emojis);
  });

  it('um emoji que já está em outro slot troca os dois de lugar', () => {
    const e = new EmojisEscolhidos(memoria());
    expect(e.escolher(1, '🎱')).toBe(true);
    expect(e.emojis).toEqual(['🎱', '👏', '🔥', '😱', '😤', '🤡', '🍺', '😂']);
    expect(e.slotDe('😂')).toBe(8);
    expect(e.slotDe('🎱')).toBe(1);
  });

  it('o mesmo emoji no mesmo slot, o slot fora de 1 a 8 e o emoji fora do catálogo não mudam nem avisam nem gravam', () => {
    const arm = memoria();
    const e = new EmojisEscolhidos(arm);
    let avisos = 0;
    e.aoMudar(() => avisos++);
    expect(e.escolher(3, '🔥')).toBe(false);
    expect(e.escolher(0, '🐐')).toBe(false);
    expect(e.escolher(9, '🐐')).toBe(false);
    expect(e.escolher(3, 'A')).toBe(false);
    expect(e.escolher(3, '')).toBe(false);
    expect(e.escolher(3, undefined)).toBe(false);
    expect(avisos).toBe(0);
    expect(arm.dados.size).toBe(0);
    expect(e.emojis).toEqual(PADRAO);
  });

  it('a lista só troca de objeto quando muda (quem compara por referência pode confiar)', () => {
    const e = new EmojisEscolhidos(memoria());
    const antes = e.emojis;
    e.escolher(3, '🔥');
    expect(e.emojis).toBe(antes);
    e.escolher(3, '🐐');
    expect(e.emojis).not.toBe(antes);
    expect(antes).toEqual(PADRAO);
  });

  it('voltar a escolha ao padrão à mão apaga o que estava guardado (segue o padrão do jogo)', () => {
    const arm = memoria();
    const e = new EmojisEscolhidos(arm);
    e.escolher(3, '🐐');
    expect(arm.dados.has(CHAVE_DOS_EMOJIS)).toBe(true);
    e.escolher(3, '🔥');
    expect(e.padrao).toBe(true);
    expect(arm.dados.has(CHAVE_DOS_EMOJIS)).toBe(false);
  });

  it('muitas escolhas seguidas nunca deixam repetido na lista', () => {
    const e = new EmojisEscolhidos(memoria());
    let semente = 7;
    const sorteio = (n: number): number => {
      semente = (semente * 48271) % 2147483647;
      return semente % n;
    };
    for (let i = 0; i < 400; i++) {
      e.escolher(1 + sorteio(8), EMOJIS_DA_SALA[sorteio(EMOJIS_DA_SALA.length)]);
      expect(escolhaValida(e.emojis)).toBe(true);
    }
  });
});

describe('EmojisEscolhidos: restaurar, ouvir, consultar', () => {
  it('restaurar volta os oito padrões, apaga o guardado e avisa', () => {
    const arm = memoria();
    const e = new EmojisEscolhidos(arm);
    for (let i = 1; i <= 8; i++) e.escolher(i, OUTROS[i - 1]);
    expect(e.padrao).toBe(false);
    let avisos = 0;
    e.aoMudar(() => avisos++);
    e.restaurar();
    expect(e.emojis).toEqual(PADRAO);
    expect(e.padrao).toBe(true);
    expect(arm.dados.has(CHAVE_DOS_EMOJIS)).toBe(false);
    expect(avisos).toBe(1);
  });

  it('restaurar no padrão não avisa nem grava', () => {
    const arm = memoria();
    const e = new EmojisEscolhidos(arm);
    let avisos = 0;
    e.aoMudar(() => avisos++);
    e.restaurar();
    expect(avisos).toBe(0);
    expect(arm.dados.size).toBe(0);
  });

  it('cada escolha avisa uma vez; quem para de ouvir não recebe mais', () => {
    const e = new EmojisEscolhidos(memoria());
    const vistos: string[] = [];
    const parar = e.aoMudar(() => vistos.push(e.emojis.join('')));
    e.escolher(3, '🐐');
    e.escolher(4, '👑');
    parar();
    e.escolher(5, '🍀');
    expect(vistos).toEqual(['😂👏🐐😱😤🤡🍺🎱', '😂👏🐐👑😤🤡🍺🎱']);
  });

  it('o ouvinte já enxerga o valor novo e pode se desligar sem estragar a rodada', () => {
    const e = new EmojisEscolhidos(memoria());
    const chamados: string[] = [];
    const parar = e.aoMudar(() => {
      chamados.push('a');
      parar();
    });
    e.aoMudar(() => chamados.push('b'));
    e.escolher(1, '🐐');
    e.escolher(2, '👑');
    expect(chamados).toEqual(['a', 'b', 'b']);
  });

  it('um ouvinte que desliga outro no meio da rodada não faz o outro perder esta rodada', () => {
    const e = new EmojisEscolhidos(memoria());
    const chamados: string[] = [];
    let pararB = (): void => undefined;
    e.aoMudar(() => {
      chamados.push('a');
      pararB();
    });
    pararB = e.aoMudar(() => chamados.push('b'));
    e.escolher(1, '🐐');
    e.escolher(2, '👑');
    // Na primeira rodada o `b` ainda é chamado (a lista foi copiada antes); na segunda já não existe.
    expect(chamados).toEqual(['a', 'b', 'a']);
  });

  it('slotDe e doSlot respondem null para o que não existe', () => {
    const e = new EmojisEscolhidos(memoria());
    expect(e.slotDe('🐐')).toBeNull();
    expect(e.slotDe('A')).toBeNull();
    expect(e.slotDe(undefined)).toBeNull();
    expect(e.doSlot(0)).toBeNull();
    expect(e.doSlot(9)).toBeNull();
    expect(e.doSlot(1.5)).toBeNull();
    expect(e.doSlot(1)).toBe('😂');
    expect(e.slotDe('🎱')).toBe(8);
  });
});
