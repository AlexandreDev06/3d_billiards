import type { ParadaDeCor, TramaGerada } from './aparencia-do-taco';
import { escurece, fractal, frac, limitar, mistura, modulo, nova, poe, ponto, rampa, rgb, ruidoDeValor, suave, voltas, type ContextoDaTrama, type Cor, type ImagemGerada } from './ferramentas-de-trama';
import { aplicarTom, misturar } from './variacao-da-semente';

/**
 * Os acabamentos fiéis ao CS (L36): são técnicas de acabamento, não desenhos de alguém, e cada um sai de código, pixel a pixel e
 * determinístico pela semente do taco (`ferramentas-de-trama.ts` tem as contas de coordenada e o ruído).
 *
 * - `tempera` (Case Hardened): aço com manchas de têmpera, a sequência de cores que o calor dá ao aço (aço, ouro, bronze, roxo, azul).
 * - `veus` (Doppler, Gamma Doppler): pintura candy sobre metal escuro, véus de cor em padrão de mármore escuro.
 * - `fade`: anodizado em degradê de amarelo-dourado, laranja e rosa a roxo e azul, ao longo do taco inteiro (amarelo na ponta, roxo no
 *   cabo); a semente é a porcentagem do fade, o quanto do comprimento é rosa e roxo (o Full Fade é o extremo, quase tudo rosa e roxo).
 * - `fadeMarmore` (Marble Fade): degradê candy dobrado em fitas de mármore.
 * - `teia` (Crimson Web): teia de aranha vermelha sobre preto.
 * - `scifi` (Asiimov): painéis brancos com cintas pretas e detalhes laranja.
 *
 * Os níveis de qualidade baixos usam menos oitavas de ruído (`detalhe: 'simples'`).
 */

type De<T extends TramaGerada['tipo']> = Extract<TramaGerada, { tipo: T }>;

const TAU = 2 * Math.PI;

/**
 * A sequência de cores que o calor dá ao aço (Case Hardened), do frio ao quente: aço, aço azulado, ouro, bronze, roxo, azul profundo,
 * azul e azul claro. A trama a percorre com um ruído torcido, e o ouro, o roxo e o azul saem em manchas e anéis sobre o aço.
 */
export const PALETA_DA_TEMPERA: readonly number[] = [0x262c38, 0x3e4b66, 0xcfa23c, 0x8c5b2a, 0x6b3a9e, 0x1c3fb8, 0x2f5fe0, 0x5a90ff];

// ------------------------------------------------------------------------------------------------ têmpera

function tempera(g: De<'tempera'>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const paleta = g.paleta.map((k) => rgb(aplicarTom(k, c.variacao.tom)));
  const sem = c.variacao.semente ?? 0;
  const cheio = c.detalhe === 'cheio';
  const celulas = voltas(2, c.variacao.escala);
  // Ruído torcido sobre si mesmo (dois campos que deslocam o terceiro): as manchas ganham a forma orgânica e os anéis da têmpera.
  const tx = fractal(sem + 5, 2, 2);
  const ty = fractal(sem + 6, 2, 2);
  const base = fractal(sem + 7, celulas, cheio ? 4 : 2);
  const miudo = cheio ? fractal(sem + 8, celulas * 4, 2) : null;
  const torcao = g.torcao ?? 0.9;
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1);
      const b = p.b * 0.5;
      const wx = tx(p.a, b) - 0.5;
      const wy = ty(p.a + 0.37, b + 0.71) - 0.5;
      const n = base(p.a + torcao * wx, b + torcao * wy);
      // O ruído se acumula em torno de 0,5: esticar o contraste espalha as manchas pela paleta inteira.
      const espalhado = limitar((n - 0.5) * 2.6 + 0.5 + (miudo ? 0.1 * (miudo(p.a, b) - 0.5) : 0));
      const t = espalhado + (g.foco - espalhado) * g.dominante;
      // O aço escovado: um grão que corre ao longo da peça, e um pontilhado miúdo.
      const grao = 1 + 0.06 * (misturar(x, y >> 3, sem) - 0.5) + 0.03 * (misturar(x, y, sem + 1) - 0.5);
      poe(cor, x, y, escurece(rampa(paleta, t), grao));
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ véus candy

