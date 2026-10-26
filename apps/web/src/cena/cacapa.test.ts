import { describe, expect, it } from 'vitest';
import { CylinderGeometry, CircleGeometry, Mesh, TubeGeometry, Vector3, type BufferGeometry, type Material } from 'three';
import { MESA_BAR } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { criarCacapa, normaisParaDentro } from './cacapa';
import { comMolduraVisual, entalhesDaMoldura } from './geometria-mesa';
import type { MateriaisMesa } from './materiais-mesa';

const cfg = CONFIG_WEB.mesa;
const ALUMINIO = { nome: 'aluminio' } as unknown as Material;
const COURO = { nome: 'couro' } as unknown as Material;
const materiais = { aluminio: ALUMINIO, couro: COURO, tubo: { nome: 'tubo' }, fundo: { nome: 'fundo' } } as unknown as MateriaisMesa;
const mesa = comMolduraVisual(MESA_BAR, cfg);
const yTopo = mesa.alturaTabela + cfg.sobraMoldura;
const limiteX = mesa.comprimento / 2 + mesa.larguraTabela;
const limiteZ = mesa.largura / 2 + mesa.larguraTabela;

/** Vértices de uma malha em coordenadas do mundo. */
function vertices(malha: Mesh): Vector3[] {
  const p = malha.geometry.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => new Vector3().fromBufferAttribute(p, i).add(malha.position));
}

