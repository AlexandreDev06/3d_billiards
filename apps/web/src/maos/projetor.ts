/** Onde um ponto do mundo cai na tela: x e y em NDC (-1 a 1) e a profundidade (m) ao longo do olhar da câmera. */
export interface PontoProjetado {
  x: number;
  y: number;
  profundidade: number;
}

/** O que as mãos precisam da câmera. A câmera de verdade (`cena/projetor-da-camera.ts`) e o furo de agulha dos testes o cumprem. */
export interface Projetor {
  /** Falso se o ponto está atrás da câmera. Escreve em `saida`. */
  projetar(x: number, y: number, z: number, saida: PontoProjetado): boolean;
  /** Largura sobre altura da tela. */
  readonly aspecto: number;
  /** 1 / tan(meio campo de visão vertical): quanto um metro a um metro de profundidade ocupa da meia altura da tela. */
  readonly escala: number;
}

/** Uma câmera ideal (furo de agulha) em `camera` olhando `alvo`, com o céu em +y: para os testes e as provas. */
export function projetorDeAgulha(camera: readonly [number, number, number], alvo: readonly [number, number, number], campoDeVisaoGraus: number, aspecto: number): Projetor {
  let fx = alvo[0] - camera[0];
  let fy = alvo[1] - camera[1];
  let fz = alvo[2] - camera[2];
  const n = Math.hypot(fx, fy, fz);
  fx /= n;
  fy /= n;
  fz /= n;
  // direita = frente × céu; cima = direita × frente
  let rx = fy * 0 - fz * 1;
  let ry = fz * 0 - fx * 0;
  let rz = fx * 1 - fy * 0;
  const m = Math.hypot(rx, ry, rz);
  rx /= m;
  ry /= m;
  rz /= m;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const escala = 1 / Math.tan((campoDeVisaoGraus * Math.PI) / 360);
  return {
    aspecto,
    escala,
    projetar(x, y, z, saida) {
      const dx = x - camera[0];
      const dy = y - camera[1];
      const dz = z - camera[2];
      const p = dx * fx + dy * fy + dz * fz;
      if (p <= 1e-6) return false;
      saida.profundidade = p;
      saida.x = ((dx * rx + dy * ry + dz * rz) * escala) / (p * aspecto);
      saida.y = ((dx * ux + dy * uy + dz * uz) * escala) / p;
      return true;
    },
  };
}
