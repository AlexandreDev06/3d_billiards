import { describe, expect, it, vi } from 'vitest';
import { CONFIG_FISICA_PADRAO, medidasDaBola } from './config';
import { bolaParada, mesaInicial } from './lugares';
import { BOLA, MESA_BAR, cacapas, distanciaContatoTabela, pontasTabela, tabelas, type MedidasMesa, type Ponto2 } from './medidas';
import { Motor } from './motor';
import { criarRng } from './rng';
import { simularTacada } from './simulacao';
import { golpeDoTaco } from './taco';
import {
  ID_BOLAO,
  type ConfigFisica,
  type EfeitoTacada,
  type EstadoMesa,
  type EventoTacada,
  type Gravacao,
  type IdBola,
  type ParametrosTacada,
} from './tipos';

const C = CONFIG_FISICA_PADRAO;
const g = C.gravidade;
const MESA_GRANDE: MedidasMesa = { ...MESA_BAR, comprimento: 20, largura: 20 };
/** Livro-texto: bolas iguais, choque elástico, sem atrito bola-bola, mesa sem tabelas por perto. */
const IDEAL: ConfigFisica = {
  ...C,
  mesa: MESA_GRANDE,
  bolao: BOLA,
  restituicaoBolaBola: 1,
  atritoBolaBolaLento: 0,
  atritoBolaBolaRapido: 0,
};
const REAL_GRANDE: ConfigFisica = { ...C, mesa: MESA_GRANDE };

const mesa = (bolas: [IdBola, number, number][], config = C): EstadoMesa => ({
  bolas: bolas.map(([id, x, z]) => bolaParada(id, { x, z }, config)),
});

const tacada = (angulo: number, velocidadeTaco: number, efeito: EfeitoTacada = { lateral: 0, vertical: 0 }, giz = 1): ParametrosTacada => ({
  angulo,
  velocidadeTaco,
  efeito,
  elevacao: 0,
  giz,
});

const posicao = (gr: Gravacao, q: number, id: IdBola): Ponto2 => {
  const k = (q * gr.ids.length + gr.ids.indexOf(id)) * 3;
  return { x: gr.posicoes[k]!, z: gr.posicoes[k + 2]! };
};

const final = (estado: EstadoMesa, id: IdBola) => estado.bolas.find((b) => b.id === id)!;
const graus = (rad: number) => (rad * 180) / Math.PI;
const anguloEntre = (a: Ponto2, b: Ponto2) => graus(Math.acos((a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z))));
const menos = (a: Ponto2, b: Ponto2): Ponto2 => ({ x: a.x - b.x, z: a.z - b.z });
const doTipo = <T extends EventoTacada['tipo']>(eventos: readonly EventoTacada[], tipo: T) =>
  eventos.filter((e): e is Extract<EventoTacada, { tipo: T }> => e.tipo === tipo);

/** Bolão encostado (folga de 1 mm) numa bola em (0, 0), com a linha dos centros a `corte` da direção +X. */
const corte = (corteRad: number, config: ConfigFisica, recuo = 0.001): EstadoMesa => {
  const D = medidasDaBola(ID_BOLAO, config).raio + config.bola.raio;
  return mesa(
    [
      [ID_BOLAO, -D * Math.cos(corteRad) - recuo, -D * Math.sin(corteRad)],
      [1, 0, 0],
    ],
    config,
  );
};

const QUINZE = Array.from({ length: 15 }, (_, i) => i + 1);
/** O triângulo do Boteco (L8): 2 a 14, a 8 no centro (vaga 4). */
const TREZE = [2, 3, 4, 5, 8, 6, 7, 9, 10, 11, 12, 13, 14];

const quebra = (semente = 1, efeito?: EfeitoTacada, giz = 1) =>
  simularTacada(
    mesaInicial(QUINZE, C),
    tacada(0, C.velocidadeMaxTaco, efeito, giz),
    criarRng(semente),
  );

const PONTAS = pontasTabela(MESA_BAR);
/** Trechos retos de tabela: o nariz entre as pontas arredondadas e a face de cada quina. */
const RETOS = [
  ...tabelas(MESA_BAR).map((t, k) => ({ inicio: PONTAS[2 * k]!.noNariz, fim: PONTAS[2 * k + 1]!.noNariz, normal: t.normal })),
  ...PONTAS.map((p) => ({ inicio: p.naFace, fim: p.fimDaFace, normal: p.normalFace })),
];

/**
 * Pior invasão (m) de uma bola na mesa em outra bola, num trecho reto de tabela
 * (onde há segmento; a boca entre as pontas é livre) ou numa ponta arredondada;
 * ≤ 0 quando todas estão fora.
 */
/** Mais longe que isto atrás do trecho (m) a bola não está atravessando a tabela: é outra parte da mesa. */
const LONGE_DO_TRECHO = 0.1;
const piorInvasao = (motor: Motor): number => {
  const bolas = motor.bolas.filter((b) => b.naMesa);
  let pior = -Infinity;
  for (const [i, b] of bolas.entries()) {
    const rc = distanciaContatoTabela(b.raio, MESA_BAR);
    for (const t of RETOS) {
      const ex = t.fim.x - t.inicio.x;
      const ez = t.fim.z - t.inicio.z;
      const u = ((b.px - t.inicio.x) * ex + (b.pz - t.inicio.z) * ez) / (ex * ex + ez * ez);
      // Só conta a bola perto do trecho: a garganta funda deixa bola na mesa além da linha da boca, e a reta de uma
      // face, prolongada, passa por outras partes da mesa (a bola na boca do canto "projeta" na face do meio).
      const lado = (b.px - t.inicio.x) * t.normal.x + (b.pz - t.inicio.z) * t.normal.z;
      if (u >= 0 && u <= 1 && lado > -LONGE_DO_TRECHO) pior = Math.max(pior, rc - lado);
    }
    for (const q of PONTAS) pior = Math.max(pior, rc + q.raio - Math.hypot(b.px - q.centro.x, b.pz - q.centro.z));
    for (const outra of bolas.slice(i + 1)) pior = Math.max(pior, b.raio + outra.raio - Math.hypot(b.px - outra.px, b.pz - outra.pz));
  }
  return pior;
};

describe('bola sozinha, tacada no centro (tolerância 1 µm: a integração é analítica)', () => {
  const V = 0.37;
  const v0 = golpeDoTaco(tacada(0, V), C.bolao, C, criarRng(1)).vx;
  const deslize = (12 * v0 ** 2) / (49 * C.atritoDeslizamento * g);
  const tRolar = (2 * v0) / (7 * C.atritoDeslizamento * g);
  const rolamento = ((5 / 7) * v0) ** 2 / (2 * C.atritoRolamento * g);

  it('desliza até 5/7·v₀ depois de 12·v₀²/(49·μs·g)', () => {
    const motor = new Motor(mesa([[ID_BOLAO, -0.5, 0]]), C);
    motor.aplicarGolpe(0, golpeDoTaco(tacada(0, V), C.bolao, C, criarRng(1)));
    motor.avancar(tRolar - 1e-9);
    expect(motor.bolas[0]!.movimento()).toBe('deslizando');
    motor.avancar(2e-9);
    const b = motor.bolas[0]!;
    expect(b.movimento()).toBe('rolando');
    expect(b.vx).toBeCloseTo((5 / 7) * v0, 6);
    expect(b.px + 0.5).toBeCloseTo(deslize, 6);
  });

  it('depois rola v²/(2·μr·g) e para', () => {
    const r = simularTacada(mesa([[ID_BOLAO, -0.5, 0]]), tacada(0, V), criarRng(1));
    const b = final(r.estadoFinal, ID_BOLAO);
    expect(b.posicao.x + 0.5).toBeCloseTo(deslize + rolamento, 6);
    expect(b.posicao.z).toBeCloseTo(0, 9);
    expect(b.movimento).toBe('parada');
    expect(r.gravacao.duracao).toBeCloseTo(tRolar + ((5 / 7) * v0) / (C.atritoRolamento * g), 6);
  });
});

