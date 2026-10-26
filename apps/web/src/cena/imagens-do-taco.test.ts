import { describe, expect, it } from 'vitest';
import { APARENCIAS_DO_TACO } from './aparencia-do-taco';
import { imagemDeCarbono, imagemDeMadeira, imagemDeNeon, imagemDoAntebraco, imagemDoPunho, imagemLisa, pintarChamas, pintarFaixas, type ImagemRGBA } from './imagens-do-taco';

const T = { largura: 64, altura: 128 };
const px = (img: ImagemRGBA, x: number, y: number): number[] => {
  const i = (y * img.largura + x) * 4;
  return [img.dados[i]!, img.dados[i + 1]!, img.dados[i + 2]!];
};
const media = (img: ImagemRGBA): number[] => {
  const soma = [0, 0, 0];
  for (let i = 0; i < img.dados.length; i += 4) for (let c = 0; c < 3; c++) soma[c]! += img.dados[i + c]!;
  return soma.map((s) => s / (img.largura * img.altura));
};
/** A diferença média entre a coluna 0 e a última (a imagem tem de ladrilhar em volta: seus lados vizinhos são parecidos). */
const emenda = (img: ImagemRGBA): number => {
  let d = 0;
  for (let y = 0; y < img.altura; y++) for (let c = 0; c < 3; c++) d += Math.abs(px(img, 0, y)[c]! - px(img, img.largura - 1, y)[c]!);
  return d / (img.altura * 3);
};

