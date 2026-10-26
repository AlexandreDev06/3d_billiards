import { AdditiveAnimationBlendMode, AnimationAction, AnimationMixer, AnimationUtils, Group, LoopOnce, LoopRepeat, Quaternion, Vector3, type AnimationClip, type Bone, type Object3D, type SkinnedMesh } from 'three';
import { clone as clonarComEsqueleto } from 'three/addons/utils/SkeletonUtils.js';
import type { Quadro } from '../alinhar';
import type { Corrente } from '../cinematica';
import type { MetaDoPersonagem } from '../meta';
import { MisturaDePoses } from '../mistura';
import { quaternioDaBase } from '../quaternios';
import { DE_GLTF_PARA_PERSONAGEM, malhasDoNivel } from './ficha-do-gltf';
import type { NivelDeDetalhe } from './latex';

/** O que o desenho do personagem precisa do arquivo carregado. */
export interface InsumosDoPersonagem {
  readonly cena: Object3D;
  readonly poses: ReadonlyMap<string, AnimationClip>;
  readonly gestos: ReadonlyMap<string, AnimationClip>;
  readonly correntes: ReadonlyMap<string, Corrente>;
  readonly nomeDosOssos: readonly string[];
  readonly nomesDasMalhas: { readonly alta: string; readonly baixa: string };
  /** A pose em que o personagem nasce. */
  readonly inicial: string;
  /** As notas do artista sobre os gestos (pico, ciclo, aditivo); sem elas nenhum gesto repete nem é aditivo. */
  readonly meta: MetaDoPersonagem | null;
}

/** Como um gesto toca, além de uma vez do começo ao fim. */
export interface OpcoesDoGestoEmCena {
  /** Repete o trecho de ciclo que o artista marcou, até `soltarGesto`. Lança se o gesto não tem ciclo. */
  readonly repetir?: boolean;
  /** Fica no último quadro até `soltarGesto` (o padrão é o que o artista diz: o gesto que termina pendurado se segura). */
  readonly segurar?: boolean;
  /** O gesto acaba (com a saída) quando chega a isto (s), mesmo que o artista o tenha feito mais longo. */
  readonly duracaoMaximaS?: number;
}

const PESO_MINIMO = 0.0005;
const q = new Float64Array(4);
const desfeita = new Quaternion();
const eixo = new Vector3();

/** A parte do gesto que o desenho precisa guardar: a ação dele e a duração. */
interface Gesto {
  readonly acao: AnimationAction;
  readonly duracao: number;
}

/** Um gesto aditivo (a respiração): a ação só com a diferença para o primeiro quadro, o relógio dela e o peso que o jogo pede. */
interface Aditivo extends Gesto {
  peso: number;
}

/** Uma volta a mais num osso, em torno de um eixo do próprio osso, e o que já foi aplicado dela. */
interface Ajuste {
  readonly osso: Bone;
  x: number;
  y: number;
  z: number;
  rad: number;
  readonly aplicada: Quaternion;
}

/**
 * Um personagem em cena: o grupo `raiz` (que quem usa põe no mundo, com `colocar`), o esqueleto com a malha alta e a baixa, e a mistura
 * das poses. Cada instância tem os seus ossos e compartilha geometria e materiais com a base de onde saiu (`BaseDoPersonagem.instanciar`).
 *
 * Hierarquia: `raiz` (posição, giro e tamanho no mundo) → grupo do espelho (escala `-1` em `x` na mão esquerda) → grupo da volta do
 * glTF para o referencial do personagem → o arquivo. Tudo o que as contas puras dizem (`Quadro`, `Corrente`) está nesse referencial.
 */
export class PersonagemEmCena {
  readonly raiz = new Group();
  readonly mistura: MisturaDePoses;
  private readonly mixer: AnimationMixer;
  private readonly poses: AnimationAction[];
  private readonly gestos = new Map<string, Gesto>();
  private readonly aditivosEmCena = new Map<string, Aditivo>();
  private readonly ajustes = new Map<string, Ajuste>();
  private relogioDosAditivos = 0;
  private readonly alta: SkinnedMesh[];
  private readonly baixa: SkinnedMesh[];
  private readonly ossos = new Map<string, Bone>();
  private readonly dobras = new Map<string, { corrente: Corrente; ossos: Bone[]; valor: number; aplicadas: Quaternion[] }>();
  private gestoAtivo: Gesto | null = null;

