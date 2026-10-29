import { AnimationAction, AnimationMixer, Color, Group, LoopOnce, Matrix4, type AnimationClip, type Bone, type Material, type Mesh, type MeshPhysicalMaterial, type Object3D, type SkinnedMesh, type Texture } from 'three';
import { clone as clonarComEsqueleto } from 'three/addons/utils/SkeletonUtils.js';
import { MisturaDeAcoes, type DefinicaoDaAcao, type OpcoesDaAcao } from '../acoes';
import type { Quadro } from '../alinhar';
import { escalaDoAcessorio } from '../escala-do-acessorio';
import { ancoraDaMatriz } from '../ancora';
import type { OpcoesDaAtencao } from '../atencao';
import type { OpcoesDaCordinha } from '../cordinha';
import type { EstilosDeOlhoDaMeta, MetaDoRosto } from '../meta-do-rosto';
import type { OpcoesDaGelatina, OpcoesDoCorpo, OpcoesDoFlutuar } from '../movimento-secundario';
import type { OpcoesParciaisDoOlhar } from '../olhar-vivo';
import { MisturaDeCaras, PalpebrasDoOlhar, Piscadinha, Piscador, type OpcoesDoPiscador } from '../rosto';
import { BaseDeAcessorios } from './acessorios';
import { CordinhaEmCena } from './cordinha-em-cena';
import { CorpoEmCena, type OssosDoCorpo } from './corpo-em-cena';
import { malhasDoNivel, type NomesDasMalhas } from './ficha-do-gltf';
import { materialDeLatex, tingirMaterial, type MaterialTingivel, type NivelDeDetalhe } from './latex';
import { OlharEmCena } from './olhar-em-cena';

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

/** O que o personagem faz por conta própria, por cima das ações. Tudo liga sozinho quando o arquivo tem o que precisa; `false` desliga. */
export interface OpcoesDeMovimento {
  /** Olhos vivos: sacadas, fixação com microssacadas, perseguição, vergência e atenção. Desligado, os olhos ficam parados no repouso. */
  readonly olhar?: boolean;
  /** O corpo gira e inclina atrás dos olhos (precisa de `olhar`). */
  readonly corpoSegue?: boolean;
  /** Squash and stretch do corpo com a aceleração. */
  readonly gelatina?: boolean;
  /** A deriva lenta da parada, por ruído semeado. */
  readonly flutuar?: boolean;
  /** A cordinha simulada. */
  readonly cordinha?: boolean;
  /** As pálpebras que seguem o olhar na vertical (precisa das formas e do `palpebras` do meta). */
  readonly palpebras?: boolean;
}

/** Os números de cada recurso do movimento; o que não vem fica no padrão do pacote. */
export interface AjustesDoMovimento {
  readonly olhar?: OpcoesParciaisDoOlhar;
  readonly atencao?: Partial<OpcoesDaAtencao>;
  readonly seguidor?: Partial<OpcoesDoCorpo>;
  readonly gelatina?: Partial<OpcoesDaGelatina>;
  readonly flutuar?: Partial<OpcoesDoFlutuar>;
  readonly cordinha?: Partial<OpcoesDaCordinha>;
  /** A mola das pálpebras que seguem o olhar. */
  readonly palpebras?: { readonly frequenciaHz?: number; readonly amortecimento?: number };
}

/** O que está ligado neste personagem agora (o que o arquivo oferece, menos o que `movimento` desligou). */
export interface RecursosDoPersonagem {
  readonly olhar: boolean;
  readonly corpoSegue: boolean;
  readonly gelatina: boolean;
  readonly flutuar: boolean;
  readonly cordinha: boolean;
  /** As pálpebras seguem o olhar na vertical (formas `palpebra_cima` e `palpebra_baixo` e o `palpebras` do meta). */
  readonly palpebras: boolean;
  /** Dá para fechar um olho só (formas `piscar_esq` e `piscar_dir`). */
  readonly piscadinha: boolean;
  /** v3: dá para prender um acessório (o chapéu) na âncora. */
  readonly acessorio: boolean;
  /** v3: dá para ligar um bigode (variante de malha com as formas do rosto). */
  readonly bigodes: boolean;
  /** v3: dá para trocar o estilo de olho. */
  readonly estilosDeOlho: boolean;
  /** v3: dá para tingir a íris (precisa dos estilos de olho: é neles que o arquivo diz qual material é a íris). */
  readonly coresDeOlho: boolean;
}

/** O que o personagem está usando (v3): o id do acessório e do bigode (`null` = sem) e o do estilo e da cor de olho. */
export interface AparenciaDoPersonagem {
  readonly acessorio: string | null;
  readonly bigode: string | null;
  readonly estiloDeOlho: string | null;
  readonly corDosOlhos: string | null;
}

