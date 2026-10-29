import type { TramaGerada } from './aparencia-do-taco';
import { imagemDeAcabamento } from './acabamentos-do-taco';
import { escurece, fractal, frac, limitar, mistura, modulo, nova, normaisDeInclinacao, poe, ponto, rampa, rgb, suave, voltas, type ContextoDaTrama, type Cor, type ImagemGerada } from './ferramentas-de-trama';
import type { ImagemRGBA, TamanhoDaImagem } from './imagens-do-taco';
import { aplicarTom, misturar } from './variacao-da-semente';

export type { ContextoDaTrama, DetalheDaTrama, ImagemGerada } from './ferramentas-de-trama';

/**
 * As tramas geradas do L35 (marmorizado, degradê, têmpera, facetas, xadrez, rede e painéis de placar), pixel a pixel e sem DOM nem
 * three. Tudo determinístico: a mesma semente dá a mesma imagem em qualquer aparelho (só inteiros misturados e `Math.sin`, nada de
 * sorteio). A imagem tem `largura` em volta da peça (x, de 0 a 1 de volta; ladrilha) e `altura` ao longo dela (y, da ponta, v = 0, para
 * o cabo, v = 1). Os padrões são contados em "perímetros": `a` = a volta (0 a 1) e `b` = a distância ao longo, em perímetros da peça
 * (a imagem é esticada, e o padrão fica quadrado na peça de verdade). A semente entra assim: `rolo` gira em volta, `deslocamento`
 * corre ao longo, `giro` inclina o padrão numa hélice (continua sem emenda em volta) e `escala` o faz crescer (em números inteiros
 * de voltas, para fechar a emenda).
 */

// ------------------------------------------------------------------------------------------------ marmorizado

function marmore(g: Extract<TramaGerada, { tipo: 'marmore' }>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const paleta = g.cores.map((k) => rgb(aplicarTom(k, c.variacao.tom)));
  const sem = c.variacao.semente ?? 0;
  const oitavas = c.detalhe === 'cheio' ? 3 : 1;
  const dobra1 = fractal(sem + 1, 2, oitavas);
  const dobra2 = fractal(sem + 2, 3, oitavas);
  const giros = voltas(2, c.variacao.escala);
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1);
      const w1 = dobra1(p.a, p.b * 0.6);
      const w2 = dobra2(p.a + 0.31, p.b * 0.6 + 0.17);
      const fase = p.a * giros + p.b * 0.35 + g.turbulencia * (2.4 * (w1 - 0.5) + 1.2 * (w2 - 0.5)) * giros;
      const t = 0.5 + 0.5 * Math.sin(2 * Math.PI * fase);
      // As bandas pedem borda um pouco nítida: a rampa fica mais achatada nas pontas.
      const afiada = suave(0.12, 0.88, t);
      let c1 = rampa(paleta, afiada);
      // Um fio claro onde as bandas se encontram, como nas resinas de verdade.
      const fio = 1 - suave(0, 0.035, Math.abs(t - 0.5));
      if (c.detalhe === 'cheio') c1 = mistura(c1, [255, 255, 255], fio * 0.08);
      poe(cor, x, y, c1);
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ degradê