function veus(g: De<'veus'>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const base = rgb(aplicarTom(g.base, c.variacao.tom));
  const camadas = g.camadas.map((k) => ({ cor: rgb(aplicarTom(k.cor, c.variacao.tom)), cobertura: k.cobertura, brilho: k.brilho ?? 0.3 }));
  const sem = c.variacao.semente ?? 0;
  const cheio = c.detalhe === 'cheio';
  const dobra1 = fractal(sem + 41, 2, cheio ? 2 : 1);
  const dobra2 = fractal(sem + 42, 3, 1);
  // Cada véu tem o seu ruído (o seu lugar na peça) e uma fase do mármore.
  const nuvens = camadas.map((_, k) => fractal(sem * 7 + 100 + k * 53, voltas(2, c.variacao.escala), cheio ? 2 : 1));
  const giros = voltas(2, c.variacao.escala);
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1);
      const b = p.b * 0.6;
      const d1 = dobra1(p.a, b) - 0.5;
      const dobra = g.turbulencia * (2.4 * d1 + 1.2 * (dobra2(p.a + 0.31, b + 0.17) - 0.5));
      // O mármore: bandas que giram em volta e descem pela peça, dobradas pelo ruído.
      const banda = 0.5 + 0.5 * Math.sin(TAU * ((p.a + dobra) * giros + p.b * 0.35 + dobra * 0.3));
      // O metal escuro por baixo tem um fio de luz em volta (o lado de cima mais claro).
      const u = x / c.tamanho.largura + c.variacao.rolo;
      let c1 = escurece(base, 1 + 0.18 * Math.cos(TAU * u));
      for (let k = 0; k < camadas.length; k++) {
        const camada = camadas[k]!;
        const n = nuvens[k]!(p.a + 0.17 * k + 0.4 * d1, b + 0.23 * k);
        // Mármore e nuvem juntos: os véus seguem as bandas, mas se rasgam em manchas.
        const campo = 0.55 * n + 0.45 * (k % 2 === 0 ? banda : 1 - banda);
        const esticado = limitar((campo - 0.5) * 2.3 + 0.5);
        const limiar = 1 - camada.cobertura;
        const m = suave(limiar - 0.1, limiar + 0.1, esticado);
        // O candy se aviva onde o véu é mais denso: a cor da camada, mais clara no miolo da mancha.
        const miolo = suave(limiar + 0.05, limiar + 0.3, esticado);
        const viva = mistura(camada.cor, [255, 255, 255], camada.brilho * miolo * 0.35);
        c1 = mistura(c1, escurece(viva, 0.85 + 0.3 * n), m * 0.94);
      }
      poe(cor, x, y, c1);
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ degradês

interface ParadaPronta {
  readonly de: number;
  readonly cor: Cor;
}

const paradasProntas = (paradas: readonly ParadaDeCor[], tom: ContextoDaTrama['variacao']['tom']): ParadaPronta[] => [...paradas].sort((p, q) => p.de - q.de).map((p) => ({ de: p.de, cor: rgb(aplicarTom(p.cor, tom)) }));

/** A cor do degradê na posição `g0` (suavizado entre uma parada e a seguinte; fora das pontas, a cor da ponta). */
function corDoDegrade(paradas: readonly ParadaPronta[], g0: number): Cor {
  const primeira = paradas[0]!;
  const ultima = paradas[paradas.length - 1]!;
  if (g0 <= primeira.de) return primeira.cor;
  if (g0 >= ultima.de) return ultima.cor;
  for (let i = 0; i < paradas.length - 1; i++) {
    const p = paradas[i]!;
    const q = paradas[i + 1]!;
    if (g0 >= p.de && g0 <= q.de) return mistura(p.cor, q.cor, suave(p.de, q.de, g0));
  }
  return ultima.cor;
}

/**
 * Quanto a porcentagem do fade (a semente) acelera o degradê ao longo do taco: o expoente em `fade` vai de `EXPOENTE_DO_FADE_MAX`
 * (pouco fade: o amarelo e o laranja ocupam quase o taco todo e o rosa só chega perto do cabo) a `EXPOENTE_DO_FADE_MIN` (muito fade: o
 * rosa começa perto da ponta e o roxo já cobre o cabo e parte do antebraço). Nos dois extremos a ponta segue amarela e o cabo roxo.
 */
const EXPOENTE_DO_FADE_MAX = 1.5;
const EXPOENTE_DO_FADE_MIN = 0.85;
const EXPOENTE_DO_FADE_MEDIO = Math.sqrt(EXPOENTE_DO_FADE_MAX * EXPOENTE_DO_FADE_MIN);
const ALCANCE_DO_EXPOENTE = Math.log(EXPOENTE_DO_FADE_MAX / EXPOENTE_DO_FADE_MIN) / 0.5;