/** Como uma instância nasce. */
export interface OpcoesDaInstancia {
  /** A cor da equipe com que o látex nasce. */
  readonly cor: number;
  /** De 0 a 1: o intervalo entre piscadas, o olhar e a deriva saem daqui (injetado, nunca `Math.random` direto). */
  readonly sorteio: () => number;
  readonly piscar?: Partial<OpcoesDoPiscador>;
  /** Quanto leva a troca de uma cara para outra chegar ao alvo (s); padrão 0,14. */
  readonly tempoDeTrocaDaCaraS?: number;
  /** De 0 a 1: quanto menor, mais a cara passa do alvo antes de assentar; padrão 0,6. */
  readonly amortecimentoDaCara?: number;
  /** @deprecated o olho agora anda por sacadas (L46); esta opção não faz nada. */
  readonly taxaDoOlhar?: number;
  /**
   * Quais recursos do movimento ligar (padrão: todos que o arquivo permite). `false` desliga todos: sobram as ações, as caras, o
   * piscar e a piscadinha pedida, sem olhar, corpo que segue, gelatina, flutuar, cordinha simulada nem pálpebras que seguem o olhar.
   */
  readonly movimento?: OpcoesDeMovimento | false;
  readonly ajustes?: AjustesDoMovimento;
  /** Os ossos do balanço geral e do corpo que gira e estufa (padrão `raiz` e `espinha_1`). */
  readonly ossosDoCorpo?: OssosDoCorpo;
  /**
   * Aplica o `latex_proposta` do meta v2 ao látex das malhas altas (o do nível alto e do médio); a malha baixa fica com o padrão do
   * pacote. Padrão `true`; `false` mantém o látex de antes do L46b em todas as malhas.
   */
  readonly latexProposto?: boolean;
}

/** Um ponto no mundo (m). */
export interface PontoDoMundo {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const MOVIMENTO_COMPLETO: Required<OpcoesDeMovimento> = { olhar: true, corpoSegue: true, gelatina: true, flutuar: true, cordinha: true, palpebras: true };
const SEM_MOVIMENTO: Required<OpcoesDeMovimento> = { olhar: false, corpoSegue: false, gelatina: false, flutuar: false, cordinha: false, palpebras: false };

const PESO_MINIMO = 0.0005;
/** A íris tingida acende um pouco: `emissive = cor × 0,30` (a receita do artista, vale para qualquer cor e estilo). */
const BRILHO_DA_IRIS = 0.3;
const OSSOS_DO_CORPO: OssosDoCorpo = { raiz: 'raiz', corpo: 'espinha_1' };

interface MalhaComFormas {
  readonly malha: SkinnedMesh;
  /** Índice de cada cara em `morphTargetInfluences` (−1 se a malha não tem a forma). */
  readonly caras: Int16Array;
  readonly piscar: number;
  readonly piscarEsq: number;
  readonly piscarDir: number;
  readonly palpebraCima: number;
  readonly palpebraBaixo: number;
  /** Índice de cada forma `estilo_*` (na ordem de `formasDeEstilo`), −1 se a malha não tem. */
  readonly estilos: Int16Array;
}

/** Um nível de um bigode: a malha e, forma a forma, de onde (no rosto) para onde (no bigode) o peso vai. */
interface NoDeBigode {
  readonly malha: Mesh;
  readonly de: Int16Array;
  readonly para: Int16Array;
}

/** O que a esclera ou a íris deve ter agora, em todo material que as malhas visíveis usam (o original da instância ou uma cópia de qualidade). */
interface AlvoDoOlho {
  /** O material da instância (cópia do arquivo): o jogo faz as variantes de qualidade a partir dele. */
  readonly proprio: MeshPhysicalMaterial;
  readonly malhas: readonly SkinnedMesh[];
  map: Texture | null;
  emissiveMap: Texture | null;
  /** O tom (`0xRRGGBB`, sRGB) que tinge o material, ou −1 se ele não é tingido (a esclera). */
  cor: number;
}

interface ParDeMateriais {
  readonly esclera: MeshPhysicalMaterial;
  readonly iris: MeshPhysicalMaterial;
}

/**
 * Um personagem de rosto em cena (o balão): um grupo `raiz` que quem usa põe no mundo, com o esqueleto, as duas versões da malha,
 * as ações do corpo (uma parada que repete e as que entram por cima, com ciclo), o rosto de formas (a cara, com mola, e o piscar
 * natural) e, por cima disso tudo, o que o faz parecer vivo (L46): o **olhar** (pontos de interesse com prioridade; sacadas,
 * fixação, perseguição, vergência), o **corpo que segue os olhos**, as **pálpebras** que acompanham o olhar na vertical, a
 * **piscadinha**, a **gelatina**, o **flutuar** e a **cordinha simulada**. Cada instância tem os seus ossos e o seu látex;
 * compartilha geometria e os outros materiais com a base (`BaseDoRosto.instanciar`). Tudo o que é do arquivo v2 é opcional: se a
 * forma, o osso ou a chave não existe, o recurso se desliga sozinho (`recursos`). Nada aloca por quadro.
 */
export class PersonagemDeRosto {
  readonly raiz = new Group();
  /** O que está ligado neste personagem. */
  readonly recursos: RecursosDoPersonagem;
  private readonly mixer: AnimationMixer;
  private readonly mistura: MisturaDeAcoes;
  private readonly acoes: AnimationAction[];
  private readonly nomesDasAcoes: string[];
  private readonly indiceDaBase: number;
  private readonly caras: MisturaDeCaras;
  private readonly piscador: Piscador;
  private readonly piscadinhaEsq = new Piscadinha();
  private readonly piscadinhaDir = new Piscadinha();
  private readonly palpebras: PalpebrasDoOlhar | null;
  /** Quanto cada cara deixa o olho aberto, na ordem de `meta.caras` (a meta do artista; 1 para a que não diz). */
  private readonly aberturaDasCaras: Float64Array;
  private piscarForcado: number | null = null;
  private readonly malhas: MalhaComFormas[] = [];
  private readonly alta: SkinnedMesh[];
  private readonly baixa: SkinnedMesh[];
  private readonly latex: MeshPhysicalMaterial[] = [];
  private readonly malhasDeLatex: SkinnedMesh[] = [];
  private readonly corpo: CorpoEmCena | null;
  private readonly olhos: OlharEmCena | null;
  private readonly cordinha: CordinhaEmCena | null;
  private readonly cena: Object3D;
  private readonly nos = new Map<string, Object3D>();
  private nivel: NivelDeDetalhe = 'alto';

