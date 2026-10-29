import { TACO } from '@sinuca/fisica';
import type { AparenciaTaco } from '../cena/aparencia-do-taco';
import { TAMANHO_DAS_IMAGENS, type ParteDeImagem } from '../cena/imagem-da-peca';
import { PASTA_DAS_SKINS, carregarImagemDoNavegador } from '../cena/imagem-pintada';
import type { ImagemRGBA } from '../cena/imagens-do-taco';
import { arquivosPintados, imagensDaMiniatura, miniaturaDoTaco, misturarCores, pintadaNaMalha, vistaLateralDaImagem, type DetalheDaMiniatura, type ImagensDaMiniatura, type MiniaturaDoTaco, type PecaDaMiniatura } from './miniatura-do-taco-modelo';

/** Quanto o desenho engorda o taco (o de verdade tem 1% de espessura e sumiria): é uma ilustração, não uma medida. */
const ESPESSURA = 0.36;
const MARGEM = 4;

/**
 * Pinta o taco de lado, da ponta (esquerda) ao cabo (direita), no canvas. Só 2D: a loja não abre um segundo renderer.
 * O tamanho vem do `width`/`height` do canvas, já em pixels do dispositivo. As peças levam as mesmas imagens do taco em cena (a trama
 * gerada com a semente da aparência); `pintadas` (as artes do Pincel, de `carregarPinturas`) as substituem quando chegam.
 */
export function desenharMiniatura(canvas: HTMLCanvasElement, aparencia: AparenciaTaco, pintadas: ImagensDaMiniatura = {}): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const plano = miniaturaDoTaco(aparencia, TACO);
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const margem = MARGEM * (H / 40);
  const x = (f: number): number => margem + f * (W - 2 * margem);
  const centro = H / 2;
  const R = (H / 2 - margem) * Math.min(ESPESSURA * 2.2, 1);
  const meia = (f: number): number => raioEm(plano, f) * R;

  const imagens: ImagensDaMiniatura = { ...imagensDaMiniatura(aparencia, TACO), ...pintadas };
  if (plano.halo) brilhoGeral(ctx, plano, x, centro, meia, W, H);
  for (const peca of plano.pecas) pintarPeca(ctx, peca, x, centro, R, imagens[peca.nome as ParteDeImagem]);
  for (const detalhe of plano.detalhes) pintarDetalhe(ctx, detalhe, x, centro, meia, R);
}

/** O raio (em fração do maior) na posição `f` do comprimento, pelo perfil das peças. */
function raioEm(plano: MiniaturaDoTaco, f: number): number {
  const p = plano.pecas.find((q) => f >= q.de && f <= q.ate) ?? plano.pecas.at(-1)!;
  const u = p.ate === p.de ? 0 : (f - p.de) / (p.ate - p.de);
  return p.raioDe + (p.raioAte - p.raioDe) * u;
}

/** A forma da peça: os dois lados do perfil, de cima para baixo. */
function contorno(ctx: CanvasRenderingContext2D, p: PecaDaMiniatura, x: (f: number) => number, cy: number, R: number): void {
  ctx.beginPath();
  ctx.moveTo(x(p.de), cy - p.raioDe * R);
  ctx.lineTo(x(p.ate), cy - p.raioAte * R);
  ctx.lineTo(x(p.ate), cy + p.raioAte * R);
  ctx.lineTo(x(p.de), cy + p.raioDe * R);
  ctx.closePath();
}

/** O degradê que faz a peça parecer redonda: claro em cima, a cor no meio, escuro embaixo. */
function degrade(ctx: CanvasRenderingContext2D, cor: string, metal: boolean, cy: number, R: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
  g.addColorStop(0, misturarCores(cor, '#ffffff', metal ? 0.75 : 0.4));
  g.addColorStop(0.38, cor);
  g.addColorStop(1, misturarCores(cor, '#000000', 0.5));
  return g;
}

