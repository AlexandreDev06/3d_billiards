/**
 * Onde a câmera do jogo pode estar dentro do boteco (m, a origem no centro do pano): até `xMax` e `zMax` do centro e, para cima,
 * até `yMax`. É a zona livre do artista (nenhum adereço abaixo de 2,1 m entra a menos de 1,6 m da moldura) com uma folga, e abaixo das
 * vigas: a câmera nunca atravessa parede, móvel nem teto.
 */
export interface LimitesDaSala {
  readonly xMax: number;
  readonly zMax: number;
  readonly yMax: number;
}

interface Ponto {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const FOLGA_NUMERICA = 1e-9;

/** O quanto de `a → b` (0 a 1) a câmera pode andar partindo de `a`, que está dentro, sem sair da sala. Sem alocar. */
export function fracaoDentroDaSala(a: Ponto, b: Ponto, limites: LimitesDaSala): number {
  let fracao = 1;
  const limitar = (de: number, ate: number, maximo: number): void => {
    // `de` já dentro: só importa para onde o eixo vai; fora (a âncora encostada), a câmera não anda por este eixo.
    if (ate > maximo + FOLGA_NUMERICA) fracao = Math.min(fracao, Math.max((maximo - de) / (ate - de), 0));
    else if (ate < -maximo - FOLGA_NUMERICA) fracao = Math.min(fracao, Math.max((-maximo - de) / (ate - de), 0));
  };
  limitar(a.x, b.x, limites.xMax);
  limitar(a.z, b.z, limites.zMax);
  if (b.y > limites.yMax + FOLGA_NUMERICA) fracao = Math.min(fracao, Math.max((limites.yMax - a.y) / (b.y - a.y), 0));
  return fracao;
}

/**
 * Maior distância do centro, na direção dada pelo azimute e pela elevação (rad), que ainda cabe na sala: o raio da órbita não passa
 * disto. A direção é a da câmera vista do centro (`x = cos(el)·cos(az)`, `y = sen(el)`, `z = cos(el)·sen(az)`).
 */
export function raioMaximoNaDirecao(azimute: number, elevacao: number, limites: LimitesDaSala): number {
  const x = Math.abs(Math.cos(elevacao) * Math.cos(azimute));
  const z = Math.abs(Math.cos(elevacao) * Math.sin(azimute));
  const y = Math.max(Math.sin(elevacao), 0);
  let raio = Number.POSITIVE_INFINITY;
  if (x > 1e-9) raio = Math.min(raio, limites.xMax / x);
  if (z > 1e-9) raio = Math.min(raio, limites.zMax / z);
  if (y > 1e-9) raio = Math.min(raio, limites.yMax / y);
  return raio;
}
