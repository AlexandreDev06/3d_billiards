import { TACO } from '@sinuca/fisica';
import { SKINS_DE_TACO, padraoDaSemente, type SkinTaco } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { APARENCIAS_DO_TACO, aparenciaDoTaco } from '../cena/aparencia-do-taco';
import type { ImagemRGBA } from '../cena/imagens-do-taco';
import { arquivosPintados, corCss, imagensDaMiniatura, miniaturaDoTaco, misturarCores, pintadaNaMalha, vistaLateralDaImagem } from './miniatura-do-taco-modelo';

const plano = (skin: keyof typeof APARENCIAS_DO_TACO) => miniaturaDoTaco(APARENCIAS_DO_TACO[skin], TACO);
const peca = (skin: keyof typeof APARENCIAS_DO_TACO, nome: string) => plano(skin).pecas.find((p) => p.nome === nome)!;

describe('corCss', () => {
  it('0xRRGGBB vira #rrggbb com os zeros à esquerda', () => {
    expect(corCss(0xf2c230)).toBe('#f2c230');
    expect(corCss(0x090c13)).toBe('#090c13');
    expect(corCss(0)).toBe('#000000');
  });
});

describe('misturarCores', () => {
  it('0 devolve a primeira, 1 a segunda, e o meio é a média por canal', () => {
    expect(misturarCores('#102030', '#ffffff', 0)).toBe('#102030');
    expect(misturarCores('#102030', '#ffffff', 1)).toBe('#ffffff');
    expect(misturarCores('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('o peso fora de 0 a 1 é limitado, em vez de sair da faixa de cor', () => {
    expect(misturarCores('#102030', '#ffffff', 2)).toBe('#ffffff');
    expect(misturarCores('#102030', '#ffffff', -1)).toBe('#102030');
  });
});

describe('miniaturaDoTaco: as peças', () => {
  it('são as nove do taco, de ponta a cabo sem buraco, em frações do comprimento', () => {
    const { pecas } = plano('classico');
    expect(pecas.map((p) => p.nome)).toEqual(['sola', 'virola', 'haste', 'junta', 'antebraco', 'punho', 'anel', 'base', 'borracha']);
    expect(pecas[0]!.de).toBe(0);
    expect(pecas.at(-1)!.ate).toBeCloseTo(1, 9);
    for (let i = 1; i < pecas.length; i++) expect(pecas[i]!.de).toBeCloseTo(pecas[i - 1]!.ate, 9);
  });

  it('o raio vai de 0 a 1 do maior do desenho, e o cabo é mais grosso que a ponta', () => {
    const { pecas } = plano('classico');
    const raios = pecas.flatMap((p) => [p.raioDe, p.raioAte]);
    expect(Math.min(...raios)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...raios)).toBeCloseTo(1, 9);
    expect(peca('classico', 'base').raioDe).toBeGreaterThan(peca('classico', 'virola').raioDe * 1.8);
  });

  it('as cores são as da aparência: a sola é o azul do giz, o resto vem de cada peça', () => {
    const a = APARENCIAS_DO_TACO.ouro;
    expect(peca('ouro', 'sola').cor).toBe(corCss(a.ponta.giz));
    expect(peca('ouro', 'haste').cor).toBe(corCss(a.haste.cor));
    expect(peca('ouro', 'punho').cor).toBe(corCss(a.punho.cor));
    expect(peca('ouro', 'borracha').cor).toBe(corCss(a.borracha.cor));
    expect(peca('ouro', 'haste').metal).toBe(true);
    expect(peca('classico', 'haste').metal).toBe(false);
  });

  it('a trama da madeira, do carbono e do neon chega ao desenho; peça lisa não tem trama', () => {
    expect(peca('carbono', 'haste').trama).toBe('carbono');
    expect(peca('neon', 'haste').trama).toBe('neon');
    expect(peca('classico', 'haste').trama).toBe('veio');
    expect(peca('classico', 'virola').trama).toBe('lisa');
  });

  it('as peças que acendem levam a cor do brilho; as outras não', () => {
    expect(peca('neon', 'virola').brilho).toBe('#19f0ff');
    expect(peca('neon', 'anel').brilho).toBe('#ff2bd6');
    expect(peca('classico', 'virola').brilho).toBeNull();
  });
});

describe('miniaturaDoTaco: os detalhes', () => {
  it('os anéis pintados caem dentro da peça, na posição que a aparência manda (fração da peça → do taco)', () => {
    const { detalhes } = plano('carbono');
    const haste = peca('carbono', 'haste');
    const aneis = detalhes.filter((d) => d.tipo === 'faixa');
    expect(aneis).toHaveLength(2);
    expect(aneis[0]).toMatchObject({ cor: '#e0261c', brilho: false });
    expect(aneis[0]!.de).toBeCloseTo(haste.de + 0.36 * (haste.ate - haste.de), 9);
    expect(aneis[0]!.ate).toBeCloseTo(haste.de + 0.4 * (haste.ate - haste.de), 9);
    for (const a of aneis) {
      expect(a.de).toBeGreaterThanOrEqual(haste.de);
      expect(a.ate).toBeLessThanOrEqual(haste.ate);
    }
  });

  it('o neon acende os anéis (brilho) e põe as duas linhas ao longo da haste', () => {
    const { detalhes } = plano('neon');
    expect(detalhes.filter((d) => d.tipo === 'faixa').map((d) => d.brilho)).toEqual([true, true]);
    const haste = peca('neon', 'haste');
    expect(detalhes).toContainEqual({ tipo: 'linhas', de: haste.de, ate: haste.ate, cores: ['#19f0ff', '#ff2bd6'] });
  });

  it('o antebraço: bicos (clássico), chamas, linhas (neon) ou nada (liso)', () => {
    const antebraco = (skin: keyof typeof APARENCIAS_DO_TACO) => {
      const p = peca(skin, 'antebraco');
      return plano(skin).detalhes.filter((d) => d.de >= p.de - 1e-9 && d.ate <= p.ate + 1e-9 && d.tipo !== 'faixa');
    };
    expect(antebraco('classico')).toEqual([{ tipo: 'bicos', de: peca('classico', 'antebraco').de, ate: peca('classico', 'antebraco').ate, cor: '#f4e6bf', quantidade: 4 }]);
    expect(antebraco('chamas')[0]).toMatchObject({ tipo: 'chamas', cores: ['#ffc23a', '#d8200f'] });
    expect(antebraco('neon')[0]).toMatchObject({ tipo: 'linhas', cores: ['#19f0ff', '#ff2bd6'] });
    expect(antebraco('carbono')).toEqual([]);
  });

  it('a haste de chamas leva as chamas ao longo dela', () => {
    const haste = peca('chamas', 'haste');
    expect(plano('chamas').detalhes).toContainEqual({ tipo: 'chamas', de: haste.de, ate: haste.ate, cores: ['#ffc23a', '#d8200f'] });
  });

  it('a faixa do punho vira um anel no meio dele', () => {
    const punho = peca('boteco', 'punho');
    const anel = plano('boteco').detalhes.find((d) => d.tipo === 'faixa' && d.de >= punho.de && d.ate <= punho.ate);
    expect(anel).toMatchObject({ cor: '#c8261e' });
    expect((anel!.de + anel!.ate) / 2).toBeCloseTo((punho.de + punho.ate) / 2, 6);
    expect(plano('classico').detalhes.some((d) => d.tipo === 'faixa')).toBe(false);
  });

  it('só o neon tem halo, com as duas cores', () => {
    expect(plano('neon').halo).toEqual({ cores: ['#19f0ff', '#ff2bd6'], intensidade: 0.55 });
    expect(plano('ouro').halo).toBeNull();
  });
});

describe('miniaturaDoTaco: o catálogo inteiro', () => {
  it('cada skin do catálogo monta um plano com cores css válidas e frações dentro do taco', () => {
    const css = /^#[0-9a-f]{6}$/;
    for (const { id } of SKINS_DE_TACO) {
      const p = plano(id);
      expect(p.pecas, id).toHaveLength(9);
      for (const x of p.pecas) {
        expect(x.cor, `${id} ${x.nome}`).toMatch(css);
        if (x.brilho !== null) expect(x.brilho).toMatch(css);
      }
      for (const d of p.detalhes) {
        expect(d.de, id).toBeGreaterThanOrEqual(0);
        expect(d.ate, id).toBeLessThanOrEqual(1 + 1e-9);
        expect(d.ate, id).toBeGreaterThan(d.de);
      }
    }
  });
});

const imagem = (largura: number, altura: number, cor: (x: number, y: number) => readonly [number, number, number]): ImagemRGBA => {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [r, g, b] = cor(x, y);
      dados.set([r, g, b, 255], (y * largura + x) * 4);
    }
  }
  return { largura, altura, dados };
};
const pixel = (i: ImagemRGBA, x: number, y: number): number[] => [...i.dados.slice((y * i.largura + x) * 4, (y * i.largura + x) * 4 + 3)];

