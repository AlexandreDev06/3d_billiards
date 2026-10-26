import { AnimationAction, AnimationMixer, Color, Group, LoopOnce, Quaternion, Vector3, type AnimationClip, type Bone, type Material, type MeshPhysicalMaterial, type Object3D, type SkinnedMesh } from 'three';
import { clone as clonarComEsqueleto } from 'three/addons/utils/SkeletonUtils.js';
import { MisturaDeAcoes, type DefinicaoDaAcao, type OpcoesDaAcao } from '../acoes';
import type { Quadro } from '../alinhar';
import { ancoraDaMatriz } from '../ancora';
import type { MetaDoRosto } from '../meta-do-rosto';
import { girarOlho } from '../olhar';
import { MisturaDeCaras, Piscador, type OpcoesDoPiscador } from '../rosto';
import { malhasDoNivel, type NomesDasMalhas } from './ficha-do-gltf';
import { materialDeLatex, tingirMaterial, type MaterialTingivel, type NivelDeDetalhe } from './latex';

/** O que o desenho do personagem precisa do arquivo carregado. */
export interface InsumosDoRosto {
  readonly cena: Object3D;
  readonly clipes: ReadonlyMap<string, AnimationClip>;
  readonly meta: MetaDoRosto;
  readonly nomesDasMalhas: NomesDasMalhas;
  /** A ação que o personagem faz parado, em ciclo, por baixo de todas as outras. */
  readonly acaoBase: string;
  /** O material (do arquivo) que o jogo tinge com a cor da equipe; os outros ficam como o artista fez. */
  readonly nomeDoLatex: string;
  /** A forma que fecha os olhos. */
  readonly formaDePiscar: string;
}

/** Como uma instância nasce. */
export interface OpcoesDaInstancia {
  /** A cor da equipe com que o látex nasce. */
  readonly cor: number;
  /** De 0 a 1: o intervalo entre piscadas sai daqui (injetado, nunca `Math.random` direto). */
  readonly sorteio: () => number;
  readonly piscar?: Partial<OpcoesDoPiscador>;
  /** Quanto leva a troca de uma cara para outra (s); padrão 0,12. */
  readonly tempoDeTrocaDaCaraS?: number;
  /** Quão depressa o olho alcança o alvo (1/s); padrão 18. */
  readonly taxaDoOlhar?: number;
}

/** Um ponto no mundo (m). */
export interface PontoDoMundo {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const PESO_MINIMO = 0.0005;
const TAXA_DO_OLHAR = 18;

interface OlhoEmCena {
  readonly osso: Object3D;
  readonly pai: Object3D;
  readonly repouso: Quaternion;
  /** O eixo do olhar no repouso, no referencial do pai. */
  readonly eixo: Float64Array;
  /** Onde o olho está (suavizado) e para onde ele quer ir. */
  readonly atual: Quaternion;
  readonly desejado: Quaternion;
}

interface MalhaComFormas {
  readonly malha: SkinnedMesh;
  /** Índice de cada cara em `morphTargetInfluences` (−1 se a malha não tem a forma). */
  readonly caras: Int16Array;
  readonly piscar: number;
}

const mundo = new Vector3();
const alvo = new Vector3();
const giro = new Quaternion();
const buffer = new Float64Array(4);

/**
 * Um personagem de rosto em cena (o balão): um grupo `raiz` que quem usa põe no mundo, com o esqueleto, as duas versões da malha,
 * as ações do corpo (uma parada que repete e as que entram por cima, com ciclo), o rosto de formas (a cara, mistura suave, e o piscar
 * sozinho), os olhos que miram um ponto do mundo e pontos de ancoragem onde se prende outra coisa. Cada instância tem os seus ossos
 * e o seu látex; compartilha geometria e os outros materiais com a base (`BaseDoRosto.instanciar`). Nada aloca por quadro.
 */
export class PersonagemDeRosto {
  readonly raiz = new Group();
  private readonly mixer: AnimationMixer;
  private readonly mistura: MisturaDeAcoes;
  private readonly acoes: AnimationAction[];
  private readonly nomesDasAcoes: string[];
  private readonly caras: MisturaDeCaras;
  private readonly piscador: Piscador;
  private piscarForcado: number | null = null;
  private readonly malhas: MalhaComFormas[] = [];
  private readonly alta: SkinnedMesh[];
  private readonly baixa: SkinnedMesh[];
  private readonly latex: MeshPhysicalMaterial[] = [];
  private readonly malhasDeLatex: SkinnedMesh[] = [];
  private readonly olhos: OlhoEmCena[] = [];
  private readonly taxaDoOlhar: number;
  private olhando = false;
  private readonly pontoDoOlhar = new Vector3();
  private readonly cena: Object3D;
  private readonly nos = new Map<string, Object3D>();

