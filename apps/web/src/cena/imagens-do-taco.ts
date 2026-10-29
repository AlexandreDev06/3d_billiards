import { criarRng } from '@sinuca/fisica';
import type { DesenhoDoAntebraco, Faixa, PecaDeMadeira, Punho } from './aparencia-do-taco';
import { ruidoPeriodico } from './grao';
import { SEM_VARIACAO, type VariacaoDaSemente } from './variacao-da-semente';

/**
 * As imagens das texturas do taco, geradas em código (nada de arquivo): pixels RGBA, `largura` em volta da peça (x, de 0 a 1 de
 * volta, a imagem ladrilha nessa direção) e `altura` ao longo dela (y, da ponta, v = 0, para o cabo, v = 1). Sem DOM nem three:
 * `taco.ts` as transforma em `DataTexture`.
 */
export interface ImagemRGBA {
  readonly largura: number;
  readonly altura: number;
  readonly dados: Uint8ClampedArray;
}

export interface TamanhoDaImagem {
  readonly largura: number;
  readonly altura: number;
}

type Cor = readonly [number, number, number];

const rgb = (cor: number): Cor => [(cor >> 16) & 255, (cor >> 8) & 255, cor & 255];
const mistura = (a: Cor, b: Cor, t: number): Cor => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const limitar = (x: number, de = 0, ate = 1): number => Math.min(Math.max(x, de), ate);
const frac = (x: number): number => x - Math.floor(x);
const suave = (de: number, ate: number, x: number): number => {
  const t = limitar((x - de) / (ate - de));
  return t * t * (3 - 2 * t);
};

/** Ruído de inteiros (determinístico): de 0 a 1. */
function hash(a: number, b = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function nova(t: TamanhoDaImagem): ImagemRGBA {
  const dados = new Uint8ClampedArray(t.largura * t.altura * 4);
  for (let i = 3; i < dados.length; i += 4) dados[i] = 255;
  return { largura: t.largura, altura: t.altura, dados };
}

function pixel(img: ImagemRGBA, x: number, y: number, [r, g, b]: Cor): void {
  const i = (y * img.largura + x) * 4;
  img.dados[i] = r;
  img.dados[i + 1] = g;
  img.dados[i + 2] = b;
}

/** Faz cada pixel a partir de (u, v, x, y); `u` volta, `v` vai da ponta ao cabo. */
function pintar(img: ImagemRGBA, cor: (u: number, v: number, x: number, y: number) => Cor): void {
  for (let y = 0; y < img.altura; y++) {
    const v = img.altura > 1 ? y / (img.altura - 1) : 0;
    for (let x = 0; x < img.largura; x++) pixel(img, x, y, cor(x / img.largura, v, x, y));
  }
}

/** Distância (em volta, de 0 a 0,5) entre dois pontos de `u`. */
const voltaEntre = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};

/**
 * Veio de madeira: veios compridos e anéis de crescimento ao longo da peça, poros finos. `contraste` de 0 (cor lisa) a 1 (veio forte).
 * Ladrilha em volta (u).
 */
export function imagemDeMadeira(t: TamanhoDaImagem, cor: number, contraste: number, semente: number, variacao: Pick<VariacaoDaSemente, 'rolo' | 'deslocamento' | 'escala'> = SEM_VARIACAO): ImagemRGBA {
  const rng = criarRng(semente);
  const fino = ruidoPeriodico(rng, 24);
  const largo = ruidoPeriodico(rng, 8);
  const base = rgb(cor);
  const img = nova(t);
  // A semente do taco (L35) gira o veio em volta, o corre ao longo e muda quantos anéis de crescimento a peça tem.
  const aneis = Math.max(Math.round(7 * variacao.escala), 3);
  pintar(img, (u0, v0, x, y) => {
    const u = frac(u0 + variacao.rolo);
    const v = frac(v0 * 0.07 + variacao.deslocamento) / 0.07;
    const n = 0.62 * fino(u, v * 0.07) + 0.38 * largo(u, v * 0.03);
    const anel = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * aneis + n * 2.4));
    const poro = hash(x, y) - 0.5;
    const tom = 1 + contraste * ((n - 0.5) * 1.3 + (anel - 0.5) * 0.9 + poro * 0.16);
    return [base[0] * tom, base[1] * tom, base[2] * tom];
  });
  return img;
}

