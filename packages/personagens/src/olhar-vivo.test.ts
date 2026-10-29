import { describe, expect, it } from 'vitest';
import { OlharVivo, anguloDeVergencia, type OpcoesDoOlhar } from './olhar-vivo';
import { sorteioDeTeste } from './para-testes';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from './alocacao-para-testes';

const graus = (g: number): number => (g * Math.PI) / 180;
const emGraus = (r: number): number => (r * 180) / Math.PI;

/** Sem espera e sem tremor: só a sacada, para medir o tempo dela. */
const SECO: Partial<OpcoesDoOlhar> = { latenciaS: [0, 0], amplitudeDasMicrossacadasRad: 0 };

/** O ponto a `dist` m, `yawG` graus para a esquerda e `pitchG` para cima, no referencial da cabeça (x esquerda, y cima, z frente). */
const ponto = (yawG: number, pitchG = 0, dist = 2): [number, number, number] => [
  dist * Math.cos(graus(pitchG)) * Math.sin(graus(yawG)),
  dist * Math.sin(graus(pitchG)),
  dist * Math.cos(graus(pitchG)) * Math.cos(graus(yawG)),
];

function rodar(o: OlharVivo, segundos: number, alvo: (t: number) => [number, number, number], dt = 1 / 240, t0 = 0): number {
  let t = t0;
  const fim = t0 + segundos;
  while (t < fim - 1e-9) {
    t += dt;
    const [x, y, z] = alvo(t);
    o.atualizar(dt, x, y, z);
  }
  return t;
}

describe('OlharVivo: sacada', () => {
  it('salta para o alvo novo em 30 a 60 ms e fixa', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    o.atualizar(0, ...ponto(0));
    const alvo = ponto(20);
    let chegou = -1;
    for (let i = 1; i <= 120; i++) {
      o.atualizar(1 / 1000, ...alvo);
      if (chegou < 0 && Math.abs(emGraus(o.yaw) - 20) < 0.3) chegou = i;
    }
    expect(chegou).toBeGreaterThanOrEqual(30);
    expect(chegou).toBeLessThanOrEqual(61);
    expect(emGraus(o.yaw)).toBeCloseTo(20, 1);
    expect(o.estado).toBe('fixacao');
    expect(o.sacadas).toBe(1);
  });

  it('a sacada passa pelo meio na metade do tempo (perfil de ida e parada, sem estalo)', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    o.atualizar(0, ...ponto(0));
    for (let i = 0; i < 30; i++) o.atualizar(1 / 1000, ...ponto(20));
    // 20° pedem a sacada mais longa (60 ms): aos 30 ms o olho está no meio
    expect(emGraus(o.yaw)).toBeGreaterThan(8);
    expect(emGraus(o.yaw)).toBeLessThan(12);
    expect(o.estado).toBe('sacada');
  });

  it('sacada pequena é mais curta que a grande', () => {
    const tempo = (g: number): number => {
      const o = new OlharVivo(sorteioDeTeste(1), SECO);
      o.atualizar(0, ...ponto(0));
      for (let i = 1; i <= 100; i++) {
        o.atualizar(1 / 1000, ...ponto(g));
        if (o.estado === 'fixacao') return i;
      }
      return 999;
    };
    expect(tempo(4)).toBeLessThan(tempo(25));
    expect(tempo(4)).toBeGreaterThanOrEqual(30);
    expect(tempo(60)).toBeLessThanOrEqual(61);
  });

  it('chega no mesmo tempo com quadros de 60 Hz (o relógio é do olho, não do quadro)', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    o.atualizar(0, ...ponto(0));
    for (let i = 0; i < 4; i++) o.atualizar(1 / 60, ...ponto(15));
    expect(emGraus(o.yaw)).toBeCloseTo(15, 1);
  });

  it('espera a latência antes de saltar (a reação não é instantânea)', () => {
    const o = new OlharVivo(sorteioDeTeste(1), { ...SECO, latenciaS: [0.1, 0.1] });
    o.atualizar(0, ...ponto(0));
    for (let i = 0; i < 90; i++) o.atualizar(1 / 1000, ...ponto(20));
    expect(emGraus(o.yaw)).toBe(0);
    for (let i = 0; i < 120; i++) o.atualizar(1 / 1000, ...ponto(20));
    expect(emGraus(o.yaw)).toBeCloseTo(20, 1);
  });

  it('erro abaixo do limiar não vira sacada (o olho não sai de uma fixação por 1°)', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    o.atualizar(0, ...ponto(0));
    for (let i = 0; i < 200; i++) o.atualizar(1 / 240, ...ponto(1));
    expect(o.sacadas).toBe(0);
  });

  it('o alvo vertical também salta', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    o.atualizar(0, ...ponto(0));
    for (let i = 0; i < 80; i++) o.atualizar(1 / 1000, ...ponto(0, -18));
    expect(emGraus(o.pitch)).toBeCloseTo(-18, 1);
  });

  it('pede piscar no salto grande (mais de 25°) e não no pequeno', () => {
    const grande = new OlharVivo(sorteioDeTeste(1), SECO);
    grande.atualizar(0, ...ponto(0));
    grande.atualizar(0.01, ...ponto(40));
    expect(grande.consumirPedidoDePiscar()).toBe(true);
    expect(grande.consumirPedidoDePiscar()).toBe(false);
    const pequeno = new OlharVivo(sorteioDeTeste(1), SECO);
    pequeno.atualizar(0, ...ponto(0));
    pequeno.atualizar(0.01, ...ponto(15));
    expect(pequeno.consumirPedidoDePiscar()).toBe(false);
  });

  it('alvo exatamente à frente ou na origem não vira NaN', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    o.atualizar(0.01, 0, 0, 0);
    o.atualizar(0.01, 0, 0, 3);
    expect(Number.isFinite(o.yaw) && Number.isFinite(o.pitch) && Number.isFinite(o.distancia)).toBe(true);
  });
});

