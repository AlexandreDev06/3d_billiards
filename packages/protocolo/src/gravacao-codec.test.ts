import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, type EventoTacada, type Gravacao } from '@sinuca/fisica';
import { decodificarGravacao, codificarGravacao, LIMITES_GRAVACAO } from './gravacao-codec';
import { LeituraInvalida } from './bytes';
import { bytesDeGravacaoBomba, TACADA_SUAVE, maiorErroAngular, maiorErroDePosicao, partidaReal, quebraComBolaCaida, tacadaReal } from './para-testes';

const MM = 1e-3;
const GRAU = Math.PI / 180;

const quebra = quebraComBolaCaida().resultado.gravacao;
const suave = tacadaReal(partidaReal(2).mesa, TACADA_SUAVE).gravacao;

function sintetica(quadros: number, bolas: number, preencher: (q: number, i: number) => { p: number[]; o: number[]; na?: number }, eventos: EventoTacada[] = [{ tipo: 'parou', t: 1 }]): Gravacao {
  const posicoes = new Float32Array(quadros * bolas * 3);
  const orientacoes = new Float32Array(quadros * bolas * 4);
  const naMesa = new Uint8Array(quadros * bolas).fill(1);
  for (let q = 0; q < quadros; q++) {
    for (let i = 0; i < bolas; i++) {
      const { p, o, na } = preencher(q, i);
      posicoes.set(p, (q * bolas + i) * 3);
      orientacoes.set(o, (q * bolas + i) * 4);
      if (na !== undefined) naMesa[q * bolas + i] = na;
    }
  }
  return { frequencia: 60, ids: Array.from({ length: bolas }, (_, i) => i), quadros, duracao: (quadros - 1) / 60, posicoes, orientacoes, naMesa, eventos };
}

