import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO as C } from './config';
import { criarRng } from './rng';
import { golpeDoTaco } from './taco';
import type { ConfigFisica, EfeitoTacada, ParametrosTacada, Rng } from './tipos';

const semSorteio: Rng = {
  proximo: () => {
    throw new Error('não devia sortear');
  },
};

const tacada = (efeito: EfeitoTacada = { lateral: 0, vertical: 0 }, extra: Partial<ParametrosTacada> = {}): ParametrosTacada => ({
  angulo: 0,
  velocidadeTaco: 2,
  efeito,
  elevacao: 0,
  giz: 1,
  ...extra,
});

const R = C.bolao.raio;
const velocidadeNoCentro = (V: number) => ((1 + C.restituicaoTacoBola) * C.massaTaco * V) / (C.massaTaco + C.bolao.massa);

describe('golpeDoTaco', () => {
  it('no centro: v = (1+e)·M/(M+m)·V na direção da mira, sem giro', () => {
    const g = golpeDoTaco(tacada(undefined, { angulo: 0.3 }), C.bolao, C, semSorteio);
    expect(Math.hypot(g.vx, g.vz)).toBeCloseTo(velocidadeNoCentro(2), 12);
    expect(Math.atan2(g.vz, g.vx)).toBeCloseTo(0.3, 12);
    expect([g.wx, g.wy, g.wz]).toEqual([0, 0, 0]);
    expect(g.miscue).toBe(false);
  });

  it('acima do centro a 2/5 do raio já sai rolando', () => {
    const g = golpeDoTaco(tacada({ lateral: 0, vertical: 0.4 }, { angulo: 1 }), C.bolao, C, semSorteio);
    expect(g.vx + R * g.wz).toBeCloseTo(0, 12);
    expect(g.vz - R * g.wx).toBeCloseTo(0, 12);
    expect(g.wy).toBeCloseTo(0, 12);
  });

  it('fora do centro: v = (1+e)·V/(1 + m/M + 5d²/(2R²)) e |ω| = 5·v·d/(2R²), d no contato (lateral × fatorEfeitoLateral)', () => {
    const m = C.bolao.massa;
    const V = 2;
    for (const efeito of [{ lateral: 0, vertical: 0.4 }, { lateral: 0.3, vertical: -0.25 }, { lateral: -0.35, vertical: 0 }]) {
      const g = golpeDoTaco(tacada(efeito, { angulo: 0.7 }), C.bolao, C, semSorteio);
      const d = Math.hypot(efeito.lateral * C.fatorEfeitoLateral, efeito.vertical) * R;
      const v = ((1 + C.restituicaoTacoBola) * V) / (1 + m / C.massaTaco + (5 * d * d) / (2 * R * R));
      expect(Math.hypot(g.vx, g.vz)).toBeCloseTo(v, 12);
      expect(Math.hypot(g.wx, g.wy, g.wz)).toBeCloseTo((5 * v * d) / (2 * R * R), 9);
    }
    // Conferido à mão (Juiz, L1): 0,4R acima do centro a 2 m/s sai a 2,0349 m/s.
    const acima = golpeDoTaco(tacada({ lateral: 0, vertical: 0.4 }), C.bolao, C, semSorteio);
    expect(Math.hypot(acima.vx, acima.vz)).toBeCloseTo(2.0349, 4);
  });

  it('abaixo do centro dá giro para trás', () => {
    const g = golpeDoTaco(tacada({ lateral: 0, vertical: -0.3 }), C.bolao, C, semSorteio);
    // Rolar para +X é girar em torno de −Z; puxada gira em torno de +Z.
    expect(g.wz).toBeGreaterThan(0);
    expect(g.wx).toBeCloseTo(0, 12);
  });

  it('à direita gira em torno de +Y e desvia a bola para a esquerda (squirt)', () => {
    const g = golpeDoTaco(tacada({ lateral: 0.3, vertical: 0 }), C.bolao, C, semSorteio);
    expect(g.wy).toBeGreaterThan(0);
    expect(Math.atan2(g.vz, g.vx)).toBeCloseTo(-C.fatorSquirt * C.fatorEfeitoLateral * 0.3, 12);
  });

  it('o lateral do mini-bolão chega ao contato × fatorEfeitoLateral; o vertical, inteiro', () => {
    const inteiro: ConfigFisica = { ...C, fatorEfeitoLateral: 1 };
    expect(golpeDoTaco(tacada({ lateral: 0.45, vertical: -0.2 }), C.bolao, C, semSorteio)).toEqual(
      golpeDoTaco(tacada({ lateral: 0.45 * C.fatorEfeitoLateral, vertical: -0.2 }), C.bolao, inteiro, semSorteio),
    );
    expect(golpeDoTaco(tacada({ lateral: 0, vertical: 0.4 }), C.bolao, C, semSorteio)).toEqual(
      golpeDoTaco(tacada({ lateral: 0, vertical: 0.4 }), C.bolao, inteiro, semSorteio),
    );
    const g = golpeDoTaco(tacada({ lateral: 0.5, vertical: 0 }), C.bolao, C, semSorteio);
    expect(g.wy).toBeCloseTo((5 * Math.hypot(g.vx, g.vz) * 0.5 * C.fatorEfeitoLateral * R) / (2 * R * R), 9);
  });

  it('o miscue segue o mini-bolão, não o contato: o limite seguro é o que o jogador vê', () => {
    let sorteios = 0;
    const contador: Rng = { proximo: () => (sorteios++, 0.999) };
    const alem = C.limiteEfeitoComGiz + 0.05;
    expect(alem * C.fatorEfeitoLateral).toBeLessThan(C.limiteEfeitoComGiz);
    golpeDoTaco(tacada({ lateral: alem, vertical: 0 }, { giz: 1 }), C.bolao, C, contador);
    expect(sorteios).toBe(1);
  });

  it('o ponto de contato não passa de config.efeitoMaximo (o taco não alcança a borda da bola)', () => {
    const solto: ConfigFisica = { ...C, limiteEfeitoComGiz: 1, efeitoMaximo: 0.6 };
    const borda = golpeDoTaco(tacada({ lateral: 0.9, vertical: 0 }), C.bolao, solto, semSorteio);
    const limite = golpeDoTaco(tacada({ lateral: 0.6, vertical: 0 }), C.bolao, solto, semSorteio);
    expect(borda).toEqual(limite);
    expect(C.efeitoMaximo).toBe(0.95);
  });

  it('limita a velocidade do taco a velocidadeMaxTaco', () => {
    const forte = golpeDoTaco(tacada(undefined, { velocidadeTaco: 20 }), C.bolao, C, semSorteio);
    expect(forte.velocidadeTaco).toBe(C.velocidadeMaxTaco);
    expect(Math.hypot(forte.vx, forte.vz)).toBeCloseTo(velocidadeNoCentro(C.velocidadeMaxTaco), 12);
  });

  it('elevação tira velocidade horizontal', () => {
    const g = golpeDoTaco(tacada(undefined, { elevacao: 0.3 }), C.bolao, C, semSorteio);
    expect(Math.hypot(g.vx, g.vz)).toBeCloseTo(velocidadeNoCentro(2) * Math.cos(0.3), 12);
  });

  it('dentro do limite seguro nunca dá miscue nem sorteia', () => {
    const comGiz = golpeDoTaco(tacada({ lateral: 0.3, vertical: 0.39 }), C.bolao, C, semSorteio);
    const semGiz = golpeDoTaco(tacada({ lateral: 0, vertical: -0.29 }, { giz: 0 }), C.bolao, C, semSorteio);
    expect(comGiz.miscue || semGiz.miscue).toBe(false);
  });

  it('o limite seguro encolhe com o giz', () => {
    let sorteios = 0;
    const contador: Rng = { proximo: () => (sorteios++, 0.999) };
    golpeDoTaco(tacada({ lateral: 0.45, vertical: 0 }, { giz: 1 }), C.bolao, C, contador);
    expect(sorteios).toBe(0);
    golpeDoTaco(tacada({ lateral: 0.45, vertical: 0 }, { giz: 0 }), C.bolao, C, contador);
    expect(sorteios).toBeGreaterThan(0);
  });

  it('muito além do limite é miscue certo: bola fraca e quase sem efeito', () => {
    const normal = golpeDoTaco(tacada({ lateral: 0.2, vertical: 0 }), C.bolao, C, semSorteio);
    const g = golpeDoTaco(tacada({ lateral: 0.9, vertical: 0 }, { giz: 0 }), C.bolao, C, criarRng(1));
    expect(g.miscue).toBe(true);
    expect(Math.hypot(g.vx, g.vz)).toBeLessThan(0.5 * Math.hypot(normal.vx, normal.vz));
    expect(Math.abs(g.wy)).toBeLessThan(Math.abs(normal.wy));
  });

  it('a chance de miscue cresce além do limite', () => {
    const frequencia = (lateral: number) => {
      let n = 0;
      for (let s = 1; s <= 2000; s++) {
        if (golpeDoTaco(tacada({ lateral, vertical: 0 }, { giz: 0 }), C.bolao, C, criarRng(s)).miscue) n++;
      }
      return n / 2000;
    };
    const perto = frequencia(C.limiteEfeitoSemGiz + 0.25 * C.faixaMiscue);
    const longe = frequencia(C.limiteEfeitoSemGiz + 0.75 * C.faixaMiscue);
    expect(perto).toBeCloseTo(0.25, 1);
    expect(longe).toBeCloseTo(0.75, 1);
  });
});
