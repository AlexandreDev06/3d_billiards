import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MedidasMesa, Ponto2 } from '@sinuca/fisica';
import { aneisTabela, type ConfigGeometriaMesa } from './geometria-mesa';
import { atribuirUv, uvLadrilho } from './uv';

/** Arestas mais abertas que isto ficam vivas; as outras são suavizadas (arredondado da ponta, topo e nariz: até 31°). */
const ANGULO_DA_QUINA = (34 * Math.PI) / 180;

/** Área com sinal do polígono em XZ: positiva no sentido anti-horário (x para a direita, z para cima). */
function areaComSinal(contorno: readonly Ponto2[]): number {
  let soma = 0;
  contorno.forEach((a, i) => {
    const b = contorno[(i + 1) % contorno.length]!;
    soma += a.x * b.z - b.x * a.z;
  });
  return soma / 2;
}

/**
 * A borracha de uma tabela, do pano ao topo: paredes ligando os anéis de `aneisTabela()`
 * (a face do nariz em rebaixo, o arredondado da ponta e as faces da quina, que correm até a linha de trás da borracha) e a
 * tampa de cima. Sem fundo e sem a parede de trás, que ficam escondidos no pano e na moldura.
 *
 * @param ladoTextura lado (m) do quadrado de pano que a textura cobre
 */
export function criarGeometriaTabela(
  mesa: MedidasMesa,
  cfg: ConfigGeometriaMesa & { readonly ladoTexturaPano: number },
  indice: number,
): BufferGeometry {
  const aneis = aneisTabela(mesa, cfg, indice);
  const n = aneis[0]!.contorno.length;
  // O contorno é [nariz reto (2), caminho do fim, caminho do início] com os dois caminhos do mesmo
  // tamanho: a aresta de trás (linha de trás da borracha) liga um ao outro e é a de índice n/2.
  const arestaDeTras = n / 2;
  const viraParaFora = areaComSinal(aneis[0]!.contorno) > 0;
  const posicoes: number[] = [];

  const triangulo = (a: [number, number, number], b: [number, number, number], c: [number, number, number]): void => {
    const area =
      Math.hypot(
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ) / 2;
    if (area < 1e-12) return;
    posicoes.push(...a, ...b, ...c);
  };

  for (let k = 0; k + 1 < aneis.length; k++) {
    const baixo = aneis[k]!;
    const cima = aneis[k + 1]!;
    for (let i = 0; i < n; i++) {
      if (i === arestaDeTras) continue;
      const j = (i + 1) % n;
      const p0: [number, number, number] = [baixo.contorno[i]!.x, baixo.y, baixo.contorno[i]!.z];
      const p1: [number, number, number] = [baixo.contorno[j]!.x, baixo.y, baixo.contorno[j]!.z];
      const q1: [number, number, number] = [cima.contorno[j]!.x, cima.y, cima.contorno[j]!.z];
      const q0: [number, number, number] = [cima.contorno[i]!.x, cima.y, cima.contorno[i]!.z];
      if (viraParaFora) {
        triangulo(p0, q1, p1);
        triangulo(p0, q0, q1);
      } else {
        triangulo(p0, p1, q1);
        triangulo(p0, q1, q0);
      }
    }
  }

  const topo = aneis.at(-1)!;
  const alturaDoTopo = topo.y;
  const tampa = ShapeUtils.triangulateShape(
    topo.contorno.map((p) => new Vector2(p.x, p.z)),
    [],
  );
  for (const [ia, ib, ic] of tampa as [number, number, number][]) {
    const a = topo.contorno[ia!]!;
    let b = topo.contorno[ib!]!;
    let c = topo.contorno[ic!]!;
    // vira para cima (+Y): (b - a) × (c - a) com componente y positiva
    if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
    triangulo([a.x, alturaDoTopo, a.z], [b.x, alturaDoTopo, b.z], [c.x, alturaDoTopo, c.z]);
  }

  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new Float32BufferAttribute(posicoes, 3));
  return atribuirUv(toCreasedNormals(geometria, ANGULO_DA_QUINA), uvLadrilho(cfg.ladoTexturaPano));
}
