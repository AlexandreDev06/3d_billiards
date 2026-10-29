import { SKIN_PADRAO, ehSemente, ehSkinDeTaco, type SkinTaco } from '@sinuca/protocolo';

/** Os lugares da sala como o taco os lê: só a skin de cada um. */
export interface LugaresComSkin {
  readonly lugares: readonly { readonly skin?: SkinTaco; readonly semente?: number | null; readonly bolas?: number | null }[];
}

/** A skin do taco de quem está no lugar, como a sala mandou; sem sala, sem lugar ou sem skin (ou uma que o catálogo não tem): a clássica. */
export function skinDoLugar(estado: LugaresComSkin | null, lugar: number | null): SkinTaco {
  if (estado === null || lugar === null) return SKIN_PADRAO;
  const skin = estado.lugares[lugar]?.skin;
  return ehSkinDeTaco(skin) ? skin : SKIN_PADRAO;
}

/** A semente do taco de quem está no lugar (0 a 999), como a sala mandou; sem sala, sem lugar, vago ou sem carteira: `null` (o desenho de fábrica). */
export function sementeDoLugar(estado: LugaresComSkin | null, lugar: number | null): number | null {
  if (estado === null || lugar === null) return null;
  const semente = estado.lugares[lugar]?.semente;
  return ehSemente(semente) ? semente : null;
}

/** O contador de bolas do taco de quem está no lugar (inteiro de 0 para cima); sem número válido: `null` (o taco não mostra a placa). */
export function bolasDoLugar(estado: LugaresComSkin | null, lugar: number | null): number | null {
  if (estado === null || lugar === null) return null;
  const bolas = estado.lugares[lugar]?.bolas;
  return typeof bolas === 'number' && Number.isInteger(bolas) && bolas >= 0 ? bolas : null;
}

/** De quem é o taco que se vê: o meu na minha vez (ou enquanto minha tacada toca), nas outras o de quem tem a vez. */
export function lugarDoTaco(entrada: { readonly meuTaco: boolean; readonly meuLugar: number | null; readonly lugarDaVez: number | null }): number | null {
  return entrada.meuTaco ? entrada.meuLugar : entrada.lugarDaVez;
}