  constructor(
    private readonly insumos: InsumosDoPersonagem,
    readonly espelho: boolean,
  ) {
    const espelhoGrupo = new Group();
    espelhoGrupo.name = 'espelho';
    espelhoGrupo.scale.x = espelho ? -1 : 1;
    const volta = new Group();
    volta.name = 'volta-do-gltf';
    volta.quaternion.set(DE_GLTF_PARA_PERSONAGEM.x, DE_GLTF_PARA_PERSONAGEM.y, DE_GLTF_PARA_PERSONAGEM.z, DE_GLTF_PARA_PERSONAGEM.w);
    const cena = clonarComEsqueleto(insumos.cena);
    volta.add(cena);
    espelhoGrupo.add(volta);
    this.raiz.add(espelhoGrupo);
    this.alta = malhasDoNivel(cena, insumos.nomesDasMalhas.alta);
    this.baixa = malhasDoNivel(cena, insumos.nomesDasMalhas.baixa);
    for (const m of [...this.alta, ...this.baixa]) {
      // a pele anda muito além da caixa da malha em repouso (os dedos dobram): cortar pela caixa a faria sumir de perto
      m.frustumCulled = false;
      m.castShadow = true;
    }
    cena.traverse((o) => {
      if ((o as Bone).isBone) this.ossos.set(o.name, o as Bone);
    });
    this.mixer = new AnimationMixer(cena);
    const nomes = [...insumos.poses.keys()];
    this.poses = nomes.map((nome) => {
      const acao = this.mixer.clipAction(insumos.poses.get(nome)!);
      acao.paused = true;
      acao.setEffectiveWeight(0);
      acao.play();
      return acao;
    });
    for (const [nome, clip] of insumos.gestos) {
      if (insumos.meta?.gestos.get(nome)?.aditivo === true) {
        // O glTF não tem mistura aditiva: o quadro 0 é a referência e o jogo soma só a diferença, em ciclo, por cima de tudo.
        const diferenca = AnimationUtils.makeClipAdditive(clip.clone(), 0, clip);
        const acao = this.mixer.clipAction(diferenca);
        acao.blendMode = AdditiveAnimationBlendMode;
        acao.setLoop(LoopRepeat, Infinity);
        acao.setEffectiveWeight(0);
        acao.play();
        acao.paused = true;
        acao.enabled = false;
        this.aditivosEmCena.set(nome, { acao, duracao: clip.duration, peso: 0 });
        continue;
      }
      const acao = this.mixer.clipAction(clip);
      acao.setLoop(LoopOnce, 1);
      acao.clampWhenFinished = true;
      acao.setEffectiveWeight(0);
      acao.play();
      acao.paused = true;
      this.gestos.set(nome, { acao, duracao: clip.duration });
    }
    for (const [nome, corrente] of insumos.correntes) {
      const lista = corrente.ossos.map((i) => this.ossos.get(insumos.nomeDosOssos[i]!)!);
      this.dobras.set(nome, { corrente, ossos: lista, valor: 0, aplicadas: lista.map(() => new Quaternion()) });
    }
    this.mistura = new MisturaDePoses(nomes, insumos.inicial);
    this.definirNivel('alto');
    this.aplicar();
  }

  /** O mesmo personagem em outro nível de detalhe: a malha alta para o alto e o médio, a baixa para o baixo. */
  definirNivel(nivel: NivelDeDetalhe): void {
    const alta = nivel !== 'baixo';
    for (const m of this.alta) m.visible = alta;
    for (const m of this.baixa) m.visible = !alta;
  }

  /** Fica na pose em `duracaoS` (0 = já). */
  ir(pose: string, duracaoS: number): void {
    this.mistura.ir(pose, duracaoS);
  }

