import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { PontoDoPerfil } from './perfil-do-taco';

/**
 * Peça torneada: o perfil (raio `r` a `q` m da ponta) girado em volta do eixo do taco. A ponta fica na origem e o corpo corre ao
 * longo de -X (como o grupo do taco). `u` das coordenadas de textura dá a volta (0 a 1) e `v` vai de 0 (primeiro ponto) a 1 (último),
 * proporcional ao comprimento, não ao índice do ponto. As normais saem da inclinação do perfil: arestas vivas entre peças, nunca dentro
 * de uma.
 *
 * @param segmentos quantos lados em volta (mais lados, mais redondo)
 */
export function geometriaTorneada(pontos: readonly PontoDoPerfil[], segmentos: number): BufferGeometry {
  if (pontos.length < 2) throw new RangeError('o perfil precisa de pelo menos dois pontos');
  const lados = Math.max(Math.floor(segmentos), 3);
  const aneis = pontos.length;
  const colunas = lados + 1;
  const posicoes = new Float32Array(aneis * colunas * 3);
  const normais = new Float32Array(aneis * colunas * 3);
  const uvs = new Float32Array(aneis * colunas * 2);
  const q0 = pontos[0]!.q;
  const extensao = pontos[aneis - 1]!.q - q0 || 1;
  const indices: number[] = [];

  for (let i = 0; i < aneis; i++) {
    const p = pontos[i]!;
    const antes = pontos[Math.max(i - 1, 0)]!;
    const depois = pontos[Math.min(i + 1, aneis - 1)]!;
    const dq = depois.q - antes.q;
    const inclinacao = dq > 0 ? (depois.r - antes.r) / dq : 0;
    const norma = Math.hypot(inclinacao, 1);
    for (let j = 0; j < colunas; j++) {
      const angulo = (2 * Math.PI * j) / lados;
      const c = Math.cos(angulo);
      const s = Math.sin(angulo);
      const v = i * colunas + j;
      posicoes[3 * v] = -p.q;
      posicoes[3 * v + 1] = p.r * c;
      posicoes[3 * v + 2] = p.r * s;
      normais[3 * v] = inclinacao / norma;
      normais[3 * v + 1] = c / norma;
      normais[3 * v + 2] = s / norma;
      uvs[2 * v] = j / lados;
      uvs[2 * v + 1] = (p.q - q0) / extensao;
    }
  }
  for (let i = 0; i < aneis - 1; i++) {
    for (let j = 0; j < lados; j++) {
      const a = i * colunas + j;
      const b = a + 1;
      const c = a + colunas;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new Float32BufferAttribute(posicoes, 3));
  geometria.setAttribute('normal', new Float32BufferAttribute(normais, 3));
  geometria.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometria.setIndex(indices);
  geometria.computeBoundingSphere();
  geometria.computeBoundingBox();
  return geometria;
}