describe('bola-bola', () => {
  it('tacada seca de frente (livro-texto): o bolão para e a outra sai', () => {
    const r = simularTacada(corte(0, IDEAL), tacada(0, 1), criarRng(1), IDEAL);
    const choque = doTipo(r.eventos, 'bola-bola')[0]!;
    expect(choque).toMatchObject({ a: ID_BOLAO, b: 1 });
    expect(final(r.estadoFinal, ID_BOLAO).posicao.x).toBeCloseTo(-2 * BOLA.raio, 3);
    expect(final(r.estadoFinal, 1).posicao.x).toBeGreaterThan(1);
  });

  it('com o bolão mais pesado, a tacada seca ainda segue um pouco', () => {
    const r = simularTacada(corte(0, REAL_GRANDE), tacada(0, 1), criarRng(1), REAL_GRANDE);
    const contato = -(BOLA.raio + C.bolao.raio);
    expect(final(r.estadoFinal, ID_BOLAO).posicao.x - contato).toBeGreaterThan(0.005);
  });

  it('regra dos 90°: bolão sem giro sai a 90° da bola atingida (livro-texto ±0,5°)', () => {
    // Com bolão mais pesado e e < 1, o bolão segue: separação = atan2(sen φ, k·cos φ), k = (ma − e·mb)/(ma + mb).
    const k = (C.bolao.massa - C.restituicaoBolaBola * C.bola.massa) / (C.bolao.massa + C.bola.massa);
    const SEM_THROW: ConfigFisica = { ...REAL_GRANDE, atritoBolaBolaLento: 0, atritoBolaBolaRapido: 0 };
    for (const corteGraus of [15, 30, 50]) {
      const c = (corteGraus * Math.PI) / 180;
      const separacao = (config: ConfigFisica) => {
        const inicio = corte(c, config, 0.001);
        const r = simularTacada(inicio, tacada(0, 1), criarRng(1), config);
        const p0 = inicio.bolas[0]!.posicao;
        const contato = { x: p0.x + 0.001, z: p0.z };
        return anguloEntre(menos(final(r.estadoFinal, ID_BOLAO).posicao, contato), final(r.estadoFinal, 1).posicao);
      };
      expect(Math.abs(separacao(IDEAL) - 90)).toBeLessThan(0.5);
      const previsto = graus(Math.atan2(Math.sin(c), k * Math.cos(c)));
      expect(Math.abs(separacao(SEM_THROW) - previsto)).toBeLessThan(0.5);
      // O throw fecha um pouco mais o ângulo.
      expect(separacao(REAL_GRANDE)).toBeLessThan(previsto);
      expect(separacao(REAL_GRANDE)).toBeGreaterThan(previsto - 6);
    }
  });

  it('regra dos 30°: bolão rolando em meia bola desvia 33,7° (livro-texto ±1°)', () => {
    const desvio = (config: ConfigFisica) => {
      const inicio = corte(Math.PI / 6, config, 0.3);
      const r = simularTacada(inicio, tacada(0, 0.8, { lateral: 0, vertical: 0.4 }), criarRng(1), config);
      const gr = r.gravacao;
      const fim = posicao(gr, gr.quadros - 1, ID_BOLAO);
      let parou = gr.quadros - 1;
      while (parou > 0 && posicao(gr, parou - 1, ID_BOLAO).x === fim.x) parou--;
      const antes = posicao(gr, parou - Math.round(0.3 * gr.frequencia), ID_BOLAO);
      return Math.abs(graus(Math.atan2(fim.z - antes.z, fim.x - antes.x)));
    };
    // A mesa real (bolão pesado, e < 1, throw) fica sem janela própria: o teste dos 90° confere massa e e pela fórmula.
    expect(Math.abs(desvio(IDEAL) - 33.7)).toBeLessThan(1);
  });

  it('puxada: depois de bater de frente o bolão volta', () => {
    // Com μs = 0,2 o giro para trás morre rápido no pano (~175 rad/s²): puxada pede força e pouca distância.
    const inicio = corte(0, REAL_GRANDE, 0.2);
    const r = simularTacada(inicio, tacada(0, 3, { lateral: 0, vertical: -0.4 }), criarRng(1), REAL_GRANDE);
    const contato = -(BOLA.raio + C.bolao.raio);
    expect(final(r.estadoFinal, ID_BOLAO).posicao.x).toBeLessThan(contato - 0.2);
  });

  it('passo que esgota o limite de eventos é contado (rede de segurança contra laço de choques)', () => {
    const inicio = mesaInicial(QUINZE, C);
    const golpe = golpeDoTaco(tacada(0, C.velocidadeMaxTaco), C.bolao, C, criarRng(1));
    const normal = new Motor(inicio, C);
    const curto = new Motor(inicio, C, 2);
    normal.aplicarGolpe(0, golpe);
    curto.aplicarGolpe(0, golpe);
    for (let k = 0; k < 512 * 0.2; k++) {
      normal.avancar(C.passo);
      curto.avancar(C.passo);
    }
    expect(normal.passosEsgotados).toBe(0);
    expect(curto.passosEsgotados).toBeGreaterThan(0);
    expect(curto.t).toBeCloseTo(normal.t, 12);
  });

  it('o primeiro passo esgotado avisa no console, uma vez por Motor', () => {
    // O pacote compila sem DOM nem Node: o console vem do ambiente.
    const { console: saida } = globalThis as unknown as { console: { warn(mensagem: string): void } };
    const aviso = vi.spyOn(saida, 'warn').mockImplementation(() => {});
    try {
      const motor = new Motor(mesaInicial(QUINZE, C), C, 2);
      motor.aplicarGolpe(0, golpeDoTaco(tacada(0, C.velocidadeMaxTaco), C.bolao, C, criarRng(1)));
      for (let k = 0; k < 512 * 0.2; k++) motor.avancar(C.passo);
      expect(motor.passosEsgotados).toBeGreaterThan(1);
      expect(aviso).toHaveBeenCalledTimes(1);
      expect(String(aviso.mock.calls[0]![0])).toMatch(/limite de choques/);
    } finally {
      aviso.mockRestore();
    }
  });

  it('choque que começa sobreposto termina separado', () => {
    const D = C.bolao.raio + C.bola.raio;
    const motor = new Motor(mesa([[ID_BOLAO, -D + 0.001, 0], [1, 0, 0]], C), C);
    motor.aplicarGolpe(0, golpeDoTaco(tacada(0, 1), C.bolao, C, criarRng(1)));
    motor.avancar(C.passo / 1000);
    const [a, b] = motor.bolas;
    expect(Math.hypot(b!.px - a!.px, b!.pz - a!.pz)).toBeGreaterThanOrEqual(D);
    expect(doTipo(motor.eventos, 'bola-bola')).toHaveLength(1);
  });

  /** Throw (graus) no corte de 30° em stun: quanto a bola atingida sai fechada da linha dos centros (direção a 0,5 s, antes de qualquer tabela). */
  const throwNoCorte = (velocidadeTaco: number) => {
    const c = Math.PI / 6;
    const r = simularTacada(corte(c, REAL_GRANDE), tacada(0, velocidadeTaco), criarRng(1), REAL_GRANDE);
    expect(doTipo(r.eventos, 'bola-tabela').filter((e) => e.t < 0.5)).toHaveLength(0);
    const p = posicao(r.gravacao, Math.round(0.5 * r.gravacao.frequencia), 1);
    return { graus: graus(c) - graus(Math.atan2(p.z, p.x)), vn: doTipo(r.eventos, 'bola-bola')[0]!.velocidade, c };
  };

  it('throw lento: corte de 30° a ~0,66 m/s fica no limite da aderência, 4,84 ± 0,3°', () => {
    // Aderência: Jt/Jn = tan φ / (3,5·(1+e)), sem depender de massa nem velocidade; aqui μ(v) ainda é maior que isso.
    const t = throwNoCorte(0.5);
    const aderencia = Math.tan(t.c) / (3.5 * (1 + C.restituicaoBolaBola));
    expect(graus(Math.atan(aderencia))).toBeCloseTo(4.84, 2);
    expect(Math.abs(t.graus - 4.84)).toBeLessThan(0.3);
  });

  it('throw rápido: limitado pelo atrito, sai atan(μ(v)) com v = escorregamento no contato, menor que o lento', () => {
    // Stun: o escorregamento no contato é a parte tangencial da velocidade do bolão, vn·tan φ.
    const t = throwNoCorte(2);
    const v = t.vn * Math.tan(t.c);
    const mu = C.atritoBolaBolaRapido + (C.atritoBolaBolaLento - C.atritoBolaBolaRapido) * Math.exp(-C.atritoBolaBolaQueda * v);
    expect(mu).toBeLessThan(Math.tan(t.c) / (3.5 * (1 + C.restituicaoBolaBola)));
    expect(Math.abs(t.graus - graus(Math.atan(mu)))).toBeLessThan(0.05);
    expect(t.graus).toBeLessThan(throwNoCorte(0.5).graus - 1);
  });
});

