import { describe, expect, it } from 'vitest';
import { BOLA, BOLAO, MESA_BAR, cacapas, pontasTabela, tabelas, type Ponto2 } from './medidas';

const distancia = (a: Ponto2, b: Ponto2) => Math.hypot(a.x - b.x, a.z - b.z);
const menos = (a: Ponto2, b: Ponto2): Ponto2 => ({ x: a.x - b.x, z: a.z - b.z });
const escalar = (a: Ponto2, b: Ponto2) => a.x * b.x + a.z * b.z;
const unitario = (a: Ponto2): Ponto2 => ({ x: a.x / Math.hypot(a.x, a.z), z: a.z / Math.hypot(a.x, a.z) });
/** Distância com sinal de `p` à reta por `a` com normal unitária `n` (positiva do lado de `n`). */
const lado = (p: Ponto2, a: Ponto2, n: Ponto2) => escalar(menos(p, a), n);

describe('medidas da mesa de bar', () => {
  it('bola e bolão passam pelas bocas das caçapas', () => {
    for (const bola of [BOLA, BOLAO]) {
      expect(2 * bola.raio).toBeLessThan(MESA_BAR.bocaCanto);
      expect(2 * bola.raio).toBeLessThan(MESA_BAR.bocaMeio);
    }
  });

  it('altura da tabela fica entre 61% e 64% do diâmetro da bola', () => {
    const proporcao = MESA_BAR.alturaTabela / (2 * BOLA.raio);
    expect(proporcao).toBeGreaterThanOrEqual(0.61);
    expect(proporcao).toBeLessThanOrEqual(0.64);
  });

  it('tem seis caçapas e seis tabelas', () => {
    expect(cacapas(MESA_BAR)).toHaveLength(6);
    expect(tabelas(MESA_BAR)).toHaveLength(6);
  });

  it('normal de cada tabela é unitária e aponta para o centro da mesa', () => {
    for (const t of tabelas(MESA_BAR)) {
      const meio = { x: (t.inicio.x + t.fim.x) / 2, z: (t.inicio.z + t.fim.z) / 2 };
      expect(Math.hypot(t.normal.x, t.normal.z)).toBeCloseTo(1, 12);
      expect(t.normal.x * -meio.x + t.normal.z * -meio.z).toBeGreaterThan(0);
    }
  });

  it('o círculo de queda de cada caçapa fica atrás da linha das quinas da boca, a `fundo` dela (L15)', () => {
    const quinas = tabelas(MESA_BAR).flatMap((t) => [t.inicio, t.fim]);
    for (const c of cacapas(MESA_BAR)) {
      const [q1, q2] = [...quinas].sort((a, b) => distancia(a, c.boca) - distancia(b, c.boca));
      const dx = q2!.x - q1!.x;
      const dz = q2!.z - q1!.z;
      const lado = (p: Ponto2) => ((p.x - q1!.x) * dz - (p.z - q1!.z) * dx) / Math.hypot(dx, dz);
      // Centro do círculo de queda do lado de fora (oposto ao centro da mesa), a `fundo` + um raio da linha das quinas.
      expect(Math.sign(lado(c.queda.centro))).toBe(-Math.sign(lado({ x: 0, z: 0 })));
      expect(Math.abs(lado(c.queda.centro))).toBeCloseTo(c.fundo + c.queda.raio, 12);
      // O ponto do círculo mais perto da mesa, no eixo, fica a `fundo` da linha: a bola só cai depois de passar por ele.
      expect(Math.abs(lado({ x: c.queda.centro.x - c.eixo.x * c.queda.raio, z: c.queda.centro.z - c.eixo.z * c.queda.raio }))).toBeCloseTo(c.fundo, 12);
    }
  });

  it('o círculo antigo (`centro`, `raio`) continua tangente à linha das quinas: o desenho dos furos ainda o usa', () => {
    for (const c of cacapas(MESA_BAR)) {
      expect(c.centro.x).toBeCloseTo(c.boca.x + c.eixo.x * c.raio, 12);
      expect(c.centro.z).toBeCloseTo(c.boca.z + c.eixo.z * c.raio, 12);
    }
    // Os cantos do desenho de antes: o círculo da boca de canto está centrado no canto da mesa.
    const canto = cacapas(MESA_BAR).find((c) => c.id === 'canto-x+z+')!;
    expect(canto.centro.x).toBeCloseTo(MESA_BAR.comprimento / 2, 12);
    expect(canto.centro.z).toBeCloseTo(MESA_BAR.largura / 2, 12);
    const meio = cacapas(MESA_BAR).find((c) => c.id === 'meio-z+')!;
    expect(meio.centro).toEqual({ x: 0, z: MESA_BAR.largura / 2 + MESA_BAR.bocaMeio / 2 });
  });

  it('a caçapa é funda: cerca de 1 diâmetro de bola no canto e ¾ no meio (pedido do usuário, 2026-10-14)', () => {
    expect(MESA_BAR.fundoCanto).toBeCloseTo(2 * BOLA.raio, 3);
    expect(MESA_BAR.fundoMeio).toBeCloseTo(1.5 * BOLA.raio, 3);
    const porId = new Map(cacapas(MESA_BAR).map((c) => [c.id, c]));
    for (const [id, c] of porId) expect(c.fundo).toBe(id.startsWith('canto') ? MESA_BAR.fundoCanto : MESA_BAR.fundoMeio);
  });

  it('cada caçapa expõe a boca (meio das quinas), o eixo para fora, o fundo e o círculo de queda: centro = boca + eixo·(fundo + raio)', () => {
    const quinas = pontasTabela(MESA_BAR);
    for (const c of cacapas(MESA_BAR)) {
      const q = quinas.filter((p) => p.cacapa === c.id).map((p) => p.quina);
      expect(c.boca.x).toBeCloseTo((q[0]!.x + q[1]!.x) / 2, 12);
      expect(c.boca.z).toBeCloseTo((q[0]!.z + q[1]!.z) / 2, 12);
      expect(Math.hypot(c.eixo.x, c.eixo.z)).toBeCloseTo(1, 12);
      // Para fora da mesa, perpendicular à linha das quinas.
      expect(escalar(c.eixo, menos(q[1]!, q[0]!))).toBeCloseTo(0, 12);
      expect(escalar(c.eixo, c.boca)).toBeGreaterThan(0);
      expect(c.queda.centro.x).toBeCloseTo(c.boca.x + c.eixo.x * (c.fundo + c.raio), 12);
      expect(c.queda.centro.z).toBeCloseTo(c.boca.z + c.eixo.z * (c.fundo + c.raio), 12);
      // O círculo cabe entre as faces: raio = meia boca.
      expect(c.queda.raio).toBe(c.raio);
      expect(c.queda.raio).toBeCloseTo(distancia(q[0]!, q[1]!) / 2, 12);
    }
  });

  it('bocas de 8,5 cm no canto e 9,5 cm no meio, quinas de 10 e 4,8 mm (resposta do usuário, 2026-10-09)', () => {
    expect(MESA_BAR.bocaCanto).toBe(0.085);
    expect(MESA_BAR.bocaMeio).toBe(0.095);
    expect(MESA_BAR.raioQuinaCanto).toBe(0.01);
    expect(MESA_BAR.raioQuinaMeio).toBe(0.0048);
  });

  it('as quinas das tabelas deixam exatamente a boca configurada', () => {
    const [ladoZMenos1, ladoZMenos2, , , cabeceiraXMenos] = tabelas(MESA_BAR);
    expect(distancia(ladoZMenos1!.inicio, cabeceiraXMenos!.inicio)).toBeCloseTo(MESA_BAR.bocaCanto, 12);
    expect(distancia(ladoZMenos1!.fim, ladoZMenos2!.inicio)).toBeCloseTo(MESA_BAR.bocaMeio, 12);
  });
});

