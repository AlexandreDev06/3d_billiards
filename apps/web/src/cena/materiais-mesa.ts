import { Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type Texture } from 'three';
import type { ConfigMesa } from '../config';
import { PANO_LEVE } from './pano-leve';
import { criarTexturaMadeiraCorpo, criarTexturaMoldura, criarTexturasDoPano } from './texturas-mesa';

export interface MateriaisMesa {
  readonly pano: MeshPhysicalMaterial;
  readonly tabela: MeshPhysicalMaterial;
  readonly madeira: MeshPhysicalMaterial;
  /** Saia e pés. */
  readonly madeiraCorpo: MeshPhysicalMaterial;
  /** Pés na vertical: o veio gira 90°. */
  readonly madeiraPe: MeshPhysicalMaterial;
  readonly aluminio: MeshStandardMaterial;
  /** Forro escuro da parede do entalhe da caçapa. */
  readonly couro: MeshStandardMaterial;
  readonly perola: MeshPhysicalMaterial;
  /** Interior escuro da caçapa; as cores vêm dos vértices (mais escuro no fundo). */
  readonly tubo: MeshBasicMaterial;
  readonly fundo: MeshBasicMaterial;
  readonly marca: MeshBasicMaterial;
  readonly piso: MeshStandardMaterial;
  readonly sapata: MeshStandardMaterial;
}

function verniz(mapa: Texture, rugosidade: number, verniz_: ConfigMesa['madeira']): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map: mapa,
    roughness: rugosidade,
    clearcoat: verniz_.verniz,
    clearcoatRoughness: verniz_.rugosidadeDoVerniz,
    specularIntensity: verniz_.especular,
  });
}

/**
 * Materiais da mesa e as texturas procedurais deles (canvas, sem arquivo). Quem os usa os
 * descarta com `descartar()`.
 *
 * @param semiX meio-comprimento da mesa visível, moldura incluída
 * @param semiZ meia-largura da mesa visível, moldura incluída
 * @param borda largura da moldura
 * @param escalaTextura multiplica o lado das texturas (nível de qualidade)
 */
export function criarMateriaisMesa(cfg: ConfigMesa, semiX: number, semiZ: number, borda: number, anisotropia: number, escalaTextura = 1): MateriaisMesa {
  const { cor, normal } = criarTexturasDoPano(anisotropia, escalaTextura);
  const pano = (cor_: number): MeshPhysicalMaterial => {
    const material = new MeshPhysicalMaterial({
      color: cor_,
      map: cor,
      normalMap: normal,
      normalScale: new Vector2(0.22, 0.22),
      roughness: 0.93,
      sheen: 0.8,
      sheenRoughness: 0.5,
      sheenColor: new Color(cor_).lerp(new Color(0xffffff), 0.2),
    });
    // Os níveis de materiais leves desenham o pano liso (a textura dele é só um ruído de tom): ver `PanoLeve`.
    material.userData.panoLeve = PANO_LEVE;
    return material;
  };

  const madeira = verniz(criarTexturaMoldura(semiX, semiZ, borda, anisotropia, escalaTextura), cfg.madeira.rugosidade, cfg.madeira);

  const corpo = criarTexturaMadeiraCorpo(anisotropia, escalaTextura);
  const veioVertical = corpo.clone();
  veioVertical.center.set(0.5, 0.5);
  veioVertical.rotation = Math.PI / 2;
  veioVertical.needsUpdate = true;

  return {
    pano: pano(cfg.cores.pano),
    tabela: pano(cfg.cores.tabela),
    madeira,
    madeiraCorpo: verniz(corpo, cfg.madeira.rugosidade, cfg.madeira),
    madeiraPe: verniz(veioVertical, cfg.madeira.rugosidade, cfg.madeira),
    aluminio: new MeshStandardMaterial({ color: cfg.cores.aluminio, metalness: 1, roughness: 0.26, side: DoubleSide }),
    couro: new MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.8, side: DoubleSide }),
    perola: new MeshPhysicalMaterial({ color: cfg.cores.perola, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    tubo: new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
    fundo: new MeshBasicMaterial({ color: 0x000000 }),
    marca: new MeshBasicMaterial({ color: cfg.cores.marca, transparent: true, opacity: 0.55, depthWrite: false }),
    piso: new MeshStandardMaterial({ color: cfg.cores.piso, roughness: 0.85 }),
    sapata: new MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 }),
  };
}
