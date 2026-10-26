import { describe, expect, it } from 'vitest';
import { BaldeDeTokens, BaldesPorChave } from './limite-taxa';

describe('BaldeDeTokens', () => {
  it('deixa passar até a capacidade de uma vez e recusa o excesso', () => {
    const b = new BaldeDeTokens(3, 1, () => 0);
    expect([b.tentar(), b.tentar(), b.tentar(), b.tentar()]).toEqual([true, true, true, false]);
  });

  it('recarrega com o tempo, sem passar da capacidade', () => {
    let agora = 0;
    const b = new BaldeDeTokens(3, 2, () => agora);
    for (let i = 0; i < 3; i++) b.tentar();
    agora = 500;
    expect(b.tentar()).toBe(true);
    expect(b.tentar()).toBe(false);
    agora = 60_000;
    expect([b.tentar(), b.tentar(), b.tentar(), b.tentar()]).toEqual([true, true, true, false]);
  });

  it('o custo pode ser maior que 1', () => {
    const b = new BaldeDeTokens(5, 1, () => 0);
    expect(b.tentar(3)).toBe(true);
    expect(b.tentar(3)).toBe(false);
    expect(b.tentar(2)).toBe(true);
  });

  it('relógio que anda para trás não cria tokens', () => {
    let agora = 1000;
    const b = new BaldeDeTokens(1, 1, () => agora);
    expect(b.tentar()).toBe(true);
    agora = 0;
    expect(b.tentar()).toBe(false);
  });
});

describe('BaldesPorChave', () => {
  it('cada chave tem o seu balde', () => {
    const b = new BaldesPorChave(2, 1, () => 0);
    expect([b.tentar('a'), b.tentar('a'), b.tentar('a'), b.tentar('b')]).toEqual([true, true, false, true]);
  });

  it('o custo e o tempo valem por chave', () => {
    let agora = 0;
    const b = new BaldesPorChave(10, 1, () => agora);
    expect(b.tentar('a', 10)).toBe(true);
    expect(b.tentar('a', 5)).toBe(false);
    agora = 5000;
    expect(b.tentar('a', 5)).toBe(true);
  });

  it('limpar esquece as chaves já recarregadas (a memória não cresce com cada IP que passou)', () => {
    let agora = 0;
    const b = new BaldesPorChave(3, 1, () => agora);
    b.tentar('a');
    b.tentar('b', 3);
    expect(b.tamanho).toBe(2);
    b.limpar();
    expect(b.tamanho).toBe(2);
    agora = 10_000;
    b.limpar();
    expect(b.tamanho).toBe(0);
    expect(b.tentar('a', 3)).toBe(true);
  });
});
