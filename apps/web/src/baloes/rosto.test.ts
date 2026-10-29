import { describe, expect, it } from 'vitest';
import { ID_BOLAO, MESA_BAR, bolaParada, cacapas, criarRng, simularTacada, type EstadoMesa, type EventoTacada, type Gravacao } from '@sinuca/fisica';
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
    // sem sorriso, sem bravo e sem comemoração: só o susto e, quando ele passa, o desânimo de a bola dele não ter caído (sem alívio: o alívio é de quem joga contra)
    expect(momentos.map((m) => m.rosto)).toEqual(['susto', 'desanimado']);
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

/** Uma gravação só de eventos (as posições não importam para o sorriso, a comemoração e o bravo): três bolas, parada. */
function gravacaoDeEventos(eventos: EventoTacada[]): Gravacao {
  const ids = [ID_BOLAO, 5, 6];
  const quadros = 4;
  return { frequencia: 30, ids, quadros, duracao: 3, posicoes: new Float32Array(quadros * ids.length * 3), orientacoes: new Float32Array(quadros * ids.length * 4), naMesa: new Uint8Array(quadros * ids.length).fill(1), eventos };
}
const BOCAS = cacapas(MESA_BAR);
const queda = (t: number, bola: number, boca = 0): EventoTacada => ({ tipo: 'cacapa', t, bola, cacapa: BOCAS[boca]!.id });

describe('a comemoração e o alívio (L46)', () => {
  it('duas bolas numeradas na mesma tacada dão comemorando, a partir da queda da segunda', () => {
    const m = momentosDaGravacao(gravacaoDeEventos([queda(0.8, 5), queda(1.4, 6, 1)]), MESA_BAR, cfg);
    expect(m.filter((x) => x.rosto === 'sorriso').map((x) => x.t)).toEqual([0.8, 1.4]);
    expect(m.filter((x) => x.rosto === 'comemorando')).toEqual([{ t: 1.4, rosto: 'comemorando', duracao: cfg.comemorandoS }]);
  });

  it('uma bola só é sorriso, sem comemorar; o bolão que cai com outra bola não faz combo (é falta)', () => {
    expect(momentosDaGravacao(gravacaoDeEventos([queda(0.8, 5)]), MESA_BAR, cfg).some((x) => x.rosto === 'comemorando')).toBe(false);
    const m = momentosDaGravacao(gravacaoDeEventos([queda(0.8, 5), queda(1.1, ID_BOLAO, 2)]), MESA_BAR, cfg);
    expect(m.some((x) => x.rosto === 'comemorando')).toBe(false);
    expect(m.some((x) => x.rosto === 'bravo')).toBe(true);
  });

  it('comemorando passa à frente do sorriso, e o bravo passa à frente de tudo', () => {
    const momentos = momentosDaGravacao(gravacaoDeEventos([queda(0.8, 5), queda(1.4, 6, 1)]), MESA_BAR, cfg);
    expect(rostoNoTempo(momentos, 0.9)).toBe('sorriso');
    expect(rostoNoTempo(momentos, 1.5)).toBe('comemorando');
    expect(rostoNoTempo(momentos, 1.4 + cfg.comemorandoS + 0.05)).toBe('neutro');
    expect(rostoNoTempo([{ t: 0, rosto: 'comemorando', duracao: 2 }, { t: 0.5, rosto: 'bravo', duracao: 1 }], 0.8)).toBe('bravo');
  });

  it('o alívio (ufa) vale menos que o susto, o sorriso e o bravo', () => {
    for (const outro of ['sorriso', 'bravo', 'susto'] as const) expect(rostoNoTempo([{ t: 0, rosto: 'ufa', duracao: 2 }, { t: 0.5, rosto: outro, duracao: 1 }], 0.8)).toBe(outro);
    expect(rostoNoTempo([{ t: 0, rosto: 'sorriso', duracao: 2 }, { t: 0.5, rosto: 'ufa', duracao: 1 }], 0.8)).toBe('sorriso');
  });
});

