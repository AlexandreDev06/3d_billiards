import { describe, expect, it } from 'vitest';
import { CASA_1, CASA_MATA_MATA, DUPLAS_DE_TESTE, TRIO_DE_TESTE, TRIO_POR_SI, partidaDeTeste } from '../jogo/para-testes';
import { DestaqueDaVez, envelopeDoDestaque, type ConfigDoDestaque } from './destaque-modelo';

const CFG: ConfigDoDestaque = { duracaoS: 2.5, aparecerS: 0.25, sumirS: 0.5, naSaida: false };
const comGrupos = partidaDeTeste({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9] });

describe('envelopeDoDestaque: sobe, segura e some', () => {
  it('0 no começo, 1 depois de aparecer, 0 no fim', () => {
    expect(envelopeDoDestaque(0, CFG)).toBe(0);
    expect(envelopeDoDestaque(0.125, CFG)).toBeCloseTo(0.5, 5);
    expect(envelopeDoDestaque(0.25, CFG)).toBe(1);
    expect(envelopeDoDestaque(1.5, CFG)).toBe(1);
    expect(envelopeDoDestaque(2.0, CFG)).toBe(1);
    expect(envelopeDoDestaque(2.25, CFG)).toBeCloseTo(0.5, 5);
    expect(envelopeDoDestaque(2.5, CFG)).toBe(0);
    expect(envelopeDoDestaque(9, CFG)).toBe(0);
  });

  it('tempo negativo não acende', () => {
    expect(envelopeDoDestaque(-1, CFG)).toBe(0);
  });
});

