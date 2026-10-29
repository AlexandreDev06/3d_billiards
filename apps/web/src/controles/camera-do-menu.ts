/** Uma câmera do menu do `.glb` do boteco (`camera-menu-1` a `-3`): onde fica e para onde olha (m). */
export interface PosicaoDoMenu {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly alvoX: number;
  readonly alvoY: number;
  readonly alvoZ: number;
}

/** A pose da câmera do menu num instante (um objeto reaproveitável: nada aloca por quadro). */
export interface PoseDaCameraDoMenu {
  x: number;
  y: number;
  z: number;
  olharX: number;
  olharY: number;
  olharZ: number;
}

export function poseDoMenuVazia(): PoseDaCameraDoMenu {
  return { x: 0, y: 0, z: 0, olharX: 0, olharY: 0, olharZ: 0 };
}

/** Subida e descida suaves (derivada zero nas pontas): a câmera chega devagar a cada posição e sai devagar. */
export function suavizadoDe5(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/**
 * A câmera passeando pelas posições do menu em ciclo (1 → 2 → 3 → 1…), `trechoS` segundos de uma à outra, parando de leve em cada
 * uma. `parada`: fica na primeira (nível baixo, sem animação contínua). Sem alocar quando `saida` é passada.
 */
export function poseDoMenu(posicoes: readonly PosicaoDoMenu[], tempoS: number, trechoS: number, parada: boolean, saida: PoseDaCameraDoMenu = poseDoMenuVazia()): PoseDaCameraDoMenu {
  const n = posicoes.length;
  const primeira = posicoes[0];
  if (n === 0 || primeira === undefined) return saida;
  let de = primeira;
  let para = primeira;
  let t = 0;
  if (!parada && n > 1 && trechoS > 0) {
    const ciclos = Math.max(tempoS, 0) / trechoS;
    const indice = Math.floor(ciclos);
    de = posicoes[indice % n]!;
    para = posicoes[(indice + 1) % n]!;
    t = suavizadoDe5(ciclos - indice);
  }
  saida.x = de.x + (para.x - de.x) * t;
  saida.y = de.y + (para.y - de.y) * t;
  saida.z = de.z + (para.z - de.z) * t;
  saida.olharX = de.alvoX + (para.alvoX - de.alvoX) * t;
  saida.olharY = de.alvoY + (para.alvoY - de.alvoY) * t;
  saida.olharZ = de.alvoZ + (para.alvoZ - de.alvoZ) * t;
  return saida;
}
