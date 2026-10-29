import { APARENCIA_PADRAO, IDS_DAS_CORES_DE_OLHO, IDS_DOS_BIGODES, IDS_DOS_CHAPEUS, IDS_DOS_ESTILOS_DE_OLHO, type AparenciaDoBalao } from '@sinuca/protocolo';

/** Os lugares da sala como o balão os lê: só a aparência de cada um. */
export interface LugaresComBalao {
  readonly lugares: readonly { readonly lugar: number; readonly equipe: number; readonly nome: string | null; readonly aparencia?: AparenciaDoBalao | null }[];
}

/** O id do jogador online é `lugar-N`: de que lugar ele é (`null` para qualquer outro id, como o do mesmo PC). */
export function lugarDoJogador(id: string): number | null {
  const m = /^lugar-(\d{1,2})$/.exec(id);
  return m === null ? null : Number(m[1]);
}

/** A aparência tem a forma do protocolo, com cada id do seu tipo? (A sala já valida; é a rede de segurança de um cliente que lê o que chega.) */
function ehAparencia(a: unknown): a is AparenciaDoBalao {
  if (typeof a !== 'object' || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    (o.chapeu === null || (typeof o.chapeu === 'string' && (IDS_DOS_CHAPEUS as readonly string[]).includes(o.chapeu))) &&
    (o.bigode === null || (typeof o.bigode === 'string' && (IDS_DOS_BIGODES as readonly string[]).includes(o.bigode))) &&
    typeof o.olhos === 'string' &&
    (IDS_DOS_ESTILOS_DE_OLHO as readonly string[]).includes(o.olhos) &&
    typeof o.corDosOlhos === 'string' &&
    (IDS_DAS_CORES_DE_OLHO as readonly string[]).includes(o.corDosOlhos)
  );
}

/**
 * O balão de quem está no lugar, como a sala mandou (`LugarSala.aparencia`). Sem sala, sem lugar, lugar vago, sala que não manda o campo
 * (cliente da versão 9) ou aparência estragada: o balão padrão (o mesmo objeto, `APARENCIA_PADRAO`).
 */
export function aparenciaDoLugar(estado: LugaresComBalao | null, lugar: number | null): AparenciaDoBalao {
  if (estado === null || lugar === null) return APARENCIA_PADRAO;
  const a = estado.lugares[lugar]?.aparencia;
  return ehAparencia(a) ? a : APARENCIA_PADRAO;
}

/** O balão da equipe no fim da partida: o do primeiro lugar ocupado dela (equipe sem ninguém: o padrão). */
export function aparenciaDaEquipe(estado: LugaresComBalao | null, equipe: number): AparenciaDoBalao {
  const lugar = estado?.lugares.find((l) => l.equipe === equipe && l.nome !== null);
  return lugar === undefined ? APARENCIA_PADRAO : aparenciaDoLugar(estado, lugar.lugar);
}

/** Alguém na sala usa chapéu? Só então o `chapeus.glb` precisa carregar. */
export function precisaDeChapeus(estado: LugaresComBalao | null): boolean {
  return estado?.lugares.some((l) => l.nome !== null && ehAparencia(l.aparencia) && l.aparencia.chapeu !== null) ?? false;
}
