import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh } from 'three';
import { MESA_BAR } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { furosVisuais } from './geometria-mesa';
import type { MateriaisMesa } from './materiais-mesa';
import { criarCorpoDaMesa } from './mesa-corpo';
import { semiMesa } from './mesa';

const cfg = CONFIG_WEB.mesa;
const semi = semiMesa(MESA_BAR);
const corpo = criarCorpoDaMesa(cfg, {} as MateriaisMesa, semi.x, semi.z);
const furos = furosVisuais(MESA_BAR);

describe('corpo da mesa', () => {
  const pes = corpo.children.filter((c): c is Mesh => c instanceof Mesh && c.geometry instanceof BoxGeometry);

  it('tem quatro pés, um por canto, e o piso na altura de alturaDoPiso abaixo do pano', () => {
    expect(pes).toHaveLength(4);
    expect(new Set(pes.map((p) => `${Math.sign(p.position.x)},${Math.sign(p.position.z)}`)).size).toBe(4);
    const piso = corpo.getObjectByName('piso')!;
    expect(piso.position.y).toBeCloseTo(-cfg.alturaDoPiso, 9);
  });

  it('as sapatas assentam no piso', () => {
    for (const pe of pes) {
      const g = pe.geometry as BoxGeometry;
      const base = pe.position.y - g.parameters.height / 2;
      expect(base).toBeCloseTo(-cfg.alturaDoPiso + cfg.pe.sapata, 9);
    }
  });

  it('nenhum pé aparece pelo fundo de uma caçapa: ou fica abaixo do tubo ou fora do círculo', () => {
    for (const pe of pes) {
      const g = pe.geometry as BoxGeometry;
      const topo = pe.position.y + g.parameters.height / 2;
      for (const f of furos) {
        const nx = Math.min(Math.max(f.centro.x, pe.position.x - g.parameters.width / 2), pe.position.x + g.parameters.width / 2);
        const nz = Math.min(Math.max(f.centro.z, pe.position.z - g.parameters.depth / 2), pe.position.z + g.parameters.depth / 2);
        const sobrepoe = Math.hypot(nx - f.centro.x, nz - f.centro.z) < f.raio;
        if (sobrepoe) expect(topo).toBeLessThanOrEqual(-cfg.profundidadeTubo);
      }
    }
  });

  it('a abertura da saia contém o círculo de todo furo (o tampo da saia não aparece pelas caçapas)', () => {
    const livreX = semi.x - cfg.saia.recuo - cfg.saia.espessura;
    const livreZ = semi.z - cfg.saia.recuo - cfg.saia.espessura;
    for (const f of furos) {
      expect(Math.abs(f.centro.x) + f.raio).toBeLessThan(livreX);
      expect(Math.abs(f.centro.z) + f.raio).toBeLessThan(livreZ);
    }
  });
});
