import { describe, expect, it } from 'vitest';
import type { EventoTacada, Gravacao } from '@sinuca/fisica';
import { coerenciaDaGravacao } from './coerencia';
import { quebraComBolaCaida, partidaReal, tacadaReal, TACADA_SUAVE, TACADA_DE_QUEBRA } from './para-testes';

const real = quebraComBolaCaida().resultado.gravacao;

const com = (g: Gravacao, mudanca: Partial<Gravacao>): Gravacao => ({ ...g, ...mudanca });
const eventosSem = (g: Gravacao, fora: (e: EventoTacada) => boolean) => g.eventos.filter((e) => !fora(e));

describe('coerência da gravação', () => {
  it('aceita tacadas reais da física (quebras e tacadas suaves, 20 sementes)', () => {
    for (let s = 1; s <= 20; s++) {
      const mesa = partidaReal(s).mesa;
      for (const p of [TACADA_DE_QUEBRA, { ...TACADA_SUAVE, angulo: s * 0.3 }]) {
        const g = tacadaReal(mesa, p, s).gravacao;
        expect(coerenciaDaGravacao(g), `semente ${s}`).toBeNull();
      }
    }
    expect(coerenciaDaGravacao(real)).toBeNull();
  });

  it('exige taco-bola em t=0 como primeiro evento e um só parou, no fim, em t = duração', () => {
    expect(coerenciaDaGravacao(com(real, { eventos: real.eventos.slice(1) }))).toMatch(/taco-bola/);
    expect(coerenciaDaGravacao(com(real, { eventos: eventosSem(real, (e) => e.tipo === 'parou') }))).toMatch(/parou/);
    expect(coerenciaDaGravacao(com(real, { eventos: [...real.eventos, { tipo: 'parou', t: real.duracao }] }))).toMatch(/parou/);
    expect(coerenciaDaGravacao(com(real, { duracao: real.duracao + 1 }))).toMatch(/parou/);
  });

  it('exige eventos em ordem de tempo', () => {
    const ev = [...real.eventos];
    const i = ev.findIndex((e) => e.tipo === 'bola-bola');
    [ev[i], ev[i + 1]] = [ev[i + 1]!, ev[i]!];
    const g = com(real, { eventos: ev });
    if (ev[i]!.t !== ev[i + 1]!.t) expect(coerenciaDaGravacao(g)).toMatch(/ordem/);
  });

  it('exige que os eventos falem de bolas da gravação', () => {
    const ev = real.eventos.map((e) => (e.tipo === 'bola-bola' ? { ...e, b: 99 } : e));
    expect(coerenciaDaGravacao(com(real, { eventos: ev }))).toMatch(/bola 99/);
  });

  it('bola que cai numa caçapa tem de estar fora da mesa no último quadro, e vice-versa', () => {
    const cacapa = real.eventos.find((e) => e.tipo === 'cacapa')!;
    const n = real.ids.length;
    const i = real.ids.indexOf((cacapa as { bola: number }).bola);

    const naMesaVolta = real.naMesa.slice();
    naMesaVolta[(real.quadros - 1) * n + i] = 1;
    expect(coerenciaDaGravacao(com(real, { naMesa: naMesaVolta }))).toMatch(/caçapa|caiu/);

    const semEvento = eventosSem(real, (e) => e.tipo === 'cacapa' && e.bola === (cacapa as { bola: number }).bola);
    expect(coerenciaDaGravacao(com(real, { eventos: semEvento }))).toMatch(/saiu da mesa sem evento|sem evento/);
  });

  it('bola na mesa no fim precisa estar dentro dos limites da mesa', () => {
    const n = real.ids.length;
    const pos = real.posicoes.slice();
    const k = (real.quadros - 1) * n + real.ids.findIndex((_, i) => real.naMesa[(real.quadros - 1) * n + i] === 1);
    pos[k * 3] = 50;
    expect(coerenciaDaGravacao(com(real, { posicoes: pos }))).toMatch(/fora da mesa|limites/);
  });
});
