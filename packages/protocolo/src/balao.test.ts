import { describe, expect, it } from 'vitest';
import {
  APARENCIA_PADRAO,
  ITENS_DO_BALAO,
  ITENS_GRATIS_DO_BALAO,
  TIPOS_DE_ITEM_DO_BALAO,
  aparenciaCabeNosItens,
  aparenciaIgual,
  ehIdDeItemDoBalao,
  itemDoBalao,
  itensDaAparencia,
  precoDoItemDoBalao,
  validarAparenciaDoBalao,
  type AparenciaDoBalao,
} from './index';

const IDS_DO_CONTRATO = {
  chapeu: ['chapeu_panama', 'bone_aba_reta', 'cartola', 'gorro_pompom', 'chapeu_palha', 'boina', 'chapeu_festa', 'coroa'],
  bigode: ['bigode_fino', 'bigodao', 'bigode_guidao', 'bigode_dali', 'bigode_chevron'],
  olhos: ['olho_normal', 'olho_kawaii', 'olho_bravo', 'olho_cansado'],
  cor_dos_olhos: ['castanho', 'mel', 'verde', 'azul', 'cinza', 'violeta', 'vermelho', 'dourado'],
} as const;

const deTipo = (tipo: string) => ITENS_DO_BALAO.filter((i) => i.tipo === tipo);

describe('o catálogo do balão (L47): os 25 itens fechados do contrato', () => {
  it('são 25 itens, e os ids de cada tipo são exatamente os do contrato, na ordem dele', () => {
    expect(ITENS_DO_BALAO).toHaveLength(25);
    expect([...TIPOS_DE_ITEM_DO_BALAO]).toEqual(['chapeu', 'bigode', 'olhos', 'cor_dos_olhos']);
    for (const tipo of TIPOS_DE_ITEM_DO_BALAO) expect(deTipo(tipo).map((i) => i.id), tipo).toEqual(IDS_DO_CONTRATO[tipo]);
  });

  it('o id é snake_case sem acento, o nome de loja é português curto e nenhum id nem nome se repete', () => {
    for (const { id, nome } of ITENS_DO_BALAO) {
      expect(id).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(nome.length, id).toBeGreaterThanOrEqual(4);
      expect(nome.length, id).toBeLessThanOrEqual(24);
    }
    expect(new Set(ITENS_DO_BALAO.map((i) => i.id)).size).toBe(25);
    expect(new Set(ITENS_DO_BALAO.map((i) => i.nome)).size).toBe(25);
  });

  it('nada de barba: nenhum item, id ou nome fala em barba, cavanhaque ou cavaignac', () => {
    for (const { id, nome } of ITENS_DO_BALAO) expect(`${id} ${nome}`, id).not.toMatch(/barba|cavanhaque|cavaignac|pera|bode\b/i);
  });

  it('só o estilo normal e a cor castanho são grátis (preço 0); o resto custa de 40 a 500 moedas, inteiro', () => {
    expect([...ITENS_GRATIS_DO_BALAO]).toEqual(['olho_normal', 'castanho']);
    expect(ITENS_DO_BALAO.filter((i) => i.preco === 0).map((i) => i.id)).toEqual(['olho_normal', 'castanho']);
    for (const i of ITENS_DO_BALAO.filter((x) => x.preco > 0)) {
      expect(Number.isInteger(i.preco), i.id).toBe(true);
      expect(i.preco, i.id).toBeGreaterThanOrEqual(40);
      expect(i.preco, i.id).toBeLessThanOrEqual(500);
    }
  });

  it('a escala: as cores de olho são as mais baratas, estilos e bigodes ficam no meio, os chapéus vão do meio para cima e a coroa é o mais caro', () => {
    const pagos = (tipo: string) => deTipo(tipo).filter((i) => i.preco > 0).map((i) => i.preco);
    const maximoDasCores = Math.max(...pagos('cor_dos_olhos'));
    const minimoDosEstilos = Math.min(...pagos('olhos'));
    const minimoDosBigodes = Math.min(...pagos('bigode'));
    const maximoDosMeios = Math.max(...pagos('olhos'), ...pagos('bigode'));
    // as cores custam menos que qualquer estilo ou bigode
    expect(maximoDasCores).toBeLessThan(minimoDosEstilos);
    expect(maximoDasCores).toBeLessThan(minimoDosBigodes);
    // os chapéus começam no meio (não abaixo do meio mais barato) e sobem acima do que estilos e bigodes custam
    expect(Math.min(...pagos('chapeu'))).toBeGreaterThanOrEqual(minimoDosBigodes);
    expect(Math.max(...pagos('chapeu'))).toBeGreaterThan(maximoDosMeios);
    // a coroa é o item de status: o mais caro de todos, com folga sobre o segundo
    const ordenados = [...ITENS_DO_BALAO].sort((a, b) => b.preco - a.preco);
    expect(ordenados[0]!.id).toBe('coroa');
    expect(ordenados[0]!.preco).toBeGreaterThan(ordenados[1]!.preco);
  });

  it('a tabela de preços, fixa (mudar um preço é editar o catálogo e este teste)', () => {
    expect(Object.fromEntries(ITENS_DO_BALAO.map((i) => [i.id, i.preco]))).toEqual({
      gorro_pompom: 130,
      chapeu_festa: 140,
      bone_aba_reta: 150,
      chapeu_palha: 160,
      boina: 180,
      chapeu_panama: 200,
      cartola: 260,
      coroa: 500,
      bigode_fino: 90,
      bigode_chevron: 100,
      bigodao: 120,
      bigode_guidao: 140,
      bigode_dali: 160,
      olho_normal: 0,
      olho_cansado: 100,
      olho_bravo: 120,
      olho_kawaii: 150,
      castanho: 0,
      mel: 40,
      cinza: 40,
      verde: 50,
      azul: 50,
      violeta: 60,
      vermelho: 70,
      dourado: 80,
    });
  });

  it('ehIdDeItemDoBalao, itemDoBalao e precoDoItemDoBalao: id do catálogo sim; nome de propriedade do Object, tipo errado e id de skin não', () => {
    for (const { id } of ITENS_DO_BALAO) {
      expect(ehIdDeItemDoBalao(id), id).toBe(true);
      expect(itemDoBalao(id).id).toBe(id);
      expect(precoDoItemDoBalao(id)).toBe(itemDoBalao(id).preco);
    }
    for (const ruim of ['toString', '__proto__', 'constructor', 'coroa ', 'Coroa', 'barba', 'ebano', '', 7, null, undefined, {}]) expect(ehIdDeItemDoBalao(ruim), String(ruim)).toBe(false);
  });
});

