import { describe, expect, it } from 'vitest';
import { MisturaDePoses } from './mistura';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from './alocacao-para-testes';

const soma = (m: MisturaDePoses): number => m.pesos.reduce((a, b) => a + b, 0);

describe('MisturaDePoses', () => {
  it('começa inteira na pose inicial e lança para nome desconhecido', () => {
    const m = new MisturaDePoses(['a', 'b', 'c'], 'b');
    expect(Array.from(m.pesos)).toEqual([0, 1, 0]);
    expect(m.atual).toBe('b');
    expect(() => m.ir('x', 0.1)).toThrow(/x/);
  });

  it('a troca de pose é suave, monótona e os pesos somam 1 o tempo todo', () => {
    const m = new MisturaDePoses(['a', 'b', 'c'], 'a');
    m.ir('c', 0.4);
    let anterior = 0;
    for (let i = 0; i < 12; i++) {
      m.atualizar(0.05);
      expect(soma(m)).toBeCloseTo(1, 9);
      expect(m.pesos[2]!).toBeGreaterThanOrEqual(anterior);
      anterior = m.pesos[2]!;
    }
    expect(Array.from(m.pesos)).toEqual([0, 0, 1]);
    expect(m.atual).toBe('c');
  });

  it('trocar no meio da troca sai dos pesos de agora, sem pulo', () => {
    const m = new MisturaDePoses(['a', 'b', 'c'], 'a');
    m.ir('b', 1);
    m.atualizar(0.5);
    const meio = Array.from(m.pesos);
    m.ir('c', 1);
    expect(Array.from(m.pesos)).toEqual(meio);
    m.atualizar(1);
    expect(Array.from(m.pesos)).toEqual([0, 0, 1]);
  });

  it('duração zero troca já', () => {
    const m = new MisturaDePoses(['a', 'b'], 'a');
    m.ir('b', 0);
    expect(Array.from(m.pesos)).toEqual([0, 1]);
  });

  it('misturar põe 1-t e t nas duas poses (e t fora de 0..1 é limitado)', () => {
    const m = new MisturaDePoses(['a', 'b', 'c'], 'a');
    m.misturar('a', 'b', 0.25);
    expect(Array.from(m.pesos)).toEqual([0.75, 0.25, 0]);
    m.misturar('c', 'c', 3);
    expect(soma(m)).toBeCloseTo(1, 9);
    m.misturar('a', 'b', -2);
    expect(Array.from(m.pesos)).toEqual([1, 0, 0]);
  });

  it('o gesto entra, fica no máximo e sai; ao fim se larga sozinho', () => {
    const m = new MisturaDePoses(['a'], 'a');
    m.fazerGesto('joinha', 1, 0.2, 0.3);
    expect(m.gesto).toBe('joinha');
    expect(m.pesoDoGesto).toBe(0);
    m.atualizar(0.1);
    expect(m.pesoDoGesto).toBeGreaterThan(0);
    expect(m.pesoDoGesto).toBeLessThan(1);
    m.atualizar(0.3);
    expect(m.pesoDoGesto).toBe(1);
    m.atualizar(0.45);
    expect(m.pesoDoGesto).toBeLessThan(1);
    expect(m.pesoDoGesto).toBeGreaterThan(0);
    m.atualizar(0.2);
    expect(m.gesto).toBeNull();
    expect(m.pesoDoGesto).toBe(0);
  });

  it('gesto sem entrada começa com peso 1; cancelar larga já', () => {
    const m = new MisturaDePoses(['a'], 'a');
    m.fazerGesto('g', 1, 0, 0);
    expect(m.pesoDoGesto).toBe(1);
    m.cancelarGesto();
    expect(m.gesto).toBeNull();
    expect(m.pesoDoGesto).toBe(0);
  });

  it('sobrepor mistura uma pose por cima da base, sem desfazer a troca em curso (a pinça sobre a ponte)', () => {
    const m = new MisturaDePoses(['a', 'b', 'c'], 'a');
    m.ir('b', 1);
    m.atualizar(0.5);
    const base = Array.from(m.pesos);
    m.sobrepor('c', 0.4);
    expect(soma(m)).toBeCloseTo(1, 9);
    expect(m.pesos[2]!).toBeCloseTo(0.4, 9);
    expect(m.pesos[0]!).toBeCloseTo(base[0]! * 0.6, 9);
    expect(m.pesos[1]!).toBeCloseTo(base[1]! * 0.6, 9);
    m.atualizar(0.5);
    expect(soma(m)).toBeCloseTo(1, 9);
    expect(m.pesos[1]!).toBeCloseTo(0.6, 9);
    expect(m.pesos[0]!).toBeCloseTo(0, 9);
    m.sobrepor('c', 0);
    m.atualizar(0);
    expect(Array.from(m.pesos)).toEqual([0, 1, 0]);
  });

  it('sobrepor limita t a 0..1 e lança para pose desconhecida', () => {
    const m = new MisturaDePoses(['a', 'b'], 'a');
    m.sobrepor('b', 7);
    expect(Array.from(m.pesos)).toEqual([0, 1]);
    m.sobrepor('b', -1);
    expect(Array.from(m.pesos)).toEqual([1, 0]);
    expect(() => m.sobrepor('x', 0.5)).toThrow(/x/);
  });

  it('um gesto em ciclo repete o trecho enquanto ninguém o solta, e ao soltar sai em saidaS', () => {
    const m = new MisturaDePoses(['a'], 'a');
    m.fazerGesto('tamborilar', 0.8, 0.1, 0.2, { cicloS: [0, 0.8] });
    m.atualizar(0.5);
    expect(m.tempoNaAcao).toBeCloseTo(0.5, 9);
    m.atualizar(0.5);
    expect(m.tempoNaAcao).toBeCloseTo(0.2, 9);
    for (let i = 0; i < 100; i++) m.atualizar(0.1);
    expect(m.gesto).toBe('tamborilar');
    expect(m.pesoDoGesto).toBe(1);
    expect(m.tempoNaAcao).toBeGreaterThanOrEqual(0);
    expect(m.tempoNaAcao).toBeLessThan(0.8);
    m.soltarGesto();
    m.atualizar(0.1);
    expect(m.pesoDoGesto).toBeLessThan(1);
    expect(m.pesoDoGesto).toBeGreaterThan(0);
    m.atualizar(0.2);
    expect(m.gesto).toBeNull();
    expect(m.pesoDoGesto).toBe(0);
  });

  it('o ciclo que não começa em 0 toca o começo uma vez e só depois repete [de, até] (as palmas)', () => {
    const m = new MisturaDePoses(['a'], 'a');
    m.fazerGesto('palmas', 1.2, 0, 0.2, { cicloS: [0.2, 0.4] });
    m.atualizar(0.3);
    expect(m.tempoNaAcao).toBeCloseTo(0.3, 9);
    m.atualizar(0.2);
    expect(m.tempoNaAcao).toBeCloseTo(0.3, 9);
    m.atualizar(0.5);
    expect(m.tempoNaAcao).toBeGreaterThanOrEqual(0.2);
    expect(m.tempoNaAcao).toBeLessThan(0.4);
  });

  it('um gesto que se segura fica no último quadro com peso 1 até soltar (o mole pendurado)', () => {
    const m = new MisturaDePoses(['a'], 'a');
    m.fazerGesto('mole', 1.4, 0.1, 0.3, { segurar: true });
    m.atualizar(1.4);
    expect(m.gesto).toBe('mole');
    m.atualizar(5);
    expect(m.gesto).toBe('mole');
    expect(m.pesoDoGesto).toBe(1);
    expect(m.tempoNaAcao).toBeCloseTo(1.4, 9);
    m.soltarGesto(0.3);
    m.atualizar(0.15);
    expect(m.pesoDoGesto).toBeGreaterThan(0);
    expect(m.pesoDoGesto).toBeLessThan(1);
    m.atualizar(0.2);
    expect(m.gesto).toBeNull();
  });

  it('soltar sem gesto não faz nada, e soltar com saída 0 larga já', () => {
    const m = new MisturaDePoses(['a'], 'a');
    m.soltarGesto();
    expect(m.gesto).toBeNull();
    m.fazerGesto('g', 1, 0, 0, { cicloS: [0, 1] });
    m.soltarGesto(0);
    expect(m.gesto).toBeNull();
  });

  it('um gesto comum continua acabando sozinho e tempoNaAcao segue o tempo até a duração', () => {
    const m = new MisturaDePoses(['a'], 'a');
    m.fazerGesto('g', 1, 0.2, 0.3);
    m.atualizar(0.6);
    expect(m.tempoNaAcao).toBeCloseTo(0.6, 9);
    m.atualizar(0.5);
    expect(m.gesto).toBeNull();
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const m = new MisturaDePoses(['a', 'b', 'c'], 'a');
    m.ir('b', 0.2);
    m.atualizar(0.01);
    await provarSemAlocar((i) => {
      if (i % 50 === 0) {
        m.ir(i % 100 === 0 ? 'b' : 'c', 0.2);
        m.fazerGesto('g', 0.5, 0.1, 0.1);
      }
      m.misturar('a', 'b', (i % 10) / 10);
      m.atualizar(0.016);
    });
  }, TEMPO_DO_PERFILADOR_MS);
});