/**
 * Trama de fibra de carbono (sarja 2×2): células que alternam claro e escuro em diagonal, com o brilho de cada fio. São
 * `celulasEmVolta` em volta da peça e, ao longo dela, células quadradas na peça de verdade (`proporcao` = comprimento ÷ perímetro).
 * Poucas células e muito contraste: a trama tem de aparecer a um metro, onde a haste tem 20 px de largura.
 */
export function imagemDeCarbono(t: TamanhoDaImagem, cor: number, contraste: number, celulasEmVolta = 6, proporcao = 1): ImagemRGBA {
  const base = rgb(cor);
  const celulaX = t.largura / Math.max(celulasEmVolta, 2);
  // A célula quadrada de verdade: o mesmo lado em m, que em texels de altura é (altura / proporção / largura) vezes o de largura.
  const celulaY = Math.max(celulaX * (t.altura / (Math.max(proporcao, 0.05) * t.largura)), 2);
  const img = nova(t);
  pintar(img, (_u, _v, x, y) => {
    const i = Math.floor(x / celulaX);
    const j = Math.floor(y / celulaY);
    const sobre = (i + j) % 4 < 2;
    const fx = (x / celulaX) % 1;
    const fy = (y / celulaY) % 1;
    // O fio que passa por cima brilha no meio e escurece nas bordas; o que passa por baixo é bem mais escuro.
    const forma = Math.sin(Math.PI * (sobre ? fx : fy));
    const tom = 1 + contraste * ((sobre ? 1.9 : -0.55) * (0.45 + 0.55 * forma) - 0.25 * (1 - forma));
    return [base[0] * tom, base[1] * tom, base[2] * tom];
  });
  return img;
}

/** A cor lisa, sem textura nenhuma (a base de uma peça que só leva faixas). */
export function imagemLisa(t: TamanhoDaImagem, cor: number): ImagemRGBA {
  const base = rgb(cor);
  const img = nova(t);
  pintar(img, () => base);
  return img;
}

/**
 * Pinta os anéis de `faixas` por cima de `img` (muda a imagem): cada um vai de `de` a `ate` do comprimento (v) e tem a borda de um
 * pixel de largura, nítida. Na imagem de cor entram todos (os que acendem, mais escuros: o brilho vem da emissiva); na imagem
 * que acende (`emissiva`), só os que acendem.
 */
export function pintarFaixas(img: ImagemRGBA, faixas: readonly Faixa[], emissiva = false): ImagemRGBA {
  const borda = 1.2 / Math.max(img.altura - 1, 1);
  for (const f of faixas) {
    if (emissiva && f.brilho !== true) continue;
    const base = rgb(f.cor);
    const cor: Cor = !emissiva && f.brilho === true ? [base[0] * 0.35, base[1] * 0.35, base[2] * 0.35] : base;
    pintar(img, (_u, v, x, y) => {
      const i = (y * img.largura + x) * 4;
      const atual: Cor = [img.dados[i]!, img.dados[i + 1]!, img.dados[i + 2]!];
      return mistura(atual, cor, suave(-borda, borda, Math.min(v - f.de, f.ate - v)));
    });
  }
  return img;
}

/** As imagens de uma peça que acende: a cor e o que emite (preto onde não acende). */
export interface ImagemComEmissao {
  readonly cor: ImagemRGBA;
  readonly emissiva: ImagemRGBA | null;
}

/** Meia largura (volta, de 0 a 0,5) do miolo aceso de cada linha do neon e a descida suave do brilho em volta dele. */
const MIOLO_DO_NEON = 0.03;
const BRILHO_DO_NEON = 0.035;

/**
 * As quatro linhas da haste do taco neon, ao longo dela, alternando as duas cores (ciano, magenta, ciano, magenta), grossas o
 * bastante para aparecer a um metro (6% da volta no miolo, mais a descida do brilho). `faixas` com `brilho` acendem como as linhas.
 */
