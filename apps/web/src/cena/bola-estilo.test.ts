import { describe, expect, it } from 'vitest';
import { PRESET_BOTECO, PRESET_MATA_MATA, bolasDaCasa, type ConfigRegras } from '@sinuca/regras';
import { CONFIG_WEB } from '../config';
import { corDaBola, corNoEstilo, estiloDaBola, fichaDaBola, fundoCssDaFicha, MARFIM, planoDeCor } from './bola-estilo';

const BOTECO = PRESET_BOTECO.regras;
const CASA_1_15: Pick<ConfigRegras, 'bolas' | 'bolaFinal'> = { bolas: '1-15', bolaFinal: 1 };
const CASA_2_15: Pick<ConfigRegras, 'bolas' | 'bolaFinal'> = { bolas: '2-15', bolaFinal: 'ultima-do-grupo' };

describe('estilo da bola pela regra (ímpar listrada, par lisa)', () => {
  it('no Boteco as ímpares são listradas e as pares são lisas', () => {
    for (const n of [3, 5, 7, 9, 11, 13]) expect(estiloDaBola(n, BOTECO)).toBe('listrada');
    for (const n of [2, 4, 6, 10, 12, 14]) expect(estiloDaBola(n, BOTECO)).toBe('lisa');
  });

  it('a bola final (a 8) é lisa e preta, e nenhuma bola dos grupos tem a cor dela', () => {
    expect(estiloDaBola(8, BOTECO)).toBe('lisa');
    expect(corDaBola(8)).toBe('#121212');
    const dosGrupos = bolasDaCasa(BOTECO).filter((n) => n !== 8);
    for (const n of dosGrupos) expect(corDaBola(n)).not.toBe(corDaBola(8));
  });

  it('o estilo vem do grupo, não do número: na casa 1–15 a final (a 1, ímpar) é lisa e as outras ímpares seguem listradas', () => {
    expect(estiloDaBola(1, CASA_1_15)).toBe('lisa');
    for (const n of [3, 5, 7, 9, 11, 13, 15]) expect(estiloDaBola(n, CASA_1_15)).toBe('listrada');
    for (const n of [2, 4, 6, 8, 10, 12, 14]) expect(estiloDaBola(n, CASA_1_15)).toBe('lisa');
  });

  it('na casa 2–15 sem bola final a 15 é listrada e a 8 é lisa como qualquer par', () => {
    expect(estiloDaBola(15, CASA_2_15)).toBe('listrada');
    expect(estiloDaBola(8, CASA_2_15)).toBe('lisa');
    expect(estiloDaBola(9, CASA_2_15)).toBe('listrada');
  });

  it('trocar de casa troca o desenho da mesma bola', () => {
    expect(estiloDaBola(15, BOTECO)).toBe('lisa');
    expect(estiloDaBola(15, CASA_1_15)).toBe('listrada');
    expect(estiloDaBola(3, BOTECO)).toBe(estiloDaBola(3, CASA_1_15));
  });

  it('a ficha leva o número e o estilo da bola na casa', () => {
    expect(fichaDaBola(9, BOTECO)).toEqual({ id: 9, estilo: 'listrada' });
    expect(fichaDaBola(10, BOTECO)).toEqual({ id: 10, estilo: 'lisa' });
    expect(fichaDaBola(1, CASA_1_15)).toEqual({ id: 1, estilo: 'lisa' });
  });
});

// ---- ciência das cores do teste: ΔE76 no Lab (luz neutra), com a visão normal e as simulações de daltonismo
// (Machado et al. 2009, severidade 1, no RGB linear).
type Vet = readonly [number, number, number];
const DEUTERANOPIA: readonly Vet[] = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
const PROTANOPIA: readonly Vet[] = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];
type Visao = 'normal' | 'deuteranopia' | 'protanopia';

function linear(hex: string): Vet {
  const canal = (i: number): number => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [canal(0), canal(1), canal(2)];
}

