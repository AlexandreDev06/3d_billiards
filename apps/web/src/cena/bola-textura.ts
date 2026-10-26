import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { MARFIM, planoDeCor, type EstiloDaBola } from './bola-estilo';

const LARGURA_CHEIA = 1024;

/** Medidas do canvas na escala pedida (1 = 1024 × 512); o desenho todo é proporcional a elas. */
function medidas(escala: number): { readonly LARGURA: number; readonly ALTURA: number; readonly RAIO_PONTO: number } {
  const LARGURA = Math.max(Math.round(LARGURA_CHEIA * escala), 64);
  const ALTURA = LARGURA / 2;
  return { LARGURA, ALTURA, RAIO_PONTO: ALTURA * 0.135 };
}

/** Desenha a bola `numero` no `canvas`: corpo na cor (lisa) ou marfim com faixa (listrada) e os círculos com o número. */
function desenharBola(canvas: HTMLCanvasElement, numero: number, estilo: EstiloDaBola): void {
  const LARGURA = canvas.width;
  const ALTURA = canvas.height;
  const RAIO_PONTO = ALTURA * 0.135;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível');

  const { fundo, faixa } = planoDeCor(numero, estilo);
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  if (faixa !== null) {
    ctx.fillStyle = faixa;
    ctx.fillRect(0, ALTURA * 0.25, LARGURA, ALTURA * 0.5);
  }

  ctx.font = `bold ${Math.round(RAIO_PONTO * 1.2)}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const x = u * LARGURA;
    ctx.fillStyle = MARFIM;
    ctx.beginPath();
    ctx.arc(x, ALTURA / 2, RAIO_PONTO, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText(String(numero), x, ALTURA / 2 + RAIO_PONTO * 0.05);
    if (numero === 6 || numero === 9) {
      const meia = ctx.measureText(String(numero)).width / 2;
      ctx.fillRect(x - meia, ALTURA / 2 + RAIO_PONTO * 0.55, 2 * meia, RAIO_PONTO * 0.1);
    }
  }
}

/**
 * Textura equirretangular da bola `numero`: lisa ou com faixa (`estilo`, que vem das regras da casa), e
 * quatro círculos brancos com o número no equador (sempre sobra um para ver).
 * 6 e 9 levam sublinhado para não se confundirem.
 */
export function criarTexturaDaBola(numero: number, estilo: EstiloDaBola, anisotropia: number, escala = 1): CanvasTexture {
  const { LARGURA, ALTURA } = medidas(escala);
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  desenharBola(canvas, numero, estilo);
  const textura = new CanvasTexture(canvas);
  textura.colorSpace = SRGBColorSpace;
  textura.wrapS = RepeatWrapping;
  textura.anisotropy = anisotropia;
  return textura;
}

/** Refaz o desenho da mesma textura (a casa mudou o estilo da bola): quem a usa, inclusive as variantes de material, vê a troca. */
export function redesenharTexturaDaBola(textura: CanvasTexture, numero: number, estilo: EstiloDaBola): void {
  desenharBola(textura.image as HTMLCanvasElement, numero, estilo);
  textura.needsUpdate = true;
}

const RAIO_MARCA_GRAUS = 6.5;
const VERMELHO_MARCA = '#c4251c';
/** Seis marcas, uma por eixo (±X, ±Y, ±Z): de qualquer lado sempre aparece alguma. */
const MARCAS: readonly { readonly latitude: number; readonly longitude: number }[] = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 90 },
  { latitude: 0, longitude: 180 },
  { latitude: 0, longitude: 270 },
  { latitude: 90, longitude: 0 },
  { latitude: -90, longitude: 0 },
];

/**
 * Textura equirretangular do bolão: marfim liso com pontinhos vermelhos
 * discretos, só para o giro (efeito, rolamento) aparecer.
 */
export function criarTexturaDoBolao(anisotropia: number, escala = 1): CanvasTexture {
  const { LARGURA, ALTURA } = medidas(escala);
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível');

  ctx.fillStyle = MARFIM;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = VERMELHO_MARCA;
  const rho = (RAIO_MARCA_GRAUS * Math.PI) / 180;
  const meiaAltura = (rho / Math.PI) * ALTURA;
  for (const { latitude, longitude } of MARCAS) {
    if (Math.abs(latitude) === 90) {
      // Um polo vira uma faixa no topo (ou na base) da imagem.
      ctx.fillRect(0, latitude > 0 ? 0 : ALTURA - meiaAltura, LARGURA, meiaAltura);
      continue;
    }
    const x = (longitude / 360) * LARGURA;
    const y = ALTURA / 2 - (latitude / 180) * ALTURA;
    const meiaLargura = ((rho / (2 * Math.PI)) * LARGURA) / Math.cos((latitude * Math.PI) / 180);
    for (const dx of [-LARGURA, 0, LARGURA]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, meiaLargura, meiaAltura, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  const textura = new CanvasTexture(canvas);
  textura.colorSpace = SRGBColorSpace;
  textura.wrapS = RepeatWrapping;
  textura.anisotropy = anisotropia;
  return textura;
}
