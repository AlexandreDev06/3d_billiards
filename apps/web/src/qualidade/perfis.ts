import { CONFIG_WEB, type NivelDeQualidade, type PerfilDeQualidade } from '../config';
import type { NivelDeDetalhe } from '@sinuca/personagens/three';

export type { NivelDeQualidade, PerfilDeQualidade };

/** O que o jogador escolhe: um nível fixo ou o automático (decide pelo renderizador e desce se o FPS cair). */
export type PreferenciaDeQualidade = 'auto' | NivelDeQualidade;

/** Do mais alto ao mais baixo. */
export const NIVEIS: readonly NivelDeQualidade[] = ['alta', 'media', 'baixa'];

/** Menor escala de desenho: abaixo disso a mesa vira mancha. */
const RAZAO_MINIMA = 0.35;

export function perfilDoNivel(nivel: NivelDeQualidade): PerfilDeQualidade {
  return CONFIG_WEB.qualidade.perfis[nivel];
}

/** Quantos lados cada peça do taco tem no nível: ~70% dos da esfera das bolas, par, entre 12 e 36 (34, 22 e 14 nos três níveis). */
export function segmentosDoTaco(perfil: PerfilDeQualidade): number {
  return Math.min(Math.max(2 * Math.round((perfil.segmentosEsfera[0] * 0.7) / 2), 12), 36);
}

/** Quantos lados têm as mãos e os balões no nível: ~60% dos do taco, no mínimo 8 (20, 13 e 8 nos três níveis). */
export function ladosDosPersonagens(perfil: PerfilDeQualidade): number {
  return Math.max(Math.round(segmentosDoTaco(perfil) * 0.6), 8);
}

/** O nível de detalhe das mãos de personagem: a malha alta do arquivo (~4,5 mil triângulos) nos níveis alta e média, a baixa (~0,8 mil) na baixa. */
export function detalheDasMaos(perfil: PerfilDeQualidade): NivelDeDetalhe {
  return perfil.nivel === 'alta' ? 'alto' : perfil.nivel === 'media' ? 'medio' : 'baixo';
}

/** Quantas partículas de pó o giz solta no nível (a reserva do `PoeiraDeGiz`): sem pó na baixa, onde cada pixel conta. */
export function particulasDoGiz(perfil: PerfilDeQualidade): number {
  return perfil.nivel === 'alta' ? 40 : perfil.nivel === 'media' ? 20 : 0;
}

/** O brilho do taco neon (uma casca aditiva, que pesa pixel a pixel) só nos níveis alto e médio. */
export function haloDoTacoNoNivel(perfil: PerfilDeQualidade): boolean {
  return perfil.nivel !== 'baixa';
}

/** O nível logo abaixo, ou `null` se já é o mais baixo. */
export function nivelAbaixo(nivel: NivelDeQualidade): NivelDeQualidade | null {
  return NIVEIS[NIVEIS.indexOf(nivel) + 1] ?? null;
}

/**
 * Escala de desenho do quadro: o pixelRatio do navegador, limitado pelo teto do nível e pelo orçamento de
 * pixels (`largura × altura × razão² ≤ orçamento`). Janela vazia: 1.
 */
export function razaoDePixels(perfil: PerfilDeQualidade, pixelRatioDoNavegador: number, largura: number, altura: number): number {
  const area = largura * altura;
  if (!(area > 0)) return 1;
  const doOrcamento = Math.sqrt(perfil.orcamentoDePixels / area);
  return Math.max(Math.min(pixelRatioDoNavegador, perfil.pixelRatioMax, doOrcamento), RAZAO_MINIMA);
}

const RENDERIZADOR_SOFTWARE = /swiftshader|llvmpipe|softpipe|swrast|basic render|software|mesa offscreen/i;

/** O nome do renderizador (WEBGL_debug_renderer_info) é de uma GPU simulada na CPU? */
export function ehSoftware(renderizador: string | null): boolean {
  return renderizador !== null && RENDERIZADOR_SOFTWARE.test(renderizador);
}

/**
 * Em que nível o jogo abre. Um nível escolhido vale como está; no automático: software começa na baixa e,
 * com GPU, na alta ou onde o jogo já teve de descer neste computador (`rebaixada`).
 */
export function nivelInicial(o: { preferencia: PreferenciaDeQualidade; software: boolean; rebaixada: NivelDeQualidade | null }): NivelDeQualidade {
  if (o.preferencia !== 'auto') return o.preferencia;
  if (o.software) return 'baixa';
  return o.rebaixada ?? 'alta';
}

/** Antialias e tamanho das texturas só mudam ao abrir a página: o nível de agora pede recarregar se diferir do de abertura nesses dois. */
export function pedeRecarregar(abertura: PerfilDeQualidade, atual: PerfilDeQualidade): boolean {
  return abertura.antialias !== atual.antialias || abertura.escalaTextura !== atual.escalaTextura;
}