function fade(g: De<'fade'>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const paradas = paradasProntas(g.paradas, c.variacao.tom);
  const sem = c.variacao.semente ?? 0;
  const { de, ate } = c.noTaco;
  // A semente é a porcentagem do fade (sem semente, a do meio): ela muda o quanto do comprimento é rosa e roxo. O taco inteiro é o
  // degradê, da ponta (amarelo) ao cabo (roxo), e a porcentagem só curva por onde ele passa (`empurrao` é o quanto ela pode curvar).
  const porcentagem = c.variacao.semente === null ? 0.5 : c.variacao.deslocamento;
  const expoente = EXPOENTE_DO_FADE_MEDIO * Math.exp((0.5 - porcentagem) * g.empurrao * ALCANCE_DO_EXPOENTE);
  const onda = ruidoDeValor(sem * 31 + 3, 3);
  for (let y = 0; y < c.tamanho.altura; y++) {
    const v = c.tamanho.altura > 1 ? y / (c.tamanho.altura - 1) : 0;
    const bruto = v * c.proporcao;
    const noTaco = limitar(de + v * (ate - de)) ** expoente;
    for (let x = 0; x < c.tamanho.largura; x++) {
      const a = x / c.tamanho.largura + c.variacao.rolo + c.variacao.giro * bruto;
      // A borda do degradê ondula um pouco em volta da peça, como a camada anodizada de verdade.
      const g0 = limitar(noTaco + g.onda * (onda(a, bruto) - 0.5));
      // O metal anodizado: fio de luz em volta e um escovado que corre ao longo da peça.
      const escovado = 1 + 0.05 * (misturar(x, y >> 4, sem + 9) - 0.5);
      poe(cor, x, y, escurece(corDoDegrade(paradas, g0), escovado * (1 + 0.06 * Math.cos(TAU * a))));
    }
  }
  return { cor, emissiva: null, relevo: null };
}

/** A parte do taco, da ponta, em que o degradê do Marble Fade vai do vermelho ao azul (a haste, a peça que mais se vê, mostra as três cores). */
const ALCANCE_DO_MARMORE = 0.7;

function fadeMarmore(g: De<'fadeMarmore'>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const paradas = paradasProntas(g.paradas, c.variacao.tom);
  const sem = c.variacao.semente ?? 0;
  const oitavas = c.detalhe === 'cheio' ? 3 : 1;
  const dobra1 = fractal(sem + 61, 2, oitavas);
  const dobra2 = fractal(sem + 62, 3, oitavas);
  const giros = voltas(2, c.variacao.escala);
  const { de, ate } = c.noTaco;
  for (let y = 0; y < c.tamanho.altura; y++) {
    const v = c.tamanho.altura > 1 ? y / (c.tamanho.altura - 1) : 0;
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1);
      const dobra = g.turbulencia * (2 * (dobra1(p.a, p.b * 0.6) - 0.5) + (dobra2(p.a + 0.31, p.b * 0.6 + 0.17) - 0.5));
      const fase = TAU * (p.a * giros + p.b * 0.35 + dobra * giros);
      // O degradê ao longo do taco, dobrado pelo ruído e cortado por fitas que giram: o mármore.
      const f = limitar((de + v * (ate - de)) / ALCANCE_DO_MARMORE + 0.22 * dobra + 0.05 * Math.sin(fase));
      let c1 = corDoDegrade(paradas, f);
      // Um fio claro onde as fitas se cruzam, como nas resinas marmorizadas.
      const fio = 1 - suave(0, 0.05, Math.abs(Math.sin(fase)));
      if (c.detalhe === 'cheio') c1 = mistura(c1, [255, 255, 255], fio * 0.1);
      poe(cor, x, y, c1);
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ teia

function teia(g: De<'teia'>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const fundo = rgb(aplicarTom(g.fundo, c.variacao.tom));
  const fio = rgb(aplicarTom(g.fio, c.variacao.tom));
  const sem = c.variacao.semente ?? 0;
  const n = voltas(g.celulas, c.variacao.escala, 1);
  const setor = TAU / g.raios;
  const raioDaTeia = 0.47;
  const passo = raioDaTeia / g.aneis;
  const meia = g.espessura;
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, 1 / n);
      const px = p.a * n;
      const py = p.b * n;
      const i0 = Math.floor(px);
      const j0 = Math.floor(py);
      // A teia mais perto: uma por célula, com o centro sorteado pela semente (os vizinhos entram para a teia que passa da borda).
      let melhor = 9;
      let dx = 0;
      let dy = 0;
      let ci = 0;
      let cj = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          const fx = i + 0.5 + 0.24 * (misturar(modulo(i, n), j, sem + 71) - 0.5);
          const fy = j + 0.5 + 0.24 * (misturar(modulo(i, n), j, sem + 72) - 0.5);
          const d = Math.hypot(px - fx, py - fy);
          if (d < melhor) {
            melhor = d;
            dx = px - fx;
            dy = py - fy;
            ci = modulo(i, n);
            cj = j;
          }
        }
      }
      const grao = 1 + 0.07 * (misturar(x, y >> 2, sem) - 0.5);
      let c1: Cor = escurece(fundo, grao);
      if (melhor < raioDaTeia) {
        const giro = misturar(ci, cj, sem + 73) * setor;
        const angulo = Math.atan2(dy, dx) - giro;
        const desdeORaio = modulo(angulo, setor);
        // O quanto este ponto está do raio mais perto, em ângulo (de 0 até meio setor): o raio e a corda entre dois raios.
        const delta = Math.min(desdeORaio, setor - desdeORaio);
        const dRaio = melhor * Math.sin(delta);
        // A espiral anda em polígono (as cordas retas entre os raios) e as cordas pendem para dentro, como o fio de verdade.
        const poligono = Math.cos(setor / 2) / Math.cos(setor / 2 - delta);
        const pendura = 1 - 0.16 * Math.sin((Math.PI * delta) / setor);
        const u = melhor / (poligono * pendura);
        const q = frac(u / passo + angulo / TAU);
        const dEspiral = Math.min(q, 1 - q) * passo * poligono * pendura;
        const d = Math.min(dRaio, dEspiral, melhor);
        const largura = meia * (1 - 0.35 * (melhor / raioDaTeia));
        const cobertura = (1 - suave(largura * 0.55, largura * 1.15, d)) * (1 - suave(raioDaTeia * 0.84, raioDaTeia, melhor));
        // O fio é redondo: mais claro no meio, mais escuro nas bordas.
        const redondo = 1.18 - 0.5 * suave(0, largura, d);
        c1 = mistura(c1, escurece(fio, redondo * grao), cobertura);
      }
      poe(cor, x, y, c1);
    }
  }
  return { cor, emissiva: null, relevo: null };
}

