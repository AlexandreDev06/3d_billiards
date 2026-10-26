import { Color, MeshPhysicalMaterial, type Material } from 'three';

/** O nível de detalhe do desenho: a malha alta serve ao alto e ao médio, a baixa ao baixo. */
export type NivelDeDetalhe = 'alto' | 'medio' | 'baixo';

/**
 * O látex: liso, brilhante (verniz e reflexo) e com um pouco de luz própria na cor, para ela não morrer sob uma lâmpada quente. `base`
 * é a cor de fábrica do material no arquivo (branco no látex, cinza no fundo do punho): a cor final é a da equipe vezes ela. As
 * variantes de nível de qualidade do jogo partem deste `MeshPhysicalMaterial`.
 */
export function materialDeLatex(cor: number, base: Color, nome: string, origem?: Material): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    emissiveIntensity: 0.28,
    side: origem?.side,
  });
  m.name = nome;
  m.userData.corBase = base.clone();
  tingirMaterial(m, cor);
  return m;
}

/** O que `tingirMaterial` precisa de um material: o físico do látex e as variantes que o jogo faz dele (cópias de `userData` voltam do JSON com a cor como número). */
export interface MaterialTingivel {
  readonly color: Color;
  readonly emissive: Color;
  readonly userData: Record<string, unknown>;
}

/** A cor da equipe vezes a cor de fábrica do material; o brilho próprio leva a mesma cor. */
export function tingirMaterial(m: MaterialTingivel, cor: number): void {
  const guardada = m.userData.corBase;
  const base = guardada instanceof Color ? guardada : new Color(typeof guardada === 'number' ? guardada : 0xffffff);
  m.color.setHex(cor).multiply(base);
  m.emissive.copy(m.color);
}
