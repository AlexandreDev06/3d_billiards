import { DataTexture, Mesh, RGBAFormat, type MeshPhysicalMaterial, UnsignedByteType, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { CARAS_DO_BALAO } from '../baloes/rosto';
import { raioDoBalaoEm } from '../baloes/silhueta';
import { CONFIG_WEB } from '../config';
import { BaloesProcedurais, estadoVazioDoBalao, geometriaDaCordinha, geometriaDoCorpo, geometriaDoNo, geometriaDoRosto, type EstadoDoBalao } from './balao';

const corpo = CONFIG_WEB.baloes.corpo;

function atlasFalso(): DataTexture {
  return new DataTexture(new Uint8Array(4 * CARAS_DO_BALAO.length), CARAS_DO_BALAO.length, 1, RGBAFormat, UnsignedByteType);
}

function caixa(g: BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!;
}

describe('as geometrias do balão', () => {
  it('o corpo tem a altura e o raio da config', () => {
    const c = caixa(geometriaDoCorpo(corpo, 14));
    expect(c.max.y - c.min.y).toBeCloseTo(2 * corpo.altura, 4);
    expect(c.max.x).toBeCloseTo(corpo.raio, 2);
    expect(c.max.z).toBeCloseTo(corpo.raio, 2);
  });

  it('o rosto cobre só um trecho de frente (+Z) e fica um fio acima do látex', () => {
    const g = geometriaDoRosto(corpo, 14);
    const pos = g.getAttribute('position');
    let maisFora = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + corpo.altura) / (2 * corpo.altura);
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(r).toBeGreaterThanOrEqual(raioDoBalaoEm(t, corpo.raio) - 1e-9);
      expect(r).toBeLessThanOrEqual(raioDoBalaoEm(t, corpo.raio) * 1.02);
      expect(pos.getZ(i)).toBeGreaterThan(0);
      maisFora = Math.max(maisFora, r);
    }
    expect(maisFora).toBeGreaterThan(corpo.raio * 0.9);
  });

  it('o nó e a cordinha ficam abaixo do corpo, a cordinha com o comprimento pedido', () => {
    const no = caixa(geometriaDoNo(corpo, 14));
    // O nó entra um pouco no pé do corpo (para esconder a emenda) e sai por baixo dele.
    expect(no.min.y).toBeLessThan(-corpo.altura - corpo.no);
    expect(no.max.y).toBeLessThanOrEqual(-corpo.altura + corpo.no);
    const fio = caixa(geometriaDaCordinha(corpo, 14));
    expect(fio.max.y).toBeLessThanOrEqual(-corpo.altura);
    const comprimento = fio.max.y - fio.min.y;
    expect(comprimento).toBeGreaterThan(corpo.cordinha * 0.95);
    expect(comprimento).toBeLessThan(corpo.cordinha * 1.1);
  });

  it('menos lados, menos vértices (a qualidade baixa custa menos)', () => {
    const n = (l: number) => geometriaDoCorpo(corpo, l).getAttribute('position').count + geometriaDoRosto(corpo, l).getAttribute('position').count;
    expect(n(8)).toBeLessThan(n(13));
    expect(n(13)).toBeLessThan(n(20));
  });
});