describe('OlharVivo: fixação e microssacadas', () => {
  it('na fixação o olho dá saltinhos pequenos em volta do alvo, sem sair dele', () => {
    const o = new OlharVivo(sorteioDeTeste(4), { latenciaS: [0, 0] });
    o.atualizar(0, ...ponto(10));
    const t = rodar(o, 1, () => ponto(10), 1 / 120);
    const antes = o.microssacadas;
    let min = Infinity;
    let max = -Infinity;
    rodar(o, 10, () => {
      const d = emGraus(o.yaw) - 10;
      min = Math.min(min, d);
      max = Math.max(max, d);
      return ponto(10);
    }, 1 / 120, t);
    expect(max - min).toBeGreaterThan(0.1);
    expect(Math.max(Math.abs(min), Math.abs(max))).toBeLessThan(0.6);
    expect(o.microssacadas - antes).toBeGreaterThan(8);
    expect(o.microssacadas - antes).toBeLessThan(40);
  });

  it('microssacada não conta como sacada nem pede piscar', () => {
    const o = new OlharVivo(sorteioDeTeste(4), { latenciaS: [0, 0] });
    o.atualizar(0, ...ponto(0));
    rodar(o, 20, () => ponto(0), 1 / 60);
    expect(o.sacadas).toBe(0);
    expect(o.consumirPedidoDePiscar()).toBe(false);
  });
});

describe('OlharVivo: perseguição suave', () => {
  const rolando = (grausPorS: number) => (t: number) => ponto(grausPorS * t);

  it('segue sem parar um alvo que anda devagar, sem ficar saltando atrás dele', () => {
    const o = new OlharVivo(sorteioDeTeste(2), { latenciaS: [0.05, 0.05] });
    o.atualizar(0, ...ponto(0));
    rodar(o, 2, rolando(30), 1 / 60);
    expect(o.estado).toBe('perseguicao');
    const alvo = 60;
    expect(Math.abs(emGraus(o.yaw) - alvo)).toBeLessThan(1.5);
    expect(o.sacadas).toBeLessThanOrEqual(1);
  });

  it('alvo rápido demais para seguir é perseguido por sacadas de correção', () => {
    const o = new OlharVivo(sorteioDeTeste(2), { latenciaS: [0.05, 0.05] });
    o.atualizar(0, ...ponto(0));
    rodar(o, 1, rolando(300), 1 / 60);
    expect(o.estado).not.toBe('perseguicao');
    expect(o.sacadas).toBeGreaterThan(2);
  });

  it('quando o alvo passa a andar mais depressa que o olho, dá uma sacada de correção e segue', () => {
    const o = new OlharVivo(sorteioDeTeste(2), { latenciaS: [0, 0], perseguicao: { ganho: 0.4, ganhoDaPosicao: 2, limiteDaCorrecaoRad: graus(2) } });
    o.atualizar(0, ...ponto(0));
    rodar(o, 2, rolando(40), 1 / 60);
    expect(o.sacadas).toBeGreaterThanOrEqual(1);
    expect(Math.abs(emGraus(o.yaw) - 80)).toBeLessThan(6);
  });

  it('o alvo para: o olho larga a perseguição e fixa nele', () => {
    const o = new OlharVivo(sorteioDeTeste(2), { latenciaS: [0.05, 0.05] });
    o.atualizar(0, ...ponto(0));
    const t = rodar(o, 1, rolando(30), 1 / 60);
    rodar(o, 1.5, () => ponto(30), 1 / 60, t);
    expect(o.estado).toBe('fixacao');
    expect(Math.abs(emGraus(o.yaw) - 30)).toBeLessThan(1);
  });

  it('um salto do alvo não é tomado por perseguição (vira sacada)', () => {
    const o = new OlharVivo(sorteioDeTeste(2), { latenciaS: [0.05, 0.05] });
    o.atualizar(0, ...ponto(0));
    rodar(o, 0.5, () => ponto(0), 1 / 60);
    rodar(o, 0.04, () => ponto(35), 1 / 60, 0.5);
    expect(o.estado).not.toBe('perseguicao');
    rodar(o, 0.5, () => ponto(35), 1 / 60, 0.54);
    expect(Math.abs(emGraus(o.yaw) - 35)).toBeLessThan(0.8);
    expect(o.sacadas).toBe(1);
  });
});

