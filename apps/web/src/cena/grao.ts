import type { Ponto2, Rng } from '@sinuca/fisica';

const suave = (t: number): number => t * t * (3 - 2 * t);

/**
 * Ruído de valor suave em [0, 1] que se repete a cada volta de (u, v) em [0, 1): o reticulado de
 * `celulas × celulas` valores dá a volta, então a textura ladrilha sem emenda.
 */
export function ruidoPeriodico(rng: Rng, celulas: number): (u: number, v: number) => number {
  const reticulado = Array.from({ length: celulas * celulas }, () => rng.proximo());
  const valor = (i: number, j: number): number => reticulado[(j % celulas) * celulas + (i % celulas)]!;
  return (u, v) => {
    const x = u * celulas;
    const y = v * celulas;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const tx = suave(x - i);
    const ty = suave(y - j);
    const topo = valor(i, j) * (1 - tx) + valor(i + 1, j) * tx;
    const base = valor(i, j + 1) * (1 - tx) + valor(i + 1, j + 1) * tx;
    return topo * (1 - ty) + base * ty;
  };
}

/** Altura do pano (fibras finas somadas a uma sarja), `lado × lado` valores em torno de [0, 1], ladrilhável. */
export function campoDeAltura(lado: number, rng: Rng): Float32Array {
  const fibras = ruidoPeriodico(rng, lado / 2);
  const mancha = ruidoPeriodico(rng, 6);
  const altura = new Float32Array(lado * lado);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const u = x / lado;
      const v = y / lado;
      const sarja = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u + v) * (lado / 4));
      altura[y * lado + x] = 0.7 * fibras(u, v) + 0.12 * sarja + 0.18 * mancha(u, v);
    }
  }
  return altura;
}

/** Mapa de normais RGBA (espaço da tangente, +Y para cima na imagem) de um campo de altura que dá a volta. */
export function mapaDeNormais(altura: Float32Array, lado: number, forca: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(lado * lado * 4);
  const h = (x: number, y: number): number => altura[((y + lado) % lado) * lado + ((x + lado) % lado)]!;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const nx = (h(x - 1, y) - h(x + 1, y)) * forca;
      const ny = (h(x, y + 1) - h(x, y - 1)) * forca;
      const norma = Math.hypot(nx, ny, 1);
      const i = (y * lado + x) * 4;
      rgba[i] = Math.round(((nx / norma) * 0.5 + 0.5) * 255);
      rgba[i + 1] = Math.round(((ny / norma) * 0.5 + 0.5) * 255);
      rgba[i + 2] = Math.round(((1 / norma) * 0.5 + 0.5) * 255);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

export interface TabuaDaMoldura {
  /** Trapézio da tábua visto de cima (em esquadria nos cantos). */
  readonly pontos: readonly Ponto2[];
  /** O veio corre ao longo de Z (as cabeceiras); nas outras corre ao longo de X. */
  readonly vertical: boolean;
}

/** As quatro tábuas da moldura (retângulo externo `semiX × semiZ` menos o interno a `borda` de distância). */
export function tabuasDaMoldura(semiX: number, semiZ: number, borda: number): TabuaDaMoldura[] {
  const ix = semiX - borda;
  const iz = semiZ - borda;
  const p = (x: number, z: number): Ponto2 => ({ x, z });
  return [
    { pontos: [p(-semiX, -semiZ), p(semiX, -semiZ), p(ix, -iz), p(-ix, -iz)], vertical: false },
    { pontos: [p(-semiX, semiZ), p(semiX, semiZ), p(ix, iz), p(-ix, iz)], vertical: false },
    { pontos: [p(-semiX, -semiZ), p(-semiX, semiZ), p(-ix, iz), p(-ix, -iz)], vertical: true },
    { pontos: [p(semiX, -semiZ), p(semiX, semiZ), p(ix, iz), p(ix, -iz)], vertical: true },
  ];
}
