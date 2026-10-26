import { describe, expect, it } from 'vitest';
import { SKINS_DE_TACO, SKIN_PADRAO } from '@sinuca/protocolo';
import { APARENCIAS_DO_TACO, aparenciaDoTaco, type AparenciaTaco, type Superficie } from './aparencia-do-taco';

const IDS_DE_SKIN_DO_TACO = SKINS_DE_TACO.map((s) => s.id);

const COR_VALIDA = (c: number): boolean => Number.isInteger(c) && c >= 0 && c <= 0xffffff;
const superficies = (a: AparenciaTaco): Superficie[] => [a.virola, a.haste, a.junta, a.antebraco.base, a.anel, a.base, a.borracha];

describe('skins do taco', () => {
  it('são as oito do catálogo, com os ids do protocolo, e cada id tem a sua aparência', () => {
    expect(IDS_DE_SKIN_DO_TACO).toEqual(['classico', 'ebano', 'boteco', 'marfim', 'carbono', 'chamas', 'neon', 'ouro']);
    expect(Object.keys(APARENCIAS_DO_TACO).sort()).toEqual([...IDS_DE_SKIN_DO_TACO].sort());
    for (const id of IDS_DE_SKIN_DO_TACO) expect(APARENCIAS_DO_TACO[id].id).toBe(id);
  });

  it('a padrão é a clássica, que não custa nada', () => {
    expect(SKIN_PADRAO).toBe('classico');
  });

  it('todo número é válido: cores 0xRRGGBB, rugosidade, metal, verniz e contraste de 0 a 1', () => {
    for (const a of Object.values(APARENCIAS_DO_TACO)) {
      expect(COR_VALIDA(a.ponta.couro) && COR_VALIDA(a.ponta.giz)).toBe(true);
      expect(COR_VALIDA(a.punho.cor)).toBe(true);
      if (a.punho.faixa !== undefined) expect(COR_VALIDA(a.punho.faixa)).toBe(true);
      for (const s of superficies(a)) {
        expect(COR_VALIDA(s.cor), `${a.id} cor`).toBe(true);
        for (const x of [s.rugosidade, s.metal, s.verniz]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
        }
        if (s.emissivo) {
          expect(COR_VALIDA(s.emissivo.cor)).toBe(true);
          expect(s.emissivo.intensidade).toBeGreaterThan(0);
        }
      }
      for (const p of [a.haste, a.antebraco.base, a.base]) {
        expect(p.contraste).toBeGreaterThanOrEqual(0);
        expect(p.contraste).toBeLessThanOrEqual(1);
      }
    }
  });

  it('o giz é azul em todas e a sola é de couro (a ponta mostra o nível do giz do jogador)', () => {
    for (const a of Object.values(APARENCIAS_DO_TACO)) {
      const b = a.ponta.giz & 255;
      const r = (a.ponta.giz >> 16) & 255;
      expect(b).toBeGreaterThan(r);
    }
  });

  it('cada skin é diferente das outras (a cor da haste e do antebraço, juntas, não se repetem)', () => {
    const marca = (a: AparenciaTaco): string => `${a.haste.cor}-${a.antebraco.base.cor}-${JSON.stringify(a.antebraco.desenho)}`;
    const marcas = Object.values(APARENCIAS_DO_TACO).map(marca);
    expect(new Set(marcas).size).toBe(marcas.length);
  });

  it('os desenhos do pedido: clássico e ébano, marfim, boteco e ouro com 4 bicos; chamas; neon com linhas; carbono liso e punho de borracha', () => {
    for (const id of ['classico', 'ebano', 'boteco', 'marfim', 'ouro'] as const) {
      const d = APARENCIAS_DO_TACO[id].antebraco.desenho;
      expect(d.tipo).toBe('bicos');
      if (d.tipo === 'bicos') expect(d.quantidade).toBe(4);
    }
    expect(APARENCIAS_DO_TACO.chamas.antebraco.desenho.tipo).toBe('chamas');
    expect(APARENCIAS_DO_TACO.neon.antebraco.desenho.tipo).toBe('linhas');
    expect(APARENCIAS_DO_TACO.carbono.haste.trama).toBe('carbono');
    expect(APARENCIAS_DO_TACO.carbono.punho.material).toBe('borracha');
    expect(APARENCIAS_DO_TACO.classico.punho.material).toBe('linho');
    expect(APARENCIAS_DO_TACO.boteco.punho.faixa).toBeDefined();
  });

  it('o ouro é metal de verdade e o neon acende', () => {
    expect(APARENCIAS_DO_TACO.ouro.haste.metal).toBeGreaterThanOrEqual(0.9);
    expect(APARENCIAS_DO_TACO.ouro.haste.cor & 0xff0000).toBeGreaterThan(0xd00000);
    expect(APARENCIAS_DO_TACO.neon.junta.emissivo).toBeDefined();
    expect(APARENCIAS_DO_TACO.neon.haste.trama).toBe('neon');
  });

  it('os pretos leem preto sob a luz de 3000 K: albedo quase zero e azulado, reflexo pequeno (a luz quente tingia de marrom)', () => {
    const pretos = [APARENCIAS_DO_TACO.ebano.haste, APARENCIAS_DO_TACO.chamas.haste, APARENCIAS_DO_TACO.neon.haste, APARENCIAS_DO_TACO.ebano.antebraco.base];
    for (const p of pretos) {
      const [r, g, b] = [(p.cor >> 16) & 255, (p.cor >> 8) & 255, p.cor & 255];
      expect(Math.max(r, g, b), 'escuro').toBeLessThan(32);
      expect(b, 'o azul compensa o laranja da luz').toBeGreaterThanOrEqual(r);
      expect(p.especular?.intensidade ?? 1, 'reflexo pequeno').toBeLessThanOrEqual(0.5);
      expect(p.verniz, 'sem o verniz que espelhava a lâmpada').toBeLessThanOrEqual(0.5);
    }
    // O carbono também: cinza-escuro azulado, não marrom.
    const c = APARENCIAS_DO_TACO.carbono.haste.cor;
    expect(c & 255).toBeGreaterThanOrEqual((c >> 16) & 255);
  });

  it('cada skin se reconhece na haste, que é o que a câmera de jogo vê (a ponta até ~0,6 m): cor, anéis, chamas ou linhas', () => {
    const marca = (a: AparenciaTaco): string => `${a.haste.cor}-${a.haste.trama}-${JSON.stringify(a.haste.faixas ?? [])}`;
    const marcas = Object.values(APARENCIAS_DO_TACO).map(marca);
    expect(new Set(marcas).size).toBe(marcas.length);
    expect(APARENCIAS_DO_TACO.chamas.haste.trama).toBe('chamas');
    expect(APARENCIAS_DO_TACO.neon.haste.trama).toBe('neon');
    for (const id of ['boteco', 'marfim', 'ebano', 'carbono', 'neon', 'ouro'] as const) expect(APARENCIAS_DO_TACO[id].haste.faixas?.length, id).toBeGreaterThan(0);
  });

  it('as faixas cabem na peça (de < ate, entre 0 e 1) e nunca se sobrepõem', () => {
    for (const a of Object.values(APARENCIAS_DO_TACO)) {
      for (const p of [a.haste, a.antebraco.base, a.base]) {
        const faixas = [...(p.faixas ?? [])].sort((x, y) => x.de - y.de);
        faixas.forEach((f, i) => {
          expect(COR_VALIDA(f.cor)).toBe(true);
          expect(f.de).toBeGreaterThanOrEqual(0);
          expect(f.ate).toBeLessThanOrEqual(1);
          expect(f.de).toBeLessThan(f.ate);
          if (i > 0) expect(f.de, a.id).toBeGreaterThanOrEqual(faixas[i - 1]!.ate);
        });
      }
    }
  });

  it('só o neon tem brilho (halo) e a intensidade é válida', () => {
    for (const a of Object.values(APARENCIAS_DO_TACO)) {
      if (a.id !== 'neon') expect(a.halo, a.id).toBeUndefined();
    }
    const halo = APARENCIAS_DO_TACO.neon.halo!;
    expect(halo.intensidade).toBeGreaterThan(0);
    expect(halo.cores.every(COR_VALIDA)).toBe(true);
  });

  it('um id que o web não conhece cai na clássica', () => {
    expect(aparenciaDoTaco('platina').id).toBe('classico');
    expect(aparenciaDoTaco('').id).toBe('classico');
    expect(aparenciaDoTaco('neon').id).toBe('neon');
  });
});