export function imagemDeNeon(t: TamanhoDaImagem, cor: number, linhas: readonly [number, number], faixas: readonly Faixa[] = []): ImagemComEmissao {
  const base = rgb(cor);
  const tons = [rgb(linhas[0]), rgb(linhas[1])];
  const corImg = nova(t);
  const emissiva = nova(t);
  const forcaDe = (u: number): { readonly forca: number; readonly tom: Cor } => {
    let melhor = 0;
    let tom: Cor = tons[0]!;
    for (let k = 0; k < 4; k++) {
      const f = 1 - suave(MIOLO_DO_NEON, MIOLO_DO_NEON + BRILHO_DO_NEON, voltaEntre(u, k / 4 + 0.125));
      if (f > melhor) {
        melhor = f;
        tom = tons[k % 2]!;
      }
    }
    return { forca: melhor, tom };
  };
  pintar(corImg, (u) => {
    const { forca, tom } = forcaDe(u);
    return mistura(base, [tom[0] * 0.45, tom[1] * 0.45, tom[2] * 0.45], forca);
  });
  pintar(emissiva, (u) => {
    const { forca, tom } = forcaDe(u);
    return [tom[0] * forca, tom[1] * forca, tom[2] * forca];
  });
  pintarFaixas(corImg, faixas);
  pintarFaixas(emissiva, faixas, true);
  return { cor: corImg, emissiva };
}

/** Opções das chamas: quantas línguas em volta, a altura de cada uma (fração do comprimento da peça, a partir do cabo) e a semente. */
interface OpcoesDasChamas {
  readonly linguas: number;
  readonly alturaMin: number;
  readonly alturaMax: number;
  readonly semente: number;
  /** Quantas fileiras de chamas ao longo da peça (padrão 1): cada uma tem a raiz no lado do cabo e sobe até a seguinte. */
  readonly fileiras?: number;
}

/**
 * Uma língua de fogo na posição (u, v): de 0 a 1 de cobertura, com a borda de `borda` de largura. Ela nasce no cabo (v = 1), sobe
 * ondulando (um S) e afina até a ponta. `escala` e `fatorAltura` encolhem a língua para fazer as camadas de dentro.
 */
function lingua(u: number, v: number, j: number, fileira: number, o: OpcoesDasChamas, escala: number, fatorAltura: number, borda: number): number {
  const n = o.linguas;
  const k = ((j % n) + n) % n;
  const altura = (o.alturaMin + (o.alturaMax - o.alturaMin) * hash(k + 17 * fileira, o.semente)) * fatorAltura;
  const s = (1 - v) / altura; // 0 na raiz, 1 na ponta da língua
  if (s >= 1) return 0;
  const sentido = hash(k, o.semente + 3) < 0.5 ? -1 : 1;
  const deslocada = (k + 0.5 + (fileira % 2) * 0.5) / n;
  const centro = deslocada + ((sentido * 0.22) / n) * Math.sin(s * 5.2 + k * 2.1) * s;
  let d = u - centro;
  d -= Math.round(d);
  const meia = (0.5 / n) * 1.12 * escala * (1 - s ** 1.25);
  return suave(-borda, borda, meia - Math.abs(d));
}

/**
 * Pinta chamas de verdade por cima de `img`: línguas que sobem do cabo (v = 1) ondulando e afinando até a ponta, em três camadas
 * de bordas nítidas — vermelha por fora (`cores[1]`), laranja no meio e amarela no coração (`cores[0]`).
 */
export function pintarChamas(img: ImagemRGBA, cores: readonly [number, number], o: OpcoesDasChamas): ImagemRGBA {
  const quente = rgb(cores[0]);
  const fria = rgb(cores[1]);
  const laranja = mistura(fria, quente, 0.62);
  const coracao = mistura(quente, [255, 246, 200], 0.55);
  const borda = 1.3 / img.largura;
  const n = o.linguas;
  const fileiras = Math.max(o.fileiras ?? 1, 1);
  pintar(img, (u, v, x, y) => {
    const i = (y * img.largura + x) * 4;
    let c: Cor = [img.dados[i]!, img.dados[i + 1]!, img.dados[i + 2]!];
    const j0 = Math.floor(u * n);
    // A fileira em que o pixel está e a posição nela (0 = a ponta de cima, 1 = a raiz, no lado do cabo).
    const fileira = Math.min(Math.floor(v * fileiras), fileiras - 1);
    const vLocal = v * fileiras - fileira;
    let fora = 0;
    let meio = 0;
    let dentro = 0;
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      fora = Math.max(fora, lingua(u, vLocal, j, fileira, o, 1, 1, borda));
      meio = Math.max(meio, lingua(u, vLocal, j, fileira, o, 0.68, 0.82, borda));
      dentro = Math.max(dentro, lingua(u, vLocal, j, fileira, o, 0.34, 0.6, borda));
    }
    c = mistura(c, fria, fora);
    c = mistura(c, laranja, meio);
    c = mistura(c, coracao, dentro);
    return c;
  });
  return img;
}

