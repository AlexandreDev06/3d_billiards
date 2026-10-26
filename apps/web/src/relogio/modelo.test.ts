import { describe, expect, it } from 'vitest';
import { RelogioLocal, TEMPOS_DO_SELETOR, leituraDoContador, limitarAoTempo, restanteDoPrazo, rotuloDoTempo } from './modelo';

describe('restanteDoPrazo — o prazo da sala é relativo ao envio', () => {
  it('desconta o tempo que passou desde que o estado chegou', () => {
    expect(restanteDoPrazo(30_000, 1_000, 1_000)).toBe(30_000);
    expect(restanteDoPrazo(30_000, 1_000, 13_500)).toBe(17_500);
  });

  it('nunca fica negativo', () => {
    expect(restanteDoPrazo(500, 0, 4_000)).toBe(0);
    expect(restanteDoPrazo(0, 0, 0)).toBe(0);
  });

  it('sem prazo (sem limite, espera, fim) não há contador', () => {
    expect(restanteDoPrazo(null, 0, 10)).toBeNull();
    expect(restanteDoPrazo(undefined, 0, 10)).toBeNull();
  });

  it('um relógio que andou para trás não alonga o prazo', () => {
    expect(restanteDoPrazo(30_000, 5_000, 4_000)).toBe(30_000);
  });
});

describe('limitarAoTempo — o prazo da sala já conta a animação e a margem', () => {
  it('segura o contador no tempo da tacada enquanto a animação toca', () => {
    expect(limitarAoTempo(41_000, 30)).toBe(30_000);
    expect(limitarAoTempo(30_000, 30)).toBe(30_000);
  });

  it('depois da animação deixa passar o valor real', () => {
    expect(limitarAoTempo(12_300, 30)).toBe(12_300);
    expect(limitarAoTempo(0, 30)).toBe(0);
  });

  it('sem tempo definido ou sem prazo, não há o que limitar', () => {
    expect(limitarAoTempo(null, 30)).toBeNull();
    expect(limitarAoTempo(9_000, null)).toBe(9_000);
  });
});

describe('leituraDoContador', () => {
  it('mostra minutos e segundos arredondando para cima (0:00 só quando acaba)', () => {
    expect(leituraDoContador(30_000, 10)?.texto).toBe('0:30');
    expect(leituraDoContador(29_001, 10)?.texto).toBe('0:30');
    expect(leituraDoContador(28_999, 10)?.texto).toBe('0:29');
    expect(leituraDoContador(60_000, 10)?.texto).toBe('1:00');
    expect(leituraDoContador(1, 10)?.texto).toBe('0:01');
    expect(leituraDoContador(0, 10)?.texto).toBe('0:00');
  });

  it('fica urgente nos últimos 10 s, inclusive o 0:10', () => {
    expect(leituraDoContador(11_000, 10)?.urgente).toBe(false);
    expect(leituraDoContador(10_001, 10)?.urgente).toBe(false);
    expect(leituraDoContador(10_000, 10)?.urgente).toBe(true);
    expect(leituraDoContador(9_200, 10)?.urgente).toBe(true);
    expect(leituraDoContador(0, 10)?.urgente).toBe(true);
  });

  it('o limite do alerta vem de quem chama', () => {
    expect(leituraDoContador(5_000, 3)?.urgente).toBe(false);
    expect(leituraDoContador(3_000, 3)?.urgente).toBe(true);
  });

  it('null esconde', () => {
    expect(leituraDoContador(null, 10)).toBeNull();
  });
});

describe('rotuloDoTempo e as opções do seletor', () => {
  it('oferece 15, 30, 45, 60 e sem limite, nessa ordem', () => {
    expect(TEMPOS_DO_SELETOR).toEqual([15, 30, 45, 60, null]);
  });

  it('rotula cada opção', () => {
    expect(rotuloDoTempo(15)).toBe('15 s');
    expect(rotuloDoTempo(60)).toBe('60 s');
    expect(rotuloDoTempo(null)).toBe('Sem limite');
  });
});

describe('RelogioLocal — o relógio do hot-seat', () => {
  it('conta o tempo da tacada a partir do início', () => {
    const r = new RelogioLocal(30);
    r.reiniciar(1_000);
    expect(r.restanteMs()).toBe(30_000);
    r.avancar(11_000, true);
    expect(r.restanteMs()).toBe(20_000);
    expect(r.esgotou()).toBe(false);
  });

  it('esgota quando o tempo acaba e fica em zero', () => {
    const r = new RelogioLocal(15);
    r.reiniciar(0);
    r.avancar(14_999, true);
    expect(r.esgotou()).toBe(false);
    r.avancar(15_000, true);
    expect(r.restanteMs()).toBe(0);
    expect(r.esgotou()).toBe(true);
    r.avancar(20_000, true);
    expect(r.restanteMs()).toBe(0);
  });

  it('não conta enquanto está parado (animação, painel aberto) e retoma de onde parou', () => {
    const r = new RelogioLocal(30);
    r.reiniciar(0);
    r.avancar(5_000, true);
    r.avancar(8_000, false);
    r.avancar(20_000, false);
    expect(r.restanteMs()).toBe(25_000);
    r.avancar(21_000, true);
    r.avancar(26_000, true);
    expect(r.restanteMs()).toBe(19_000);
  });

  it('reiniciar devolve o tempo inteiro e tira o esgotado', () => {
    const r = new RelogioLocal(15);
    r.reiniciar(0);
    r.avancar(16_000, true);
    expect(r.esgotou()).toBe(true);
    r.reiniciar(16_000);
    expect(r.esgotou()).toBe(false);
    expect(r.restanteMs()).toBe(15_000);
  });

  it('um quadro longo (aba escondida) não passa de uma vez do tempo da tacada', () => {
    const r = new RelogioLocal(30);
    r.reiniciar(0);
    r.avancar(1_000, true);
    r.avancar(500_000, true);
    expect(r.restanteMs()).toBe(0);
  });

  it('sem limite não tem contador nem esgota', () => {
    const r = new RelogioLocal(null);
    r.reiniciar(0);
    r.avancar(999_999, true);
    expect(r.restanteMs()).toBeNull();
    expect(r.esgotou()).toBe(false);
  });

  it('trocar o tempo vale já e reinicia a contagem', () => {
    const r = new RelogioLocal(30);
    r.reiniciar(0);
    r.avancar(10_000, true);
    r.definirTempo(15, 10_000);
    expect(r.tempoS).toBe(15);
    expect(r.restanteMs()).toBe(15_000);
  });

  it('antes do primeiro reiniciar não há contagem', () => {
    const r = new RelogioLocal(30);
    expect(r.restanteMs()).toBeNull();
    expect(r.esgotou()).toBe(false);
  });
});