describe('imagens do taco', () => {
  it('a madeira tem o tamanho pedido, é opaca e tem a cor de base (média perto dela)', () => {
    const img = imagemDeMadeira(T, 0xe4c68c, 0.35, 1);
    expect(img.largura).toBe(64);
    expect(img.altura).toBe(128);
    expect(img.dados.length).toBe(64 * 128 * 4);
    for (let i = 3; i < img.dados.length; i += 4) expect(img.dados[i]).toBe(255);
    const [r, g, b] = media(img);
    expect(r).toBeGreaterThan(0xe4 * 0.8);
    expect(r).toBeLessThan(255);
    expect(g).toBeGreaterThan(0xc6 * 0.75);
    expect(b).toBeGreaterThan(0x8c * 0.7);
  });

  it('a mesma semente dá a mesma imagem; outra semente, outra', () => {
    expect(imagemDeMadeira(T, 0xe4c68c, 0.35, 5).dados).toEqual(imagemDeMadeira(T, 0xe4c68c, 0.35, 5).dados);
    expect(imagemDeMadeira(T, 0xe4c68c, 0.35, 5).dados).not.toEqual(imagemDeMadeira(T, 0xe4c68c, 0.35, 6).dados);
  });

  it('o veio varia o tom com o contraste e fica liso sem ele (só poros); ladrilha em volta', () => {
    const variacao = (img: ImagemRGBA): number => {
      let soma = 0;
      for (let y = 0; y < img.altura; y++) for (let x = 1; x < img.largura; x++) soma += Math.abs(px(img, x, y)[0]! - px(img, x - 1, y)[0]!);
      return soma / (img.altura * img.largura);
    };
    expect(variacao(imagemDeMadeira(T, 0xe4c68c, 0.6, 1))).toBeGreaterThan(variacao(imagemDeMadeira(T, 0xe4c68c, 0, 1)) * 3);
    const madeira = imagemDeMadeira({ largura: 128, altura: 128 }, 0xe4c68c, 0.5, 3);
    expect(emenda(madeira)).toBeLessThan(variacao(madeira) * 3);
  });

  it('o carbono alterna células claras e escuras em diagonal, com contraste para aparecer a um metro', () => {
    const img = imagemDeCarbono({ largura: 64, altura: 64 }, 0x1c1d20, 0.9, 4);
    const vermelhos: number[] = [];
    for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x += 2) vermelhos.push(px(img, x, y)[0]!);
    // Escuro, mas com células que passam por cima (bem mais claras) e por baixo (mais escuras).
    expect(Math.max(...vermelhos) - Math.min(...vermelhos)).toBeGreaterThan(40);
    expect(Math.max(...vermelhos)).toBeLessThan(140);
  });

  it('o carbono tem as células quadradas na peça de verdade: numa peça comprida elas são mais baixas na imagem', () => {
    const T2 = { largura: 64, altura: 256 };
    const transicoes = (proporcao: number): number => {
      const img = imagemDeCarbono(T2, 0x1c1d20, 0.9, 4, proporcao);
      let n = 0;
      for (let y = 1; y < T2.altura; y++) if (Math.abs(px(img, 8, y)[0]! - px(img, 8, y - 1)[0]!) > 25) n++;
      return n;
    };
    expect(transicoes(15)).toBeGreaterThan(transicoes(4) * 1.5);
  });

  it('as faixas: um anel de cor chapada de `de` a `ate`, com a borda nítida (um pixel), e só nas linhas pedidas', () => {
    const img = pintarFaixas(imagemLisa({ largura: 32, altura: 101 }, 0x101010), [{ de: 0.4, ate: 0.5, cor: 0xff0000 }]);
    expect(px(img, 5, 45)).toEqual([255, 0, 0]);
    expect(px(img, 30, 45)).toEqual([255, 0, 0]); // em volta toda
    expect(px(img, 5, 30)).toEqual([16, 16, 16]);
    expect(px(img, 5, 60)).toEqual([16, 16, 16]);
    const intermediarias = [...Array(101).keys()].filter((y) => {
      const r = px(img, 5, y)[0]!;
      return r > 20 && r < 250;
    });
    expect(intermediarias.length).toBeLessThanOrEqual(4); // borda de ~1 px nos dois lados
  });

  it('a faixa que acende só entra na imagem emissiva (e na de cor, mais escura)', () => {
    const faixas = [{ de: 0.2, ate: 0.3, cor: 0x00ffff, brilho: true }, { de: 0.6, ate: 0.7, cor: 0xffffff }];
    const acesa = pintarFaixas(imagemLisa({ largura: 16, altura: 101 }, 0x000000), faixas, true);
    expect(px(acesa, 3, 25)).toEqual([0, 255, 255]);
    expect(px(acesa, 3, 65)).toEqual([0, 0, 0]);
    const cor = pintarFaixas(imagemLisa({ largura: 16, altura: 101 }, 0x000000), faixas);
    expect(px(cor, 3, 65)).toEqual([255, 255, 255]);
    expect(px(cor, 3, 25)[1]).toBeLessThan(140);
    expect(px(cor, 3, 25)[1]).toBeGreaterThan(40);
  });

  it('as chamas: línguas de bordas nítidas em três camadas (vermelho por fora, laranja, amarelo no coração) subindo da raiz', () => {
    const img = pintarChamas(imagemLisa({ largura: 128, altura: 128 }, 0x050505), [0xffc23a, 0xd8200f], { linguas: 4, alturaMin: 0.8, alturaMax: 0.9, semente: 3 });
    const verm = (x: number, y: number): number => px(img, x, y)[0]!;
    // Perto da raiz (última linha) há fogo em volta toda; perto da ponta (primeiras linhas) é preto.
    let fogoNaRaiz = 0;
    for (let x = 0; x < 128; x++) if (verm(x, 124) > 100) fogoNaRaiz++;
    expect(fogoNaRaiz).toBeGreaterThan(80);
    let fogoNaPonta = 0;
    for (let x = 0; x < 128; x++) if (verm(x, 4) > 100) fogoNaPonta++;
    expect(fogoNaPonta).toBe(0);
    // As três camadas aparecem: tons de vermelho escuro, laranja e amarelo claro (azul alto só no coração).
    const tons = new Set<string>();
    for (let y = 60; y < 128; y += 2) for (let x = 0; x < 128; x += 2) {
      const [r, g, b] = px(img, x, y);
      if (r! > 150) tons.add(b! > 90 ? 'coracao' : g! > 90 ? 'laranja' : 'vermelho');
    }
    expect([...tons].sort()).toEqual(['coracao', 'laranja', 'vermelho']);
  });

  it('as fileiras de chamas repetem a língua ao longo da peça (cada fileira com a raiz no lado do cabo)', () => {
    const img = pintarChamas(imagemLisa({ largura: 64, altura: 256 }, 0x050505), [0xffc23a, 0xd8200f], { linguas: 4, alturaMin: 0.6, alturaMax: 0.9, semente: 2, fileiras: 4 });
    const fogo = (y: number): number => {
      let n = 0;
      for (let x = 0; x < 64; x++) if (px(img, x, y)[0]! > 100) n++;
      return n;
    };
    // O fim de cada fileira (a raiz) é fogo corrido; o começo (a ponta) é quase todo preto: o padrão se repete 4 vezes.
    for (let f = 0; f < 4; f++) {
      expect(fogo(f * 64 + 62)).toBeGreaterThan(fogo(f * 64 + 2) + 20);
    }
  });

  it('o neon: a cor é escura e a emissiva acende em quatro linhas grossas (6% da volta no miolo), ciano e magenta alternados', () => {
    const { cor, emissiva } = imagemDeNeon({ largura: 128, altura: 32 }, 0x0d0d10, [0x19f0ff, 0xff2bd6]);
    expect(media(cor).every((c) => c < 60)).toBe(true);
    const e = emissiva!;
    const acesos = [...Array(128).keys()].filter((x) => px(e, x, 5).some((c) => c > 200));
    expect(acesos.length).toBeGreaterThan(4 * 5);
    expect(acesos.length).toBeLessThan(4 * 14);
    // As quatro linhas: em 1/8, 3/8, 5/8 e 7/8 da volta, alternando as cores.
    const linha = (k: number): number[] => px(e, Math.round(128 * (k / 4 + 0.125)), 5);
    expect(linha(0)[2]).toBeGreaterThan(linha(0)[0]!);
    expect(linha(1)[0]).toBeGreaterThan(linha(1)[1]!);
    expect(linha(2)[2]).toBeGreaterThan(linha(2)[0]!);
    expect(linha(3)[0]).toBeGreaterThan(linha(3)[1]!);
    // Entre as linhas, escuro.
    expect(px(e, 0, 5).every((c) => c < 10)).toBe(true);
  });

  it('o neon leva as faixas que acendem: na cor (escura) e na emissiva (cheia)', () => {
    const { cor, emissiva } = imagemDeNeon({ largura: 64, altura: 101 }, 0x0d0d10, [0x19f0ff, 0xff2bd6], [{ de: 0.4, ate: 0.5, cor: 0xff2bd6, brilho: true }]);
    expect(px(emissiva!, 0, 45)).toEqual([255, 43, 214]);
    expect(px(cor, 0, 45)[0]).toBeLessThan(140);
  });

  const A = { largura: 128, altura: 128 };

  it('o antebraço com bicos: 4 pontas da outra madeira que sobem do punho (v = 1) e afinam até um bico', () => {
    const a = APARENCIAS_DO_TACO.classico.antebraco;
    const { cor, emissiva } = imagemDoAntebraco(A, a.base, a.desenho, 9);
    expect(emissiva).toBeNull();
    const claro = (x: number, y: number): boolean => px(cor, x, y)[0]! > 150;
    // Perto do punho (última linha) há 4 trechos claros em volta; perto do começo, nenhum.
    const trechos = (y: number): number => {
      let n = 0;
      for (let x = 0; x < A.largura; x++) if (claro(x, y) && !claro((x + A.largura - 1) % A.largura, y)) n++;
      return n;
    };
    expect(trechos(A.altura - 2)).toBe(4);
    expect(trechos(2)).toBe(0);
    // Bordas nítidas: do escuro ao claro sem tom intermediário (no máximo um pixel de meio-tom por contorno), não um degradê.
    let meioTom = 0;
    for (let x = 0; x < A.largura; x++) {
      const r = px(cor, x, A.altura - 2)[0]!;
      if (r > 100 && r < 190) meioTom++;
    }
    expect(meioTom).toBeLessThanOrEqual(4);
    // Largura do bico diminui rumo à ponta.
    const largura = (y: number): number => [...Array(A.largura).keys()].filter((x) => claro(x, y)).length;
    expect(largura(A.altura - 2)).toBeGreaterThan(largura(Math.round(A.altura * 0.75)));
    expect(largura(Math.round(A.altura * 0.75))).toBeGreaterThan(0);
  });

  it('o antebraço de chamas: preto na ponta, chamas laranja e vermelhas subindo do punho; neon: emissiva só nas linhas', () => {
    const c = APARENCIAS_DO_TACO.chamas.antebraco;
    const chamas = imagemDoAntebraco(A, c.base, c.desenho, 4);
    expect(chamas.emissiva).toBeNull();
    const linhaDoPunho = media({ ...chamas.cor, altura: 1, dados: chamas.cor.dados.slice((A.altura - 2) * A.largura * 4, (A.altura - 1) * A.largura * 4) });
    const linhaDaPonta = media({ ...chamas.cor, altura: 1, dados: chamas.cor.dados.slice(2 * A.largura * 4, 3 * A.largura * 4) });
    expect(linhaDoPunho[0]).toBeGreaterThan(linhaDaPonta[0]! + 40);
    expect(linhaDoPunho[0]).toBeGreaterThan(linhaDoPunho[2]! + 40); // quente: vermelho e laranja, pouco azul
    const n = APARENCIAS_DO_TACO.neon.antebraco;
    const neon = imagemDoAntebraco(A, n.base, n.desenho, 4);
    expect(neon.emissiva).not.toBeNull();
    expect(media(neon.emissiva!).some((v) => v > 2)).toBe(true);
    expect(media(neon.cor).every((v) => v < 80)).toBe(true);
  });

  it('o punho de linho tem trama e relevo (normais saem do plano); a faixa do boteco é um anel de outra cor; a borracha tem estrias', () => {
    const linho = imagemDoPunho(A, APARENCIAS_DO_TACO.classico.punho, 2);
    // O mapa de normais: azul domina (normal para fora), com variação em x e y.
    const [mr, mg, mb] = media(linho.relevo);
    expect(mb).toBeGreaterThan(mr! + 30);
    expect(mb).toBeGreaterThan(mg! + 30);
    let diferentes = 0;
    for (let x = 1; x < A.largura; x++) if (px(linho.relevo, x, 10)[0] !== px(linho.relevo, x - 1, 10)[0]) diferentes++;
    expect(diferentes).toBeGreaterThan(A.largura / 4);

    const boteco = imagemDoPunho(A, APARENCIAS_DO_TACO.boteco.punho, 2).cor;
    const meio = px(boteco, 10, Math.round(A.altura / 2));
    const fora = px(boteco, 10, 8);
    expect(meio[0]).toBeGreaterThan(meio[1]! + 40); // vermelho no anel
    expect(fora[1]).toBeGreaterThan(fora[0]! * 0.7); // branco fora dele

    const borracha = imagemDoPunho(A, APARENCIAS_DO_TACO.carbono.punho, 2);
    let estrias = 0;
    for (let y = 1; y < A.altura; y++) if (Math.abs(px(borracha.relevo, 20, y)[1]! - px(borracha.relevo, 20, y - 1)[1]!) > 6) estrias++;
    expect(estrias).toBeGreaterThan(10);
  });
});
