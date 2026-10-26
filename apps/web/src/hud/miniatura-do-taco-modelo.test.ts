import { TACO } from '@sinuca/fisica';
import { SKINS_DE_TACO } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { APARENCIAS_DO_TACO } from '../cena/aparencia-do-taco';
import { corCss, miniaturaDoTaco, misturarCores } from './miniatura-do-taco-modelo';

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
  it('cada uma das oito skins monta um plano com cores css válidas e frações dentro do taco', () => {
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
