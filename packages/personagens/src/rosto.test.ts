import { describe, expect, it } from 'vitest';
import { MisturaDeCaras, Piscador } from './rosto';

const CARAS = ['cara_neutro', 'cara_sorriso', 'cara_susto'] as const;

describe('MisturaDeCaras', () => {
  it('começa toda na cara inicial', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_sorriso');
    expect([...m.pesos]).toEqual([0, 1, 0]);
    expect(m.atual).toBe('cara_sorriso');
  });

  it('troca de cara aos poucos: no meio da troca as duas pesam, e no fim só a nova', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    m.ir('cara_susto');
    m.atualizar(0.1);
    expect(m.pesos[0]).toBeGreaterThan(0.2);
    expect(m.pesos[0]).toBeLessThan(0.8);
    expect(m.pesos[2]).toBeGreaterThan(0.2);
    expect(m.pesos[2]).toBeLessThan(0.8);
    m.atualizar(0.2);
    expect([...m.pesos]).toEqual([0, 0, 1]);
    expect(m.atual).toBe('cara_susto');
  });

  it('depois de chegar, a cara fica: quadro após quadro o peso continua 1', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    m.ir('cara_sorriso');
    for (let i = 0; i < 40; i++) {
      m.atualizar(1 / 30);
      if (i > 10) expect(m.pesos[1]).toBe(1);
    }
    expect(m.pesos[0]).toBe(0);
  });

  it('trocar no meio da troca parte do que já estava (sem salto)', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    m.ir('cara_susto');
    m.atualizar(0.1);
    const susto = m.pesos[2]!;
    m.ir('cara_sorriso');
    m.atualizar(0);
    expect(m.pesos[2]).toBeCloseTo(susto, 9);
  });

  it('o piscar multiplica a cara por 1 - piscar', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_sorriso');
    m.definirPiscar(0.25);
    expect(m.pesos[1]).toBeCloseTo(0.75, 9);
    m.definirPiscar(1);
    expect(m.pesos[1]).toBe(0);
    expect(m.piscar).toBe(1);
  });

  it('tempo de troca zero troca já', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0);
    m.ir('cara_susto');
    expect([...m.pesos]).toEqual([0, 0, 1]);
  });

  it('lança com cara que não existe', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro');
    expect(() => m.ir('cara_bravo')).toThrow('cara_bravo');
    expect(() => new MisturaDeCaras(CARAS, 'x')).toThrow('x');
  });
});

describe('Piscador', () => {
  const sequencia = (valores: number[]) => {
    let i = 0;
    return () => valores[i++ % valores.length]!;
  };

  it('só pisca depois do intervalo sorteado (do RNG injetado, nunca de Math.random)', () => {
    const p = new Piscador(sequencia([0]), { minS: 2, maxS: 6, duracaoS: 0.2 });
    p.atualizar(1.9);
    expect(p.valor).toBe(0);
    p.atualizar(0.1);
    p.atualizar(0.1);
    expect(p.valor).toBeCloseTo(1, 6); // meio da piscada = olho fechado
  });

  it('fecha e abre: sobe até 1 no meio da duração e volta a 0 no fim', () => {
    const p = new Piscador(sequencia([0]), { minS: 1, maxS: 2, duracaoS: 0.2 });
    p.atualizar(1);
    const subindo: number[] = [];
    for (let i = 0; i < 4; i++) {
      p.atualizar(0.05);
      subindo.push(p.valor);
    }
    expect(subindo[1]).toBeGreaterThan(subindo[0]!);
    expect(Math.max(...subindo)).toBeCloseTo(1, 6);
    p.atualizar(0.1);
    expect(p.valor).toBe(0);
  });

  it('o sorteio maior espera mais para a próxima piscada', () => {
    const curto = new Piscador(sequencia([0]), { minS: 1, maxS: 5, duracaoS: 0.2 });
    const longo = new Piscador(sequencia([1]), { minS: 1, maxS: 5, duracaoS: 0.2 });
    curto.atualizar(1.1);
    longo.atualizar(1.1);
    expect(curto.valor).toBeGreaterThan(0);
    expect(longo.valor).toBe(0);
  });

  it('piscarJa começa uma piscada agora e o intervalo recomeça depois dela', () => {
    const p = new Piscador(sequencia([0]), { minS: 3, maxS: 3, duracaoS: 0.2 });
    p.piscarJa();
    p.atualizar(0.1);
    expect(p.valor).toBeCloseTo(1, 6);
    p.atualizar(0.1);
    expect(p.valor).toBe(0);
    p.atualizar(2.8);
    expect(p.valor).toBe(0);
  });

  it('um quadro enorme não fica preso: termina a piscada e segue', () => {
    const p = new Piscador(sequencia([0]), { minS: 1, maxS: 1, duracaoS: 0.2 });
    p.atualizar(50);
    expect(p.valor).toBeGreaterThanOrEqual(0);
    expect(p.valor).toBeLessThanOrEqual(1);
  });
});
