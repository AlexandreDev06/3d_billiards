/** O que a câmera do fim precisa saber para enquadrar os balões em volta da mesa. */
export interface EntradaDaCameraDoFim {
  /** Meia extensão da mesa com a moldura, ao longo de X e de Z (m). */
  readonly semiX: number;
  readonly semiZ: number;
  /** Quanto o círculo dos balões passa da moldura (m) e a meia largura de um balão cheio (m). */
  readonly folga: number;
  readonly meiaLarguraDoBalao: number;
  /** Altura do centro do balão cheio sobre o pano e a meia altura dele (m). */
  readonly alturaDoBalao: number;
  readonly meiaAlturaDoBalao: number;
  readonly campoDeVisaoGraus: number;
  readonly aspecto: number;
  /** Elevação da câmera sobre o pano, vista do ponto olhado (rad). */
  readonly elevacao: number;
  /** Sobra lateral na tela (fração da metade da largura). */
  readonly margem: number;
}

/** A pose da câmera do fim: posição e ponto olhado (m). */
export interface PoseDaCameraDoFim {
  x: number;
  y: number;
  z: number;
  olharX: number;
  olharY: number;
  olharZ: number;
}

export function poseVaziaDoFim(): PoseDaCameraDoFim {
  return { x: 0, y: 0, z: 0, olharX: 0, olharY: 0, olharZ: 0 };
}

/**
 * A câmera do fim: do lado +Z, no plano de simetria da mesa, olhando o meio do conjunto (mesa e balões) de cima, com a mesa de
 * ponta a ponta na horizontal. Afasta-se o necessário para os dois balões das pontas caberem na largura da tela com `margem`, e
 * para o balão mais alto e a moldura mais próxima caberem na altura; vale o maior dos dois afastamentos.
 */
export function poseDaCameraDoFim(e: EntradaDaCameraDoFim, saida: PoseDaCameraDoFim = poseVaziaDoFim()): PoseDaCameraDoFim {
  const meiaAlturaVisual = Math.tan((e.campoDeVisaoGraus * Math.PI) / 360);
  const meiaLarguraVisual = meiaAlturaVisual * e.aspecto;
  // O ponto olhado: no fundo do conjunto, à altura do meio dele (o pano e o topo dos balões).
  const topo = e.alturaDoBalao + e.meiaAlturaDoBalao;
  const olharY = topo / 2;
  const olharZ = -e.semiZ * 0.2;
  const cos = Math.cos(e.elevacao);
  const sen = Math.sin(e.elevacao);

  // Largura: o balão mais afastado (nas pontas) está a semiX + folga + meia largura do centro. A distância é medida no eixo da
  // câmera; a perspectiva encolhe o que está mais longe, então confere-se pelo lado mais perto da câmera (as pontas, z ≈ 0).
  const meiaLargura = e.semiX + e.folga + e.meiaLarguraDoBalao;
  const porLargura = meiaLargura / (meiaLarguraVisual * (1 - e.margem));
  // Altura: do pé da moldura mais próxima (z = semiZ, y = 0) ao topo do balão mais alto, projetados na vertical da tela.
  const verticalDaTela = (z: number, y: number): number => (z - olharZ) * -sen + (y - olharY) * cos;
  const altoNaTela = Math.max(verticalDaTela(-(e.semiZ + e.folga), topo), verticalDaTela(e.semiZ, 0)) - Math.min(verticalDaTela(-(e.semiZ + e.folga), topo), verticalDaTela(e.semiZ, 0));
  const porAltura = altoNaTela / 2 / (meiaAlturaVisual * (1 - e.margem));
  const distancia = Math.max(porLargura, porAltura);

  saida.x = 0;
  saida.y = olharY + distancia * sen;
  saida.z = olharZ + distancia * cos;
  saida.olharX = 0;
  saida.olharY = olharY;
  saida.olharZ = olharZ;
  return saida;
}
