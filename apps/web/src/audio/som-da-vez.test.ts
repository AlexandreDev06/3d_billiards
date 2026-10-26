import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { jogadorEhDoLugar, somDoTempoEsgotado, somsDaTroca } from './som-da-vez';

const CFG = CONFIG_WEB.audio.avisos;
const base = { hotSeat: false, euRecebo: false, motivo: 'tacada' as const };

describe('somsDaTroca — hot-seat', () => {
  it('a vez passou depois de uma tacada: o sino da vez, na hora (quem ouve é sempre quem passa a jogar)', () => {
    expect(somsDaTroca({ ...base, hotSeat: true }, CFG)).toEqual([{ som: 'vez-sua', atrasoMs: 0 }]);
  });

  it('o tempo acabou: a batida agora e o sino logo depois, para não se atropelarem', () => {
    expect(somsDaTroca({ ...base, hotSeat: true, motivo: 'tempo' }, CFG)).toEqual([
      { som: 'tempo-esgotado', atrasoMs: 0 },
      { som: 'vez-sua', atrasoMs: CFG.sinoDepoisDoEsgotadoMs },
    ]);
    expect(CFG.sinoDepoisDoEsgotadoMs).toBeGreaterThan(450);
  });

  it('no hot-seat o que é "minha" no online não muda nada: é sempre o sino', () => {
    expect(somsDaTroca({ ...base, hotSeat: true, euRecebo: false }, CFG)).toEqual([{ som: 'vez-sua', atrasoMs: 0 }]);
  });
});

describe('somsDaTroca — online', () => {
  it('a vez chegou para mim: o sino', () => {
    expect(somsDaTroca({ ...base, euRecebo: true }, CFG)).toEqual([{ som: 'vez-sua', atrasoMs: 0 }]);
  });

  it('a vez passou para outro: o tique discreto', () => {
    expect(somsDaTroca(base, CFG)).toEqual([{ som: 'vez-outro', atrasoMs: 0 }]);
  });

  it('o motivo só conta no hot-seat: online a batida do tempo vem pela mensagem da sala, não por aqui', () => {
    expect(somsDaTroca({ ...base, euRecebo: true, motivo: 'tempo' }, CFG)).toEqual([{ som: 'vez-sua', atrasoMs: 0 }]);
    expect(somsDaTroca({ ...base, motivo: 'tempo' }, CFG)).toEqual([{ som: 'vez-outro', atrasoMs: 0 }]);
  });
});

describe('somDoTempoEsgotado (mensagem da sala)', () => {
  it('quem perdeu ouve a batida, quem recebe o sino e os outros o tique', () => {
    const aviso = { lugar: 0, proximo: 1 };
    expect(somDoTempoEsgotado(aviso, 0)).toBe('tempo-esgotado');
    expect(somDoTempoEsgotado(aviso, 1)).toBe('vez-sua');
    expect(somDoTempoEsgotado(aviso, 2)).toBe('vez-outro');
  });

  it('espectador (sem lugar) ouve o tique', () => {
    expect(somDoTempoEsgotado({ lugar: 0, proximo: 1 }, null)).toBe('vez-outro');
  });

  it('se por algum motivo perde e recebe a mesma pessoa (1 jogador), vale a batida', () => {
    expect(somDoTempoEsgotado({ lugar: 2, proximo: 2 }, 2)).toBe('tempo-esgotado');
  });
});

describe('jogadorEhDoLugar', () => {
  it('compara o id lugar-N da roda com o meu lugar; espectador não é de ninguém', () => {
    expect(jogadorEhDoLugar('lugar-2', 2)).toBe(true);
    expect(jogadorEhDoLugar('lugar-2', 3)).toBe(false);
    expect(jogadorEhDoLugar('lugar-0', null)).toBe(false);
    expect(jogadorEhDoLugar('lugar-12', 1)).toBe(false);
    expect(jogadorEhDoLugar('lugar-null', null)).toBe(false);
  });
});
