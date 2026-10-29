import { describe, expect, it } from 'vitest';
import {
  CONFIG_FISICA_PADRAO,
  ID_BOLAO,
  criarRng,
  mesaInicial,
  simularTacada,
  type EventoTacada,
  type Gravacao,
  type IdBola,
} from '@sinuca/fisica';
import { CaminhoPrevisto, extrairPrevisao, type ConfigExtracao } from './caminho';

const F = 60;
const CFG: ConfigExtracao = { comprimentoMaximo: 4, comprimentoBolaAtingida: 0.15, passoMinimo: 0.01 };

type Xz = readonly [number, number];

interface Desenho {
  readonly ids?: readonly IdBola[];
  readonly quadros: number;
  /** Centro (x, z) da bola no quadro `q`. */
  readonly posicao: (q: number, id: IdBola) => Xz;
  readonly naMesa?: (q: number, id: IdBola) => boolean;
  readonly eventos: readonly EventoTacada[];
}

function gravacao(d: Desenho): Gravacao {
  const ids = d.ids ?? [0];
  const posicoes = new Float32Array(d.quadros * ids.length * 3);
  const naMesa = new Uint8Array(d.quadros * ids.length);
  for (let q = 0; q < d.quadros; q++) {
    ids.forEach((id, i) => {
      const [x, z] = d.posicao(q, id);
      posicoes.set([x, 0.028, z], (q * ids.length + i) * 3);
      naMesa[q * ids.length + i] = (d.naMesa ?? (() => true))(q, id) ? 1 : 0;
    });
  }
  const duracao = (d.quadros - 1) / F;
  return {
    frequencia: F,
    ids,
    quadros: d.quadros,
    duracao,
    posicoes,
    orientacoes: new Float32Array(d.quadros * ids.length * 4),
    naMesa,
    eventos: [...d.eventos, { tipo: 'parou', t: duracao }],
  };
}

const taco: EventoTacada = { tipo: 'taco-bola', t: 0, bola: ID_BOLAO, velocidade: 2, miscue: false };

function pontos(c: CaminhoPrevisto): Xz[] {
  return Array.from({ length: c.quantidade }, (_, i) => [c.pontos[2 * i]!, c.pontos[2 * i + 1]!] as const);
}