describe('DestaqueDaVez: quando a vez começa, as bolas que valem acendem por um tempo', () => {
  it('acende quando a vez começa, com as bolas de bolasAlvo, e apaga depois da duração', () => {
    const d = new DestaqueDaVez(CFG);
    const t0 = d.atualizar(comGrupos, 1000, true, false);
    expect(t0.visivel).toBe(true);
    expect(t0.bolas).toEqual([2, 4]);
    expect(d.atualizar(comGrupos, 1000 + 250, true, false).intensidade).toBe(1);
    expect(d.atualizar(comGrupos, 1000 + 2400, true, false).visivel).toBe(true);
    const fim = d.atualizar(comGrupos, 1000 + 2500, true, false);
    expect(fim.visivel).toBe(false);
    expect(fim.intensidade).toBe(0);
  });

  it('na hora da bola final destaca só ela', () => {
    const d = new DestaqueDaVez(CFG);
    const noCastigo = partidaDeTeste({ fase: 'castigo', grupos: ['par', 'impar'], naMesa: [3, 5, 8] });
    expect(d.atualizar(noCastigo, 0, true, false).bolas).toEqual([8]);
  });

  it('com a vez do outro, as bolas dele', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar({ ...comGrupos, vez: 1 }, 0, true, false).bolas).toEqual([3, 7, 9]);
  });

  it('não começa a contar enquanto não está liberado (animando, menu); começa quando libera', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar(comGrupos, 0, false, false).visivel).toBe(false);
    expect(d.atualizar(comGrupos, 5000, false, false).visivel).toBe(false);
    const liberou = d.atualizar(comGrupos, 6000, true, false);
    expect(liberou.visivel).toBe(true);
    expect(liberou.intensidade).toBe(0);
    expect(d.atualizar(comGrupos, 6250, true, false).intensidade).toBe(1);
  });

  it('perder a liberação (a tacada começou) apaga na hora', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, false);
    expect(d.atualizar(comGrupos, 600, false, false).visivel).toBe(false);
  });

  it('a mesma pessoa seguindo na vez (encaçapou e continua) não acende de novo', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, false);
    d.atualizar(comGrupos, 3000, true, false);
    const depois = { ...comGrupos, naMesa: [2, 3, 7, 8, 9] };
    expect(d.atualizar(depois, 5000, true, false).visivel).toBe(false);
  });

  it('a vez que muda acende de novo, e acende também quando a vez volta para quem já estava', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, false);
    d.atualizar(comGrupos, 3000, true, false);
    expect(d.atualizar({ ...comGrupos, vez: 1 }, 4000, true, false).visivel).toBe(true);
    d.atualizar({ ...comGrupos, vez: 1 }, 7000, true, false);
    expect(d.atualizar(comGrupos, 8000, true, false).visivel).toBe(true);
  });

  it('nas duplas cada jogador da roda é uma vez', () => {
    const d = new DestaqueDaVez(CFG);
    const duplas = partidaDeTeste({ jogadores: DUPLAS_DE_TESTE, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9], vez: 0 });
    d.atualizar(duplas, 0, true, false);
    d.atualizar(duplas, 3000, true, false);
    expect(d.atualizar({ ...duplas, vez: 2 }, 3100, true, false).visivel).toBe(true);
  });

  it('no 2x1 cada vez da roda (A1, B1, A2, B1) acende de novo, com as bolas do grupo da equipe de quem joga', () => {
    const d = new DestaqueDaVez(CFG);
    const trio = (vez: number) => partidaDeTeste({ jogadores: TRIO_DE_TESTE, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9], vez });
    const acendeu: [boolean, readonly number[]][] = [];
    let t = 0;
    for (const v of [0, 1, 2, 1, 0]) {
      t += 3000;
      const comeco = d.atualizar(trio(v), t, true, false);
      acendeu.push([comeco.visivel, [...comeco.bolas]]);
    }
    expect(acendeu).toEqual([
      [true, [2, 4]],
      [true, [3, 7, 9]],
      [true, [2, 4]],
      [true, [3, 7, 9]],
      [true, [2, 4]],
    ]);
  });

  it('no 2x1 a vez que muda de A1 para o parceiro A2 também conta como começo', () => {
    const d = new DestaqueDaVez(CFG);
    const trio = (vez: number) => partidaDeTeste({ jogadores: TRIO_DE_TESTE, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9], vez });
    d.atualizar(trio(0), 0, true, false);
    d.atualizar(trio(0), 3000, true, false);
    expect(d.atualizar(trio(2), 3100, true, false)).toMatchObject({ visivel: true, bolas: [2, 4] });
  });

  it('na saída não acende (todas valem, o anel só poluiria o triângulo); a vez seguinte acende', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar(partidaDeTeste(), 0, true, false).visivel).toBe(false);
    expect(d.atualizar({ ...partidaDeTeste({ fase: 'aberta' }), vez: 1 }, 500, true, false).visivel).toBe(true);
  });

  it('configurado com naSaida, acende na saída', () => {
    const d = new DestaqueDaVez({ ...CFG, naSaida: true });
    expect(d.atualizar(partidaDeTeste(), 0, true, false).visivel).toBe(true);
  });

  it('partida encerrada não acende nada', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar({ ...comGrupos, fase: 'fim', vencedor: 0 }, 0, true, false).visivel).toBe(false);
  });

  it('partida nova ou retrato da sala (reiniciar) conta como começo de vez, mesmo com a mesma vez', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, false);
    d.atualizar(comGrupos, 3000, true, false);
    d.reiniciar();
    expect(d.atualizar(comGrupos, 3100, true, false).visivel).toBe(true);
  });

  it('as bolas seguem a casa (a bola final da casa antiga é a 1)', () => {
    const d = new DestaqueDaVez(CFG);
    const casa1 = partidaDeTeste({ config: CASA_1, fase: 'castigo', grupos: ['par', 'impar'], naMesa: [1, 3, 5] });
    expect(d.atualizar(casa1, 0, true, false).bolas).toEqual([1]);
  });
});