function lab(hex: string, visao: Visao): Vet {
  let rgb = linear(hex);
  const matriz = visao === 'deuteranopia' ? DEUTERANOPIA : visao === 'protanopia' ? PROTANOPIA : null;
  if (matriz) rgb = matriz.map((l) => Math.min(1, Math.max(0, l[0] * rgb[0] + l[1] * rgb[1] + l[2] * rgb[2]))) as unknown as Vet;
  const [r, g, b] = rgb;
  const xyz = [0.4124 * r + 0.3576 * g + 0.1805 * b, 0.2126 * r + 0.7152 * g + 0.0722 * b, 0.0193 * r + 0.1192 * g + 0.9505 * b];
  const [fx, fy, fz] = [xyz[0]! / 0.95047, xyz[1]!, xyz[2]! / 1.08883].map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)) as unknown as Vet;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deltaE = (a: string, b: string, visao: Visao = 'normal'): number => Math.hypot(...lab(a, visao).map((v, i) => v - lab(b, visao)[i]!));

function menorDistancia(cores: readonly string[], visao: Visao): number {
  let menor = Infinity;
  for (let i = 0; i < cores.length; i++) for (let j = i + 1; j < cores.length; j++) menor = Math.min(menor, deltaE(cores[i]!, cores[j]!, visao));
  return menor;
}

const PANO = '#' + CONFIG_WEB.mesa.cores.pano.toString(16).padStart(6, '0');
const PRETO = corDaBola(8);
const CASAS: Record<string, Pick<ConfigRegras, 'bolas' | 'bolaFinal'>> = {
  Boteco: BOTECO,
  '1–15 (a 1 é o castigo)': CASA_1_15,
  '2–15 sem bola final': CASA_2_15,
};

describe('cores por número: cada bola de um grupo tem a sua', () => {
  it.each(Object.entries(CASAS))('%s: as lisas são todas de cor diferente e as listradas também (a mesma cor pode estar uma vez em cada grupo)', (_nome, casa) => {
    for (const estilo of ['lisa', 'listrada'] as const) {
      const numeros = bolasDaCasa(casa as ConfigRegras).filter((n) => estiloDaBola(n, casa) === estilo);
      const cores = numeros.map((n) => corDaBola(n));
      expect(new Set(cores).size, `${estilo}: ${numeros.join(', ')}`).toBe(numeros.length);
    }
  });

  it('a 8 continua preta, e nenhuma outra bola está perto do preto', () => {
    expect(corDaBola(8)).toBe('#121212');
    for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]) expect(deltaE(corDaBola(n), PRETO), `bola ${n}`).toBeGreaterThan(25);
  });

  it('o Boteco: 6 lisas (2, 4, 6, 10, 12, 14) e 6 listradas (3, 5, 7, 9, 11, 13) com as cores de cada paleta', () => {
    const lisas = [2, 4, 6, 10, 12, 14].map(corDaBola);
    const listradas = [3, 5, 7, 9, 11, 13].map(corDaBola);
    expect(new Set(lisas).size).toBe(6);
    expect(new Set(listradas).size).toBe(6);
  });

  it('a cor não depende do estilo da casa: é a mesma bola em qualquer casa', () => {
    expect(corDaBola(5)).toBe(corDaBola(5));
    expect(planoDeCor(5, 'listrada').faixa).toBe(corDaBola(5));
    expect(planoDeCor(5, 'lisa').fundo).toBe(corDaBola(5));
  });

  it('recusa número fora de 1–15', () => {
    expect(() => corDaBola(0)).toThrow(RangeError);
    expect(() => corDaBola(16)).toThrow(RangeError);
    expect(() => corDaBola(2.5)).toThrow(RangeError);
  });
});

