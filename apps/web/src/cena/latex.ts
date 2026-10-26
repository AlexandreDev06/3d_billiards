import { MeshPhysicalMaterial } from 'three';

/** A borracha lisa do balão: cor da equipe, brilho de látex (verniz e reflexo) e um pouco de luz própria para a cor não morrer sob a lâmpada quente. */
export function materialDeLatex(cor: number): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: cor,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    emissive: cor,
    emissiveIntensity: 0.28,
  });
  m.name = 'latex';
  return m;
}
