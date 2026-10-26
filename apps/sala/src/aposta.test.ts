import { describe, expect, it } from 'vitest';
import { APOSTAS_DA_SALA } from '@sinuca/protocolo';
import { calcularAposta, valeMoeda, type ParticipanteDoRol } from './aposta';

/** Lugar `i` na equipe `equipes[i]`, com a carteira `carteiras[i]` (null = sem carteira). */
const rolDe = (equipes: readonly number[], carteiras: readonly (string | null)[]): ParticipanteDoRol[] =>
  equipes.map((equipe, lugar) => ({ lugar, equipe, nome: `J${lugar}`, carteira: carteiras[lugar] ?? null }));

const todos = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i}`);

/** Os deltas por lugar (só quem tem carteira aparece). */
function deltas(rol: readonly ParticipanteDoRol[], aposta: number, vencedor: number): Record<number, number> {
  const r = calcularAposta(rol, aposta, vencedor);
  if (r.anulada) throw new Error('anulada');
  return Object.fromEntries(r.pagamentos.map((p) => [p.lugar, p.delta]));
}

describe('calcularAposta — quem ganha e quem paga', () => {
  it('1x1: o vencedor leva a aposta do perdedor', () => {
    expect(deltas(rolDe([0, 1], todos(2)), 10, 0)).toEqual({ 0: 10, 1: -10 });
    expect(deltas(rolDe([0, 1], todos(2)), 100, 1)).toEqual({ 0: -100, 1: 100 });
  });

  it('2x1, dupla vence: os dois dividem o que o perdedor paga', () => {
    // lugares 0 e 2 contra o 1
    expect(deltas(rolDe([0, 1, 0], todos(3)), 10, 0)).toEqual({ 0: 5, 1: -10, 2: 5 });
    expect(deltas(rolDe([0, 1, 0], todos(3)), 50, 0)).toEqual({ 0: 25, 1: -50, 2: 25 });
  });

  it('2x1, o solitário vence: leva o que os dois da dupla pagam', () => {
    expect(deltas(rolDe([0, 1, 0], todos(3)), 10, 1)).toEqual({ 0: -10, 1: 20, 2: -10 });
    expect(deltas(rolDe([0, 1, 0], todos(3)), 100, 1)).toEqual({ 0: -100, 1: 200, 2: -100 });
  });

  it('2x2: cada vencedor ganha a aposta de um perdedor', () => {
    expect(deltas(rolDe([0, 1, 0, 1], todos(4)), 20, 1)).toEqual({ 0: -20, 1: 20, 2: -20, 3: 20 });
  });

  it('mata-mata de 3 e de 4: o vencedor leva a aposta de cada um dos outros', () => {
    expect(deltas(rolDe([0, 1, 2], todos(3)), 10, 2)).toEqual({ 0: -10, 1: -10, 2: 20 });
    expect(deltas(rolDe([0, 1, 2, 3], todos(4)), 20, 0)).toEqual({ 0: 60, 1: -20, 2: -20, 3: -20 });
  });

  it('o saldo pode ficar negativo: a conta não sabe de saldo, só de quem perdeu', () => {
    const r = calcularAposta(rolDe([0, 1], todos(2)), 100, 0);
    expect(r.anulada).toBe(false);
  });
});

describe('calcularAposta — quem não tem carteira não aposta e não recebe', () => {
  it('perdedor sem carteira: o vencedor não ganha nada (não há de quem)', () => {
    expect(deltas(rolDe([0, 1], ['c0', null]), 10, 0)).toEqual({ 0: 0 });
  });

  it('vencedor sem carteira: o perdedor não paga (não há quem receba)', () => {
    expect(deltas(rolDe([0, 1], [null, 'c1']), 10, 0)).toEqual({ 1: 0 });
  });

  it('ninguém com carteira: ninguém na lista', () => {
    const r = calcularAposta(rolDe([0, 1], [null, null]), 10, 0);
    expect(r).toEqual({ anulada: false, aposta: 10, pagamentos: [] });
  });

  it('2x1, dupla vence com uma sem carteira: o da carteira leva o pote inteiro do perdedor, o outro nada', () => {
    expect(deltas(rolDe([0, 1, 0], ['c0', 'c1', null]), 10, 0)).toEqual({ 0: 10, 1: -10 });
  });

  it('2x1, dupla vence e as duas têm carteira, mas o perdedor não: ninguém ganha nem perde', () => {
    expect(deltas(rolDe([0, 1, 0], ['c0', null, 'c2']), 10, 0)).toEqual({ 0: 0, 2: 0 });
  });

  it('2x2 com um vencedor sem carteira: o outro vencedor leva a aposta dos dois perdedores', () => {
    expect(deltas(rolDe([0, 1, 0, 1], ['c0', 'c1', null, 'c3']), 10, 0)).toEqual({ 0: 20, 1: -10, 3: -10 });
  });

  it('mata-mata com um perdedor sem carteira: o vencedor leva só dos que apostaram', () => {
    expect(deltas(rolDe([0, 1, 2], ['c0', null, 'c2']), 10, 0)).toEqual({ 0: 10, 2: -10 });
  });
});

describe('calcularAposta — a divisão do pote', () => {
  it('a sobra de uma divisão que não fecha vai ao primeiro vencedor do rol (por lugar), e o dinheiro continua somando zero', () => {
    // aposta ímpar de propósito: com 15 no pote e dois vencedores, 7 para cada e 1 de sobra
    const d = deltas(rolDe([0, 1, 0], todos(3)), 5, 0);
    expect(d).toEqual({ 0: 3, 1: -5, 2: 2 });
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('o "primeiro" é pelo menor lugar, mesmo que o rol venha desordenado', () => {
    const rol = rolDe([0, 1, 0], todos(3)).reverse();
    expect(deltas(rol, 5, 0)).toEqual({ 0: 3, 1: -5, 2: 2 });
  });

  it('a sobra vai ao primeiro vencedor COM carteira', () => {
    expect(deltas(rolDe([0, 0, 1, 0], [null, 'c1', 'c2', 'c3']), 5, 0)).toEqual({ 1: 3, 2: -5, 3: 2 });
  });

  it('com as apostas do catálogo nenhuma divisão deixa sobra (todas pares) e cada vencedor leva a mesma coisa', () => {
    for (const aposta of APOSTAS_DA_SALA) {
      const d = deltas(rolDe([0, 1, 0], todos(3)), aposta, 0);
      expect(d[0], String(aposta)).toBe(d[2]);
    }
  });
});

describe('calcularAposta — o dinheiro só muda de mãos, nunca nasce nem some', () => {
  const formacoes: readonly (readonly number[])[] = [[0, 1], [0, 1, 0], [0, 1, 0, 1], [0, 1, 2], [0, 1, 2, 3]];

  it('em toda formação, toda combinação de quem tem carteira, todo vencedor e toda aposta (inclusive ímpares), a soma é zero e quem perdeu nunca ganha', () => {
    let casos = 0;
    for (const equipes of formacoes) {
      for (let mascara = 0; mascara < 1 << equipes.length; mascara++) {
        const carteiras = equipes.map((_, i) => ((mascara >> i) & 1 ? `c${i}` : null));
        for (const vencedor of new Set(equipes)) {
          for (const aposta of [...APOSTAS_DA_SALA, 5, 7, 33]) {
            const rol = rolDe(equipes, carteiras);
            const r = calcularAposta(rol, aposta, vencedor);
            if (r.anulada) throw new Error('não deveria anular');
            const soma = r.pagamentos.reduce((a, p) => a + p.delta, 0);
            expect(soma, `${equipes} ${mascara} v${vencedor} a${aposta}`).toBe(0);
            for (const p of r.pagamentos) {
              expect(Number.isInteger(p.delta)).toBe(true);
              const venceu = equipes[p.lugar] === vencedor;
              if (!venceu) expect(p.delta).toBeLessThanOrEqual(0);
              else expect(p.delta).toBeGreaterThanOrEqual(0);
              if (!venceu) expect(p.delta === -aposta || p.delta === 0).toBe(true);
            }
            casos++;
          }
        }
      }
    }
    expect(casos).toBeGreaterThan(400);
  });

  it('um perdedor com carteira só perde (e paga a aposta inteira) quando algum vencedor tem carteira para receber', () => {
    expect(deltas(rolDe([0, 1], ['c0', 'c1']), 10, 0)[1]).toBe(-10);
    expect(deltas(rolDe([0, 1], [null, 'c1']), 10, 0)[1]).toBe(0);
  });
});

describe('calcularAposta — carteira repetida anula', () => {
  it('a mesma carteira em dois lugares do rol: anulada, ninguém paga nem recebe', () => {
    expect(calcularAposta(rolDe([0, 1], ['c0', 'c0']), 10, 0)).toEqual({ anulada: true, aposta: 10, motivo: 'carteira-repetida' });
    expect(calcularAposta(rolDe([0, 1, 0, 1], ['c0', 'c1', 'c2', 'c0']), 10, 1)).toMatchObject({ anulada: true });
  });

  it('vale mesmo na mesma equipe e mesmo que a repetida esteja perdendo para si mesma', () => {
    expect(calcularAposta(rolDe([0, 1, 0], ['c0', 'c1', 'c0']), 10, 0)).toMatchObject({ anulada: true });
    expect(calcularAposta(rolDe([0, 1, 2], ['c0', 'c1', 'c1']), 10, 0)).toMatchObject({ anulada: true });
  });

  it('sem carteira não é "repetida": dois lugares sem carteira apostam normalmente com os outros', () => {
    expect(deltas(rolDe([0, 1, 2, 3], ['c0', null, null, 'c3']), 10, 0)).toEqual({ 0: 10, 3: -10 });
  });
});

describe('calcularAposta — entradas absurdas', () => {
  it.each([0, -10, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('aposta %s não é aposta', (aposta) => {
    expect(() => calcularAposta(rolDe([0, 1], todos(2)), aposta, 0)).toThrow(RangeError);
  });

  it('uma equipe vencedora que não está no rol ninguém ganha nem perde', () => {
    expect(calcularAposta(rolDe([0, 1], todos(2)), 10, 7)).toEqual({ anulada: false, aposta: 10, pagamentos: [{ lugar: 0, nome: 'J0', carteira: 'c0', delta: 0 }, { lugar: 1, nome: 'J1', carteira: 'c1', delta: 0 }] });
  });

  it('não muda o rol que recebeu', () => {
    const rol = rolDe([0, 1, 0], todos(3));
    const copia = structuredClone(rol);
    calcularAposta(rol, 10, 0);
    expect(rol).toEqual(copia);
  });
});

describe('valeMoeda — a partida tem contraparte com carteira (L25)', () => {
  it('duas carteiras de equipes diferentes: vale', () => {
    expect(valeMoeda(rolDe([0, 1], ['a', 'b']))).toBe(true);
  });

  it('mata-mata: duas carteiras entre três equipes valem, e uma só não', () => {
    expect(valeMoeda(rolDe([0, 1, 2], ['a', null, 'c']))).toBe(true);
    expect(valeMoeda(rolDe([0, 1, 2], ['a', null, null]))).toBe(false);
  });

  it('sem carteira nenhuma, ou com uma só, não vale', () => {
    expect(valeMoeda(rolDe([0, 1], [null, null]))).toBe(false);
    expect(valeMoeda(rolDe([0, 1], ['a', null]))).toBe(false);
    expect(valeMoeda(rolDe([0, 1], [null, 'b']))).toBe(false);
  });

  it('todas as carteiras na mesma equipe não vale: ninguém tem de quem receber nem a quem pagar', () => {
    expect(valeMoeda(rolDe([0, 0, 1], ['a', 'b', null]))).toBe(false);
  });

  it('a mesma carteira em dois lugares anula a aposta, então não vale', () => {
    expect(valeMoeda(rolDe([0, 1], ['a', 'a']))).toBe(false);
  });

  it('concorda com calcularAposta: onde vale, algum dinheiro muda de mãos para quem vença; onde não vale, para ninguém', () => {
    const casos: [readonly number[], readonly (string | null)[]][] = [
      [[0, 1], ['a', 'b']],
      [[0, 0, 1], ['a', 'b', 'c']],
      [[0, 0, 1], ['a', 'b', null]],
      [[0, 1, 2], ['a', null, 'c']],
      [[0, 1], ['a', null]],
      [[0, 1], ['a', 'a']],
    ];
    for (const [equipes, carteiras] of casos) {
      const rol = rolDe(equipes, carteiras);
      const mexe = [...new Set(equipes)].some((vencedor) => {
        const r = calcularAposta(rol, 10, vencedor);
        return !r.anulada && r.pagamentos.some((p) => p.delta !== 0);
      });
      expect(valeMoeda(rol), `${equipes} ${carteiras}`).toBe(mexe);
    }
  });
});
