import { AnimationClip, Bone, SkinnedMesh, type Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { poseDeRepouso, type Ficha, type OssoDaFicha, type PoseDaFicha } from '../ficha';
import type { MalhaComPele } from '../malha';

/**
 * O referencial do glTF (`y` para cima) para o do personagem do artista (para uma mão: `+y` para os dedos, `+z` para o dorso,
 * `+x` para o mínimo): uma volta de +90° em torno de `x`, `(x, y, z) → (x, -z, y)`. O personagem em cena fica dentro de um grupo
 * com essa volta, e as contas puras trabalham já no referencial do personagem.
 */
export const DE_GLTF_PARA_PERSONAGEM = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 } as const;

/** Nomes das malhas de cada nível de detalhe no arquivo (o artista nomeia um grupo por nível, com uma malha por material dentro). */
export interface NomesDasMalhas {
  readonly alta: string;
  readonly baixa: string;
}

export const NOMES_DAS_MALHAS_PADRAO: NomesDasMalhas = { alta: 'mao_alta', baixa: 'mao_baixa' };

/** Gira (`x`, `y`, `z`) do referencial do glTF para o do personagem. */
function doGltf(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y];
}

/** O quaternion `q` (do glTF) depois da volta para o referencial do personagem: `volta * q`. */
function girarQuaternio(qx: number, qy: number, qz: number, qw: number): [number, number, number, number] {
  const { x: vx, w: vw } = DE_GLTF_PARA_PERSONAGEM;
  return [vw * qx + vx * qw, vw * qy - vx * qz, vw * qz + vx * qy, vw * qw - vx * qx];
}

function ossoDe(gltf: GLTF): SkinnedMesh {
  let achada: SkinnedMesh | null = null;
  gltf.scene.traverse((o) => {
    if (achada === null && o instanceof SkinnedMesh) achada = o;
  });
  if (achada === null) throw new Error('o arquivo não tem malha com esqueleto');
  return achada;
}

/** Só a malha (`SkinnedMesh`) cujo nome, ou o de um pai, começa por `prefixo`. */
export function malhasDoNivel(raiz: Object3D, prefixo: string): SkinnedMesh[] {
  const achadas: SkinnedMesh[] = [];
  raiz.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    for (let p: Object3D | null = o; p !== null; p = p.parent) {
      if (p.name.startsWith(prefixo)) {
        achadas.push(o);
        return;
      }
    }
  });
  return achadas;
}

/** As poses do arquivo (`pose_x` → `x`): o último quadro de cada ação, que é onde a pose está. */
function posesDoGltf(gltf: GLTF, ossos: readonly Bone[]): Map<string, PoseDaFicha> {
  const indice = new Map(ossos.map((o, i) => [o.name, i] as const));
  const repouso = poseDeRepouso({ ossos: ossos.map((o, i) => osso(o, i, ossos)), poses: new Map() });
  const saida = new Map<string, PoseDaFicha>();
  for (const clip of gltf.animations) {
    if (!clip.name.startsWith('pose_')) continue;
    const rotacoes = repouso.rotacoes.slice();
    const posicoes = repouso.posicoes.slice();
    for (const trilha of clip.tracks) {
      const [nome, propriedade] = trilha.name.split('.') as [string, string];
      const i = indice.get(nome);
      if (i === undefined) continue;
      const n = trilha.times.length;
      if (propriedade === 'quaternion') {
        const [x, y, z, w] = quaternioDoOsso(i, ossos, trilha.values, 4 * (n - 1));
        rotacoes.set([x, y, z, w], 4 * i);
      } else if (propriedade === 'position') {
        const v = trilha.values;
        const [x, y, z] = ossos[i]!.parent instanceof Bone ? [v[3 * (n - 1)]!, v[3 * (n - 1) + 1]!, v[3 * (n - 1) + 2]!] : doGltf(v[3 * (n - 1)]!, v[3 * (n - 1) + 1]!, v[3 * (n - 1) + 2]!);
        posicoes.set([x, y, z], 3 * i);
      }
    }
    saida.set(clip.name.slice('pose_'.length), { rotacoes, posicoes });
  }
  return saida;
}

/** O quaternion que a trilha guarda a partir de `o`: o osso sem pai ainda está no referencial do glTF e gira para o do personagem. */
function quaternioDoOsso(i: number, ossos: readonly Bone[], v: ArrayLike<number>, o: number): [number, number, number, number] {
  const q: [number, number, number, number] = [v[o]!, v[o + 1]!, v[o + 2]!, v[o + 3]!];
  return ossos[i]!.parent instanceof Bone ? q : girarQuaternio(...q);
}