/**
 * O antebraço: a madeira de base (com o veio dela) e o desenho por cima. `bicos`: `quantidade` pontas de outra madeira que sobem do
 * punho (o fim da imagem, v = 1) e afinam até um bico. `chamas`: línguas que sobem do punho, claras na raiz e escuras na ponta.
 * `linhas`: faixas e anéis neon. A emissiva só existe nas linhas.
 */
export function imagemDoAntebraco(t: TamanhoDaImagem, base: PecaDeMadeira, desenho: DesenhoDoAntebraco, semente: number, proporcao = 1, variacao: Pick<VariacaoDaSemente, 'rolo' | 'deslocamento' | 'escala'> = SEM_VARIACAO): ImagemComEmissao {
  const fundo =
    base.trama === 'carbono' ? imagemDeCarbono(t, base.cor, base.contraste, 6, proporcao) : base.trama === 'lisa' ? imagemLisa(t, base.cor) : imagemDeMadeira(t, base.cor, base.contraste, semente, variacao);
  const img = nova(t);
  const lado = t.largura;
  if (desenho.tipo === 'bicos') {
    // Bicos de bordas nítidas: a outra madeira, lisa e clara, contra o fundo escuro (alto contraste, sem degradê).
    const claro = imagemDeMadeira(t, desenho.cor, 0.06, semente + 7);
    const n = Math.max(desenho.quantidade, 1);
    const meia = (0.5 / n) * 0.92;
    const ponta = 0.3; // o bico acaba a 70% do comprimento, contado do punho
    const borda = 1.1 / lado;
    const bordaAoLongo = 1.1 / t.altura;
    pintar(img, (u, v, x, y) => {
      const k = Math.round(u * n - 0.5);
      const d = voltaEntre(u, (((k % n) + n) % n + 0.5) / n);
      const aprumo = limitar((v - ponta) / (1 - ponta));
      const largura = meia * aprumo;
      const dentro = suave(-borda, borda, largura - d) * suave(0, bordaAoLongo, v - ponta);
      const i = (y * lado + x) * 4;
      const f = fundo.dados;
      const c = claro.dados;
      return [f[i]! + (c[i]! - f[i]!) * dentro, f[i + 1]! + (c[i + 1]! - f[i + 1]!) * dentro, f[i + 2]! + (c[i + 2]! - f[i + 2]!) * dentro];
    });
    return { cor: img, emissiva: null };
  }
  if (desenho.tipo === 'chamas') {
    img.dados.set(fundo.dados);
    pintarChamas(img, desenho.cores, { linguas: 6, alturaMin: 0.5, alturaMax: 0.98, semente });
    return { cor: img, emissiva: null };
  }
  if (desenho.tipo === 'linhas') {
    const [a, b] = [rgb(desenho.cores[0]), rgb(desenho.cores[1])];
    const preto = rgb(base.cor);
    const emissiva = nova(t);
    const fino = 3.2 / lado;
    const fx = (tom: Cor, forca: number): Cor => [tom[0] * forca, tom[1] * forca, tom[2] * forca];
    const linha = (u: number, v: number): Cor => {
      // Quatro faixas ao longo (ciano, magenta, ciano, magenta) e três anéis (ciano, magenta, ciano).
      let forca = 0;
      let tom: Cor = a;
      for (let k = 0; k < 4; k++) {
        const f = 1 - suave(fino * 0.5, fino * 1.5, voltaEntre(u, k / 4 + 0.125));
        if (f > forca) {
          forca = f;
          tom = k % 2 === 0 ? a : b;
        }
      }
      for (let k = 0; k < 3; k++) {
        const f = 1 - suave(0.012, 0.03, Math.abs(v - (0.1 + 0.4 * k)));
        if (f > forca) {
          forca = f;
          tom = k % 2 === 0 ? a : b;
        }
      }
      return fx(tom, forca);
    };
    pintar(emissiva, linha);
    pintar(img, (u, v) => mistura(preto, linha(u, v), 0.35));
    return { cor: img, emissiva };
  }
  return { cor: fundo, emissiva: null };
}