describe('choques simultâneos (começam dentro de janelaChoqueSimultaneo)', () => {
  /** Livro-texto sem pano: as velocidades logo depois do choque não mudam com o tempo. */
  const SEM_PANO: ConfigFisica = { ...IDEAL, atritoDeslizamento: 0, atritoRolamento: 0 };
  const D = 2 * BOLA.raio;
  const v = 2;
  const c30 = Math.cos(Math.PI / 6);
  const parada = { vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, velocidadeTaco: 0, miscue: false };
  const rapidez = (motor: Motor, i: number) => Math.hypot(motor.bolas[i]!.vx, motor.bolas[i]!.vz);

  /** Bola 1 a v para +X contra a 2 (a −30°) e a 3 (a +30°), cada uma com a sua folga além do encosto. */
  const leque = (folga2: number, folga3: number, config = SEM_PANO) => {
    const lugar = (lado: number, folga: number) => [(D + folga) * c30, (lado * (D + folga)) / 2] as const;
    const motor = new Motor(mesa([[1, 0, 0], [2, ...lugar(-1, folga2)], [3, ...lugar(1, folga3)]], config), config);
    motor.aplicarGolpe(0, { ...parada, vx: v });
    motor.avancar(0.0015);
    return motor;
  };

  it('duas bolas tocadas dentro da janela dividem o impulso por igual (Poisson): cada uma sai a (1+e)·cos30°/(1+2·cos²30°)·v', () => {
    const motor = leque(0.00005, 0);
    const previsto = ((1 + SEM_PANO.restituicaoBolaBola) * c30 * v) / (1 + 2 * c30 * c30);
    expect(rapidez(motor, 1)).toBeCloseTo(previsto, 6);
    expect(rapidez(motor, 2)).toBeCloseTo(previsto, 6);
    expect(motor.bolas[0]!.vx).toBeCloseTo(v - 2 * previsto * c30, 6);
    // Os dois choques ficam registrados, na ordem em que as bolas se tocariam.
    expect(doTipo(motor.eventos, 'bola-bola').map((e) => [e.a, e.b])).toEqual([[1, 3], [1, 2]]);
  });

  it('com três tocadas na janela, os eventos saem na ordem em que cada uma seria tocada', () => {
    // Bola 1 contra a 2 (+60°, folga 30 µm), a 3 (0°, encostada) e a 4 (−60°, folga 10 µm).
    const lugar = (graus: number, folga: number) => {
      const a = (graus * Math.PI) / 180;
      return [(D + folga) * Math.cos(a), (D + folga) * Math.sin(a)] as const;
    };
    const motor = new Motor(mesa([[1, 0, 0], [2, ...lugar(60, 0.00003)], [3, ...lugar(0, 0)], [4, ...lugar(-60, 0.00001)]], SEM_PANO), SEM_PANO);
    motor.aplicarGolpe(0, { ...parada, vx: v });
    motor.avancar(0.0015);
    expect(doTipo(motor.eventos, 'bola-bola').map((e) => [e.a, e.b])).toEqual([[1, 3], [1, 4], [1, 2]]);
  });

  it('par do grupo que se afastaria depois dos outros impulsos não é puxado: a bola fica parada', () => {
    // Bola 1 a −25°: toca a 3 (+60°) de raspão e logo a 2 (0°); o impulso da 2 a afasta da 3, então a 3 não recebe nada.
    const a = (-25 * Math.PI) / 180;
    const motor = new Motor(mesa([[1, 0, 0], [2, D + 0.000005, 0], [3, D / 2, (D * Math.sqrt(3)) / 2]], SEM_PANO), SEM_PANO);
    motor.aplicarGolpe(0, { ...parada, vx: v * Math.cos(a), vz: v * Math.sin(a) });
    motor.avancar(0.0015);
    expect(rapidez(motor, 2)).toBe(0);
    expect(rapidez(motor, 1)).toBeGreaterThan(1);
    expect(doTipo(motor.eventos, 'bola-bola').map((e) => [e.a, e.b])).toEqual([[1, 2]]);
  });

  it('a energia não cresce no choque em grupo (e = 1 conserva; e < 1 perde)', () => {
    const energia = (folga: number, config: ConfigFisica) => {
      const motor = leque(folga, 0, { ...config, atritoBolaBolaLento: 0, atritoBolaBolaRapido: 0 });
      return motor.energiaCinetica() / (0.5 * BOLA.massa * v * v);
    };
    expect(energia(0.00005, SEM_PANO)).toBeCloseTo(1, 9);
    expect(energia(0.00005, { ...SEM_PANO, restituicaoBolaBola: 0.9 })).toBeLessThan(1);
  });

  it('fora da janela, os choques seguem em série: a primeira tocada leva cos30°·v', () => {
    const motor = leque(0.001, 0);
    expect(rapidez(motor, 2)).toBeCloseTo(v * c30, 6);
    expect(rapidez(motor, 1)).toBeLessThan(v * c30 - 0.5);
  });

  it('bola encostada em outra, em linha, segue em série como o pêndulo de Newton', () => {
    const motor = new Motor(mesa([[1, 0, 0], [2, D, 0], [3, 2 * D, 0]], SEM_PANO), SEM_PANO);
    motor.aplicarGolpe(0, { ...parada, vx: v });
    motor.avancar(0.0015);
    expect(motor.bolas[0]!.vx).toBeCloseTo(0, 9);
    expect(motor.bolas[1]!.vx).toBeCloseTo(0, 9);
    expect(motor.bolas[2]!.vx).toBeCloseTo(v, 9);
  });

  it('janela zero volta à resolução em série', () => {
    const motor = leque(0.00005, 0, { ...SEM_PANO, janelaChoqueSimultaneo: 0 });
    expect(rapidez(motor, 2)).toBeCloseTo(v * c30, 6);
  });
});