describe('imagensDaMiniatura (L35)', () => {
  it('traz as imagens que o taco desenharia, em metade do tamanho', () => {
    const imagens = imagensDaMiniatura(aparenciaDoTaco('tempera', 44), TACO);
    for (const parte of ['haste', 'antebraco'] as const) {
      expect(imagens[parte], parte).toBeDefined();
      expect(imagens[parte]!.dados).toHaveLength(imagens[parte]!.largura * imagens[parte]!.altura * 4);
    }
    expect(imagens.haste!.largura).toBe(64);
    expect(imagens.haste!.altura).toBe(256);
  });

  it('é determinística: a mesma semente dá os mesmos pixels, e outra semente dá outros', () => {
    const a = imagensDaMiniatura(aparenciaDoTaco('resina-marmorizada', 10), TACO).haste!;
    const b = imagensDaMiniatura(aparenciaDoTaco('resina-marmorizada', 10), TACO).haste!;
    const c = imagensDaMiniatura(aparenciaDoTaco('resina-marmorizada', 11), TACO).haste!;
    expect(Buffer.from(a.dados).equals(Buffer.from(b.dados))).toBe(true);
    expect(Buffer.from(a.dados).equals(Buffer.from(c.dados))).toBe(false);
  });

  it('a Blue Gem da Têmpera é azul: o azul domina o vermelho na haste, e a Têmpera comum não', () => {
    const media = (i: ImagemRGBA): number[] => {
      const soma = [0, 0, 0];
      for (let k = 0; k < i.dados.length; k += 4) for (let c = 0; c < 3; c++) soma[c]! += i.dados[k + c]!;
      return soma.map((v) => v / (i.dados.length / 4));
    };
    const blue = Array.from({ length: 1000 }, (_, i) => i).find((i) => padraoDaSemente('tempera', i)?.selo === 'BLUE GEM')!;
    const comum = Array.from({ length: 1000 }, (_, i) => i).find((i) => padraoDaSemente('tempera', i) === null || padraoDaSemente('tempera', i)?.rara !== true)!;
    const [r, g, b] = media(imagensDaMiniatura(aparenciaDoTaco('tempera', blue), TACO).haste!);
    expect(b!).toBeGreaterThan(r! * 1.8);
    expect(b!).toBeGreaterThan(g!);
    const [r2, , b2] = media(imagensDaMiniatura(aparenciaDoTaco('tempera', comum), TACO).haste!);
    expect(b2!).toBeLessThan(r2! * 1.8);
  });
});

