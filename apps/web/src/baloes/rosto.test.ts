import { describe, expect, it } from 'vitest';
import { ID_BOLAO, MESA_BAR, bolaParada, criarRng, simularTacada, type EstadoMesa, type Gravacao } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { RostoDoBalao, momentosDaGravacao, rostoNoTempo, type MomentoDoRosto } from './rosto';

const cfg = CONFIG_WEB.baloes.rosto;
const HX = MESA_BAR.comprimento / 2;
const HZ = MESA_BAR.largura / 2;

/** O bolão em (x, z) e a bola 5 à frente dele, na direção do canto (+x, +z), a `distancia` m do canto; tacada com `desvio` rad. */
function tacadaNoCanto(distancia: number, desvio: number, velocidade: number): { gravacao: Gravacao; momentos: MomentoDoRosto[] } {
  const canto = { x: HX - 0.04, z: HZ - 0.04 };
  const dir = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  const bola5 = { x: canto.x + dir.x * distancia, z: canto.z + dir.z * distancia };
  const bolao = { x: bola5.x + dir.x * 0.35, z: bola5.z + dir.z * 0.35 };
  const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, bolao), bolaParada(5, bola5)] };
  const r = simularTacada(mesa, { angulo: Math.atan2(-dir.z, -dir.x) + desvio, velocidadeTaco: velocidade, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, criarRng(1));
  return { gravacao: r.gravacao, momentos: momentosDaGravacao(r.gravacao, MESA_BAR, cfg) };
}

describe('rostoNoTempo', () => {
  const momentos: MomentoDoRosto[] = [
    { t: 1, rosto: 'susto', duracao: 1 },
    { t: 1.5, rosto: 'sorriso', duracao: 1.4 },
  ];
  it('é neutro antes, no meio de nada e depois', () => {
    expect(rostoNoTempo(momentos, 0.9)).toBe('neutro');
    expect(rostoNoTempo(momentos, 3)).toBe('neutro');
    expect(rostoNoTempo([], 1)).toBe('neutro');
  });
  it('vale o momento que ainda não acabou; com dois, o de maior peso, e o mais recente se empatam', () => {
    expect(rostoNoTempo(momentos, 1.2)).toBe('susto');
    expect(rostoNoTempo(momentos, 1.6)).toBe('sorriso');
    expect(rostoNoTempo(momentos, 2.8)).toBe('sorriso');
    expect(rostoNoTempo([{ t: 0, rosto: 'sorriso', duracao: 2 }, { t: 0.5, rosto: 'susto', duracao: 1 }], 0.8)).toBe('sorriso');
    expect(rostoNoTempo([{ t: 0, rosto: 'susto', duracao: 2 }, { t: 0.5, rosto: 'susto', duracao: 1 }], 0.8)).toBe('susto');
    expect(rostoNoTempo([{ t: 0, rosto: 'sorriso', duracao: 2 }, { t: 0.5, rosto: 'bravo', duracao: 1 }], 0.8)).toBe('bravo');
  });
});

describe('momentosDaGravacao com a física real', () => {
  it('uma bola encaçapada dá sorriso no instante da queda', () => {
    const achou = [0, 0.01, -0.01, 0.02, -0.02].map((d) => tacadaNoCanto(0.25, d, 3)).find((x) => x.gravacao.eventos.some((e) => e.tipo === 'cacapa' && e.bola === 5));
    expect(achou).toBeDefined();
    const queda = achou!.gravacao.eventos.find((e) => e.tipo === 'cacapa' && e.bola === 5)!;
    expect(achou!.momentos.some((m) => m.rosto === 'sorriso' && m.t === queda.t)).toBe(true);
    expect(achou!.momentos.some((m) => m.rosto === 'susto' && m.t < queda.t - 0.5)).toBe(false);
  });
});

