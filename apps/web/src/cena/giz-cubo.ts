import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ConfigMaos } from '../config';
import type { PoseDeMao } from '../maos/pose-das-maos';
import type { PoeiraDeGiz } from '../maos/poeira-de-giz';

type ConfigDoGiz = ConfigMaos['giz'];

/** O máximo de partículas que o desenho comporta: o nível de qualidade escolhe quantas a conta usa (até aqui). */
export const MAXIMO_DE_PARTICULAS = 48;

const VERTICE = /* glsl */ `
attribute float tamanho;
attribute float opacidade;
uniform float alturaPx;
varying float vOpacidade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vOpacidade = opacidade;
  gl_Position = projectionMatrix * mv;
  // O tamanho é em metros no mundo: vira pixels pela perspectiva.
  gl_PointSize = max(tamanho * alturaPx * 0.5 * projectionMatrix[1][1] / max(-mv.z, 0.01), 0.0);
}`;

const FRAGMENTO = /* glsl */ `
uniform vec3 cor;
varying float vOpacidade;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vOpacidade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(cor, a);
}`;

/** O cubo de giz (azul, de quinas redondas, com a covinha gasta na face de cima) e o pó que sai dele na ponta do taco. */
export class GizDaCena {
  readonly grupo = new Group();
  private readonly cubo = new Group();
  private readonly corpo: Mesh;
  private readonly covinha: Mesh;
  private readonly poeira: Points;
  private readonly posicoes = new Float32Array(MAXIMO_DE_PARTICULAS * 3);
  private readonly tamanhos = new Float32Array(MAXIMO_DE_PARTICULAS);
  private readonly opacidades = new Float32Array(MAXIMO_DE_PARTICULAS);
  private readonly base = new Matrix4();
  private readonly x = new Vector3();
  private readonly y = new Vector3();
  private readonly z = new Vector3();
  private segmentos: number;

  constructor(
    private readonly cfg: ConfigDoGiz,
    segmentos: number,
  ) {
    this.segmentos = segmentos;
    this.grupo.name = 'giz';
    this.cubo.name = 'giz-cubo';
    const material = new MeshStandardMaterial({ color: cfg.cubo.cor, roughness: 0.95, metalness: 0, emissive: cfg.cubo.cor, emissiveIntensity: 0.18 });
    material.name = 'giz';
    this.corpo = new Mesh(this.geometriaDoCorpo(), material);
    this.corpo.name = 'giz-corpo';
    this.corpo.castShadow = true;
    const gasto = new MeshStandardMaterial({ color: cfg.cubo.corDoMiolo, roughness: 1, metalness: 0, emissive: cfg.cubo.corDoMiolo, emissiveIntensity: 0.12 });
    gasto.name = 'giz-gasto';
    this.covinha = new Mesh(this.geometriaDaCovinha(), gasto);
    this.covinha.name = 'giz-covinha';
    this.covinha.userData.semSombra = true;
    this.cubo.add(this.corpo, this.covinha);
    this.cubo.visible = false;

    const geometria = new BufferGeometry();
    geometria.setAttribute('position', new BufferAttribute(this.posicoes, 3).setUsage(35048));
    geometria.setAttribute('tamanho', new BufferAttribute(this.tamanhos, 1).setUsage(35048));
    geometria.setAttribute('opacidade', new BufferAttribute(this.opacidades, 1).setUsage(35048));
    const pontos = new ShaderMaterial({
      uniforms: { cor: { value: [((cfg.poeira.cor >> 16) & 255) / 255, ((cfg.poeira.cor >> 8) & 255) / 255, (cfg.poeira.cor & 255) / 255] }, alturaPx: { value: 720 } },
      vertexShader: VERTICE,
      fragmentShader: FRAGMENTO,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      toneMapped: false,
    });
    this.poeira = new Points(geometria, pontos);
    this.poeira.name = 'giz-poeira';
    this.poeira.frustumCulled = false;
    this.poeira.renderOrder = 4;
    this.poeira.userData.semSombra = true;
    this.poeira.visible = false;
    this.grupo.add(this.cubo, this.poeira);
  }

