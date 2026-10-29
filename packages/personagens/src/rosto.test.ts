import { describe, expect, it } from 'vitest';
import { sorteioDeTeste } from './para-testes';
import { MisturaDeCaras, PalpebrasDoOlhar, Piscadinha, Piscador } from './rosto';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from './alocacao-para-testes';

const CARAS = ['cara_neutro', 'cara_sorriso', 'cara_susto'] as const;
const graus = (g: number): number => (g * Math.PI) / 180;

describe('MisturaDeCaras', () => {
  it('começa toda na cara inicial', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_sorriso');
    expect([...m.pesos]).toEqual([0, 1, 0]);
    expect(m.atual).toBe('cara_sorriso');
  });

  it('troca de cara aos poucos: no meio da troca as duas pesam, e depois só a nova', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    m.ir('cara_susto');
    m.atualizar(0.1);
    expect(m.pesos[0]).toBeGreaterThan(0.1);
    expect(m.pesos[0]).toBeLessThan(0.6);
    expect(m.pesos[2]).toBeGreaterThan(0.5);
    for (let i = 0; i < 90; i++) m.atualizar(1 / 60);
    expect([...m.pesos]).toEqual([0, 0, 1]);
    expect(m.atual).toBe('cara_susto');
  });

  it('a cara nova chega ao alvo em tempoDeTroca, passa um pouco e assenta (mola, não rampa)', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2, 0.6);
    m.ir('cara_sorriso');
    let maximo = 0;
    let quandoPassouDe1 = -1;
    for (let i = 1; i <= 240; i++) {
      m.atualizar(1 / 240);
      maximo = Math.max(maximo, m.pesos[1]!);
      if (quandoPassouDe1 < 0 && m.pesos[1]! >= 1) quandoPassouDe1 = i / 240;
    }
    expect(maximo).toBeGreaterThan(1.03);
    expect(maximo).toBeLessThan(1.2);
    // o pico do primeiro vai-e-volta acontece em torno do tempo de troca
    expect(quandoPassouDe1).toBeGreaterThan(0.1);
    expect(quandoPassouDe1).toBeLessThan(0.2);
    expect(m.pesos[1]).toBe(1);
  });

  it('as caras que saem nunca ficam negativas e a que entra nunca passa de 1,2', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.15);
    const nomes = [...CARAS];
    for (let i = 0; i < 600; i++) {
      if (i % 40 === 0) m.ir(nomes[(i / 40) % 3]!);
      m.atualizar(1 / 60);
      for (const w of m.pesos) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it('depois de chegar, a cara fica: quadro após quadro o peso continua exatamente 1', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    m.ir('cara_sorriso');
    for (let i = 0; i < 80; i++) {
      m.atualizar(1 / 30);
      if (i > 25) expect(m.pesos[1]).toBe(1);
    }
    expect(m.pesos[0]).toBe(0);
  });

  it('trocar no meio da troca parte do que já estava (sem salto, nem no peso nem na velocidade)', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    m.ir('cara_susto');
    m.atualizar(0.05);
    const susto = m.pesos[2]!;
    m.ir('cara_sorriso');
    m.atualizar(0);
    expect(m.pesos[2]).toBeCloseTo(susto, 9);
    const passo = (): number => {
      const antes = m.pesos[2]!;
      m.atualizar(1 / 240);
      return m.pesos[2]! - antes;
    };
    expect(Math.abs(passo())).toBeLessThan(0.1);
  });

  it('quadro enorme ou zero não deixa a mola em NaN', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.15);
    m.ir('cara_susto');
    m.atualizar(0);
    m.atualizar(120);
    expect([...m.pesos]).toEqual([0, 0, 1]);
  });

  it('o piscar multiplica a cara por 1 - piscar', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_sorriso');
    m.definirPiscar(0.25);
    expect(m.pesos[1]).toBeCloseTo(0.75, 9);
    m.definirPiscar(1);
    expect(m.pesos[1]).toBe(0);
    expect(m.piscar).toBe(1);
  });

  it('a abertura da cara: a mistura do quanto cada cara deixa o olho aberto (a de olho fechado vale 0)', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    const abertura = Float64Array.of(1, 0.5, 0);
    expect(m.abertura(abertura)).toBe(1);
    m.forcar('cara_sorriso');
    expect(m.abertura(abertura)).toBe(0.5);
    m.ir('cara_susto');
    m.atualizar(0.05);
    const meio = m.abertura(abertura);
    expect(meio).toBeLessThan(0.5);
    expect(meio).toBeGreaterThan(0);
    // o piscar não mexe: é a cara, não o olho fechado, que diz a abertura
    m.forcar('cara_neutro');
    m.definirPiscar(1);
    expect(m.abertura(abertura)).toBe(1);
  });

  it('a piscadinha encolhe a cara pelo peso que a meta dá a ela, sem tirar a cara que não mexe nas pálpebras', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_sorriso', 0.2);
    m.definirPesosNaPiscadinha(Float64Array.of(1, 0.15, 0));
    expect(m.pesos[1]).toBe(1);
    m.definirPiscadinha(1);
    expect(m.pesos[1]).toBeCloseTo(0.15, 9);
    m.definirPiscadinha(0.5);
    expect(m.pesos[1]).toBeCloseTo(0.575, 9);
    m.definirPiscadinha(0);
    expect(m.pesos[1]).toBe(1);
    m.forcar('cara_neutro');
    m.definirPiscadinha(1);
    expect(m.pesos[0]).toBe(1);
  });

  it('tempo de troca zero troca já', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0);
    m.ir('cara_susto');
    expect([...m.pesos]).toEqual([0, 0, 1]);
  });

  it('forcar troca já, sem mistura e sem sobra de velocidade', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro', 0.2);
    m.ir('cara_susto');
    m.atualizar(0.03);
    m.forcar('cara_sorriso');
    expect([...m.pesos]).toEqual([0, 1, 0]);
    m.atualizar(1 / 60);
    expect(m.pesos[1]).toBe(1);
  });

  it('lança com cara que não existe', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro');
    expect(() => m.ir('cara_bravo')).toThrow('cara_bravo');
    expect(() => new MisturaDeCaras(CARAS, 'x')).toThrow('x');
  });

  it('tem(nome) diz se a cara existe', () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro');
    expect(m.tem('cara_susto')).toBe(true);
    expect(m.tem('cara_rindo')).toBe(false);
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const m = new MisturaDeCaras(CARAS, 'cara_neutro');
    const passo = (i: number): void => {
      if (i % 30 === 0) m.ir(CARAS[(i / 30) % 3]!);
      m.definirPiscar((i % 20) / 20);
      m.atualizar(1 / 60);
    };
    await provarSemAlocar(passo);
  }, TEMPO_DO_PERFILADOR_MS);
});