/** O relevo de um campo de altura em mapa de normais (RGBA, espaço da tangente), com volta em x e sem volta em y. */
function normaisDoRelevo(altura: Float32Array, largura: number, alturaImg: number, forca: number): ImagemRGBA {
  const img = nova({ largura, altura: alturaImg });
  const h = (x: number, y: number): number => altura[limitar(y, 0, alturaImg - 1) * largura + ((x + largura) % largura)]!;
  for (let y = 0; y < alturaImg; y++) {
    for (let x = 0; x < largura; x++) {
      const nx = (h(x - 1, y) - h(x + 1, y)) * forca;
      const ny = (h(x, y + 1) - h(x, y - 1)) * forca;
      const norma = Math.hypot(nx, ny, 1);
      pixel(img, x, y, [((nx / norma) * 0.5 + 0.5) * 255, ((ny / norma) * 0.5 + 0.5) * 255, ((1 / norma) * 0.5 + 0.5) * 255]);
    }
  }
  return img;
}

/**
 * O punho: a cor (com a trama do fio) e o relevo em mapa de normais. `linho`: fio enrolado em diagonal e cruzado, relevo forte;
 * `couro`: tira enrolada, relevo suave; `borracha`: estrias em anel. A faixa (se houver) é um anel no meio.
 */
export function imagemDoPunho(t: TamanhoDaImagem, punho: Punho, semente: number): { readonly cor: ImagemRGBA; readonly relevo: ImagemRGBA } {
  const base = rgb(punho.cor);
  const faixa = punho.faixa === undefined ? null : rgb(punho.faixa);
  const rng = criarRng(semente);
  const mancha = ruidoPeriodico(rng, 12);
  const altura = new Float32Array(t.largura * t.altura);
  const cor = nova(t);
  const voltas = punho.material === 'linho' ? 24 : punho.material === 'couro' ? 14 : 0;
  const passo = punho.material === 'linho' ? 71 : 41;
  for (let y = 0; y < t.altura; y++) {
    const v = y / (t.altura - 1);
    for (let x = 0; x < t.largura; x++) {
      const u = x / t.largura;
      let h: number;
      let tom: number;
      if (punho.material === 'borracha') {
        // Estrias em anel (40 ao longo do punho) e uma granulação miúda.
        const estria = 0.5 + 0.5 * Math.cos(2 * Math.PI * 40 * v);
        h = 0.15 + 0.75 * suave(0.15, 0.85, estria) + 0.1 * (hash(x, y) - 0.5);
        tom = 0.85 + 0.3 * h;
      } else {
        const diagonal = 0.5 + 0.5 * Math.sin(2 * Math.PI * (voltas * u + passo * v));
        const cruzado = 0.5 + 0.5 * Math.sin(2 * Math.PI * (voltas * u - passo * v));
        const trama = punho.material === 'linho' ? 0.62 * diagonal + 0.38 * cruzado : diagonal;
        h = trama * (punho.material === 'linho' ? 1 : 0.55) + 0.18 * mancha(u, v * 0.5);
        tom = 0.78 + 0.3 * trama + 0.12 * (mancha(u, v * 0.5) - 0.5) + 0.06 * (hash(x, y) - 0.5);
      }
      altura[y * t.largura + x] = h;
      const naFaixa = faixa ? 1 - suave(0.015, 0.03, Math.abs(v - 0.5) - 0.07) : 0;
      const c = mistura(base, faixa ?? base, naFaixa);
      pixel(cor, x, y, [c[0] * tom, c[1] * tom, c[2] * tom]);
    }
  }
  const forca = punho.material === 'linho' ? 3.2 : punho.material === 'couro' ? 1.6 : 2.4;
  return { cor, relevo: normaisDoRelevo(altura, t.largura, t.altura, forca) };
}
