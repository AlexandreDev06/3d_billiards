import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TACO } from '@sinuca/fisica';
import { NOMES_DAS_PARTES, SOBRA_MAXIMA_DO_PERFIL, amostrasDaParte, partesDoTaco, perfilDaSilhueta, raioDoCone } from './perfil-do-taco';
import { geometriaTorneada } from './torneado';

describe('partesDoTaco: as peças de ponta a cabo, dentro das medidas de TACO', () => {
  const partes = partesDoTaco(TACO);

  it('são as nove, na ordem, sem vão nem sobreposição, de 0 a TACO.comprimento', () => {
    expect(partes.map((p) => p.nome)).toEqual([...NOMES_DAS_PARTES]);
    expect(partes[0]!.de).toBe(0);
    for (let i = 1; i < partes.length; i++) expect(partes[i]!.de).toBe(partes[i - 1]!.ate);
    expect(partes[partes.length - 1]!.ate).toBeCloseTo(TACO.comprimento, 12);
    for (const p of partes) expect(p.ate).toBeGreaterThan(p.de);
  });

  it('proporções de taco de verdade: sola de poucos mm, virola de uns 27 mm, haste até o meio, punho de ~25 cm, borracha de ~2 cm', () => {
    const por = (n: string) => partes.find((p) => p.nome === n)!;
    const comprimento = (n: string): number => por(n).ate - por(n).de;
    expect(comprimento('sola')).toBeGreaterThan(0.003);
    expect(comprimento('sola')).toBeLessThan(0.008);
    expect(comprimento('virola')).toBeGreaterThan(0.02);
    expect(comprimento('virola')).toBeLessThan(0.035);
    expect(por('haste').ate).toBeCloseTo(TACO.comprimento / 2, 6);
    expect(comprimento('junta')).toBeLessThan(0.03);
    expect(comprimento('antebraco')).toBeGreaterThan(0.2);
    expect(comprimento('punho')).toBeGreaterThan(0.2);
    expect(comprimento('punho')).toBeLessThan(0.3);
    expect(comprimento('borracha')).toBeLessThan(0.03);
  });

  it('o raio nunca passa do cone de TACO por mais que a sobra de desenho (a folga da elevação cobre) e nunca fica fino demais', () => {
    for (const p of partes) {
      for (const { q, r } of amostrasDaParte(p, 0.005)) {
        const cone = raioDoCone(TACO, q);
        expect(r, `${p.nome} em q=${q}`).toBeLessThanOrEqual(cone * SOBRA_MAXIMA_DO_PERFIL + 1e-12);
        // Só a calota da sola e a tampa arredondada fecham em zero; o resto é perto do cone.
        if (p.nome !== 'sola' && p.nome !== 'borracha') expect(r).toBeGreaterThan(cone * 0.99);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    }
    // A sobra máxima é de poucos décimos de mm: bem abaixo da folga de 2,5 mm de ElevacaoDoTaco.
    expect(TACO.raioBase * (SOBRA_MAXIMA_DO_PERFIL - 1)).toBeLessThan(0.001);
  });

  it('o perfil é contínuo de uma peça à seguinte (sem degraus de mais de meio milímetro)', () => {
    for (let i = 1; i < partes.length; i++) {
      const antes = partes[i - 1]!;
      const depois = partes[i]!;
      expect(Math.abs(antes.raio(antes.ate) - depois.raio(depois.de)), `${antes.nome} → ${depois.nome}`).toBeLessThan(0.0005);
    }
  });

  it('a sola fecha na ponta (raio 0) e acaba no raio da ponta; a borracha fecha no cabo', () => {
    expect(partes[0]!.raio(0)).toBe(0);
    expect(partes[0]!.raio(partes[0]!.ate)).toBeCloseTo(0.98 * TACO.raioPonta, 6);
    expect(partes[8]!.raio(TACO.comprimento)).toBeLessThan(1e-6);
  });

  it('a silhueta inteira vai da ponta ao cabo em q crescente', () => {
    const silhueta = perfilDaSilhueta(TACO);
    expect(silhueta[0]!.q).toBe(0);
    expect(silhueta[silhueta.length - 1]!.q).toBeCloseTo(TACO.comprimento, 9);
    for (let i = 1; i < silhueta.length; i++) expect(silhueta[i]!.q).toBeGreaterThan(silhueta[i - 1]!.q);
  });
});

describe('geometriaTorneada', () => {
  const perfil = [
    { q: 0, r: 0.01 },
    { q: 0.5, r: 0.02 },
    { q: 1, r: 0.03 },
  ];

  it('tem (lados + 1) vértices por anel e dois triângulos por quadro', () => {
    const g = geometriaTorneada(perfil, 8);
    expect(g.getAttribute('position').count).toBe(3 * 9);
    expect(g.getIndex()!.count).toBe(2 * 8 * 3 * 2);
  });

  it('a ponta fica na origem e o corpo corre ao longo de -X, com o raio do perfil', () => {
    const g = geometriaTorneada(perfil, 16);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeCloseTo(0, 6);
    expect(g.boundingBox!.min.x).toBeCloseTo(-1, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.03, 6);
    expect(g.boundingBox!.min.z).toBeCloseTo(-0.03, 6);
  });

  it('as coordenadas de textura: u dá a volta, v vai de 0 a 1 pelo comprimento (não pelo índice)', () => {
    const g = geometriaTorneada([{ q: 0, r: 0.01 }, { q: 0.1, r: 0.01 }, { q: 1, r: 0.01 }], 4);
    const uv = g.getAttribute('uv');
    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(4)).toBe(1);
    expect(uv.getY(5)).toBeCloseTo(0.1, 6);
    expect(uv.getY(10)).toBe(1);
  });

  it('todos os triângulos estão voltados para fora (o lado de frente é o de fora: nada some por culling)', () => {
    for (const parte of partesDoTaco(TACO)) {
      const g = geometriaTorneada(amostrasDaParte(parte), 12);
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const idx = g.getIndex()!;
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      const n = new Vector3();
      let contados = 0;
      for (let t = 0; t < idx.count; t += 3) {
        const [i, j, k] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
        a.fromBufferAttribute(pos, i!);
        b.fromBufferAttribute(pos, j!);
        c.fromBufferAttribute(pos, k!);
        const face = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
        if (face.length() < 1e-12) continue; // triângulo degenerado (o vértice da calota)
        n.fromBufferAttribute(nor, i!).add(new Vector3().fromBufferAttribute(nor, j!)).add(new Vector3().fromBufferAttribute(nor, k!));
        expect(face.dot(n), `${parte.nome}, triângulo ${t / 3}`).toBeGreaterThan(0);
        contados++;
      }
      expect(contados).toBeGreaterThan(0);
    }
  });

  it('as normais têm comprimento 1 e apontam para fora do eixo', () => {
    const g = geometriaTorneada(perfil, 12);
    const nor = g.getAttribute('normal');
    const pos = g.getAttribute('position');
    for (let v = 0; v < nor.count; v++) {
      expect(Math.hypot(nor.getX(v), nor.getY(v), nor.getZ(v))).toBeCloseTo(1, 5);
      expect(nor.getY(v) * pos.getY(v) + nor.getZ(v) * pos.getZ(v)).toBeGreaterThan(0);
    }
  });

  it('recusa um perfil de um ponto só', () => {
    expect(() => geometriaTorneada([{ q: 0, r: 1 }], 8)).toThrow(RangeError);
  });
});
