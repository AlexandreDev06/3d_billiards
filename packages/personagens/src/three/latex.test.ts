import { Color, MeshPhysicalMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { materialDeLatex, tingirMaterial, type LatexDoArtista } from './latex';

const BRANCO = new Color(1, 1, 1);
const doArtista = (numeros: LatexDoArtista['numeros'], temCorDeVertice = true): LatexDoArtista => ({ numeros, temCorDeVertice });

describe('materialDeLatex', () => {
  it('sem o artista, é o látex padrão do pacote, marcado como látex', () => {
    const m = materialDeLatex(0xff0000, BRANCO, 'latex_glb');
    expect(m.roughness).toBe(0.34);
    expect(m.clearcoat).toBe(0.8);
    expect(m.clearcoatRoughness).toBe(0.16);
    expect(m.sheen).toBe(0);
    expect(m.vertexColors).toBe(false);
    expect(m.userData.latex).toBe(true);
  });

  it('os números do artista trocam os do padrão, e o que ele não diz fica como o padrão', () => {
    const m = materialDeLatex(0xff0000, BRANCO, 'latex_glb', undefined, doArtista({ roughness: 0.2, clearcoat: 1, sheen: 0.25, sheenRoughness: 0.45, specularIntensity: 0.5, ior: 1.45, metalness: 0.1, clearcoatRoughness: 0.05 }));
    expect([m.roughness, m.clearcoat, m.sheen, m.sheenRoughness, m.specularIntensity, m.ior, m.metalness, m.clearcoatRoughness]).toEqual([0.2, 1, 0.25, 0.45, 0.5, 1.45, 0.1, 0.05]);
    const so = materialDeLatex(0xff0000, BRANCO, 'latex_glb', undefined, doArtista({ roughness: 0.2 }));
    expect(so.roughness).toBe(0.2);
    expect(so.clearcoat).toBe(0.8);
    expect(so.specularIntensity).toBe(1);
  });

  it('a cor de vértice só liga quando o artista pede e a malha tem o atributo', () => {
    expect(materialDeLatex(0xff0000, BRANCO, 'l', undefined, doArtista({ vertexColors: true }, true)).vertexColors).toBe(true);
    expect(materialDeLatex(0xff0000, BRANCO, 'l', undefined, doArtista({ vertexColors: true }, false)).vertexColors).toBe(false);
    expect(materialDeLatex(0xff0000, BRANCO, 'l', undefined, doArtista({ vertexColors: false }, true)).vertexColors).toBe(false);
    expect(materialDeLatex(0xff0000, BRANCO, 'l', undefined, doArtista({}, true)).vertexColors).toBe(false);
  });

  it('o veludo leva a cor da equipe clareada em 40% (e só com sheen)', () => {
    const m = materialDeLatex(0x00ff00, BRANCO, 'l', undefined, doArtista({ sheen: 0.25 }));
    expect(m.sheenColor.r).toBeCloseTo(0.4, 5);
    expect(m.sheenColor.g).toBeCloseTo(1, 5);
    const sem = materialDeLatex(0x00ff00, BRANCO, 'l', undefined, doArtista({ roughness: 0.2 }));
    expect(sem.sheenColor.getHex()).toBe(0);
    const padrao = materialDeLatex(0x00ff00, BRANCO, 'l');
    expect(padrao.sheenColor.getHex()).toBe(0);
  });

  it('tingirMaterial numa cópia sem sheenColor (variante standard) não quebra', () => {
    const fisico = materialDeLatex(0xff0000, BRANCO, 'l', undefined, doArtista({ sheen: 0.25 }));
    const copia = { color: new Color(), emissive: new Color(), userData: fisico.userData as Record<string, unknown> };
    tingirMaterial(copia, 0x0000ff);
    expect(copia.color.getHex()).toBe(0x0000ff);
    expect(fisico).toBeInstanceOf(MeshPhysicalMaterial);
  });
});