describe('codec da gravação — ida e volta', () => {
  it('devolve a quebra real com posição < 0,5 mm, naMesa idêntico e eventos exatos', () => {
    const volta = decodificarGravacao(codificarGravacao(quebra));
    expect(volta.frequencia).toBe(quebra.frequencia);
    expect(volta.quadros).toBe(quebra.quadros);
    expect(volta.duracao).toBe(quebra.duracao);
    expect([...volta.ids]).toEqual([...quebra.ids]);
    expect(volta.eventos).toEqual(quebra.eventos);
    expect([...volta.naMesa]).toEqual([...quebra.naMesa]);
    expect(maiorErroDePosicao(quebra, volta)).toBeLessThan(0.5 * MM);
    expect(maiorErroAngular(quebra, volta)).toBeLessThan(0.5 * GRAU);
  });

  it('a quebra tem bola caindo (naMesa muda de 1 para 0), então a prova de naMesa não é vazia', () => {
    const caiu = quebra.eventos.some((e) => e.tipo === 'cacapa');
    expect(caiu).toBe(true);
    expect(quebra.naMesa.includes(0)).toBe(true);
  });

  it('devolve a tacada suave com a mesma precisão', () => {
    const volta = decodificarGravacao(codificarGravacao(suave));
    expect(maiorErroDePosicao(suave, volta)).toBeLessThan(0.5 * MM);
    expect(maiorErroAngular(suave, volta)).toBeLessThan(0.5 * GRAU);
    expect([...volta.naMesa]).toEqual([...suave.naMesa]);
  });

  it('é determinístico: a mesma gravação dá os mesmos bytes', () => {
    expect(codificarGravacao(quebra)).toEqual(codificarGravacao(quebra));
  });

  it('mantém posição e rotação das bolas que não se mexem exatamente no mesmo lugar', () => {
    const volta = decodificarGravacao(codificarGravacao(suave));
    const n = suave.ids.length;
    for (let i = 0; i < n; i++) {
      const imovel = Array.from({ length: suave.quadros }, (_, q) => suave.posicoes[(q * n + i) * 3]).every((x) => x === suave.posicoes[i * 3]);
      if (!imovel) continue;
      for (let q = 1; q < suave.quadros; q++) {
        for (let c = 0; c < 3; c++) expect(volta.posicoes[(q * n + i) * 3 + c]).toBe(volta.posicoes[i * 3 + c]);
      }
    }
  });

  it('aceita todas as formas de quaternion: componente maior em cada eixo, sinal trocado e não unitário', () => {
    const r = Math.SQRT1_2;
    const quats = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [0, 0, 0, -1],
      [-r, 0, 0, -r],
      [0.5, -0.5, 0.5, -0.5],
      [0.3, 0.4, -0.5, 0.2],
      [0.001, 0.002, 0.003, 0.999995],
    ];
    const g = sintetica(quats.length, 1, (q) => ({ p: [0, 0.027, 0], o: quats[q]! }));
    const volta = decodificarGravacao(codificarGravacao(g));
    expect(maiorErroAngular(g, volta)).toBeLessThan(0.5 * GRAU);
  });

  it('bola fora da faixa da mesa (queda longa) e eventos de todos os tipos voltam iguais', () => {
    const eventos: EventoTacada[] = [
      { tipo: 'taco-bola', t: 0, bola: 0, velocidade: 3.25, miscue: true },
      { tipo: 'bola-bola', t: 0.123456789012345, a: 0, b: 7, velocidade: 1.5 },
      { tipo: 'bola-tabela', t: 0.5, bola: 7, tabela: 3, velocidade: 0.7 },
      { tipo: 'cacapa', t: 0.9, bola: 7, cacapa: 'canto-x+z+' },
      { tipo: 'fora-da-mesa', t: 0.95, bola: 3 },
      { tipo: 'parou', t: 1 },
    ];
    const g = sintetica(
      61,
      2,
      (q, i) => ({ p: i === 0 ? [q * 0.001, 0.027, 0] : [1.5, -q * 0.25, 2.5], o: [0, 0, 0, 1], na: i === 1 && q > 50 ? 0 : 1 }),
      eventos,
    );
    const volta = decodificarGravacao(codificarGravacao(g));
    expect(volta.eventos).toEqual(eventos);
    expect(maiorErroDePosicao(g, volta)).toBeLessThan(0.5 * MM);
    expect([...volta.naMesa]).toEqual([...g.naMesa]);
  });

  it('naMesa que volta a 1 (bola devolvida) também passa', () => {
    const g = sintetica(10, 1, (q) => ({ p: [0, 0.027, 0], o: [0, 0, 0, 1], na: q >= 3 && q < 6 ? 0 : 1 }));
    expect([...decodificarGravacao(codificarGravacao(g)).naMesa]).toEqual([...g.naMesa]);
  });

  it('uma gravação de um quadro e sem bolas em movimento funciona', () => {
    const g = sintetica(1, 3, (_, i) => ({ p: [i * 0.1, 0.027, 0], o: [0, 0, 0, 1] }));
    const volta = decodificarGravacao(codificarGravacao(g));
    expect(volta.quadros).toBe(1);
    expect(maiorErroDePosicao(g, volta)).toBeLessThan(0.5 * MM);
  });
});

describe('codec da gravação — tamanho no fio', () => {
  it('tacada típica < 50 KB e quebra < 150 KB', () => {
    const tipica = codificarGravacao(suave).length;
    const grande = codificarGravacao(quebra).length;
    expect(tipica).toBeLessThan(50_000);
    expect(grande).toBeLessThan(150_000);
  });

  it('bolas paradas não se repetem: 16 bolas imóveis por 10 s cabem em menos de 400 bytes', () => {
    const g = sintetica(601, 16, (_, i) => ({ p: [i * 0.07 - 0.5, 0.027, 0.1], o: [0, 0, 0, 1] }));
    expect(codificarGravacao(g).length).toBeLessThan(400);
  });

  it('quebra de verdade é muito menor que o Float32 cru', () => {
    const cru = quebra.posicoes.byteLength + quebra.orientacoes.byteLength + quebra.naMesa.byteLength;
    expect(codificarGravacao(quebra).length).toBeLessThan(cru / 5);
  });
});

