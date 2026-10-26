import { describe, expect, it } from 'vitest';
import {
  FORMATO_DO_MODO,
  LUGARES_POR_MODO,
  MODALIDADES_DE_SALA,
  MODALIDADE_PADRAO,
  MODOS_DE_SALA,
  MODOS_POR_MODALIDADE,
  equipeDoLugar,
  modoServeAModalidade,
  type ModoSala,
} from './tipos';

describe('modos da sala', () => {
  it('MODOS_DE_SALA, LUGARES_POR_MODO e FORMATO_DO_MODO falam dos mesmos modos', () => {
    expect([...MODOS_DE_SALA].sort()).toEqual(Object.keys(LUGARES_POR_MODO).sort());
    expect([...MODOS_DE_SALA].sort()).toEqual(Object.keys(FORMATO_DO_MODO).sort());
    expect(MODOS_DE_SALA).toEqual(['1x1', '2x1', '2x2', '1x1x1', '1x1x1x1']);
  });

  it('cada modo usa tantos lugares quanto pessoas na formação', () => {
    expect(LUGARES_POR_MODO).toEqual({ '1x1': 2, '2x1': 3, '2x2': 4, '1x1x1': 3, '1x1x1x1': 4 });
    for (const modo of MODOS_DE_SALA) {
      const { formacao, equipes } = FORMATO_DO_MODO[modo];
      expect(equipes.length, modo).toBe(formacao.reduce((a, b) => a + b, 0));
      expect(modo, 'o nome do modo é a formação').toBe(formacao.join('x'));
      // cada equipe tem tantos lugares quanto a formação diz
      formacao.forEach((tamanho, equipe) => expect(equipes.filter((e) => e === equipe).length, `${modo} equipe ${equipe}`).toBe(tamanho));
    }
  });

  it('nos modos de duas equipes a equipe do lugar é a paridade: no 2x1 os lugares 0 e 2 jogam juntos contra o 1', () => {
    const equipes = (modo: ModoSala) => Array.from({ length: LUGARES_POR_MODO[modo] }, (_, l) => equipeDoLugar(modo, l));
    expect(equipes('1x1')).toEqual([0, 1]);
    expect(equipes('2x1')).toEqual([0, 1, 0]);
    expect(equipes('2x2')).toEqual([0, 1, 0, 1]);
  });

  it('no mata-mata cada lugar é a própria equipe', () => {
    const equipes = (modo: ModoSala) => Array.from({ length: LUGARES_POR_MODO[modo] }, (_, l) => equipeDoLugar(modo, l));
    expect(equipes('1x1x1')).toEqual([0, 1, 2]);
    expect(equipes('1x1x1x1')).toEqual([0, 1, 2, 3]);
  });

  it('lugar fora do modo (o estado-sala traz sempre 4) segue a mesma conta, sem undefined', () => {
    expect([0, 1, 2, 3].map((l) => equipeDoLugar('1x1', l))).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2, 3].map((l) => equipeDoLugar('2x1', l))).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2, 3].map((l) => equipeDoLugar('1x1x1', l))).toEqual([0, 1, 2, 3]);
  });

  it('a forma antiga, só com o lugar, segue valendo para o par ou ímpar (e some quando o cliente adotar a nova)', () => {
    expect([0, 1, 2, 3].map(equipeDoLugar)).toEqual([0, 1, 0, 1]);
    expect(equipeDoLugar(2)).toBe(0);
  });
});

describe('catálogo de modos por modalidade', () => {
  it('toda modalidade tem a lista e a lista só tem modos que a sala conhece, sem repetir', () => {
    expect([...MODALIDADES_DE_SALA]).toEqual(Object.keys(MODOS_POR_MODALIDADE));
    expect(MODALIDADES_DE_SALA).toEqual(['par-ou-impar', 'mata-mata']);
    for (const modalidade of MODALIDADES_DE_SALA) {
      const lista = MODOS_POR_MODALIDADE[modalidade];
      expect(lista.length, modalidade).toBeGreaterThan(0);
      expect(new Set(lista).size, modalidade).toBe(lista.length);
      for (const modo of lista) expect(MODOS_DE_SALA, `${modalidade}: ${modo}`).toContain(modo);
    }
  });

  it('o par ou ímpar joga em 1x1, 2x1 e 2x2; o mata-mata em 1x1, 1x1x1 e 1x1x1x1', () => {
    expect(MODOS_POR_MODALIDADE['par-ou-impar']).toEqual(['1x1', '2x1', '2x2']);
    expect(MODOS_POR_MODALIDADE['mata-mata']).toEqual(['1x1', '1x1x1', '1x1x1x1']);
    expect(MODALIDADE_PADRAO).toBe('par-ou-impar');
  });

  it('modoServeAModalidade diz sim só para o que está no catálogo', () => {
    for (const modalidade of MODALIDADES_DE_SALA) {
      for (const modo of MODOS_DE_SALA) expect(modoServeAModalidade(modalidade, modo), `${modalidade} ${modo}`).toBe(MODOS_POR_MODALIDADE[modalidade].includes(modo));
    }
    expect(modoServeAModalidade('mata-mata', '2x2')).toBe(false);
    expect(modoServeAModalidade('par-ou-impar', '1x1x1')).toBe(false);
    expect(modoServeAModalidade('mata-mata', '1x1')).toBe(true);
  });
});