  /** Mistura duas poses à mão: `t` 0 = só `a`, 1 = só `b`. */
  misturar(a: string, b: string, t: number): void {
    this.mistura.misturar(a, b, t);
  }

  /** Mistura `t` (0 a 1) da pose `nome` por cima do que a base está fazendo (a pinça sobre a ponte). Vale a cada quadro até mudar. */
  sobrepor(nome: string, t: number): void {
    this.mistura.sobrepor(nome, t);
  }

  /**
   * Faz o gesto por cima das poses: entra em `entradaS`, toca até o fim da ação (ou até `opcoes.duracaoMaximaS`) e sai nos últimos
   * `saidaS`. Com `opcoes.repetir` o trecho de ciclo do artista repete, e com `opcoes.segurar` (o padrão do gesto que termina
   * pendurado) o último quadro fica, até `soltarGesto`.
   */
  fazerGesto(nome: string, entradaS: number, saidaS: number, opcoes: OpcoesDoGestoEmCena = {}): void {
    const g = this.gestos.get(nome);
    if (g === undefined) throw new Error(this.aditivosEmCena.has(nome) ? `gesto "${nome}" é aditivo: use ligarAditivo` : `gesto "${nome}" não existe`);
    const nota = this.insumos.meta?.gestos.get(nome);
    if (opcoes.repetir === true && nota?.cicloS === undefined) throw new Error(`gesto "${nome}" não tem ciclo`);
    // O gesto que estava tocando sai de vez: sem isso a ação dele ficaria ligada com o último peso.
    if (this.gestoAtivo !== null && this.gestoAtivo !== g) {
      this.gestoAtivo.acao.enabled = false;
      this.gestoAtivo.acao.setEffectiveWeight(0);
    }
    this.gestoAtivo = g;
    this.mistura.fazerGesto(nome, Math.min(g.duracao, opcoes.duracaoMaximaS ?? Infinity), entradaS, saidaS, {
      ...(opcoes.repetir === true ? { cicloS: nota!.cicloS! } : {}),
      segurar: opcoes.segurar ?? nota?.terminaPendurado ?? false,
    });
  }

  /** Solta o gesto que repete ou se segura: ele sai em `saidaS` (padrão: a saída com que começou). */
  soltarGesto(saidaS?: number): void {
    this.mistura.soltarGesto(saidaS);
  }

  /** O instante do ápice do gesto (s), para sincronizar o som e o encontro; `undefined` se o artista não marcou um. */
  picoDoGesto(nome: string): number | undefined {
    return this.insumos.meta?.gestos.get(nome)?.picoS;
  }

  /** Os gestos aditivos que o arquivo traz (a respiração). */
  get aditivos(): readonly string[] {
    return [...this.aditivosEmCena.keys()];
  }

  /** Liga o gesto aditivo `nome` com o peso dado (0 desliga): ele repete em ciclo por cima de qualquer pose ou gesto, enquanto o peso for maior que 0. */
  ligarAditivo(nome: string, peso: number): void {
    const a = this.aditivosEmCena.get(nome);
    if (a === undefined) throw new Error(`"${nome}" não é um gesto aditivo`);
    a.peso = Math.min(Math.max(peso, 0), 1);
  }

  /**
   * Gira o osso `nome` em `rad` em torno do eixo (`x`, `y`, `z`) dele, por cima do que a pose e o gesto fizeram (o pulso que balança, a
   * mão que aperta). Vale a cada quadro até mudar; zero devolve o osso.
   */
  girarOsso(nome: string, x: number, y: number, z: number, rad: number): void {
    let a = this.ajustes.get(nome);
    if (a === undefined) {
      a = { osso: this.osso(nome), x, y, z, rad, aplicada: new Quaternion() };
      this.ajustes.set(nome, a);
    }
    a.x = x;
    a.y = y;
    a.z = z;
    a.rad = rad;
  }

  get gestoEmCurso(): string | null {
    return this.mistura.gesto;
  }

  /** De 0 a 1, o quanto o gesto em curso manda agora (0 sem gesto): entra, fica e sai. */
  get pesoDoGesto(): number {
    return this.mistura.gesto === null ? 0 : this.mistura.pesoDoGesto;
  }

