import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO as C } from './config';
import { bolaParada } from './lugares';
import { MESA_BAR, cacapas, distanciaContatoTabela, pontasTabela, type Cacapa, type Ponto2 } from './medidas';
import { Motor } from './motor';
import { criarRng } from './rng';
import { simularTacada } from './simulacao';
import { ID_BOLAO, type EstadoMesa, type EventoTacada } from './tipos';

// L15 — caçapa funda: a bola só cai depois que o centro passa `fundo` da linha da boca
// (cerca de 1 diâmetro no canto, ¾ no meio); a garganta é guiada pelas faces das quinas.

const R = C.bola.raio;
const rc = distanciaContatoTabela(R, MESA_BAR);
/** Desaceleração da bola rolando (m/s²). */
const A_ROLANDO = C.atritoRolamento * C.gravidade;
const BOCAS = cacapas(MESA_BAR);
const canto = BOCAS.find((c) => c.id === 'canto-x+z+')!;
const meio = BOCAS.find((c) => c.id === 'meio-z+')!;
const PONTAS = pontasTabela(MESA_BAR);

/** Quanto o centro passou da linha da boca, ao longo do eixo (> 0 = dentro da garganta). */
const profundidade = (p: Ponto2, c: Cacapa) => (p.x - c.boca.x) * c.eixo.x + (p.z - c.boca.z) * c.eixo.z;
/** Desvio do centro para o lado do eixo (+ = à esquerda de quem entra). */
const lateral = (p: Ponto2, c: Cacapa) => -(p.x - c.boca.x) * c.eixo.z + (p.z - c.boca.z) * c.eixo.x;
const doTipo = <T extends EventoTacada['tipo']>(eventos: readonly EventoTacada[], tipo: T) =>
  eventos.filter((e): e is Extract<EventoTacada, { tipo: T }> => e.tipo === tipo);

interface Lance {
  readonly eventos: EventoTacada[];
  readonly motor: Motor;
  /** Maior profundidade que o centro atingiu enquanto a bola estava na mesa. */
  readonly fundoMaximo: number;
  /** Profundidade do centro no passo em que a bola caiu (ou no fim, se não caiu). */
  readonly fundoNaQueda: number;
}

/**
 * A bola 1 rolando para a boca `c`, no eixo girado de `phi` e deslocada `d` para a esquerda de quem entra, de
 * 0,3 m antes da linha da boca; `v` é a velocidade ao cruzar a linha (só o atrito de rolamento na ida).
 * Para na queda, quando tudo para ou passados `limite` s.
 */