describe('o susto pelos eventos da gravação', () => {
  it('a bola que bate na quina da caçapa e não cai dá susto, sem sorriso nem bravo', () => {
    const { gravacao, momentos } = tacadaNoCanto(0.25, 0.03, 3);
    expect(gravacao.eventos.some((e) => e.tipo === 'cacapa')).toBe(false);
    expect(gravacao.eventos.some((e) => e.tipo === 'bola-tabela')).toBe(true);
    const primeiro = momentos[0]!;
    expect(primeiro.rosto).toBe('susto');
    expect(primeiro.t).toBeLessThan(0.3);
    expect(momentos.some((m) => m.rosto !== 'susto')).toBe(false);
  });

  it('o bolão que cai dá bravo', () => {
    const { momentos } = tacadaNoCanto(0.25, -0.04, 3);
    expect(momentos.some((m) => m.rosto === 'bravo')).toBe(true);
  });

  it('tacada que não chega perto de caçapa nenhuma não dá rosto', () => {
    const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0.1 }), bolaParada(5, { x: 0.3, z: 0.1 })] };
    const r = simularTacada(mesa, { angulo: 0, velocidadeTaco: 1.5, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, criarRng(1));
    expect(momentosDaGravacao(r.gravacao, MESA_BAR, cfg)).toEqual([]);
  });

  it('a bola que bate no nariz reto da tabela, longe das quinas, não assusta (mesmo rápida)', () => {
    const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x: 0.5, z: 0 }), bolaParada(5, { x: 0.8, z: 0.3 })] };
    const r = simularTacada(mesa, { angulo: Math.PI / 2, velocidadeTaco: 4, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, criarRng(1));
    const batidas = r.gravacao.eventos.filter((e) => e.tipo === 'bola-tabela' && e.velocidade > cfg.velocidadeMinimaDoSusto);
    expect(batidas.length).toBeGreaterThan(0);
    expect(momentosDaGravacao(r.gravacao, MESA_BAR, cfg).filter((m) => m.rosto === 'susto')).toEqual([]);
  });

  it('uma bola parada perto da boca, que ninguém mexe, não assusta', () => {
    const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0 }), bolaParada(5, { x: HX - 0.1, z: HZ - 0.1 })] };
    const r = simularTacada(mesa, { angulo: 0, velocidadeTaco: 1, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, criarRng(1));
    expect(momentosDaGravacao(r.gravacao, MESA_BAR, cfg).filter((m) => m.rosto === 'susto')).toEqual([]);
  });

  it('dois sustos colados contam como um', () => {
    const { momentos } = tacadaNoCanto(0.15, -0.04, 3);
    const sustos = momentos.filter((m) => m.rosto === 'susto');
    for (let i = 1; i < sustos.length; i++) expect(sustos[i]!.t - sustos[i - 1]!.t).toBeGreaterThanOrEqual(cfg.juntarSustosS);
  });
});

describe('RostoDoBalao', () => {
  const momentos: MomentoDoRosto[] = [{ t: 1, rosto: 'sorriso', duracao: 1.4 }];
  it('segue a gravação e, depois que ela acaba, o relógio dela continua até o rosto passar', () => {
    const r = new RostoDoBalao(cfg);
    r.comecar(momentos);
    expect(r.rosto(0.5, 10)).toBe('neutro');
    expect(r.rosto(1.2, 10.7)).toBe('sorriso');
    expect(r.rosto(null, 11)).toBe('sorriso');
    expect(r.rosto(null, 12)).toBe('neutro');
  });
  it('em câmera lenta o relógio da gravação, depois que ela acaba, segue na mesma velocidade', () => {
    const r = new RostoDoBalao(cfg);
    r.comecar(momentos);
    expect(r.rosto(1.2, 10, 0.5)).toBe('sorriso');
    // 2 s depois no relógio da página são só 1 s da gravação: ainda sorrindo (1,2 + 1 = 2,2 < 2,4)
    expect(r.rosto(null, 12, 0.5)).toBe('sorriso');
    expect(r.rosto(null, 14, 0.5)).toBe('neutro');
  });
  it('a falta de regra põe a cara de bravo e depois ela passa; reiniciar zera', () => {
    const r = new RostoDoBalao(cfg);
    r.comecar([]);
    r.faltou(5);
    expect(r.rosto(null, 5.5)).toBe('bravo');
    expect(r.rosto(null, 5 + cfg.bravoS + 0.1)).toBe('neutro');
    r.faltou(9);
    r.reiniciar();
    expect(r.rosto(null, 9.1)).toBe('neutro');
  });
});