  // ---- a aparência (v3): chapéu, bigode, estilo e cor de olho ----
  private readonly formasDeEstilo: string[];
  private estiloAtivo = -1;
  private readonly noDaAncora: Object3D | null;
  private baseDeAcessorios: BaseDeAcessorios | null = null;
  private readonly acessorios = new Map<string, { readonly alta: Object3D; readonly baixa: Object3D }>();
  private acessorioId: string | null = null;
  private readonly matrizDaAncora = new Matrix4();
  private readonly escalaDoNo: [number, number, number] = [1, 1, 1];
  private readonly escalaLocal: [number, number, number] = [1, 1, 1];
  private readonly bigodes = new Map<string, { readonly alta: NoDeBigode; readonly baixa: NoDeBigode }>();
  private bigodeId: string | null = null;
  private readonly materiaisDosEstilos = new Map<string, ParDeMateriais>();
  private esclera: AlvoDoOlho | null = null;
  private iris: AlvoDoOlho | null = null;
  private estiloId: string | null = null;
  private corId: string | null = null;

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
    const palpebrasDaMeta = meta.palpebras;
    const formasDaMeta = new Set(meta.formas);
    this.formasDeEstilo = [...new Set([...(meta.estilosDeOlho?.itens.values() ?? [])].map((e) => e.forma).filter((f): f is string => f !== null))];
    for (const m of [...this.alta, ...this.baixa]) {
      // a pele anda além da caixa da malha em repouso (o corpo estufa, pula): cortar pela caixa a faria sumir de perto
      m.frustumCulled = false;
      const origem = m.material as Material;
      if (origem.name === insumos.nomeDoLatex) {
        const base = (origem as MeshPhysicalMaterial).color ?? new Color(1, 1, 1);
        const doArtista =
          opcoes.latexProposto !== false && meta.latexProposto !== null && this.alta.includes(m)
            ? { numeros: meta.latexProposto, temCorDeVertice: m.geometry.hasAttribute('color') }
            : undefined;
        const latex = materialDeLatex(opcoes.cor, base, origem.name, origem, doArtista);
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
        // as formas do v2 só valem se a meta do artista as lista: sem a nota, o recurso fica desligado mesmo com a forma na malha
        piscarEsq: formasDaMeta.has('piscar_esq') ? (dic['piscar_esq'] ?? -1) : -1,
        piscarDir: formasDaMeta.has('piscar_dir') ? (dic['piscar_dir'] ?? -1) : -1,
        palpebraCima: palpebrasDaMeta && formasDaMeta.has(palpebrasDaMeta.cima.forma) ? (dic[palpebrasDaMeta.cima.forma] ?? -1) : -1,
        palpebraBaixo: palpebrasDaMeta && formasDaMeta.has(palpebrasDaMeta.baixo.forma) ? (dic[palpebrasDaMeta.baixo.forma] ?? -1) : -1,
        estilos: Int16Array.from(this.formasDeEstilo, (nome) => dic[nome] ?? -1),
      });
    }

    const definicoes: DefinicaoDaAcao[] = [...meta.acoes].map(([nome, a]) => ({ nome, duracaoS: a.duracaoS, cicloS: a.cicloS ?? null }));
    this.nomesDasAcoes = definicoes.map((d) => d.nome);
    this.mistura = new MisturaDeAcoes(definicoes, insumos.acaoBase);
    this.indiceDaBase = this.mistura.indice(insumos.acaoBase);
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
    this.caras = new MisturaDeCaras(meta.caras, meta.caras[0] ?? '', opcoes.tempoDeTrocaDaCaraS, opcoes.amortecimentoDaCara);
    this.piscador = new Piscador(opcoes.sorteio, opcoes.piscar);
    this.aberturaDasCaras = Float64Array.from(meta.caras, (nome) => meta.aberturaDaCara.get(nome) ?? 1);
    if (meta.pesoDaCaraNaPiscadinha.size > 0) this.caras.definirPesosNaPiscadinha(Float64Array.from(meta.caras, (nome) => meta.pesoDaCaraNaPiscadinha.get(nome) ?? 1));