describe('contato lento e de repouso', () => {
  const D = 2 * BOLA.raio;
  const quebras = () =>
    [QUINZE.slice(1), TREZE].flatMap((ids) =>
      Array.from({ length: 40 }, (_, k) => simularTacada(mesaInicial(ids, C, criarRng(k + 1)), tacada(0, C.velocidadeMaxTaco), criarRng(k + 1))),
    );

  it('bola que encosta devagar numa parada: a atingida fica com o que recebeu e o par se afasta', () => {
    // Caso da quebra (L2c): a 12 rola quase paralela à 10 e encosta com 0,9 mm/s de aproximação normal.
    // A 10 recebe 0,975 disso, abaixo de velocidadeParada; zerar ali deixava a 12 batendo de novo sem fim.
    const vn = 0.0009;
    const vt = 0.004;
    const motor = new Motor(mesa([[1, 0, 0], [2, 0, D]]), C);
    motor.aplicarGolpe(0, { vx: vt, vz: vn, wx: vn / BOLA.raio, wy: 0, wz: -vt / BOLA.raio, velocidadeTaco: 0, miscue: false });
    motor.avancar(1e-5);
    const [a, b] = motor.bolas;
    expect(b!.vz).toBeGreaterThan(0.9 * ((1 + C.restituicaoBolaBola) / 2) * vn);
    expect(a!.vz - b!.vz).toBeLessThan(0);
    expect(motor.passosEsgotados).toBe(0);
  });

  it('bola tangente a uma parada encostada não gira o laço: previsor e choque concordam no arredondamento', () => {
    // Achado por busca (L2c): v ⟂ n só no arredondamento; o previsor via dx·dv = −1,7e-21 (se aproximam) e o choque, vn = 0.
    const motor = new Motor(mesa([[1, 0.3, 0.1], [2, 0.3539148270507766, 0.10303173615026937]]), C);
    const vx = -0.0002245730481681006;
    const vz = 0.003993690892650117;
    motor.aplicarGolpe(0, { vx, vz, wx: vz / BOLA.raio, wy: 0, wz: -vx / BOLA.raio, velocidadeTaco: 0, miscue: false });
    motor.avancar(C.passo);
    expect(motor.passosEsgotados).toBe(0);
  });

  it('quebra a 8 m/s (40 sementes, 14 e 13 bolas com folga): nenhum passo esgota o limite de choques', () => {
    const { console: saida } = globalThis as unknown as { console: { warn(mensagem: string): void } };
    const aviso = vi.spyOn(saida, 'warn').mockImplementation(() => {});
    try {
      quebras();
      expect(aviso).not.toHaveBeenCalled();
    } finally {
      aviso.mockRestore();
    }
  });

  it('choque abaixo de velocidadeMinimaChoque não vira evento (quebra a 8 m/s, 40 sementes)', () => {
    expect(C.velocidadeMinimaChoque).toBeGreaterThan(0);
    const lentos = quebras()
      .flatMap((r) => r.eventos)
      .filter((e) => (e.tipo === 'bola-bola' || e.tipo === 'bola-tabela') && e.velocidade < C.velocidadeMinimaChoque);
    expect(lentos).toEqual([]);
  });

  it('choque em grupo abaixo do limiar não vira evento, mas as bolas recebem o impulso', () => {
    // Bola a 1,5 mm/s contra duas a ±60°: aproximação de 0,75 mm/s em cada, dentro da janela.
    const SEM_PANO: ConfigFisica = { ...IDEAL, atritoDeslizamento: 0, atritoRolamento: 0 };
    const v = 0.0015;
    const lugar = (graus: number, folga: number) => {
      const a = (graus * Math.PI) / 180;
      return [(D + folga) * Math.cos(a), (D + folga) * Math.sin(a)] as const;
    };
    const motor = new Motor(mesa([[1, 0, 0], [2, ...lugar(60, 0)], [3, ...lugar(-60, 5e-8)]], SEM_PANO), SEM_PANO);
    motor.aplicarGolpe(0, { vx: v, vz: 0, wx: 0, wy: 0, wz: 0, velocidadeTaco: 0, miscue: false });
    motor.avancar(0.001);
    expect(doTipo(motor.eventos, 'bola-bola')).toHaveLength(0);
    expect(Math.hypot(motor.bolas[1]!.vx, motor.bolas[1]!.vz)).toBeGreaterThan(0.0003);
    expect(Math.hypot(motor.bolas[2]!.vx, motor.bolas[2]!.vz)).toBeCloseTo(Math.hypot(motor.bolas[1]!.vx, motor.bolas[1]!.vz), 9);
  });

  it('o limiar só tira eventos: com velocidadeMinimaChoque = 0 a trajetória gravada é a mesma', () => {
    const inicio = mesaInicial(QUINZE.slice(1), C, criarRng(33));
    const sem = simularTacada(inicio, tacada(0, C.velocidadeMaxTaco), criarRng(33), { ...C, velocidadeMinimaChoque: 0 });
    const com = simularTacada(inicio, tacada(0, C.velocidadeMaxTaco), criarRng(33));
    expect(com.gravacao.posicoes).toEqual(sem.gravacao.posicoes);
    const acima = (e: EventoTacada) => !('velocidade' in e) || e.tipo === 'taco-bola' || e.velocidade >= C.velocidadeMinimaChoque;
    expect(com.eventos).toEqual(sem.eventos.filter(acima));
  });

  it('bola que chega à tabela abaixo do limiar volta sem evento e sem entrar na tabela', () => {
    // Raspão: 5 mm/s ao longo da tabela (acima de velocidadeParada) e metade do limiar contra ela.
    const hz = MESA_BAR.largura / 2;
    const rc = distanciaContatoTabela(C.bola.raio, MESA_BAR);
    const vn = C.velocidadeMinimaChoque / 2;
    const vt = 0.005;
    const motor = new Motor(mesa([[1, 0.3, -hz + rc]]), C);
    motor.aplicarGolpe(0, { vx: vt, vz: -vn, wx: -vn / BOLA.raio, wy: 0, wz: -vt / BOLA.raio, velocidadeTaco: 0, miscue: false });
    motor.avancar(1e-5);
    expect(doTipo(motor.eventos, 'bola-tabela')).toHaveLength(0);
    expect(motor.bolas[0]!.vz).toBeGreaterThan(0);
  });
});