describe('arquivosPintados (L35)', () => {
  it('as skins geradas por código não têm arte pintada', () => {
    for (const skin of ['classico', 'neon', 'tempera', 'obsidiana']) expect(arquivosPintados(aparenciaDoTaco(skin)), skin).toEqual([]);
  });

  it('Coral só pinta o antebraço; Dragon Lore, a haste, o antebraço e a base; Howl, a haste, o antebraço e o punho', () => {
    expect(arquivosPintados(aparenciaDoTaco('coral'))).toEqual([{ parte: 'antebraco', arquivo: 'coral-antebraco.png' }]);
    expect(arquivosPintados(aparenciaDoTaco('dragao-das-quinze')).map((p) => p.parte)).toEqual(['haste', 'antebraco', 'base']);
    expect(arquivosPintados(aparenciaDoTaco('corujao')).map((p) => p.parte)).toEqual(['haste', 'antebraco', 'punho']);
  });

  it('as pinturas pedidas são as novas: `dragon-lore-*` e `howl-*`, nunca as do P2', () => {
    expect(arquivosPintados(aparenciaDoTaco('dragao-das-quinze')).map((p) => p.arquivo)).toEqual(['dragon-lore-haste.png', 'dragon-lore-antebraco.png', 'dragon-lore-base.png']);
    expect(arquivosPintados(aparenciaDoTaco('corujao')).map((p) => p.arquivo)).toEqual(['howl-haste.png', 'howl-antebraco.png', 'howl-punho.png']);
  });

  it('a semente rara do catálogo troca cada arquivo pelo `-raro.png` do Pincel (Lobo da Geada); a comum, não', () => {
    const rara = (skin: SkinTaco): number => Array.from({ length: 1000 }, (_, i) => i).find((i) => padraoDaSemente(skin, i)?.rara === true)!;
    const comum = (skin: SkinTaco): number => Array.from({ length: 1000 }, (_, i) => i).find((i) => padraoDaSemente(skin, i)?.rara !== true)!;
    expect(arquivosPintados(aparenciaDoTaco('corujao', rara('corujao'))).map((p) => p.arquivo)).toEqual(['howl-haste-raro.png', 'howl-antebraco-raro.png', 'howl-punho-raro.png']);
    expect(arquivosPintados(aparenciaDoTaco('corujao', comum('corujao'))).map((p) => p.arquivo)).toEqual(['howl-haste.png', 'howl-antebraco.png', 'howl-punho.png']);
    expect(arquivosPintados(aparenciaDoTaco('dragao-das-quinze', rara('dragao-das-quinze'))).map((p) => p.arquivo)).toEqual(['dragon-lore-haste-raro.png', 'dragon-lore-antebraco-raro.png', 'dragon-lore-base-raro.png']);
  });
});