describe('cores por número: contraste', () => {
  const lisas = [2, 4, 6, 10, 12, 14].map(corDaBola);
  const listradas = [3, 5, 7, 9, 11, 13].map(corDaBola);

  it.each(['normal', 'deuteranopia', 'protanopia'] as const)('as cores de um mesmo grupo se distinguem entre si (%s)', (visao) => {
    const minimo = { normal: 35, deuteranopia: 15, protanopia: 18 }[visao];
    expect(menorDistancia(lisas, visao), 'lisas').toBeGreaterThan(minimo);
    expect(menorDistancia(listradas, visao), 'listradas').toBeGreaterThan(minimo);
  });

  it.each(['normal', 'deuteranopia', 'protanopia'] as const)('as lisas aparecem no pano verde (%s)', (visao) => {
    const minimo = { normal: 50, deuteranopia: 17, protanopia: 20 }[visao];
    for (const cor of lisas) expect(deltaE(cor, PANO, visao), cor).toBeGreaterThan(minimo);
  });

  it.each(['normal', 'deuteranopia', 'protanopia'] as const)('a faixa das listradas aparece no marfim (%s)', (visao) => {
    const minimo = { normal: 40, deuteranopia: 25, protanopia: 25 }[visao];
    for (const cor of listradas) expect(deltaE(cor, MARFIM, visao), cor).toBeGreaterThan(minimo);
  });

  it('nenhuma cor de grupo é verde (confunde com o pano)', () => {
    for (let n = 1; n <= 15; n++) {
      if (n === 8) continue;
      const [, a, b] = lab(corDaBola(n), 'normal');
      // No Lab, verde é a* bem negativo e b* positivo.
      expect(a < -25 && b > 0, `bola ${n}`).toBe(false);
    }
  });
});

describe('desenho: plano de cor e fundo da ficha', () => {
  it('lisa: o corpo todo na cor do número, sem faixa', () => {
    expect(planoDeCor(4, 'lisa')).toEqual({ fundo: corDaBola(4), faixa: null });
  });

  it('listrada: corpo marfim e faixa na cor do número', () => {
    expect(planoDeCor(11, 'listrada')).toEqual({ fundo: MARFIM, faixa: corDaBola(11) });
  });

  it('a ficha lisa é só a cor; a listrada tem marfim em cima e embaixo e a cor no meio (como a faixa da bola)', () => {
    expect(fundoCssDaFicha(6, 'lisa')).toBe(corDaBola(6));
    const css = fundoCssDaFicha(13, 'listrada');
    expect(css).toBe(`linear-gradient(to bottom, ${MARFIM} 0 25%, ${corDaBola(13)} 25% 75%, ${MARFIM} 75% 100%)`);
  });
});

// ---------------------------------------------------------------- L17: o mata-mata segue a convenção do par ou ímpar

const MATA_MATA = PRESET_MATA_MATA.regras;

describe('estilo da bola no mata-mata (as 15 bolas, sem grupos nem bola final)', () => {
  it('ímpar listrada e par lisa, as 15: o desenho segue a regra, sem depender de haver grupo', () => {
    for (const n of [1, 3, 5, 7, 9, 11, 13, 15]) expect(estiloDaBola(n, MATA_MATA), `bola ${n}`).toBe('listrada');
    for (const n of [2, 4, 6, 8, 10, 12, 14]) expect(estiloDaBola(n, MATA_MATA), `bola ${n}`).toBe('lisa');
  });

  it('a 8 é lisa e preta, como no par ou ímpar', () => {
    expect(estiloDaBola(8, MATA_MATA)).toBe('lisa');
    expect(planoDeCor(8, 'lisa')).toEqual({ fundo: '#121212', faixa: null });
  });

  it('a ficha do placar leva o mesmo estilo', () => {
    expect(fichaDaBola(1, MATA_MATA)).toEqual({ id: 1, estilo: 'listrada' });
    expect(fichaDaBola(15, MATA_MATA)).toEqual({ id: 15, estilo: 'listrada' });
    expect(fichaDaBola(12, MATA_MATA)).toEqual({ id: 12, estilo: 'lisa' });
  });

  it('o par ou ímpar não mudou: a 1 fora da casa é lisa e na casa antiga também', () => {
    expect(estiloDaBola(1, BOTECO)).toBe('lisa');
    expect(estiloDaBola(1, CASA_1_15)).toBe('lisa');
    expect(estiloDaBola(15, BOTECO)).toBe('lisa');
  });
});