describe('tabela', () => {
  const hz = MESA_BAR.largura / 2;

  /** Ângulo de saída (a partir da normal +Z) menos o de entrada, pela velocidade logo antes e logo depois da batida. */
  const desvioNaTabela = (lateral: number, config: ConfigFisica = C) => {
    const motor = new Motor(mesa([[ID_BOLAO, 0, 0]]), config);
    motor.aplicarGolpe(0, golpeDoTaco(tacada(-Math.PI / 4, 1.5, { lateral, vertical: 0 }), config.bolao, config, criarRng(1)));
    const b = motor.bolas[0]!;
    let antes = { x: b.vx, z: b.vz };
    while (motor.eventos.length === 0) {
      antes = { x: b.vx, z: b.vz };
      motor.avancar(C.passo);
    }
    return graus(Math.atan2(b.vx, b.vz)) - graus(Math.atan2(antes.x, -antes.z));
  };

  it('bolão sem giro batendo de frente volta com v·[(1+e)·cos²θ + (2/7)·sen²θ − 1] e encosta a R·cos θ do nariz (Han 2005)', () => {
    const R = C.bolao.raio;
    const sen = MESA_BAR.alturaTabela / R - 1;
    const cos2 = 1 - sen * sen;
    const rc = distanciaContatoTabela(R, MESA_BAR);
    const motor = new Motor(mesa([[ID_BOLAO, 0.3, -hz + rc + 0.001]]), C);
    motor.aplicarGolpe(0, golpeDoTaco(tacada(-Math.PI / 2, 1), C.bolao, C, criarRng(1)));
    const b = motor.bolas[0]!;
    let antes = 0;
    while (motor.eventos.length === 0) {
      antes = -b.vz;
      motor.avancar(C.passo / 64);
    }
    const batida = doTipo(motor.eventos, 'bola-tabela')[0]!;
    expect(b.pz - b.vz * (motor.t - batida.t) + hz).toBeCloseTo(rc, 4);
    // Aderência no contato: o atrito zera o escorregamento (2/7·s < μ·Pn).
    expect(b.vz / antes).toBeCloseTo((1 + C.restituicaoBolaTabela) * cos2 + (2 / 7) * (1 - cos2) - 1, 3);
  });

  it('bola a ~10 m/s não entra na tabela (conferido a cada passo)', () => {
    const rc = distanciaContatoTabela(C.bolao.raio, MESA_BAR);
    const motor = new Motor(mesa([[ID_BOLAO, 0.3, 0]]), C);
    motor.aplicarGolpe(0, golpeDoTaco(tacada(-Math.PI / 2, C.velocidadeMaxTaco), C.bolao, C, criarRng(1)));
    for (let k = 0; k < 512; k++) {
      motor.avancar(C.passo);
      expect(Math.abs(motor.bolas[0]!.pz)).toBeLessThanOrEqual(hz - rc + 1e-5);
    }
    expect(doTipo(motor.eventos, 'bola-tabela').length).toBeGreaterThan(1);
    expect(doTipo(motor.eventos, 'fora-da-mesa')).toHaveLength(0);
  });

  it('batida registra a tabela e a velocidade normal', () => {
    const r = simularTacada(mesa([[ID_BOLAO, 0.3, 0]]), tacada(-Math.PI / 2, 1), criarRng(1));
    const batida = doTipo(r.eventos, 'bola-tabela')[0]!;
    expect(tabelas(MESA_BAR)[batida.tabela]!.normal).toEqual({ x: 0, z: 1 });
    expect(batida.velocidade).toBeGreaterThan(0.5);
    expect(final(r.estadoFinal, ID_BOLAO).posicao.z).toBeGreaterThan(-hz);
  });

  it('o efeito lateral muda o ângulo de saída: a favor abre, contra fecha', () => {
    // Indo para +X, efeito à direita (ωy > 0) é "a favor" nesta tabela. O contra fecha pouco: o atrito da tabela já satura sem efeito.
    // 0,4R no contato (sem o fatorEfeitoLateral): o modelo da tabela, não o taco.
    const inteiro: ConfigFisica = { ...C, fatorEfeitoLateral: 1 };
    const favor = desvioNaTabela(0.4, inteiro);
    const neutro = desvioNaTabela(0, inteiro);
    const contra = desvioNaTabela(-0.4, inteiro);
    expect(favor).toBeGreaterThan(neutro + 5);
    expect(contra).toBeLessThan(neutro);
    expect(favor - contra).toBeGreaterThan(8);
  });

  it('com o efeito lateral útil do padrão (× fatorEfeitoLateral) a favor ainda abre, mas menos', () => {
    const inteiro: ConfigFisica = { ...C, fatorEfeitoLateral: 1 };
    const neutro = desvioNaTabela(0);
    expect(desvioNaTabela(0, inteiro)).toBeCloseTo(neutro, 12);
    const abre = desvioNaTabela(C.limiteEfeitoComGiz) - neutro;
    expect(abre).toBeGreaterThan(5);
    expect(abre).toBeLessThan(desvioNaTabela(C.limiteEfeitoComGiz, inteiro) - neutro);
    expect(desvioNaTabela(-C.limiteEfeitoComGiz)).toBeLessThan(neutro);
  });

  it('a tabela devolve menos energia do que recebe', () => {
    // Rolar ida e volta (3·hz) pede v² = 2·μr·g·3·hz; o dobro cobre o deslizar e o que a tabela tira (~0,78).
    const v = 2 * Math.sqrt(2 * C.atritoRolamento * C.gravidade * 3 * hz);
    const r = simularTacada(mesa([[ID_BOLAO, 0.3, 0]]), tacada(-Math.PI / 2, v), criarRng(1));
    const batidas = doTipo(r.eventos, 'bola-tabela');
    expect(batidas.length).toBeGreaterThanOrEqual(2);
    const [ida, volta] = batidas;
    expect(volta!.velocidade).toBeLessThan(ida!.velocidade);
  });
});

