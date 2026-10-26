import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, medidasDaBola } from './config';
import { bolaParada, lugares, mesaInicial, posicaoLivre } from './lugares';
import { BOLA, MESA_BAR, cacapas, distanciaContatoTabela, pontasTabela, pontoDeSaida, type Ponto2 } from './medidas';
import { criarRng } from './rng';
import { FOLGA_TRIANGULO, posicoesTriangulo } from './triangulo';
import { ID_BOLAO, type EstadoMesa } from './tipos';

const hx = MESA_BAR.comprimento / 2;
const hz = MESA_BAR.largura / 2;
const R = BOLA.raio;
const rc = distanciaContatoTabela(R, MESA_BAR);
const dist = (a: Ponto2, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const mesaCom = (...bolas: [number, number, number][]): EstadoMesa => ({
  bolas: bolas.map(([id, x, z]) => bolaParada(id, { x, z })),
});

const valida = (estado: EstadoMesa, p: Ponto2) => {
  expect(Math.abs(p.x)).toBeLessThanOrEqual(hx - rc + 1e-9);
  expect(Math.abs(p.z)).toBeLessThanOrEqual(hz - rc + 1e-9);
  for (const b of estado.bolas) {
    if (b.naMesa) expect(dist(p, b.posicao)).toBeGreaterThanOrEqual(R + medidasDaBola(b.id).raio - 1e-9);
  }
};

describe('lugares', () => {
  const l = lugares(MESA_BAR);

  it('marca da saída, marca do pé e encosto na tabela da cabeceira −X', () => {
    expect(l.marcaSaida).toEqual(pontoDeSaida(MESA_BAR));
    expect(l.marcaPe).toEqual({ x: MESA_BAR.comprimento / 4, z: 0 });
    expect(l.tabelaLadoSaida.z).toBe(0);
    expect(l.tabelaLadoSaida.x + hx).toBeCloseTo(rc, 12);
  });

  it('o contato com a tabela fica acima do centro: a bola encosta antes de R', () => {
    expect(rc).toBeLessThan(R);
    const senTheta = MESA_BAR.alturaTabela / R - 1;
    expect(rc).toBeCloseTo(R * Math.sqrt(1 - senTheta ** 2), 12);
  });
});

describe('posicaoLivre', () => {
  it('alvo livre fica onde está', () => {
    const estado = mesaCom([1, 0.3, 0.2]);
    expect(posicaoLivre(estado, { x: -0.5, z: 0 }, R, MESA_BAR)).toEqual({ x: -0.5, z: 0 });
  });

  it('alvo ocupado: encosta na bola que está lá', () => {
    const estado = mesaCom([1, -0.525, 0]);
    const p = posicaoLivre(estado, { x: -0.525, z: 0 }, R, MESA_BAR);
    valida(estado, p);
    expect(dist(p, { x: -0.525, z: 0 })).toBeCloseTo(2 * R, 3);
  });

  it('alvo encostando numa bola vai para o ponto mais perto, na linha dos centros', () => {
    const estado = mesaCom([1, 0, 0]);
    const p = posicaoLivre(estado, { x: 0.03, z: 0.01 }, R, MESA_BAR);
    valida(estado, p);
    expect(Math.atan2(p.z, p.x)).toBeCloseTo(Math.atan2(0.01, 0.03), 9);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(2 * R, 3);
  });

  it('alvo dentro da tabela é puxado para dentro da mesa', () => {
    const p = posicaoLivre(mesaCom(), { x: -hx, z: 0.1 }, R, MESA_BAR);
    expect(p).toEqual({ x: -hx + rc, z: 0.1 });
  });

  it('usa o raio das bolas da config dada, não o padrão', () => {
    const grande = { ...CONFIG_FISICA_PADRAO, bola: { ...BOLA, raio: 0.03 } };
    const estado: EstadoMesa = { bolas: [bolaParada(1, { x: 0, z: 0 }, grande)] };
    const p = posicaoLivre(estado, { x: 0.05, z: 0 }, R, MESA_BAR, grande);
    expect(p.x).toBeCloseTo(R + 0.03 + FOLGA_TRIANGULO, 9);
  });

  it('ignora bolas que já saíram da mesa', () => {
    const estado: EstadoMesa = { bolas: [{ ...bolaParada(1, { x: 0, z: 0 }), naMesa: false }] };
    expect(posicaoLivre(estado, { x: 0, z: 0 }, R, MESA_BAR)).toEqual({ x: 0, z: 0 });
  });

  it('no meio de um aglomerado acha o lugar livre mais perto (contra busca em grade)', () => {
    const estado: EstadoMesa = {
      bolas: posicoesTriangulo(MESA_BAR, R).map((p, i) => bolaParada(i + 1, p)),
    };
    const alvo = { x: MESA_BAR.comprimento / 4 + 0.05, z: 0.01 };
    const p = posicaoLivre(estado, alvo, R, MESA_BAR);
    valida(estado, p);
    let melhor = Infinity;
    for (let x = -hx; x <= hx; x += 0.002) {
      for (let z = -hz; z <= hz; z += 0.002) {
        const q = { x, z };
        const livre =
          Math.abs(x) <= hx - rc &&
          Math.abs(z) <= hz - rc &&
          estado.bolas.every((b) => dist(q, b.posicao) >= 2 * R);
        if (livre) melhor = Math.min(melhor, dist(q, alvo));
      }
    }
    expect(dist(p, alvo)).toBeLessThanOrEqual(melhor + 1e-6);
  });

  it('encostado na tabela e numa bola ao mesmo tempo', () => {
    const estado = mesaCom([1, -hx + rc, 0]);
    const p = posicaoLivre(estado, lugares(MESA_BAR).tabelaLadoSaida, R, MESA_BAR);
    valida(estado, p);
    expect(p.x).toBeCloseTo(-hx + rc, 9);
    expect(Math.abs(p.z)).toBeCloseTo(2 * R, 3);
  });
});

describe('posicaoLivre e a garganta das caçapas (L15)', () => {
  const bocas = cacapas(MESA_BAR);
  const pontas = pontasTabela(MESA_BAR);

  /** Quanto o centro passou da linha da boca (> 0 = dentro da garganta) e o desvio dele para o lado do eixo. */
  const naBoca = (p: Ponto2, c: (typeof bocas)[number]) => {
    const dx = p.x - c.boca.x;
    const dz = p.z - c.boca.z;
    return { profundidade: dx * c.eixo.x + dz * c.eixo.z, lateral: Math.abs(dx * -c.eixo.z + dz * c.eixo.x) };
  };

  /** A bola não está na garganta nem pisa numa quina ou face. */
  function foraDaGarganta(p: Ponto2, rotulo: string) {
    for (const c of bocas) {
      const { profundidade, lateral } = naBoca(p, c);
      const naGarganta = profundidade > 0 && lateral < c.raio + R;
      expect(naGarganta, `${rotulo}: ${c.id} (profundidade ${profundidade.toFixed(4)}, lateral ${lateral.toFixed(4)})`).toBe(false);
      // Mais que isso: a bola inteira fica fora do disco da boca (meia boca + raio em volta do meio das quinas).
      expect(dist(p, c.boca), `${rotulo}: ${c.id}, disco da boca`).toBeGreaterThanOrEqual(c.raio + R - 1e-9);
    }
    for (const q of pontas) {
      expect(dist(p, q.centro), `${rotulo}: ponta ${q.cacapa}`).toBeGreaterThanOrEqual(rc + q.raio - 1e-9);
      // Distância à face (segmento da ponta arredondada ao fim): a bola encosta a `rc`.
      const fx = q.fimDaFace.x - q.naFace.x;
      const fz = q.fimDaFace.z - q.naFace.z;
      const u = Math.min(1, Math.max(0, ((p.x - q.naFace.x) * fx + (p.z - q.naFace.z) * fz) / (fx * fx + fz * fz)));
      expect(dist(p, { x: q.naFace.x + fx * u, z: q.naFace.z + fz * u }), `${rotulo}: face ${q.cacapa}`).toBeGreaterThanOrEqual(rc - 1e-9);
    }
  }

  it('alvo na garganta, na boca ou no fundo da caçapa: a bola sai para a mesa, nunca fica lá', () => {
    for (const c of bocas) {
      const alvos: [string, Ponto2][] = [
        ['centro do círculo de queda', c.queda.centro],
        ['meio da garganta', { x: c.boca.x + (c.eixo.x * c.fundo) / 2, z: c.boca.z + (c.eixo.z * c.fundo) / 2 }],
        ['linha da boca', c.boca],
        ['um raio antes da boca', { x: c.boca.x - c.eixo.x * R, z: c.boca.z - c.eixo.z * R }],
      ];
      for (const [nome, alvo] of alvos) {
        const estado = mesaCom();
        const p = posicaoLivre(estado, alvo, R, MESA_BAR);
        valida(estado, p);
        foraDaGarganta(p, `${c.id}, alvo ${nome}`);
      }
    }
  });

  it('nos quatro cantos do retângulo do nariz, que ficam na boca do canto, também sai', () => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = posicaoLivre(mesaCom(), { x: sx * (hx - rc), z: sz * (hz - rc) }, R, MESA_BAR);
        foraDaGarganta(p, `canto ${sx},${sz}`);
      }
    }
  });

  it('varrendo alvos em volta de cada caçapa, com uma bola parada na boca, nenhum resultado cai na garganta', () => {
    let n = 0;
    for (const c of bocas) {
      const estado = mesaCom([1, c.boca.x - c.eixo.x * 0.09, c.boca.z - c.eixo.z * 0.09]);
      for (let a = -0.3; a <= 0.3 + 1e-9; a += 0.02) {
        for (let b = -0.12; b <= 0.12 + 1e-9; b += 0.02) {
          // `a` ao longo do eixo (negativo = para dentro da mesa), `b` ao lado.
          const alvo = { x: c.boca.x + c.eixo.x * a - c.eixo.z * b, z: c.boca.z + c.eixo.z * a + c.eixo.x * b };
          const p = posicaoLivre(estado, alvo, R, MESA_BAR);
          valida(estado, p);
          foraDaGarganta(p, `${c.id}, a ${a.toFixed(2)}, b ${b.toFixed(2)}`);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('alvo longe das bocas fica onde está (a zona proibida é só a boca)', () => {
    for (const alvo of [{ x: 0, z: 0 }, lugares(MESA_BAR).tabelaLadoSaida, { x: hx / 2, z: hz - rc }, { x: -hx + 0.3, z: -hz + rc }]) {
      expect(posicaoLivre(mesaCom(), alvo, R, MESA_BAR)).toEqual(alvo);
    }
  });
});

describe('mesaInicial', () => {
  const ids = Array.from({ length: 15 }, (_, i) => 15 - i);

  it('bolão na marca da saída e as bolas no triângulo, na ordem dada, paradas', () => {
    const { bolas } = mesaInicial(ids, CONFIG_FISICA_PADRAO);
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    expect(bolas).toHaveLength(16);
    expect(bolas[0]!.id).toBe(ID_BOLAO);
    expect(bolas[0]!.posicao).toEqual({ ...pontoDeSaida(MESA_BAR), y: CONFIG_FISICA_PADRAO.bolao.raio });
    ids.forEach((id, k) => {
      const b = bolas[k + 1]!;
      expect(b.id).toBe(id);
      expect(b.posicao).toEqual({ x: triangulo[k]!.x, y: R, z: triangulo[k]!.z });
    });
    for (const b of bolas) {
      expect(b).toMatchObject({
        velocidade: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
        orientacao: { x: 0, y: 0, z: 0, w: 1 },
        movimento: 'parada',
        naMesa: true,
      });
    }
  });

  it('arrumação curta ocupa só as primeiras vagas', () => {
    const { bolas } = mesaInicial([2, 3], CONFIG_FISICA_PADRAO);
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    expect(bolas.map((b) => b.id)).toEqual([0, 2, 3]);
    expect(bolas[2]!.posicao.z).toBe(triangulo[1]!.z);
  });

  it('com 14 bolas a vaga fica no centro do triângulo (meio da 3ª fileira); vértice e base de 5 cheios', () => {
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    const { bolas } = mesaInicial(ids.slice(0, 14));
    const ocupadas = bolas.slice(1).map((b) => triangulo.findIndex((p) => p.x === b.posicao.x && p.z === b.posicao.z));
    expect(ocupadas).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    // A vaga 4 é o meio da 3ª fileira: duas fileiras atrás do vértice, no eixo.
    expect(triangulo[4]!.z).toBe(0);
    expect(triangulo[4]!.x - triangulo[0]!.x).toBeCloseTo(2 * (triangulo[1]!.x - triangulo[0]!.x), 12);
  });

  it('com 14 bolas e rng, cada bola fica perto da sua vaga e o centro continua vazio', () => {
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    const { bolas } = mesaInicial(ids.slice(0, 14), CONFIG_FISICA_PADRAO, criarRng(3));
    for (const b of bolas.slice(1)) expect(dist(triangulo[4]!, b.posicao)).toBeGreaterThan(R);
  });

  it('com 13 bolas o centro fica ocupado e as pontas da base (vagas 10 e 14) vazias: base de 5 só com as 3 do meio', () => {
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    const { bolas } = mesaInicial(ids.slice(0, 13));
    const ocupadas = bolas.slice(1).map((b) => triangulo.findIndex((p) => p.x === b.posicao.x && p.z === b.posicao.z));
    expect(ocupadas).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]);
    // A arrumação[4] (a bola final das regras) fica no centro.
    expect(bolas[5]!.id).toBe(ids[4]);
    expect(bolas[5]!.posicao).toEqual({ x: triangulo[4]!.x, y: R, z: 0 });
  });

  it('com 13 bolas e rng, nenhuma bola chega às pontas da base', () => {
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    for (let semente = 1; semente <= 10; semente++) {
      const { bolas } = mesaInicial(ids.slice(0, 13), CONFIG_FISICA_PADRAO, criarRng(semente));
      for (const b of bolas.slice(1)) for (const ponta of [10, 14]) expect(dist(triangulo[ponta]!, b.posicao)).toBeGreaterThan(R);
    }
  });

  it('sem rng o triângulo é perfeito', () => {
    expect(mesaInicial(ids)).toEqual(mesaInicial(ids, CONFIG_FISICA_PADRAO, undefined));
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    mesaInicial(ids).bolas.slice(1).forEach((b, k) => expect(b.posicao).toEqual({ x: triangulo[k]!.x, y: R, z: triangulo[k]!.z }));
  });

  describe('com rng: triângulo imperfeito, como na mesa de verdade', () => {
    const triangulo = posicoesTriangulo(MESA_BAR, R);
    const desvios = (semente: number) =>
      mesaInicial(ids, CONFIG_FISICA_PADRAO, criarRng(semente))
        .bolas.slice(1)
        .map((b, k) => Math.hypot(b.posicao.x - triangulo[k]!.x, b.posicao.z - triangulo[k]!.z));

    it('cada bola sai até uma folga inteira (0,1 mm) do lugar, em qualquer direção, e quase todas saem', () => {
      for (const semente of [1, 2, 3]) {
        const d = desvios(semente);
        expect(Math.max(...d)).toBeLessThanOrEqual(FOLGA_TRIANGULO + 1e-12);
        expect(d.filter((x) => x > FOLGA_TRIANGULO / 20).length).toBeGreaterThan(10);
        expect(d.filter((x) => x > FOLGA_TRIANGULO / 2).length).toBeGreaterThan(3);
      }
      const direcoes = [1, 2, 3, 4].flatMap((semente) =>
        mesaInicial(ids, CONFIG_FISICA_PADRAO, criarRng(semente))
          .bolas.slice(1)
          .map((b, k) => Math.atan2(b.posicao.z - triangulo[k]!.z, b.posicao.x - triangulo[k]!.x)),
      );
      const quadrantes = new Set(direcoes.map((a) => Math.floor(((a + Math.PI) / (2 * Math.PI)) * 4)));
      expect(quadrantes.size).toBe(4);
    });

    it('vizinhas nunca se sobrepõem (50 sementes); o bolão e a altura não mudam', () => {
      let menor = Infinity;
      for (let semente = 1; semente <= 50; semente++) {
        const { bolas } = mesaInicial(ids, CONFIG_FISICA_PADRAO, criarRng(semente));
        expect(bolas[0]!.posicao).toEqual(mesaInicial(ids).bolas[0]!.posicao);
        const numeradas = bolas.slice(1);
        for (const b of numeradas) expect(b.posicao.y).toBe(R);
        for (let i = 0; i < numeradas.length; i++) {
          for (let j = i + 1; j < numeradas.length; j++) {
            const a = numeradas[i]!.posicao;
            const c = numeradas[j]!.posicao;
            menor = Math.min(menor, Math.hypot(a.x - c.x, a.z - c.z));
          }
        }
      }
      expect(menor).toBeGreaterThanOrEqual(2 * R);
    });

    it('mesma semente, mesma mesa; outra semente, outra mesa', () => {
      expect(mesaInicial(ids, CONFIG_FISICA_PADRAO, criarRng(5))).toEqual(mesaInicial(ids, CONFIG_FISICA_PADRAO, criarRng(5)));
      expect(desvios(5)).not.toEqual(desvios(6));
    });
  });

  it('recusa arrumação inválida', () => {
    expect(() => mesaInicial([1, 1], CONFIG_FISICA_PADRAO)).toThrow();
    expect(() => mesaInicial([0, 1], CONFIG_FISICA_PADRAO)).toThrow();
    expect(() => mesaInicial([...ids, 16], CONFIG_FISICA_PADRAO)).toThrow();
  });
});
