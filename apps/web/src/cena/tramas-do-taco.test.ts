import { describe, expect, it } from 'vitest';
import type { TramaGerada } from './aparencia-do-taco';
import { CONTADOR_PADRAO, PLACA_DO_CONTADOR, digitoDeSetesegmentos, imagemDaTrama, imagemDoContador, textoDoContador, type ContextoDaTrama } from './tramas-do-taco';
import { variacaoDaSemente } from './variacao-da-semente';

const TRAMAS: readonly TramaGerada[] = [
  { tipo: 'marmore', cores: [0xc8202a, 0xf3eee4, 0x1c1c24], turbulencia: 0.8 },
  { tipo: 'degrade', paradas: [{ de: 0, cor: 0xffb347 }, { de: 0.5, cor: 0xb45f06 }, { de: 1, cor: 0x4a2503 }] },
  { tipo: 'tempera', paleta: [0x1c3fa8, 0x2a54d6, 0xd9a336], foco: 0.5, dominante: 0.4 },
  { tipo: 'facetas', cor: 0x1f8f5a, facetas: 8 },
  { tipo: 'xadrez', cores: [0x2a5db0, 0xf3eee4], casas: 6 },
  { tipo: 'rede', fundo: 0x151b26, fio: 0x4a5878, malhas: 8, espessura: 0.22 },
  { tipo: 'paineis', painel: 0x161a20, junta: 0x0a0c10, led: [0x39ff6a, 0xffa31a], colunas: 3 },
  { tipo: 'tempera', paleta: [0x262c38, 0x3e4b66, 0xcfa23c, 0x8c5b2a, 0x6b3a9e, 0x1c3fb8, 0x2f5fe0, 0x5a90ff], foco: 0.82, dominante: 0.78, torcao: 1 },
  { tipo: 'veus', base: 0x0a0a10, camadas: [{ cor: 0x1a4fd8, cobertura: 0.45 }, { cor: 0x6a2ab0, cobertura: 0.32 }, { cor: 0xd4162c, cobertura: 0.34, brilho: 0.4 }], turbulencia: 1 },
  { tipo: 'fade', paradas: [{ de: 0, cor: 0xffd23c }, { de: 0.5, cor: 0xff5a9a }, { de: 1, cor: 0x7a2ab8 }], empurrao: 0.5, onda: 0.08 },
  { tipo: 'fadeMarmore', paradas: [{ de: 0, cor: 0xff6a1a }, { de: 0.5, cor: 0xffd23c }, { de: 1, cor: 0x2a5de0 }], turbulencia: 1 },
  { tipo: 'teia', fundo: 0x050304, fio: 0xd2182a, celulas: 1, raios: 8, aneis: 5, espessura: 0.017 },
  { tipo: 'scifi', painel: 0xe8e6e0, junta: 0x2a2c30, faixa: 0x14161a, detalhe: 0xff7a1a, colunas: 3 },
];

const contexto = (semente: number | null, detalhe: ContextoDaTrama['detalhe'] = 'cheio'): ContextoDaTrama => ({
  tamanho: { largura: 64, altura: 128 },
  proporcao: 8,
  noTaco: { de: 0.3, ate: 0.65 },
  variacao: variacaoDaSemente(semente),
  detalhe,
});

const igual = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

describe.each(TRAMAS.map((t) => [t.tipo, t] as const))('trama %s', (_nome, trama) => {
  it('gera a imagem no tamanho pedido, opaca, sem NaN', () => {
    const g = imagemDaTrama(trama, contexto(347));
    expect(g.cor.largura).toBe(64);
    expect(g.cor.altura).toBe(128);
    expect(g.cor.dados).toHaveLength(64 * 128 * 4);
    for (let i = 3; i < g.cor.dados.length; i += 4) expect(g.cor.dados[i]).toBe(255);
    expect(new Set(g.cor.dados).size).toBeGreaterThan(1);
  });

  it('é determinística: a mesma semente dá os mesmos pixels (cor, brilho e relevo)', () => {
    const a = imagemDaTrama(trama, contexto(347));
    const b = imagemDaTrama(trama, contexto(347));
    expect(igual(a.cor.dados, b.cor.dados)).toBe(true);
    if (a.emissiva) expect(igual(a.emissiva.dados, b.emissiva!.dados)).toBe(true);
    if (a.relevo) expect(igual(a.relevo.dados, b.relevo!.dados)).toBe(true);
  });

  it('a semente altera o padrão: outra semente dá outra imagem (e o taco de fábrica, outra ainda)', () => {
    const a = imagemDaTrama(trama, contexto(347)).cor.dados;
    expect(igual(a, imagemDaTrama(trama, contexto(348)).cor.dados)).toBe(false);
    expect(igual(a, imagemDaTrama(trama, contexto(null)).cor.dados)).toBe(false);
  });

  it('o nível simples (baixa) não gera relevo', () => {
    expect(imagemDaTrama(trama, contexto(347, 'simples')).relevo).toBeNull();
  });
});

describe('as tramas que acendem', () => {
  it('os painéis do placar acendem os LEDs (o brilho tem pixels acesos sobre o preto)', () => {
    const g = imagemDaTrama(TRAMAS[6]!, contexto(10));
    expect(g.emissiva).not.toBeNull();
    const acesos = [...g.emissiva!.dados].filter((v, i) => i % 4 !== 3 && v > 30).length;
    expect(acesos).toBeGreaterThan(20);
  });

  it('a gema (facetas) tem relevo no nível cheio: cada face é uma inclinação diferente', () => {
    const g = imagemDaTrama(TRAMAS[3]!, contexto(10));
    expect(g.relevo).not.toBeNull();
    expect(new Set(g.relevo!.dados).size).toBeGreaterThan(10);
  });
});