describe('caçapas', () => {
  const hx = MESA_BAR.comprimento / 2;
  const hz = MESA_BAR.largura / 2;

  it('bola na direção da boca do meio cai, e some da gravação a partir do quadro da queda', () => {
    const r = simularTacada(mesa([[ID_BOLAO, 0, -0.2]]), tacada(-Math.PI / 2, 1), criarRng(1));
    const queda = doTipo(r.eventos, 'cacapa')[0]!;
    expect(queda).toMatchObject({ bola: ID_BOLAO, cacapa: 'meio-z-' });
    expect(final(r.estadoFinal, ID_BOLAO).naMesa).toBe(false);
    const gr = r.gravacao;
    for (let q = 0; q < gr.quadros; q++) {
      expect(gr.naMesa[q * gr.ids.length]).toBe(q / gr.frequencia < queda.t ? 1 : 0);
    }
  });

  it('bola na diagonal do canto cai', () => {
    const r = simularTacada(mesa([[ID_BOLAO, hx - 0.3, hz - 0.3]]), tacada(Math.PI / 4, 1), criarRng(1));
    expect(doTipo(r.eventos, 'cacapa')[0]).toMatchObject({ bola: ID_BOLAO, cacapa: 'canto-x+z+' });
  });

  it('reta no meio da boca do meio cai, também um pouco fora do centro, sem tocar a tabela', () => {
    // As faces ficam a bocaMeio/2 do centro: com 15 mm de desvio o bolão ainda passa a 32,5 mm delas (> R·cos θ).
    for (const x of [0, 0.015, -0.015]) {
      const r = simularTacada(mesa([[ID_BOLAO, x, -0.2]]), tacada(-Math.PI / 2, 0.6), criarRng(1));
      expect(doTipo(r.eventos, 'cacapa')).toEqual([expect.objectContaining({ bola: ID_BOLAO, cacapa: 'meio-z-' })]);
      expect(doTipo(r.eventos, 'bola-tabela')).toHaveLength(0);
    }
  });

  it('rasante a 20° na boca do meio bate na ponta de longe e não cai', () => {
    // Reta passando a 19 mm do nariz em x = 0, descendo 20° para z−: passa a 1,6 mm da quina de longe (x = +bocaMeio/2).
    const angulo = (-20 * Math.PI) / 180;
    const passa = { x: 0, z: -hz + 0.019 };
    const recuo = 0.3;
    const inicio = mesa([[ID_BOLAO, passa.x - recuo * Math.cos(angulo), passa.z - recuo * Math.sin(angulo)]]);
    const r = simularTacada(inicio, tacada(angulo, 0.9), criarRng(1));
    expect(doTipo(r.eventos, 'cacapa')).toHaveLength(0);
    const primeira = doTipo(r.eventos, 'bola-tabela')[0]!;
    expect(primeira).toMatchObject({ bola: ID_BOLAO, tabela: 1 });
    expect(final(r.estadoFinal, ID_BOLAO).naMesa).toBe(true);
  });

  it('bola que pega a ponta da boca de frente volta para a mesa', () => {
    // Centro a 5 mm da quina, para dentro da boca: a bola cobre 22 mm da tabela e bate no arredondado quase de frente.
    const quina = MESA_BAR.bocaMeio / 2;
    const r = simularTacada(mesa([[ID_BOLAO, quina - 0.005, -0.2]]), tacada(-Math.PI / 2, 0.6), criarRng(1));
    expect(doTipo(r.eventos, 'cacapa')).toHaveLength(0);
    expect(doTipo(r.eventos, 'bola-tabela')[0]).toMatchObject({ bola: ID_BOLAO, tabela: 1 });
    expect(final(r.estadoFinal, ID_BOLAO).naMesa).toBe(true);
  });

  /** Uma boca: o ponto médio entre as quinas e o eixo da caçapa, para fora. */
  interface Boca {
    readonly id: string;
    readonly largura: number;
    readonly meio: Ponto2;
    readonly eixo: Ponto2;
  }
  const s = Math.SQRT1_2;
  const BOCAS: readonly Boca[] = [
    { id: 'canto-x+z+', largura: MESA_BAR.bocaCanto, meio: { x: hx - (MESA_BAR.bocaCanto / 2) * s, z: hz - (MESA_BAR.bocaCanto / 2) * s }, eixo: { x: s, z: s } },
    { id: 'meio-z+', largura: MESA_BAR.bocaMeio, meio: { x: 0, z: hz }, eixo: { x: 0, z: 1 } },
  ];

  /**
   * A bola 1 rolando a `v`, mirada no ponto médio da boca deslocado `d` para a esquerda de quem
   * anda, na direção do eixo girada de `phi` (no canto, para a tabela comprida); começa 0,3 m antes.
   * Para na primeira queda, na bola fora da mesa ou depois de `limite` segundos. `null` se ela não cabe no ponto de partida.
   */
  function naBoca(boca: Boca, phi: number, v: number, d: number, verificar?: (motor: Motor) => void, limite = 3): EventoTacada[] | null {
    const dir = { x: boca.eixo.x * Math.cos(phi) + boca.eixo.z * Math.sin(phi), z: boca.eixo.z * Math.cos(phi) - boca.eixo.x * Math.sin(phi) };
    const inicio = { x: boca.meio.x - d * dir.z - 0.3 * dir.x, z: boca.meio.z + d * dir.x - 0.3 * dir.z };
    const R = C.bola.raio;
    const rc = distanciaContatoTabela(R, MESA_BAR);
    if (Math.abs(inicio.x) > hx - rc || Math.abs(inicio.z) > hz - rc) return null;
    const motor = new Motor(mesa([[1, inicio.x, inicio.z]]), C);
    motor.aplicarGolpe(0, { vx: v * dir.x, vz: v * dir.z, wx: (v * dir.z) / R, wy: 0, wz: (-v * dir.x) / R, velocidadeTaco: 0, miscue: false });
    while (motor.t < limite && !motor.todasParadas()) {
      motor.avancar(C.passo);
      verificar?.(motor);
      if (motor.eventos.some((e) => e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa')) break;
    }
    return motor.eventos;
  }

  it.each(BOCAS.flatMap((boca) => [0, 15, 30, 45].map((graus) => [boca.id, graus, boca] as const)))(
    'bola mirada dentro da boca (%s, %i°) cai em vez de voltar, a 1, 2 e 4 m/s',
    (_, graus, boca) => {
      // "Dentro da boca": vista de onde vem, a bola inteira cabe entre as quinas, |d| ≤ boca·cos φ / 2 − R.
      const phi = (graus * Math.PI) / 180;
      const folga = (boca.largura * Math.cos(phi)) / 2 - C.bola.raio;
      const desvios: number[] = [];
      for (let d = -Math.floor(folga * 1000); d <= folga * 1000; d++) desvios.push(d / 1000);
      expect(desvios.length).toBeGreaterThanOrEqual(7);
      for (const v of [1, 2, 4]) {
        for (const d of desvios) {
          const eventos = naBoca(boca, phi, v, d);
          expect(eventos, `d = ${d * 1000} mm a ${v} m/s parte de dentro da mesa`).not.toBeNull();
          const queda = eventos!.find((e) => e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa');
          expect(queda, `d = ${d * 1000} mm a ${v} m/s`).toMatchObject({ tipo: 'cacapa', bola: 1, cacapa: boca.id });
        }
      }
    },
  );

  it('a face de longe da quina guia para dentro: correndo junto à tabela, a bola bate nela e cai', () => {
    // No canto a 45°, paralela à tabela comprida e a 40 mm dela: passa da quina de perto e pega a face da outra (cabeceira +X, tabela 5).
    for (const v of [1, 2, 4]) {
      const eventos = naBoca(BOCAS[0]!, Math.PI / 4, v, -0.01)!;
      const batida = eventos.findIndex((e) => e.tipo === 'bola-tabela');
      const queda = eventos.findIndex((e) => e.tipo === 'cacapa');
      expect(eventos[batida]).toMatchObject({ tipo: 'bola-tabela', bola: 1, tabela: 5 });
      expect(queda).toBeGreaterThan(batida);
      expect(eventos[queda]).toMatchObject({ cacapa: 'canto-x+z+' });
    }
  });

  it('a 10 m/s contra as bocas e as quinas, nenhuma bola entra na tabela (conferido a cada passo)', () => {
    const bocas = cacapas(MESA_BAR).map((c): Boca => {
      const meio = PONTAS.filter((p) => p.cacapa === c.id).map((p) => p.quina);
      const centro = { x: (meio[0]!.x + meio[1]!.x) / 2, z: (meio[0]!.z + meio[1]!.z) / 2 };
      const n = Math.hypot(c.centro.x - centro.x, c.centro.z - centro.z);
      return { id: c.id, largura: 0, meio: centro, eixo: { x: (c.centro.x - centro.x) / n, z: (c.centro.z - centro.z) / n } };
    });
    let tiros = 0;
    let pior = -Infinity;
    for (const boca of bocas) {
      for (const graus of [-40, -20, 0, 20, 40]) {
        for (let d = -0.044; d <= 0.044 + 1e-9; d += 0.004) {
          const eventos = naBoca(boca, (graus * Math.PI) / 180, 10, d, (motor) => (pior = Math.max(pior, piorInvasao(motor))), 0.5);
          if (eventos === null) continue;
          tiros++;
          expect(doTipo(eventos, 'fora-da-mesa')).toHaveLength(0);
          for (const e of doTipo(eventos, 'bola-tabela')) expect(e.tabela, 'face e ponta contam como a tabela delas').toBeLessThan(6);
        }
      }
    }
    expect(tiros).toBeGreaterThan(500);
    expect(pior).toBeLessThanOrEqual(1e-5);
  });
});

describe('quinas das caçapas: ponta arredondada, nariz encurtado e face', () => {
  const hz = MESA_BAR.largura / 2;
  const rc = distanciaContatoTabela(BOLA.raio, MESA_BAR);

  /** Lança a bola 1 de `inicio` a `v` (m/s, vetor), rolando, em passos de 1/64 do passo, até a primeira batida; devolve onde ela estava ao bater e o motor. */
  function primeiraBatida(inicio: Ponto2, v: Ponto2) {
    const motor = new Motor(mesa([[1, inicio.x, inicio.z]]), C);
    motor.aplicarGolpe(0, { vx: v.x, vz: v.z, wx: v.z / BOLA.raio, wy: 0, wz: -v.x / BOLA.raio, velocidadeTaco: 0, miscue: false });
    const b = motor.bolas[0]!;
    while (motor.eventos.length === 0 && motor.t < 2) motor.avancar(C.passo / 64);
    const batida = motor.eventos[0]!;
    const contato = { x: b.px - b.vx * (motor.t - batida.t), z: b.pz - b.vz * (motor.t - batida.t) };
    return { motor, batida, contato, b };
  }

  it.each(['canto-x-z-', 'meio-z-'])('de frente na ponta (%s), a bola encosta a R·cos θ + raioQuina do centro do arco e volta pela bissetriz', (id) => {
    for (const ponta of PONTAS.filter((q) => q.cacapa === id)) {
      // A bissetriz entre o nariz e a face aponta da quina para o centro do arco.
      const bx = ponta.centro.x - ponta.quina.x;
      const bz = ponta.centro.z - ponta.quina.z;
      const n = Math.hypot(bx, bz);
      const longe = rc + ponta.raio + 0.1;
      const { batida, contato, b } = primeiraBatida(
        { x: ponta.centro.x - (bx / n) * longe, z: ponta.centro.z - (bz / n) * longe },
        { x: (bx / n) * 0.8, z: (bz / n) * 0.8 },
      );
      expect(batida).toMatchObject({ tipo: 'bola-tabela', bola: 1, tabela: ponta.tabela });
      expect(Math.hypot(contato.x - ponta.centro.x, contato.z - ponta.centro.z)).toBeCloseTo(rc + ponta.raio, 4);
      // Volta pela mesma reta: a normal do arco é a bissetriz.
      expect(Math.abs(b.vx * bz - b.vz * bx) / (n * Math.hypot(b.vx, b.vz))).toBeLessThan(1e-6);
      expect(b.vx * bx + b.vz * bz).toBeLessThan(0);
    }
  });

  it('o nariz reto acaba antes da quina: a bola que bate no fim dele pega o arredondado e é desviada para a caçapa', () => {
    // Tabela 1 (z−, do meio para +X): a quina fica em x = bocaMeio/2 e o arredondado começa raioQuinaMeio depois.
    const ponta = PONTAS[2]!;
    expect(ponta).toMatchObject({ tabela: 1, cacapa: 'meio-z-' });
    const x = (ponta.quina.x + ponta.noNariz.x) / 2;
    const { batida, contato, b } = primeiraBatida({ x, z: -hz + 0.2 }, { x: 0, z: -1 });
    expect(batida).toMatchObject({ tipo: 'bola-tabela', tabela: 1 });
    // Encosta no arco, um pouco depois de onde encostaria no nariz reto.
    expect(Math.hypot(contato.x - ponta.centro.x, contato.z - ponta.centro.z)).toBeCloseTo(rc + ponta.raio, 4);
    expect(contato.z).toBeLessThan(-hz + rc - 1e-5);
    // Sai puxada para a boca (−X), não reta de volta.
    expect(b.vx).toBeLessThan(-0.05);
  });

  it('a face da quina é tabela: bola entre as faces indo contra uma delas bate a R·cos θ dela e cai', () => {
    // Bola já na garganta do meio z+, a 4 mm do círculo de queda, indo para a face de −X (tabela 2) e um pouco para o fundo: só a face a segura.
    const funda = hz + MESA_BAR.fundoMeio - 0.004;
    const { motor, batida, contato } = primeiraBatida({ x: -0.015, z: funda }, { x: -1, z: 0.05 });
    expect(batida).toMatchObject({ tipo: 'bola-tabela', bola: 1, tabela: 2 });
    expect(contato.x).toBeCloseTo(-MESA_BAR.bocaMeio / 2 + rc, 4);
    while (motor.t < 1 && !motor.eventos.some((e) => e.tipo === 'cacapa')) motor.avancar(C.passo);
    expect(doTipo(motor.eventos, 'cacapa')).toEqual([expect.objectContaining({ bola: 1, cacapa: 'meio-z+' })]);
  });
});

describe('quebra com força máxima', () => {
  const r = quebra();
  const gr = r.gravacao;

  it('nenhuma bola atravessa bola, tabela ou quina nem sai da mesa (conferido a cada passo pelo Motor; 15 e 13 bolas)', () => {
    for (const [ids, semente] of [QUINZE, TREZE].flatMap((ids) => [undefined, 1, 2, 3].map((semente) => [ids, semente] as const))) {
      const motor = new Motor(mesaInicial(ids, C, semente === undefined ? undefined : criarRng(semente)), C);
      motor.aplicarGolpe(0, golpeDoTaco(tacada(0, C.velocidadeMaxTaco), C.bolao, C, criarRng(1)));
      let pior = -Infinity;
      for (let k = 0; k < 512 * 30 && !motor.todasParadas(); k++) {
        motor.avancar(C.passo);
        pior = Math.max(pior, piorInvasao(motor));
      }
      expect(pior).toBeLessThanOrEqual(1e-5);
      expect(motor.todasParadas()).toBe(true);
      expect(doTipo(motor.eventos, 'fora-da-mesa')).toHaveLength(0);
    }
    expect(doTipo(r.eventos, 'fora-da-mesa')).toHaveLength(0);
  });

  it('espalha o triângulo, com o primeiro choque no bolão', () => {
    expect(doTipo(r.eventos, 'bola-bola')[0]).toMatchObject({ a: ID_BOLAO, b: 1 });
    const mexeram = r.estadoFinal.bolas.filter((b) => b.id !== ID_BOLAO && b.naMesa).filter((b) => {
      const k = gr.ids.indexOf(b.id) * 3;
      return Math.hypot(b.posicao.x - gr.posicoes[k]!, b.posicao.z - gr.posicoes[k + 2]!) > 0.05;
    });
    expect(mexeram.length + doTipo(r.eventos, 'cacapa').length).toBeGreaterThanOrEqual(10);
  });

  it('a energia cinética nunca cresce depois do taco', () => {
    const motor = new Motor(mesaInicial(QUINZE, C), C);
    motor.aplicarGolpe(0, golpeDoTaco(tacada(0, C.velocidadeMaxTaco), C.bolao, C, criarRng(1)));
    let anterior = motor.energiaCinetica();
    for (let passo = 0; passo < 512 * 20 && !motor.todasParadas(); passo++) {
      motor.avancar(C.passo);
      const agora = motor.energiaCinetica();
      expect(agora).toBeLessThanOrEqual(anterior + 1e-12);
      anterior = agora;
    }
    expect(motor.todasParadas()).toBe(true);
  });
});

describe('simularTacada', () => {
  it('mesma semente, mesmo resultado; sementes diferentes podem dar outro miscue', () => {
    const efeito = { lateral: C.limiteEfeitoSemGiz + 0.5 * C.faixaMiscue, vertical: 0 };
    const a = quebra(7, efeito, 0);
    const b = quebra(7, efeito, 0);
    expect(b.eventos).toEqual(a.eventos);
    expect(b.gravacao.posicoes).toEqual(a.gravacao.posicoes);
    expect(b.estadoFinal).toEqual(a.estadoFinal);
    const miscues = new Set(Array.from({ length: 12 }, (_, s) => quebra(s, efeito, 0).eventos[0]).map((e) => e?.tipo === 'taco-bola' && e.miscue));
    expect(miscues).toEqual(new Set([true, false]));
  });

  it('a gravação fecha com o estado final e o evento parou', () => {
    const r = quebra();
    const gr = r.gravacao;
    expect(gr.frequencia).toBe(C.frequenciaGravacao);
    expect(gr.quadros).toBe(Math.ceil(gr.duracao * gr.frequencia) + 1);
    expect(gr.posicoes).toHaveLength(gr.quadros * gr.ids.length * 3);
    expect(gr.orientacoes).toHaveLength(gr.quadros * gr.ids.length * 4);
    expect(gr.naMesa).toHaveLength(gr.quadros * gr.ids.length);
    expect(gr.eventos).toEqual(r.eventos);
    expect(Object.isFrozen(gr.eventos)).toBe(true);
    expect(Object.isFrozen(r.eventos)).toBe(true);
    expect(r.eventos[0]).toMatchObject({ tipo: 'taco-bola', t: 0, bola: ID_BOLAO, velocidade: C.velocidadeMaxTaco });
    expect(r.eventos.at(-1)).toEqual({ tipo: 'parou', t: gr.duracao });
    expect(doTipo(r.eventos, 'parou')).toHaveLength(1);
    for (let k = 1; k < r.eventos.length; k++) expect(r.eventos[k]!.t).toBeGreaterThanOrEqual(r.eventos[k - 1]!.t);
    for (const b of r.estadoFinal.bolas) {
      const p = posicao(gr, gr.quadros - 1, b.id);
      expect(p.x).toBeCloseTo(b.posicao.x, 5);
      expect(p.z).toBeCloseTo(b.posicao.z, 5);
      expect(b.movimento).toBe('parada');
      expect(b.velocidade).toEqual({ x: 0, y: 0, z: 0 });
      const k = (gr.quadros - 1) * 4 * gr.ids.length + gr.ids.indexOf(b.id) * 4;
      expect(gr.orientacoes[k + 3]).toBeCloseTo(b.orientacao.w, 5);
    }
  });

  it('não muta o estado de entrada', () => {
    const inicio = mesaInicial([1, 2, 3], C);
    const copia: unknown = JSON.parse(JSON.stringify(inicio));
    simularTacada(inicio, tacada(0, 3), criarRng(1));
    expect(inicio).toEqual(copia);
  });

  it('corta em duracaoMaxima, para tudo e fecha com parou', () => {
    const curta: ConfigFisica = { ...C, duracaoMaxima: 0.5 };
    const r = simularTacada(mesa([[ID_BOLAO, -0.5, 0]]), tacada(0, 2), criarRng(1), curta);
    expect(r.gravacao.duracao).toBe(0.5);
    expect(r.eventos.at(-1)).toEqual({ tipo: 'parou', t: 0.5 });
    expect(final(r.estadoFinal, ID_BOLAO).velocidade).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('a orientação integrada de ω acompanha o rolamento: Δs/R por quadro, em torno de ŷ × direção', () => {
    const r = simularTacada(mesa([[ID_BOLAO, -0.5, 0]]), tacada(0, 0.4, { lateral: 0, vertical: 0.4 }), criarRng(1));
    expect(doTipo(r.eventos, 'bola-tabela')).toHaveLength(0);
    const gr = r.gravacao;
    const R = C.bolao.raio;
    const q = (k: number) => [0, 1, 2, 3].map((c) => gr.orientacoes[k * 4 + c]!) as [number, number, number, number];
    for (let k = 0; k + 1 < gr.quadros; k++) {
      const ds = Math.hypot(posicao(gr, k + 1, ID_BOLAO).x - posicao(gr, k, ID_BOLAO).x, posicao(gr, k + 1, ID_BOLAO).z - posicao(gr, k, ID_BOLAO).z);
      const [ax, ay, az, aw] = q(k);
      const [bx, by, bz, bw] = q(k + 1);
      // b · a⁻¹
      const x = -bw * ax + bx * aw - by * az + bz * ay;
      const y = -bw * ay + bx * az + by * aw - bz * ax;
      const z = -bw * az - bx * ay + by * ax + bz * aw;
      const w = bw * aw + bx * ax + by * ay + bz * az;
      const sinal = Math.sign(w) || 1;
      expect(2 * Math.atan2(Math.hypot(x, y, z), sinal * w)).toBeCloseTo(ds / R, 3);
      if (ds > 1e-3) expect((sinal * z) / Math.hypot(x, y, z)).toBeCloseTo(-1, 3);
    }
  });

  it('bola que escapa da mesa sem caçapa vira fora-da-mesa', () => {
    const r = simularTacada(mesa([[ID_BOLAO, MESA_BAR.comprimento / 2 + 0.1, 0]]), tacada(0, 1), criarRng(1));
    expect(doTipo(r.eventos, 'fora-da-mesa')).toEqual([{ tipo: 'fora-da-mesa', t: expect.any(Number), bola: ID_BOLAO }]);
    expect(final(r.estadoFinal, ID_BOLAO).naMesa).toBe(false);
  });

  it('recusa mesa sem bolão', () => {
    expect(() => simularTacada(mesa([[1, 0, 0]]), tacada(0, 1), criarRng(1))).toThrow(/bolão/);
  });
});
