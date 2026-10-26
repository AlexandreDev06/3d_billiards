import { describe, expect, it } from 'vitest';
import { MODOS_POR_MODALIDADE } from '@sinuca/protocolo';
import { PRESETS_DE_FABRICA, PRESET_BOTECO, PRESET_MATA_MATA, type Jogador, type Modalidade } from '@sinuca/regras';
import { jogadoresDoHotSeat } from '../config';
import { decidirJogarLocal, disponibilidadeDosModos, modosDisponiveis, type PartidaDePe } from './modos';
import { REGRAS_DO_PACOTE, type MotorDeRegras } from './regras';

/** As regras do pacote, mas que só aceitam as rodas de `quantos` jogadores. */
const regrasDe = (...quantos: number[]): MotorDeRegras => ({
  ...REGRAS_DO_PACOTE,
  novaPartida(config, jogadores, rng) {
    if (!quantos.includes(jogadores.length)) throw new Error('não joga assim');
    return REGRAS_DO_PACOTE.novaPartida(config, jogadores, rng);
  },
});

describe('modosDisponiveis', () => {
  it('par ou ímpar, com as regras do pacote: 1x1, 2x1 e 2x2', () => {
    expect(modosDisponiveis(REGRAS_DO_PACOTE, PRESET_BOTECO.regras)).toEqual(['1x1', '2x1', '2x2']);
  });

  it('mata-mata, com as regras do pacote: 2, 3 e 4 jogadores (1x1, 1x1x1 e 1x1x1x1)', () => {
    expect(modosDisponiveis(REGRAS_DO_PACOTE, PRESET_MATA_MATA.regras)).toEqual(['1x1', '1x1x1', '1x1x1x1']);
  });

  it('cada modalidade oferece exatamente os formatos do catálogo do protocolo, na ordem dele', () => {
    for (const preset of PRESETS_DE_FABRICA) {
      expect(modosDisponiveis(REGRAS_DO_PACOTE, preset.regras)).toEqual(MODOS_POR_MODALIDADE[preset.regras.modalidade]);
    }
  });

  it('só oferece o que as regras sabem jogar, cada modo pelo seu número de jogadores', () => {
    expect(modosDisponiveis(regrasDe(2, 4), PRESET_BOTECO.regras)).toEqual(['1x1', '2x2']);
    expect(modosDisponiveis(regrasDe(2, 3), PRESET_BOTECO.regras)).toEqual(['1x1', '2x1']);
    expect(modosDisponiveis(regrasDe(3), PRESET_BOTECO.regras)).toEqual(['2x1']);
    expect(modosDisponiveis(regrasDe(2), PRESET_BOTECO.regras)).toEqual(['1x1']);
    expect(modosDisponiveis(regrasDe(2, 4), PRESET_MATA_MATA.regras)).toEqual(['1x1', '1x1x1x1']);
    expect(modosDisponiveis(regrasDe(5), PRESET_MATA_MATA.regras)).toEqual([]);
  });

  it('prova com a roda que a sala monta: lugar-0, lugar-1, lugar-2 e a equipe de cada lugar', () => {
    const vistas: Jogador[][] = [];
    const espia: MotorDeRegras = { ...REGRAS_DO_PACOTE, novaPartida: (c, jogadores, rng) => (vistas.push([...jogadores]), REGRAS_DO_PACOTE.novaPartida(c, jogadores, rng)) };
    modosDisponiveis(espia, PRESET_BOTECO.regras);
    expect(vistas.map((roda) => roda.map((j) => [j.id, j.equipe]))).toEqual([
      [['lugar-0', 0], ['lugar-1', 1]],
      [['lugar-0', 0], ['lugar-1', 1], ['lugar-2', 0]],
      [['lugar-0', 0], ['lugar-1', 1], ['lugar-2', 0], ['lugar-3', 1]],
    ]);
  });

  it('no mata-mata cada lugar é a própria equipe', () => {
    const vistas: Jogador[][] = [];
    const espia: MotorDeRegras = { ...REGRAS_DO_PACOTE, novaPartida: (c, jogadores, rng) => (vistas.push([...jogadores]), REGRAS_DO_PACOTE.novaPartida(c, jogadores, rng)) };
    modosDisponiveis(espia, PRESET_MATA_MATA.regras);
    expect(vistas.map((roda) => roda.map((j) => j.equipe))).toEqual([[0, 1], [0, 1, 2], [0, 1, 2, 3]]);
  });
});

