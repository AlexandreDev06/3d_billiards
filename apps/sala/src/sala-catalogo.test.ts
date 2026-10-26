import { describe, expect, it } from 'vitest';
import { criarRng } from '@sinuca/fisica';
import {
  FORMATO_DO_MODO,
  LUGARES_POR_MODO,
  MODALIDADES_DE_SALA,
  MODOS_DE_SALA,
  MODOS_POR_MODALIDADE,
  equipeDoLugar,
  type ModoSala,
} from '@sinuca/protocolo';
import {
  OPCOES_REGRAS,
  PRESETS_DE_FABRICA,
  formacaoDosJogadores,
  formacoesAceitas,
  novaPartida,
  validarPreset,
  type Formacao,
  type Jogador,
} from '@sinuca/regras';
import { presetDaModalidade } from './regras';

/** Os jogadores que a sala monta para o modo: um por lugar, a equipe de `equipeDoLugar`. */
const jogadoresDoModo = (modo: ModoSala): Jogador[] =>
  Array.from({ length: LUGARES_POR_MODO[modo] }, (_, lugar) => ({ id: `lugar-${lugar}`, nome: `J${lugar}`, equipe: equipeDoLugar(modo, lugar) }));

const espelho = (f: Formacao): Formacao => [...f].sort((a, b) => b - a);
const igual = (a: Formacao, b: Formacao): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

describe('o catálogo de modos do protocolo bate com as regras', () => {
  it('toda modalidade das regras está no catálogo, tem exatamente um preset de fábrica e o preset é válido', () => {
    expect([...MODALIDADES_DE_SALA].sort()).toEqual([...OPCOES_REGRAS.modalidade].sort());
    for (const modalidade of OPCOES_REGRAS.modalidade) {
      const presets = PRESETS_DE_FABRICA.filter((p) => p.regras.modalidade === modalidade);
      expect(presets, modalidade).toHaveLength(1);
      expect(presetDaModalidade(modalidade), modalidade).toBe(presets[0]);
      expect(() => validarPreset(presets[0]), modalidade).not.toThrow();
    }
    expect(PRESETS_DE_FABRICA).toHaveLength(MODALIDADES_DE_SALA.length);
  });

  it('cada modo do catálogo é uma formação que as regras aceitam (formacoesAceitas), na ordem do menu', () => {
    for (const modalidade of MODALIDADES_DE_SALA) {
      const aceitas = formacoesAceitas(presetDaModalidade(modalidade).regras);
      for (const modo of MODOS_POR_MODALIDADE[modalidade]) {
        expect(aceitas.some((f) => igual(f, FORMATO_DO_MODO[modo].formacao)), `${modalidade} em ${modo}`).toBe(true);
      }
    }
  });

  it('toda formação que as regras aceitam tem modo no catálogo (ou o espelho dela: o anfitrião senta sempre na equipe 0)', () => {
    for (const modalidade of MODALIDADES_DE_SALA) {
      const noCatalogo = MODOS_POR_MODALIDADE[modalidade].map((modo) => FORMATO_DO_MODO[modo].formacao);
      for (const f of formacoesAceitas(presetDaModalidade(modalidade).regras)) {
        expect(noCatalogo.some((c) => igual(c, f) || igual(c, espelho(f))), `${modalidade}: ${f.join('×')}`).toBe(true);
      }
    }
  });

  it('um modo fora do catálogo da modalidade não é formação que as regras aceitem, e a novaPartida o recusa', () => {
    for (const modalidade of MODALIDADES_DE_SALA) {
      const { regras } = presetDaModalidade(modalidade);
      const aceitas = formacoesAceitas(regras);
      for (const modo of MODOS_DE_SALA.filter((m) => !MODOS_POR_MODALIDADE[modalidade].includes(m))) {
        expect(aceitas.some((f) => igual(f, FORMATO_DO_MODO[modo].formacao)), `${modalidade} em ${modo}`).toBe(false);
        expect(() => novaPartida(regras, jogadoresDoModo(modo), criarRng(1)), `${modalidade} em ${modo}`).toThrow();
      }
    }
  });

  it('os jogadores que a sala monta para cada modo do catálogo viram uma partida, com a formação do modo', () => {
    for (const modalidade of MODALIDADES_DE_SALA) {
      const { regras } = presetDaModalidade(modalidade);
      for (const modo of MODOS_POR_MODALIDADE[modalidade]) {
        const jogadores = jogadoresDoModo(modo);
        expect(formacaoDosJogadores(jogadores), `${modalidade} em ${modo}`).toEqual(FORMATO_DO_MODO[modo].formacao);
        const { partida } = novaPartida(regras, jogadores, criarRng(7));
        expect(partida.jogadores, `${modalidade} em ${modo}`).toHaveLength(LUGARES_POR_MODO[modo]);
        expect(partida.config.modalidade).toBe(modalidade);
      }
    }
  });

  it('o primeiro modo de cada lista (último recurso da troca de modalidade, quando nenhum tem o mesmo número de lugares) é o menor deles', () => {
    for (const modalidade of MODALIDADES_DE_SALA) {
      const lugares = MODOS_POR_MODALIDADE[modalidade].map((m) => LUGARES_POR_MODO[m]);
      expect(lugares, modalidade).toEqual([...lugares].sort((a, b) => a - b));
    }
  });
});
