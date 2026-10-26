import { describe, expect, it } from 'vitest';
import { EMOJIS_PADRAO, LIMITES_PROTOCOLO, type EmojiSala } from '@sinuca/protocolo';
import { BaldeDeEmojis, PILHA_PADRAO, PilhaDeEmojis, emojiDaTecla, emojiDoNumero } from './emojis-modelo';

const ESCOLHIDOS: readonly EmojiSala[] = ['🐐', '👑', '🍀', '🦆', '🧂', '🐢', '🎉', '💩'];

describe('emojiDaTecla', () => {
  it('Digit1..Digit8 e Numpad1..Numpad8 mandam os oito escolhidos, na ordem', () => {
    ESCOLHIDOS.forEach((emoji, i) => {
      expect(emojiDaTecla(`Digit${i + 1}`, ESCOLHIDOS)).toBe(emoji);
      expect(emojiDaTecla(`Numpad${i + 1}`, ESCOLHIDOS)).toBe(emoji);
    });
  });

  it('com os padrões, é o que a sala sempre mandou (😂 👏 🔥 😱 😤 🤡 🍺 🎱)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => emojiDaTecla(`Digit${n}`, EMOJIS_PADRAO))).toEqual([...EMOJIS_PADRAO]);
    expect(emojiDaTecla('Digit3', EMOJIS_PADRAO)).toBe('🔥');
  });

  it('lê a escolha de agora: a mesma tecla muda de emoji quando a lista muda', () => {
    expect(emojiDaTecla('Digit3', EMOJIS_PADRAO)).toBe('🔥');
    expect(emojiDaTecla('Digit3', ['😂', '👏', '🐐', '😱', '😤', '🤡', '🍺', '🎱'])).toBe('🐐');
  });

  it('as outras teclas não mandam nada (0, 9, letras, setas, Enter), mesmo com o catálogo de 40', () => {
    for (const code of ['Digit0', 'Digit9', 'Numpad0', 'Numpad9', 'KeyB', 'KeyM', 'Enter', 'Escape', 'ArrowUp', 'NumpadEnter', 'NumpadAdd', 'Digit11', 'xDigit1', '']) {
      expect(emojiDaTecla(code, ESCOLHIDOS)).toBeNull();
    }
  });

  it('só 1 a 8 são teclas de emoji: o 9 e o 0 não mandam nada, nem com uma lista maior', () => {
    const nove: readonly EmojiSala[] = [...ESCOLHIDOS, '🎯'];
    expect(emojiDaTecla('Digit9', nove)).toBeNull();
    expect(emojiDaTecla('Numpad9', nove)).toBeNull();
    expect(emojiDaTecla('Digit0', nove)).toBeNull();
    expect(emojiDaTecla('Digit8', nove)).toBe('💩');
  });

  it('lista curta demais (estragada): a tecla sem emoji não manda nada', () => {
    expect(emojiDaTecla('Digit8', ['😂', '👏'])).toBeNull();
  });
});

describe('emojiDoNumero', () => {
  it('1 a 8 são os escolhidos; o resto não é', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => emojiDoNumero(n, ESCOLHIDOS))).toEqual([...ESCOLHIDOS]);
    for (const n of [0, 9, -1, 1.5, Number.NaN, Infinity]) expect(emojiDoNumero(n, ESCOLHIDOS)).toBeNull();
  });
});

describe('BaldeDeEmojis (o mesmo balde da sala)', () => {
  it('usa os números do protocolo: rajada de 3, 1 por segundo', () => {
    expect(LIMITES_PROTOCOLO.emojiRajada).toBe(3);
    expect(LIMITES_PROTOCOLO.emojiPorSegundo).toBe(1);
    const b = new BaldeDeEmojis();
    expect([b.tentar(0), b.tentar(0), b.tentar(0), b.tentar(0), b.tentar(0)]).toEqual([true, true, true, false, false]);
  });

  it('recarrega 1 por segundo e nunca passa da rajada', () => {
    const b = new BaldeDeEmojis();
    for (let i = 0; i < 3; i++) b.tentar(1000);
    expect(b.tentar(1500)).toBe(false);
    expect(b.tentar(2000)).toBe(true);
    expect(b.tentar(2000)).toBe(false);
    // Muito tempo parado: volta a 3, não a mais.
    expect([b.tentar(60_000), b.tentar(60_000), b.tentar(60_000), b.tentar(60_000)]).toEqual([true, true, true, false]);
  });

  it('o que foi recusado não gasta ficha nem adia a recarga', () => {
    const b = new BaldeDeEmojis();
    for (let i = 0; i < 3; i++) b.tentar(0);
    for (let t = 100; t < 1000; t += 100) expect(b.tentar(t)).toBe(false);
    expect(b.tentar(1001)).toBe(true);
  });

  it('relógio que anda para trás não recarrega', () => {
    const b = new BaldeDeEmojis();
    for (let i = 0; i < 3; i++) b.tentar(5000);
    expect(b.tentar(1000)).toBe(false);
    expect(b.tentar(5000)).toBe(false);
    expect(b.tentar(6000)).toBe(true);
  });

  it('o balde é por instância (cada sessão tem o seu)', () => {
    const a = new BaldeDeEmojis();
    const b = new BaldeDeEmojis();
    for (let i = 0; i < 3; i++) a.tentar(0);
    expect(a.tentar(0)).toBe(false);
    expect(b.tentar(0)).toBe(true);
  });

  it('aceita outra capacidade e ritmo', () => {
    const b = new BaldeDeEmojis(1, 2);
    expect(b.tentar(0)).toBe(true);
    expect(b.tentar(100)).toBe(false);
    expect(b.tentar(500)).toBe(true);
  });
});