describe('pontas das tabelas nas bocas', () => {
  const pontas = pontasTabela(MESA_BAR);
  const segmentos = tabelas(MESA_BAR);
  const bocas = cacapas(MESA_BAR);

  it('doze: as duas pontas de cada tabela, na ordem de tabelas() (início, fim), cada uma na sua caçapa', () => {
    expect(pontas).toHaveLength(12);
    pontas.forEach((p, k) => {
      const t = segmentos[Math.floor(k / 2)]!;
      expect(p.tabela).toBe(Math.floor(k / 2));
      expect(p.quina).toEqual(k % 2 === 0 ? t.inicio : t.fim);
      const maisPerto = [...bocas].sort((a, b) => distancia(a.centro, p.quina) - distancia(b.centro, p.quina))[0]!;
      expect(p.cacapa).toBe(maisPerto.id);
    });
    // Cada caçapa tem duas pontas.
    for (const c of bocas) expect(pontas.filter((p) => p.cacapa === c.id)).toHaveLength(2);
  });

  it('a face entra na caçapa a 45° no canto (paralela à diagonal) e perpendicular ao nariz no meio', () => {
    for (const p of pontas) {
      const face = unitario(menos(p.fimDaFace, p.naFace));
      const t = segmentos[p.tabela]!;
      const nariz = unitario(menos(t.fim, t.inicio));
      const canto = p.cacapa.startsWith('canto');
      expect(Math.abs(escalar(face, nariz))).toBeCloseTo(canto ? Math.SQRT1_2 : 0, 12);
      // Para fora da mesa: contra a normal do nariz.
      expect(escalar(face, t.normal)).toBeLessThan(0);
      // A face continua a reta que sai da quina.
      expect(Math.abs(lado(p.quina, p.naFace, p.normalFace))).toBeLessThan(1e-12);
      expect(Math.abs(escalar(p.normalFace, face))).toBeLessThan(1e-12);
    }
  });

  it('o arredondado tem o raio da medida, é tangente ao nariz e à face e fica dentro da tabela', () => {
    for (const p of pontas) {
      const t = segmentos[p.tabela]!;
      const raio = p.cacapa.startsWith('canto') ? MESA_BAR.raioQuinaCanto : MESA_BAR.raioQuinaMeio;
      expect(p.raio).toBe(raio);
      expect(distancia(p.centro, p.noNariz)).toBeCloseTo(raio, 12);
      expect(distancia(p.centro, p.naFace)).toBeCloseTo(raio, 12);
      // Centro atrás das duas retas, a um raio de cada: o arco toca as duas sem cortar.
      expect(lado(p.centro, t.inicio, t.normal)).toBeCloseTo(-raio, 12);
      expect(lado(p.centro, p.naFace, p.normalFace)).toBeCloseTo(-raio, 12);
      // Os pontos de tangência ficam no nariz (entre as quinas) e na face (antes do fim dela).
      expect(lado(p.noNariz, t.inicio, t.normal)).toBeCloseTo(0, 12);
      const u = escalar(menos(p.noNariz, t.inicio), menos(t.fim, t.inicio)) / escalar(menos(t.fim, t.inicio), menos(t.fim, t.inicio));
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      expect(distancia(p.quina, p.naFace)).toBeLessThan(distancia(p.quina, p.fimDaFace));
    }
  });

  it('a normal da face aponta para dentro da boca, para a outra ponta da caçapa', () => {
    for (const p of pontas) {
      const outra = pontas.find((q) => q !== p && q.cacapa === p.cacapa)!;
      expect(lado(outra.quina, p.quina, p.normalFace)).toBeCloseTo(p.cacapa.startsWith('canto') ? MESA_BAR.bocaCanto : MESA_BAR.bocaMeio, 12);
    }
  });

  it('as faces vão até a linha de queda: da quina até o ponto de tangência do círculo, `fundo` + um raio para dentro da garganta (L15)', () => {
    for (const c of bocas) {
      for (const p of pontas.filter((q) => q.cacapa === c.id)) {
        const fundura = escalar(menos(p.fimDaFace, p.quina), c.eixo);
        expect(fundura).toBeCloseTo(c.fundo + c.raio, 12);
        // A face é paralela ao eixo: nenhuma abertura lateral entre a quina e o fim.
        expect(Math.abs(escalar(menos(p.fimDaFace, p.quina), p.normalFace))).toBeLessThan(1e-12);
      }
    }
  });

  it('as faces vão até o fundo do círculo de queda: tangentes a ele, no ponto mais largo dele', () => {
    for (const c of bocas) {
      for (const p of pontas.filter((q) => q.cacapa === c.id)) {
        expect(lado(c.queda.centro, p.naFace, p.normalFace)).toBeCloseTo(c.queda.raio, 12);
        // O fim da face é o ponto de tangência: a reta do centro ao fim é a normal da face.
        expect(distancia(c.queda.centro, p.fimDaFace)).toBeCloseTo(c.queda.raio, 12);
        expect(Math.abs(escalar(menos(c.queda.centro, p.fimDaFace), unitario(menos(p.fimDaFace, p.naFace))))).toBeLessThan(1e-12);
      }
    }
  });
});
