import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TACO } from '@sinuca/fisica';
import { SKINS_DE_TACO, padraoDaSemente, type SkinDoCatalogo, type SkinTaco } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { APARENCIAS_DO_TACO, aparenciaDoTaco, type AparenciaTaco } from './aparencia-do-taco';
import { PARTES_COM_IMAGEM, contextoDaPeca, corDaPeca } from './imagem-da-peca';
import { PADROES_DO_TACO } from './raros-do-taco';

const PINTADAS: readonly SkinTaco[] = ['coral', 'bicho-solto', 'corujao', 'dragao-das-quinze'];
const SEMENTES = Array.from({ length: 1000 }, (_, i) => i);

/** Os selos que o catálogo dá a uma skin: os `padroes` quando ela os tem, senão as `raras` (L34c). Nada fica copiado no web. */
const selosDoCatalogo = (skin: SkinTaco): string[] => {
  const s: SkinDoCatalogo = SKINS_DE_TACO.find((x) => x.id === skin)!;
  return [...new Set(s.padroes ? s.padroes.map((p) => p.selo) : s.raras.map((r) => r.selo))].sort();
};

/** A primeira semente a que o catálogo dá o selo (o que `padraoDaSemente` diz, não uma lista copiada). */
const sementeDe = (skin: SkinTaco, selo: string): number => {
  const semente = SEMENTES.find((n) => padraoDaSemente(skin, n)?.selo === selo);
  if (semente === undefined) throw new Error(`o catálogo não dá ${selo} a nenhuma semente de ${skin}`);
  return semente;
};

/** Uma semente sem padrão raro (as fases do Doppler contam como comuns). */
const sementeComum = (skin: SkinTaco, depois = -1): number => {
  const semente = SEMENTES.find((n) => n > depois && padraoDaSemente(skin, n)?.rara !== true);
  if (semente === undefined) throw new Error(`sem semente comum em ${skin}`);
  return semente;
};

/** O que o padrão muda, sem a variação da semente: a aparência com os números que a semente não mexe. */
const marca = (a: AparenciaTaco): string => JSON.stringify({ haste: { ...a.haste, cor: 0 }, antebraco: { ...a.antebraco.base, cor: 0 }, desenho: a.antebraco.desenho, base: { ...a.base, cor: 0 }, junta: a.junta, anel: a.anel, virola: a.virola, halo: a.halo, punho: a.punho });

interface Cores {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Fração dos pixels de cada família (0 a 1). */
  readonly amarelo: number;
  readonly vermelho: number;
  readonly azul: number;
  readonly claro: number;
  readonly preto: number;
  readonly laranja: number;
}

/** As cores da haste e do antebraço da aparência, contadas pixel a pixel nas imagens que o taco desenha. */
const coresDe = (skin: SkinTaco, semente: number | null): Cores => {
  const a = aparenciaDoTaco(skin, semente);
  let n = 0;
  const t = { r: 0, g: 0, b: 0, amarelo: 0, vermelho: 0, azul: 0, claro: 0, preto: 0, laranja: 0 };
  for (const parte of ['haste', 'antebraco'] as const) {
    const img = corDaPeca(contextoDaPeca(a, TACO, parte, { largura: 64, altura: 128 }, 'cheio'), parte)!;
    for (let i = 0; i < img.dados.length; i += 4) {
      const [r, g, b] = [img.dados[i]!, img.dados[i + 1]!, img.dados[i + 2]!];
      const lum = (r + g + b) / 3;
      t.r += r;
      t.g += g;
      t.b += b;
      if (r > 150 && g > 130 && b < 100) t.amarelo++;
      if (r > 140 && g < 90 && b < 90) t.vermelho++;
      if (b > 130 && r < 100) t.azul++;
      if (lum > 200) t.claro++;
      if (lum < 40) t.preto++;
      if (r > 200 && g > 80 && g < 170 && b < 80) t.laranja++;
      n++;
    }
  }
  return { r: t.r / n, g: t.g / n, b: t.b / n, amarelo: t.amarelo / n, vermelho: t.vermelho / n, azul: t.azul / n, claro: t.claro / n, preto: t.preto / n, laranja: t.laranja / n };
};

