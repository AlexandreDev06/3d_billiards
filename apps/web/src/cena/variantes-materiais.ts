import { Material, Mesh, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D } from 'three';
import { panoLeveDe } from './pano-leve';

export interface EscolhaDeMateriais {
  /**
   * `fisicos`: os originais (`MeshPhysicalMaterial`). `standard`: a versão `MeshStandardMaterial`. `leves`: standard
   * nas malhas de detalhe (bolas, taco) e `MeshLambertMaterial`, só luz difusa, no resto.
   */
  readonly materiais: 'fisicos' | 'standard' | 'leves';
  /** Há reflexo de sala: o alumínio continua metal; sem ele vira um cinza claro fosco (metal sem reflexo fica preto). */
  readonly ambiente: boolean;
}

const METAL = 0.9;
/** Quanto de metal dá ao Standard o reflexo baixo e tingido que o físico tinha (ver `paraStandard`). */
const REFLEXO_PARCIAL = 0.88;

function ehMetal(m: Material): m is MeshStandardMaterial {
  return m instanceof MeshStandardMaterial && m.metalness >= METAL;
}

/** Cópia que um `MeshStandardMaterial` entende: cor, mapas, rugosidade; perde verniz e sheen. */
function paraStandard(fisico: MeshPhysicalMaterial): MeshStandardMaterial {
  const simples = new MeshStandardMaterial();
  simples.copy(fisico);
  simples.name = `${fisico.name}~standard`;
  // O Standard só tem o reflexo fixo, branco e de 4%: um preto que o físico fez refletir pouco e azulado (a luz quente da sala o
  // tingia de marrom) voltaria marrom. Um pouco de metal dá o reflexo menor e no tom da própria cor.
  if (fisico.specularIntensity < 1 && fisico.metalness < METAL) simples.metalness = Math.max(fisico.metalness, REFLEXO_PARCIAL);
  return simples;
}

function metalSemReflexo(metal: MeshStandardMaterial): MeshStandardMaterial {
  const fosco = metal.clone();
  fosco.metalness = 0.3;
  fosco.roughness = Math.max(metal.roughness, 0.4);
  fosco.envMap = null;
  fosco.name = `${metal.name}~fosco`;
  return fosco;
}

/**
 * Só a luz difusa: cor, textura de cor e lado. O brilho e o relevo ficam de fora (é o que pesa pixel a pixel).
 * O pano (`userData.panoLeve`) perde também a textura: vira cor lisa no tom que a textura dava (ver `PanoLeve`).
 */
function paraLambert(origem: MeshStandardMaterial): MeshLambertMaterial {
  const pano = panoLeveDe(origem.userData);
  const leve = new MeshLambertMaterial({ color: pano ? origem.color.clone().multiplyScalar(pano.fator) : origem.color, map: pano ? null : origem.map, side: origem.side });
  if (pano) leve.emissive.setRGB(...pano.emissiva);
  else if (origem.emissive.getHex() !== 0) {
    // Peça que acende (as linhas neon do taco): o brilho próprio não depende da luz, então o nível leve também o tem.
    leve.emissive.copy(origem.emissive);
    leve.emissiveIntensity = origem.emissiveIntensity;
    leve.emissiveMap = origem.emissiveMap;
  }
  leve.name = `${origem.name}~lambert`;
  return leve;
}

/** O gancho de compilação do original (o que muda o código do shader, como o sumiço perto da câmera) vale também para a cópia. */
function herdarCompilacao(original: Material, variante: Material): void {
  if (!Object.prototype.hasOwnProperty.call(original, 'onBeforeCompile')) return;
  variante.onBeforeCompile = original.onBeforeCompile;
  variante.customProgramCacheKey = original.customProgramCacheKey;
}