function degrade(g: Extract<TramaGerada, { tipo: 'degrade' }>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const paradas = [...g.paradas].sort((p, q) => p.de - q.de).map((p) => ({ de: p.de, cor: rgb(aplicarTom(p.cor, c.variacao.tom)) }));
  const { de, ate } = c.noTaco;
  // A semente empurra o degradê um pouco ao longo do taco (até 4% do comprimento): o sol sobe ou desce de um taco para outro.
  const empurrao = (c.variacao.deslocamento - 0.5) * 0.08;
  for (let y = 0; y < c.tamanho.altura; y++) {
    const v = c.tamanho.altura > 1 ? y / (c.tamanho.altura - 1) : 0;
    const g0 = limitar(de + v * (ate - de) + empurrao);
    let c1 = paradas[0]!.cor;
    if (g0 >= paradas[paradas.length - 1]!.de) c1 = paradas[paradas.length - 1]!.cor;
    else {
      for (let i = 0; i < paradas.length - 1; i++) {
        const p = paradas[i]!;
        const q = paradas[i + 1]!;
        if (g0 >= p.de && g0 <= q.de) {
          c1 = mistura(p.cor, q.cor, suave(p.de, q.de, g0));
          break;
        }
      }
    }
    for (let x = 0; x < c.tamanho.largura; x++) {
      // Um fio de luz em volta: o lado de cima da peça um pouco mais claro, sem emenda.
      const u = x / c.tamanho.largura + c.variacao.rolo;
      poe(cor, x, y, escurece(c1, 1 + 0.05 * Math.cos(2 * Math.PI * u)));
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ facetas

function facetas(g: Extract<TramaGerada, { tipo: 'facetas' }>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const relevo = c.detalhe === 'cheio' ? nova(c.tamanho) : null;
  const base = rgb(aplicarTom(g.cor, c.variacao.tom));
  const sem = c.variacao.semente ?? 0;
  const n = voltas(g.facetas, c.variacao.escala, 3);
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1 / n);
      const px = p.a * n;
      const py = p.b * n;
      const i0 = Math.floor(px);
      const j0 = Math.floor(py);
      let d1 = 9;
      let d2 = 9;
      let ci = 0;
      let cj = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          const fx = i + 0.15 + 0.7 * misturar(modulo(i, n), j, sem + 11);
          const fy = j + 0.15 + 0.7 * misturar(modulo(i, n), j, sem + 12);
          const d = Math.hypot(px - fx, py - fy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            ci = modulo(i, n);
            cj = j;
          } else if (d < d2) d2 = d;
        }
      }
      const tom = 0.5 + 0.95 * misturar(ci, cj, sem + 13);
      const miolo = 1 + 0.35 * (1 - limitar(d1 * 1.5));
      const aresta = 1 - suave(0, 0.07, d2 - d1);
      let c1 = escurece(base, tom * miolo);
      c1 = mistura(c1, [235, 255, 245], aresta * 0.45);
      poe(cor, x, y, c1);
      if (relevo) normaisDeInclinacao(relevo, x, y, (misturar(ci, cj, sem + 14) - 0.5) * 1.6 * (1 - aresta * 0.5), (misturar(ci, cj, sem + 15) - 0.5) * 1.6 * (1 - aresta * 0.5));
    }
  }
  return { cor, emissiva: null, relevo };
}

// ------------------------------------------------------------------------------------------------ xadrez

function xadrez(g: Extract<TramaGerada, { tipo: 'xadrez' }>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const cores = g.cores.map((k) => rgb(aplicarTom(k, c.variacao.tom)));
  const sem = c.variacao.semente ?? 0;
  const n = voltas(g.casas, c.variacao.escala, 2);
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1 / n);
      const px = p.a * n;
      const py = p.b * n;
      const ia = Math.floor(px);
      const jb = Math.floor(py);
      let c1: Cor;
      if (cores.length === 2) {
        // Toalha de mesa de verdade (xadrez de guingão): o claro, o meio-tom onde uma faixa cruza o claro e o escuro onde as duas se cruzam.
        const soma = (modulo(ia, 2) === 0 ? 1 : 0) + (modulo(jb, 2) === 0 ? 1 : 0);
        c1 = soma === 0 ? cores[1]! : soma === 1 ? mistura(cores[0]!, cores[1]!, 0.5) : cores[0]!;
      } else c1 = cores[Math.floor(misturar(modulo(ia, n), jb, sem + 21) * cores.length)]!;
      // O fio do tecido: linhas finas nos dois sentidos, e a casa um pouco mais escura na borda.
      const tecido = 0.95 + 0.05 * Math.sin(2 * Math.PI * px * 6) * Math.sin(2 * Math.PI * py * 6);
      const borda = 1 - 0.1 * Math.max(suave(0.86, 1, frac(px)), suave(0.14, 0, frac(px)), suave(0.86, 1, frac(py)), suave(0.14, 0, frac(py)));
      poe(cor, x, y, escurece(c1, tecido * borda));
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ rede

function rede(g: Extract<TramaGerada, { tipo: 'rede' }>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const fundo = rgb(aplicarTom(g.fundo, c.variacao.tom));
  const fio = rgb(aplicarTom(g.fio, c.variacao.tom));
  const sem = c.variacao.semente ?? 0;
  const n = voltas(g.malhas, c.variacao.escala, 2);
  const meia = limitar(g.espessura, 0.02, 0.45) / 2;
  const borda = 0.5 / Math.max(c.tamanho.largura / n, 4);
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1 / n);
      const s = p.a * n + p.b * n;
      const t = p.a * n - p.b * n;
      const ds = Math.abs(frac(s) - 0.5);
      const dt = Math.abs(frac(t) - 0.5);
      // Distância de cada pixel ao fio mais perto (0 sobre o fio, 0,5 no meio da malha).
      const dFio = Math.min(0.5 - ds, 0.5 - dt);
      const cobertura = 1 - suave(meia - borda, meia + borda, dFio);
      // O fio é redondo: mais claro no meio, mais escuro nas bordas. O nó, onde dois fios se cruzam, brilha um pouco mais.
      const no = 1 - suave(0, 0.2, Math.max(0.5 - ds, 0.5 - dt) * 1);
      const arredondado = 1.15 - 0.45 * suave(0, meia, dFio);
      const grao = 1 + 0.08 * (misturar(x, y, sem) - 0.5);
      const c1 = mistura(fundo, escurece(fio, arredondado * (1 + 0.25 * no) * grao), cobertura);
      poe(cor, x, y, c1);
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ painéis de placar

