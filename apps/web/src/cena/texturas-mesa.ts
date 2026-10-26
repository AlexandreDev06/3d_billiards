import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { criarRng, type Rng } from '@sinuca/fisica';
import { campoDeAltura, mapaDeNormais, tabuasDaMoldura } from './grao';

/** Pixels por metro da textura da moldura (vista de cima), na escala 1. */
const PIXELS_POR_METRO = 700;
const LADO_DO_PANO = 256;
/** O lado do pano precisa ser par (o ruído periódico usa lado / 2 células). */
const ladoDoPano = (escala: number): number => Math.max(2 * Math.round((LADO_DO_PANO * escala) / 2), 32);

function contexto(largura: number, altura: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível');
  return { canvas, ctx };
}

function comoTextura(canvas: HTMLCanvasElement, anisotropia: number, cor: boolean): CanvasTexture {
  const textura = new CanvasTexture(canvas);
  if (cor) textura.colorSpace = SRGBColorSpace;
  textura.wrapS = RepeatWrapping;
  textura.wrapT = RepeatWrapping;
  textura.anisotropy = anisotropia;
  return textura;
}

/** Veio de uma tábua: fundo marrom, veios compridos e ondulados, poros curtos. `vertical`: o veio corre ao longo de y. */
function pintarVeio(
  ctx: CanvasRenderingContext2D,
  caixa: { x0: number; y0: number; x1: number; y1: number },
  vertical: boolean,
  rng: Rng,
): void {
  const { x0, y0, x1, y1 } = caixa;
  const comprimento = vertical ? y1 - y0 : x1 - x0;
  const largura = vertical ? x1 - x0 : y1 - y0;
  const ponto = (ao_longo: number, atraves: number): [number, number] =>
    vertical ? [x0 + atraves, y0 + ao_longo] : [x0 + ao_longo, y0 + atraves];

  const claridade = 20 + rng.proximo() * 7;
  ctx.fillStyle = `hsl(${24 + rng.proximo() * 5}, 48%, ${claridade}%)`;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  const veios = Math.round(largura * 3.2);
  for (let i = 0; i < veios; i++) {
    const claro = rng.proximo() < 0.4;
    ctx.strokeStyle = claro
      ? `hsla(${30 + rng.proximo() * 6}, 50%, ${34 + rng.proximo() * 10}%, ${0.05 + rng.proximo() * 0.1})`
      : `hsla(${20 + rng.proximo() * 6}, 55%, ${8 + rng.proximo() * 6}%, ${0.06 + rng.proximo() * 0.16})`;
    ctx.lineWidth = 0.5 + rng.proximo() * 2.4;
    const base = rng.proximo() * largura;
    const amplitude = 0.5 + rng.proximo() * 4;
    const frequencia = 0.004 + rng.proximo() * 0.01;
    const fase = rng.proximo() * 6.28;
    const inicio = -rng.proximo() * 200;
    ctx.beginPath();
    for (let t = inicio; t <= comprimento + 30; t += 30) {
      const [x, y] = ponto(t, base + Math.sin(t * frequencia + fase) * amplitude);
      if (t === inicio) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.lineWidth = 1;
  const poros = Math.round((comprimento * largura) / 900);
  for (let i = 0; i < poros; i++) {
    ctx.strokeStyle = `hsla(18, 50%, 8%, ${0.1 + rng.proximo() * 0.25})`;
    const ao_longo = rng.proximo() * comprimento;
    const atraves = rng.proximo() * largura;
    const [xa, ya] = ponto(ao_longo, atraves);
    const [xb, yb] = ponto(ao_longo + 5 + rng.proximo() * 14, atraves);
    ctx.beginPath();
    ctx.moveTo(xa, ya);
    ctx.lineTo(xb, yb);
    ctx.stroke();
  }
}

/**
 * Textura da moldura vista de cima: as quatro tábuas em esquadria, cada uma com o veio ao longo dela.
 * O mapeamento é planar: `u = (x + semiX) / 2semiX`, `v = 1 - (z + semiZ) / 2semiZ`.
 */
export function criarTexturaMoldura(semiX: number, semiZ: number, borda: number, anisotropia: number, escala = 1): CanvasTexture {
  const pixelsPorMetro = PIXELS_POR_METRO * escala;
  const { canvas, ctx } = contexto(Math.round(2 * semiX * pixelsPorMetro), Math.round(2 * semiZ * pixelsPorMetro));
  const rng = criarRng(20261009);
  const paraPixel = (x: number, z: number): [number, number] => [(x + semiX) * pixelsPorMetro, (z + semiZ) * pixelsPorMetro];
  for (const tabua of tabuasDaMoldura(semiX, semiZ, borda)) {
    const pixels = tabua.pontos.map((p) => paraPixel(p.x, p.z));
    const xs = pixels.map((p) => p[0]);
    const ys = pixels.map((p) => p[1]);
    ctx.save();
    ctx.beginPath();
    pixels.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.clip();
    pintarVeio(ctx, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, tabua.vertical, rng);
    ctx.restore();
  }
  return comoTextura(canvas, anisotropia, true);
}

/** Madeira para a saia e os pés: uma tábua com o veio ao longo de u. */
export function criarTexturaMadeiraCorpo(anisotropia: number, escala = 1): CanvasTexture {
  const largura = Math.max(Math.round(1024 * escala), 128);
  const altura = largura / 4;
  const { canvas, ctx } = contexto(largura, altura);
  pintarVeio(ctx, { x0: 0, y0: 0, x1: largura, y1: altura }, false, criarRng(77));
  return comoTextura(canvas, anisotropia, true);
}

export interface TexturasDoPano {
  readonly cor: CanvasTexture;
  readonly normal: CanvasTexture;
}

/** Pano de feltro: variação sutil de tom e mapa de normais de fibra e sarja; as duas ladrilham. */
export function criarTexturasDoPano(anisotropia: number, escala = 1): TexturasDoPano {
  const lado = ladoDoPano(escala);
  const altura = campoDeAltura(lado, criarRng(5));
  const normais = mapaDeNormais(altura, lado, 1.3);

  const { canvas: canvasNormal, ctx: ctxNormal } = contexto(lado, lado);
  ctxNormal.putImageData(new ImageData(new Uint8ClampedArray(normais), lado, lado), 0, 0);

  const { canvas: canvasCor, ctx: ctxCor } = contexto(lado, lado);
  const imagem = ctxCor.createImageData(lado, lado);
  for (let i = 0; i < altura.length; i++) {
    const tom = Math.round(228 + (altura[i]! - 0.5) * 36);
    imagem.data[i * 4] = tom;
    imagem.data[i * 4 + 1] = tom;
    imagem.data[i * 4 + 2] = tom;
    imagem.data[i * 4 + 3] = 255;
  }
  ctxCor.putImageData(imagem, 0, 0);

  return { cor: comoTextura(canvasCor, anisotropia, true), normal: comoTextura(canvasNormal, anisotropia, false) };
}