function pintarPeca(ctx: CanvasRenderingContext2D, p: PecaDaMiniatura, x: (f: number) => number, cy: number, R: number, imagem?: ImagemRGBA): void {
  ctx.save();
  if (p.brilho !== null) {
    ctx.shadowColor = p.brilho;
    ctx.shadowBlur = R * 0.9;
  }
  contorno(ctx, p, x, cy, R);
  ctx.fillStyle = degrade(ctx, p.cor, p.metal, cy, R);
  ctx.fill();
  ctx.shadowBlur = 0;
  contorno(ctx, p, x, cy, R);
  ctx.clip();
  const largura = x(p.ate) - x(p.de);
  if (imagem) pintarImagem(ctx, imagem, x(p.de), largura, cy, R, p.metal);
  else if (p.trama === 'carbono') {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(R * 0.12, 1);
    for (let i = -R; i < largura + R; i += R * 0.45) {
      ctx.beginPath();
      ctx.moveTo(x(p.de) + i, cy - R);
      ctx.lineTo(x(p.de) + i + R * 1.6, cy + R);
      ctx.stroke();
    }
  } else if (p.trama === 'veio') {
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = Math.max(R * 0.07, 0.75);
    for (const dy of [-0.5, -0.12, 0.28, 0.6]) {
      ctx.beginPath();
      ctx.moveTo(x(p.de), cy + dy * R);
      ctx.lineTo(x(p.ate), cy + dy * R * 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A imagem da peça vista de lado, por cima da cor, com o degradê que a faz parecer redonda (claro em cima, escuro embaixo). */
function pintarImagem(ctx: CanvasRenderingContext2D, imagem: ImagemRGBA, x0: number, largura: number, cy: number, R: number, metal: boolean): void {
  const w = Math.max(Math.round(largura), 1);
  const h = Math.max(Math.round(2 * R), 2);
  const lado = vistaLateralDaImagem(imagem, w, h);
  const folha = document.createElement('canvas');
  folha.width = w;
  folha.height = h;
  const fctx = folha.getContext('2d');
  if (!fctx) return;
  fctx.putImageData(new ImageData(new Uint8ClampedArray(lado.dados), w, h), 0, 0);
  ctx.drawImage(folha, x0, cy - R, largura, 2 * R);
  const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
  g.addColorStop(0, `rgba(255,255,255,${metal ? 0.5 : 0.3})`);
  g.addColorStop(0.38, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, cy - R, largura, 2 * R);
}

/**
 * Carrega as artes pintadas da skin (as peças que a aparência pinta, com o padrão raro da semente) e as leva à orientação da malha, no
 * tamanho que a miniatura usa. Quem desenha chama `desenharMiniatura` de novo com o resultado. Vazio se a skin não pinta ou se a rede falhou.
 */
export async function carregarPinturas(aparencia: AparenciaTaco): Promise<ImagensDaMiniatura> {
  const saida: ImagensDaMiniatura = {};
  await Promise.all(
    arquivosPintados(aparencia).map(async ({ parte, arquivo }) => {
      const textura = await carregarImagemDoNavegador(PASTA_DAS_SKINS + arquivo);
      const fonte = textura?.image as CanvasImageSource | undefined;
      if (!fonte) return;
      const base = TAMANHO_DAS_IMAGENS[parte];
      const largura = Math.max(Math.round(base.largura / 2 / 16) * 16, 32);
      const altura = Math.max(Math.round(base.altura / 2 / 16) * 16, 32);
      const folha = document.createElement('canvas');
      folha.width = largura;
      folha.height = altura;
      const ctx = folha.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(fonte, 0, 0, largura, altura);
      const dados = ctx.getImageData(0, 0, largura, altura);
      saida[parte] = pintadaNaMalha({ largura, altura, dados: dados.data }, aparencia.variacao.rolo);
    }),
  );
  return saida;
}

/**
 * Um canvas com o taco da aparência desenhado, `largura` x `altura` em pixels CSS (o canvas leva o `devicePixelRatio`, até 2); se a skin
 * tem arte pintada, ele se redesenha quando ela chega. Serve à loja e à barra de cima do menu (L40).
 */
export function criarCanvasDaMiniatura(aparencia: AparenciaTaco, largura: number, altura: number, classe: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = classe;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(largura * dpr);
  canvas.height = Math.round(altura * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  desenharMiniatura(canvas, aparencia);
  if (arquivosPintados(aparencia).length > 0) {
    void carregarPinturas(aparencia).then((pintadas) => {
      if (Object.keys(pintadas).length > 0) desenharMiniatura(canvas, aparencia, pintadas);
    });
  }
  return canvas;
}

function pintarDetalhe(ctx: CanvasRenderingContext2D, d: DetalheDaMiniatura, x: (f: number) => number, cy: number, meia: (f: number) => number, R: number): void {
  const x0 = x(d.de);
  const x1 = x(d.ate);
  const meioF = (d.de + d.ate) / 2;
  ctx.save();
  if (d.tipo === 'faixa') {
    const h = meia(meioF);
    if (d.brilho) {
      ctx.shadowColor = d.cor;
      ctx.shadowBlur = R * 0.9;
    }
    ctx.fillStyle = degrade(ctx, d.cor, false, cy, h);
    ctx.fillRect(x0, cy - meia(d.de), Math.max(x1 - x0, 1.5), meia(d.de) + meia(d.ate));
  } else if (d.tipo === 'bicos') {
    // Pontas de outra madeira que sobem do punho (à direita) em direção à ponta: três visíveis, a do meio mais longa.
    ctx.fillStyle = degrade(ctx, d.cor, false, cy, R);
    const base = x1;
    const compr = (x1 - x0) * 0.82;
    for (const [dy, fator] of [[-0.58, 0.62], [0, 1], [0.58, 0.62]] as const) {
      const meiaBase = meia(d.ate) * 0.3;
      ctx.beginPath();
      ctx.moveTo(base, cy + dy * meia(d.ate) - meiaBase);
      ctx.lineTo(base - compr * fator, cy + dy * meia(d.ate) * 0.92);
      ctx.lineTo(base, cy + dy * meia(d.ate) + meiaBase);
      ctx.closePath();
      ctx.fill();
    }
  } else if (d.tipo === 'chamas') {
    const g = ctx.createLinearGradient(x1, 0, x0, 0);
    g.addColorStop(0, d.cores[0]);
    g.addColorStop(1, d.cores[1]);
    ctx.fillStyle = g;
    const compr = (x1 - x0) * 0.9;
    for (const [dy, fator] of [[-0.55, 0.7], [-0.05, 1], [0.5, 0.78]] as const) {
      const h = meia(d.ate);
      const topo = cy + dy * h - h * 0.34;
      ctx.beginPath();
      ctx.moveTo(x1, topo + h * 0.68);
      ctx.quadraticCurveTo(x1 - compr * fator * 0.35, topo + h * 0.55, x1 - compr * fator, cy + dy * h - h * 0.05);
      ctx.quadraticCurveTo(x1 - compr * fator * 0.4, topo + h * 0.2, x1, topo);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Duas linhas finas que acendem, nas duas cores, ao longo da peça.
    ctx.lineWidth = Math.max(R * 0.14, 1.2);
    d.cores.forEach((cor, i) => {
      ctx.strokeStyle = cor;
      ctx.shadowColor = cor;
      ctx.shadowBlur = R * 0.8;
      const lado = i === 0 ? -0.42 : 0.42;
      ctx.beginPath();
      ctx.moveTo(x0, cy + lado * meia(d.de));
      ctx.lineTo(x1, cy + lado * meia(d.ate));
      ctx.stroke();
    });
  }
  ctx.restore();
}

/** O brilho que vaza do taco aceso: uma névoa fraca com as duas cores, atrás de tudo. */
function brilhoGeral(ctx: CanvasRenderingContext2D, plano: MiniaturaDoTaco, x: (f: number) => number, cy: number, meia: (f: number) => number, W: number, H: number): void {
  const halo = plano.halo!;
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0.1, halo.cores[0]);
  g.addColorStop(0.9, halo.cores[1]);
  ctx.globalAlpha = halo.intensidade * 0.45;
  ctx.filter = `blur(${Math.max(H / 8, 2)}px)`;
  ctx.fillStyle = g;
  const topo = cy - meia(0.5) * 1.5;
  ctx.fillRect(x(0.05), topo, x(0.95) - x(0.05), cy - topo + meia(0.5) * 1.5);
  ctx.restore();
}