    // ---- o movimento por cima das ações: cada peça liga só se o arquivo tem o que ela precisa ----
    const quer = opcoes.movimento === false ? SEM_MOVIMENTO : { ...MOVIMENTO_COMPLETO, ...opcoes.movimento };
    const ajustes = opcoes.ajustes ?? {};
    const ossos = opcoes.ossosDoCorpo ?? OSSOS_DO_CORPO;
    const querCorpo = quer.gelatina || quer.flutuar || (quer.corpoSegue && quer.olhar);
    this.corpo = querCorpo
      ? new CorpoEmCena(this.raiz, this.cena, {
          ossos,
          gelatina: quer.gelatina,
          flutuar: quer.flutuar,
          sorteio: opcoes.sorteio,
          ajustesDaGelatina: ajustes.gelatina,
          ajustesDoFlutuar: ajustes.flutuar,
          metadeDaAlturaM: meta.tamanhoDeRepouso?.metadeAlturaM,
        })
      : null;
    const corpoSegue = quer.olhar && quer.corpoSegue && this.corpo !== null && this.corpo.temCorpo;
    this.olhos =
      quer.olhar && meta.olhos.size > 0
        ? new OlharEmCena(this.cena, meta, {
            sorteio: opcoes.sorteio,
            corpo: corpoSegue ? this.corpo : null,
            olhar: ajustes.olhar,
            atencao: ajustes.atencao,
            seguidor: ajustes.seguidor,
          })
        : null;
    this.cordinha = quer.cordinha ? CordinhaEmCena.criar(this.cena, meta.cordinha, ajustes.cordinha) : null;
    const temFormasDasPalpebras = quer.palpebras && palpebrasDaMeta !== null && this.malhas.some((m) => m.palpebraCima >= 0 && m.palpebraBaixo >= 0);
    this.palpebras = temFormasDasPalpebras
      ? new PalpebrasDoOlhar({
          cimaGrausPara1: palpebrasDaMeta.cima.grausPara1,
          baixoGrausPara1: palpebrasDaMeta.baixo.grausPara1,
          ...ajustes.palpebras,
        })
      : null;
    // ---- a aparência (v3): só liga o que o arquivo e a meta trazem ----
    const ancoraDoAcessorio = meta.ancoraDeAcessorio;
    if (ancoraDoAcessorio === null) this.noDaAncora = null;
    else {
      this.noDaAncora = this.cena.getObjectByName(ancoraDoAcessorio.no) ?? null;
      if (this.noDaAncora === null) throw new Error(`o arquivo não tem a âncora "${ancoraDoAcessorio.no}" (ancora_chapeu.no)`);
    }
    this.prepararBigodes();
    this.prepararOlhos(meta.estilosDeOlho);
    this.recursos = {
      olhar: this.olhos !== null,
      corpoSegue,
      gelatina: this.corpo?.temGelatina ?? false,
      flutuar: this.corpo?.temFlutuar ?? false,
      cordinha: this.cordinha !== null,
      palpebras: this.palpebras !== null,
      piscadinha: this.malhas.some((m) => m.piscarEsq >= 0 && m.piscarDir >= 0),
      acessorio: this.noDaAncora !== null,
      bigodes: this.bigodes.size > 0,
      estilosDeOlho: this.esclera !== null && this.iris !== null,
      coresDeOlho: this.iris !== null && meta.coresDeOlho !== null,
    };
    if (this.iris !== null && meta.coresDeOlho !== null) this.corId = meta.coresDeOlho.padrao;
    this.aplicarCorDosOlhos();
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

  /** Os bigodes do arquivo: cada nível é uma malha comum, oculta (escala 0) e com as mesmas formas do rosto; aqui ficam também ocultos de verdade. */
  private prepararBigodes(): void {
    const origem = this.malhas[0]?.malha.morphTargetDictionary;
    for (const [id, v] of this.insumos.meta.bigodes) {
      const no = (nome: string): NoDeBigode => {
        const malha = this.cena.getObjectByName(nome) as Mesh | undefined;
        if (malha === undefined || malha.morphTargetDictionary === undefined) throw new Error(`o arquivo não tem o bigode "${nome}" com formas (bigodes.itens.${id})`);
        malha.frustumCulled = false;
        malha.visible = false;
        malha.scale.setScalar(0);
        const de: number[] = [];
        const para: number[] = [];
        for (const forma of this.insumos.meta.formas) {
          const i = origem?.[forma];
          const k = malha.morphTargetDictionary[forma];
          if (i !== undefined && k !== undefined) {
            de.push(i);
            para.push(k);
          }
        }
        return { malha, de: Int16Array.from(de), para: Int16Array.from(para) };
      };
      this.bigodes.set(id, { alta: no(v.noAlta), baixa: no(v.noBaixa) });
    }
  }

