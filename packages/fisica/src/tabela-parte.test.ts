import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO as C } from './config';
import { bolaParada, lugares, mesaInicial } from './lugares';
import { BOLA, MESA_BAR, pontasTabela, type Ponto2 } from './medidas';
import { Motor } from './motor';
import { criarRng } from './rng';
import { simularTacada } from './simulacao';
import { ID_BOLAO, type EstadoMesa, type EventoTacada, type IdBola, type ParametrosTacada, type Rng } from './tipos';

// L31b — `bola-tabela` diz se a bola bateu no nariz da tabela ou na boca da caçapa (face da garganta ou ponta arredondada).

const PONTAS = pontasTabela(MESA_BAR);
const hz = MESA_BAR.largura / 2;
const doTipo = <T extends EventoTacada['tipo']>(eventos: readonly EventoTacada[], tipo: T) =>
  eventos.filter((e): e is Extract<EventoTacada, { tipo: T }> => e.tipo === tipo);

/** Lança a bola 1 de `inicio` a `v` (m/s, vetor), rolando, até a primeira batida. */
function primeiraBatida(inicio: Ponto2, v: Ponto2) {
  const motor = new Motor({ bolas: [bolaParada(1, inicio, C)] }, C);
  motor.aplicarGolpe(0, { vx: v.x, vz: v.z, wx: v.z / BOLA.raio, wy: 0, wz: -v.x / BOLA.raio, velocidadeTaco: 0, miscue: false });
  while (motor.eventos.length === 0 && motor.t < 2) motor.avancar(C.passo / 64);
  return { motor, batida: motor.eventos[0]! };
}

describe('parte da tabela no bola-tabela', () => {
  it('bola contra o meio do nariz da tabela comprida: nariz', () => {
    const { batida } = primeiraBatida({ x: 0.5, z: 0 }, { x: 0, z: 1 });
    expect(batida).toMatchObject({ tipo: 'bola-tabela', tabela: expect.any(Number), parte: 'nariz' });
  });

  it('bola contra o nariz, de viés, longe das bocas: nariz', () => {
    const { batida } = primeiraBatida({ x: 0.4, z: 0.1 }, { x: 0.6, z: -0.8 });
    expect(batida).toMatchObject({ tipo: 'bola-tabela', parte: 'nariz' });
  });

  it('bola de frente no arredondado da ponta: boca', () => {
    const ponta = PONTAS.find((q) => q.cacapa === 'meio-z-')!;
    const bx = ponta.centro.x - ponta.quina.x;
    const bz = ponta.centro.z - ponta.quina.z;
    const n = Math.hypot(bx, bz);
    const longe = 0.3;
    const { batida } = primeiraBatida(
      { x: ponta.centro.x - (bx / n) * longe, z: ponta.centro.z - (bz / n) * longe },
      { x: (bx / n) * 0.8, z: (bz / n) * 0.8 },
    );
    expect(batida).toMatchObject({ tipo: 'bola-tabela', tabela: ponta.tabela, parte: 'boca' });
  });

  it('bola na garganta que bate na face da quina e cai: boca, e a queda vem depois', () => {
    const funda = hz + MESA_BAR.fundoMeio - 0.004;
    const { motor, batida } = primeiraBatida({ x: -0.015, z: funda }, { x: -1, z: 0.05 });
    expect(batida).toMatchObject({ tipo: 'bola-tabela', bola: 1, tabela: 2, parte: 'boca' });
    while (motor.t < 1 && !motor.eventos.some((e) => e.tipo === 'cacapa')) motor.avancar(C.passo);
    expect(doTipo(motor.eventos, 'cacapa')).toHaveLength(1);
  });

  it('todo bola-tabela de uma varredura de tacadas traz a parte', () => {
    let n = 0;
    for (const eventos of jogar(60, 7)) {
      for (const e of doTipo(eventos, 'bola-tabela')) {
        n++;
        expect(['nariz', 'boca']).toContain(e.parte);
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('varredura de tacadas reais', () => {
  it('só uma minoria das bolas encaçapadas bate no nariz entre o primeiro toque e a caçapa (hoje, contando a boca, eram ~78%)', () => {
    const v = varredura(600, 31);
    console.info('varredura L31b', JSON.stringify({ ...v, proporcaoAlgumaTabela: v.comAlgumaTabela / v.encacapadas, proporcaoNariz: v.comNariz / v.encacapadas }));
    expect(v.encacapadas).toBeGreaterThan(80);
    expect(v.comNariz / v.encacapadas).toBeLessThan(0.4);
    expect(v.comNariz).toBeLessThan(v.comAlgumaTabela);
  }, 600_000);
});
