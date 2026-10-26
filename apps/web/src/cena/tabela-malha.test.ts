import { describe, expect, it } from 'vitest';
import { Triangle, Vector3, type BufferGeometry } from 'three';
import { BOLA, BOLAO, CONFIG_FISICA_PADRAO, distanciaContatoTabela, pontasTabela, tabelas } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { furosVisuais, perfilNariz } from './geometria-mesa';
import { criarGeometriaTabela } from './tabela-malha';

const mesa = CONFIG_FISICA_PADRAO.mesa;
const cfg = CONFIG_WEB.mesa;
const segmentos = tabelas(mesa);

function triangulos(geometria: BufferGeometry): Triangle[] {
  const posicao = geometria.getAttribute('position');
  const indice = geometria.getIndex();
  const total = indice ? indice.count : posicao.count;
  const ponto = (k: number): Vector3 => new Vector3().fromBufferAttribute(posicao, indice ? indice.getX(k) : k);
  const lista: Triangle[] = [];
  for (let k = 0; k < total; k += 3) lista.push(new Triangle(ponto(k), ponto(k + 1), ponto(k + 2)));
  return lista;
}

describe('malha da tabela', () => {
  const geometrias = segmentos.map((_, i) => criarGeometriaTabela(mesa, cfg, i));
  const todas = geometrias.map(triangulos);

  it('tem normais e UV em todo vértice, sem NaN', () => {
    for (const g of geometrias) {
      const n = g.getAttribute('position').count;
      expect(n).toBeGreaterThan(100);
      expect(g.getAttribute('normal').count).toBe(n);
      expect(g.getAttribute('uv').count).toBe(n);
      for (const nome of ['position', 'normal', 'uv']) {
        expect(g.getAttribute(nome).array.every((v) => Number.isFinite(v))).toBe(true);
      }
    }
  });

  it.each([
    { nome: 'bola', medidas: BOLA },
    { nome: 'bolão', medidas: BOLAO },
  ])('nenhum triângulo entra na bola encostada ($nome), ao longo de todo o nariz', ({ medidas }) => {
    const afastamento = distanciaContatoTabela(medidas.raio, mesa);
    segmentos.forEach((s, i) => {
      const comprimento = Math.hypot(s.fim.x - s.inicio.x, s.fim.z - s.inicio.z);
      for (const fracao of [0.1, 0.5, 0.9]) {
        const centro = new Vector3(
          s.inicio.x + (s.fim.x - s.inicio.x) * fracao + s.normal.x * afastamento,
          medidas.raio,
          s.inicio.z + (s.fim.z - s.inicio.z) * fracao + s.normal.z * afastamento,
        );
        expect(comprimento).toBeGreaterThan(0.1);
        let menor = Infinity;
        const alvo = new Vector3();
        for (const t of todas[i]!) menor = Math.min(menor, t.closestPointToPoint(centro, alvo).distanceTo(centro));
        expect(menor).toBeGreaterThanOrEqual(medidas.raio - 1e-6);
        // e encosta de fato: a borracha passa a menos de 0,1 mm da bola (o nariz)
        expect(menor).toBeLessThan(medidas.raio + 1e-4);
      }
    });
  });

  it('o nariz fica à altura da tabela e passa a no máximo 2 mm de cada quina da física (a ponta é arredondada só no desenho)', () => {
    segmentos.forEach((s, i) => {
      const posicao = geometrias[i]!.getAttribute('position');
      for (const q of [s.inicio, s.fim]) {
        let menor = Infinity;
        for (let k = 0; k < posicao.count; k++) {
          if (Math.abs(posicao.getY(k) - mesa.alturaTabela) < 1e-6) menor = Math.min(menor, Math.hypot(posicao.getX(k) - q.x, posicao.getZ(k) - q.z));
        }
        expect(menor).toBeGreaterThan(1e-4);
        expect(menor).toBeLessThanOrEqual(0.002 + 1e-6);
      }
    });
  });

  it('o topo é plano, para cima, e chega a altura + chanfro', () => {
    for (const g of geometrias) {
      const posicao = g.getAttribute('position');
      const topo = mesa.alturaTabela + cfg.chanfroTopo;
      let maior = -Infinity;
      for (let k = 0; k < posicao.count; k++) maior = Math.max(maior, posicao.getY(k));
      expect(maior).toBeCloseTo(topo, 6);
    }
    for (const lista of todas) {
      const normal = new Vector3();
      const noTopo = lista.filter((t) => [t.a, t.b, t.c].every((v) => v.y > mesa.alturaTabela + cfg.chanfroTopo - 1e-6));
      expect(noTopo.length).toBeGreaterThan(4);
      for (const t of noTopo) expect(t.getNormal(normal).y).toBeGreaterThan(0.999);
    }
  });

  it('a face do nariz aponta para dentro da mesa', () => {
    segmentos.forEach((s, i) => {
      const normal = new Vector3();
      const rebaixo = perfilNariz(mesa, cfg)[0]!.d;
      const fundo = (v: Vector3): number => -((v.x - s.inicio.x) * s.normal.x + (v.z - s.inicio.z) * s.normal.z);
      // triângulos com os três vértices no plano da face do nariz (do pano d = rebaixo ao nariz d = 0)
      const nasFaces = todas[i]!.filter((t) =>
        [t.a, t.b, t.c].every((v) => v.y <= mesa.alturaTabela + 1e-6 && Math.abs(fundo(v) - rebaixo * (1 - v.y / mesa.alturaTabela)) < 1e-6),
      );
      expect(nasFaces.length).toBeGreaterThan(0);
      for (const t of nasFaces) {
        t.getNormal(normal);
        expect(normal.x * s.normal.x + normal.z * s.normal.z).toBeGreaterThan(0.9);
      }
    });
  });

  it('a face da quina é plana, vertical, de ponta a ponta até a linha de trás da borracha, e olha para dentro da garganta (normalFace da física)', () => {
    const furos = furosVisuais(mesa);
    const pontas = pontasTabela(mesa);
    let conferidos = 0;
    segmentos.forEach((s, i) => {
      const g = geometrias[i]!;
      const posicao = g.getAttribute('position');
      const normal = g.getAttribute('normal');
      for (const quina of [s.inicio, s.fim]) {
        const furo = furos.find((f) => f.faces.some((face) => Math.hypot(face.quina.x - quina.x, face.quina.z - quina.z) < 1e-9))!;
        const face = furo.faces.find((f) => Math.hypot(f.quina.x - quina.x, f.quina.z - quina.z) < 1e-9)!;
        const daFisica = pontas.find((p) => p.tabela === i && Math.hypot(p.quina.x - quina.x, p.quina.z - quina.z) < 1e-9)!;
        const noPlano = (v: Vector3): boolean => {
          const rx = v.x - quina.x;
          const rz = v.z - quina.z;
          return Math.abs(rx * furo.eixo.z - rz * furo.eixo.x) < 1e-6 && rx * furo.eixo.x + rz * furo.eixo.z > 1e-6;
        };
        let alcance = 0;
        for (let k = 0; k < posicao.count; k += 3) {
          const v = [0, 1, 2].map((j) => new Vector3().fromBufferAttribute(posicao, k + j));
          if (!v.every(noPlano)) continue;
          const triangulo = new Triangle(v[0]!, v[1]!, v[2]!).getNormal(new Vector3());
          // vertical e olhando para dentro da boca
          expect(Math.abs(triangulo.y)).toBeLessThan(1e-3);
          expect(triangulo.x * daFisica.normalFace.x + triangulo.z * daFisica.normalFace.z).toBeGreaterThan(0.999);
          v.forEach((ponto, j) => {
            alcance = Math.max(alcance, (ponto.x - quina.x) * furo.eixo.x + (ponto.z - quina.z) * furo.eixo.z);
            // depois do arredondado da ponta (que se mistura à face), a normal do vértice é a da face: a aresta com o topo é viva
            if (ponto.y < 0.75 * mesa.alturaTabela - 1e-6 || (ponto.x - quina.x) * furo.eixo.x + (ponto.z - quina.z) * furo.eixo.z < 0.02) return;
            expect(new Vector3().fromBufferAttribute(normal, k + j).dot(triangulo)).toBeGreaterThan(0.99);
            conferidos++;
          });
        }
        // a face corre até a linha de trás da borracha: a larguraTabela do nariz
        expect(alcance).toBeCloseTo((face.naBorracha.x - quina.x) * furo.eixo.x + (face.naBorracha.z - quina.z) * furo.eixo.z, 6);
      }
    });
    expect(conferidos).toBeGreaterThanOrEqual(6);
  });

  it('a borracha acaba nas faces: nenhum vértice entra na garganta nem no buraco', () => {
    const furos = furosVisuais(mesa);
    for (const g of geometrias) {
      const posicao = g.getAttribute('position');
      for (let k = 0; k < posicao.count; k++) {
        const x = posicao.getX(k);
        const z = posicao.getZ(k);
        for (const f of furos) {
          const dx = x - f.boca.x;
          const dz = z - f.boca.z;
          const s = dx * f.eixo.x + dz * f.eixo.z;
          const t = -dx * f.eixo.z + dz * f.eixo.x;
          const naGarganta = s > 1e-6 && s < f.fisica.fundo + f.fisica.raio && Math.abs(t) < f.raio - 1e-5;
          expect(naGarganta || Math.hypot(x - f.centro.x, z - f.centro.z) < f.raio - 1e-5).toBe(false);
        }
      }
    }
  });

  it('o UV do topo é o plano XZ em ladrilhos do tamanho da textura do pano', () => {
    for (const g of geometrias) {
      const posicao = g.getAttribute('position');
      const normal = g.getAttribute('normal');
      const uv = g.getAttribute('uv');
      let conferidos = 0;
      for (let k = 0; k < posicao.count; k++) {
        if (Math.abs(normal.getY(k)) <= 0.6) continue;
        expect(uv.getX(k)).toBeCloseTo(posicao.getX(k) / cfg.ladoTexturaPano, 5);
        expect(uv.getY(k)).toBeCloseTo(posicao.getZ(k) / cfg.ladoTexturaPano, 5);
        conferidos++;
      }
      expect(conferidos).toBeGreaterThan(30);
    }
  });
});