/** Os segmentos acesos de cada dígito (a, b, c, d, e, f, g, nessa ordem de bit). */
const SEGMENTOS: readonly number[] = [0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110, 0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111];

/**
 * O dígito `d` em sete segmentos, num quadro (fx, fy) de 0 a 1 (fy = 0 em cima): 1 onde o LED acende, com `fio` de espessura
 * (fração do quadro) e bordas suaves de `suavidade`.
 */
export function digitoDeSetesegmentos(d: number, fx: number, fy: number, fio = 0.17, suavidade = 0.04): number {
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return 0;
  const bits = SEGMENTOS[modulo(Math.trunc(d), 10)]!;
  const f = fio;
  const horizontal = (yc: number): number => suave(f / 2 + suavidade, f / 2 - suavidade, Math.abs(fy - yc)) * suave(0, f * 0.8, Math.min(fx, 1 - fx));
  const vertical = (xc: number, de: number, ate: number): number => suave(f / 2 + suavidade, f / 2 - suavidade, Math.abs(fx - xc)) * suave(de - f * 0.4, de + f * 0.3, fy) * suave(ate + f * 0.4, ate - f * 0.3, fy);
  let aceso = 0;
  if (bits & 1) aceso = Math.max(aceso, horizontal(f / 2));
  if (bits & 2) aceso = Math.max(aceso, vertical(1 - f / 2, 0, 0.5));
  if (bits & 4) aceso = Math.max(aceso, vertical(1 - f / 2, 0.5, 1));
  if (bits & 8) aceso = Math.max(aceso, horizontal(1 - f / 2));
  if (bits & 16) aceso = Math.max(aceso, vertical(f / 2, 0.5, 1));
  if (bits & 32) aceso = Math.max(aceso, vertical(f / 2, 0, 0.5));
  if (bits & 64) aceso = Math.max(aceso, horizontal(0.5));
  return aceso;
}

function paineis(g: Extract<TramaGerada, { tipo: 'paineis' }>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const emissiva = nova(c.tamanho);
  const painel = rgb(aplicarTom(g.painel, c.variacao.tom));
  const junta = rgb(g.junta);
  const leds = [rgb(g.led[0]), rgb(g.led[1])] as const;
  const sem = c.variacao.semente ?? 0;
  const colunas = voltas(g.colunas, c.variacao.escala, 2);
  const ALTURA = 1.5; // cada painel é 1,5× mais alto (ao longo do taco) que largo
  const margem = 0.045;
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, ALTURA / colunas);
      const px = p.a * colunas;
      const py = (p.b * colunas) / ALTURA;
      const ia = Math.floor(px);
      const jb = Math.floor(py);
      const fx = px - ia;
      const fy = py - jb;
      const ida = modulo(ia, colunas);
      const brilhoDoPainel = 0.9 + 0.1 * misturar(ida, jb, sem + 31);
      const naJunta = Math.max(suave(margem, 0, fx), suave(1 - margem, 1, fx), suave(margem * 0.7, 0, fy), suave(1 - margem * 0.7, 1, fy));
      let c1 = mistura(escurece(painel, brilhoDoPainel), junta, naJunta);
      let aceso: Cor = [0, 0, 0];
      // Um em cada três painéis tem o visor escuro com dois dígitos de LED (um sobre o outro; o alto do dígito aponta para a ponta).
      if (misturar(ida, jb, sem + 32) < 0.36) {
        const led = leds[Math.floor(misturar(ida, jb, sem + 33) * 2)]!;
        const vx = (fx - 0.14) / 0.72;
        const vy = (fy - 0.08) / 0.84;
        const dentro = suave(0, 0.04, vx) * suave(1, 0.96, vx) * suave(0, 0.04, vy) * suave(1, 0.96, vy);
        c1 = mistura(c1, [10, 14, 16], dentro);
        for (let k = 0; k < 2; k++) {
          const dx = (vx - 0.12) / 0.76;
          const dy = (vy - k * 0.5 - 0.04) / 0.42;
          const brilho = digitoDeSetesegmentos(Math.floor(misturar(ida, jb, sem + 34 + k) * 10), dx, dy) * dentro;
          if (brilho > 0) {
            c1 = mistura(c1, escurece(led, 0.5), brilho);
            aceso = [Math.max(aceso[0], led[0] * brilho), Math.max(aceso[1], led[1] * brilho), Math.max(aceso[2], led[2] * brilho)];
          }
        }
      }
      poe(cor, x, y, c1);
      poe(emissiva, x, y, aceso);
    }
  }
  return { cor, emissiva, relevo: null };
}

