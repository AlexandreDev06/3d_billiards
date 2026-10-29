import { Color, MeshPhysicalMaterial, type Material } from 'three';
import type { LatexProposto } from '../meta-do-rosto';

/** O nível de detalhe do desenho: a malha alta serve ao alto e ao médio, a baixa ao baixo. */
export type NivelDeDetalhe = 'alto' | 'medio' | 'baixo';

/** Quanto a cor do brilho de veludo (`sheenColor`) é clareada em direção ao branco: a cor da equipe a 40%. */
const CLAREAR_O_VELUDO = 0.4;
const BRANCO = new Color(1, 1, 1);

/** O que o látex ganha do artista (`latex_proposta` do meta v2), e se a malha tem a cor de vértice (`COLOR_0`) que o artista pintou. */
export interface LatexDoArtista {
  readonly numeros: LatexProposto;
  readonly temCorDeVertice: boolean;
}

/**
 * O látex: liso, brilhante (verniz e reflexo) e com um pouco de luz própria na cor, para ela não morrer sob uma lâmpada quente. `base`
 * é a cor de fábrica do material no arquivo (branco no látex, cinza no fundo do punho): a cor final é a da equipe vezes ela. As
 * variantes de nível de qualidade do jogo partem deste `MeshPhysicalMaterial`. Com `doArtista`, os números que o artista propôs
 * (rugosidade, verniz, veludo, reflexo, cor de vértice) trocam os do padrão; o que ele não diz fica como o padrão.
 *
 * O material leva `userData.latex = true`: é como o jogo o reconhece ao fazer as variantes de qualidade (o reflexo baixo do látex é
 * de propósito e não deve virar metal no `MeshStandardMaterial`).
 */
export function materialDeLatex(cor: number, base: Color, nome: string, origem?: Material, doArtista?: LatexDoArtista): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    emissiveIntensity: 0.28,
    side: origem?.side,
  });
  m.name = nome;
  m.userData.latex = true;
  m.userData.corBase = base.clone();
  if (doArtista !== undefined) aplicarLatexDoArtista(m, doArtista);
  tingirMaterial(m, cor);
  return m;
}

function aplicarLatexDoArtista(m: MeshPhysicalMaterial, { numeros: n, temCorDeVertice }: LatexDoArtista): void {
  if (n.roughness !== undefined) m.roughness = n.roughness;
  if (n.metalness !== undefined) m.metalness = n.metalness;
  if (n.clearcoat !== undefined) m.clearcoat = n.clearcoat;
  if (n.clearcoatRoughness !== undefined) m.clearcoatRoughness = n.clearcoatRoughness;
  if (n.sheen !== undefined) m.sheen = n.sheen;
  if (n.sheenRoughness !== undefined) m.sheenRoughness = n.sheenRoughness;
  if (n.specularIntensity !== undefined) m.specularIntensity = n.specularIntensity;
  if (n.ior !== undefined) m.ior = n.ior;
  // sem o atributo na malha, o shader leria preto: a cor de vértice só liga onde o artista pintou
  if (n.vertexColors === true && temCorDeVertice) m.vertexColors = true;
  if (m.sheen > 0) m.userData.veludoDaEquipe = true;
}

/** O que `tingirMaterial` precisa de um material: o físico do látex e as variantes que o jogo faz dele (cópias de `userData` voltam do JSON com a cor como número). */
export interface MaterialTingivel {
  readonly color: Color;
  readonly emissive: Color;
  /** Só o `MeshPhysicalMaterial` tem; as variantes do jogo não. */
  readonly sheenColor?: Color;
  readonly userData: Record<string, unknown>;
}

/** A cor da equipe vezes a cor de fábrica do material; o brilho próprio leva a mesma cor. */
export function tingirMaterial(m: MaterialTingivel, cor: number): void {
  const guardada = m.userData.corBase;
  const base = guardada instanceof Color ? guardada : new Color(typeof guardada === 'number' ? guardada : 0xffffff);
  m.color.setHex(cor).multiply(base);
  m.emissive.copy(m.color);
  if (m.sheenColor !== undefined && m.userData.veludoDaEquipe === true) m.sheenColor.copy(m.color).lerp(BRANCO, CLAREAR_O_VELUDO);
}
