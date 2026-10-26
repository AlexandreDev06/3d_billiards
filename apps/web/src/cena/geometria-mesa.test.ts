import { describe, expect, it } from 'vitest';
import { BOLA, BOLAO, MESA_BAR, cacapas, distanciaContatoTabela, pontasTabela, tabelas, type MedidasMesa, type Ponto2 } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import {
  aneisTabela,
  circuloDoFuro,
  comMolduraVisual,
  contornoMoldura,
  contornoPano,
  contornoTabela,
  entalhesDaMoldura,
  furosVisuais,
  larguraDaMoldura,
  perfilNariz,
  retanguloArredondado,
} from './geometria-mesa';

const EPS = 1e-9;
const cfg = CONFIG_WEB.mesa;

const MESA_OFICIAL: MedidasMesa = {
  comprimento: 2.54,
  largura: 1.27,
  bocaCanto: 0.07,
  bocaMeio: 0.09,
  raioQuinaCanto: 0.01,
  raioQuinaMeio: 0.0048,
  alturaTabela: 0.036,
  larguraTabela: 0.045,
  larguraMoldura: 0.09,
  fundoCanto: 0.054,
  fundoMeio: 0.0405,
};

const dist = (a: Ponto2, b: Ponto2): number => Math.hypot(a.x - b.x, a.z - b.z);
const dot = (a: Ponto2, b: Ponto2): number => a.x * b.x + a.z * b.z;
const cruz = (a: Ponto2, b: Ponto2): number => a.x * b.z - a.z * b.x;
const sub = (a: Ponto2, b: Ponto2): Ponto2 => ({ x: a.x - b.x, z: a.z - b.z });

/** Estritamente dentro do retângulo do nariz (a área de jogo). */
const dentroDoNariz = (p: Ponto2, mesa: MedidasMesa): boolean =>
  Math.abs(p.x) < mesa.comprimento / 2 - EPS && Math.abs(p.z) < mesa.largura / 2 - EPS;

/** Menor distância de `p` às arestas de um polígono fechado. */
function distanciaAoContorno(p: Ponto2, poligono: readonly Ponto2[]): number {
  let menor = Infinity;
  poligono.forEach((a, i) => {
    const b = poligono[(i + 1) % poligono.length]!;
    const ab = sub(b, a);
    const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-30)));
    menor = Math.min(menor, dist(p, { x: a.x + ab.x * t, z: a.z + ab.z * t }));
  });
  return menor;
}

function pontoNoPoligono(p: Ponto2, poligono: readonly Ponto2[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]!;
    const b = poligono[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Cruzamento próprio entre dois segmentos (encostar na ponta não conta). */
function seCruzam(a: Ponto2, b: Ponto2, c: Ponto2, d: Ponto2): boolean {
  const o1 = cruz(sub(b, a), sub(c, a));
  const o2 = cruz(sub(b, a), sub(d, a));
  const o3 = cruz(sub(d, c), sub(a, c));
  const o4 = cruz(sub(d, c), sub(b, c));
  return o1 * o2 < -1e-18 && o3 * o4 < -1e-18;
}

/** Pares de arestas não vizinhas que se cruzam (arestas de comprimento zero são ignoradas). */
function autoIntersecoes(poligono: readonly Ponto2[]): [number, number][] {
  const n = poligono.length;
  const arestas = poligono.map((p, i) => [p, poligono[(i + 1) % n]!] as const);
  const achadas: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b] = arestas[i]!;
      const [c, d] = arestas[j]!;
      if (dist(a, b) < 1e-12 || dist(c, d) < 1e-12) continue;
      if (seCruzam(a, b, c, d)) achadas.push([i, j]);
    }
  }
  return achadas;
}