  constructor(
    private readonly insumos: InsumosDoRosto,
    opcoes: OpcoesDaInstancia,
  ) {
    this.cena = clonarComEsqueleto(insumos.cena);
    this.raiz.add(this.cena);
    this.raiz.updateMatrixWorld(true);
    this.alta = malhasDoNivel(this.cena, insumos.nomesDasMalhas.alta);
    this.baixa = malhasDoNivel(this.cena, insumos.nomesDasMalhas.baixa);
    const { meta } = insumos;
    for (const m of [...this.alta, ...this.baixa]) {
      // a pele anda além da caixa da malha em repouso (o corpo estufa, pula): cortar pela caixa a faria sumir de perto
      m.frustumCulled = false;
      const origem = m.material as Material;
      if (origem.name === insumos.nomeDoLatex) {
        const base = (origem as MeshPhysicalMaterial).color ?? new Color(1, 1, 1);
        const latex = materialDeLatex(opcoes.cor, base, origem.name, origem);
        m.material = latex;
        m.castShadow = true;
        this.latex.push(latex);
        this.malhasDeLatex.push(m);
      }
      const dic = m.morphTargetDictionary ?? {};
      this.malhas.push({
        malha: m,
        caras: Int16Array.from(meta.caras, (nome) => dic[nome] ?? -1),
        piscar: dic[insumos.formaDePiscar] ?? -1,
      });
    }
    // Os olhos: o osso, o pai e o eixo do olhar no referencial do pai, medidos com a instância ainda sem giro nem escala nenhuma.
    for (const [nome, o] of meta.olhos) {
      const osso = this.no(nome);
      const pai = osso.parent;
      if (pai === null) throw new Error(`"${nome}" não tem pai`);
      const inverso = pai.getWorldQuaternion(new Quaternion()).invert();
      const eixo = new Vector3(...o.eixoDeRepouso).applyQuaternion(inverso);
      this.olhos.push({ osso, pai, repouso: osso.quaternion.clone(), eixo: Float64Array.of(eixo.x, eixo.y, eixo.z), atual: osso.quaternion.clone(), desejado: osso.quaternion.clone() });
    }
    this.taxaDoOlhar = opcoes.taxaDoOlhar ?? TAXA_DO_OLHAR;

    const definicoes: DefinicaoDaAcao[] = [...meta.acoes].map(([nome, a]) => ({ nome, duracaoS: a.duracaoS, cicloS: a.cicloS ?? null }));
    this.nomesDasAcoes = definicoes.map((d) => d.nome);
    this.mistura = new MisturaDeAcoes(definicoes, insumos.acaoBase);
    this.mixer = new AnimationMixer(this.cena);
    this.acoes = this.nomesDasAcoes.map((nome) => {
      const clip = insumos.clipes.get(nome);
      if (clip === undefined) throw new Error(`o arquivo não tem a ação "${nome}"`);
      const acao = this.mixer.clipAction(clip);
      acao.setLoop(LoopOnce, 1);
      acao.clampWhenFinished = true;
      acao.setEffectiveWeight(0);
      acao.play();
      acao.paused = true;
      return acao;
    });
    this.caras = new MisturaDeCaras(meta.caras, meta.caras[0] ?? '', opcoes.tempoDeTrocaDaCaraS);
    this.piscador = new Piscador(opcoes.sorteio, opcoes.piscar);
    this.definirNivel('alto');
    this.aplicar(0);
  }