describe('os acabamentos do L36', () => {
  it('um tipo de trama desconhecido lança, em vez de devolver uma imagem em branco', () => {
    expect(() => imagemDaTrama({ tipo: 'nada' } as unknown as TramaGerada, contexto(1))).toThrow();
  });

  it('a Têmpera dominante em azul é mais azul que a equilibrada (o `dominante` puxa a paleta para o `foco`)', () => {
    const paleta = [0x262c38, 0x3e4b66, 0xcfa23c, 0x8c5b2a, 0x6b3a9e, 0x1c3fb8, 0x2f5fe0, 0x5a90ff];
    const azulado = (dominante: number): number => {
      const { dados } = imagemDaTrama({ tipo: 'tempera', paleta, foco: 0.82, dominante }, contexto(5)).cor;
      let r = 0;
      let b = 0;
      for (let i = 0; i < dados.length; i += 4) {
        r += dados[i]!;
        b += dados[i + 2]!;
      }
      return b / r;
    };
    expect(azulado(0.9)).toBeGreaterThan(azulado(0.1));
  });

  it('a Fade muda de lugar com a semente (a porcentagem), e o nível simples gera o mesmo desenho com menos ruído', () => {
    const fade = TRAMAS.find((t) => t.tipo === 'fade')!;
    expect(igual(imagemDaTrama(fade, contexto(10)).cor.dados, imagemDaTrama(fade, contexto(11)).cor.dados)).toBe(false);
    expect(imagemDaTrama(fade, contexto(10, 'simples')).cor.dados).toHaveLength(64 * 128 * 4);
  });
});

describe('o degradê é contínuo de uma peça à outra', () => {
  it('a cor da ponta de uma peça é a da ponta da outra no mesmo ponto do taco', () => {
    const a = imagemDaTrama(TRAMAS[1]!, { ...contexto(null), noTaco: { de: 0.2, ate: 0.5 } }).cor;
    const b = imagemDaTrama(TRAMAS[1]!, { ...contexto(null), noTaco: { de: 0.5, ate: 0.8 } }).cor;
    const ultima = (i: typeof a): number[] => [...i.dados.slice((i.altura - 1) * i.largura * 4, (i.altura - 1) * i.largura * 4 + 3)];
    const primeira = (i: typeof a): number[] => [...i.dados.slice(0, 3)];
    const fim = ultima(a);
    const comeco = primeira(b);
    for (let c = 0; c < 3; c++) expect(Math.abs(fim[c]! - comeco[c]!)).toBeLessThanOrEqual(6);
  });
});

describe('o contador de bolas', () => {
  it('são quatro dígitos com zeros à esquerda; passa de 9999 e fica 9999; negativo e fração não quebram', () => {
    expect(textoDoContador(0)).toBe('0000');
    expect(textoDoContador(42)).toBe('0042');
    expect(textoDoContador(347)).toBe('0347');
    expect(textoDoContador(9999)).toBe('9999');
    expect(textoDoContador(123_456)).toBe('9999');
    expect(textoDoContador(-3)).toBe('0000');
    expect(textoDoContador(7.9)).toBe('0007');
  });

  it('o sete segmentos: o 8 acende mais que o 1, e o 1 mais que nada fora do dígito', () => {
    const area = (d: number): number => {
      let soma = 0;
      for (let y = 0; y < 40; y++) for (let x = 0; x < 24; x++) soma += digitoDeSetesegmentos(d, (x + 0.5) / 24, (y + 0.5) / 40);
      return soma;
    };
    expect(area(8)).toBeGreaterThan(area(1));
    expect(area(8)).toBeGreaterThan(area(7));
    expect(area(1)).toBeGreaterThan(0);
    expect(digitoDeSetesegmentos(8, 3, 3)).toBe(0);
  });

  it('a placa tem a cor e o brilho da imagem; o brilho de 8888 acende mais pixels que o de 0001, e cada número é uma imagem', () => {
    const tam = { largura: 128, altura: 64 };
    const acesos = (bolas: number): number => {
      const { emissiva } = imagemDoContador(bolas, tam);
      let n = 0;
      for (let i = 0; i < emissiva.dados.length; i += 4) if (emissiva.dados[i]! > 40) n++;
      return n;
    };
    expect(acesos(8888)).toBeGreaterThan(acesos(1));
    expect(acesos(1)).toBeGreaterThan(0);
    const a = imagemDoContador(42, tam);
    const b = imagemDoContador(43, tam);
    expect(igual(a.cor.dados, b.cor.dados)).toBe(false);
    expect(igual(a.emissiva.dados, imagemDoContador(42, tam).emissiva.dados)).toBe(true);
    expect(a.cor.dados).toHaveLength(128 * 64 * 4);
  });

  it('fora da placa de cantos redondos a imagem é transparente (o canto do retângulo), dentro dela é opaca', () => {
    const { cor } = imagemDoContador(1234, { largura: 128, altura: 64 });
    expect(cor.dados[3]).toBe(0);
    expect(cor.dados[(32 * 128 + 4) * 4 + 3]).toBeGreaterThan(200);
  });

  it('o estilo padrão é LED âmbar sobre placa escura, e a placa cabe no cabo', () => {
    expect(CONTADOR_PADRAO).toEqual({ led: 0xffa31a, placa: 0x0b0c10 });
    expect(PLACA_DO_CONTADOR.comprimento).toBeGreaterThan(PLACA_DO_CONTADOR.largura);
    expect(PLACA_DO_CONTADOR.largura).toBeLessThan(0.5);
  });
});