describe.each([
  { nome: 'mesa de bar', mesa: MESA_BAR },
  { nome: 'mesa oficial', mesa: MESA_OFICIAL },
])('geometria da $nome', ({ mesa }) => {
  const w = mesa.larguraTabela;
  const hx = mesa.comprimento / 2;
  const hz = mesa.largura / 2;
  const furos = furosVisuais(mesa);
  const segmentos = tabelas(mesa);
  const quinas = segmentos.flatMap((s) => [s.inicio, s.fim]);
  /** A mesa como se desenha: a moldura alargada, se preciso, para o buraco do meio caber. */
  const visual = comMolduraVisual(mesa, cfg);
  const doFuro = (f: (typeof furos)[number]) => ({
    /** `s` ao longo do eixo a partir da boca, `t` de lado. */
    local: (p: Ponto2) => ({ s: dot(sub(p, f.boca), f.eixo), t: cruz(f.eixo, sub(p, f.boca)) }),
  });

  describe('furos visuais: o círculo de queda da física, no fundo da garganta', () => {
    it('há um por caçapa da física, seis no total', () => {
      expect(furos).toHaveLength(6);
      expect(new Set(furos.map((f) => f.fisica.id)).size).toBe(6);
    });

    it('cada furo é o círculo de queda da física: o mesmo centro e o mesmo raio, e não o círculo tangente à boca', () => {
      for (const f of furos) {
        expect(f.centro).toEqual(f.fisica.queda.centro);
        expect(f.raio).toBe(f.fisica.queda.raio);
        expect(dist(f.centro, f.fisica.centro)).toBeCloseTo(f.fisica.fundo, 9);
      }
    });

    it('o centro fica no eixo, a fundo + raio da boca: a boca é a reta entre as quinas', () => {
      for (const f of furos) {
        const { s, t } = doFuro(f).local(f.centro);
        expect(s).toBeCloseTo(f.fisica.fundo + f.fisica.raio, 9);
        expect(Math.abs(t)).toBeLessThan(EPS);
        const [q1, q2] = f.faces.map((face) => face.quina) as [Ponto2, Ponto2];
        expect(dist(f.boca, { x: (q1.x + q2.x) / 2, z: (q1.z + q2.z) / 2 })).toBeLessThan(EPS);
        expect(dist(q1, q2)).toBeCloseTo(2 * f.fisica.raio, 9);
        expect(Math.abs(dot(sub(q1, q2), f.eixo))).toBeLessThan(EPS);
        expect(dot(f.eixo, f.boca)).toBeGreaterThan(0);
      }
    });

    it('as duas faces da garganta saem das quinas de tabelas() e terminam no círculo, em pontos opostos (fimDaFace da física)', () => {
      const pontas = pontasTabela(mesa);
      for (const f of furos) {
        for (const face of f.faces) {
          expect(quinas.some((q) => dist(q, face.quina) < EPS)).toBe(true);
          const daFisica = pontas.find((p) => dist(p.quina, face.quina) < EPS)!;
          expect(dist(face.fimDaFace, daFisica.fimDaFace)).toBeLessThan(EPS);
          // a face é paralela ao eixo, e termina tangente ao círculo de queda
          expect(Math.abs(cruz(f.eixo, sub(face.fimDaFace, face.quina)))).toBeLessThan(1e-9);
          expect(dot(f.eixo, sub(face.fimDaFace, face.quina))).toBeCloseTo(f.fisica.fundo + f.fisica.raio, 9);
          expect(dist(face.fimDaFace, f.centro)).toBeCloseTo(f.raio, 9);
        }
        expect(dist(f.faces[0].fimDaFace, f.faces[1].fimDaFace)).toBeCloseTo(2 * f.raio, 9);
      }
    });

    it('a face deixa a borracha na linha de trás dela, a larguraTabela do nariz, ainda sobre a sua reta', () => {
      for (const f of furos) {
        for (const face of f.faces) {
          expect(dot(sub(face.naBorracha, face.quina), face.fora)).toBeCloseTo(w, 9);
          expect(Math.abs(cruz(f.eixo, sub(face.naBorracha, face.quina)))).toBeLessThan(1e-9);
          // dentro da garganta de madeira: a borracha acaba antes de a face tocar o círculo
          expect(dot(f.eixo, sub(face.naBorracha, face.quina))).toBeLessThan(f.fisica.fundo + f.fisica.raio);
        }
      }
    });

    it('as faces vêm em ordem anti-horária (a de menor ângulo em volta do centro da mesa primeiro)', () => {
      for (const f of furos) {
        const [a, b] = f.faces.map((face) => Math.atan2(face.quina.z, face.quina.x)) as [number, number];
        expect(a).toBeLessThan(b);
      }
    });

    it('nenhuma quina fica dentro de um buraco', () => {
      for (const f of furos) for (const q of quinas) expect(dist(q, f.centro)).toBeGreaterThan(f.raio + 1e-6);
    });
  });

  describe('largura da moldura do desenho', () => {
    it('nunca é menor que a das medidas', () => {
      expect(larguraDaMoldura(mesa, cfg)).toBeGreaterThanOrEqual(mesa.larguraMoldura);
      expect(visual.larguraMoldura).toBe(larguraDaMoldura(mesa, cfg));
    });

    it('o buraco mais fundo cabe com a parede de madeira da config até a borda de fora', () => {
      const alcance = Math.max(...furos.map((f) => Math.max(Math.abs(f.centro.x) + f.raio - hx, Math.abs(f.centro.z) + f.raio - hz)));
      expect(w + visual.larguraMoldura - alcance).toBeGreaterThanOrEqual(cfg.paredeDaCacapa - EPS);
    });

    it('é só a que o buraco pede: com uma moldura já larga o bastante, fica a das medidas', () => {
      const larga = { ...mesa, larguraMoldura: 0.3 };
      expect(larguraDaMoldura(larga, cfg)).toBe(0.3);
      expect(comMolduraVisual(larga, cfg)).toEqual(larga);
    });

    it('é o buraco do meio que manda: fundoMeio + a boca inteira, mais a parede, menos a borracha', () => {
      const doMeio = cacapas(mesa).find((c) => c.id === 'meio-z+')!;
      const pedida = doMeio.fundo + 2 * doMeio.raio + cfg.paredeDaCacapa - w;
      expect(larguraDaMoldura(mesa, cfg)).toBeCloseTo(Math.max(mesa.larguraMoldura, pedida), 9);
    });
  });

  describe('perfil do nariz', () => {
    const perfil = perfilNariz(mesa, cfg);

    it('sobe do pano recuado até o nariz (d = 0 a y = altura) e termina arredondado acima dele', () => {
      expect(perfil[0]!.y).toBe(0);
      expect(perfil[0]!.d).toBeGreaterThan(cfg.folgaRebaixo);
      expect(perfil).toHaveLength(9);
      expect(perfil.some((p) => Math.abs(p.d) < EPS && Math.abs(p.y - mesa.alturaTabela) < EPS)).toBe(true);
      for (let i = 1; i < perfil.length; i++) expect(perfil[i]!.y).toBeGreaterThan(perfil[i - 1]!.y);
      expect(perfil.at(-1)!.y).toBeCloseTo(mesa.alturaTabela + cfg.chanfroTopo, 9);
      expect(perfil.at(-1)!.d).toBeCloseTo(cfg.chanfroTopo, 9);
    });

    it.each([
      { nome: 'bola', medidas: BOLA },
      { nome: 'bolão', medidas: BOLAO },
    ])('a face do nariz não invade a bola encostada ($nome), em nenhuma altura', ({ medidas }) => {
      const centro = { d: -distanciaContatoTabela(medidas.raio, mesa), y: medidas.raio };
      let menor = Infinity;
      for (let i = 0; i + 1 < perfil.length; i++) {
        const a = perfil[i]!;
        const b = perfil[i + 1]!;
        for (let k = 0; k <= 400; k++) {
          const t = k / 400;
          menor = Math.min(menor, Math.hypot(a.d + (b.d - a.d) * t - centro.d, a.y + (b.y - a.y) * t - centro.y));
        }
      }
      expect(menor).toBeGreaterThanOrEqual(medidas.raio - 1e-9);
    });
  });

  describe('contorno das tabelas', () => {
    const daQuina = (quina: Ponto2) => furos.find((f) => f.faces.some((face) => dist(face.quina, quina) < EPS))!;

    it('tem uma tabela por segmento da física, de 16 pontos: o nariz reto, o arredondado e a face de cada ponta', () => {
      for (let i = 0; i < segmentos.length; i++) expect(contornoTabela(mesa, cfg, i)).toHaveLength(16);
    });

    it('a ponta é arredondada só no desenho: o nariz fica reto na linha da física e o contorno passa a no máximo 2 mm de cada quina', () => {
      segmentos.forEach((s, i) => {
        const contorno = contornoTabela(mesa, cfg, i);
        const fundo = (p: Ponto2): number => -dot(sub(p, s.inicio), s.normal);
        expect(Math.abs(fundo(contorno[0]!))).toBeLessThan(EPS);
        expect(Math.abs(fundo(contorno[1]!))).toBeLessThan(EPS);
        expect(dot(sub(contorno[1]!, contorno[0]!), sub(s.fim, s.inicio))).toBeGreaterThan(0);
        expect(dist(contorno[0]!, s.inicio)).toBeLessThan(0.006);
        expect(dist(contorno[1]!, s.fim)).toBeLessThan(0.006);
        for (const quina of [s.inicio, s.fim]) {
          const furo = daQuina(quina);
          const noCanto = Math.abs(furo.fisica.boca.x) > 0;
          const alfa = noCanto ? (135 * Math.PI) / 180 : Math.PI / 2;
          const raio = noCanto ? mesa.raioQuinaCanto : mesa.raioQuinaMeio;
          const recuo = distanciaAoContorno(quina, contorno);
          expect(recuo).toBeLessThanOrEqual(0.002);
          expect(recuo).toBeCloseTo(raio * (1 / Math.sin(alfa / 2) - 1), 6);
        }
      });
    });

    it('com o nariz na linha da física, a ponta do desenho é a curva de pontasTabela(): mesmo raio, mesmo começo no nariz, mesmo fim na face', () => {
      const pontas = pontasTabela(mesa);
      segmentos.forEach((s, i) => {
        const contorno = contornoTabela(mesa, cfg, i);
        const doInicio = pontas.find((p) => p.tabela === i && dist(p.quina, s.inicio) < EPS)!;
        const doFim = pontas.find((p) => p.tabela === i && dist(p.quina, s.fim) < EPS)!;
        expect(dist(contorno[0]!, doInicio.noNariz)).toBeLessThan(1e-9);
        expect(dist(contorno[1]!, doFim.noNariz)).toBeLessThan(1e-9);
        for (const p of [doInicio, doFim]) {
          // os sete pontos do arco (seis lados) estão no círculo da física, e o último é onde a face começa
          const noArco = contorno.filter((q) => Math.abs(dist(q, p.centro) - p.raio) < 1e-9);
          expect(noArco).toHaveLength(7);
          expect(noArco.some((q) => dist(q, p.naFace) < 1e-9)).toBe(true);
          // a face do desenho segue a da física: sai de naFace na direção de fimDaFace e vai até a linha de trás da borracha
          const eixoDaFace = sub(p.fimDaFace, p.naFace);
          const comprimento = Math.hypot(eixoDaFace.x, eixoDaFace.z);
          const naMesmaLinha = contorno.filter((q) => {
            const r = sub(q, p.naFace);
            return Math.abs(cruz(r, eixoDaFace)) / comprimento < 1e-9 && dot(r, eixoDaFace) > -1e-9;
          });
          expect(naMesmaLinha.length).toBeGreaterThanOrEqual(2);
        }
      });
    });

    it('só as duas quinas ficam na linha do nariz; o resto está mais fundo, até a linha de trás da borracha', () => {
      segmentos.forEach((s, i) => {
        const fundo = (p: Ponto2): number => -dot(sub(p, s.inicio), s.normal);
        const contorno = contornoTabela(mesa, cfg, i);
        for (const p of contorno.slice(2)) {
          expect(fundo(p)).toBeGreaterThan(EPS);
          expect(fundo(p)).toBeLessThanOrEqual(w + EPS);
        }
        expect(Math.max(...contorno.map(fundo))).toBeCloseTo(w, 9);
      });
    });

    it('a face da quina é paralela ao eixo da boca: a ponta arredondada a deixa e ela corre reta até a linha de trás da borracha, onde a madeira continua', () => {
      segmentos.forEach((s, i) => {
        const contorno = contornoTabela(mesa, cfg, i);
        for (const quina of [s.inicio, s.fim]) {
          const furo = daQuina(quina);
          const face = furo.faces.find((f) => dist(f.quina, quina) < EPS)!;
          const naFace = contorno.filter((p) => Math.abs(cruz(sub(p, quina), furo.eixo)) < 1e-9 && dot(sub(p, quina), furo.eixo) > 1e-9);
          expect(naFace.length).toBeGreaterThanOrEqual(2);
          const maisLonge = naFace.reduce((a, b) => (dot(sub(b, quina), furo.eixo) > dot(sub(a, quina), furo.eixo) ? b : a));
          expect(dist(maisLonge, face.naBorracha)).toBeLessThan(1e-9);
        }
      });
    });

    it('nenhum ponto de nenhum anel entra no retângulo do nariz', () => {
      segmentos.forEach((_, i) => {
        for (const anel of aneisTabela(mesa, cfg, i)) {
          for (const p of anel.contorno) expect(dentroDoNariz(p, mesa)).toBe(false);
        }
      });
    });

    it('os anéis seguem o perfil do nariz e têm todos o mesmo número de pontos', () => {
      const perfil = perfilNariz(mesa, cfg);
      segmentos.forEach((s, i) => {
        const aneis = aneisTabela(mesa, cfg, i);
        expect(aneis.map((a) => a.y)).toEqual(perfil.map((p) => p.y));
        for (const anel of aneis) expect(anel.contorno).toHaveLength(aneis[0]!.contorno.length);
        aneis.forEach((anel, k) => {
          const recuo = -dot(sub(anel.contorno[0]!, s.inicio), s.normal);
          expect(recuo).toBeCloseTo(perfil[k]!.d, 9);
        });
      });
    });

    it('nenhum anel cruza a si mesmo', () => {
      segmentos.forEach((_, i) => {
        for (const anel of aneisTabela(mesa, cfg, i)) expect(autoIntersecoes(anel.contorno)).toEqual([]);
      });
    });

    it('nenhum ponto do contorno cai dentro da garganta nem do buraco: a borracha termina nas faces', () => {
      segmentos.forEach((_, i) => {
        for (const anel of aneisTabela(mesa, cfg, i)) {
          for (const p of anel.contorno) {
            for (const f of furos) {
              const { s, t } = doFuro(f).local(p);
              const naGarganta = s > EPS && s < f.fisica.fundo + f.fisica.raio && Math.abs(t) < f.raio - 1e-7;
              expect(naGarganta || dist(p, f.centro) < f.raio - 1e-7).toBe(false);
            }
          }
        }
      });
    });
  });

  describe('pano', () => {
    const { externo, furos: buracos } = contornoPano(visual, cfg);

    it('o retângulo cobre a área de jogo, as tabelas e a garganta de cada caçapa por baixo da moldura', () => {
      expect(autoIntersecoes(externo)).toEqual([]);
      expect(Math.max(...externo.map((p) => Math.abs(p.x)))).toBeGreaterThan(hx + w);
      expect(Math.max(...externo.map((p) => Math.abs(p.z)))).toBeGreaterThan(hz + w);
      expect(Math.max(...externo.map((p) => Math.abs(p.x)))).toBeLessThan(hx + w + visual.larguraMoldura);
      expect(Math.max(...externo.map((p) => Math.abs(p.z)))).toBeLessThan(hz + w + visual.larguraMoldura);
      for (const f of furos) {
        for (const face of f.faces) {
          expect(pontoNoPoligono(face.fimDaFace, externo)).toBe(true);
          expect(pontoNoPoligono(face.naBorracha, externo)).toBe(true);
        }
      }
    });

    it('tem um buraco por caçapa, e cada um é o círculo de queda (todos os pontos sobre ele)', () => {
      expect(buracos).toHaveLength(6);
      furos.forEach((f, k) => {
        expect(buracos[k]).toEqual(circuloDoFuro(f, cfg));
        for (const p of buracos[k]!) expect(dist(p, f.centro)).toBeCloseTo(f.raio, 9);
        expect(buracos[k]!.length).toBe(cfg.segmentosPorVolta);
        expect(autoIntersecoes(buracos[k]!)).toEqual([]);
      });
    });

    it('os buracos ficam dentro do retângulo e não se tocam', () => {
      for (const b of buracos) for (const p of b) expect(pontoNoPoligono(p, externo)).toBe(true);
      furos.forEach((a, i) => furos.forEach((b, j) => i < j && expect(dist(a.centro, b.centro)).toBeGreaterThan(a.raio + b.raio)));
    });

    it('há pano na garganta inteira, da boca até onde o círculo começa: a bola parada ali está apoiada', () => {
      const dentroDeAlgumBuraco = (p: Ponto2): boolean => furos.some((f) => dist(p, f.centro) < f.raio);
      for (const f of furos) {
        const emS = (s: number, lateral = 0): Ponto2 => ({ x: f.boca.x + f.eixo.x * s - f.eixo.z * lateral, z: f.boca.z + f.eixo.z * s + f.eixo.x * lateral });
        for (const s of [0.002, f.fisica.fundo / 2, f.fisica.fundo - 0.001]) {
          const p = emS(s);
          expect(pontoNoPoligono(p, externo)).toBe(true);
          expect(dentroDeAlgumBuraco(p)).toBe(false);
        }
        // o buraco começa na linha de queda: a fundo da boca
        expect(dentroDeAlgumBuraco(emS(f.fisica.fundo + 0.001))).toBe(true);
        expect(dentroDeAlgumBuraco(f.centro)).toBe(true);
      }
    });
  });

  describe('moldura', () => {
    const { externo, furo } = contornoMoldura(visual, cfg);
    const naBorda = (p: Ponto2): boolean => Math.abs(Math.abs(p.x) - (hx + w)) < 1e-9 || Math.abs(Math.abs(p.z) - (hz + w)) < 1e-9;
    /** Sobre a parede reta de um entalhe: a continuação de uma face, da linha de trás da borracha até tocar o círculo. */
    const naParede = (p: Ponto2): boolean =>
      furos.some((f) =>
        f.faces.some((face) => Math.abs(cruz(f.eixo, sub(p, face.quina))) < 1e-9 && dot(f.eixo, sub(p, face.naBorracha)) > -1e-9 && dot(f.eixo, sub(p, face.fimDaFace)) < 1e-9),
      );
    const noCirculo = (p: Ponto2): boolean => furos.some((f) => Math.abs(dist(p, f.centro) - f.raio) < 1e-9);
    const externoX = hx + w + visual.larguraMoldura;
    const externoZ = hz + w + visual.larguraMoldura;

    it('o contorno externo e o do furo não cruzam a si mesmos', () => {
      expect(externo.length).toBeGreaterThan(20);
      expect(furo.length).toBeGreaterThan(40);
      expect(autoIntersecoes(externo)).toEqual([]);
      expect(autoIntersecoes(furo)).toEqual([]);
    });

    it('nenhum ponto de contorno entra no retângulo do nariz', () => {
      for (const p of [...externo, ...furo]) expect(dentroDoNariz(p, mesa)).toBe(false);
    });

    it('o externo é o retângulo da moldura (alargada para o buraco caber) com os cantos arredondados', () => {
      expect(Math.max(...externo.map((p) => Math.abs(p.x)))).toBeCloseTo(externoX, 9);
      expect(Math.max(...externo.map((p) => Math.abs(p.z)))).toBeCloseTo(externoZ, 9);
      expect(pontoNoPoligono({ x: externoX - 0.002, z: externoZ - 0.002 }, externo)).toBe(false);
      expect(pontoNoPoligono({ x: externoX - 0.002, z: 0 }, externo)).toBe(true);
    });

    it('o furo é o retângulo nariz + tabela com um entalhe por caçapa: a borda, as paredes retas das faces e o arco de fora do círculo', () => {
      for (const p of furo) expect(naBorda(p) || naParede(p) || noCirculo(p)).toBe(true);
      for (const f of furos) {
        const noArco = furo.filter((p) => Math.abs(dist(p, f.centro) - f.raio) < 1e-9);
        expect(noArco.length).toBeGreaterThan(8);
        // o arco é o de fora da mesa: passa pelo ponto mais afastado da boca, e nenhum ponto dele fica antes da linha da boca
        const maisLonge = noArco.reduce((a, b) => (dot(f.eixo, sub(b, f.boca)) > dot(f.eixo, sub(a, f.boca)) ? b : a));
        expect(dist(maisLonge, { x: f.centro.x + f.eixo.x * f.raio, z: f.centro.z + f.eixo.z * f.raio })).toBeLessThan(2 * f.raio * Math.sin(Math.PI / cfg.segmentosPorVolta) + 1e-9);
        for (const face of f.faces) {
          expect(furo.some((p) => dist(p, face.fimDaFace) < 1e-9)).toBe(true);
          expect(furo.some((p) => dist(p, face.naBorracha) < 1e-9)).toBe(true);
        }
      }
    });

    it('a madeira cobre a borda e deixa livres a mesa, a garganta e o buraco de cada caçapa', () => {
      const madeira = (p: Ponto2): boolean => pontoNoPoligono(p, externo) && !pontoNoPoligono(p, furo);
      expect(madeira({ x: externoX - 0.02, z: 0 })).toBe(true);
      expect(madeira({ x: 0, z: 0 })).toBe(false);
      for (const f of furos) {
        expect(madeira(f.centro)).toBe(false);
        const noEixo = (s: number): Ponto2 => ({ x: f.boca.x + f.eixo.x * s, z: f.boca.z + f.eixo.z * s });
        // a garganta de madeira (além da borracha) é vazada; e logo depois do arco de fora, na direção do eixo, é madeira
        expect(madeira(noEixo(w / Math.abs(dot(f.eixo, f.faces[0].fora)) + 0.005))).toBe(false);
        expect(madeira(noEixo(f.fisica.fundo + 2 * f.raio + 0.01))).toBe(true);
      }
    });

    it('sobra pelo menos paredeDaCacapa de madeira entre o buraco e a borda de fora, em todas as caçapas', () => {
      for (const f of furos) {
        for (let k = 0; k < 64; k++) {
          const a = (k / 64) * 2 * Math.PI;
          const p = { x: f.centro.x + f.raio * Math.cos(a), z: f.centro.z + f.raio * Math.sin(a) };
          expect(distanciaAoContorno(p, externo)).toBeGreaterThanOrEqual(cfg.paredeDaCacapa - 1e-9);
        }
      }
    });

    it('o furo cabe dentro do contorno externo', () => {
      for (const p of furo) expect(pontoNoPoligono(p, externo)).toBe(true);
    });
  });

  describe('entalhes da moldura', () => {
    const entalhes = entalhesDaMoldura(visual, cfg);

    it('há um caminho por caçapa: da linha de trás da borracha, pela parede reta e pelo arco de fora do círculo, até a outra face', () => {
      expect(entalhes).toHaveLength(6);
      for (const { furo, caminho } of entalhes) {
        const [primeira, segunda] = furo.faces;
        expect(dist(caminho[0]!, primeira.naBorracha)).toBeLessThan(EPS);
        expect(dist(caminho.at(-1)!, segunda.naBorracha)).toBeLessThan(EPS);
        for (const face of furo.faces) expect(caminho.some((p) => dist(p, face.fimDaFace) < EPS)).toBe(true);
        const noArco = caminho.filter((p) => Math.abs(dist(p, furo.centro) - furo.raio) < 1e-9);
        expect(noArco.length).toBeGreaterThan(8);
        // as paredes retas têm pontos a mais no meio, para o lábio de alumínio seguir a curva
        expect(caminho.length).toBeGreaterThan(noArco.length + 4);
        // fora do retângulo nariz + tabela, menos as duas pontas, que estão na borda dele
        const fora = caminho.filter((p) => Math.abs(p.x) > hx + w + 1e-9 || Math.abs(p.z) > hz + w + 1e-9);
        expect(fora.length).toBeGreaterThanOrEqual(caminho.length - 2);
      }
    });

    it('os pontos do furo da moldura são pontos destes caminhos', () => {
      const { furo } = contornoMoldura(visual, cfg);
      const todos = entalhes.flatMap((e) => e.caminho);
      for (const p of furo) expect(todos.some((q) => dist(p, q) < EPS)).toBe(true);
    });
  });
});

describe('retanguloArredondado', () => {
  it('fecha o retângulo com cantos de raio r: as pontas retas ficam a r dos cantos', () => {
    const contorno = retanguloArredondado(2, 1, 0.25, 64);
    expect(Math.max(...contorno.map((p) => p.x))).toBeCloseTo(2, 12);
    expect(Math.min(...contorno.map((p) => p.z))).toBeCloseTo(-1, 12);
    expect(contorno.every((p) => Math.hypot(Math.max(Math.abs(p.x) - 1.75, 0), Math.max(Math.abs(p.z) - 0.75, 0)) <= 0.25 + 1e-9)).toBe(true);
    expect(autoIntersecoes(contorno)).toEqual([]);
  });
});