/** Matiz (0 a 360), saturação e valor de uma cor RGB 0 a 255. */
const matizDe = (r: number, g: number, b: number): { h: number; s: number; v: number } => {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const mx = Math.max(R, G, B);
  const d = mx - Math.min(R, G, B);
  let h = 0;
  if (d > 0) h = mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s: mx === 0 ? 0 : d / mx, v: mx };
};

/** A distância entre dois matizes (0 a 180°). */
const distanciaDeMatiz = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

interface SomaDeLinha {
  readonly sx: number;
  readonly sy: number;
  readonly s: number;
  readonly quente: number;
  readonly frio: number;
  readonly n: number;
}

const LINHAS_POR_PECA = new Map<string, SomaDeLinha[]>();

/** As somas de cada linha da imagem de uma peça (a imagem é pesada de gerar; sai uma vez por skin, semente e peça). */
const linhasDe = (skin: SkinTaco, semente: number, parte: 'haste' | 'antebraco' | 'base'): SomaDeLinha[] => {
  const chave = `${skin}#${semente}/${parte}`;
  const guardada = LINHAS_POR_PECA.get(chave);
  if (guardada) return guardada;
  const a = aparenciaDoTaco(skin, semente);
  const img = corDaPeca(contextoDaPeca(a, TACO, parte, { largura: 64, altura: 128 }, 'cheio'), parte)!;
  const linhas: SomaDeLinha[] = [];
  for (let y = 0; y < img.altura; y++) {
    let sx = 0;
    let sy = 0;
    let ss = 0;
    let quente = 0;
    let frio = 0;
    for (let x = 0; x < img.largura; x++) {
      const k = 4 * (y * img.largura + x);
      const { h, s } = matizDe(img.dados[k]!, img.dados[k + 1]!, img.dados[k + 2]!);
      sx += Math.cos((h * Math.PI) / 180);
      sy += Math.sin((h * Math.PI) / 180);
      ss += s;
      if (h >= 15 && h <= 70) quente++; // amarelo, dourado e laranja
      if (h >= 250 && h <= 350) frio++; // roxo, magenta e rosa
    }
    linhas.push({ sx, sy, s: ss, quente, frio, n: img.largura });
  }
  LINHAS_POR_PECA.set(chave, linhas);
  return linhas;
};

/** A média circular dos matizes, a saturação média e a fração quente e fria dos pixels de uma faixa da peça (as linhas de `de` a `ate`, de 0 a 1, da ponta ao cabo). */
const faixaDe = (skin: SkinTaco, semente: number, parte: 'haste' | 'antebraco' | 'base', de = 0, ate = 1): { h: number; s: number; quente: number; frio: number } => {
  const linhas = linhasDe(skin, semente, parte);
  const t = { sx: 0, sy: 0, s: 0, quente: 0, frio: 0, n: 0 };
  for (let y = Math.floor(de * linhas.length); y < Math.ceil(ate * linhas.length); y++) {
    const l = linhas[y]!;
    t.sx += l.sx;
    t.sy += l.sy;
    t.s += l.s;
    t.quente += l.quente;
    t.frio += l.frio;
    t.n += l.n;
  }
  return { h: ((Math.atan2(t.sy, t.sx) * 180) / Math.PI + 360) % 360, s: t.s / t.n, quente: t.quente / t.n, frio: t.frio / t.n };
};

/** A matiz média das três faixas (do começo, do meio e do fim) da peça. */
const tercosDe = (skin: SkinTaco, semente: number, parte: 'haste' | 'antebraco' | 'base'): [number, number, number] => [0, 1, 2].map((k) => faixaDe(skin, semente, parte, k / 3, (k + 1) / 3).h) as [number, number, number];

/** As sementes do catálogo que não têm padrão raro nem fase (a skin comum). */
const sementesComuns = (skin: SkinTaco): number[] => SEMENTES.filter((n) => padraoDaSemente(skin, n) === undefined);