describe('PilhaDeEmojis', () => {
  const ana = (emoji: EmojiSala = '🔥') => ({ lugar: 0, nome: 'Ana', emoji });

  it('as bolhas da pilha padrão: até 4, 3 s de vida, fade no fim', () => {
    expect(PILHA_PADRAO).toEqual({ maximo: 4, vidaMs: 3000, fadeMs: 600 });
    expect(PILHA_PADRAO.fadeMs).toBeLessThan(PILHA_PADRAO.vidaMs);
  });

  it('chegar põe uma bolha com nome, emoji, lugar e a hora, e ids que não repetem', () => {
    const p = new PilhaDeEmojis();
    const a = p.chegar(ana(), 100);
    const b = p.chegar({ lugar: null, nome: 'Zé', emoji: '🍺' }, 200);
    expect(a).toMatchObject({ lugar: 0, nome: 'Ana', emoji: '🔥', chegouEmMs: 100 });
    expect(b).toMatchObject({ lugar: null, nome: 'Zé', emoji: '🍺', chegouEmMs: 200 });
    expect(b.id).not.toBe(a.id);
    expect(p.visiveis(200).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('a mais nova fica por último (embaixo na tela)', () => {
    const p = new PilhaDeEmojis();
    for (const emoji of ['😂', '👏', '🔥'] as const) p.chegar(ana(emoji), 0);
    expect(p.visiveis(0).map((x) => x.emoji)).toEqual(['😂', '👏', '🔥']);
  });

  it('expira pelo relógio: some no instante da vida, não antes', () => {
    const p = new PilhaDeEmojis();
    p.chegar(ana(), 1000);
    expect(p.visiveis(1000 + PILHA_PADRAO.vidaMs - 1)).toHaveLength(1);
    expect(p.visiveis(1000 + PILHA_PADRAO.vidaMs)).toHaveLength(0);
  });

  it('cada bolha expira a seu tempo', () => {
    const p = new PilhaDeEmojis();
    p.chegar(ana('😂'), 0);
    p.chegar(ana('👏'), 2000);
    expect(p.visiveis(2999).map((x) => x.emoji)).toEqual(['😂', '👏']);
    expect(p.visiveis(3000).map((x) => x.emoji)).toEqual(['👏']);
    expect(p.visiveis(5000)).toEqual([]);
  });

  it('expirar tira as vencidas da memória e diz quantas saíram', () => {
    const p = new PilhaDeEmojis();
    p.chegar(ana(), 0);
    p.chegar(ana(), 1000);
    expect(p.expirar(2000)).toBe(0);
    expect(p.quantidade).toBe(2);
    expect(p.expirar(3500)).toBe(1);
    expect(p.quantidade).toBe(1);
    expect(p.expirar(4500)).toBe(1);
    expect(p.quantidade).toBe(0);
  });

  it('teto de 4: a quinta tira a mais velha', () => {
    const p = new PilhaDeEmojis();
    const emojis = ['😂', '👏', '🔥', '😱', '😤'] as const;
    emojis.forEach((emoji, i) => p.chegar(ana(emoji), i * 10));
    expect(p.quantidade).toBe(4);
    expect(p.visiveis(50).map((x) => x.emoji)).toEqual(['👏', '🔥', '😱', '😤']);
    p.chegar(ana('🤡'), 60);
    expect(p.visiveis(60).map((x) => x.emoji)).toEqual(['🔥', '😱', '😤', '🤡']);
  });

  it('o teto conta só as que ainda estão vivas', () => {
    const p = new PilhaDeEmojis();
    for (let i = 0; i < 4; i++) p.chegar(ana(), 0);
    p.chegar(ana('🎱'), 5000);
    expect(p.visiveis(5000).map((x) => x.emoji)).toEqual(['🎱']);
    expect(p.quantidade).toBe(1);
  });

  it('uma rajada nunca passa de 4 na pilha, por mais que chegue', () => {
    const p = new PilhaDeEmojis();
    for (let i = 0; i < 50; i++) p.chegar(ana(), i);
    expect(p.quantidade).toBe(4);
    expect(p.visiveis(49)).toHaveLength(4);
  });

  it('limpar esvazia a pilha', () => {
    const p = new PilhaDeEmojis();
    p.chegar(ana(), 0);
    p.limpar();
    expect(p.visiveis(0)).toEqual([]);
    expect(p.quantidade).toBe(0);
  });

  it('visiveis não muda a pilha', () => {
    const p = new PilhaDeEmojis();
    p.chegar(ana(), 0);
    p.visiveis(10_000);
    expect(p.quantidade).toBe(1);
  });

  it('aceita outras opções (teto e vida)', () => {
    const p = new PilhaDeEmojis({ maximo: 2, vidaMs: 500, fadeMs: 100 });
    for (let i = 0; i < 3; i++) p.chegar(ana(), 0);
    expect(p.quantidade).toBe(2);
    expect(p.visiveis(499)).toHaveLength(2);
    expect(p.visiveis(500)).toHaveLength(0);
  });
});