function osso(b: Bone, i: number, ossos: readonly Bone[]): OssoDaFicha {
  const pai = b.parent instanceof Bone ? ossos.indexOf(b.parent) : -1;
  if (pai < 0) {
    const [qx, qy, qz, qw] = girarQuaternio(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    return { nome: b.name, pai, posicao: doGltf(b.position.x, b.position.y, b.position.z), rotacao: [qx, qy, qz, qw] };
  }
  if (pai >= i) throw new Error(`osso "${b.name}" vem antes do pai`);
  return { nome: b.name, pai, posicao: [b.position.x, b.position.y, b.position.z], rotacao: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w] };
}

/**
 * A ficha do personagem a partir do arquivo carregado: os ossos em repouso e as poses, no referencial do personagem. Os ossos de
 * cima do glTF (o grupo que guarda o esqueleto) têm de estar na identidade.
 */
export function fichaDoGltf(gltf: GLTF): Ficha {
  gltf.scene.updateMatrixWorld(true);
  const malha = ossoDe(gltf);
  const ossos = malha.skeleton.bones;
  const raiz = ossos.find((b) => !(b.parent instanceof Bone));
  if (raiz === undefined) throw new Error('esqueleto sem raiz');
  for (let p: Object3D | null = raiz.parent; p !== null && p !== gltf.scene.parent; p = p.parent) {
    if (p.matrix.determinant() === 0 || p.position.lengthSq() > 1e-12 || Math.abs(p.quaternion.w - 1) > 1e-9 || Math.abs(p.scale.x - 1) > 1e-9) {
      throw new Error(`"${p.name}", acima do esqueleto, não está na identidade`);
    }
  }
  return { ossos: ossos.map((b, i) => osso(b, i, ossos)), poses: posesDoGltf(gltf, ossos) };
}

/** Os vértices, ossos e pesos de todas as malhas de um nível, juntos e no referencial do personagem (o esqueleto é o mesmo). */
export function malhaDoNivel(gltf: GLTF, malhas: readonly SkinnedMesh[]): MalhaComPele {
  const ossosDoEsqueleto = ossoDe(gltf).skeleton.bones;
  let total = 0;
  for (const m of malhas) total += m.geometry.getAttribute('position').count;
  const posicoes = new Float64Array(3 * total);
  const indices = new Uint16Array(4 * total);
  const pesos = new Float64Array(4 * total);
  let v = 0;
  for (const m of malhas) {
    const pos = m.geometry.getAttribute('position');
    const sj = m.geometry.getAttribute('skinIndex');
    const sw = m.geometry.getAttribute('skinWeight');
    // índice do osso no esqueleto desta malha → índice no esqueleto de referência
    const remapa = m.skeleton.bones.map((b) => ossosDoEsqueleto.findIndex((o) => o.name === b.name));
    for (let i = 0; i < pos.count; i++, v++) {
      const [x, y, z] = doGltf(pos.getX(i), pos.getY(i), pos.getZ(i));
      posicoes[3 * v] = x;
      posicoes[3 * v + 1] = y;
      posicoes[3 * v + 2] = z;
      for (let k = 0; k < 4; k++) {
        indices[4 * v + k] = remapa[sj.getComponent(i, k)]!;
        pesos[4 * v + k] = sw.getComponent(i, k);
      }
    }
  }
  return { posicoes, ossos: indices, pesos };
}

/** As ações de pose (`pose_x`) refeitas com uma só amostra, a do último quadro, e as de gesto (`gesto_x`) como estão, sem a escala. */
export function acoesDoGltf(gltf: GLTF): { poses: Map<string, AnimationClip>; gestos: Map<string, AnimationClip> } {
  const poses = new Map<string, AnimationClip>();
  const gestos = new Map<string, AnimationClip>();
  for (const clip of gltf.animations) {
    const trilhas = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
    if (clip.name.startsWith('pose_')) {
      const unicas = trilhas.map((t) => {
        const n = t.times.length;
        const tam = t.getValueSize();
        const ultima = Array.from(t.values.slice((n - 1) * tam, n * tam));
        const copia = t.clone();
        copia.times = new Float32Array([0, 1]) as unknown as typeof copia.times;
        copia.values = new Float32Array([...ultima, ...ultima]) as unknown as typeof copia.values;
        return copia;
      });
      poses.set(clip.name.slice('pose_'.length), new AnimationClip(clip.name, 1, unicas));
    } else if (clip.name.startsWith('gesto_')) {
      gestos.set(clip.name.slice('gesto_'.length), new AnimationClip(clip.name, clip.duration, trilhas));
    }
  }
  return { poses, gestos };
}