  private geometriaDoCorpo(): BufferGeometry {
    const lado = this.cfg.cubo.lado;
    return new RoundedBoxGeometry(lado, lado, lado, this.segmentos >= 13 ? 3 : this.segmentos >= 10 ? 2 : 1, this.cfg.cubo.quina);
  }

  private geometriaDaCovinha(): BufferGeometry {
    const g = new CircleGeometry(this.cfg.cubo.lado * 0.36, Math.max(this.segmentos, 8));
    // O disco nasce no plano XY olhando +Z: deita na face de cima (+Y) e sobe um fio para não brigar com ela.
    g.rotateX(-Math.PI / 2);
    g.translate(0, this.cfg.cubo.lado / 2 + 0.0004, 0);
    return g;
  }

  /** Refaz as malhas do cubo para os lados do nível de qualidade. */
  definirLados(lados: number): void {
    if (lados === this.segmentos) return;
    this.segmentos = lados;
    const antigas = [this.corpo.geometry, this.covinha.geometry];
    this.corpo.geometry = this.geometriaDoCorpo();
    this.covinha.geometry = this.geometriaDaCovinha();
    for (const g of antigas) g.dispose();
  }

  /**
   * O cubo na `pose` (o centro dele, a normal da covinha em `d` e uma direção de lado em `u`), na escala `escala` (0 = some). A
   * covinha é a face de cima do cubo (+Y local).
   */
  mostrarCubo(pose: PoseDeMao, escala: number): void {
    this.cubo.visible = escala > 0.01;
    if (!this.cubo.visible) return;
    this.y.set(pose.dx, pose.dy, pose.dz);
    this.x.set(pose.ux, pose.uy, pose.uz);
    this.z.crossVectors(this.x, this.y);
    this.base.makeBasis(this.x, this.y, this.z);
    this.cubo.quaternion.setFromRotationMatrix(this.base);
    this.cubo.position.set(pose.x, pose.y, pose.z);
    this.cubo.scale.setScalar(escala);
  }

  esconderCubo(): void {
    this.cubo.visible = false;
  }

  get cuboVisivel(): boolean {
    return this.cubo.visible;
  }

  get posicaoDoCubo(): Vector3 {
    return this.cubo.position;
  }

  /** O pó de agora, nos buffers: `alturaPx` é a altura do desenho em pixels (o tamanho em m vira pixels pela perspectiva). */
  desenharPoeira(modelo: PoeiraDeGiz, alturaPx: number): void {
    const n = Math.min(modelo.capacidade, MAXIMO_DE_PARTICULAS);
    let alguma = false;
    for (let i = 0; i < MAXIMO_DE_PARTICULAS; i++) {
      const viva = i < n && modelo.vida[i]! > 0;
      this.posicoes[i * 3] = viva ? modelo.x[i]! : 0;
      this.posicoes[i * 3 + 1] = viva ? modelo.y[i]! : -10;
      this.posicoes[i * 3 + 2] = viva ? modelo.z[i]! : 0;
      this.tamanhos[i] = viva ? modelo.tamanho(i) : 0;
      this.opacidades[i] = viva ? modelo.opacidade(i) : 0;
      if (viva) alguma = true;
    }
    this.poeira.visible = alguma;
    if (!alguma) return;
    const g = this.poeira.geometry;
    for (const nome of ['position', 'tamanho', 'opacidade']) (g.getAttribute(nome) as BufferAttribute).needsUpdate = true;
    (this.poeira.material as ShaderMaterial).uniforms.alturaPx!.value = alturaPx;
  }

  /** As partículas desenhadas neste quadro (para o gancho de teste). */
  get particulasVisiveis(): number {
    let n = 0;
    for (let i = 0; i < MAXIMO_DE_PARTICULAS; i++) if (this.opacidades[i]! > 0) n++;
    return this.poeira.visible ? n : 0;
  }

  /** Os materiais do cubo (para a lista de variantes dos testes). */
  materiais(): MeshStandardMaterial[] {
    return [this.corpo.material as MeshStandardMaterial, this.covinha.material as MeshStandardMaterial];
  }

  descartar(): void {
    this.corpo.geometry.dispose();
    this.covinha.geometry.dispose();
    for (const m of this.materiais()) m.dispose();
    this.poeira.geometry.dispose();
    (this.poeira.material as ShaderMaterial).dispose();
  }
}