function lancar(c: Cacapa, { phi = 0, v, d = 0, limite = 6 }: { phi?: number; v: number; d?: number; limite?: number }): Lance {
  const dir = { x: c.eixo.x * Math.cos(phi) + c.eixo.z * Math.sin(phi), z: c.eixo.z * Math.cos(phi) - c.eixo.x * Math.sin(phi) };
  const alvo = { x: c.boca.x - d * dir.z, z: c.boca.z + d * dir.x };
  const inicio = { x: alvo.x - 0.3 * dir.x, z: alvo.z - 0.3 * dir.z };
  const v0 = Math.sqrt(v * v + 2 * A_ROLANDO * 0.3);
  const motor = new Motor({ bolas: [bolaParada(1, inicio)] }, C);
  motor.aplicarGolpe(0, { vx: v0 * dir.x, vz: v0 * dir.z, wx: (v0 * dir.z) / R, wy: 0, wz: (-v0 * dir.x) / R, velocidadeTaco: 0, miscue: false });
  const b = motor.bolas[0]!;
  let fundoMaximo = -Infinity;
  while (motor.t < limite && !motor.todasParadas()) {
    motor.avancar(C.passo);
    if (b.naMesa) fundoMaximo = Math.max(fundoMaximo, profundidade({ x: b.px, z: b.pz }, c));
    if (motor.eventos.some((e) => e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa')) break;
  }
  return { eventos: motor.eventos, motor, fundoMaximo, fundoNaQueda: profundidade({ x: b.px, z: b.pz }, c) };
}

describe('caçapa funda: bola reta cai, só depois de passar do fundo', () => {
  const CASOS = [
    [canto, 'canto'],
    [meio, 'meio'],
  ] as const;

  it.each(CASOS.flatMap(([c, nome]) => [0.25, 1, 2.5, 6].map((v) => [nome, v, c] as const)))(
    'no %s a %f m/s, reta e também um pouco fora do eixo, cai e o centro estava a `fundo` ou mais da linha da boca',
    (_, v, c) => {
      for (const d of [0, 0.008, -0.008, 0.014, -0.014]) {
        const { eventos, fundoNaQueda, fundoMaximo } = lancar(c, { v, d });
        expect(eventos.filter((e) => e.tipo === 'cacapa'), `d = ${d * 1000} mm`).toEqual([expect.objectContaining({ bola: 1, cacapa: c.id })]);
        // O centro passou do fundo antes de cair; a queda é detectada dentro do passo, daí 1 mm de tolerância.
        expect(fundoNaQueda, `d = ${d * 1000} mm`).toBeGreaterThanOrEqual(c.fundo - 1e-3);
        // Quem cai a v m/s no passo de 1/512 s não passa muito do círculo.
        expect(fundoMaximo).toBeLessThan(c.fundo + c.raio);
      }
    },
  );

  it('a bola passa da linha da boca e continua na mesa até chegar ao círculo: antes de `fundo`, nenhum evento de caçapa', () => {
    for (const [c] of CASOS) {
      const motor = new Motor({ bolas: [bolaParada(1, { x: c.boca.x - c.eixo.x * 0.3, z: c.boca.z - c.eixo.z * 0.3 })] }, C);
      motor.aplicarGolpe(0, { vx: c.eixo.x * 3, vz: c.eixo.z * 3, wx: (3 * c.eixo.z) / R, wy: 0, wz: (-3 * c.eixo.x) / R, velocidadeTaco: 0, miscue: false });
      const b = motor.bolas[0]!;
      let passouDaBoca = false;
      while (motor.t < 2 && b.naMesa) {
        motor.avancar(C.passo);
        const prof = profundidade({ x: b.px, z: b.pz }, c);
        if (b.naMesa && prof > 0) passouDaBoca = true;
        // Enquanto está na mesa, o centro nunca passou do fundo.
        if (b.naMesa) expect(prof).toBeLessThan(c.fundo + 1e-9);
      }
      expect(passouDaBoca, c.id).toBe(true);
      expect(b.naMesa, c.id).toBe(false);
    }
  });
});

describe('caçapa funda: bola que não chega à linha de queda fica na mesa', () => {
  it.each([
    ['canto', canto],
    ['meio', meio],
  ] as const)('bola parada na garganta, antes da linha (%s), não cai', (_nome, c) => {
    for (const fracao of [0.1, 0.5, 0.95]) {
      const p = { x: c.boca.x + c.eixo.x * c.fundo * fracao, z: c.boca.z + c.eixo.z * c.fundo * fracao };
      const motor = new Motor({ bolas: [bolaParada(1, p)] }, C);
      for (let k = 0; k < 512 * 2; k++) motor.avancar(C.passo);
      expect(motor.bolas[0]!.naMesa, `fração ${fracao}`).toBe(true);
      expect(motor.eventos).toEqual([]);
    }
  });

  it.each([
    ['canto', canto],
    ['meio', meio],
  ] as const)('bola que rola devagar para na garganta (%s): passa da linha da boca, não chega ao fundo e fica na mesa', (_nome, c) => {
    // v tal que v²/(2·a) = metade do fundo: para a meio caminho.
    const v = Math.sqrt(2 * A_ROLANDO * (c.fundo / 2));
    const { eventos, motor } = lancar(c, { v, limite: 8 });
    const b = motor.bolas[0]!;
    expect(doTipo(eventos, 'cacapa')).toHaveLength(0);
    expect(b.naMesa).toBe(true);
    expect(b.movimento()).toBe('parada');
    const prof = profundidade({ x: b.px, z: b.pz }, c);
    expect(prof).toBeGreaterThan(0.2 * c.fundo);
    expect(prof).toBeLessThan(0.8 * c.fundo);
    // Parou no eixo: não foi desviada.
    expect(Math.abs(lateral({ x: b.px, z: b.pz }, c))).toBeLessThan(1e-6);
  });

  it('um fio de velocidade a mais que o necessário para chegar ao círculo, e ela cai', () => {
    for (const c of [canto, meio]) {
      const vMinimo = Math.sqrt(2 * A_ROLANDO * c.fundo);
      expect(lancar(c, { v: vMinimo * 0.97 }).eventos.filter((e) => e.tipo === 'cacapa')).toHaveLength(0);
      expect(lancar(c, { v: vMinimo * 1.05 }).eventos.filter((e) => e.tipo === 'cacapa')).toHaveLength(1);
    }
  });

  it('a bola parada na garganta é uma bola da mesa como as outras: a tacada em outra bola não a derruba', () => {
    const p = { x: meio.boca.x + meio.eixo.x * meio.fundo * 0.6, z: meio.boca.z + meio.eixo.z * meio.fundo * 0.6 };
    const estado: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0 }), bolaParada(7, p)] };
    const r = simularTacada(estado, { angulo: 0, velocidadeTaco: 1.5, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, criarRng(3));
    expect(r.estadoFinal.bolas.find((b) => b.id === 7)).toMatchObject({ naMesa: true, posicao: { x: p.x, z: p.z } });
    expect(doTipo(r.eventos, 'cacapa').filter((e) => e.bola === 7)).toHaveLength(0);
  });
});

