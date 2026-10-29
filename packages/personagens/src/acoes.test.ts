import { describe, expect, it } from 'vitest';
import { MisturaDeAcoes, type DefinicaoDaAcao } from './acoes';
import { sorteioDeTeste } from './para-testes';

const DEFS: DefinicaoDaAcao[] = [
  { nome: 'parado', duracaoS: 2, cicloS: null },
  { nome: 'inclinar', duracaoS: 2.8, cicloS: [0.8, 2.8] },
  { nome: 'pulinho', duracaoS: 1.2, cicloS: null },
  { nome: 'susto', duracaoS: 1, cicloS: null },
];

const soma = (m: MisturaDeAcoes): number => m.pesos.reduce((a, b) => a + b, 0);
const nova = (): MisturaDeAcoes => new MisturaDeAcoes(DEFS, 'parado');

describe('MisturaDeAcoes', () => {
  it('sem nada em curso só a base pesa, e ela dá a volta no relógio dela', () => {
    const m = nova();
    m.atualizar(1.5);
    expect(m.pesos[0]).toBe(1);
    expect(m.tempos[0]).toBeCloseTo(1.5, 9);
    m.atualizar(1);
    expect(m.tempos[0]).toBeCloseTo(0.5, 9);
    expect(m.emCurso).toBeNull();
  });

  it('a ação entra em entradaS, e os pesos somam sempre 1', () => {
    const m = nova();
    expect(m.fazer('pulinho', { entradaS: 0.2, saidaS: 0.2 })).toBe(true);
    m.atualizar(0.1);
    expect(m.pesos[2]).toBeGreaterThan(0.2);
    expect(m.pesos[2]).toBeLessThan(0.8);
    expect(soma(m)).toBeCloseTo(1, 9);
    m.atualizar(0.1);
    expect(m.pesos[2]).toBeCloseTo(1, 9);
    expect(m.emCurso).toBe('pulinho');
  });

  it('a ação que não repete sai nos últimos saidaS e some no fim', () => {
    const m = nova();
    m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.3 });
    m.atualizar(0.5);
    expect(m.pesos[2]).toBeCloseTo(1, 9);
    m.atualizar(0.55); // t = 1.05: 0,15 s antes do fim, meia saída
    expect(m.pesos[2]).toBeGreaterThan(0.2);
    expect(m.pesos[2]).toBeLessThan(0.8);
    m.atualizar(0.2);
    expect(m.pesos[2]).toBe(0);
    expect(m.emCurso).toBeNull();
    expect(m.pesos[0]).toBe(1);
  });

  it('com repetir, toca até o fim do ciclo e daí repete o trecho (de, até) enquanto o jogo pedir', () => {
    const m = nova();
    m.fazer('inclinar', { entradaS: 0.1, saidaS: 0.3, repetir: true });
    m.atualizar(2);
    expect(m.tempos[1]).toBeCloseTo(2, 9);
    m.atualizar(1); // t = 3: passou de 2,8 e voltou a 0,8 + (3 - 0,8) % 2
    expect(m.tempos[1]).toBeCloseTo(0.8 + ((3 - 0.8) % 2), 9);
    m.atualizar(10);
    expect(m.tempos[1]).toBeGreaterThanOrEqual(0.8);
    expect(m.tempos[1]).toBeLessThan(2.8);
    expect(m.pesos[1]).toBeCloseTo(1, 9);
  });

  it('soltar tira a ação em saidaS e a base volta', () => {
    const m = nova();
    m.fazer('inclinar', { entradaS: 0.1, saidaS: 0.4, repetir: true });
    m.atualizar(1);
    m.soltar('inclinar');
    m.atualizar(0.2);
    expect(m.pesos[1]).toBeGreaterThan(0.2);
    expect(m.pesos[1]).toBeLessThan(0.8);
    expect(soma(m)).toBeCloseTo(1, 9);
    m.atualizar(0.3);
    expect(m.pesos[1]).toBe(0);
    expect(m.emCurso).toBeNull();
  });

  it('uma ação nova larga as outras em crossfade (a velha sai enquanto a nova entra), sem ficar presa por baixo', () => {
    const m = nova();
    m.fazer('inclinar', { entradaS: 0.1, saidaS: 0.3, repetir: true });
    m.atualizar(1);
    m.fazer('pulinho', { entradaS: 0.2, saidaS: 0.2 });
    m.atualizar(0.1);
    expect(m.pesos[1]).toBeGreaterThan(0);
    expect(m.pesos[2]).toBeGreaterThan(0);
    expect(soma(m)).toBeCloseTo(1, 9);
    m.atualizar(0.25);
    expect(m.pesos[1]).toBe(0);
    expect(m.pesos[2]).toBeCloseTo(1, 9);
    m.atualizar(1); // o pulinho acabou: a inclinação largada NÃO volta
    expect(m.pesos[0]).toBe(1);
    expect(m.pesos[1]).toBe(0);
  });

  it('pedir a mesma ação que já toca não a reinicia', () => {
    const m = nova();
    m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.2 });
    m.atualizar(0.5);
    expect(m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.2 })).toBe(false);
    m.atualizar(0);
    expect(m.tempos[2]).toBeCloseTo(0.5, 9);
  });

  it('pedir de novo a ação que está saindo a reativa', () => {
    const m = nova();
    m.fazer('inclinar', { entradaS: 0.1, saidaS: 0.4, repetir: true });
    m.atualizar(1);
    m.soltar('inclinar');
    m.atualizar(0.1);
    expect(m.fazer('inclinar', { entradaS: 0.1, saidaS: 0.4, repetir: true })).toBe(true);
    m.atualizar(0.5);
    expect(m.pesos[1]).toBeCloseTo(1, 9);
  });

  it('entrada zero põe a ação já', () => {
    const m = nova();
    m.fazer('susto', { entradaS: 0, saidaS: 0.1 });
    m.atualizar(0);
    expect(m.pesos[3]).toBe(1);
  });

  it('soltarTudo larga tudo o que repete', () => {
    const m = nova();
    m.fazer('inclinar', { entradaS: 0, saidaS: 0.1, repetir: true });
    m.atualizar(0.5);
    m.soltarTudo();
    m.atualizar(0.2);
    expect(m.pesos[1]).toBe(0);
  });

  it('reiniciar larga tudo já e a base recomeça do zero', () => {
    const m = nova();
    m.fazer('inclinar', { entradaS: 0, saidaS: 1, repetir: true });
    m.atualizar(0.7);
    m.reiniciar();
    expect(m.emCurso).toBeNull();
    expect(m.pesos[1]).toBe(0);
    expect(m.pesos[0]).toBe(1);
    expect(m.tempos[0]).toBe(0);
    expect(m.fazer('inclinar', { entradaS: 0, saidaS: 1, repetir: true })).toBe(true);
  });

  it('o ritmo da base muda a rapidez do relógio dela (a parada que não repete igual)', () => {
    const m = nova();
    m.ritmoDaBase = 1.5;
    m.atualizar(1);
    expect(m.tempos[0]).toBeCloseTo(1.5, 9);
    m.ritmoDaBase = 0.5;
    m.atualizar(1);
    expect(m.tempos[0]).toBeCloseTo(0, 9);
    m.ritmoDaBase = -3;
    m.atualizar(0.1);
    expect(m.tempos[0]).toBeGreaterThanOrEqual(0);
  });

  it('pedir de novo uma ação que não repete e ainda está saindo continua de onde ela estava (não volta ao começo)', () => {
    const m = nova();
    m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.4 });
    m.atualizar(0.6);
    m.fazer('susto', { entradaS: 0.2, saidaS: 0.2 });
    m.atualizar(0.05);
    expect(m.pesos[2]).toBeGreaterThan(0.3);
    const antes = m.tempos[2]!;
    expect(m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.4 })).toBe(true);
    m.atualizar(0);
    expect(m.tempos[2]).toBeCloseTo(antes, 9);
  });

  it('pedir de novo uma ação quase sumida a recomeça do começo', () => {
    const m = nova();
    m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.4 });
    m.atualizar(0.6);
    m.fazer('susto', { entradaS: 0.2, saidaS: 0.2 });
    m.atualizar(0.19);
    expect(m.pesos[2]).toBeLessThan(0.1);
    m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.4 });
    m.atualizar(0);
    expect(m.tempos[2]).toBe(0);
  });

  it('nada estala: com pedidos e soltadas a esmo, o relógio de cada ação visível só anda com o tempo', () => {
    const sorteio = sorteioDeTeste(21);
    const m = nova();
    const nomes = ['inclinar', 'pulinho', 'susto'];
    const dt = 1 / 60;
    let anteriorPesos = Float64Array.from(m.pesos);
    let anteriorTempos = Float64Array.from(m.tempos);
    for (let i = 0; i < 6000; i++) {
      if (sorteio() < 0.04) {
        const nome = nomes[Math.floor(sorteio() * 3)]!;
        if (sorteio() < 0.7) m.fazer(nome, { entradaS: 0.05 + sorteio() * 0.3, saidaS: 0.1 + sorteio() * 0.4, repetir: nome === 'inclinar' && sorteio() < 0.5 });
        else m.soltar(nome);
      }
      m.atualizar(dt);
      expect(soma(m)).toBeCloseTo(1, 9);
      for (let k = 1; k < DEFS.length; k++) {
        const visivel = m.pesos[k]! > 0.02 && anteriorPesos[k]! > 0.02;
        if (!visivel) continue;
        const salto = m.tempos[k]! - anteriorTempos[k]!;
        const volta = DEFS[k]!.cicloS === null ? 0 : DEFS[k]!.cicloS![1] - DEFS[k]!.cicloS![0];
        // andou o quadro, ou deu a volta do ciclo; nunca um salto para trás no meio do corpo
        expect(Math.abs(salto - dt) < 1e-6 || (volta > 0 && Math.abs(salto - dt + volta) < 1e-6), `quadro ${i}, ${DEFS[k]!.nome}: salto ${salto}`).toBe(true);
      }
      anteriorPesos = Float64Array.from(m.pesos);
      anteriorTempos = Float64Array.from(m.tempos);
    }
  });

  it('lança com ação que não existe, e com repetir sem ciclo', () => {
    const m = nova();
    expect(() => m.fazer('voar', { entradaS: 0, saidaS: 0 })).toThrow('voar');
    expect(() => m.fazer('pulinho', { entradaS: 0, saidaS: 0, repetir: true })).toThrow('ciclo');
    expect(() => new MisturaDeAcoes(DEFS, 'nada')).toThrow('nada');
  });

  it('nada aloca depois de montada: os arrays de saída são sempre os mesmos', () => {
    const m = nova();
    const pesos = m.pesos;
    const tempos = m.tempos;
    m.fazer('pulinho', { entradaS: 0.1, saidaS: 0.1 });
    m.atualizar(0.3);
    expect(m.pesos).toBe(pesos);
    expect(m.tempos).toBe(tempos);
  });
});