describe('codec da gravação — entrada hostil', () => {
  const ok = codificarGravacao(suave);

  it('recusa dados vazios, cabeçalho errado e cauda sobrando', () => {
    expect(() => decodificarGravacao(new Uint8Array(0))).toThrow(LeituraInvalida);
    const outraVersao = ok.slice();
    outraVersao[0] = 0;
    expect(() => decodificarGravacao(outraVersao)).toThrow(LeituraInvalida);
    expect(() => decodificarGravacao(Uint8Array.from([...ok, 0]))).toThrow(LeituraInvalida);
  });

  it('recusa qualquer truncamento sem lançar outra coisa', () => {
    for (let corte = 0; corte < ok.length; corte += Math.max(1, Math.floor(ok.length / 200))) {
      expect(() => decodificarGravacao(ok.slice(0, corte)), `corte em ${corte}`).toThrow(LeituraInvalida);
    }
  });

  it('bytes aleatórios só lançam LeituraInvalida (nunca outro erro nem laço infinito)', () => {
    let s = 12345;
    const prox = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) & 0xff);
    for (let n = 0; n < 300; n++) {
      const b = Uint8Array.from({ length: 5 + (n % 60) }, prox);
      b[0] = ok[0]!;
      try {
        decodificarGravacao(b);
      } catch (e) {
        expect(e).toBeInstanceOf(LeituraInvalida);
      }
    }
  });

  it('recusa quadros e bolas acima do limite antes de alocar', () => {
    const g = sintetica(2, 1, () => ({ p: [0, 0.027, 0], o: [0, 0, 0, 1] }));
    const bytes = codificarGravacao(g);
    const grande = { ...g, quadros: LIMITES_GRAVACAO.quadros + 1 };
    expect(() => codificarGravacao(grande)).toThrow();
    // cabeçalho: magia, versão, f64, f64, depois o varint de quadros (aqui 1 byte): troca por um valor enorme
    const forjado = Uint8Array.from([...bytes.slice(0, 18), 0xff, 0xff, 0x7f, ...bytes.slice(19)]);
    expect(() => decodificarGravacao(forjado)).toThrow(LeituraInvalida);
  });

  it('recusa quadros absurdos no cabeçalho antes de alocar qualquer coisa', () => {
    const g = sintetica(2, 1, () => ({ p: [0, 0.027, 0], o: [0, 0, 0, 1] }));
    const bytes = codificarGravacao(g);
    // varint de 2^40 no lugar dos quadros: alocar Float32Array disso lançaria RangeError, não LeituraInvalida
    const enorme = Uint8Array.from([...bytes.slice(0, 18), 0x80, 0x80, 0x80, 0x80, 0x80, 0x20, ...bytes.slice(19)]);
    expect(() => decodificarGravacao(enorme)).toThrow(LeituraInvalida);
  });

  it('recusa bits de flags que o formato não define', () => {
    const g = sintetica(2, 1, () => ({ p: [0, 0.027, 0], o: [0, 0, 0, 1] }), [{ tipo: 'parou', t: 1 }]);
    const bytes = codificarGravacao(g);
    // depois das flags do quadro 1 vêm só os eventos: contagem (1), tipo (1) e t (8)
    const i = bytes.length - 11;
    expect(bytes[i]).toBe(0);
    for (const ruim of [0x20, 0x40]) {
      const forjado = bytes.slice();
      forjado[i] = ruim;
      expect(() => decodificarGravacao(forjado), `flags ${ruim}`).toThrow(LeituraInvalida);
    }
  });

  it('recusa uma corrida de quadros que passa do último quadro', () => {
    const parada = sintetica(10, 1, () => ({ p: [0, 0.027, 0], o: [0, 0, 0, 1] }));
    const bytes = codificarGravacao(parada);
    // depois do cabeçalho vem o quadro 0 (3 zigzags + 4 + 1 bytes); em seguida a corrida 0x80, extra
    const i = bytes.indexOf(0x80);
    expect(i).toBeGreaterThan(0);
    expect(bytes[i + 1]).toBe(10 - 1 - 2);
    const forjado = bytes.slice();
    forjado[i + 1] = 60;
    expect(() => decodificarGravacao(forjado)).toThrow(LeituraInvalida);
  });

  it('recusa gravação com buffers de tamanho incoerente ao codificar', () => {
    expect(() => codificarGravacao({ ...suave, posicoes: new Float32Array(3) })).toThrow();
    expect(() => codificarGravacao({ ...suave, naMesa: new Uint8Array(1) })).toThrow();
  });

  it('recusa números não finitos nos buffers ao codificar', () => {
    const p = new Float32Array(suave.posicoes);
    p[4] = Number.NaN;
    expect(() => codificarGravacao({ ...suave, posicoes: p })).toThrow();
  });
});