// ------------------------------------------------------------------------------------------------ painéis de ficção científica

/** Cada painel é 1,9× mais alto (ao longo do taco) que largo. */
const ALTURA_DO_PAINEL = 1.9;

/** 1 dentro do retângulo de meia largura `mx` e meia altura `my` centrado em (`cx`, `cy`), com a borda suave de `s`. */
const retangulo = (X: number, Y: number, cx: number, cy: number, mx: number, my: number, s = 0.018): number => 1 - suave(-s, s, Math.max(Math.abs(X - cx) - mx, Math.abs(Y - cy) - my));

function scifi(g: De<'scifi'>, c: ContextoDaTrama): ImagemGerada {
  const cor = nova(c.tamanho);
  const painel = rgb(aplicarTom(g.painel, c.variacao.tom));
  const junta = rgb(g.junta);
  const faixa = rgb(g.faixa);
  const detalhe = rgb(aplicarTom(g.detalhe, c.variacao.tom));
  const sem = c.variacao.semente ?? 0;
  const colunas = voltas(g.colunas, c.variacao.escala, 2);
  const A = ALTURA_DO_PAINEL;
  // Onde a cinta preta começa e termina em cada painel (em Y, nas unidades da largura do painel).
  const CINTA_DE = 0.55;
  const CINTA_ATE = 1.05;
  for (let y = 0; y < c.tamanho.altura; y++) {
    for (let x = 0; x < c.tamanho.largura; x++) {
      const p = ponto(x, y, c, A / colunas);
      const px = p.a * colunas;
      const py = (p.b * colunas) / A;
      const ia = Math.floor(px);
      const jb = Math.floor(py);
      const X = px - ia;
      const Y = (py - jb) * A;
      const ida = modulo(ia, colunas);
      const dasFilas = misturar(jb, 0, sem + 51);
      const h = misturar(ida, jb, sem + 52);
      const tom = 0.94 + 0.06 * misturar(ida, jb, sem + 53);
      const naBorda = Math.max(suave(0.16, 0, X), suave(0.84, 1, X), suave(0.2, 0, Y), suave(A - 0.2, A, Y));
      let c1: Cor = escurece(painel, tom * (1 - 0.08 * naBorda));
      // O sulco fino a um palmo da borda: a linha de emenda da chapa.
      const sulco = Math.max(1 - suave(0.004, 0.012, Math.abs(Math.min(X, 1 - X) - 0.1)), 1 - suave(0.004, 0.012, Math.abs(Math.min(Y, A - Y) - 0.1)));
      c1 = mistura(c1, escurece(painel, 0.74), sulco * 0.7);
      if (dasFilas < 0.34) {
        // A cinta: uma faixa preta que dá a volta no taco, com um fio laranja em cada borda e chevrons dentro.
        const Yb = Y - CINTA_DE;
        const dentro = suave(-0.012, 0.012, Yb) * suave(-0.012, 0.012, CINTA_ATE - CINTA_DE - Yb);
        c1 = mistura(c1, escurece(faixa, 1 + 0.5 * (0.5 - Yb / (CINTA_ATE - CINTA_DE))), dentro);
        const fioDeCima = 1 - suave(0.008, 0.02, Math.abs(Y - (CINTA_DE - 0.06)));
        const fioDeBaixo = 1 - suave(0.008, 0.02, Math.abs(Y - (CINTA_ATE + 0.06)));
        const chevron = (1 - suave(0.045, 0.085, Math.abs(Yb - (0.16 + 0.85 * Math.abs(X - 0.5))))) * suave(0.06, 0.1, Yb) * suave(0.06, 0.1, CINTA_ATE - CINTA_DE - Yb);
        c1 = mistura(c1, detalhe, Math.max(fioDeCima * 0.9, fioDeBaixo * 0.9, chevron * dentro));
      } else if (h < 0.3) {
        // A grade de ventilação: um retângulo laranja cortado por ranhuras escuras.
        const aberto = retangulo(X, Y, 0.4, 0.62, 0.22, 0.22);
        const ranhura = Math.max(...[0.5, 0.62, 0.74].map((yr) => 1 - suave(0.012, 0.03, Math.abs(Y - yr))));
        c1 = mistura(c1, mistura(detalhe, faixa, ranhura * 0.85), aberto);
      } else if (h < 0.55) {
        // A janela redonda: disco preto com um anel laranja em volta e uma lente clara no meio.
        const r = Math.hypot(X - 0.5, Y - 0.95);
        c1 = mistura(c1, detalhe, 1 - suave(0.015, 0.04, Math.abs(r - 0.31)));
        c1 = mistura(c1, faixa, 1 - suave(0.255, 0.285, r));
        c1 = mistura(c1, detalhe, 1 - suave(0.012, 0.032, Math.abs(r - 0.15)));
        c1 = mistura(c1, [240, 244, 248], 1 - suave(0.05, 0.075, r));
      } else if (h < 0.78) {
        // A faixa preta na diagonal com um fio laranja ao lado.
        const d = (X + 0.45 * Y - 0.78) * 0.9;
        c1 = mistura(c1, faixa, (1 - suave(0.07, 0.1, Math.abs(d))) * (1 - 0.0 * X));
        c1 = mistura(c1, detalhe, 1 - suave(0.012, 0.03, Math.abs(d - 0.15)));
      } else {
        // Três marcas laranja na ponta de baixo e uma faixa preta fina em cima.
        const marcas = Math.max(...[0.28, 0.5, 0.72].map((xm) => retangulo(X, Y, xm, A - 0.32, 0.07, 0.15)));
        c1 = mistura(c1, detalhe, marcas);
        c1 = mistura(c1, faixa, retangulo(X, Y, 0.5, 0.36, 0.34, 0.035));
      }
      // As emendas entre os painéis: preto fino, um pouco mais escuro nos cantos.
      const naJunta = Math.max(suave(0.035, 0.008, X), suave(0.965, 0.992, X), suave(0.035, 0.008, Y), suave(A - 0.035, A - 0.008, Y));
      c1 = mistura(c1, junta, naJunta);
      poe(cor, x, y, escurece(c1, 1 + 0.025 * (misturar(x, y, sem) - 0.5)));
    }
  }
  return { cor, emissiva: null, relevo: null };
}

/** A imagem de um dos acabamentos do L36 (ou da têmpera refeita); as outras tramas ficam em `tramas-do-taco.ts`. */
export function imagemDeAcabamento(gerada: TramaGerada, c: ContextoDaTrama): ImagemGerada {
  switch (gerada.tipo) {
    case 'tempera':
      return tempera(gerada, c);
    case 'veus':
      return veus(gerada, c);
    case 'fade':
      return fade(gerada, c);
    case 'fadeMarmore':
      return fadeMarmore(gerada, c);
    case 'teia':
      return teia(gerada, c);
    case 'scifi':
      return scifi(gerada, c);
    default:
      throw new Error(`trama sem acabamento: ${gerada.tipo}`);
  }
}
