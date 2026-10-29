import { Mesh, Texture, type LoadingManager, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { lerMetaDosAcessorios, type MetaDosAcessorios } from '../meta-dos-acessorios';

/** O nível de malha de um acessório: a alta serve ao nível alto e ao médio, a baixa ao baixo. */
export type NivelDoAcessorio = 'alta' | 'baixa';

export interface OpcoesDeCargaDosAcessorios {
  /** O conteúdo já lido do arquivo de notas do artista (`chapeus-meta.json`). */
  readonly meta: unknown;
  /** O `LoadingManager` do GLTFLoader (os testes em Node passam o de `gerenciadorDeTestes`). */
  readonly gerenciador?: LoadingManager;
}

function triangulosDe(raiz: Object3D): number {
  let total = 0;
  raiz.traverse((o) => {
    if (o instanceof Mesh) total += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
  });
  return total;
}

/**
 * Os acessórios de um personagem de rosto (os chapéus), de um `.glb` à parte: um nó por acessório e por nível, cuja origem é o ponto
 * que encosta na âncora do personagem. A base só guarda o arquivo; quem veste (`PersonagemDeRosto.definirAcessorio`) pega um clone, que
 * divide a geometria e os materiais com ela. Não depende de nenhum personagem em cena: quem carrega o arquivo só quando alguém precisa
 * de um acessório evita pagar por ele no menu.
 */
export class BaseDeAcessorios {
  /** Os ids, na ordem do arquivo. */
  readonly ids: readonly string[];
  private readonly nos = new Map<string, { readonly alta: Object3D; readonly baixa: Object3D }>();

  constructor(
    private readonly gltf: GLTF,
    readonly meta: MetaDosAcessorios,
  ) {
    for (const [id, a] of meta.acessorios) {
      const alta = gltf.scene.getObjectByName(a.noAlta);
      const baixa = gltf.scene.getObjectByName(a.noBaixa);
      if (alta === undefined) throw new Error(`o arquivo dos acessórios não tem o nó "${a.noAlta}" (${id}, alta)`);
      if (baixa === undefined) throw new Error(`o arquivo dos acessórios não tem o nó "${a.noBaixa}" (${id}, baixa)`);
      this.nos.set(id, { alta, baixa });
    }
    this.ids = [...meta.acessorios.keys()];
  }

  /** O arquivo tem este acessório? */
  tem(id: string): boolean {
    return this.nos.has(id);
  }

  /** Quantos triângulos tem o acessório no nível. */
  triangulos(id: string, nivel: NivelDoAcessorio): number {
    const n = this.nos.get(id);
    if (n === undefined) throw new Error(`o arquivo dos acessórios não tem "${id}"`);
    return triangulosDe(n[nivel]);
  }

  /** Um clone do nó do acessório no nível (geometria e materiais divididos com a base), sem pai e na origem; `undefined` se o arquivo não o tem. */
  clonar(id: string, nivel: NivelDoAcessorio): Object3D | undefined {
    const n = this.nos.get(id);
    if (n === undefined) return undefined;
    const c = n[nivel].clone(true);
    c.position.set(0, 0, 0);
    c.quaternion.identity();
    c.scale.set(1, 1, 1);
    c.visible = true;
    return c;
  }

  /** Solta a geometria e as texturas. Os clones deixam de poder ser desenhados. */
  dispose(): void {
    this.gltf.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const v of Object.values(m)) if (v instanceof Texture) v.dispose();
        m.dispose();
      }
    });
  }
}

/** Faz a base a partir dos bytes do `.glb` e do conteúdo já lido do arquivo de notas. Lança se a meta ou um nó que ela cita não vale. */
export async function carregarAcessoriosDeBytes(glb: ArrayBuffer, opcoes: OpcoesDeCargaDosAcessorios): Promise<BaseDeAcessorios> {
  const meta = lerMetaDosAcessorios(opcoes.meta);
  const gltf = await new GLTFLoader(opcoes.gerenciador).parseAsync(glb, '');
  return new BaseDeAcessorios(gltf, meta);
}

/** Baixa o `.glb` e o arquivo de notas e faz a base. Lança se um deles falhar: quem chama decide o que fazer sem os acessórios. */
export async function carregarAcessorios(urlDoGlb: string, urlDaMeta: string, opcoes: { readonly gerenciador?: LoadingManager } = {}): Promise<BaseDeAcessorios> {
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
  return carregarAcessoriosDeBytes(glb, { meta, gerenciador: opcoes.gerenciador });
}
