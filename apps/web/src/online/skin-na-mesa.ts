import { SKIN_PADRAO, ehSkinDeTaco, type SkinTaco } from '@sinuca/protocolo';

/** Os lugares da sala como o taco os lê: só a skin de cada um. */
export interface LugaresComSkin {
  readonly lugares: readonly { readonly skin?: SkinTaco }[];
}

/** A skin do taco de quem está no lugar, como a sala mandou; sem sala, sem lugar ou sem skin (ou uma que o catálogo não tem): a clássica. */
export function skinDoLugar(estado: LugaresComSkin | null, lugar: number | null): SkinTaco {
  if (estado === null || lugar === null) return SKIN_PADRAO;
  const skin = estado.lugares[lugar]?.skin;
  return ehSkinDeTaco(skin) ? skin : SKIN_PADRAO;
}

/** De quem é o taco que se vê: o meu na minha vez (ou enquanto minha tacada toca), nas outras o de quem tem a vez. */
export function lugarDoTaco(entrada: { readonly meuTaco: boolean; readonly meuLugar: number | null; readonly lugarDaVez: number | null }): number | null {
  return entrada.meuTaco ? entrada.meuLugar : entrada.lugarDaVez;
}