describe('a aparência do balão', () => {
  it('o padrão é sem chapéu, sem bigode, olho normal e castanho; é congelado', () => {
    expect(APARENCIA_PADRAO).toEqual({ chapeu: null, bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' });
    expect(Object.isFrozen(APARENCIA_PADRAO)).toBe(true);
  });

  it('o padrão só usa itens grátis: todo mundo o tem', () => {
    expect(aparenciaCabeNosItens(APARENCIA_PADRAO, [])).toBe(true);
    expect(itensDaAparencia(APARENCIA_PADRAO)).toEqual(['olho_normal', 'castanho']);
  });

  it('itensDaAparencia lista os ids usados, sem os null, na ordem chapéu, bigode, estilo, cor', () => {
    const a: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' };
    expect(itensDaAparencia(a)).toEqual(['coroa', 'bigodao', 'olho_kawaii', 'dourado']);
  });

  it('aparenciaCabeNosItens: cada item pago usado tem de estar na lista; os grátis nunca precisam', () => {
    const a: AparenciaDoBalao = { chapeu: 'cartola', bigode: null, olhos: 'olho_bravo', corDosOlhos: 'verde' };
    expect(aparenciaCabeNosItens(a, ['cartola', 'olho_bravo', 'verde'])).toBe(true);
    expect(aparenciaCabeNosItens(a, ['cartola', 'olho_bravo'])).toBe(false);
    expect(aparenciaCabeNosItens(a, ['olho_bravo', 'verde'])).toBe(false);
    expect(aparenciaCabeNosItens(a, [])).toBe(false);
  });

  it('aparenciaIgual compara os quatro campos', () => {
    const a: AparenciaDoBalao = { chapeu: 'boina', bigode: null, olhos: 'olho_normal', corDosOlhos: 'azul' };
    expect(aparenciaIgual(a, { ...a })).toBe(true);
    expect(aparenciaIgual(a, { ...a, chapeu: null })).toBe(false);
    expect(aparenciaIgual(a, { ...a, bigode: 'bigodao' })).toBe(false);
    expect(aparenciaIgual(a, { ...a, olhos: 'olho_bravo' })).toBe(false);
    expect(aparenciaIgual(a, { ...a, corDosOlhos: 'mel' })).toBe(false);
  });
});

describe('validarAparenciaDoBalao: ids do catálogo e o tipo certo em cada campo', () => {
  const cheia: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigode_dali', olhos: 'olho_cansado', corDosOlhos: 'vermelho' };

  it('aceita o padrão e uma aparência cheia, devolvendo uma cópia só com os quatro campos', () => {
    const padrao = validarAparenciaDoBalao(APARENCIA_PADRAO);
    expect(padrao).toEqual({ ok: true, valor: APARENCIA_PADRAO });
    const r = validarAparenciaDoBalao(cheia);
    expect(r).toEqual({ ok: true, valor: cheia });
    if (r.ok) expect(r.valor).not.toBe(cheia);
  });

  it('aceita todo id de cada tipo no campo dele', () => {
    for (const chapeu of IDS_DO_CONTRATO.chapeu) expect(validarAparenciaDoBalao({ ...APARENCIA_PADRAO, chapeu }).ok, chapeu).toBe(true);
    for (const bigode of IDS_DO_CONTRATO.bigode) expect(validarAparenciaDoBalao({ ...APARENCIA_PADRAO, bigode }).ok, bigode).toBe(true);
    for (const olhos of IDS_DO_CONTRATO.olhos) expect(validarAparenciaDoBalao({ ...APARENCIA_PADRAO, olhos }).ok, olhos).toBe(true);
    for (const corDosOlhos of IDS_DO_CONTRATO.cor_dos_olhos) expect(validarAparenciaDoBalao({ ...APARENCIA_PADRAO, corDosOlhos }).ok, corDosOlhos).toBe(true);
  });

  it('recusa id de outro tipo no campo: bigode no chapéu, chapéu no bigode, cor no estilo, estilo na cor', () => {
    expect(validarAparenciaDoBalao({ ...cheia, chapeu: 'bigodao' }).ok).toBe(false);
    expect(validarAparenciaDoBalao({ ...cheia, bigode: 'coroa' }).ok).toBe(false);
    expect(validarAparenciaDoBalao({ ...cheia, olhos: 'azul' }).ok).toBe(false);
    expect(validarAparenciaDoBalao({ ...cheia, corDosOlhos: 'olho_kawaii' }).ok).toBe(false);
  });

  it('recusa id que não existe, de skin, ou nome de propriedade do Object', () => {
    for (const ruim of ['barba', 'ebano', 'toString', '__proto__', 'Coroa', ' coroa', '']) {
      expect(validarAparenciaDoBalao({ ...cheia, chapeu: ruim }).ok, `chapeu ${ruim}`).toBe(false);
      expect(validarAparenciaDoBalao({ ...cheia, bigode: ruim }).ok, `bigode ${ruim}`).toBe(false);
    }
  });

  it('chapéu e bigode aceitam null (sem ele); estilo e cor não: sempre há um olho', () => {
    expect(validarAparenciaDoBalao({ ...cheia, chapeu: null, bigode: null }).ok).toBe(true);
    expect(validarAparenciaDoBalao({ ...cheia, olhos: null }).ok).toBe(false);
    expect(validarAparenciaDoBalao({ ...cheia, corDosOlhos: null }).ok).toBe(false);
  });

  it('recusa o que não é um objeto simples com exatamente os quatro campos: falta campo, campo a mais, tipo errado, undefined no lugar de null', () => {
    const semChapeu: Record<string, unknown> = { ...cheia };
    delete semChapeu.chapeu;
    const semCor: Record<string, unknown> = { ...cheia };
    delete semCor.corDosOlhos;
    const lixos: unknown[] = [null, undefined, 7, 'coroa', [], [cheia], semChapeu, semCor, { ...cheia, barba: 'barba_longa' }, { ...cheia, cor_dos_olhos: 'azul' }, { ...cheia, chapeu: undefined }, { ...cheia, chapeu: 7 }, { ...cheia, olhos: ['olho_normal'] }];
    for (const lixo of lixos) expect(validarAparenciaDoBalao(lixo).ok, JSON.stringify(lixo)).toBe(false);
  });
});