/**
 * Troca, malha a malha, o material que a árvore usa pela variante do nível de qualidade, guardando os
 * originais para voltar. As variantes são feitas uma vez e reaproveitadas; as texturas são as mesmas dos
 * originais. `dispose` solta as variantes (as texturas continuam de quem as criou).
 *
 * @param detalhes raízes cujas malhas são pequenas e brilhantes (bolas, taco): nunca viram Lambert
 */
export class VariantesDeMateriais {
  private readonly originais = new WeakMap<Mesh, Material | Material[]>();
  private readonly deDetalhe = new WeakSet<Mesh>();
  private readonly standard = new Map<Material, Material>();
  private readonly fosco = new Map<Material, Material>();
  private readonly lambert = new Map<Material, Material>();
  private readonly malhas: Mesh[] = [];

  constructor(
    private readonly raizes: readonly Object3D[],
    private readonly detalhes: readonly Object3D[] = [],
  ) {}

  aplicar(escolha: EscolhaDeMateriais): void {
    this.coletar();
    for (const malha of this.malhas) {
      const original = this.originais.get(malha)!;
      const detalhe = this.deDetalhe.has(malha);
      malha.material = Array.isArray(original) ? original.map((m) => this.escolher(m, escolha, detalhe)) : this.escolher(original, escolha, detalhe);
    }
  }

  /** Quantas variantes existem agora (para os testes e o diagnóstico). */
  get quantidadeDeVariantes(): number {
    return this.standard.size + this.fosco.size + this.lambert.size;
  }

  dispose(): void {
    for (const cache of [this.standard, this.fosco, this.lambert]) {
      for (const variante of cache.values()) variante.dispose();
      cache.clear();
    }
  }

  /**
   * Os materiais de uma raiz mudaram (a skin do taco trocou): o que as malhas têm agora são os novos originais. Solta as variantes
   * dos originais que saíram (as texturas continuam de quem as criou) e a próxima `aplicar` faz as dos novos.
   */
  renovar(raiz: Object3D): void {
    raiz.traverse((objeto) => {
      if (!(objeto instanceof Mesh)) return;
      const antigo = this.originais.get(objeto);
      if (antigo !== undefined && antigo !== objeto.material) this.soltar(antigo);
      this.originais.set(objeto, objeto.material);
      if (!this.malhas.includes(objeto)) this.malhas.push(objeto);
    });
  }

  private soltar(original: Material | Material[]): void {
    for (const material of Array.isArray(original) ? original : [original]) {
      for (const cache of [this.standard, this.fosco, this.lambert]) {
        const variante = cache.get(material);
        if (variante === undefined) continue;
        variante.dispose();
        cache.delete(material);
      }
    }
  }

  private coletar(): void {
    for (const raiz of this.raizes) {
      raiz.traverse((objeto) => {
        if (!(objeto instanceof Mesh) || this.originais.has(objeto)) return;
        this.originais.set(objeto, objeto.material);
        this.malhas.push(objeto);
      });
    }
    for (const raiz of this.detalhes) {
      raiz.traverse((objeto) => {
        if (objeto instanceof Mesh) this.deDetalhe.add(objeto);
      });
    }
  }

  private escolher(original: Material, { materiais, ambiente }: EscolhaDeMateriais, detalhe: boolean): Material {
    if (ehMetal(original) && !ambiente) return this.dar(this.fosco, original, () => metalSemReflexo(original));
    if (original instanceof MeshStandardMaterial) {
      if (materiais === 'leves' && !detalhe && !(ehMetal(original) && ambiente)) return this.dar(this.lambert, original, () => paraLambert(original));
      if (original instanceof MeshPhysicalMaterial && materiais !== 'fisicos') return this.dar(this.standard, original, () => paraStandard(original));
    }
    return original;
  }

  private dar(cache: Map<Material, Material>, original: Material, criar: () => Material): Material {
    let variante = cache.get(original);
    if (!variante) {
      variante = criar();
      herdarCompilacao(original, variante);
      cache.set(original, variante);
    }
    return variante;
  }
}