/** Dez sementes comuns espalhadas pela porcentagem do fade (da menor à maior), para medir sem gerar as mil. */
const amostraDeComuns = (skin: SkinTaco): number[] => {
  const ordem = sementesComuns(skin).sort((a, b) => aparenciaDoTaco(skin, a).variacao.deslocamento - aparenciaDoTaco(skin, b).variacao.deslocamento);
  return Array.from({ length: 10 }, (_, k) => ordem[Math.round((k * (ordem.length - 1)) / 9)]!);
};

/** As sementes a que o catálogo dá o selo; `no máximo` espalha uma amostra delas (a fase tem uma de cada quatro sementes). */
const sementesDo = (skin: SkinTaco, selo: string, noMaximo = 12): number[] => {
  const todas = SEMENTES.filter((n) => padraoDaSemente(skin, n)?.selo === selo);
  return todas.length <= noMaximo ? todas : Array.from({ length: noMaximo }, (_, k) => todas[Math.round((k * (todas.length - 1)) / (noMaximo - 1))]!);
};

const media = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('os padrões do catálogo no web (L36)', () => {
  it('a tabela do web e o catálogo do protocolo se correspondem: cada selo do catálogo tem a sua mudança, e nenhuma mudança fica sem padrão', () => {
    for (const s of SKINS_DE_TACO) expect(Object.keys(PADROES_DO_TACO[s.id] ?? {}).sort(), s.id).toEqual(selosDoCatalogo(s.id));
    for (const id of Object.keys(PADROES_DO_TACO)) expect(SKINS_DE_TACO.map((s) => s.id as string), id).toContain(id);
  });

  it('os padrões novos do CS estão no catálogo: Blue Gem, Ruby, Sapphire, Black Pearl, Emerald, Full Fade e Fire & Ice, e as fases do Doppler e do Gamma', () => {
    const todos = SKINS_DE_TACO.flatMap((s) => selosDoCatalogo(s.id));
    for (const selo of ['BLUE GEM', 'RUBY', 'SAPPHIRE', 'BLACK PEARL', 'EMERALD', 'FULL FADE', 'FIRE & ICE', 'PHASE 1', 'PHASE 2', 'PHASE 3', 'PHASE 4']) expect(todos, selo).toContain(selo);
    expect(selosDoCatalogo('obsidiana')).toEqual(['BLACK PEARL', 'PHASE 1', 'PHASE 2', 'PHASE 3', 'PHASE 4', 'RUBY', 'SAPPHIRE']);
    expect(selosDoCatalogo('esmeralda-do-pano')).toEqual(['EMERALD', 'PHASE 1', 'PHASE 2', 'PHASE 3', 'PHASE 4']);
  });

  it('a aparência traz o padrão que `padraoDaSemente` dá, para cada padrão de cada skin e para uma semente comum', () => {
    for (const s of SKINS_DE_TACO) {
      for (const selo of selosDoCatalogo(s.id)) {
        const semente = sementeDe(s.id, selo);
        expect(aparenciaDoTaco(s.id, semente).padrao, `${s.id} #${semente}`).toEqual(padraoDaSemente(s.id, semente));
      }
      const comum = sementeComum(s.id);
      expect(aparenciaDoTaco(s.id, comum).padrao, `${s.id} #${comum}`).toEqual(padraoDaSemente(s.id, comum) ?? null);
    }
    expect(aparenciaDoTaco('tempera', null).padrao).toBeNull();
  });

  it('o padrão parece diferente de uma semente comum (a primeira que não é dele), e os padrões da mesma skin são diferentes entre si', () => {
    for (const s of SKINS_DE_TACO) {
      const selos = selosDoCatalogo(s.id);
      const marcas = selos.map((selo) => marca(aparenciaDoTaco(s.id, sementeDe(s.id, selo))));
      expect(new Set(marcas).size, s.id).toBe(selos.length);
      for (const selo of selos) {
        const comum = marca(aparenciaDoTaco(s.id, sementeComum(s.id)));
        const semente = sementeDe(s.id, selo);
        if (padraoDaSemente(s.id, semente)?.selo === 'PHASE 1') continue; // a fase 1 é o equilíbrio de fábrica: igual à comum, de propósito
        expect(marca(aparenciaDoTaco(s.id, semente)), `${s.id} ${selo}`).not.toBe(comum);
      }
    }
  });

  it('todas as sementes de cada padrão montam uma aparência com cores válidas', () => {
    for (const s of SKINS_DE_TACO) {
      for (const selo of selosDoCatalogo(s.id)) {
        const semente = sementeDe(s.id, selo);
        const a = aparenciaDoTaco(s.id, semente);
        for (const cor of [a.haste.cor, a.antebraco.base.cor, a.base.cor, a.junta.cor, a.anel.cor, a.virola.cor]) expect(Number.isInteger(cor) && cor >= 0 && cor <= 0xffffff, `${s.id} #${semente}`).toBe(true);
      }
    }
  });
});