  /** Há quanto tempo o gesto em curso toca (s); 0 sem gesto. */
  get tempoDoGesto(): number {
    return this.mistura.gesto === null ? 0 : this.mistura.tempoDoGesto;
  }

  /** A dobra a mais de uma corrente de ossos (um dedo), em rad: positiva fecha o dedo. Vale a cada quadro até mudar. */
  dobrar(corrente: string, rad: number): void {
    const d = this.dobras.get(corrente);
    if (d === undefined) throw new Error(`corrente "${corrente}" não existe`);
    d.valor = rad;
  }

  /** O osso desenhado, pelo nome (para quem precisa saber onde ele está em cena). */
  osso(nome: string): Bone {
    const b = this.ossos.get(nome);
    if (b === undefined) throw new Error(`osso "${nome}" não existe`);
    return b;
  }

  /** Põe o personagem no mundo: a origem, o giro e o tamanho (o espelho já está no grupo). Nada aloca. */
  colocar(quadro: Quadro, escala: number): void {
    quaternioDaBase(quadro.xx, quadro.xy, quadro.xz, quadro.yx, quadro.yy, quadro.yz, quadro.zx, quadro.zy, quadro.zz, q, 0);
    this.raiz.quaternion.set(q[0]!, q[1]!, q[2]!, q[3]!);
    this.raiz.position.set(quadro.px, quadro.py, quadro.pz);
    this.raiz.scale.setScalar(escala);
  }

  /** Avança `dt` s: a mistura, os pesos de cada ação, os ossos e, por cima, as dobras e os ajustes. Uma vez por quadro; nada aloca. */
  atualizar(dt: number): void {
    this.mistura.atualizar(dt);
    this.relogioDosAditivos += Math.max(dt, 0);
    this.aplicar();
  }

  private aplicar(): void {
    const g = this.mistura.gesto === null ? 0 : this.mistura.pesoDoGesto;
    const pesos = this.mistura.pesos;
    for (let i = 0; i < this.poses.length; i++) {
      const w = pesos[i]! * (1 - g);
      const acao = this.poses[i]!;
      acao.enabled = w > PESO_MINIMO;
      acao.setEffectiveWeight(w);
    }
    if (this.gestoAtivo !== null) {
      const acao = this.gestoAtivo.acao;
      acao.enabled = g > PESO_MINIMO;
      acao.setEffectiveWeight(g);
      acao.time = Math.min(this.mistura.tempoNaAcao, this.gestoAtivo.duracao);
      if (this.mistura.gesto === null) this.gestoAtivo = null;
    }
    for (const a of this.aditivosEmCena.values()) {
      a.acao.enabled = a.peso > PESO_MINIMO;
      a.acao.setEffectiveWeight(a.peso);
      a.acao.time = a.duracao > 0 ? this.relogioDosAditivos % a.duracao : 0;
    }
    // O mixer só reescreve um osso quando o valor da animação muda: sem desfazer a dobra do quadro anterior, ela se somaria de novo.
    for (const d of this.dobras.values()) {
      for (let j = 0; j < d.ossos.length; j++) d.ossos[j]!.quaternion.multiply(desfeita.copy(d.aplicadas[j]!).invert());
    }
    for (const a of this.ajustes.values()) a.osso.quaternion.multiply(desfeita.copy(a.aplicada).invert());
    this.mixer.update(0);
    for (const a of this.ajustes.values()) {
      a.aplicada.setFromAxisAngle(eixo.set(a.x, a.y, a.z), a.rad);
      a.osso.quaternion.multiply(a.aplicada);
    }
    for (const d of this.dobras.values()) {
      const [ex, ey, ez] = d.corrente.eixoDeDobra;
      for (let j = 0; j < d.ossos.length; j++) {
        d.aplicadas[j]!.setFromAxisAngle(eixo.set(ex, ey, ez), d.valor * d.corrente.partes[j]!);
        d.ossos[j]!.quaternion.multiply(d.aplicadas[j]!);
      }
    }
  }

  /** Solta o que é só desta instância (a geometria e os materiais são da base). */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.raiz.removeFromParent();
  }
}