  /**
   * Os estilos de olho: a instância ganha uma cópia do material da esclera e da íris do estilo de fábrica (a primeira do meta) em cada
   * malha do corpo, para trocar a textura e tingir sem mexer nos outros balões; os materiais dos outros estilos vêm da vitrine, que sai da instância.
   */
  private prepararOlhos(estilos: EstilosDeOlhoDaMeta | null): void {
    if (estilos === null) return;
    const porNome = new Map<string, MeshPhysicalMaterial>();
    this.cena.traverse((o) => {
      const material = (o as Mesh).material as Material | Material[] | undefined;
      if (material !== undefined && !Array.isArray(material) && !porNome.has(material.name)) porNome.set(material.name, material as MeshPhysicalMaterial);
    });
    for (const [id, e] of estilos.itens) {
      const esclera = porNome.get(e.esclera);
      const iris = porNome.get(e.iris);
      if (esclera === undefined) throw new Error(`o arquivo não tem o material "${e.esclera}" (estilos_de_olho.itens.${id}.esclera.material)`);
      if (iris === undefined) throw new Error(`o arquivo não tem o material "${e.iris}" (estilos_de_olho.itens.${id}.iris.material)`);
      this.materiaisDosEstilos.set(id, { esclera, iris });
    }
    this.cena.getObjectByName(estilos.vitrine)?.removeFromParent();
    const [idDeFabrica, fabrica] = estilos.itens.entries().next().value!;
    const doCorpo = [...this.alta, ...this.baixa];
    const alvo = (nomeDoMaterial: string): AlvoDoOlho | null => {
      const malhas = doCorpo.filter((m) => (m.material as Material).name === nomeDoMaterial);
      if (malhas.length === 0) return null;
      const proprio = (malhas[0]!.material as MeshPhysicalMaterial).clone();
      for (const m of malhas) m.material = proprio;
      return { proprio, malhas, map: proprio.map, emissiveMap: proprio.emissiveMap, cor: -1 };
    };
    this.esclera = alvo(fabrica.esclera);
    this.iris = alvo(fabrica.iris);
    if (this.esclera === null || this.iris === null) {
      // o corpo não usa os materiais do estilo de fábrica: sem o que trocar, o recurso fica desligado
      this.esclera = null;
      this.iris = null;
      return;
    }
    this.estiloId = idDeFabrica;
  }

  /** A mesma pessoa em outro nível de detalhe: a malha alta para o alto e o médio, a baixa para o baixo. */
  definirNivel(nivel: NivelDeDetalhe): void {
    const alta = nivel !== 'baixo';
    this.nivel = nivel;
    for (const m of this.alta) m.visible = alta;
    for (const m of this.baixa) m.visible = !alta;
    this.mostrarAcessorio();
    this.mostrarBigode();
  }

  // ---- aparência (v3) ----

  /** O que o personagem está usando agora. */
  get aparencia(): AparenciaDoPersonagem {
    return { acessorio: this.acessorioId, bigode: this.bigodeId, estiloDeOlho: this.estiloId, corDosOlhos: this.corId };
  }

  private mostrarAcessorio(): void {
    const alta = this.nivel !== 'baixo';
    for (const [id, nos] of this.acessorios) {
      const ativo = id === this.acessorioId;
      nos.alta.visible = ativo && alta;
      nos.baixa.visible = ativo && !alta;
    }
  }

  /**
   * Prende o acessório `id` (o chapéu) de `base` na âncora do meta; `null` tira o que estava. Só o do nível em uso aparece (alto e médio
   * a malha alta, baixo a baixa) e, a cada quadro, a escala dele acompanha o estica e amassa do osso pela regra do meta (`ancora_chapeu`).
   * `false`, sem mudar nada, se o arquivo não tem âncora (v1 e v2) ou a base não tem o acessório. Cada instância tem os seus clones
   * (um por acessório e nível, feitos uma vez): trocar de acessório de novo não cria malha nova.
   */
  definirAcessorio(base: BaseDeAcessorios | null, id: string | null): boolean {
    if (this.noDaAncora === null) return false;
    if (id === null) {
      this.acessorioId = null;
      this.mostrarAcessorio();
      return true;
    }
    if (base === null || !base.tem(id)) return false;
    if (this.baseDeAcessorios !== base) {
      // outro arquivo: os clones do anterior saem
      for (const nos of this.acessorios.values()) {
        nos.alta.removeFromParent();
        nos.baixa.removeFromParent();
      }
      this.acessorios.clear();
      this.baseDeAcessorios = base;
    }
    if (!this.acessorios.has(id)) {
      const alta = base.clonar(id, 'alta')!;
      const baixa = base.clonar(id, 'baixa')!;
      alta.visible = false;
      baixa.visible = false;
      this.noDaAncora.add(alta, baixa);
      this.acessorios.set(id, { alta, baixa });
    }
    this.acessorioId = id;
    this.mostrarAcessorio();
    this.ajustarAcessorio();
    return true;
  }

