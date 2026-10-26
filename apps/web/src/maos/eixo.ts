/** Um ponto ou vetor no mundo (m). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * O eixo do taco como `posicionarTaco` o desenha: a ponta e a direção unitária da ponta para a bola (o taco corre para trás dela,
 * `ponta - direcao · q`). Reaproveitável: as contas das mãos escrevem em `saida` e não alocam por quadro.
 */
export interface EixoDoTaco {
  px: number;
  py: number;
  pz: number;
  dx: number;
  dy: number;
  dz: number;
}

export function eixoVazio(): EixoDoTaco {
  return { px: 0, py: 0, pz: 0, dx: 1, dy: 0, dz: 0 };
}

/**
 * A mesma conta de `posicionarTaco` (`cena/taco.ts`), sem three: onde fica a ponta e para onde aponta o taco.
 *
 * @param angulo direção da tacada no plano XZ (0 = +X)
 * @param elevacao inclinação do taco (0 = paralelo ao pano)
 * @param recuo distância da ponta à superfície do bolão
 * @param lateral onde a ponta toca o bolão (fração do raio, de lado)
 * @param vertical idem, para cima
 */
export function eixoDoTaco(
  cx: number,
  cy: number,
  cz: number,
  raioBola: number,
  angulo: number,
  elevacao: number,
  recuo: number,
  lateral: number,
  vertical: number,
  saida: EixoDoTaco = eixoVazio(),
): EixoDoTaco {
  const ca = Math.cos(angulo);
  const sa = Math.sin(angulo);
  const ce = Math.cos(elevacao);
  saida.dx = ca * ce;
  saida.dy = -Math.sin(elevacao);
  saida.dz = sa * ce;
  const profundidade = raioBola * Math.sqrt(Math.max(1 - lateral * lateral - vertical * vertical, 0));
  const atras = profundidade + recuo;
  saida.px = cx - sa * lateral * raioBola - saida.dx * atras;
  saida.py = cy + vertical * raioBola - saida.dy * atras;
  saida.pz = cz + ca * lateral * raioBola - saida.dz * atras;
  return saida;
}

/** O ponto do taco a `q` m da ponta, para trás. */
export function pontoDoTaco(eixo: EixoDoTaco, q: number, saida: Vec3): Vec3 {
  saida.x = eixo.px - eixo.dx * q;
  saida.y = eixo.py - eixo.dy * q;
  saida.z = eixo.pz - eixo.dz * q;
  return saida;
}

/** O ponto onde a ponta toca o bolão (a ponta com o recuo desfeito). */
export function pontoDeContato(eixo: EixoDoTaco, recuo: number, saida: Vec3): Vec3 {
  saida.x = eixo.px + eixo.dx * recuo;
  saida.y = eixo.py + eixo.dy * recuo;
  saida.z = eixo.pz + eixo.dz * recuo;
  return saida;
}