  private no(nome: string): Object3D {
    let n = this.nos.get(nome);
    if (n === undefined) {
      n = this.cena.getObjectByName(nome);
      if (n === undefined) throw new Error(`"${nome}" não existe no personagem`);
      this.nos.set(nome, n);
    }
    return n;
  }

  /** A mesma pessoa em outro nível de detalhe: a malha alta para o alto e o médio, a baixa para o baixo. */
  definirNivel(nivel: NivelDeDetalhe): void {
    const alta = nivel !== 'baixo';
    for (const m of this.alta) m.visible = alta;
    for (const m of this.baixa) m.visible = !alta;
  }

  /**
   * Muda a cor da equipe do látex desta instância: no material que a malha tem agora (o jogo troca os materiais por variantes de
   * qualidade, que são cópias) e no original.
   */
  tingir(cor: number): void {
    for (const m of this.latex) tingirMaterial(m, cor);
    for (const m of this.malhasDeLatex) tingirMaterial(m.material as unknown as MaterialTingivel, cor);
  }

  /** A cor que o látex tem agora (a do material que a primeira malha de látex usa neste instante). */
  get corDoLatex(): number {
    return (this.malhasDeLatex[0]?.material as unknown as MaterialTingivel | undefined)?.color.getHex() ?? 0;
  }

  /** Os materiais de látex desta instância (que o jogo entrega às variantes de qualidade). */
  get materiaisDeLatex(): readonly MeshPhysicalMaterial[] {
    return this.latex;
  }

  /** O osso (ou nó) pelo nome. */
  osso(nome: string): Bone {
    return this.no(nome) as Bone;
  }

  /** Volta ao começo: só a parada, cara neutra, olhos de frente e o piscar solto. Para quando o personagem sai de cena e volta. */
  reiniciar(): void {
    this.mistura.reiniciar();
    this.caras.forcar(this.insumos.meta.caras[0] ?? '');
    this.piscarForcado = null;
    this.olhando = false;
    for (const o of this.olhos) o.atual.copy(o.repouso);
    this.aplicar(0);
  }

  // ---- ações do corpo ----

  /**
   * Põe a ação do arquivo por cima da parada: entra em `entradaS`, toca e sai nos últimos `saidaS`; com `repetir` repete o trecho de
   * ciclo da meta até `soltarAcao`. As que estavam em curso saem enquanto a nova entra. `false` se ela já estava tocando.
   */
  fazerAcao(nome: string, opcoes: OpcoesDaAcao): boolean {
    return this.mistura.fazer(nome, opcoes);
  }

  /** Solta a ação que repete: ela sai em `saidaS` (padrão: a com que entrou). */
  soltarAcao(nome: string, saidaS?: number): void {
    this.mistura.soltar(nome, saidaS);
  }

  /** Solta tudo o que repete. */
  soltarAcoes(saidaS?: number): void {
    this.mistura.soltarTudo(saidaS);
  }

  /** A ação em curso mais nova que ainda não foi solta, ou `null` (só a parada). */
  get acaoEmCurso(): string | null {
    return this.mistura.emCurso;
  }

  /** O instante da ação (s) que se mostra agora: para a base, o relógio dela. */
  tempoDaAcao(nome: string): number {
    return this.mistura.tempos[this.mistura.indice(nome)]!;
  }

  /** O peso da ação (0 a 1). */
  pesoDaAcao(nome: string): number {
    return this.mistura.pesos[this.mistura.indice(nome)]!;
  }

  /** A cara que o artista sugere para a ação. */
  caraDaAcao(nome: string): string | undefined {
    return this.insumos.meta.acoes.get(nome)?.caraPar;
  }

  // ---- rosto ----

  /** Passa a fazer a cara (mistura suave a partir da de agora). */
  fazerCara(nome: string): void {
    this.caras.ir(nome);
  }

  get caraAtual(): string {
    return this.caras.atual;
  }

  /** Pisca agora (além das piscadas sozinhas). */
  piscarJa(): void {
    this.piscador.piscarJa();
  }