describe('disponibilidadeDosModos', () => {
  it('responde por modalidade e modo, provando uma vez com o preset de cada uma', () => {
    const jogam = disponibilidadeDosModos(REGRAS_DO_PACOTE, PRESETS_DE_FABRICA);
    expect(jogam('par-ou-impar', '2x2')).toBe(true);
    expect(jogam('mata-mata', '1x1x1x1')).toBe(true);
    expect(jogam('par-ou-impar', '1x1x1')).toBe(false);
    expect(jogam('mata-mata', '2x1')).toBe(false);
  });

  it('segue o motor de regras: sem o 4, o 2x2 e o mata-mata de 4 saem', () => {
    const jogam = disponibilidadeDosModos(regrasDe(2, 3), PRESETS_DE_FABRICA);
    expect(jogam('par-ou-impar', '2x1')).toBe(true);
    expect(jogam('par-ou-impar', '2x2')).toBe(false);
    expect(jogam('mata-mata', '1x1x1')).toBe(true);
    expect(jogam('mata-mata', '1x1x1x1')).toBe(false);
  });

  it('modalidade sem preset não joga nada', () => {
    const jogam = disponibilidadeDosModos(REGRAS_DO_PACOTE, [PRESET_BOTECO]);
    expect(jogam('mata-mata', '1x1')).toBe(false);
    expect(jogam('par-ou-impar', '1x1')).toBe(true);
  });
});

describe('decidirJogarLocal', () => {
  const de = (jogadores: number, acabou: boolean, modalidade: Modalidade = 'par-ou-impar'): PartidaDePe => ({ jogadores, acabou, modalidade });
  const par = (modo: '1x1' | '2x1' | '2x2') => ({ modalidade: 'par-ou-impar' as const, modo });

  it('mesmo modo e partida em andamento: continua a mesma (voltou pelo botão Menu)', () => {
    expect(decidirJogarLocal(de(2, false), par('1x1'))).toBe('continuar');
    expect(decidirJogarLocal(de(3, false), par('2x1'))).toBe('continuar');
    expect(decidirJogarLocal(de(4, false), par('2x2'))).toBe('continuar');
  });

  it('mesmo modo e partida acabada: a próxima sai pela roda das regras', () => {
    expect(decidirJogarLocal(de(2, true), par('1x1'))).toBe('proxima');
    expect(decidirJogarLocal(de(3, true), par('2x1'))).toBe('proxima');
    expect(decidirJogarLocal(de(4, true), par('2x2'))).toBe('proxima');
  });

  it('outro modo, acabada ou não: partida nova com a roda inicial do modo', () => {
    expect(decidirJogarLocal(de(2, false), par('2x1'))).toBe('do-modo');
    expect(decidirJogarLocal(de(2, true), par('2x1'))).toBe('do-modo');
    expect(decidirJogarLocal(de(3, false), par('1x1'))).toBe('do-modo');
    expect(decidirJogarLocal(de(3, true), par('1x1'))).toBe('do-modo');
    expect(decidirJogarLocal(de(3, false), par('2x2'))).toBe('do-modo');
    expect(decidirJogarLocal(de(4, true), par('2x1'))).toBe('do-modo');
  });

  it('outra modalidade com o mesmo número de jogadores também é partida nova', () => {
    expect(decidirJogarLocal(de(2, false), { modalidade: 'mata-mata', modo: '1x1' })).toBe('do-modo');
    expect(decidirJogarLocal(de(3, true, 'mata-mata'), par('2x1'))).toBe('do-modo');
    expect(decidirJogarLocal(de(4, false, 'par-ou-impar'), { modalidade: 'mata-mata', modo: '1x1x1x1' })).toBe('do-modo');
  });

  it('mata-mata: o mesmo modo continua ou segue pela roda', () => {
    expect(decidirJogarLocal(de(3, false, 'mata-mata'), { modalidade: 'mata-mata', modo: '1x1x1' })).toBe('continuar');
    expect(decidirJogarLocal(de(4, true, 'mata-mata'), { modalidade: 'mata-mata', modo: '1x1x1x1' })).toBe('proxima');
    expect(decidirJogarLocal(de(3, true, 'mata-mata'), { modalidade: 'mata-mata', modo: '1x1x1x1' })).toBe('do-modo');
  });

  it('o número de jogadores de cada modo do mesmo PC é o da sala e o da roda inicial', () => {
    expect(jogadoresDoHotSeat('1x1')).toHaveLength(2);
    expect(jogadoresDoHotSeat('2x1')).toHaveLength(3);
    expect(jogadoresDoHotSeat('2x2')).toHaveLength(4);
    expect(jogadoresDoHotSeat('1x1x1')).toHaveLength(3);
    expect(jogadoresDoHotSeat('1x1x1x1')).toHaveLength(4);
    for (const modo of ['1x1', '2x1', '2x2'] as const) expect(decidirJogarLocal(de(jogadoresDoHotSeat(modo).length, false), par(modo))).toBe('continuar');
  });
});