describe('caçapa funda: a garganta guia e a quina continua batendo', () => {
  it('dentro da garganta, antes da linha de queda, a bola bate na face (que é tabela): ela vai até a linha', () => {
    // A 1 cm da linha da boca, indo para o lado e um pouco para o fundo. Com a caçapa rasa ela já teria caído (1 cm
    // está dentro do círculo antigo); agora está na garganta e só a face a segura.
    const p = { x: meio.boca.x + meio.eixo.x * 0.01, z: meio.boca.z + meio.eixo.z * 0.01 };
    const motor = new Motor({ bolas: [bolaParada(1, p)] }, C);
    const esquerda = { x: -meio.eixo.z, z: meio.eixo.x };
    const v = 0.9;
    motor.aplicarGolpe(0, { vx: v * (esquerda.x + 0.3 * meio.eixo.x), vz: v * (esquerda.z + 0.3 * meio.eixo.z), wx: 0, wy: 0, wz: 0, velocidadeTaco: 0, miscue: false });
    const b = motor.bolas[0]!;
    while (motor.t < 4 && motor.eventos.length === 0) motor.avancar(C.passo / 16);
    expect(motor.eventos[0]).toMatchObject({ tipo: 'bola-tabela', bola: 1 });
    const onde = { x: b.px, z: b.pz };
    expect(profundidade(onde, meio)).toBeGreaterThan(0.005);
    expect(profundidade(onde, meio)).toBeLessThan(meio.fundo);
    // Bateu na face (a um R·cos θ do plano dela): o desvio do eixo é de meia boca menos o contato.
    expect(Math.abs(lateral(onde, meio))).toBeCloseTo(meio.raio - rc, 3);
    expect(PONTAS.some((q) => q.cacapa === meio.id && q.tabela === (motor.eventos[0] as Extract<EventoTacada, { tipo: 'bola-tabela' }>).tabela)).toBe(true);
  });

  it.each([
    ['canto', canto],
    ['meio', meio],
  ] as const)('rasante na quina (%s): a bola que passa roçando a ponta bate e não cai, em qualquer velocidade', (_nome, c) => {
    const lado = c.raio + 0.004;
    for (const v of [0.5, 2, 6]) {
      for (const sinal of [1, -1]) {
        const { eventos } = lancar(c, { v, d: sinal * lado, limite: 0.9 });
        const primeiro = eventos.find((e) => e.tipo === 'bola-tabela' || e.tipo === 'cacapa');
        expect(primeiro, `${v} m/s, lado ${sinal}`).toMatchObject({ tipo: 'bola-tabela', bola: 1 });
        // Depois de bater ela volta para a mesa (a 6 m/s ainda atravessa a mesa e cai na caçapa do outro lado, nunca nesta).
        expect(doTipo(eventos, 'cacapa').filter((e) => e.cacapa === c.id), `${v} m/s, lado ${sinal}`).toHaveLength(0);
      }
    }
  });

  it('bola que entra de ponta na quina e bate numa face em cheio volta para a mesa, não cai', () => {
    // Centro a 3 mm da face, para dentro da garganta, indo contra a quina da esquerda na ponta arredondada.
    const quina = PONTAS.find((q) => q.cacapa === meio.id && q.quina.x < 0)!;
    const { eventos, motor } = lancar(meio, { v: 1.2, d: lateral(quina.quina, meio) + 0.001, limite: 0.8 });
    expect(doTipo(eventos, 'cacapa')).toHaveLength(0);
    expect(eventos[0]).toMatchObject({ tipo: 'bola-tabela' });
    expect(motor.bolas[0]!.naMesa).toBe(true);
  });

  it('as faces vão até a linha de queda: nenhum trecho do fundo da garganta fica sem face', () => {
    for (const c of BOCAS) {
      for (const q of PONTAS.filter((p) => p.cacapa === c.id)) {
        expect(profundidade(q.fimDaFace, c)).toBeCloseTo(c.fundo + c.raio, 9);
        expect(profundidade(q.naFace, c)).toBeLessThan(0.02);
      }
    }
    // Uma bola no limite lateral da garganta, na linha de queda, já bate na face (a face passa dela).
    for (const c of BOCAS) {
      const lado = c.raio - rc - 1e-4;
      const p = { x: c.boca.x + c.eixo.x * c.fundo - c.eixo.z * lado, z: c.boca.z + c.eixo.z * c.fundo + c.eixo.x * lado };
      const motor = new Motor({ bolas: [bolaParada(1, p)] }, C);
      const esquerda = { x: -c.eixo.z, z: c.eixo.x };
      motor.aplicarGolpe(0, { vx: 0.5 * esquerda.x, vz: 0.5 * esquerda.z, wx: 0, wy: 0, wz: 0, velocidadeTaco: 0, miscue: false });
      motor.avancar(0.05);
      expect(doTipo(motor.eventos, 'bola-tabela'), c.id).toHaveLength(1);
    }
  });
});

describe('caçapa funda: determinismo', () => {
  it('as mesmas sementes dão os mesmos eventos e a mesma gravação, com bolas caindo nas caçapas fundas', () => {
    const estado: EstadoMesa = {
      bolas: [bolaParada(ID_BOLAO, { x: 0.2, z: -0.1 }), bolaParada(3, { x: 0.45, z: -0.2 }), bolaParada(9, { x: 0.8, z: 0.3 })],
    };
    const tacada = { angulo: -0.35, velocidadeTaco: 4, efeito: { lateral: 0.2, vertical: -0.1 }, elevacao: 0, giz: 0.8 };
    for (const semente of [1, 2, 7]) {
      const a = simularTacada(estado, tacada, criarRng(semente));
      const b = simularTacada(estado, tacada, criarRng(semente));
      expect(b.eventos).toEqual(a.eventos);
      expect(Array.from(b.gravacao.posicoes)).toEqual(Array.from(a.gravacao.posicoes));
      expect(Array.from(b.gravacao.orientacoes)).toEqual(Array.from(a.gravacao.orientacoes));
      expect(b.estadoFinal).toEqual(a.estadoFinal);
    }
  });
});
