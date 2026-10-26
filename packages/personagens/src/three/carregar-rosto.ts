import { SkinnedMesh, type AnimationClip, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { lerMetaDoRosto, type MetaDoRosto } from '../meta-do-rosto';
import type { NomesDasMalhas } from './ficha-do-gltf';
import { malhasDoNivel } from './ficha-do-gltf';
import { PersonagemDeRosto, type OpcoesDaInstancia } from './rosto-em-cena';

export interface OpcoesDeCargaDoRosto {
  /** O conteúdo já lido do arquivo de notas do artista (`balao-meta.json`). */
  readonly meta: unknown;
  /** O nome (ou prefixo) do grupo de malhas de cada nível de detalhe. */
  readonly nomesDasMalhas: NomesDasMalhas;
  /** A ação de ciclo que o personagem faz parado. */
  readonly acaoBase: string;
  /** O material que a cor da equipe tinge (padrão `latex_glb`). */
  readonly nomeDoLatex?: string;
  /** A forma que fecha os olhos (padrão `piscar`). */
  readonly formaDePiscar?: string;
}

/** O que se carregou do arquivo, pronto para fazer personagens em cena: a malha, os clipes e as notas, sem nenhuma instância ainda. */
export class BaseDoRosto {
  constructor(
    private readonly gltf: GLTF,
    readonly meta: MetaDoRosto,
    private readonly opcoes: Required<Omit<OpcoesDeCargaDoRosto, 'meta'>>,
  ) {}

  /** Quantos triângulos tem cada nível de malha. */
  triangulos(nivel: 'alta' | 'baixa'): number {
    return malhasDoNivel(this.gltf.scene, this.opcoes.nomesDasMalhas[nivel]).reduce((s, m) => s + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0);
  }

  private clipe(nome: string): AnimationClip {
    const c = this.gltf.animations.find((a) => a.name === nome);
    if (c === undefined) throw new Error(`o arquivo não tem a ação "${nome}"`);
    return c;
  }

  /** A duração do clipe do arquivo (s). */
  duracaoDoClipe(nome: string): number {
    return this.clipe(nome).duration;
  }

  /** Os ossos (ou nós) que o clipe anima, com a propriedade (`osso.quaternion`). */
  trilhasDoClipe(nome: string): string[] {
    return this.clipe(nome).tracks.map((t) => t.name);
  }

  /** Um personagem em cena, com o látex dele na cor pedida. */
  instanciar(opcoes: OpcoesDaInstancia): PersonagemDeRosto {
    return new PersonagemDeRosto(
      {
        cena: this.gltf.scene,
        clipes: new Map(this.gltf.animations.map((c) => [c.name, c])),
        meta: this.meta,
        nomesDasMalhas: this.opcoes.nomesDasMalhas,
        acaoBase: this.opcoes.acaoBase,
        nomeDoLatex: this.opcoes.nomeDoLatex,
        formaDePiscar: this.opcoes.formaDePiscar,
      },
      opcoes,
    );
  }

  /** Solta a geometria. As instâncias deixam de poder ser desenhadas. */
  dispose(): void {
    this.gltf.scene.traverse((o: Object3D) => {
      if (o instanceof SkinnedMesh) o.geometry.dispose();
    });
  }
}

/** Faz a base a partir dos bytes do `.glb` e do conteúdo já lido do arquivo de notas. */
export async function carregarPersonagemDeRostoDeBytes(glb: ArrayBuffer, opcoes: OpcoesDeCargaDoRosto): Promise<BaseDoRosto> {
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  const meta = lerMetaDoRosto(opcoes.meta);
  return new BaseDoRosto(gltf, meta, {
    nomesDasMalhas: opcoes.nomesDasMalhas,
    acaoBase: opcoes.acaoBase,
    nomeDoLatex: opcoes.nomeDoLatex ?? 'latex_glb',
    formaDePiscar: opcoes.formaDePiscar ?? 'piscar',
  });
}

/** Baixa o `.glb` e o arquivo de notas e faz a base. Lança se um deles falhar: quem chama decide o que fazer sem o personagem. */
export async function carregarPersonagemDeRosto(urlDoGlb: string, urlDaMeta: string, opcoes: Omit<OpcoesDeCargaDoRosto, 'meta'>): Promise<BaseDoRosto> {
  const [glb, meta] = await Promise.all([
    fetch(urlDoGlb).then((r) => {
      if (!r.ok) throw new Error(`${urlDoGlb}: ${r.status}`);
      return r.arrayBuffer();
    }),
    fetch(urlDaMeta).then((r) => {
      if (!r.ok) throw new Error(`${urlDaMeta}: ${r.status}`);
      return r.json() as Promise<unknown>;
    }),
  ]);
  return carregarPersonagemDeRostoDeBytes(glb, { ...opcoes, meta });
}
