import {
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  Texture,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { ResultadoDoFim } from '../baloes/acao-do-balao';
import { CARAS_DO_BALAO, type CaraDoBalao } from '../baloes/rosto';
import { FAIXA_DO_ROSTO, perfilDoBalao, raioDoBalaoEm } from '../baloes/silhueta';
import type { ConfigBaloes } from '../config';
import { materialDeLatex } from './latex';
import { quadroDaCara } from './rosto-textura';

/** O rosto cobre este arco do balão, de lado a lado (rad). */
const ARCO_DO_ROSTO = 1.5;
/** O rosto fica um fio acima do látex (fração do raio), para não brigar com ele na profundidade. */
const SOBRA_DO_ROSTO = 1.012;

/** O que o desenho precisa saber de um balão neste quadro. */
export interface EstadoDoBalao {
  /** Centro do balão (m). */
  x: number;
  y: number;
  z: number;
  /** Para onde o rosto olha: giro em torno de Y (rad), 0 = para +Z. */
  yaw: number;
  /** 0 a 1: aparece e some. */
  escala: number;
  cor: number;
  cara: CaraDoBalao;
  /** Largura e altura relativas ao balão cheio (1 = normal; mais, estufado; menos, murcho). */
  largura: number;
  altura: number;
  /** Quanto ele pende para o lado além do balanço (rad). */
  caida: number;
  /** Relógio da página (s), para o balanço (e, no balão do artista, para o passo de cada ação). */
  tempoS: number;
  /** (L30, só o balão do artista) O outro está mirando: o corpo inclina enquanto durar. */
  mirando: boolean;
  /** (L30, só o balão do artista) A partida acabou: quem ganhou estufa, quem perdeu murcha. */
  fim: ResultadoDoFim | null;
  /** (L30, só o balão do artista) Um ponto do mundo (m) que os olhos miram; `null` olha para a frente. */
  olhar: { x: number; y: number; z: number } | null;
}

export function estadoVazioDoBalao(): EstadoDoBalao {
  return { x: 0, y: 0, z: 0, yaw: 0, escala: 0, cor: 0xffffff, cara: 'neutro', largura: 1, altura: 1, caida: 0, tempoS: 0, mirando: false, fim: null, olhar: null };
}

/** O que a cena precisa de um conjunto de balões, sejam os do artista ou os procedurais. */
export interface BaloesEmCena {
  readonly grupo: Group;
  readonly quantos: number;
  mostrar(i: number, e: EstadoDoBalao): void;
  esconder(i: number): void;
  esconderTodos(): void;
  visivel(i: number): boolean;
  /** Volta ao começo (vez nova, partida nova): sem ação em curso, cara neutra. */
  reiniciar(): void;
  materiais(): Material[];
  descartar(): void;
}

/** Os lados do corpo do balão num nível de qualidade (o `lados` das mãos): mais que isso o oval fica liso demais para o custo. */
export function ladosDoCorpo(lados: number): number {
  return Math.max(lados, 10);
}

/** O corpo do balão: o perfil de gota girado em torno do eixo. */
export function geometriaDoCorpo(cfg: ConfigBaloes['corpo'], lados: number): BufferGeometry {
  const perfil = perfilDoBalao(cfg.altura, cfg.raio, Math.round(lados * 1.4));
  return new LatheGeometry(
    perfil.map((p) => new Vector2(p.r, p.y)),
    ladosDoCorpo(lados),
  );
}

/** O trecho do balão onde fica o rosto, um fio acima do látex, de frente para +Z. */
export function geometriaDoRosto(cfg: ConfigBaloes['corpo'], lados: number): BufferGeometry {
  const passos = Math.max(Math.round(lados / 2), 6);
  const pontos: Vector2[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = FAIXA_DO_ROSTO.de + ((FAIXA_DO_ROSTO.ate - FAIXA_DO_ROSTO.de) * i) / passos;
    pontos.push(new Vector2(raioDoBalaoEm(t, cfg.raio) * SOBRA_DO_ROSTO, -cfg.altura + 2 * cfg.altura * t));
  }
  return new LatheGeometry(pontos, Math.max(Math.round(lados * 0.8), 8), -ARCO_DO_ROSTO / 2, ARCO_DO_ROSTO);
}

/** O nó: um funil curto na ponta de baixo, mais largo na boca. */
export function geometriaDoNo(cfg: ConfigBaloes['corpo'], lados: number): BufferGeometry {
  const g = new CylinderGeometry(cfg.no * 0.45, cfg.no * 1.4, cfg.no * 2.4, Math.max(Math.round(lados / 2), 6));
  g.translate(0, -cfg.altura - cfg.no * 0.8, 0);
  return g;
}

/** A cordinha: um fio fino com uma ondinha, do nó para baixo. */
export function geometriaDaCordinha(cfg: ConfigBaloes['corpo'], lados: number): BufferGeometry {
  const topo = -cfg.altura - cfg.no * 2;
  const c = cfg.cordinha;
  const curva = new CatmullRomCurve3([
    new Vector3(0, topo, 0),
    new Vector3(c * 0.12, topo - c * 0.3, c * 0.05),
    new Vector3(-c * 0.1, topo - c * 0.62, -c * 0.04),
    new Vector3(c * 0.08, topo - c, c * 0.02),
  ]);
  return new TubeGeometry(curva, 8, 0.0022, Math.max(Math.round(lados / 4), 3), false);
}

interface Peca {
  readonly grupo: Group;
  readonly corpo: Mesh;
  readonly no: Mesh;
  readonly cordinha: Mesh;
  readonly rosto: Mesh;
  readonly latex: MeshPhysicalMaterial;
  readonly mapa: Texture;
  fase: number;
  caraAtual: CaraDoBalao | null;
}

/**
 * Os balões procedurais (a reserva de antes do L30, quando o `.glb` do artista não carrega): um por equipe (até quatro), cada um com
 * corpo de látex na cor da equipe, nó, cordinha e um rosto que troca conforme `cara`. O dono pede um por vez (`mostrar`) e some com o que não usa (`esconder`). Tudo procedural: o rosto é desenhado numa
 * imagem de caras (`atlas`) que os quatro dividem; cada balão tem a sua cópia da textura, só para escolher o quadro.
 */
export class BaloesProcedurais implements BaloesEmCena {
  readonly grupo = new Group();
  private readonly pecas: Peca[] = [];
  private lados: number;
  private readonly materialDaCordinha = new MeshLambertMaterial({ color: 0xf6f3ea, emissive: 0xf6f3ea, emissiveIntensity: 0.3 });

  constructor(
    private readonly cfg: ConfigBaloes,
    lados: number,
    private readonly atlas: Texture,
    quantos = 4,
  ) {
    this.lados = lados;
    this.grupo.name = 'baloes';
    for (let i = 0; i < quantos; i++) this.pecas.push(this.criarPeca(i));
  }

  get quantos(): number {
    return this.pecas.length;
  }

  private criarPeca(i: number): Peca {
    const grupo = new Group();
    grupo.name = `balao-${i}`;
    const latex = materialDeLatex(0xffffff);
    const corpo = new Mesh(geometriaDoCorpo(this.cfg.corpo, this.lados), latex);
    corpo.name = 'balao-corpo';
    corpo.castShadow = true;
    const no = new Mesh(geometriaDoNo(this.cfg.corpo, this.lados), latex);
    no.name = 'balao-no';
    const cordinha = new Mesh(geometriaDaCordinha(this.cfg.corpo, this.lados), this.materialDaCordinha);
    cordinha.name = 'balao-cordinha';
    const mapa = this.atlas.clone();
    mapa.repeat.set(1 / CARAS_DO_BALAO.length, 1);
    mapa.needsUpdate = true;
    const material = new MeshBasicMaterial({ map: mapa, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const rosto = new Mesh(geometriaDoRosto(this.cfg.corpo, this.lados), material);
    rosto.name = 'balao-rosto';
    rosto.renderOrder = 3;
    rosto.userData.semSombra = true;
    grupo.add(corpo, no, cordinha, rosto);
    grupo.visible = false;
    this.grupo.add(grupo);
    return { grupo, corpo, no, cordinha, rosto, latex, mapa, fase: i * 1.7, caraAtual: null };
  }

  /** Refaz as malhas para os lados do nível de qualidade e solta as antigas. */
  definirLados(lados: number): void {
    if (lados === this.lados) return;
    this.lados = lados;
    for (const p of this.pecas) {
      const antigas = [p.corpo.geometry, p.no.geometry, p.cordinha.geometry, p.rosto.geometry];
      p.corpo.geometry = geometriaDoCorpo(this.cfg.corpo, lados);
      p.no.geometry = geometriaDoNo(this.cfg.corpo, lados);
      p.cordinha.geometry = geometriaDaCordinha(this.cfg.corpo, lados);
      p.rosto.geometry = geometriaDoRosto(this.cfg.corpo, lados);
      for (const g of antigas) g.dispose();
    }
  }

  /** O balão `i` neste quadro. Com `escala` quase zero ele some em vez de desenhar um ponto. */
  mostrar(i: number, e: EstadoDoBalao): void {
    const p = this.pecas[i];
    if (!p) return;
    p.grupo.visible = e.escala > 0.01;
    if (!p.grupo.visible) return;
    // A malha usa o material de agora: nos níveis médio e baixo é uma cópia do `latex` (feita com a cor de quando nasceu).
    const latex = p.corpo.material as MeshPhysicalMaterial;
    if (latex.color.getHex() !== e.cor) {
      latex.color.setHex(e.cor);
      latex.emissive.setHex(e.cor);
    }
    if (p.caraAtual !== e.cara) {
      p.caraAtual = e.cara;
      p.mapa.offset.set(quadroDaCara(e.cara) / CARAS_DO_BALAO.length, 0);
    }
    const { balanco } = this.cfg;
    const w = (2 * Math.PI * e.tempoS) / balanco.periodoS;
    p.grupo.position.set(e.x, e.y + Math.sin(w + p.fase) * balanco.alturaM, e.z);
    p.grupo.rotation.set(Math.cos(w * 0.77 + p.fase) * balanco.inclinacaoRad * 0.6, e.yaw, Math.sin(w * 0.83 + p.fase) * balanco.inclinacaoRad + e.caida, 'YXZ');
    p.grupo.scale.set(e.largura * e.escala, e.altura * e.escala, e.largura * e.escala);
  }

  esconder(i: number): void {
    const p = this.pecas[i];
    if (p) p.grupo.visible = false;
  }

  esconderTodos(): void {
    for (const p of this.pecas) p.grupo.visible = false;
  }

  /** O procedural não guarda ação nenhuma: o que ele mostra é o estado de cada quadro. */
  reiniciar(): void {}

  /** O balão `i` está à mostra? */
  visivel(i: number): boolean {
    return this.pecas[i]?.grupo.visible ?? false;
  }

  /** Os materiais do que está na cena, para quem precisa listar (o teste de variantes). */
  materiais(): Material[] {
    return [this.materialDaCordinha, ...this.pecas.flatMap((p) => [p.latex, p.rosto.material as Material])];
  }

  /** Solta geometrias, materiais e as cópias da textura (o atlas é de quem o deu). */
  descartar(): void {
    for (const p of this.pecas) {
      for (const g of [p.corpo.geometry, p.no.geometry, p.cordinha.geometry, p.rosto.geometry]) g.dispose();
      p.latex.dispose();
      (p.rosto.material as MeshBasicMaterial).dispose();
      p.mapa.dispose();
    }
    this.materialDaCordinha.dispose();
  }
}
