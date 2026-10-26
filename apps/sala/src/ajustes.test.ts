import { describe, expect, it } from 'vitest';
import { LUGARES_POR_MODO, MODOS_DE_SALA, MODOS_POR_MODALIDADE, type ModoSala } from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import { LINHA_DESLIGADA, completarLinha, completarRelogio, escolherModo } from './ajustes';

describe('completarLinha', () => {
  it('sem pedido é a linha desligada', () => {
    expect(completarLinha(undefined)).toEqual({ previsao: false, bolaAtingida: false });
    expect(completarLinha({})).toEqual(LINHA_DESLIGADA);
  });

  it('previsao ligada; bolaAtingida ausente = desligada', () => {
    expect(completarLinha({ previsao: true })).toEqual({ previsao: true, bolaAtingida: false });
    expect(completarLinha({ previsao: true, bolaAtingida: true })).toEqual({ previsao: true, bolaAtingida: true });
  });

  it('bolaAtingida sem previsão não vale', () => {
    expect(completarLinha({ previsao: false, bolaAtingida: true })).toEqual({ previsao: false, bolaAtingida: false });
    expect(completarLinha({ bolaAtingida: true })).toEqual({ previsao: false, bolaAtingida: false });
  });

  it('parcial completa com a base: o que não vem fica como estava', () => {
    const ligada = { previsao: true, bolaAtingida: true };
    expect(completarLinha({}, ligada)).toEqual(ligada);
    expect(completarLinha({ bolaAtingida: false }, ligada)).toEqual({ previsao: true, bolaAtingida: false });
    expect(completarLinha({ previsao: false }, ligada)).toEqual(LINHA_DESLIGADA);
  });
});

describe('completarRelogio', () => {
  const base = { tempoS: 30, aoEsgotar: 'perde-a-vez' } as const;

  it('o que não vem fica como a base; null é sem limite e vale como valor', () => {
    expect(completarRelogio(undefined, base)).toEqual(base);
    expect(completarRelogio({}, base)).toEqual(base);
    expect(completarRelogio({ tempoS: 45 }, base)).toEqual({ tempoS: 45, aoEsgotar: 'perde-a-vez' });
    expect(completarRelogio({ tempoS: null }, base)).toEqual({ tempoS: null, aoEsgotar: 'perde-a-vez' });
    expect(completarRelogio({ tempoS: 15 }, { tempoS: null, aoEsgotar: 'perde-a-vez' })).toEqual({ tempoS: 15, aoEsgotar: 'perde-a-vez' });
  });

  it('a consequência que ainda não existe devolve o texto da recusa', () => {
    const r = completarRelogio({ aoEsgotar: 'falta' }, base);
    expect(typeof r).toBe('string');
    expect(r).toContain('falta');
  });
});

describe('escolherModo', () => {
  const modo = (r: ReturnType<typeof escolherModo>): string => ('modo' in r ? r.modo : `recusa: ${r.recusa}`);

  it('o modo atual que serve à modalidade fica', () => {
    expect(modo(escolherModo('par-ou-impar', undefined, '2x1'))).toBe('2x1');
    expect(modo(escolherModo('mata-mata', undefined, '1x1x1x1'))).toBe('1x1x1x1');
    expect(modo(escolherModo('mata-mata', undefined, '1x1'))).toBe('1x1');
  });

  it('o que não serve vai ao modo da nova modalidade com o MESMO número de lugares', () => {
    expect(modo(escolherModo('mata-mata', undefined, '2x2'))).toBe('1x1x1x1');
    expect(modo(escolherModo('mata-mata', undefined, '2x1'))).toBe('1x1x1');
    expect(modo(escolherModo('par-ou-impar', undefined, '1x1x1x1'))).toBe('2x2');
    expect(modo(escolherModo('par-ou-impar', undefined, '1x1x1'))).toBe('2x1');
  });

  it('só se nenhum tiver o mesmo número de lugares vai ao primeiro do catálogo (catálogo de mentira, sem 3 nem 4 lugares)', () => {
    const catalogo: Record<Modalidade, readonly ModoSala[]> = { 'par-ou-impar': ['1x1', '2x1', '2x2'], 'mata-mata': ['1x1'] };
    expect(modo(escolherModo('mata-mata', undefined, '2x2', catalogo))).toBe('1x1');
    expect(modo(escolherModo('mata-mata', undefined, '2x1', catalogo))).toBe('1x1');
    expect(modo(escolherModo('mata-mata', undefined, '1x1x1', catalogo))).toBe('1x1');
    // com um de 4 lugares no catálogo, o de 4 lugares vence o primeiro
    const comQuatro: Record<Modalidade, readonly ModoSala[]> = { 'par-ou-impar': ['1x1'], 'mata-mata': ['1x1', '1x1x1x1'] };
    expect(modo(escolherModo('mata-mata', undefined, '2x2', comQuatro))).toBe('1x1x1x1');
    expect(modo(escolherModo('mata-mata', undefined, '2x1', comQuatro))).toBe('1x1');
  });

  it('o modo pedido vale se serve, senão a recusa diz o que a modalidade aceita; o pedido vence o mesmo número', () => {
    expect(modo(escolherModo('mata-mata', '1x1x1', '2x2'))).toBe('1x1x1');
    expect(modo(escolherModo('mata-mata', '2x2', '1x1'))).toBe('recusa: Mata-mata não joga em 2x2 (aceita 1x1, 1x1x1, 1x1x1x1).');
    expect(modo(escolherModo('par-ou-impar', '1x1x1', '1x1'))).toBe('recusa: Par ou ímpar não joga em 1x1x1 (aceita 1x1, 2x1, 2x2).');
  });

  it('no catálogo de verdade toda troca sem pedido acha modo com o mesmo número de lugares: ninguém perde o lugar, o último recurso nunca é usado', () => {
    for (const modalidade of Object.keys(MODOS_POR_MODALIDADE) as Modalidade[]) {
      for (const atual of MODOS_DE_SALA) {
        const r = escolherModo(modalidade, undefined, atual);
        if (!('modo' in r)) throw new Error('sem pedido não há recusa');
        expect(MODOS_POR_MODALIDADE[modalidade], `${modalidade} de ${atual}`).toContain(r.modo);
        expect(LUGARES_POR_MODO[r.modo], `${modalidade} de ${atual}`).toBe(LUGARES_POR_MODO[atual]);
      }
    }
  });
});
