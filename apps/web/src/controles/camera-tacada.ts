import type { MedidasTaco } from '@sinuca/fisica';
import type { ConfigCamera } from '../config';

/** Onde está o taco e como a câmera de tacada está (zoom 1 = a distância e a altura da configuração). */
export interface EntradaDaCameraDeTacada {
  /** Centro do bolão (m). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Direção da mira da câmera no plano XZ (rad; 0 = +X). */
  readonly angulo: number;
  /** A elevação com que o taco é desenhado agora (rad): a que `ElevacaoDoTaco` dá. */
  readonly elevacaoDoTaco: number;
  /** Distância entre a ponta do taco e a superfície do bolão (m). */
  readonly recuo: number;
  readonly zoom: number;
}

/** A parte do desenho que a conta precisa: o raio do bolão e as medidas do taco. */
export interface GeometriaDaCameraDeTacada {
  readonly raioBolao: number;
  readonly taco: MedidasTaco;
}

/** A pose pedida à câmera de tacada, em m e rad (um objeto reaproveitável: nada aloca por quadro). */
export interface PoseDaCameraDeTacada {
  x: number;
  y: number;
  z: number;
  /** O ponto olhado, no pano. */
  olharX: number;
  olharY: number;
  olharZ: number;
  /** O ângulo da câmera sobre o pano, visto do centro do bolão (rad). */
  elevacao: number;
  /** A menor distância da câmera ao taco, descontada a grossura dele (m). */
  folga: number;
  /** A câmera subiu para o taco não passar na frente da bola (o taco está mais alto que o de repouso). */
  subiu: boolean;
}

export function poseVazia(): PoseDaCameraDeTacada {
  return { x: 0, y: 0, z: 0, olharX: 0, olharY: 0, olharZ: 0, elevacao: 0, folga: Infinity, subiu: false };
}

/**
 * A câmera de tacada, para o taco com a elevação que `ElevacaoDoTaco` deu.
 *
 * Com o taco baixo (bola longe da tabela) é a câmera de sempre: `distancia` atrás da bola, `altura` sobre o pano, as duas vezes o
 * zoom, olhando `olharAdiante` à frente. Com o taco alto (a bola colada na tabela: o taco sobe por cima da borracha e o cabo vem na
 * direção da câmera), ela sobe em arco em volta do bolão, no plano da mira, sem mudar a distância até ele: o ângulo dela sobre o pano
 * passa a ser o do taco mais `margemDoTaco`, até `elevacaoMaxima`. Visto dali, o taco inteiro fica abaixo da bola na tela (a linha
 * do taco nunca passa na frente da bola nem do que ela vai atingir) e o cabo passa a pelo menos `ρ · sen(margem)` da câmera, com ρ a
 * distância dela ao bolão.
 *
 * O ponto olhado acompanha: a bola fica na mesma altura da tela de antes (o mesmo ângulo entre a bola e o ponto olhado), então a
 * mesa não "afunda" quando a câmera sobe.
 *
 * `x`, `y`, `z` do resultado são a posição da câmera; os `olhar*`, o ponto olhado; sem alocar quando `saida` é passada.
 */
export function poseDaCameraDeTacada(
  entrada: EntradaDaCameraDeTacada,
  cfg: ConfigCamera['tacada'],
  geometria: GeometriaDaCameraDeTacada,
  saida: PoseDaCameraDeTacada = poseVazia(),
): PoseDaCameraDeTacada {
  const { distancia, altura, olharAdiante, margemDoTaco, elevacaoMaxima } = cfg;
  const zoom = entrada.zoom;
  const cos = Math.cos(entrada.angulo);
  const sen = Math.sin(entrada.angulo);
  const d0 = distancia * zoom;
  const h0 = altura * zoom;
  const dy0 = h0 - entrada.y;
  const rho = Math.hypot(d0, dy0);
  const fi0 = Math.atan2(dy0, d0);
  const fi = Math.max(fi0, Math.min(entrada.elevacaoDoTaco + margemDoTaco, elevacaoMaxima));

  let recuoHorizontal = d0;
  let altura1 = h0;
  let adiante = olharAdiante;
  saida.subiu = fi > fi0;
  if (saida.subiu) {
    recuoHorizontal = rho * Math.cos(fi);
    altura1 = entrada.y + rho * Math.sin(fi);
    // O mesmo ângulo entre a bola e o ponto olhado que a câmera de repouso tem (a bola não escorrega na tela).
    const olharDeRepouso = Math.atan2(h0, d0 + olharAdiante);
    const olhar = fi - (fi0 - olharDeRepouso);
    adiante = olhar > 1e-3 ? Math.max(altura1 / Math.tan(olhar) - recuoHorizontal, 0) : olharAdiante;
  }
  saida.x = entrada.x - cos * recuoHorizontal;
  saida.y = altura1;
  saida.z = entrada.z - sen * recuoHorizontal;
  saida.olharX = entrada.x + cos * adiante;
  saida.olharY = 0;
  saida.olharZ = entrada.z + sen * adiante;
  saida.elevacao = fi;
  saida.folga = distanciaAoTaco(saida, entrada, geometria, cos, sen);
  return saida;
}

/**
 * A menor distância da câmera ao taco (eixo da ponta ao cabo, menos o raio dele ali). O taco parte do bolão para trás e para cima,
 * ponta a `raioBolao + recuo` do centro.
 */
function distanciaAoTaco(
  camera: { readonly x: number; readonly y: number; readonly z: number },
  entrada: EntradaDaCameraDeTacada,
  { raioBolao, taco }: GeometriaDaCameraDeTacada,
  cos: number,
  sen: number,
): number {
  const ce = Math.cos(entrada.elevacaoDoTaco);
  const se = Math.sin(entrada.elevacaoDoTaco);
  // Do bolão ao cabo: para trás e para cima.
  const ux = -cos * ce;
  const uy = se;
  const uz = -sen * ce;
  const q0 = raioBolao + Math.max(entrada.recuo, 0);
  const wx = camera.x - entrada.x;
  const wy = camera.y - entrada.y;
  const wz = camera.z - entrada.z;
  const q = Math.min(Math.max(wx * ux + wy * uy + wz * uz, q0), q0 + taco.comprimento);
  const dx = wx - ux * q;
  const dy = wy - uy * q;
  const dz = wz - uz * q;
  const raio = taco.raioPonta + ((taco.raioBase - taco.raioPonta) * (q - q0)) / taco.comprimento;
  return Math.hypot(dx, dy, dz) - raio;
}