describe('OlharVivo: vergência', () => {
  it('o ângulo entre os dois olhos cresce quando o alvo chega perto', () => {
    expect(anguloDeVergencia(0.03, 0.2)).toBeGreaterThan(graus(8));
    expect(anguloDeVergencia(0.03, 5)).toBeLessThan(graus(0.4));
    expect(anguloDeVergencia(0.03, 0.2)).toBeGreaterThan(anguloDeVergencia(0.03, 1) * 4);
  });

  const saida = new Float64Array(6);
  function anguloEntreOsOlhos(o: OlharVivo): number {
    o.direcaoDoOlho(0.015, 0, 0, saida, 0);
    o.direcaoDoOlho(-0.015, 0, 0, saida, 3);
    const d = (saida[0]! * saida[3]! + saida[1]! * saida[4]! + saida[2]! * saida[5]!) / (Math.hypot(saida[0]!, saida[1]!, saida[2]!) * Math.hypot(saida[3]!, saida[4]!, saida[5]!));
    return Math.acos(Math.min(Math.max(d, -1), 1));
  }

  it('cada olho mira o ponto: perto os dois convergem, longe ficam quase paralelos', () => {
    const perto = new OlharVivo(sorteioDeTeste(1), SECO);
    const longe = new OlharVivo(sorteioDeTeste(1), SECO);
    perto.atualizar(0, ...ponto(0, 0, 0.2));
    longe.atualizar(0, ...ponto(0, 0, 6));
    for (let i = 0; i < 400; i++) {
      perto.atualizar(1 / 240, ...ponto(0, 0, 0.2));
      longe.atualizar(1 / 240, ...ponto(0, 0, 6));
    }
    expect(emGraus(anguloEntreOsOlhos(perto))).toBeGreaterThan(7);
    expect(emGraus(anguloEntreOsOlhos(longe))).toBeLessThan(0.5);
  });

  it('o olho esquerdo (x positivo) olha um pouco para a direita (x menor) quando o alvo está perto e à frente', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    for (let i = 0; i < 400; i++) o.atualizar(1 / 240, ...ponto(0, 0, 0.3));
    o.direcaoDoOlho(0.015, 0, 0, saida, 0);
    expect(saida[0]).toBeLessThan(0);
    o.direcaoDoOlho(-0.015, 0, 0, saida, 0);
    expect(saida[0]).toBeGreaterThan(0);
  });

  it('a distância do olhar muda aos poucos, sem saltar', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    for (let i = 0; i < 400; i++) o.atualizar(1 / 240, ...ponto(0, 0, 4));
    o.atualizar(1 / 240, ...ponto(0, 0, 0.3));
    expect(o.distancia).toBeGreaterThan(2);
    for (let i = 0; i < 480; i++) o.atualizar(1 / 240, ...ponto(0, 0, 0.3));
    expect(o.distancia).toBeLessThan(0.45);
  });
});

describe('OlharVivo: repetição e custo', () => {
  const trajetoria = (semente: number): number[] => {
    const o = new OlharVivo(sorteioDeTeste(semente));
    const v: number[] = [];
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      o.atualizar(1 / 60, ...ponto(25 * Math.sin(t * 0.9), 8 * Math.cos(t * 1.7), 1.5));
      v.push(o.yaw, o.pitch);
    }
    return v;
  };

  it('o mesmo sorteio dá o mesmo olhar; outro sorteio, outro', () => {
    expect(trajetoria(9)).toEqual(trajetoria(9));
    expect(trajetoria(9)).not.toEqual(trajetoria(10));
  });

  it('quadro enorme não deixa o olho em NaN nem fora do alvo', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    o.atualizar(0, ...ponto(0));
    o.atualizar(30, ...ponto(50));
    o.atualizar(30, ...ponto(-50));
    expect(Number.isFinite(o.yaw)).toBe(true);
    for (let i = 0; i < 20; i++) o.atualizar(1 / 60, ...ponto(-50));
    expect(emGraus(o.yaw)).toBeCloseTo(-50, 0);
  });

  it('reiniciar volta o olho para a frente', () => {
    const o = new OlharVivo(sorteioDeTeste(1), SECO);
    for (let i = 0; i < 100; i++) o.atualizar(1 / 240, ...ponto(30));
    o.reiniciar();
    expect(o.yaw).toBe(0);
    expect(o.pitch).toBe(0);
    expect(o.estado).toBe('fixacao');
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const o = new OlharVivo(sorteioDeTeste(3));
    const saida = new Float64Array(3);
    const passo = (i: number): void => {
      const t = i / 60;
      o.atualizar(1 / 60, 2 * Math.sin(t), 0.3 * Math.cos(t * 1.3), 2);
      o.direcaoDoOlho(0.015, 0, 0, saida, 0);
      o.consumirPedidoDePiscar();
    };
    await provarSemAlocar(passo);
  }, TEMPO_DO_PERFILADOR_MS);
});