describe('a raspada de quem é o dono do balão: susto e depois desânimo, nunca ufa (L46b)', () => {
  it('a bola dele raspa e não cai: susto, e quando o susto passa o desânimo (cara triste curta); o ufa não vem', () => {
    const { momentos } = tacadaNoCanto(0.25, 0.03, 3);
    const susto = momentos.find((m) => m.rosto === 'susto')!;
    const desanimado = momentos.find((m) => m.rosto === 'desanimado')!;
    expect(momentos.some((m) => m.rosto === 'ufa')).toBe(false);
    expect(desanimado.t).toBeCloseTo(susto.t + cfg.sustoS, 9);
    expect(desanimado.duracao).toBe(cfg.desanimadoS);
    expect(rostoNoTempo(momentos, susto.t + 0.1)).toBe('susto');
    expect(rostoNoTempo(momentos, desanimado.t + 0.1)).toBe('desanimado');
    expect(rostoNoTempo(momentos, desanimado.t + cfg.desanimadoS + 0.1)).toBe('neutro');
  });

  it('o dono é o padrão: sem dizer quem tacou, vale a conta do dono', () => {
    const { gravacao } = tacadaNoCanto(0.25, 0.03, 3);
    expect(momentosDaGravacao(gravacao, MESA_BAR, cfg)).toEqual(momentosDaGravacao(gravacao, MESA_BAR, cfg, 'dono'));
  });

  it('o desânimo cede ao sorriso e ao bravo, e vale mais que o ufa', () => {
    for (const outro of ['sorriso', 'comemorando', 'bravo'] as const) expect(rostoNoTempo([{ t: 0, rosto: 'desanimado', duracao: 2 }, { t: 0.5, rosto: outro, duracao: 1 }], 0.8)).toBe(outro);
    expect(rostoNoTempo([{ t: 0, rosto: 'ufa', duracao: 2 }, { t: 0.5, rosto: 'desanimado', duracao: 1 }], 0.8)).toBe('desanimado');
    expect(rostoNoTempo([{ t: 0, rosto: 'desanimado', duracao: 2 }, { t: 0.5, rosto: 'ufa', duracao: 1 }], 0.8)).toBe('desanimado');
  });
});

/**
 * Uma gravação sintética: a bola 5 anda em linha reta a `v` m/s, de 0,6 m da caçapa 0 até 0,1 m depois dela (com `lateral` m de
 * lado, o que faz a bola passar pela borda da zona de queda), e para; o bolão e a bola 6 ficam longe, parados. Com `cairEm`, a bola
 * cai nesse instante.
 */
function gravacaoDeUmaBola(opcoes: { lateral: number; v?: number; cairEm?: number; andar?: number }): Gravacao {
  const boca = BOCAS[0]!.queda.centro;
  const norma = Math.hypot(boca.x, boca.z);
  const entrada = { x: -boca.x / norma, z: -boca.z / norma };
  const lado = { x: -entrada.z, z: entrada.x };
  const v = opcoes.v ?? 1.2;
  const andar = opcoes.andar ?? 0.7;
  const f = 60;
  const ids = [ID_BOLAO, 5, 6];
  const duracao = andar / v + 1.5;
  const quadros = Math.ceil(duracao * f) + 1;
  const posicoes = new Float32Array(quadros * ids.length * 3);
  const naMesa = new Uint8Array(quadros * ids.length).fill(1);
  for (let q = 0; q < quadros; q++) {
    const t = q / f;
    const s = Math.min(v * t, andar);
    const p = (q * ids.length) * 3;
    posicoes[p] = 0;
    posicoes[p + 2] = 0.1;
    posicoes[p + 3] = boca.x + entrada.x * (0.6 - s) + lado.x * opcoes.lateral;
    posicoes[p + 5] = boca.z + entrada.z * (0.6 - s) + lado.z * opcoes.lateral;
    posicoes[p + 6] = -0.3;
    posicoes[p + 8] = -0.2;
    if (opcoes.cairEm !== undefined && t >= opcoes.cairEm) naMesa[q * ids.length + 1] = 0;
  }
  const eventos: EventoTacada[] = opcoes.cairEm === undefined ? [] : [queda(opcoes.cairEm, 5, 0)];
  return { frequencia: f, ids, quadros, duracao, posicoes, orientacoes: new Float32Array(quadros * ids.length * 4), naMesa, eventos };
}
/** O quanto a bola passa raspando: dentro da margem do susto, fora do círculo de queda. */
const RASPANDO = BOCAS[0]!.queda.raio + cfg.margemDoSusto / 2;
const PARA_EM = 0.7 / 1.2;