describe('cores do mata-mata: cada bola de um estilo tem a sua', () => {
  const listradas = [1, 3, 5, 7, 9, 11, 13, 15];
  const lisas = [2, 4, 6, 8, 10, 12, 14];
  const doEstilo = (numeros: readonly number[], estilo: 'lisa' | 'listrada'): string[] => numeros.map((n) => corNoEstilo(n, estilo));

  it('as 8 listradas têm cor própria: a 1 não repete o vinho da 15', () => {
    const cores = doEstilo(listradas, 'listrada');
    expect(new Set(cores).size).toBe(8);
    expect(corNoEstilo(1, 'listrada')).not.toBe(corNoEstilo(15, 'listrada'));
  });

  it('as 7 lisas (a 8 preta entre elas) também', () => {
    expect(new Set(doEstilo(lisas, 'lisa')).size).toBe(7);
  });

  it('a cor não depende do estilo, menos a 1: lisa (casa antiga) vinho, listrada (mata-mata) salmão', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) expect(corNoEstilo(n, 'lisa')).toBe(corNoEstilo(n, 'listrada'));
    expect(corNoEstilo(1, 'lisa')).toBe(corDaBola(1));
    expect(corNoEstilo(1, 'lisa')).not.toBe(corNoEstilo(1, 'listrada'));
    expect(planoDeCor(1, 'listrada').faixa).toBe(corNoEstilo(1, 'listrada'));
    expect(planoDeCor(1, 'lisa').fundo).toBe(corNoEstilo(1, 'lisa'));
  });

  it.each(['normal', 'deuteranopia', 'protanopia'] as const)('as 8 listradas se distinguem entre si e a faixa aparece no marfim (%s)', (visao) => {
    const cores = doEstilo(listradas, 'listrada');
    // com a 1 e a 15 a paleta aperta: a margem é a do par vinho-vermelho, que já existia na 15
    expect(menorDistancia(cores, visao)).toBeGreaterThan({ normal: 25, deuteranopia: 15, protanopia: 15 }[visao]);
    for (const cor of cores) expect(deltaE(cor, MARFIM, visao), cor).toBeGreaterThan({ normal: 40, deuteranopia: 25, protanopia: 25 }[visao]);
  });

  it.each(['normal', 'deuteranopia', 'protanopia'] as const)('as 7 lisas se distinguem entre si e aparecem no pano (%s)', (visao) => {
    const cores = doEstilo(lisas, 'lisa').filter((c) => c !== corDaBola(8));
    expect(menorDistancia(cores, visao)).toBeGreaterThan({ normal: 35, deuteranopia: 15, protanopia: 18 }[visao]);
    for (const cor of cores) expect(deltaE(cor, PANO, visao), cor).toBeGreaterThan({ normal: 50, deuteranopia: 17, protanopia: 20 }[visao]);
  });

  it('nenhuma cor do mata-mata é verde nem perto do preto da 8', () => {
    for (let n = 1; n <= 15; n++) {
      if (n === 8) continue;
      for (const estilo of ['lisa', 'listrada'] as const) {
        const cor = corNoEstilo(n, estilo);
        const [, a, b] = lab(cor, 'normal');
        expect(a < -25 && b > 0, `${n} ${estilo}`).toBe(false);
        expect(deltaE(cor, PRETO), `${n} ${estilo}`).toBeGreaterThan(25);
      }
    }
  });

  it('recusa número fora de 1–15', () => {
    expect(() => corNoEstilo(0, 'lisa')).toThrow(RangeError);
    expect(() => corNoEstilo(16, 'listrada')).toThrow(RangeError);
  });
});