describe('DestaqueDaVez: a tecla de mostrar de novo', () => {
  it('segurada acende com tudo, mesmo depois do tempo, com as bolas da vez', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, false);
    expect(d.atualizar(comGrupos, 10_000, true, false).visivel).toBe(false);
    const segurando = d.atualizar(comGrupos, 10_100, true, true);
    expect(segurando.visivel).toBe(true);
    expect(segurando.bolas).toEqual([2, 4]);
    expect(d.atualizar(comGrupos, 10_100 + 250, true, true).intensidade).toBe(1);
  });

  it('ao soltar volta ao que o tempo manda (apagado)', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, false);
    d.atualizar(comGrupos, 10_000, true, true);
    expect(d.atualizar(comGrupos, 10_400, true, false).visivel).toBe(false);
  });

  it('segurada durante o tempo normal não atrapalha: continua cheia', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, false);
    expect(d.atualizar(comGrupos, 1000, true, true).intensidade).toBe(1);
    expect(d.atualizar(comGrupos, 2400, true, true).intensidade).toBe(1);
  });

  it('partida encerrada, mesmo com a tecla segurada, fica apagada e com intensidade zero', () => {
    const d = new DestaqueDaVez(CFG);
    const fim = { ...comGrupos, fase: 'fim' as const, vencedor: 0 };
    d.atualizar(fim, 0, true, true);
    const depois = d.atualizar(fim, 600, true, true);
    expect(depois.visivel).toBe(false);
    expect(depois.intensidade).toBe(0);
  });

  it('sem nenhuma bola que valha na mesa nada acende, nem com a tecla segurada', () => {
    const d = new DestaqueDaVez(CFG);
    const vazia = partidaDeTeste({ fase: 'aberta', naMesa: [] });
    d.atualizar(vazia, 0, true, true);
    expect(d.atualizar(vazia, 600, true, true).visivel).toBe(false);
  });

  it('segurada com a tacada tocando (não liberado) não mostra nada', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar(comGrupos, 0, false, true).visivel).toBe(false);
  });

  it('segurada na saída mostra (é o jogador pedindo)', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(partidaDeTeste(), 0, true, false);
    expect(d.atualizar(partidaDeTeste(), 1000, true, true).visivel).toBe(true);
  });

  it('segurada, acompanha a partida nova (as bolas mudam quando a mesa muda)', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(comGrupos, 0, true, true);
    expect(d.atualizar({ ...comGrupos, naMesa: [2, 3, 7, 8, 9] }, 100, true, true).bolas).toEqual([2]);
  });
});

describe('DestaqueDaVez no mata-mata: todas as bolas valem, então a vez não acende nada (seria só ruído)', () => {
  const mata = partidaDeTeste({ config: CASA_MATA_MATA, jogadores: TRIO_POR_SI, grupos: [null, null, null], fase: 'aberta', naMesa: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });

  it('não acende no começo da vez de ninguém, nem quando a vez muda', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar(mata, 0, true, false).visivel).toBe(false);
    expect(d.atualizar(mata, 250, true, false).intensidade).toBe(0);
    expect(d.atualizar({ ...mata, vez: 1 }, 10_000, true, false).visivel).toBe(false);
    expect(d.atualizar({ ...mata, vez: 2, naMesa: [3, 8, 15] }, 20_000, true, false).visivel).toBe(false);
  });

  it('segurando B mostra as 15 (a 8 também, não há bola final)', () => {
    const d = new DestaqueDaVez(CFG);
    d.atualizar(mata, 0, true, false);
    const segurando = d.atualizar(mata, 1000, true, true);
    expect(segurando.visivel).toBe(true);
    expect(segurando.bolas).toHaveLength(15);
    expect(d.atualizar(mata, 1000 + 250, true, true).intensidade).toBe(1);
    expect(d.atualizar(mata, 3000, true, false).visivel).toBe(false);
  });

  it('só as que sobraram na mesa, quando seguram B', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar({ ...mata, naMesa: [2, 9] }, 0, true, true).bolas).toEqual([2, 9]);
  });

  it('na saída também não acende', () => {
    const d = new DestaqueDaVez(CFG);
    expect(d.atualizar({ ...mata, fase: 'saida' }, 0, true, false).visivel).toBe(false);
  });

  it('com uma bola só na mesa (a bola final do par ou ímpar) o destaque continua', () => {
    const d = new DestaqueDaVez(CFG);
    const so8 = partidaDeTeste({ fase: 'castigo', grupos: ['par', 'impar'], naMesa: [8] });
    expect(d.atualizar(so8, 0, true, false)).toMatchObject({ visivel: true, bolas: [8] });
  });
});