describe('pintadaNaMalha (L35)', () => {
  it('vira a imagem de cabeça para baixo (a linha de baixo do PNG é a ponta, a linha 0 da malha) e espelha em x (repeat.x = −1)', () => {
    // 4 colunas por 2 linhas; a cor diz a coluna (r) e a linha (g) de origem no PNG.
    const png = imagem(4, 2, (x, y) => [x * 10, y * 100, 0]);
    const malha = pintadaNaMalha(png, 0);
    // Linha 0 da malha = linha de baixo do PNG (y = 1); x espelhado: a coluna 0 da malha vem da última do PNG.
    expect(pixel(malha, 0, 0)).toEqual([30, 100, 0]);
    expect(pixel(malha, 3, 0)).toEqual([0, 100, 0]);
    expect(pixel(malha, 0, 1)).toEqual([30, 0, 0]);
    expect(malha.dados[3]).toBe(255);
  });

  it('o rolo gira a arte em volta, sem emenda: rolo 0,25 em 4 colunas anda uma coluna', () => {
    const png = imagem(4, 1, (x) => [x * 10, 0, 0]);
    const a = pintadaNaMalha(png, 0);
    const b = pintadaNaMalha(png, 0.25);
    for (let x = 0; x < 4; x++) expect(pixel(b, x, 0)[0]).toBe(pixel(a, (x + 3) % 4, 0)[0]);
    // Uma volta inteira de rolo é a mesma imagem.
    expect(Buffer.from(pintadaNaMalha(png, 1).dados).equals(Buffer.from(a.dados))).toBe(true);
  });
});

describe('vistaLateralDaImagem (L35)', () => {
  it('a peça vista de lado: a imagem tem o tamanho pedido, opaca, com a ponta (linha 0) à esquerda', () => {
    const origem = imagem(8, 4, (_x, y) => [y * 60, 0, 0]);
    const lado = vistaLateralDaImagem(origem, 16, 6);
    expect(lado.largura).toBe(16);
    expect(lado.altura).toBe(6);
    expect(lado.dados[3]).toBe(255);
    // Ao longo da peça: a esquerda vem da linha 0 (ponta), a direita da última (cabo).
    expect(pixel(lado, 0, 3)[0]).toBeLessThan(pixel(lado, 15, 3)[0]!);
  });

  it('o `centro` escolhe o lado da volta que fica virado para quem olha', () => {
    // Em volta: a coluna diz o ângulo (0 = alto do taco).
    const origem = imagem(8, 2, (x) => [x * 30, 0, 0]);
    const emCima = vistaLateralDaImagem(origem, 4, 8, 0.25);
    const outroLado = vistaLateralDaImagem(origem, 4, 8, 0.75);
    expect(pixel(emCima, 1, 4)).not.toEqual(pixel(outroLado, 1, 4));
  });
});
