import { Color, MeshPhysicalMaterial, SkinnedMesh, type Material, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { lerContatos } from '../contatos';
import { lerMeta, type MetaDoPersonagem } from '../meta';
import type { MalhaComPele } from '../malha';
import { construirModelo, type ModeloDoPersonagem, type OpcoesDoModelo } from '../modelo';
import { acoesDoGltf, fichaDoGltf, malhaDoNivel, malhasDoNivel, NOMES_DAS_MALHAS_PADRAO, type NomesDasMalhas } from './ficha-do-gltf';
import { materialDeLatex, tingirMaterial } from './latex';
import { PersonagemEmCena } from './personagem';

export interface OpcoesDeCarga {
  readonly nomesDasMalhas?: NomesDasMalhas;
  readonly modelo?: OpcoesDoModelo;
  /** A pose em que cada instância nasce (padrão: `repouso`). */
  readonly inicial?: string;
  /** A cor da equipe com que o látex nasce. */
  readonly cor?: number;
  /** O conteúdo já lido do arquivo de notas do artista (`mao-meta.json`): pico, ciclo e aditivo dos gestos. Sem ele os gestos tocam uma vez. */
  readonly meta?: unknown;
}

/** O que `carregarPersonagem` baixa além do `.glb` e dos contatos. */
export interface OpcoesDeCargaPelaRede extends Omit<OpcoesDeCarga, 'meta'> {
  /** Onde está o arquivo de notas do artista. Se vier e falhar, a carga falha. */
  readonly urlDaMeta?: string;
}

/** O que se carregou do arquivo, pronto para fazer personagens em cena: as contas puras, as ações e a malha, sem nenhuma instância ainda. */
export class BaseDoPersonagem {
  private readonly materiais: MeshPhysicalMaterial[] = [];
  private readonly acoes: ReturnType<typeof acoesDoGltf>;
  private corDaEquipe: number;

  constructor(
    readonly modelo: ModeloDoPersonagem,
    private readonly gltf: GLTF,
    private readonly opcoes: Required<Pick<OpcoesDeCarga, 'nomesDasMalhas' | 'inicial'>> & { readonly meta: MetaDoPersonagem | null },
    cor: number,
  ) {
    this.acoes = acoesDoGltf(gltf);
    this.corDaEquipe = cor;
    // Um látex por material do arquivo (o nome decide: o branco e o do fundo do punho), no lugar do que o arquivo trouxe.
    const feitos = new Map<Material, MeshPhysicalMaterial>();
    gltf.scene.traverse((o: Object3D) => {
      if (!(o instanceof SkinnedMesh)) return;
      const origem = o.material as Material;
      let latex = feitos.get(origem);
      if (latex === undefined) {
        const base = (origem as MeshPhysicalMaterial).color ?? new Color(1, 1, 1);
        latex = materialDeLatex(cor, base, origem.name.replace(/_glb$/, ''), origem);
        feitos.set(origem, latex);
        this.materiais.push(latex);
      }
      o.material = latex;
    });
    for (const m of feitos.keys()) m.dispose();
  }

  /** Quantos triângulos tem cada nível de malha (para o diagnóstico e os testes). */
  triangulos(nivel: 'alta' | 'baixa'): number {
    return malhasDoNivel(this.gltf.scene, this.opcoes.nomesDasMalhas[nivel]).reduce((s, m) => s + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0);
  }

  /** A malha de um nível como dados puros (vértices, ossos e pesos), no referencial do personagem: o que a pele toca numa pose. */
  malha(nivel: 'alta' | 'baixa'): MalhaComPele {
    return malhaDoNivel(this.gltf, malhasDoNivel(this.gltf.scene, this.opcoes.nomesDasMalhas[nivel]));
  }

  /** Muda a cor da equipe de todo o látex, sem trocar de material. */
  tingir(cor: number): void {
    this.corDaEquipe = cor;
    for (const m of this.materiais) tingirMaterial(m, cor);
  }

  /** As notas do artista sobre os gestos (`mao-meta.json`), se vieram com a carga. */
  get meta(): MetaDoPersonagem | null {
    return this.opcoes.meta;
  }

  /** A cor da equipe de agora. */
  get cor(): number {
    return this.corDaEquipe;
  }

  /** Os materiais de látex, que a base entrega às variantes de material do jogo (elas os conhecem por serem `MeshPhysicalMaterial`). */
  get latex(): readonly MeshPhysicalMaterial[] {
    return this.materiais;
  }

  /** Um personagem em cena (a esquerda, com `espelho`: o espelho em `x` da ficha da direita). Compartilha geometria e materiais. */
  instanciar(espelho: boolean): PersonagemEmCena {
    return new PersonagemEmCena(
      {
        cena: this.gltf.scene,
        poses: this.acoes.poses,
        gestos: this.acoes.gestos,
        correntes: this.modelo.correntes,
        nomeDosOssos: this.modelo.ficha.ossos.map((o) => o.nome),
        nomesDasMalhas: this.opcoes.nomesDasMalhas,
        inicial: this.opcoes.inicial,
        meta: this.opcoes.meta,
      },
      espelho,
    );
  }

  /** Solta a geometria e os materiais. As instâncias deixam de poder ser desenhadas. */
  dispose(): void {
    this.gltf.scene.traverse((o: Object3D) => {
      if (o instanceof SkinnedMesh) o.geometry.dispose();
    });
    for (const m of this.materiais) m.dispose();
  }
}

/** Faz a base a partir dos bytes do `.glb` e do conteúdo já lido do arquivo de contatos. */
export async function carregarPersonagemDeBytes(glb: ArrayBuffer, contatos: unknown, opcoes: OpcoesDeCarga = {}): Promise<BaseDoPersonagem> {
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  const nomes = opcoes.nomesDasMalhas ?? NOMES_DAS_MALHAS_PADRAO;
  const ficha = fichaDoGltf(gltf);
  const malha = malhaDoNivel(gltf, malhasDoNivel(gltf.scene, nomes.alta));
  const modelo = construirModelo(ficha, lerContatos(contatos), malha, {
    esferasPorOsso: (nome) => (nome === 'palma' ? 6 : nome === 'pulso' ? 3 : 2),
    ...opcoes.modelo,
  });
  const meta = opcoes.meta === undefined ? null : lerMeta(opcoes.meta);
  return new BaseDoPersonagem(modelo, gltf, { nomesDasMalhas: nomes, inicial: opcoes.inicial ?? 'repouso', meta }, opcoes.cor ?? 0xffffff);
}

/** Baixa o `.glb`, o arquivo de contatos e, se pedido, o de notas, e faz a base. Lança se um deles falhar: quem chama decide o que fazer sem o personagem. */
export async function carregarPersonagem(urlDoGlb: string, urlDosContatos: string, opcoes: OpcoesDeCargaPelaRede = {}): Promise<BaseDoPersonagem> {
  const { urlDaMeta, ...resto } = opcoes;
  const [glb, contatos, meta] = await Promise.all([
    fetch(urlDoGlb).then((r) => {
      if (!r.ok) throw new Error(`${urlDoGlb}: ${r.status}`);
      return r.arrayBuffer();
    }),
    fetch(urlDosContatos).then((r) => {
      if (!r.ok) throw new Error(`${urlDosContatos}: ${r.status}`);
      return r.json() as Promise<unknown>;
    }),
    urlDaMeta === undefined
      ? Promise.resolve(undefined)
      : fetch(urlDaMeta).then((r) => {
          if (!r.ok) throw new Error(`${urlDaMeta}: ${r.status}`);
          return r.json() as Promise<unknown>;
        }),
  ]);
  return carregarPersonagemDeBytes(glb, contatos, { ...resto, ...(meta === undefined ? {} : { meta }) });
}