  /** A regra de escala do meta: o acessório herda a escala do osso e compensa por eixo (largura pela média de x e z, altura por y). */
  private ajustarAcessorio(): void {
    const regra = this.insumos.meta.ancoraDeAcessorio;
    const nos = this.acessorioId === null ? undefined : this.acessorios.get(this.acessorioId);
    if (regra === null || nos === undefined || this.noDaAncora === null) return;
    // a escala do nó vista no personagem: as matrizes locais da âncora até a raiz do arquivo, sem a escala com que o jogo põe o personagem
    const m = this.matrizDaAncora.identity();
    for (let n: Object3D | null = this.noDaAncora; n !== null && n !== this.cena; n = n.parent) {
      n.updateMatrix();
      m.premultiply(n.matrix);
    }
    const e = m.elements;
    const no = this.escalaDoNo;
    no[0] = Math.hypot(e[0]!, e[1]!, e[2]!);
    no[1] = Math.hypot(e[4]!, e[5]!, e[6]!);
    no[2] = Math.hypot(e[8]!, e[9]!, e[10]!);
    escalaDoAcessorio(no, regra, this.escalaLocal);
    const [x, y, z] = this.escalaLocal;
    nos.alta.scale.set(x, y, z);
    nos.baixa.scale.set(x, y, z);
  }

  private mostrarBigode(): void {
    const alta = this.nivel !== 'baixo';
    for (const [id, par] of this.bigodes) {
      const ativo = id === this.bigodeId;
      for (const [no, doNivel] of [[par.alta, alta], [par.baixa, !alta]] as const) {
        const aparece = ativo && doNivel;
        no.malha.visible = aparece;
        no.malha.scale.setScalar(aparece ? 1 : 0);
      }
    }
    this.copiarFormasParaOBigode();
  }

  /**
   * Liga o bigode `id` (`null` tira): a malha do nível em uso com escala 1 e as mesmas formas do rosto, quadro a quadro (o arquivo
   * as entrega ocultas com escala 0 porque o three não lê `KHR_node_visibility`). `false`, sem mudar nada, se o arquivo não tem esse bigode.
   */
  definirBigode(id: string | null): boolean {
    if (id !== null && !this.bigodes.has(id)) return false;
    this.bigodeId = id;
    this.mostrarBigode();
    return true;
  }

  /** O peso de cada forma do rosto vai à forma de mesmo nome do bigode em uso (o bigode anda com a boca, o susto, o riso). */
  private copiarFormasParaOBigode(): void {
    const par = this.bigodeId === null ? undefined : this.bigodes.get(this.bigodeId);
    const origem = this.malhas[0]?.malha.morphTargetInfluences;
    if (par === undefined || origem === undefined) return;
    const no = this.nivel === 'baixo' ? par.baixa : par.alta;
    const destino = no.malha.morphTargetInfluences;
    if (destino === undefined) return;
    for (let i = 0; i < no.de.length; i++) destino[no.para[i]!] = origem[no.de[i]!]!;
  }

  /**
   * Troca o estilo de olho: peso 1 na forma `estilo_*` do estilo (0 nas outras), somada a qualquer cara, ao piscar e às pálpebras do
   * olhar, e a esclera e a íris passam a ter a textura do estilo. `false`, sem mudar nada, se o arquivo não tem esse estilo.
   */
  definirEstiloDeOlho(id: string): boolean {
    const estilo = this.insumos.meta.estilosDeOlho?.itens.get(id);
    const materiais = this.materiaisDosEstilos.get(id);
    if (estilo === undefined || materiais === undefined || this.esclera === null || this.iris === null) return false;
    this.estiloId = id;
    this.estiloAtivo = estilo.forma === null ? -1 : this.formasDeEstilo.indexOf(estilo.forma);
    this.esclera.map = materiais.esclera.map;
    this.esclera.emissiveMap = materiais.esclera.emissiveMap;
    this.iris.map = materiais.iris.map;
    this.iris.emissiveMap = materiais.iris.emissiveMap;
    this.igualar(this.esclera.proprio, this.esclera);
    this.igualar(this.iris.proprio, this.iris);
    this.sincronizarOlhos();
    return true;
  }

  /** Tinge a íris com a cor `id` do meta (`color` = cor, `emissive` = cor × 0,30), em qualquer estilo. `false`, sem mudar nada, se o arquivo não tem essa cor. */
  definirCorDosOlhos(id: string): boolean {
    if (this.iris === null || this.insumos.meta.coresDeOlho === null || !this.insumos.meta.coresDeOlho.cores.has(id)) return false;
    this.corId = id;
    this.aplicarCorDosOlhos();
    return true;
  }

  private aplicarCorDosOlhos(): void {
    if (this.iris === null || this.corId === null) return;
    this.iris.cor = this.insumos.meta.coresDeOlho!.cores.get(this.corId)!;
    this.igualar(this.iris.proprio, this.iris);
    this.sincronizarOlhos();
  }

  /** O material tem a textura e o tom que o alvo pede? Senão, passa a ter. Nada aloca. */
  private igualar(m: MeshPhysicalMaterial, alvo: AlvoDoOlho): void {
    if (m.map !== alvo.map) m.map = alvo.map;
    if (m.emissiveMap !== null && m.emissiveMap !== alvo.emissiveMap) m.emissiveMap = alvo.emissiveMap;
    if (alvo.cor >= 0 && m.color.getHex() !== alvo.cor) {
      m.color.setHex(alvo.cor);
      m.emissive.copy(m.color).multiplyScalar(BRILHO_DA_IRIS);
    }
  }

