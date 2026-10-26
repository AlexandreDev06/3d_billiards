import { armazenamentoLocal, gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';
import { NIVEIS, type NivelDeQualidade, type PreferenciaDeQualidade } from './perfis';

const CHAVE = 'sinuca.qualidade';

/** O que fica lembrado neste computador (a GPU é do aparelho, não do jogador). */
export interface QualidadeSalva {
  readonly preferencia: PreferenciaDeQualidade;
  /** Até onde o modo automático já teve de descer por FPS baixo; a próxima visita começa daí. */
  readonly rebaixada: NivelDeQualidade | null;
}

export const QUALIDADE_PADRAO: QualidadeSalva = { preferencia: 'auto', rebaixada: null };

const ehNivel = (v: unknown): v is NivelDeQualidade => typeof v === 'string' && (NIVEIS as readonly string[]).includes(v);

/** Lê a escolha lembrada; qualquer coisa fora do formato volta ao padrão (automático). */
export function lerQualidade(armazenamento: ArmazenamentoMinimo | null = armazenamentoLocal()): QualidadeSalva {
  const bruto = lerJson(CHAVE, armazenamento) as { preferencia?: unknown; rebaixada?: unknown } | null;
  if (bruto === null || typeof bruto !== 'object') return QUALIDADE_PADRAO;
  const preferencia = bruto.preferencia === 'auto' || ehNivel(bruto.preferencia) ? bruto.preferencia : 'auto';
  return { preferencia, rebaixada: ehNivel(bruto.rebaixada) ? bruto.rebaixada : null };
}

export function gravarQualidade(salva: QualidadeSalva, armazenamento: ArmazenamentoMinimo | null = armazenamentoLocal()): boolean {
  return gravarJson(CHAVE, salva, armazenamento);
}

/** `?qualidade=baixa|media|alta|auto` vale só nesta visita (não grava): para testar e para quem precisa de um link. */
export function qualidadeDaUrl(busca: string): PreferenciaDeQualidade | null {
  const pedida = new URLSearchParams(busca).get('qualidade');
  return pedida === 'auto' || ehNivel(pedida) ? pedida : null;
}
