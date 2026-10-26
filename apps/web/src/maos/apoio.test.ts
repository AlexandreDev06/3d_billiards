import { describe, expect, it } from 'vitest';
import { MESA_BAR } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm, apoioEm } from './apoio';

const obst = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);

describe('apoioEm: o que sustenta uma mão num ponto da mesa', () => {
  it('dentro da área de jogo é o pano, na altura zero', () => {
    expect(apoioEm(obst, 0, 0)).toEqual({ altura: 0, tipo: 'pano' });
    expect(apoioEm(obst, obst.semiX - 0.4, obst.semiZ - 0.01).tipo).toBe('pano');
  });

  it('além do nariz vem a borracha, depois a moldura, na altura de cada uma', () => {
    const naBorracha = apoioEm(obst, 0.4, obst.semiZ + obst.larguraBorracha / 2);
    expect(naBorracha.tipo).toBe('borracha');
    expect(naBorracha.altura).toBe(obst.alturaBorracha);
    const naMoldura = apoioEm(obst, 0.4, obst.semiZ + obst.larguraBorracha + obst.larguraMoldura / 2);
    expect(naMoldura.tipo).toBe('moldura');
    expect(naMoldura.altura).toBe(obst.alturaMoldura);
    expect(apoioEm(obst, obst.semiX + obst.larguraBorracha / 2, 0.1).tipo).toBe('borracha');
  });

  it('fora da moldura não há nada: ar, sem altura', () => {
    const longe = apoioEm(obst, 0.4, obst.semiZ + obst.larguraBorracha + obst.larguraMoldura + 0.05);
    expect(longe.tipo).toBe('ar');
    expect(longe.altura).toBe(-Infinity);
  });

  it('o buraco de uma caçapa não sustenta nada, mesmo dentro da área de jogo ou da tabela', () => {
    for (const v of obst.vaos) {
      expect(apoioEm(obst, v.cx, v.cz).tipo, `centro da caçapa em ${v.cx.toFixed(2)}, ${v.cz.toFixed(2)}`).toBe('ar');
      const naBoca = apoioEm(obst, v.bx + v.ex * 0.01, v.bz + v.ez * 0.01);
      expect(naBoca.tipo).toBe('ar');
    }
  });

  it('a moldura, as alturas e as larguras são as da elevação do taco (o taco e a mão veem a mesma mesa)', () => {
    expect(obst.alturaMoldura).toBeGreaterThan(obst.alturaBorracha);
    expect(obst.alturaBorracha).toBeGreaterThan(MESA_BAR.alturaTabela - 1e-9);
  });
});

describe('alturaDoApoioEm', () => {
  it('dá a mesma altura de apoioEm em todo o entorno da mesa', () => {
    for (let x = -1.6; x <= 1.6; x += 0.037) {
      for (let z = -0.9; z <= 0.9; z += 0.041) expect(alturaDoApoioEm(obst, x, z)).toBe(apoioEm(obst, x, z).altura);
    }
  });
});