  /**
   * O material que a malha tem agora (o jogo o troca por cópias de qualidade) leva a textura e o tom do estilo e da cor em uso, como o
   * `tingir` faz com o látex. Só as malhas visíveis: a cada quadro, nada aloca.
   */
  private sincronizarOlhos(): void {
    for (const alvo of [this.esclera, this.iris]) {
      if (alvo === null) continue;
      for (const m of alvo.malhas) if (m.visible) this.igualar(m.material as MeshPhysicalMaterial, alvo);
    }
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

  /** Volta ao começo: só a parada, cara neutra, olhos de frente, sem interesses, e o piscar solto. Para quando o personagem sai de cena e volta. */
  reiniciar(): void {
    this.mistura.reiniciar();
    this.caras.forcar(this.insumos.meta.caras[0] ?? '');
    this.piscarForcado = null;
    this.olhos?.reiniciar();
    this.corpo?.reiniciar();
    this.aplicar(0);
    this.cordinha?.reiniciar();
  }

  /**
   * O personagem foi posto em outro lugar de uma vez (o balão que aparece do outro lado da mesa): a gelatina e a cordinha deixam
   * de contar essa viagem como movimento. Chame depois de pôr a `raiz` e antes do `atualizar`.
   */
  reposicionar(): void {
    this.corpo?.reposicionar();
    this.cordinha?.reiniciar();
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

  /** O arquivo tem esta ação? (O jogo pergunta antes de pedir uma que só o v2 traz, e recua para a do v1.) */
  temAcao(nome: string): boolean {
    return this.insumos.meta.acoes.has(nome);
  }

  /** A ação tem um trecho de ciclo na meta (pode repetir com `repetir: true`)? `false` se a ação não existe. */
  temCiclo(nome: string): boolean {
    return this.insumos.meta.acoes.get(nome)?.cicloS !== undefined;
  }

  // ---- rosto ----

  /** O arquivo tem esta cara? */
  temCara(nome: string): boolean {
    return this.caras.tem(nome);
  }

  /** Passa a fazer a cara (mistura por mola a partir da de agora: passa um pouco do alvo e assenta). */
  fazerCara(nome: string): void {
    this.caras.ir(nome);
  }

  get caraAtual(): string {
    return this.caras.atual;
  }

  /**
   * Para o diagnóstico (gancho de teste, capturas): o peso de cada forma do rosto que não é zero neste quadro (lido da primeira
   * malha, que tem o mesmo de todas) e a elevação do olho em relação à cabeça (graus; positiva para cima). Aloca: não chame por quadro.
   */
  diagnosticoDoRosto(): { readonly formas: Readonly<Record<string, number>>; readonly pitchDoOlhoGraus: number } {
    const formas: Record<string, number> = {};
    const m = this.malhas[0]?.malha;
    if (m?.morphTargetDictionary !== undefined && m.morphTargetInfluences !== undefined) {
      for (const [nome, k] of Object.entries(m.morphTargetDictionary)) {
        const w = m.morphTargetInfluences[k] ?? 0;
        if (Math.abs(w) > 1e-3) formas[nome] = Math.round(w * 1000) / 1000;
      }
    }
    return { formas, pitchDoOlhoGraus: ((this.olhos?.pitchDoOlho ?? 0) * 180) / Math.PI };
  }

  /** Pisca agora (além das piscadas sozinhas); `duplo` faz as duas, seguidas. */
  piscarJa(duplo = false): void {
    this.piscador.piscarJa(duplo);
  }

  /**
   * Fecha um olho só (o `piscar_esq` ou o `piscar_dir`), segura e abre. `false`, sem fazer nada, se o arquivo não tem as formas ou se
   * já há uma piscadinha desse lado.
   */
  piscadinha(lado: 'esq' | 'dir', duracaoS = 0.5): boolean {
    if (!this.recursos.piscadinha) return false;
    const p = lado === 'esq' ? this.piscadinhaEsq : this.piscadinhaDir;
    if (p.ativa) return false;
    p.disparar(duracaoS);
    return true;
  }

  /** Prende o piscar num valor (0 a 1), por exemplo numa captura; `null` solta e o personagem volta a piscar sozinho. */
  forcarPiscar(valor: number | null): void {
    this.piscarForcado = valor;
  }

  // ---- olhos ----

  /**
   * Põe (ou move) o ponto de interesse `id` (de 0 a 6) com a `prioridade` dada; prioridade zero o tira. O personagem escolhe com
   * tempo natural: fixa o mais importante por alguns segundos, olha outra coisa (na proporção da prioridade) e volta; um ponto que
   * passa a valer bem mais que o de agora o interrompe. Chame de novo a cada quadro se o ponto anda. "A câmera" é só mais um ponto.
   */
  definirInteresse(id: number, ponto: PontoDoMundo, prioridade: number): void {
    this.olhos?.definirInteresse(id, ponto.x, ponto.y, ponto.z, prioridade);
  }

  removerInteresse(id: number): void {
    this.olhos?.removerInteresse(id);
  }

  /** Tira todos os interesses (e solta o `olharPara`). */
  limparInteresses(): void {
    this.olhos?.limparInteresses();
  }

  /** Os olhos passam a mirar um ponto do mundo, acima de qualquer interesse (até o limite do meta; o corpo ajuda); a cópia é do personagem. */
  olharPara(ponto: PontoDoMundo): void {
    this.olhos?.olharPara(ponto.x, ponto.y, ponto.z);
  }

  /** Há para onde olhar (um ponto de `olharPara` ou um interesse), e não à frente. */
  get olhandoUmPonto(): boolean {
    return this.olhos?.olhandoUmPonto ?? false;
  }

  /** Solta o `olharPara`: o olhar volta aos interesses, ou à frente se não há nenhum. */
  pararDeOlhar(): void {
    this.olhos?.pararDeOlhar();
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

  /**
   * Avança `dt` s: ações, rosto, piscar, ossos e, por cima do que a animação fez, o movimento (olhos, corpo, gelatina, flutuar,
   * cordinha). Uma vez por quadro; nada aloca. Um `dt` que não é um tempo (`NaN`, infinito, negativo) é ignorado, como se o quadro
   * não tivesse existido; um `dt` enorme (aba parada) é limitado por cada peça (as molas têm solução exata, a cordinha roda em
   * passo fixo com teto de subpassos, o olhar tem teto de 0,25 s).
   */
  atualizar(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) return;
    this.aplicar(dt);
  }

  private aplicar(dt: number): void {
    const { corpo, olhos } = this;
    // o que o motor somou à animação no quadro anterior sai antes: o mixer só reescreve o osso quando a ação muda
    corpo?.restaurar();
    if (corpo !== null) this.mistura.ritmoDaBase = corpo.ritmo;
    this.mistura.atualizar(dt);
    this.caras.atualizar(dt);
    for (let i = 0; i < this.acoes.length; i++) {
      const acao = this.acoes[i]!;
      const w = this.mistura.pesos[i]!;
      acao.enabled = w > PESO_MINIMO;
      acao.setEffectiveWeight(w);
      acao.time = this.mistura.tempos[i]!;
    }
    this.mixer.update(0);
    corpo?.depoisDoMixer(dt, this.mistura.pesos[this.indiceDaBase]!);
    olhos?.atualizar(dt);
    this.piscar(dt);
    this.formas();
    this.cordinha?.atualizar(dt);
    this.sincronizarOlhos();
    this.ajustarAcessorio();
  }

  /** O piscar natural (com o pedido do salto do olhar), as piscadinhas e as pálpebras que seguem o olhar. */
  private piscar(dt: number): void {
    // a sacada grande pede um piscar, mas o piscador recusa o que cai dentro do intervalo mínimo desde a última (o olho se mexe sem piscar)
    if (this.olhos?.consumirPedidoDePiscar()) this.piscador.pedirPiscar();
    this.piscador.atualizar(dt);
    this.caras.definirPiscar(this.piscarForcado ?? this.piscador.valor);
    this.piscadinhaEsq.atualizar(dt);
    this.piscadinhaDir.atualizar(dt);
    this.caras.definirPiscadinha(Math.max(this.piscadinhaEsq.valor, this.piscadinhaDir.valor));
    this.palpebras?.atualizar(dt, this.olhos?.pitchDoOlho ?? 0);
  }

  private formas(): void {
    const { pesos, piscar } = this.caras;
    const aberto = 1 - piscar;
    const esq = this.piscadinhaEsq.valor * aberto;
    const dir = this.piscadinhaDir.valor * aberto;
    // as pálpebras que seguem o olhar valem o que a cara deixa o olho aberto, e zero com o olho fechado
    const livre = aberto * this.caras.abertura(this.aberturaDasCaras);
    const cima = (this.palpebras?.cima ?? 0) * livre;
    const baixo = (this.palpebras?.baixo ?? 0) * livre;
    for (const m of this.malhas) {
      const w = m.malha.morphTargetInfluences;
      if (w === undefined) continue;
      for (let c = 0; c < m.caras.length; c++) {
        const k = m.caras[c]!;
        if (k >= 0) w[k] = pesos[c]!;
      }
      if (m.piscar >= 0) w[m.piscar] = piscar;
      if (m.piscarEsq >= 0) w[m.piscarEsq] = esq;
      if (m.piscarDir >= 0) w[m.piscarDir] = dir;
      if (m.palpebraCima >= 0) w[m.palpebraCima] = cima;
      if (m.palpebraBaixo >= 0) w[m.palpebraBaixo] = baixo;
      for (let k = 0; k < m.estilos.length; k++) {
        const i = m.estilos[k]!;
        if (i >= 0) w[i] = k === this.estiloAtivo ? 1 : 0;
      }
    }
    this.copiarFormasParaOBigode();
  }

  /** Solta o que é só desta instância (a geometria e os outros materiais são da base). */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.cena);
    this.raiz.removeFromParent();
    for (const m of this.latex) m.dispose();
    this.esclera?.proprio.dispose();
    this.iris?.proprio.dispose();
  }
}
