import {
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { Ponto2 } from '@sinuca/fisica';
import type { ConfigMesa } from '../config';
import type { FuroVisual } from './geometria-mesa';
import type { MateriaisMesa } from './materiais-mesa';

/** Escurece com a profundidade: o tubo começa em cinza muito escuro e termina em preto, sem degrau para o fundo. */
function escurecer(geometria: CylinderGeometry): void {
  const posicao = geometria.getAttribute('position');
  const cores: number[] = [];
  let maior = -Infinity;
  let menor = Infinity;
  for (let i = 0; i < posicao.count; i++) {
    maior = Math.max(maior, posicao.getY(i));
    menor = Math.min(menor, posicao.getY(i));
  }
  for (let i = 0; i < posicao.count; i++) {
    const t = (posicao.getY(i) - menor) / (maior - menor);
    const tom = 0.012 * t * t * t;
    cores.push(tom, tom, tom);
  }
  geometria.setAttribute('color', new Float32BufferAttribute(cores, 3));
}

/**
 * A normal de cada ponto do `caminho` (perpendicular à direção dele ali), virada para o interior do entalhe, isto é, para o
 * lado do eixo da caçapa: no arco é a do centro do buraco, e nas paredes retas a que aponta para a garganta.
 */
export function normaisParaDentro(furo: FuroVisual, caminho: readonly Ponto2[]): Ponto2[] {
  return caminho.map((p, i) => {
    const antes = caminho[Math.max(i - 1, 0)]!;
    const depois = caminho[Math.min(i + 1, caminho.length - 1)]!;
    const comprimento = Math.hypot(depois.x - antes.x, depois.z - antes.z) || 1;
    // perpendicular à tangente; o sinal que aponta para o centro do buraco aponta para dentro do entalhe
    const nx = -(depois.z - antes.z) / comprimento;
    const nz = (depois.x - antes.x) / comprimento;
    const paraDentro = (furo.centro.x - p.x) * nx + (furo.centro.z - p.z) * nz >= 0;
    return paraDentro ? { x: nx, z: nz } : { x: -nx, z: -nz };
  });
}

/** Chapa vertical que acompanha o caminho do entalhe, a `recuo` para dentro dele, de `yCima` a `yBaixo`. */
function criarChapa(caminho: readonly Ponto2[], normais: readonly Ponto2[], recuo: number, yCima: number, yBaixo: number): BufferGeometry {
  const posicoes: number[] = [];
  const normaisDaMalha: number[] = [];
  const indices: number[] = [];
  caminho.forEach((p, i) => {
    const n = normais[i]!;
    const x = p.x + n.x * recuo;
    const z = p.z + n.z * recuo;
    posicoes.push(x, yCima, z, x, yBaixo, z);
    normaisDaMalha.push(n.x, 0, n.z, n.x, 0, n.z);
    if (i > 0) indices.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1);
  });
  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new Float32BufferAttribute(posicoes, 3));
  geometria.setAttribute('normal', new Float32BufferAttribute(normaisDaMalha, 3));
  geometria.setIndex(indices);
  return geometria;
}

/**
 * A caçapa por dentro e por cima: o buraco escuro (o círculo de queda da física) do pano para baixo, com gradiente até o
 * preto; o forro de couro na parede do entalhe da moldura (as paredes retas que continuam as faces das quinas e o arco de
 * fora do buraco) e, no topo dele, só um lábio fino de alumínio.
 *
 * @param caminho o entalhe da moldura, de uma face a outra (`entalhesDaMoldura`)
 * @param yTopo altura do topo da moldura
 */
export function criarCacapa(
  furo: FuroVisual,
  caminho: readonly Ponto2[],
  cfg: ConfigMesa,
  materiais: MateriaisMesa,
  yTopo: number,
): Group {
  const grupo = new Group();
  grupo.name = `cacapa-${furo.fisica.id}`;

  const alturaDoTubo = cfg.profundidadeTubo - cfg.espessuraPano;
  const tubo = new CylinderGeometry(furo.raio, furo.raio, alturaDoTubo, 56, 6, true);
  escurecer(tubo);
  const malhaTubo = new Mesh(tubo, materiais.tubo);
  malhaTubo.position.set(furo.centro.x, -cfg.espessuraPano - alturaDoTubo / 2, furo.centro.z);
  grupo.add(malhaTubo);

  const fundo = new CircleGeometry(furo.raio, 40);
  fundo.rotateX(-Math.PI / 2);
  const malhaFundo = new Mesh(fundo, materiais.fundo);
  malhaFundo.position.set(furo.centro.x, -cfg.profundidadeTubo, furo.centro.z);
  grupo.add(malhaFundo);

  const normais = normaisParaDentro(furo, caminho);
  const forro = new Mesh(criarChapa(caminho, normais, cfg.couro.espessura, yTopo, -cfg.espessuraPano), materiais.couro);
  grupo.add(forro);

  // Lábio: um fio fino de alumínio no topo do entalhe, rente à moldura (passa dela só `labio.sobra`).
  const { raio: raioDoLabio, sobra, afastamento } = cfg.labio;
  const yDoLabio = yTopo + sobra - raioDoLabio;
  const pontosDoAro = caminho.map((p, i) => new Vector3(p.x - normais[i]!.x * afastamento, yDoLabio, p.z - normais[i]!.z * afastamento));
  const curva = new CatmullRomCurve3(pontosDoAro, false, 'centripetal');
  grupo.add(new Mesh(new TubeGeometry(curva, caminho.length * 2, raioDoLabio, 10, false), materiais.aluminio));
  const ponta = new SphereGeometry(raioDoLabio, 12, 8);
  for (const p of [pontosDoAro[0]!, pontosDoAro.at(-1)!]) {
    const bola = new Mesh(ponta, materiais.aluminio);
    bola.position.copy(p);
    grupo.add(bola);
  }
  return grupo;
}