describe('Piscador', () => {
  const sequencia = (valores: number[]) => {
    let i = 0;
    return () => valores[i++ % valores.length]!;
  };
  /** Piscada simples e simétrica, como a dos primeiros testes. */
  const SIMPLES = { chanceDeDuplo: 0, fracaoDeFechar: 0.5 } as const;

  it('só pisca depois do intervalo sorteado (do RNG injetado, nunca de Math.random)', () => {
    const p = new Piscador(sequencia([0]), { ...SIMPLES, minS: 2, maxS: 6, duracaoS: 0.2 });
    p.atualizar(1.9);
    expect(p.valor).toBe(0);
    p.atualizar(0.1);
    p.atualizar(0.1);
    expect(p.valor).toBeCloseTo(1, 6);
  });

  it('fecha e abre: sobe até 1 e volta a 0 no fim', () => {
    const p = new Piscador(sequencia([0]), { ...SIMPLES, minS: 1, maxS: 2, duracaoS: 0.2 });
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
    const curto = new Piscador(sequencia([0]), { ...SIMPLES, minS: 1, maxS: 5, duracaoS: 0.2 });
    const longo = new Piscador(sequencia([1]), { ...SIMPLES, minS: 1, maxS: 5, duracaoS: 0.2 });
    curto.atualizar(1.1);
    longo.atualizar(1.1);
    expect(curto.valor).toBeGreaterThan(0);
    expect(longo.valor).toBe(0);
  });

  it('piscarJa começa uma piscada agora e o intervalo recomeça depois dela', () => {
    const p = new Piscador(sequencia([0]), { minS: 3, maxS: 3, duracaoS: 0.2, fracaoDeFechar: 0.5 });
    p.piscarJa();
    p.atualizar(0.1);
    expect(p.valor).toBeCloseTo(1, 6);
    p.atualizar(0.1);
    expect(p.valor).toBe(0);
    p.atualizar(2.8);
    expect(p.valor).toBe(0);
  });

  it('um quadro enorme não fica preso: termina a piscada e segue', () => {
    const p = new Piscador(sequencia([0]), { ...SIMPLES, minS: 1, maxS: 1, duracaoS: 0.2 });
    p.atualizar(50);
    expect(p.valor).toBeGreaterThanOrEqual(0);
    expect(p.valor).toBeLessThanOrEqual(1);
  });

  it('piscar natural fecha mais depressa do que abre (o pico vem antes da metade)', () => {
    const p = new Piscador(sequencia([0]), { chanceDeDuplo: 0, minS: 1, maxS: 1, duracaoS: 0.3 });
    p.atualizar(1);
    let pico = 0;
    let quando = 0;
    for (let i = 1; i <= 300; i++) {
      p.atualizar(0.001);
      if (p.valor > pico) {
        pico = p.valor;
        quando = i / 1000;
      }
    }
    expect(pico).toBeCloseTo(1, 3);
    expect(quando).toBeGreaterThan(0.06);
    expect(quando).toBeLessThan(0.13);
  });

  it('a piscada é contínua: de um quadro ao outro o valor nunca salta mais que a rampa', () => {
    const p = new Piscador(sequencia([0]), { chanceDeDuplo: 0, minS: 0.5, maxS: 0.5, duracaoS: 0.3 });
    let anterior = 0;
    let maiorSalto = 0;
    for (let i = 0; i < 600; i++) {
      p.atualizar(1 / 120);
      maiorSalto = Math.max(maiorSalto, Math.abs(p.valor - anterior));
      anterior = p.valor;
    }
    expect(maiorSalto).toBeLessThan(0.2);
  });

  it('às vezes pisca duas vezes seguidas, com uma pausa curta', () => {
    const p = new Piscador(sequencia([0]), { chanceDeDuplo: 1, minS: 2, maxS: 2, duracaoS: 0.2, pausaDoDuploS: 0.1, fracaoDeFechar: 0.5 });
    p.atualizar(2);
    const picos: number[] = [];
    let subiu = false;
    let t = 0;
    let anterior = 0;
    while (t < 1) {
      p.atualizar(0.005);
      t += 0.005;
      if (p.valor > anterior) subiu = true;
      else if (subiu && p.valor < anterior) {
        picos.push(t);
        subiu = false;
      }
      anterior = p.valor;
    }
    expect(picos.length).toBeGreaterThanOrEqual(2);
    expect(picos[1]! - picos[0]!).toBeGreaterThan(0.25);
    expect(picos[1]! - picos[0]!).toBeLessThan(0.4);
    // e depois do par só volta a piscar no próximo intervalo
    expect(picos.length).toBe(2);
  });

  it('a chance de duplo vem do sorteio injetado', () => {
    const contar = (chance: number): number => {
      const p = new Piscador(sorteioDeTeste(5), { chanceDeDuplo: chance, minS: 1, maxS: 1.5, duracaoS: 0.2, pausaDoDuploS: 0.1 });
      let piscadas = 0;
      let anterior = 0;
      for (let t = 0; t < 600; t += 0.01) {
        p.atualizar(0.01);
        if (anterior === 0 && p.valor > 0) piscadas++;
        anterior = p.valor;
      }
      return piscadas;
    };
    expect(contar(0.5)).toBeGreaterThan(contar(0) * 1.2);
    expect(contar(1)).toBeGreaterThan(contar(0.5));
  });

  describe('pedirPiscar e o intervalo mínimo (L46c)', () => {
    const ANDA = (p: Piscador, s: number): void => {
      for (let t = 0; t < s - 1e-9; t += 0.01) p.atualizar(0.01);
    };
    /** Sem piscada natural por perto (10 s) e sem par: só o que se pede. */
    const PEDIDOS = { chanceDeDuplo: 0, minS: 10, maxS: 10, duracaoS: 0.2, fracaoDeFechar: 0.5, intervaloMinimoS: 2.5 } as const;

    it('o padrão é 2,5 s entre uma piscada e a próxima, a natural e a que o olhar pede', () => {
      const p = new Piscador(sorteioDeTeste(3));
      expect(p.pedirPiscar()).toBe(true);
      const instantes: number[] = [];
      let anterior = 0;
      for (let t = 0; t < 600; t += 0.01) {
        p.atualizar(0.01);
        if (anterior === 0 && p.valor > 0) instantes.push(t);
        anterior = p.valor;
        // um olhar nervoso: pede uma piscada em todo quadro
        p.pedirPiscar();
      }
      const intervalos = instantes.slice(1).map((v, i) => v - instantes[i]!).filter((v) => v > 0.8);
      expect(intervalos.length).toBeGreaterThan(100);
      // 0,2 s de piscada + 2,5 s: nunca menos de 2,7 entre um começo e o outro (o `intervaloMinimoS` conta do fim da anterior)
      expect(Math.min(...intervalos)).toBeGreaterThanOrEqual(2.5 + 0.28 - 0.02);
    });

    it('antes da primeira piscada o pedido vale; no meio de uma não', () => {
      const p = new Piscador(sequencia([0]), PEDIDOS);
      expect(p.pedirPiscar()).toBe(true);
      p.atualizar(0.05);
      expect(p.pedirPiscar()).toBe(false);
    });

    it('o pedido que cai dentro do intervalo é recusado, e passado o intervalo vale', () => {
      const p = new Piscador(sequencia([0]), PEDIDOS);
      p.pedirPiscar();
      ANDA(p, 0.2);
      expect(p.valor).toBe(0);
      ANDA(p, 2.2);
      expect(p.pedirPiscar()).toBe(false);
      ANDA(p, 0.01);
      expect(p.valor).toBe(0);
      ANDA(p, 0.4);
      expect(p.pedirPiscar()).toBe(true);
      ANDA(p, 0.1);
      expect(p.valor).toBeGreaterThan(0.9);
    });

    it('piscarJa é o jogo mandando: ignora o intervalo', () => {
      const p = new Piscador(sequencia([0]), PEDIDOS);
      p.pedirPiscar();
      ANDA(p, 0.5);
      expect(p.pedirPiscar()).toBe(false);
      p.piscarJa();
      ANDA(p, 0.1);
      expect(p.valor).toBeGreaterThan(0.9);
    });

    it('o par de uma piscada dupla é um evento só: o segundo não é pedido, e o intervalo conta do fim do par', () => {
      const p = new Piscador(sequencia([0]), { ...PEDIDOS, chanceDeDuplo: 1, pausaDoDuploS: 0.1, minS: 1, maxS: 1 });
      ANDA(p, 1.0);
      // a piscada natural começou como par: durante a pausa o olhar não pisca por cima
      let picos = 0;
      let subiu = false;
      let anterior = 0;
      let t = 0;
      let fimDoPar = 0;
      while (t < 1.5) {
        p.atualizar(0.005);
        t += 0.005;
        if (p.valor > anterior) subiu = true;
        else if (subiu && p.valor < anterior) {
          picos++;
          subiu = false;
        }
        if (p.valor > 0) fimDoPar = t;
        anterior = p.valor;
        if (picos >= 1 && p.valor === 0) expect(p.pedirPiscar()).toBe(false);
      }
      expect(picos).toBe(2);
      expect(fimDoPar).toBeGreaterThan(0);
    });

    it('o intervalo é opção: com 0 o olhar pisca sempre que pede', () => {
      const p = new Piscador(sequencia([0]), { ...PEDIDOS, intervaloMinimoS: 0 });
      p.pedirPiscar();
      ANDA(p, 0.3);
      expect(p.pedirPiscar()).toBe(true);
    });
  });

  it('o intervalo natural fica entre 2,5 e 6 s por padrão', () => {
    const p = new Piscador(sorteioDeTeste(2));
    const instantes: number[] = [];
    let anterior = 0;
    for (let t = 0; t < 400; t += 0.01) {
      p.atualizar(0.01);
      if (anterior === 0 && p.valor > 0) instantes.push(t);
      anterior = p.valor;
    }
    const intervalos = instantes.slice(1).map((v, i) => v - instantes[i]!);
    const longos = intervalos.filter((v) => v > 0.8);
    expect(Math.min(...longos)).toBeGreaterThan(2.4);
    expect(Math.max(...longos)).toBeLessThan(6.5);
  });

  it('pedir piscar no meio de uma piscada não a reinicia (nada estala)', () => {
    const p = new Piscador(sequencia([0]), { chanceDeDuplo: 0, minS: 1, maxS: 1, duracaoS: 0.3 });
    p.piscarJa();
    for (let i = 0; i < 12; i++) p.atualizar(0.01);
    const antes = p.valor;
    p.piscarJa();
    p.atualizar(0.001);
    expect(Math.abs(p.valor - antes)).toBeLessThan(0.1);
    expect(p.valor).toBeGreaterThan(0.3);
  });

  it('o mesmo sorteio pisca igual', () => {
    const rodada = (): number[] => {
      const p = new Piscador(sorteioDeTeste(11));
      const v: number[] = [];
      for (let i = 0; i < 2000; i++) {
        p.atualizar(1 / 60);
        v.push(p.valor);
      }
      return v;
    };
    expect(rodada()).toEqual(rodada());
  });
});