describe('caminho do bolão', () => {
  it('sem eventos: sai da posição de partida e termina no repouso, com o comprimento percorrido', () => {
    // 1 m/s por 30 quadros em +x, depois parado.
    const g = gravacao({ quadros: 60, posicao: (q) => [Math.min(q, 30) / F, 0], eventos: [taco] });
    const c = extrairPrevisao(g, CFG);
    const p = pontos(c);
    expect(p[0]![0]).toBeCloseTo(0, 6);
    expect(p[p.length - 1]![0]).toBeCloseTo(0.5, 5);
    expect(c.fim).toBe('parou');
    expect(c.comprimento).toBeCloseTo(0.5, 5);
    expect(c.atingida.id).toBe(-1);
  });

  it('descarta quadros a menos de passoMinimo do último ponto e não repete o repouso', () => {
    const g = gravacao({ quadros: 200, posicao: (q) => [Math.min(q, 30) / F, 0], eventos: [taco] });
    const c = extrairPrevisao(g, CFG);
    // 0,5 m em passos de 1,67 cm (> 1 cm): um ponto por quadro até q = 30, mais o primeiro; o repouso entra uma vez.
    expect(c.quantidade).toBe(31);
    const lento = gravacao({ quadros: 200, posicao: (q) => [Math.min(q, 90) * 0.0011, 0], eventos: [taco] });
    const cl = extrairPrevisao(lento, CFG);
    // 1,1 mm por quadro: o ponto só entra com 10 mm ou mais do último, ou seja, a cada 10 quadros (0, 10, ..., 90).
    expect(cl.quantidade).toBe(10);
    expect(pontos(cl)[9]![0]).toBeCloseTo(0.099, 5);
    expect(cl.comprimento).toBeCloseTo(0.099, 5);
  });

  it('a batida na tabela entra no ponto exato do canto, não no canto cortado entre dois quadros', () => {
    // +1 m/s até a tabela em x = 0,5083 (entre os quadros 30 e 31); volta a −0,8 m/s.
    const xT = 0.5 + (1 / 60) * 0.5;
    const tT = xT / 1;
    const x = (q: number): number => (q / F < tT ? q / F : xT - 0.8 * (q / F - tT));
    const evento: EventoTacada = { tipo: 'bola-tabela', t: tT, bola: ID_BOLAO, tabela: 1, parte: 'nariz', velocidade: 1 };
    const g = gravacao({ quadros: 70, posicao: (q) => [x(q), 0], eventos: [taco, evento] });
    const p = pontos(extrairPrevisao(g, CFG));
    const canto = p.find(([px]) => Math.abs(px - xT) < 1e-5);
    expect(canto).toBeDefined();
    // Depois do canto o caminho volta (x diminui).
    const i = p.indexOf(canto!);
    expect(p[i + 1]![0]).toBeLessThan(xT);
    expect(p[i - 1]![0]).toBeLessThan(xT);
  });

  it('batida logo no primeiro quadro (sem quadro anterior): cai no quadro 0, sem inventar velocidade', () => {
    const xT = 0.004;
    const evento: EventoTacada = { tipo: 'bola-tabela', t: 0.004, bola: ID_BOLAO, tabela: 0, parte: 'nariz', velocidade: 1 };
    const g = gravacao({ quadros: 30, posicao: (q) => [q === 0 ? 0 : Math.max(xT - 0.5 * (q / F - 0.004), -2), 0], eventos: [taco, evento] });
    const c = extrairPrevisao(g, CFG);
    expect(c.quantidade).toBeGreaterThan(1);
    expect(pontos(c).every(([px, pz]) => Number.isFinite(px) && Number.isFinite(pz))).toBe(true);
  });

  it('batida de outra bola na tabela não cria ponto no caminho do bolão', () => {
    const g = gravacao({
      ids: [0, 4],
      quadros: 40,
      posicao: (q, id) => (id === 0 ? [Math.min(q, 30) / F, 0] : [1, 0.2]),
      eventos: [taco, { tipo: 'bola-tabela', t: 0.2083, bola: 4, tabela: 2, parte: 'nariz', velocidade: 1 }],
    });
    const c = extrairPrevisao(g, CFG);
    expect(pontos(c).every(([, pz]) => pz === 0)).toBe(true);
    // Só quadros do bolão (cada x é múltiplo de 1/60), nenhum ponto de batida no meio.
    expect(pontos(c).every(([px]) => Math.abs(px * F - Math.round(px * F)) < 1e-3)).toBe(true);
    expect(c.quantidade).toBe(31);
  });

  it('o caminho acaba no primeiro choque do bolão com outra bola e diz fim = contato', () => {
    // Bolão a 1 m/s em +x; bola 4 parada em (1, 0); o contato é em x = 0,9459 (entre os quadros 56 e 57).
    const tC = 0.9459;
    const g = gravacao({
      ids: [0, 4],
      quadros: 100,
      posicao: (q, id) => {
        const t = q / F;
        if (id === 0) return t < tC ? [t, 0] : [tC, 0.4 * (t - tC)];
        return [t < tC ? 1 : 1 + 0.5 * (t - tC), 0];
      },
      eventos: [taco, { tipo: 'bola-bola', t: tC, a: 0, b: 4, velocidade: 1 }],
    });
    const c = extrairPrevisao(g, CFG);
    const p = pontos(c);
    expect(c.fim).toBe('contato');
    expect(p[p.length - 1]![0]).toBeCloseTo(tC, 4);
    expect(c.comprimento).toBeCloseTo(tC, 4);
  });

  it('choque entre duas outras bolas não encerra o caminho do bolão', () => {
    const g = gravacao({
      ids: [0, 4, 6],
      quadros: 60,
      posicao: (q, id) => (id === 0 ? [Math.min(q, 40) / F, 0] : [id, 1]),
      eventos: [taco, { tipo: 'bola-bola', t: 0.3, a: 4, b: 6, velocidade: 0.5 }],
    });
    const c = extrairPrevisao(g, CFG);
    expect(c.fim).toBe('parou');
    expect(c.atingida.id).toBe(-1);
    expect(pontos(c).at(-1)![0]).toBeCloseTo(40 / F, 5);
  });

  it('o bolão que para a menos de passoMinimo do último ponto ainda termina no repouso de verdade', () => {
    // 12 mm por quadro até o quadro 3 (36 mm); depois só mais 6 mm, e para em 42 mm.
    const x = (q: number): number => (q <= 3 ? q * 0.012 : 0.036 + Math.min(q - 3, 1) * 0.006);
    const c = extrairPrevisao(gravacao({ quadros: 30, posicao: (q) => [x(q), 0], eventos: [taco] }), CFG);
    expect(pontos(c).at(-1)![0]).toBeCloseTo(0.042, 5);
    expect(c.comprimento).toBeCloseTo(0.042, 5);
  });

  it('duas batidas no mesmo quadro (quina): a segunda não prolonga o trecho que já virou', () => {
    // 3 m/s: +x até t1; +z até t2; depois −x. As batidas distam 2 cm, no mesmo quadro (30 → 31).
    const v = 3;
    const t1 = 30.3 / F;
    const t2 = 30.7 / F;
    const x1 = v * t1;
    const dz = v * (t2 - t1);
    const posicao = (q: number): Xz => {
      const t = q / F;
      if (t < t1) return [v * t, 0];
      if (t < t2) return [x1, v * (t - t1)];
      return [x1 - v * (t - t2), dz];
    };
    const eventos: EventoTacada[] = [
      taco,
      { tipo: 'bola-tabela', t: t1, bola: ID_BOLAO, tabela: 0, parte: 'nariz', velocidade: v },
      { tipo: 'bola-tabela', t: t2, bola: ID_BOLAO, tabela: 1, parte: 'nariz', velocidade: v },
    ];
    const p = pontos(extrairPrevisao(gravacao({ quadros: 50, posicao, eventos }), { ...CFG, passoMinimo: 0.001 }));
    const i1 = p.findIndex(([px, pz]) => Math.hypot(px - x1, pz) < 1e-4);
    expect(i1).toBeGreaterThan(0);
    // O ponto da segunda batida erra 16 mm pela corda entre quadros; prolongando a velocidade de antes, 28 mm.
    const [px2, pz2] = p[i1 + 1]!;
    expect(Math.hypot(px2 - x1, pz2 - dz)).toBeLessThan(0.02);
  });

  it('o caminho não segue a bola que saiu da mesa mesmo sem evento de caçapa', () => {
    const g = gravacao({
      quadros: 60,
      posicao: (q) => (q <= 30 ? [q / F, 0] : [-5, -5]),
      naMesa: (q) => q <= 30,
      eventos: [taco],
    });
    const c = extrairPrevisao(g, CFG);
    expect(pontos(c).every(([px]) => px > -1)).toBe(true);
  });

  it('caçapa de outra bola não encerra o caminho do bolão', () => {
    const g = gravacao({
      ids: [0, 4],
      quadros: 40,
      posicao: (q, id) => (id === 0 ? [Math.min(q, 30) / F, 0] : [1, 1]),
      eventos: [taco, { tipo: 'cacapa', t: 0.2, bola: 4, cacapa: 'canto-x+z+' }],
    });
    const c = extrairPrevisao(g, CFG);
    expect(c.fim).toBe('parou');
    expect(c.quantidade).toBe(31);
  });

  describe('a bola atingida', () => {
    /** O bolão corre em +x e toca a bola 4 em t = 0,5; a bola 4 sai com `saida` (vetor unitário × velocidade). */
    function choque(saida: Xz, paraDepoisDe?: number): Gravacao {
      const tC = 0.5;
      const origem: Xz = [1.2, 0.3];
      return gravacao({
        ids: [0, 4],
        quadros: 120,
        posicao: (q, id) => {
          const t = q / F;
          if (id === 0) return [Math.min(t, tC), 0];
          if (t <= tC) return origem;
          const dt = paraDepoisDe === undefined ? t - tC : Math.min(t - tC, paraDepoisDe);
          return [origem[0] + saida[0] * dt, origem[1] + saida[1] * dt];
        },
        eventos: [taco, { tipo: 'bola-bola', t: tC, a: 0, b: 4, velocidade: 1 }],
      });
    }

    it('guarda quem é, de onde sai e para onde vai (corda da origem ao primeiro quadro depois do choque)', () => {
      const c = extrairPrevisao(choque([0.6, 0.8]), CFG);
      expect(c.atingida.id).toBe(4);
      expect(c.atingida.x).toBeCloseTo(1.2, 5);
      expect(c.atingida.z).toBeCloseTo(0.3, 5);
      expect(c.atingida.dx).toBeCloseTo(0.6, 4);
      expect(c.atingida.dz).toBeCloseTo(0.8, 4);
    });

    it('a linha tem o comprimento pedido quando a bola vai mais longe que isso', () => {
      const c = extrairPrevisao(choque([0.6, 0.8]), CFG);
      expect(c.atingida.comprimento).toBeCloseTo(0.15, 5);
      const curta = extrairPrevisao(choque([0.6, 0.8]), { ...CFG, comprimentoBolaAtingida: 0.05 });
      expect(curta.atingida.comprimento).toBeCloseTo(0.05, 5);
    });

    it('se a bola para antes disso, a linha vai só até onde ela chegou', () => {
      // Anda 0,2 s a 0,5 m/s e para: 10 cm.
      const c = extrairPrevisao(choque([0.3, 0.4], 0.2), CFG);
      expect(c.atingida.comprimento).toBeCloseTo(0.1, 4);
    });

    it('bola que mal se mexe (< 5 mm) não ganha linha, mas o id fica', () => {
      const c = extrairPrevisao(choque([0.003, 0], 1), CFG);
      expect(c.atingida.id).toBe(4);
      expect(c.atingida.comprimento).toBe(0);
    });

    it('bola lenta: a direção vem do primeiro quadro com 5 mm ou mais de deslocamento', () => {
      // 0,07 m/s: 1,17 mm por quadro, então 5 mm só no quinto quadro depois do choque; a corda é da origem até lá.
      const c = extrairPrevisao(choque([0.02, 0.07]), CFG);
      const norma = Math.hypot(0.02, 0.07);
      expect(c.atingida.dx).toBeCloseTo(0.02 / norma, 4);
      expect(c.atingida.dz).toBeCloseTo(0.07 / norma, 4);
      expect(c.atingida.comprimento).toBeCloseTo(norma * ((120 - 1) / F - 0.5), 4);
    });

    it('a direção é a da primeira corda de 5 mm, não a de um trecho mais longo depois de a bola virar', () => {
      // Sai a 0,07 m/s na direção (0, 1) por 0,1 s e vira para (1, 0): a linha segue o que a bola fez primeiro.
      const tC = 0.5;
      const g = gravacao({
        ids: [0, 4],
        quadros: 120,
        posicao: (q, id) => {
          const t = q / F;
          if (id === 0) return [Math.min(t, tC), 0];
          if (t <= tC) return [1.2, 0.3];
          const d = t - tC;
          return d < 0.1 ? [1.2, 0.3 + 0.07 * d] : [1.2 + 0.07 * (d - 0.1), 0.3 + 0.007];
        },
        eventos: [taco, { tipo: 'bola-bola', t: tC, a: 0, b: 4, velocidade: 1 }],
      });
      const c = extrairPrevisao(g, CFG);
      expect(c.atingida.dx).toBeCloseTo(0, 4);
      expect(c.atingida.dz).toBeCloseTo(1, 4);
    });

    it('bola atingida que cai na caçapa no primeiro quadro: sem linha, sem NaN', () => {
      const tC = 0.5;
      const g = gravacao({
        ids: [0, 4],
        quadros: 60,
        posicao: (q, id) => (id === 0 ? [Math.min(q / F, tC), 0] : q / F <= tC ? [1, 0] : [3, 3]),
        naMesa: (q, id) => id !== 4 || q / F <= tC,
        eventos: [taco, { tipo: 'bola-bola', t: tC, a: 0, b: 4, velocidade: 1 }],
      });
      const c = extrairPrevisao(g, CFG);
      expect(c.atingida.comprimento).toBe(0);
      expect(Number.isFinite(c.atingida.dx)).toBe(true);
    });
  });

  it('o teto de comprimento corta o caminho em cima do limite e diz fim = limite', () => {
    const g = gravacao({ quadros: 400, posicao: (q) => [q / F, 0], eventos: [taco] });
    const c = extrairPrevisao(g, { ...CFG, comprimentoMaximo: 1 });
    expect(c.fim).toBe('limite');
    expect(c.comprimento).toBeCloseTo(1, 6);
    expect(pontos(c).at(-1)![0]).toBeCloseTo(1, 6);
  });

  it('o teto conta o comprimento dos trechos depois da tabela, não a distância até a origem', () => {
    // Vai e volta: 0,6 m para a direita e de volta, 1,2 m no total; o teto de 1 m cai no trecho de volta.
    const xT = 0.6 + 1 / 120;
    const tT = xT;
    const x = (q: number): number => (q / F < tT ? q / F : xT - (q / F - tT));
    const evento: EventoTacada = { tipo: 'bola-tabela', t: tT, bola: ID_BOLAO, tabela: 1, parte: 'nariz', velocidade: 1 };
    const g = gravacao({ quadros: 200, posicao: (q) => [x(q), 0], eventos: [taco, evento] });
    const c = extrairPrevisao(g, { ...CFG, comprimentoMaximo: 1 });
    expect(c.fim).toBe('limite');
    expect(c.comprimento).toBeCloseTo(1, 6);
    expect(pontos(c).at(-1)![0]).toBeCloseTo(xT - (1 - xT), 4);
    // Voltou só até o corte: nunca passou de volta pela origem.
    expect(pontos(c).every(([px]) => px >= -1e-6)).toBe(true);
  });

  it('caçapa: o caminho vai até a borda e não segue pela posição da bola caída', () => {
    const tK = 0.5;
    const g = gravacao({
      quadros: 60,
      posicao: (q) => (q / F <= tK ? [q / F, 0] : [-5, -5]),
      naMesa: (q) => q / F <= tK,
      eventos: [taco, { tipo: 'cacapa', t: tK + 0.004, bola: ID_BOLAO, cacapa: 'canto-x+z+' }],
    });
    const c = extrairPrevisao(g, CFG);
    expect(c.fim).toBe('cacapa');
    expect(pontos(c).every(([px]) => px > -1)).toBe(true);
    expect(pontos(c).at(-1)![0]).toBeCloseTo(0.504, 2);
  });

  it('buffer cheio: para com fim = limite em vez de estourar', () => {
    const g = gravacao({ quadros: 200, posicao: (q) => [q * 0.02, 0], eventos: [taco] });
    const c = extrairPrevisao(g, CFG, new CaminhoPrevisto(8));
    expect(c.quantidade).toBeLessThanOrEqual(8);
    expect(c.fim).toBe('limite');
  });

  it('reaproveita a saída: nada do cálculo anterior sobra', () => {
    const saida = new CaminhoPrevisto();
    const comChoque = gravacao({
      ids: [0, 4],
      quadros: 60,
      posicao: (q, id) => (id === 0 ? [Math.min(q / F, 0.5), 0] : [0.6, 0]),
      eventos: [taco, { tipo: 'bola-bola', t: 0.5, a: 0, b: 4, velocidade: 1 }],
    });
    extrairPrevisao(comChoque, CFG, saida);
    expect(saida.fim).toBe('contato');
    const sem = gravacao({ quadros: 20, posicao: (q) => [q / F, 0], eventos: [taco] });
    const de = extrairPrevisao(sem, CFG, saida);
    expect(de).toBe(saida);
    expect(saida.fim).toBe('parou');
    expect(saida.atingida.id).toBe(-1);
    expect(saida.atingida.comprimento).toBe(0);
    expect(saida.comprimento).toBeCloseTo(19 / F, 5);
  });
});

