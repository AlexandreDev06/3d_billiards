/** Um ponto do perfil do balão: distância ao eixo e altura, a partir do centro (m). */
export interface PontoDoPerfil {
  readonly r: number;
  readonly y: number;
}

/** Onde o balão é mais largo, como fração da altura a partir do nó: um pouco acima do meio, como o balão de festa. */
const FRACAO_DO_BOJO = 0.58;
/** Quão fina é a parte de baixo (o expoente da curva: menor que 2 afina em cone até o nó) e quão cheia a de cima (maior que 2 arredonda o topo). */
const EXPOENTE_DE_BAIXO = 1.6;
const EXPOENTE_DE_CIMA = 2.4;

/** O raio do balão à fração `t` da altura (0 no nó, 1 no topo): zero nas pontas, `raio` no bojo, topo redondo e pé afinando para o nó. */
export function raioDoBalaoEm(t: number, raio: number): number {
  const k = Math.min(Math.max(t, 0), 1);
  if (k <= FRACAO_DO_BOJO) return raio * (1 - ((FRACAO_DO_BOJO - k) / FRACAO_DO_BOJO) ** EXPOENTE_DE_BAIXO) ** (1 / EXPOENTE_DE_BAIXO);
  return raio * (1 - ((k - FRACAO_DO_BOJO) / (1 - FRACAO_DO_BOJO)) ** EXPOENTE_DE_CIMA) ** (1 / EXPOENTE_DE_CIMA);
}

/**
 * O perfil do balão de baixo (o nó) para cima: uma gota com o bojo mais alto que o meio e a ponta fina no nó. `altura` é a metade
 * da altura total, `raio` o maior raio. Dá `passos + 1` pontos, de `y = -altura` a `y = +altura`, para girar em torno do eixo.
 */
export function perfilDoBalao(altura: number, raio: number, passos: number): PontoDoPerfil[] {
  const n = Math.max(Math.round(passos), 4);
  const pontos: PontoDoPerfil[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pontos.push({ r: raioDoBalaoEm(t, raio), y: -altura + 2 * altura * t });
  }
  return pontos;
}

/** Onde, como fração da altura, o rosto começa e termina (o miolo do bojo, onde o balão é largo). */
export const FAIXA_DO_ROSTO = { de: 0.4, ate: 0.75 } as const;