describe.each(entalhesDaMoldura(mesa, cfg).map((e) => ({ id: e.furo.fisica.id, ...e })))('caçapa $id', ({ furo, caminho }) => {
  const grupo = criarCacapa(furo, caminho, cfg, materiais, yTopo);
  const malhas = grupo.children.filter((c): c is Mesh => c instanceof Mesh);
  const de = <T extends BufferGeometry>(tipo: new (...a: never[]) => T): Mesh[] => malhas.filter((m) => m.geometry instanceof tipo);
  const deAluminio = malhas.filter((m) => m.material === ALUMINIO);

  it('tem tubo, fundo, forro, aro e as duas pontas do aro', () => {
    expect(malhas).toHaveLength(6);
    expect(de(CylinderGeometry)).toHaveLength(1);
    expect(de(CircleGeometry)).toHaveLength(1);
    expect(de(TubeGeometry)).toHaveLength(1);
  });

  it('o buraco desce uns 15 cm: o tubo vai do fundo do pano até a profundidade, centrado no círculo de queda e com o raio dele', () => {
    expect(cfg.profundidadeTubo).toBeGreaterThanOrEqual(0.15);
    const tubo = de(CylinderGeometry)[0]!;
    const g = tubo.geometry as CylinderGeometry;
    expect(g.parameters.radiusTop).toBeCloseTo(furo.fisica.queda.raio, 9);
    expect(tubo.position.x).toBeCloseTo(furo.fisica.queda.centro.x, 9);
    expect(tubo.position.z).toBeCloseTo(furo.fisica.queda.centro.z, 9);
    expect(tubo.position.x).toBeCloseTo(furo.centro.x, 9);
    expect(tubo.position.z).toBeCloseTo(furo.centro.z, 9);
    expect(tubo.position.y + g.parameters.height / 2).toBeCloseTo(-cfg.espessuraPano, 9);
    expect(tubo.position.y - g.parameters.height / 2).toBeCloseTo(-cfg.profundidadeTubo, 9);
  });

  it('o tubo escurece com a profundidade e termina em preto, para o fundo não aparecer como disco chapado', () => {
    const cores = de(CylinderGeometry)[0]!.geometry.getAttribute('color');
    const posicao = de(CylinderGeometry)[0]!.geometry.getAttribute('position');
    let maiorNoTopo = 0;
    let maiorNaBase = 0;
    let topo = -Infinity;
    let base = Infinity;
    for (let i = 0; i < posicao.count; i++) {
      topo = Math.max(topo, posicao.getY(i));
      base = Math.min(base, posicao.getY(i));
    }
    for (let i = 0; i < cores.count; i++) {
      if (posicao.getY(i) === topo) maiorNoTopo = Math.max(maiorNoTopo, cores.getX(i));
      if (posicao.getY(i) === base) maiorNaBase = Math.max(maiorNaBase, cores.getX(i));
      expect(cores.getX(i)).toBeLessThanOrEqual(0.02);
    }
    expect(maiorNoTopo).toBeGreaterThan(0.005);
    expect(maiorNaBase).toBeLessThanOrEqual(0.002);
  });

  it('o fundo preto fecha o tubo embaixo', () => {
    const fundo = de(CircleGeometry)[0]!;
    expect(fundo.position.y).toBeCloseTo(-cfg.profundidadeTubo, 9);
    expect(fundo.position.x).toBeCloseTo(furo.centro.x, 9);
    expect(fundo.position.z).toBeCloseTo(furo.centro.z, 9);
  });

  it('a parede do entalhe é um forro escuro (couro), um pouco para dentro do entalhe, do topo da moldura ao fundo do pano', () => {
    const forro = malhas.find((m) => m.material === COURO)!;
    const p = forro.geometry.getAttribute('position');
    expect(p.count).toBe(caminho.length * 2);
    const normais = normaisParaDentro(furo, caminho);
    const ys = new Set<number>();
    for (let i = 0; i < p.count; i++) {
      const ponto = caminho[Math.floor(i / 2)]!;
      const n = normais[Math.floor(i / 2)]!;
      // cada vértice é o do caminho deslocado `couro.espessura` para dentro do entalhe
      expect(p.getX(i)).toBeCloseTo(ponto.x + n.x * cfg.couro.espessura, 6);
      expect(p.getZ(i)).toBeCloseTo(ponto.z + n.z * cfg.couro.espessura, 6);
      ys.add(Number(p.getY(i).toFixed(6)));
    }
    expect([...ys].sort((a, b) => a - b)).toEqual([Number((-cfg.espessuraPano).toFixed(6)), Number(yTopo.toFixed(6))]);
  });

  it('as normais do forro apontam para o interior do entalhe: para o centro do buraco no arco e para a garganta nas paredes retas', () => {
    const normais = normaisParaDentro(furo, caminho);
    caminho.forEach((p, i) => {
      const n = normais[i]!;
      expect(Math.hypot(n.x, n.z)).toBeCloseTo(1, 9);
      expect((furo.centro.x - p.x) * n.x + (furo.centro.z - p.z) * n.z).toBeGreaterThan(0);
    });
    // no arco, a normal é a radial
    caminho.forEach((p, i) => {
      if (Math.abs(Math.hypot(p.x - furo.centro.x, p.z - furo.centro.z) - furo.raio) > 1e-9) return;
      if (i === 0 || i === caminho.length - 1) return;
      const radial = { x: (furo.centro.x - p.x) / furo.raio, z: (furo.centro.z - p.z) / furo.raio };
      expect(normais[i]!.x * radial.x + normais[i]!.z * radial.z).toBeGreaterThan(0.99);
    });
  });

  it('o alumínio é só um lábio fino: o aro e as duas pontas, rente ao topo da moldura (no máximo 3 mm acima)', () => {
    expect(deAluminio).toHaveLength(3);
    for (const malha of deAluminio) {
      for (const v of vertices(malha)) {
        expect(v.y).toBeLessThanOrEqual(yTopo + 0.003);
        expect(v.y).toBeGreaterThanOrEqual(yTopo - 0.006);
      }
    }
    expect((de(TubeGeometry)[0]!.geometry as TubeGeometry).parameters.radius).toBeLessThanOrEqual(0.003);
  });

  it('o lábio contorna só o entalhe: começa e termina nas pontas do caminho e nada dele entra na garganta de borracha nem no buraco', () => {
    const pontas = deAluminio.filter((m) => m.geometry.type === 'SphereGeometry');
    expect(pontas).toHaveLength(2);
    for (const [esfera, ponta] of [[pontas[0]!, caminho[0]!], [pontas[1]!, caminho.at(-1)!]] as const) {
      expect(Math.hypot(esfera.position.x - ponta.x, esfera.position.z - ponta.z)).toBeLessThan(cfg.labio.afastamento + 1e-6);
    }
    for (const malha of deAluminio) {
      for (const v of vertices(malha)) {
        // o lábio fica do lado de fora do forro: nunca dentro do círculo de queda
        expect(Math.hypot(v.x - furo.centro.x, v.z - furo.centro.z)).toBeGreaterThanOrEqual(furo.raio - 0.003);
        // fora do retângulo nariz + tabela (a menos da espessura do próprio lábio)
        expect(Math.abs(v.x) >= limiteX - 0.004 || Math.abs(v.z) >= limiteZ - 0.004).toBe(true);
      }
    }
  });
});