describe('Piscadinha', () => {
  it('fecha, segura e abre uma vez só, e para', () => {
    const p = new Piscadinha();
    expect(p.valor).toBe(0);
    p.disparar(0.5);
    let pico = 0;
    let acima = 0;
    for (let i = 0; i < 100; i++) {
      p.atualizar(0.01);
      pico = Math.max(pico, p.valor);
      if (p.valor > 0.95) acima++;
    }
    expect(pico).toBe(1);
    expect(acima).toBeGreaterThan(10);
    p.atualizar(0.5);
    expect(p.valor).toBe(0);
    expect(p.ativa).toBe(false);
  });

  it('disparar de novo no meio da piscadinha não reinicia', () => {
    const p = new Piscadinha();
    p.disparar(0.5);
    for (let i = 0; i < 20; i++) p.atualizar(0.01);
    const antes = p.valor;
    p.disparar(0.5);
    p.atualizar(0.001);
    expect(Math.abs(p.valor - antes)).toBeLessThan(0.1);
  });
});

describe('PalpebrasDoOlhar', () => {
  const novas = (): PalpebrasDoOlhar => new PalpebrasDoOlhar({ cimaGrausPara1: 25, baixoGrausPara1: 20 });
  const assentar = (p: PalpebrasDoOlhar, pitch: number): void => {
    for (let i = 0; i < 120; i++) p.atualizar(1 / 60, pitch);
  };

  it('olhando para a frente as duas ficam em 0', () => {
    const p = novas();
    assentar(p, 0);
    expect(p.cima).toBe(0);
    expect(p.baixo).toBe(0);
  });

  it('olhando para cima sobe a de cima; olhando para baixo, a de baixo', () => {
    const cima = novas();
    assentar(cima, graus(25));
    expect(cima.cima).toBeCloseTo(1, 3);
    expect(cima.baixo).toBe(0);
    const baixo = novas();
    assentar(baixo, graus(-20));
    expect(baixo.baixo).toBeCloseTo(1, 3);
    expect(baixo.cima).toBe(0);
  });

  it('é gradual entre 0 e o ângulo de 1, e não passa de 1 mesmo olhando mais para cima', () => {
    const p = novas();
    assentar(p, graus(12.5));
    expect(p.cima).toBeGreaterThan(0.3);
    expect(p.cima).toBeLessThan(0.7);
    assentar(p, graus(60));
    expect(p.cima).toBeLessThanOrEqual(1);
  });

  it('acompanha com um pequeno atraso: no primeiro quadro depois do salto ainda não chegou', () => {
    const p = novas();
    p.atualizar(1 / 60, graus(25));
    expect(p.cima).toBeGreaterThan(0);
    expect(p.cima).toBeLessThan(0.9);
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const p = novas();
    const piscador = new Piscador(sorteioDeTeste(1));
    const um = new Piscadinha();
    const passo = (i: number): void => {
      p.atualizar(1 / 60, graus(((i % 100) - 50) / 2));
      piscador.atualizar(1 / 60);
      if (i % 300 === 0) um.disparar();
      um.atualizar(1 / 60);
    };
    await provarSemAlocar(passo);
  }, TEMPO_DO_PERFILADOR_MS);

  it('nunca sai de 0 a 1, nem com quadro enorme', () => {
    const p = novas();
    p.atualizar(60, graus(80));
    expect(p.cima).toBeLessThanOrEqual(1);
    p.atualizar(60, graus(-80));
    expect(p.baixo).toBeLessThanOrEqual(1);
    expect(p.cima).toBeGreaterThanOrEqual(0);
  });
});