describe('os acabamentos do CS, medidos nos pixels (L36)', () => {
  it('Case Hardened: a comum tem azul, dourado e roxo sobre aço, e a semente muda as manchas; a Blue Gem é azul profundo por inteiro', () => {
    const comum = coresDe('tempera', sementeComum('tempera'));
    expect(comum.azul).toBeGreaterThan(0.2);
    expect(comum.amarelo + comum.laranja).toBeGreaterThan(0.03); // o dourado da têmpera
    const blue = coresDe('tempera', sementeDe('tempera', 'BLUE GEM'));
    expect(blue.azul).toBeGreaterThan(0.9);
    expect(blue.amarelo + blue.laranja + blue.vermelho).toBeLessThan(0.01);
    expect(blue.b).toBeGreaterThan(blue.r * 2);
    expect(comum.azul).toBeLessThan(blue.azul);
    const a = coresDe('tempera', 7);
    const b = coresDe('tempera', 8);
    expect([a.azul, a.amarelo, a.laranja].join()).not.toBe([b.azul, b.amarelo, b.laranja].join());
  });

  it('Doppler: as fases mudam o equilíbrio (1 preto e rosa, 2 azul e roxo, 3 verde-azulado, 4 azul)', () => {
    const f1 = coresDe('obsidiana', sementeDe('obsidiana', 'PHASE 1'));
    expect(f1.preto).toBeGreaterThan(0.15);
    expect(f1.r).toBeGreaterThan(f1.g * 2);
    expect(f1.b).toBeGreaterThan(f1.g * 1.5); // rosa: vermelho e azul sobre o verde baixo
    const f2 = coresDe('obsidiana', sementeDe('obsidiana', 'PHASE 2'));
    expect(f2.b).toBeGreaterThan(f2.r * 1.5);
    expect(f2.r).toBeGreaterThan(f2.g * 1.1); // azul e roxo: o vermelho do roxo põe o r acima do g, o que a fase 4 (só azul) não tem
    expect(f2.azul).toBeGreaterThan(0.3);
    const f3 = coresDe('obsidiana', sementeDe('obsidiana', 'PHASE 3'));
    expect(f3.g).toBeGreaterThan(f3.r * 3);
    expect(f3.b).toBeGreaterThan(f3.r * 3); // verde-azulado
    const f4 = coresDe('obsidiana', sementeDe('obsidiana', 'PHASE 4'));
    expect(f4.b).toBeGreaterThan(f4.g * 1.5);
    expect(f4.azul).toBeGreaterThan(f3.azul);
  });

  it('Doppler: Ruby é vermelho rubi, Sapphire é azul safira, Black Pearl é preto e roxo profundo', () => {
    const ruby = coresDe('obsidiana', sementeDe('obsidiana', 'RUBY'));
    expect(ruby.r).toBeGreaterThan(ruby.b * 2);
    expect(ruby.r).toBeGreaterThan(ruby.g * 3);
    expect(ruby.vermelho).toBeGreaterThan(0.15);
    const sapphire = coresDe('obsidiana', sementeDe('obsidiana', 'SAPPHIRE'));
    expect(sapphire.b).toBeGreaterThan(sapphire.r * 4);
    expect(sapphire.azul).toBeGreaterThan(0.6);
    const pearl = coresDe('obsidiana', sementeDe('obsidiana', 'BLACK PEARL'));
    expect(pearl.preto).toBeGreaterThan(0.3);
    expect((pearl.r + pearl.g + pearl.b) / 3).toBeLessThan(70);
    expect(pearl.b).toBeGreaterThan(pearl.g * 2); // o roxo
    expect(pearl.r).toBeGreaterThan(pearl.g);
  });

  it('Doppler (L36b): a Sapphire é azul safira saturado, na matiz entre o azul e o azul-ciano, sem roxo: abaixo da Black Pearl e da Phase 2', () => {
    const matizMedio = (selo: string): number => {
      const hs = sementesDo('obsidiana', selo).flatMap((n) => (['haste', 'antebraco', 'base'] as const).map((parte) => faixaDe('obsidiana', n, parte).h));
      return media(hs);
    };
    const sapphire = sementesDo('obsidiana', 'SAPPHIRE');
    expect(sapphire.length).toBeGreaterThan(0);
    for (const semente of sapphire) {
      for (const parte of ['haste', 'antebraco', 'base'] as const) {
        const f = faixaDe('obsidiana', semente, parte);
        expect(f.h, `#${semente} ${parte}`).toBeGreaterThan(195); // não vira ciano
        expect(f.h, `#${semente} ${parte}`).toBeLessThan(230); // não puxa para o roxo (o azul puro é 240°)
        expect(f.s, `#${semente} ${parte}`).toBeGreaterThan(0.65);
      }
    }
    const pearl = matizMedio('BLACK PEARL');
    const fase2 = matizMedio('PHASE 2');
    const safira = matizMedio('SAPPHIRE');
    expect(safira).toBeLessThan(fase2 - 12);
    expect(safira).toBeLessThan(pearl - 20);
    expect(pearl).toBeGreaterThan(240); // a Black Pearl é o roxo profundo
    // A Sapphire de nenhuma semente passa da matiz da Phase 2 mais azulada nem da Black Pearl.
    const piorSafira = Math.max(...sapphire.map((n) => faixaDe('obsidiana', n, 'haste').h));
    const melhorFase2 = Math.min(...sementesDo('obsidiana', 'PHASE 2').map((n) => faixaDe('obsidiana', n, 'haste').h));
    expect(piorSafira).toBeLessThan(melhorFase2 + 5);
  });

  it('Gamma Doppler: verde e ciano; a Emerald é verde-esmeralda vivo, bem mais verde que as fases', () => {
    const fase = coresDe('esmeralda-do-pano', sementeDe('esmeralda-do-pano', 'PHASE 1'));
    expect(fase.g).toBeGreaterThan(fase.r * 3);
    const emerald = coresDe('esmeralda-do-pano', sementeDe('esmeralda-do-pano', 'EMERALD'));
    expect(emerald.g).toBeGreaterThan(emerald.r * 2.5);
    expect(emerald.g).toBeGreaterThan(emerald.b * 1.4);
    expect(emerald.g / emerald.b).toBeGreaterThan(fase.g / fase.b);
  });

  it('Fade: o degradê de amarelo, rosa e roxo muda de lugar com a semente; o Full Fade é o mais rosa e roxo, sem amarelo', () => {
    const a = coresDe('fim-de-tarde', sementeComum('fim-de-tarde'));
    const b = coresDe('fim-de-tarde', sementeComum('fim-de-tarde', sementeComum('fim-de-tarde')));
    expect(a.amarelo).toBeGreaterThan(0.15);
    expect([a.amarelo.toFixed(3), a.r.toFixed(1)].join()).not.toBe([b.amarelo.toFixed(3), b.r.toFixed(1)].join()); // a porcentagem do fade vem da semente
    const full = coresDe('fim-de-tarde', sementeDe('fim-de-tarde', 'FULL FADE'));
    expect(full.amarelo).toBeLessThan(0.01);
    expect(full.b).toBeGreaterThan(full.g * 2);
    expect(full.r).toBeGreaterThan(full.g * 2);
  });

  it('Fade (L36b): a matiz muda ao longo da haste e do taco inteiro, do amarelo-dourado da ponta ao roxo e azul do cabo, em toda semente comum', () => {
    for (const semente of amostraDeComuns('fim-de-tarde')) {
      const haste = tercosDe('fim-de-tarde', semente, 'haste');
      // As três faixas da haste (começo, meio e fim) têm matizes diferentes entre si, e o fim difere bem do começo.
      expect(distanciaDeMatiz(haste[0], haste[2]), `#${semente} haste, começo e fim`).toBeGreaterThan(40);
      expect(distanciaDeMatiz(haste[0], haste[1]), `#${semente} haste, começo e meio`).toBeGreaterThan(8);
      expect(distanciaDeMatiz(haste[1], haste[2]), `#${semente} haste, meio e fim`).toBeGreaterThan(15);
      // O começo da haste é quente (amarelo, dourado ou laranja, até o salmão) e o cabo, roxo ou azul.
      expect(haste[0], `#${semente} ponta`).toBeGreaterThan(5);
      expect(haste[0], `#${semente} ponta`).toBeLessThan(60);
      const cabo = tercosDe('fim-de-tarde', semente, 'base')[2];
      expect(cabo, `#${semente} cabo`).toBeGreaterThan(215);
      expect(cabo, `#${semente} cabo`).toBeLessThan(270);
      // As três madeiras, da ponta ao cabo, andam pela escala: amarelo, rosa e roxo.
      const meios = (['haste', 'antebraco', 'base'] as const).map((parte) => faixaDe('fim-de-tarde', semente, parte).h);
      expect(distanciaDeMatiz(meios[0]!, meios[1]!), `#${semente}`).toBeGreaterThan(30);
      expect(distanciaDeMatiz(meios[1]!, meios[2]!), `#${semente}`).toBeGreaterThan(20);
      expect(distanciaDeMatiz(haste[0], cabo), `#${semente} taco inteiro`).toBeGreaterThan(120);
    }
  });

  it('Fade (L36b): a semente é a porcentagem do fade: quanto maior, mais do comprimento é rosa e roxo, sem acabar o amarelo da ponta', () => {
    const comuns = sementesComuns('fim-de-tarde').map((n) => ({ n, p: aparenciaDoTaco('fim-de-tarde', n).variacao.deslocamento }));
    const pouco = comuns.reduce((m, c) => (c.p < m.p ? c : m));
    const muito = comuns.reduce((m, c) => (c.p > m.p ? c : m));
    // Na haste (a peça que mais se vê e a que o degradê percorre) a fração de rosa e roxo cresce com a porcentagem.
    expect(faixaDe('fim-de-tarde', muito.n, 'haste').frio).toBeGreaterThan(faixaDe('fim-de-tarde', pouco.n, 'haste').frio + 0.35);
    expect(faixaDe('fim-de-tarde', muito.n, 'haste').quente).toBeLessThan(faixaDe('fim-de-tarde', pouco.n, 'haste').quente);
    for (const { n } of [pouco, muito]) expect(faixaDe('fim-de-tarde', n, 'haste', 0, 0.2).quente, `#${n} a ponta segue quente`).toBeGreaterThan(0.5);
  });

  it('Fade (L36b): o Fade comum difere do Full Fade, que é o extremo (quase tudo rosa e roxo, sem amarelo nem laranja) em toda semente', () => {
    const fulls = sementesDo('fim-de-tarde', 'FULL FADE');
    expect(fulls.length).toBeGreaterThan(5);
    for (const semente of fulls) {
      const haste = faixaDe('fim-de-tarde', semente, 'haste');
      expect(haste.quente, `#${semente}`).toBeLessThan(0.01);
      expect(haste.frio, `#${semente}`).toBeGreaterThan(0.99);
      const tercos = tercosDe('fim-de-tarde', semente, 'haste');
      for (const k of [0, 1, 2]) expect(tercos[k]!, `#${semente} faixa ${k}`).toBeGreaterThan(250);
      for (const k of [0, 1, 2]) expect(tercos[k]!, `#${semente} faixa ${k}`).toBeLessThan(350);
    }
    for (const semente of amostraDeComuns('fim-de-tarde')) {
      const haste = faixaDe('fim-de-tarde', semente, 'haste');
      expect(haste.quente, `#${semente}`).toBeGreaterThan(0.2);
      expect(haste.frio, `#${semente}`).toBeLessThan(0.75);
      // A matiz da ponta da haste (a faixa do começo) de todo Fade comum está longe da de todo Full Fade.
      const ponta = tercosDe('fim-de-tarde', semente, 'haste')[0];
      for (const f of fulls) expect(distanciaDeMatiz(ponta, tercosDe('fim-de-tarde', f, 'haste')[0]), `#${semente} contra o Full Fade #${f}`).toBeGreaterThan(30);
    }
    // O Full Fade tem bem mais rosa e roxo no taco todo que o Fade comum (a média das sementes comuns).
    const frioDoTaco = (n: number): number => media((['haste', 'antebraco', 'base'] as const).map((parte) => faixaDe('fim-de-tarde', n, parte).frio));
    expect(media(fulls.map(frioDoTaco))).toBeGreaterThan(media(amostraDeComuns('fim-de-tarde').map(frioDoTaco)) + 0.2);
  });

  it('Marble Fade: mármore de vermelho, amarelo e azul; o Fire & Ice é só vermelho e azul', () => {
    const comum = coresDe('resina-marmorizada', sementeComum('resina-marmorizada'));
    expect(comum.vermelho).toBeGreaterThan(0.05);
    expect(comum.amarelo).toBeGreaterThan(0.05);
    expect(comum.azul).toBeGreaterThan(0.2);
    const fogoEGelo = coresDe('resina-marmorizada', sementeDe('resina-marmorizada', 'FIRE & ICE'));
    expect(fogoEGelo.amarelo).toBeLessThan(0.01);
    expect(fogoEGelo.vermelho).toBeGreaterThan(0.3);
    expect(fogoEGelo.azul).toBeGreaterThan(0.3);
  });

  it('Crimson Web: teia vermelha sobre preto, e a posição da teia vem da semente', () => {
    const teia = coresDe('rede-de-cacapa', 0);
    expect(teia.preto).toBeGreaterThan(0.6);
    expect(teia.vermelho).toBeGreaterThan(0.1);
    expect((teia.r + teia.g + teia.b) / 3).toBeLessThan(50);
    const imagem = (semente: number): Buffer => {
      const a = aparenciaDoTaco('rede-de-cacapa', semente);
      return Buffer.from(corDaPeca(contextoDaPeca(a, TACO, 'haste', { largura: 64, altura: 128 }, 'cheio'), 'haste')!.dados);
    };
    expect(imagem(1).equals(imagem(2))).toBe(false);
    expect(imagem(1).equals(imagem(1))).toBe(true);
  });

  it('Asiimov: painéis brancos com faixas pretas e detalhes laranja', () => {
    const asiimov = coresDe('placar', 0);
    expect(asiimov.claro).toBeGreaterThan(0.5);
    expect(asiimov.preto).toBeGreaterThan(0.05);
    expect(asiimov.laranja).toBeGreaterThan(0.03);
  });

  it('o nível baixo continua barato: a trama simples sai bem mais rápido que a cheia no Doppler e no Case Hardened', () => {
    for (const skin of ['obsidiana', 'tempera'] as const) {
      const a = aparenciaDoTaco(skin, 5);
      const gerar = (detalhe: 'cheio' | 'simples'): number => {
        const t0 = performance.now();
        corDaPeca(contextoDaPeca(a, TACO, 'haste', { largura: 128, altura: 512 }, detalhe), 'haste');
        return performance.now() - t0;
      };
      gerar('cheio'); // aquece
      const cheio = Math.min(gerar('cheio'), gerar('cheio'));
      const simples = Math.min(gerar('simples'), gerar('simples'));
      expect(simples, skin).toBeLessThan(cheio);
    }
  });
});