describe('o suspense e o alívio de quem joga contra o dono do balão (L46b)', () => {
  it('a bola corre para a caçapa: desconfiado desde que corre, até a bola parar', () => {
    const g = gravacaoDeUmaBola({ lateral: 0.15, andar: 0.3 });
    const m = momentosDaGravacao(g, MESA_BAR, cfg, 'contra');
    const d = m.filter((x) => x.rosto === 'desconfiado');
    expect(d).toHaveLength(1);
    expect(d[0]!.t).toBeLessThan(0.05);
    expect(d[0]!.t + d[0]!.duracao).toBeCloseTo(0.3 / 1.2, 1);
    expect(rostoNoTempo(m, 0.1)).toBe('desconfiado');
    expect(rostoNoTempo(m, 0.3 / 1.2 + 0.1)).toBe('neutro');
    expect(m.some((x) => x.rosto === 'ufa' || x.rosto === 'susto' || x.rosto === 'desanimado')).toBe(false);
  });

  it('a bola cai: o suspense acaba na queda, sem ufa', () => {
    // 0,41 s não cai num quadro (60 Hz): o instante do evento de queda vale mais que o quadro em que a bola some da mesa
    const g = gravacaoDeUmaBola({ lateral: 0, andar: 0.7, cairEm: 0.41 });
    const m = momentosDaGravacao(g, MESA_BAR, cfg, 'contra');
    const d = m.find((x) => x.rosto === 'desconfiado')!;
    expect(d.t + d.duracao).toBeCloseTo(0.41, 9);
    expect(m.some((x) => x.rosto === 'ufa')).toBe(false);
    expect(rostoNoTempo(m, 0.2)).toBe('desconfiado');
    expect(rostoNoTempo(m, 0.45)).not.toBe('desconfiado');
  });

  it('a bola raspa e não cai: o suspense acaba e vem o ufa (nada de susto nem de desânimo)', () => {
    const g = gravacaoDeUmaBola({ lateral: RASPANDO });
    const m = momentosDaGravacao(g, MESA_BAR, cfg, 'contra');
    expect(g.eventos).toEqual([]);
    const d = m.find((x) => x.rosto === 'desconfiado')!;
    const ufa = m.find((x) => x.rosto === 'ufa')!;
    expect(d.t + d.duracao).toBeCloseTo(PARA_EM, 1);
    expect(ufa.t).toBeCloseTo(d.t + d.duracao, 6);
    expect(ufa.duracao).toBe(cfg.ufaS);
    expect(m.some((x) => x.rosto === 'susto' || x.rosto === 'desanimado')).toBe(false);
    expect(rostoNoTempo(m, 0.1)).toBe('desconfiado');
    expect(rostoNoTempo(m, ufa.t + 0.1)).toBe('ufa');
    expect(rostoNoTempo(m, ufa.t + cfg.ufaS + 0.1)).toBe('neutro');
  });

  it('a bola raspa e segue rolando: o suspense acaba sustoS depois da raspada, e é aí que vem o ufa', () => {
    const g = gravacaoDeUmaBola({ lateral: RASPANDO, andar: 2.5 });
    const raspada = momentosDaGravacao(g, MESA_BAR, cfg, 'dono').find((x) => x.rosto === 'susto')!;
    const m = momentosDaGravacao(g, MESA_BAR, cfg, 'contra');
    const d = m.find((x) => x.rosto === 'desconfiado')!;
    const ufa = m.find((x) => x.rosto === 'ufa')!;
    expect(2.5 / 1.2).toBeGreaterThan(raspada.t + cfg.sustoS + 0.3);
    expect(d.t + d.duracao).toBeCloseTo(raspada.t + cfg.sustoS, 6);
    expect(ufa.t).toBeCloseTo(raspada.t + cfg.sustoS, 6);
  });

  it('a bola que rola longe da caçapa não dá suspense nem ufa', () => {
    const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0.1 }), bolaParada(5, { x: 0.3, z: 0.1 })] };
    const r = simularTacada(mesa, { angulo: 0, velocidadeTaco: 1.5, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, criarRng(1));
    expect(momentosDaGravacao(r.gravacao, MESA_BAR, cfg, 'contra').filter((x) => x.rosto === 'desconfiado' || x.rosto === 'ufa')).toEqual([]);
  });

  it('a bola do próprio dono nunca dá suspense', () => {
    const g = gravacaoDeUmaBola({ lateral: RASPANDO });
    expect(momentosDaGravacao(g, MESA_BAR, cfg, 'dono').some((x) => x.rosto === 'desconfiado')).toBe(false);
  });

  it('a raspada com a física real, na tacada do outro: ufa e suspense, nenhum susto', () => {
    const { gravacao } = tacadaNoCanto(0.25, 0.03, 3);
    const m = momentosDaGravacao(gravacao, MESA_BAR, cfg, 'contra');
    expect(m.some((x) => x.rosto === 'ufa')).toBe(true);
    expect(m.some((x) => x.rosto === 'susto' || x.rosto === 'desanimado')).toBe(false);
  });

  it('o desconfiado vale menos que o ufa, o sorriso e o bravo', () => {
    for (const outro of ['ufa', 'sorriso', 'bravo', 'susto'] as const) expect(rostoNoTempo([{ t: 0, rosto: 'desconfiado', duracao: 2 }, { t: 0.5, rosto: outro, duracao: 1 }], 0.8)).toBe(outro);
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
  it('provocar: rindo, depois convencido, depois neutro; reiniciar zera', () => {
    const r = new RostoDoBalao(cfg);
    r.comecar([]);
    r.provocou(10);
    expect(r.rosto(null, 10.1)).toBe('rindo');
    expect(r.rosto(null, 10 + cfg.rindoS + 0.1)).toBe('convencido');
    expect(r.rosto(null, 10 + cfg.rindoS + cfg.convencidoS + 0.1)).toBe('neutro');
    r.provocou(20);
    r.reiniciar();
    expect(r.rosto(null, 20.1)).toBe('neutro');
  });
  it('a provocação cede ao que a mesa provoca (o outro encaçapou) e à falta', () => {
    const r = new RostoDoBalao(cfg);
    r.comecar([{ t: 1, rosto: 'sorriso', duracao: 1.4 }]);
    r.provocou(10);
    expect(r.rosto(1.2, 10.2)).toBe('sorriso');
    r.faltou(10.3);
    expect(r.rosto(null, 10.4)).toBe('bravo');
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