describe('com a física de verdade', () => {
  const MESA_VAZIA = (() => {
    const base = mesaInicial([], CONFIG_FISICA_PADRAO, criarRng(1));
    return base;
  })();
  const PARAM = { angulo: 0, velocidadeTaco: 2, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 };
  const SEM_MISCUE = { proximo: () => 0.9999999 };

  it('tacada reta sem efeito: todos os pontos ficam na reta da mira', () => {
    const r = simularTacada(MESA_VAZIA, { ...PARAM, angulo: 0.4 }, SEM_MISCUE, CONFIG_FISICA_PADRAO);
    // Até 0,8 m, antes de qualquer tabela.
    const c = extrairPrevisao(r.gravacao, { ...CFG, comprimentoMaximo: 0.8 });
    const [x0, z0] = pontos(c)[0]!;
    for (const [x, z] of pontos(c)) {
      const dx = x - x0;
      const dz = z - z0;
      if (Math.hypot(dx, dz) < 0.05) continue;
      expect(Math.atan2(dz, dx)).toBeCloseTo(0.4, 2);
    }
    expect(c.quantidade).toBeGreaterThan(5);
  });

  it('o ponto da tabela bate com a curva do mesmo caminho amostrado oito vezes mais fino', () => {
    // Perpendicular à tabela de baixo (+z): o ponto de retorno é o ponto mais afastado em z.
    const lenta = { ...PARAM, angulo: Math.PI / 2, velocidadeTaco: 3 };
    const fino = { ...CONFIG_FISICA_PADRAO, frequenciaGravacao: 480 };
    const grossa = extrairPrevisao(simularTacada(MESA_VAZIA, lenta, SEM_MISCUE, CONFIG_FISICA_PADRAO).gravacao, CFG);
    const ref = extrairPrevisao(simularTacada(MESA_VAZIA, lenta, SEM_MISCUE, fino).gravacao, CFG);
    const maxZ = (c: CaminhoPrevisto): number => Math.max(...pontos(c).map(([, z]) => z));
    expect(Math.abs(maxZ(grossa) - maxZ(ref))).toBeLessThan(0.001);
    // Sem o ponto da batida, o canto cortado ficaria até v/2/60 ≈ 2,5 cm aquém.
    expect(maxZ(ref) - maxZ(grossa)).toBeLessThan(0.001);
  });
});