describe('BaloesProcedurais', () => {
  const estado = (mudancas: Partial<EstadoDoBalao> = {}): EstadoDoBalao => ({ ...estadoVazioDoBalao(), escala: 1, cor: 0x3aa0ff, ...mudancas });

  it('nasce escondido, aparece com escala e some com escala zero', () => {
    const b = new BaloesProcedurais(CONFIG_WEB.baloes, 13, atlasFalso());
    expect(b.quantos).toBe(4);
    for (let i = 0; i < 4; i++) expect(b.visivel(i)).toBe(false);
    b.mostrar(1, estado({ x: 1, y: 0.5, z: -0.3 }));
    expect(b.visivel(1)).toBe(true);
    const g = b.grupo.children[1]!;
    expect(g.position.x).toBeCloseTo(1, 6);
    expect(g.position.z).toBeCloseTo(-0.3, 6);
    expect(g.position.y).toBeCloseTo(0.5, 1);
    b.mostrar(1, estado({ escala: 0 }));
    expect(b.visivel(1)).toBe(false);
    b.descartar();
  });

  it('cada balão guarda a sua cara e a sua cor, sem interferir nos outros', () => {
    const b = new BaloesProcedurais(CONFIG_WEB.baloes, 13, atlasFalso());
    b.mostrar(0, estado({ cara: 'sorriso', cor: 0x3aa0ff }));
    b.mostrar(1, estado({ cara: 'triste', cor: 0xffb347 }));
    const rosto = (i: number) => (b.grupo.children[i]!.getObjectByName('balao-rosto') as Mesh).material as unknown as { map: { offset: { x: number } } };
    expect(rosto(0).map.offset.x).toBeCloseTo(1 / CARAS_DO_BALAO.length, 9);
    expect(rosto(1).map.offset.x).toBeCloseTo(4 / CARAS_DO_BALAO.length, 9);
    const cor = (i: number) => ((b.grupo.children[i]!.getObjectByName('balao-corpo') as Mesh).material as unknown as { color: { getHex(): number } }).color.getHex();
    expect(cor(0)).toBe(0x3aa0ff);
    expect(cor(1)).toBe(0xffb347);
    b.descartar();
  });

  it('nos níveis médio e baixo a malha usa uma cópia do látex, e é nela que a cor da equipe vale', () => {
    const b = new BaloesProcedurais(CONFIG_WEB.baloes, 13, atlasFalso());
    const corpoDe = (i: number) => b.grupo.children[i]!.getObjectByName('balao-corpo') as Mesh;
    const noDe = (i: number) => b.grupo.children[i]!.getObjectByName('balao-no') as Mesh;
    // O que `VariantesDeMateriais` faz: troca o material da malha por uma cópia (a cor é a de quando a cópia nasceu).
    const variante = (corpoDe(1).material as MeshPhysicalMaterial).clone();
    corpoDe(1).material = variante;
    noDe(1).material = variante;
    b.mostrar(1, estado({ cor: 0xffb347 }));
    expect((corpoDe(1).material as MeshPhysicalMaterial).color.getHex()).toBe(0xffb347);
    expect((noDe(1).material as MeshPhysicalMaterial).color.getHex()).toBe(0xffb347);
    expect((corpoDe(1).material as MeshPhysicalMaterial).emissive.getHex()).toBe(0xffb347);
    // E de volta ao original (nível alto): a cor segue valendo.
    b.mostrar(1, estado({ cor: 0x3aa0ff }));
    expect((corpoDe(1).material as MeshPhysicalMaterial).color.getHex()).toBe(0x3aa0ff);
    b.descartar();
  });

  it('o balanço move o balão um pouco, em torno do lugar, e o tamanho segue a escala e a forma', () => {
    const b = new BaloesProcedurais(CONFIG_WEB.baloes, 13, atlasFalso());
    const alturas: number[] = [];
    for (let t = 0; t < CONFIG_WEB.baloes.balanco.periodoS; t += 0.2) {
      b.mostrar(0, estado({ y: 0.5, tempoS: t }));
      alturas.push(b.grupo.children[0]!.position.y);
    }
    expect(Math.max(...alturas) - Math.min(...alturas)).toBeGreaterThan(CONFIG_WEB.baloes.balanco.alturaM);
    expect(Math.max(...alturas) - 0.5).toBeLessThanOrEqual(CONFIG_WEB.baloes.balanco.alturaM + 1e-9);
    b.mostrar(0, estado({ largura: 1.2, altura: 1.1, escala: 0.5 }));
    const s = b.grupo.children[0]!.scale;
    expect(s.x).toBeCloseTo(0.6, 9);
    expect(s.y).toBeCloseTo(0.55, 9);
    expect(s.z).toBeCloseTo(0.6, 9);
    b.descartar();
  });

  it('trocar os lados refaz as malhas', () => {
    const b = new BaloesProcedurais(CONFIG_WEB.baloes, 20, atlasFalso());
    const corpoDe = () => (b.grupo.children[0]!.getObjectByName('balao-corpo') as Mesh).geometry.getAttribute('position').count;
    const antes = corpoDe();
    b.definirLados(8);
    expect(corpoDe()).toBeLessThan(antes);
    b.descartar();
  });
});