  /** Prende o piscar num valor (0 a 1), por exemplo numa captura; `null` solta e o personagem volta a piscar sozinho. */
  forcarPiscar(valor: number | null): void {
    this.piscarForcado = valor;
  }

  // ---- olhos ----

  /** Os olhos passam a mirar um ponto do mundo (até o limite do meta); a cópia é do personagem. */
  olharPara(ponto: PontoDoMundo): void {
    this.pontoDoOlhar.set(ponto.x, ponto.y, ponto.z);
    this.olhando = true;
  }

  /** Os olhos estão mirando um ponto (e não olhando para a frente). */
  get olhandoUmPonto(): boolean {
    return this.olhando;
  }

  /** Os olhos voltam a olhar para a frente. */
  pararDeOlhar(): void {
    this.olhando = false;
  }

  // ---- âncoras ----

  /**
   * Onde está o ponto de ancoragem `nome` (a mão) no mundo agora, com a orientação e **sem a escala do corpo**: o balão estufa e
   * murcha, e o que se prende nele não. Escreve em `saida`; vale para o quadro atual, depois de `atualizar` e de a `raiz` ser posta.
   */
  ancora(nome: string, saida: Quadro): void {
    const no = this.no(nome);
    no.updateWorldMatrix(true, false);
    ancoraDaMatriz(no.matrixWorld.elements, saida);
  }

  // ---- quadro ----

  /** Avança `dt` s: ações, rosto, piscar, ossos e, por cima do que a animação fez, os olhos. Uma vez por quadro; nada aloca. */
  atualizar(dt: number): void {
    this.aplicar(Math.max(dt, 0));
  }

  private aplicar(dt: number): void {
    this.mistura.atualizar(dt);
    this.piscador.atualizar(dt);
    this.caras.atualizar(dt);
    this.caras.definirPiscar(this.piscarForcado ?? this.piscador.valor);
    for (let i = 0; i < this.acoes.length; i++) {
      const acao = this.acoes[i]!;
      const w = this.mistura.pesos[i]!;
      acao.enabled = w > PESO_MINIMO;
      acao.setEffectiveWeight(w);
      acao.time = this.mistura.tempos[i]!;
    }
    this.mixer.update(0);
    this.formas();
    this.olhar(dt);
  }

  private formas(): void {
    const { pesos, piscar } = this.caras;
    for (const m of this.malhas) {
      const w = m.malha.morphTargetInfluences;
      if (w === undefined) continue;
      for (let c = 0; c < m.caras.length; c++) {
        const k = m.caras[c]!;
        if (k >= 0) w[k] = pesos[c]!;
      }
      if (m.piscar >= 0) w[m.piscar] = piscar;
    }
  }

  /** Depois do mixer: cada olho gira do repouso para o alvo (até o limite) e o osso vai para onde o olho está. */
  private olhar(dt: number): void {
    if (this.olhos.length === 0) return;
    const { limiteDoOlharRad } = this.insumos.meta;
    const k = 1 - Math.exp(-this.taxaDoOlhar * dt);
    for (const o of this.olhos) {
      if (this.olhando) {
        o.pai.updateWorldMatrix(true, false);
        o.pai.getWorldQuaternion(giro).invert();
        mundo.copy(o.osso.position).applyMatrix4(o.pai.matrixWorld);
        alvo.copy(this.pontoDoOlhar).sub(mundo).applyQuaternion(giro);
        girarOlho(o.eixo[0]!, o.eixo[1]!, o.eixo[2]!, alvo.x, alvo.y, alvo.z, limiteDoOlharRad, buffer, 0);
        o.desejado.set(buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!).multiply(o.repouso);
      } else o.desejado.copy(o.repouso);
      o.atual.slerp(o.desejado, k);
      o.osso.quaternion.copy(o.atual);
    }
  }

  /** Solta o que é só desta instância (a geometria e os outros materiais são da base). */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.cena);
    this.raiz.removeFromParent();
    for (const m of this.latex) m.dispose();
  }
}