describe('as skins pintadas (L35, L36)', () => {
  const arte = resolve(__dirname, '../../../../arte/skins/exportados');

  const imagensDe = (a: AparenciaTaco) => [a.haste.imagem, a.antebraco.base.imagem, a.punho.imagem, a.base.imagem].filter((i) => i !== undefined);

  const arquivosDe = (a: AparenciaTaco): string[] => {
    const lista: string[] = [];
    for (const img of imagensDe(a)) {
      lista.push(img.cor);
      if (img.emissiva) lista.push(img.emissiva);
      if (img.metal) lista.push(img.metal);
      if (img.rara) lista.push(img.rara.cor);
      if (img.rara?.emissiva) lista.push(img.rara.emissiva);
      if (img.rara?.metal) lista.push(img.rara.metal);
    }
    return lista;
  };

  it('só as quatro do Pincel têm arte pintada', () => {
    for (const [id, a] of Object.entries(APARENCIAS_DO_TACO)) {
      expect(arquivosDe(a).length > 0, id).toBe(PINTADAS.includes(id as SkinTaco));
    }
  });

  it('todo PNG que a aparência pede existe em arte/skins/exportados/, com a variante rara, o brilho e a máscara de metal', () => {
    for (const id of PINTADAS) {
      const arquivos = arquivosDe(APARENCIAS_DO_TACO[id]);
      expect(arquivos.length, id).toBeGreaterThan(0);
      for (const f of arquivos) expect(existsSync(resolve(arte, f)), `${id}: ${f}`).toBe(true);
    }
  });

  it('a imagem rara tem o mesmo nome com `-raro` e o emissivo e o metal acompanham (o contrato do Pincel)', () => {
    for (const id of PINTADAS) {
      for (const img of imagensDe(APARENCIAS_DO_TACO[id])) {
        expect(img.rara?.cor, id).toBe(img.cor.replace('.png', '-raro.png'));
        if (img.emissiva) expect(img.rara?.emissiva, id).toBe(img.emissiva.replace('-emissivo.png', '-raro-emissivo.png'));
        if (img.metal) expect(img.rara?.metal, id).toBe(img.metal.replace('-metal.png', '-raro-metal.png'));
        if (img.emissiva) expect(img.intensidadeDoEmissivo, id).toBeGreaterThanOrEqual(1);
        if (img.emissiva) expect(img.intensidadeDoEmissivo, id).toBeLessThanOrEqual(3);
      }
    }
  });

  it('o Dragon Lore e o Howl usam as pinturas novas (`dragon-lore-*`, `howl-*`), nunca as antigas', () => {
    for (const f of arquivosDe(APARENCIAS_DO_TACO['dragao-das-quinze'])) expect(f, f).toMatch(/^dragon-lore-/);
    for (const f of arquivosDe(APARENCIAS_DO_TACO.corujao)) expect(f, f).toMatch(/^howl-/);
  });

  it('o olho do dragão acende menos que o sugerido (de perto saía creme): intensidade até 1,6', () => {
    for (const img of imagensDe(APARENCIAS_DO_TACO['dragao-das-quinze'])) if (img.emissiva) expect(img.intensidadeDoEmissivo ?? 1, img.cor).toBeLessThanOrEqual(1.6);
  });

  it('o ouro do dragão vai por máscara de metal no antebraço e na base', () => {
    const d = APARENCIAS_DO_TACO['dragao-das-quinze'];
    expect(d.antebraco.base.imagem?.metal).toBe('dragon-lore-antebraco-metal.png');
    expect(d.base.imagem?.metal).toBe('dragon-lore-base-metal.png');
    expect(d.antebraco.base.imagem?.rara?.metal).toBe('dragon-lore-antebraco-raro-metal.png');
  });

  it('a skin rara da pintada vem do catálogo: Ouro Verde (OURO VERDE) no Dragon Lore, Lobo da Geada (GEADA) no Howl', () => {
    expect(padraoDaSemente('dragao-das-quinze', sementeDe('dragao-das-quinze', 'OURO VERDE'))).toMatchObject({ nome: 'Ouro Verde', rara: true });
    expect(padraoDaSemente('corujao', sementeDe('corujao', 'GEADA'))).toMatchObject({ nome: 'Lobo da Geada', rara: true });
  });

  it('as peças com imagem são as que o taco sabe pintar', () => {
    expect(PARTES_COM_IMAGEM).toEqual(['haste', 'antebraco', 'punho', 'base']);
  });
});