describe('codec da gravação — custo limitado pela física', () => {
  it('o teto de quadros é duracaoMaxima × frequência da física (+ o quadro 0): 3601, não 7200', () => {
    const { duracaoMaxima, frequenciaGravacao } = CONFIG_FISICA_PADRAO;
    expect(LIMITES_GRAVACAO.quadros).toBe(Math.ceil(duracaoMaxima * frequenciaGravacao) + 1);
    expect(LIMITES_GRAVACAO.quadros).toBe(3601);
    expect(LIMITES_GRAVACAO.duracao).toBe(duracaoMaxima);
  });

  it('uma gravação do tamanho máximo da física ida e volta; um quadro a mais não', () => {
    const max = LIMITES_GRAVACAO.quadros;
    const g = sintetica(max, 16, (_, i) => ({ p: [i * 0.05, 0.027, 0.1], o: [0, 0, 0, 1] }), [{ tipo: 'taco-bola', t: 0, bola: 0, velocidade: 1, miscue: false }, { tipo: 'parou', t: 60 }]);
    const cheia = { ...g, duracao: 60 };
    expect(decodificarGravacao(codificarGravacao(cheia)).quadros).toBe(max);
    expect(() => codificarGravacao({ ...cheia, quadros: max + 1, posicoes: new Float32Array((max + 1) * 48), orientacoes: new Float32Array((max + 1) * 64), naMesa: new Uint8Array((max + 1) * 16) })).toThrow();
  });

  it('a bomba de 7200 quadros × 16 bolas é recusada no cabeçalho, antes de alocar', () => {
    expect(() => decodificarGravacao(bytesDeGravacaoBomba(7200))).toThrow(LeituraInvalida);
    expect(() => decodificarGravacao(bytesDeGravacaoBomba(LIMITES_GRAVACAO.quadros + 1, 16, 60))).toThrow(LeituraInvalida);
  });

  it('a bomba dentro do teto ainda decodifica (o custo vem de quem tem a vez, e é limitado)', () => {
    const g = decodificarGravacao(bytesDeGravacaoBomba(LIMITES_GRAVACAO.quadros, 16, 60));
    expect(g.quadros).toBe(LIMITES_GRAVACAO.quadros);
  });

  it('o codificador também recusa quadros demais para a duração e duração acima da física', () => {
    const g = sintetica(3000, 1, () => ({ p: [0, 0.027, 0], o: [0, 0, 0, 1] }));
    expect(() => codificarGravacao({ ...g, duracao: 1 })).toThrow(RangeError);
    expect(() => codificarGravacao({ ...g, duracao: 61 })).toThrow(RangeError);
    expect(() => codificarGravacao({ ...g, duracao: 49.98 })).not.toThrow();
  });

  it('duração acima da física ou incoerente com os quadros é recusada', () => {
    expect(() => decodificarGravacao(bytesDeGravacaoBomba(100, 2, 61))).toThrow(LeituraInvalida);
    // 3000 quadros a 60 Hz declarando 1 s de duração: o custo não bate com o que a gravação diz ser
    expect(() => decodificarGravacao(bytesDeGravacaoBomba(3000, 2, 1))).toThrow(LeituraInvalida);
    expect(() => decodificarGravacao(bytesDeGravacaoBomba(100, 2, 99 / 60)).quadros).not.toThrow();
  });
});
