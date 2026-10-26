import { describe, expect, it } from 'vitest';
import { BufferAttribute, Mesh, MeshBasicMaterial, type Material } from 'three';
import { CONFIG_WEB } from '../config';
import { CaminhoPrevisto } from '../previsao/caminho';
import { criarLinhaDePrevisao } from './linha-previsao';

const LINHA = CONFIG_WEB.previsao.linha;

function caminho(pontos: number[], atingida?: { x: number; z: number; dx: number; dz: number; comprimento: number }): CaminhoPrevisto {
  const c = new CaminhoPrevisto();
  c.pontos.set(pontos);
  c.quantidade = pontos.length / 2;
  if (atingida) Object.assign(c.atingida, { id: 4, ...atingida });
  return c;
}

function malhas(l: ReturnType<typeof criarLinhaDePrevisao>) {
  const [bolao, atingida] = l.grupo.children as Mesh[];
  return { bolao: bolao!, atingida: atingida! };
}

const intervalo = (m: Mesh): number => m.geometry.drawRange.count;
const atributo = (m: Mesh): BufferAttribute => m.geometry.getAttribute('position') as BufferAttribute;
const verticesDe = (m: Mesh): Float32Array => atributo(m).array as Float32Array;

describe('linha de previsão na cena', () => {
  it('nasce escondida, com duas faixas: o caminho do bolão e a bola atingida', () => {
    const l = criarLinhaDePrevisao(LINHA);
    expect(l.grupo.visible).toBe(false);
    expect(l.grupo.children).toHaveLength(2);
  });

  it('mostrar desenha um quadrado por trecho do caminho, na altura configurada', () => {
    const l = criarLinhaDePrevisao(LINHA);
    l.mostrar(caminho([0, 0, 1, 0, 1, 1]), false);
    const { bolao } = malhas(l);
    expect(l.grupo.visible).toBe(true);
    expect(intervalo(bolao)).toBe(12);
    const v = verticesDe(bolao);
    expect(v[1]).toBeCloseTo(LINHA.altura, 6);
    expect(Math.abs(v[2]! - v[5]!)).toBeCloseTo(LINHA.largura, 6);
  });

  it('cada cálculo marca os vértices para subir de novo à placa de vídeo', () => {
    const l = criarLinhaDePrevisao(LINHA);
    const { bolao, atingida } = malhas(l);
    const antes = [atributo(bolao).version, atributo(atingida).version];
    l.mostrar(caminho([0, 0, 1, 0], { x: 1.2, z: 0.3, dx: 0, dz: 1, comprimento: 0.15 }), true);
    expect(atributo(bolao).version).toBeGreaterThan(antes[0]!);
    expect(atributo(atingida).version).toBeGreaterThan(antes[1]!);
  });

  it('a linha da bola atingida sai da origem dela na direção dada, com o comprimento calculado', () => {
    const l = criarLinhaDePrevisao(LINHA);
    l.mostrar(caminho([0, 0, 1, 0], { x: 1.2, z: 0.3, dx: 0, dz: 1, comprimento: 0.15 }), true);
    const { atingida } = malhas(l);
    expect(atingida.visible).toBe(true);
    expect(intervalo(atingida)).toBe(6);
    const v = verticesDe(atingida);
    const zs = [v[2]!, v[5]!, v[8]!, v[11]!];
    expect(Math.min(...zs)).toBeCloseTo(0.3, 5);
    expect(Math.max(...zs)).toBeCloseTo(0.45, 5);
  });

  it('sem a opção, ou com a bola parada, a linha da bola atingida fica escondida', () => {
    const l = criarLinhaDePrevisao(LINHA);
    l.mostrar(caminho([0, 0, 1, 0], { x: 1.2, z: 0.3, dx: 0, dz: 1, comprimento: 0.15 }), false);
    expect(malhas(l).atingida.visible).toBe(false);
    l.mostrar(caminho([0, 0, 1, 0], { x: 1.2, z: 0.3, dx: 0, dz: 0, comprimento: 0 }), true);
    expect(malhas(l).atingida.visible).toBe(false);
    l.mostrar(caminho([0, 0, 1, 0]), true);
    expect(malhas(l).atingida.visible).toBe(false);
  });

  it('esconder some com tudo; mostrar de novo volta', () => {
    const l = criarLinhaDePrevisao(LINHA);
    l.mostrar(caminho([0, 0, 1, 0]), false);
    l.esconder();
    expect(l.grupo.visible).toBe(false);
    l.mostrar(caminho([0, 0, 1, 0]), false);
    expect(l.grupo.visible).toBe(true);
  });

  it('um cálculo curto depois de um longo não deixa trecho velho no desenho', () => {
    const l = criarLinhaDePrevisao(LINHA);
    l.mostrar(caminho([0, 0, 1, 0, 1, 1, 0, 1]), false);
    l.mostrar(caminho([0, 0, 1, 0]), false);
    expect(intervalo(malhas(l).bolao)).toBe(6);
  });

  it('a faixa é discreta: material sem iluminação, sem tonemapping, translúcido, sem escrever profundidade, abaixo das bolas', () => {
    const l = criarLinhaDePrevisao(LINHA);
    for (const m of Object.values(malhas(l))) {
      const mat = m.material as MeshBasicMaterial;
      expect(mat).toBeInstanceOf(MeshBasicMaterial);
      expect(mat.toneMapped).toBe(false);
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBe(LINHA.opacidade);
      expect(mat.depthWrite).toBe(false);
      expect(mat.depthTest).toBe(true);
      expect(m.castShadow).toBe(false);
      expect(m.frustumCulled).toBe(false);
    }
    expect((malhas(l).bolao.material as MeshBasicMaterial).color.getHex()).toBe(LINHA.corBolao);
    expect((malhas(l).atingida.material as MeshBasicMaterial).color.getHex()).toBe(LINHA.corBolaAtingida);
  });

  it('dispose libera geometria e material das duas faixas', () => {
    const l = criarLinhaDePrevisao(LINHA);
    let liberados = 0;
    for (const m of Object.values(malhas(l))) {
      m.geometry.addEventListener('dispose', () => liberados++);
      (m.material as Material).addEventListener('dispose', () => liberados++);
    }
    l.dispose();
    expect(liberados).toBe(4);
  });
});