/** A imagem de uma trama gerada, no tamanho e com a semente do contexto. */
export function imagemDaTrama(gerada: TramaGerada, c: ContextoDaTrama): ImagemGerada {
  switch (gerada.tipo) {
    case 'marmore':
      return marmore(gerada, c);
    case 'degrade':
      return degrade(gerada, c);
    case 'facetas':
      return facetas(gerada, c);
    case 'xadrez':
      return xadrez(gerada, c);
    case 'rede':
      return rede(gerada, c);
    case 'paineis':
      return paineis(gerada, c);
    default:
      return imagemDeAcabamento(gerada, c);
  }
}

// ------------------------------------------------------------------------------------------------ contador de bolas

/** Como o contador se desenha no cabo: o LED e a placa. */
export interface EstiloDoContador {
  readonly led: number;
  readonly placa: number;
}

export const CONTADOR_PADRAO: EstiloDoContador = { led: 0xffa31a, placa: 0x0b0c10 };

/** O texto do contador: 4 dígitos com zeros à esquerda; de 9999 para cima fica 9999. */
export const textoDoContador = (bolas: number): string => String(Math.min(Math.max(Math.trunc(bolas), 0), 9999)).padStart(4, '0');

/**
 * Onde a placa do contador fica no cabo, em perímetros da base: `inicio` é a distância do anel, `comprimento` e `largura` o tamanho
 * da placa ao longo do cabo e em volta dele (centrada no lado de cima do taco). É daqui que `taco.ts` tira a geometria da placa.
 */
export const PLACA_DO_CONTADOR = { inicio: 0.06, comprimento: 0.4, largura: 0.2 } as const;

/**
 * A placa do contador de bolas, em duas imagens com o tamanho dado: `cor` (RGBA: a placa escura de cantos redondos, transparente fora
 * dela, com os dígitos em LED mais fracos) e `emissiva` (os dígitos acesos, preto no resto). A imagem corre ao longo do cabo em x
 * (do anel para a ponta de trás, a leitura) e em volta dele em y (o alto do dígito em y = 0). Quatro dígitos de sete segmentos.
 */
export function imagemDoContador(bolas: number, tamanho: TamanhoDaImagem, estilo: EstiloDoContador = CONTADOR_PADRAO): { readonly cor: ImagemRGBA; readonly emissiva: ImagemRGBA } {
  const digitos = textoDoContador(bolas);
  const led = rgb(estilo.led);
  const placa = rgb(estilo.placa);
  const cor = nova(tamanho);
  const emissiva = nova(tamanho);
  const proporcao = PLACA_DO_CONTADOR.comprimento / PLACA_DO_CONTADOR.largura;
  // Os dígitos medem 0,14 perímetro de alto (≈ 12 mm) e 0,077 de largura; no quadro da placa, de 0 a 1.
  const altoD = 0.14 / PLACA_DO_CONTADOR.largura;
  const largoD = 0.077 / PLACA_DO_CONTADOR.comprimento;
  const vao = 0.011 / PLACA_DO_CONTADOR.comprimento;
  const margem = (1 - (digitos.length * largoD + (digitos.length - 1) * vao)) / 2;
  const raio = 0.16;
  for (let y = 0; y < tamanho.altura; y++) {
    const fy = (y + 0.5) / tamanho.altura;
    for (let x = 0; x < tamanho.largura; x++) {
      const fx = (x + 0.5) / tamanho.largura;
      // Retângulo de cantos redondos (em unidades de largura da placa, para o canto ser redondo e não oval).
      const dx = Math.abs(fx - 0.5) * proporcao - (0.5 * proporcao - raio);
      const dy = Math.abs(fy - 0.5) - (0.5 - raio);
      const distancia = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - raio;
      const alfa = suave(0.025, -0.01, distancia);
      let c1: Cor = escurece(placa, 1 + 0.5 * (0.5 - fy));
      let aceso = 0;
      const k = Math.floor((fx - margem) / (largoD + vao));
      if (k >= 0 && k < digitos.length) {
        const lx = (fx - margem - k * (largoD + vao)) / largoD;
        const ly = (fy - (1 - altoD) / 2) / altoD;
        aceso = digitoDeSetesegmentos(Number(digitos[k]), lx, ly, 0.22, 0.07);
      }
      if (aceso > 0) c1 = mistura(c1, escurece(led, 0.6), aceso);
      poe(cor, x, y, c1);
      cor.dados[(y * tamanho.largura + x) * 4 + 3] = Math.round(alfa * 255);
      poe(emissiva, x, y, [led[0] * aceso, led[1] * aceso, led[2] * aceso]);
    }
  }
  return { cor, emissiva };
}
