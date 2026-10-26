import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, cacapas, type EstadoMesa } from '@sinuca/fisica';
import { larguraDaMoldura } from '../cena/geometria-mesa';
import { CONFIG_WEB } from '../config';
import { ElevacaoDoTaco, obstaculosDaMesa } from './elevacao-do-taco';

const cfg = CONFIG_WEB.elevacaoDoTaco;
const o = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HX = MESA_BAR.comprimento / 2;
const HZ = MESA_BAR.largura / 2;

const mesaCom = (...outras: readonly [number, number][]): EstadoMesa => ({
  bolas: [bolaParada(ID_BOLAO, { x: 0, z: 0 }), ...outras.map(([x, z], i) => bolaParada(i + 1, { x, z }))],
});

function novo(): ElevacaoDoTaco {
  return new ElevacaoDoTaco(o, TACO, R, r, cfg);
}

interface Mira {
  readonly x: number;
  readonly z: number;
  readonly angulo: number;
  readonly lateral?: number;
  readonly vertical?: number;
  readonly recuo?: number;
}

/** O alvo para uma mira, com as bolas dadas. */
function alvoDe(m: Mira, ...outras: readonly [number, number][]): number {
  const e = novo();
  e.definirBolas(mesaCom(...outras));
  e.atualizar(1, m.angulo, m.lateral ?? 0, m.vertical ?? 0, m.recuo ?? 0, m.x, m.z);
  return e.alvo;
}

const CACAPAS = cacapas(MESA_BAR);

/**
 * O ponto (x, z) está no vão de uma caçapa, com `margem` de folga para a largura do taco ali? Pelas medidas da física, sem
 * passar por `obstaculosDaMesa`: a garganta (do eixo da boca, `raio` de cada lado, da boca ao centro do círculo de queda) ou o
 * círculo de queda.
 */
function noVao(x: number, z: number, margem: number): boolean {
  return CACAPAS.some((c) => {
    const dx = x - c.boca.x;
    const dz = z - c.boca.z;
    const s = dx * c.eixo.x + dz * c.eixo.z;
    const t = -dx * c.eixo.z + dz * c.eixo.x;
    const naGarganta = s >= 0 && s <= c.fundo + c.raio && Math.abs(t) < c.raio - margem;
    return naGarganta || Math.hypot(x - c.queda.centro.x, z - c.queda.centro.z) < c.raio - margem;
  });
}

/**
 * Referência por força bruta, sem os atalhos da conta: amostra o cone do taco de 1 mm em 1 mm e devolve a pior
 * penetração (m, > 0 = atravessa) na tabela, na moldura (fora do vão das caçapas) ou numa bola.
 */
function penetracao(elevacao: number, m: Mira, outras: readonly [number, number][]): number {
  const lateral = m.lateral ?? 0;
  const vertical = m.vertical ?? 0;
  const ca = Math.cos(m.angulo);
  const sa = Math.sin(m.angulo);
  const ce = Math.cos(elevacao);
  const se = Math.sin(elevacao);
  const px = m.x - sa * lateral * R;
  const py = R + vertical * R;
  const pz = m.z + ca * lateral * R;
  const t0 = R * Math.sqrt(1 - lateral * lateral - vertical * vertical) + (m.recuo ?? 0);
  let pior = -Infinity;
  for (let q = t0; q <= t0 + TACO.comprimento; q += 0.001) {
    const raio = TACO.raioPonta + ((TACO.raioBase - TACO.raioPonta) * (q - t0)) / TACO.comprimento;
    const x = px - ca * ce * q;
    const y = py + se * q;
    const z = pz - sa * ce * q;
    // fundo do taco naquele ponto
    const fundo = y - raio / ce;
    const fora = Math.max(Math.abs(x) - HX, Math.abs(z) - HZ);
    const naBorracha = fora >= 0 && fora < o.larguraBorracha;
    const naMoldura = fora >= o.larguraBorracha && fora < o.larguraBorracha + o.larguraMoldura;
    if ((naBorracha || naMoldura) && !noVao(x, z, raio + cfg.folga)) pior = Math.max(pior, (naBorracha ? o.alturaBorracha : o.alturaMoldura) - fundo);
    for (const [bx, bz] of outras) {
      const d = Math.hypot(x - bx, y - r, z - bz);
      pior = Math.max(pior, r + raio - d);
    }
  }
  return pior;
}

describe('obstaculosDaMesa', () => {
  it('sai das medidas da física e do desenho: nariz, chanfro e a moldura que o desenho usa', () => {
    expect(o.semiX).toBe(MESA_BAR.comprimento / 2);
    expect(o.semiZ).toBe(MESA_BAR.largura / 2);
    expect(o.larguraBorracha).toBe(MESA_BAR.larguraTabela);
    // a moldura do desenho, alargada para o buraco do meio caber: a mesma da mesa que se vê
    expect(o.larguraMoldura).toBe(larguraDaMoldura(MESA_BAR, CONFIG_WEB.mesa));
    expect(o.larguraMoldura).toBeGreaterThan(MESA_BAR.larguraMoldura);
    expect(o.alturaBorracha).toBeCloseTo(MESA_BAR.alturaTabela + CONFIG_WEB.mesa.chanfroTopo, 12);
    expect(o.alturaMoldura).toBeCloseTo(MESA_BAR.alturaTabela + CONFIG_WEB.mesa.sobraMoldura, 12);
  });

  it('os vãos são os das seis caçapas da física: boca, eixo, meia boca, fundo + raio e o centro do círculo de queda', () => {
    expect(o.vaos).toHaveLength(6);
    o.vaos.forEach((v, k) => {
      const c = CACAPAS[k]!;
      expect([v.bx, v.bz]).toEqual([c.boca.x, c.boca.z]);
      expect([v.ex, v.ez]).toEqual([c.eixo.x, c.eixo.z]);
      expect(v.raio).toBe(c.queda.raio);
      expect(v.profundidade).toBeCloseTo(c.fundo + c.raio, 12);
      expect([v.cx, v.cz]).toEqual([c.queda.centro.x, c.queda.centro.z]);
    });
  });
});

describe('ElevacaoDoTaco: o alvo', () => {
  it('mesa aberta: o taco fica na elevação de repouso (5°)', () => {
    expect(alvoDe({ x: 0, z: 0, angulo: 0 })).toBe(cfg.minima);
    expect(alvoDe({ x: 0, z: 0, angulo: 1.1 }, [0.6, 0.3], [-0.3, -0.2])).toBe(cfg.minima);
  });

  it('bolão encostado na tabela, mirando para longe dela: o taco passa por cima da tabela e da moldura', () => {
    // encostado na tabela da esquerda (o nariz fica a ~2,7 cm do centro), mira para a direita: o taco vai para trás, sobre a tabela
    const m: Mira = { x: -HX + 0.0265, z: 0, angulo: 0 };
    const alvo = alvoDe(m);
    expect(alvo).toBeGreaterThan(cfg.minima + 0.2);
    expect(alvo).toBeLessThanOrEqual(cfg.maxima);
    expect(penetracao(alvo, m, [])).toBeLessThanOrEqual(-cfg.folga + 0.0005);
    // no repouso, atravessa de verdade
    expect(penetracao(cfg.minima, m, [])).toBeGreaterThan(0.01);
  });

  it('é o mínimo: um pouco abaixo do alvo já atravessa a tabela', () => {
    const m: Mira = { x: -HX + 0.0265, z: 0, angulo: 0 };
    const alvo = alvoDe(m);
    expect(penetracao(alvo - 0.01, m, [])).toBeGreaterThan(-cfg.folga);
  });

  it('bolão a 20 cm da tabela: sobe só um pouco, o que a moldura pede, e some a 60 cm', () => {
    const perto = alvoDe({ x: -HX + 0.2, z: 0, angulo: 0 });
    const medio = alvoDe({ x: -HX + 0.3, z: 0, angulo: 0 });
    const longe = alvoDe({ x: -HX + 0.6, z: 0, angulo: 0 });
    expect(perto).toBeGreaterThan(cfg.minima);
    expect(perto).toBeLessThan(cfg.minima + 0.1);
    expect(medio).toBeLessThanOrEqual(perto);
    expect(longe).toBe(cfg.minima);
  });

  it('a tabela de cima, a de baixo e as cabeceiras valem igual (a conta é simétrica)', () => {
    const a = alvoDe({ x: 0.1, z: HZ - 0.0265, angulo: -Math.PI / 2 });
    const b = alvoDe({ x: 0.1, z: -HZ + 0.0265, angulo: Math.PI / 2 });
    const c = alvoDe({ x: HX - 0.0265, z: 0.1, angulo: Math.PI });
    const d = alvoDe({ x: -HX + 0.0265, z: 0.1, angulo: 0 });
    for (const alvo of [a, b, c, d]) expect(alvo).toBeGreaterThan(cfg.minima + 0.1);
    // a tabela do lado comprido está mais perto da moldura de cima (a mesa é mais estreita): mesmas larguras, mesmo alvo
    expect(a).toBeCloseTo(b, 6);
    expect(c).toBeCloseTo(d, 6);
  });

  it('outra bola atrás do bolão: o taco sobe para passar por cima dela', () => {
    // bola a 12 cm atrás do bolão (mira para +x, o taco vem de -x)
    const m: Mira = { x: 0, z: 0, angulo: 0 };
    const outras: [number, number][] = [[-0.12, 0]];
    const alvo = alvoDe(m, ...outras);
    expect(alvo).toBeGreaterThan(cfg.minima + 0.1);
    expect(penetracao(alvo, m, outras)).toBeLessThanOrEqual(-cfg.folga + 0.0005);
    expect(penetracao(cfg.minima, m, outras)).toBeGreaterThan(0);
    expect(penetracao(alvo - 0.01, m, outras)).toBeGreaterThan(-cfg.folga);
  });

  it('bola colada atrás do bolão: sobe muito, mas passa; mais longe pede menos', () => {
    const colada = alvoDe({ x: 0, z: 0, angulo: 0 }, [-2 * r - 0.001, 0]);
    const longe = alvoDe({ x: 0, z: 0, angulo: 0 }, [-0.3, 0]);
    expect(colada).toBeGreaterThan(longe);
    expect(colada).toBeLessThanOrEqual(cfg.maxima);
    expect(penetracao(colada, { x: 0, z: 0, angulo: 0 }, [[-2 * r - 0.001, 0]])).toBeLessThanOrEqual(0);
  });

  it('bola ao lado do taco que não está no caminho não conta; bola à frente do bolão também não', () => {
    expect(alvoDe({ x: 0, z: 0, angulo: 0 }, [0, 0.3], [0, -0.3])).toBe(cfg.minima);
    expect(alvoDe({ x: 0, z: 0, angulo: 0 }, [0.2, 0], [0.5, 0.01])).toBe(cfg.minima);
  });

  it('bola encaçapada (fora da mesa) não conta', () => {
    const bola = bolaParada(1, { x: -0.12, z: 0 });
    const e = novo();
    e.definirBolas({ bolas: [bolaParada(ID_BOLAO, { x: 0, z: 0 }), { ...bola, naMesa: false }] });
    e.atualizar(1, 0, 0, 0, 0, 0, 0);
    expect(e.alvo).toBe(cfg.minima);
  });

  it('o recuo muda a conta: a ponta que passa para trás da moldura já não precisa subir por ela', () => {
    // bola a 12 cm do nariz; a moldura vai de 4 a 12 cm além dele (de 16 a 24 cm do centro do bolão)
    const parado: Mira = { x: -HX + 0.12, z: 0, angulo: 0, recuo: 0.03 };
    const puxado: Mira = { ...parado, recuo: 0.25 };
    const a = alvoDe(parado);
    const b = alvoDe(puxado);
    expect(a).toBeGreaterThan(cfg.minima + 0.05);
    expect(b).toBe(cfg.minima);
    expect(penetracao(a, parado, [])).toBeLessThanOrEqual(0);
    expect(penetracao(b, puxado, [])).toBeLessThanOrEqual(0);
  });

  it('com a ponta puxada para além da moldura (fora da mesa) nada do taco toca a tabela: nem o fundo baixo da ponta o faz subir', () => {
    // bola colada na tabela, efeito para baixo (pivô a 3 mm do pano) e o taco recuado 25 cm: a ponta fica a 27 cm do pivô, além dos 14 cm da moldura
    const m: Mira = { x: -HX + 0.0265, z: 0, angulo: 0, vertical: -0.9, recuo: 0.25 };
    expect(alvoDe(m)).toBe(cfg.minima);
    expect(penetracao(cfg.minima, m, [])).toBeLessThanOrEqual(0);
    // com o taco perto, a mesma mira pede para subir
    expect(alvoDe({ ...m, recuo: 0.02 })).toBeGreaterThan(cfg.minima + 0.2);
  });

  it('com uma bola atrás, o taco sobe enquanto a ponta ainda está para cá dela e volta ao repouso quando a ponta passa para trás dela', () => {
    const outras: [number, number][] = [[-0.25, 0]];
    const alvos = [0.03, 0.1, 0.18, 0.22].map((recuo) => alvoDe({ x: 0, z: 0, angulo: 0, recuo }, ...outras));
    for (const alvo of alvos) expect(alvo).toBeGreaterThan(cfg.minima + 0.05);
    expect(alvoDe({ x: 0, z: 0, angulo: 0, recuo: 0.3 }, ...outras)).toBe(cfg.minima);
    for (const recuo of [0.03, 0.1, 0.18, 0.22, 0.3]) {
      const m = { x: 0, z: 0, angulo: 0, recuo };
      expect(penetracao(alvoDe(m, ...outras), m, outras)).toBeLessThanOrEqual(0);
    }
  });

  it('puxar o taco a 25 cm numa mira perto da tabela nunca o deixa atravessar, em nenhum ponto do recuo', () => {
    const base = { x: -HX + 0.15, z: 0.2, angulo: 0.3 };
    for (let recuo = 0; recuo <= 0.28; recuo += 0.01) {
      const m = { ...base, recuo };
      const alvo = alvoDe(m);
      expect(penetracao(alvo, m, [])).toBeLessThanOrEqual(0);
    }
  });

  it('efeito: o ponto de contato desloca o pivô e a conta o acompanha', () => {
    const base: Mira = { x: -HX + 0.0265, z: 0, angulo: 0 };
    for (const [lateral, vertical] of [
      [0.6, 0],
      [-0.6, 0.2],
      [0, -0.7],
      [0.3, 0.6],
    ] as const) {
      const m = { ...base, lateral, vertical };
      const alvo = alvoDe(m);
      expect(penetracao(alvo, m, [])).toBeLessThanOrEqual(0);
      expect(penetracao(alvo - 0.01, m, [])).toBeGreaterThan(-cfg.folga);
    }
  });

  it('a caçapa abre vão: o bolão perto do canto, mirando para longe dela pela diagonal, deixa o taco passar pela garganta e pelo buraco; só a madeira do outro lado o faz subir', () => {
    // o bolão está no eixo da caçapa de canto (+x, +z) e o taco vem de trás, direto pela boca
    const c = CACAPAS.find((k) => k.id === 'canto-x+z+')!;
    const x = c.boca.x - c.eixo.x * 0.1;
    const z = c.boca.z - c.eixo.z * 0.1;
    const m: Mira = { x, z, angulo: Math.atan2(-c.eixo.z, -c.eixo.x) };
    const alvo = alvoDe(m);
    // sem o vão (a tabela como parede contínua) ele teria de subir bem mais: esta é a conta de antes
    const semVao = new ElevacaoDoTaco({ ...o, vaos: [] }, TACO, R, r, cfg);
    semVao.definirBolas(mesaCom());
    semVao.atualizar(1, m.angulo, 0, 0, 0, x, z);
    expect(alvo).toBeLessThan(semVao.alvo - 0.03);
    // e a conta é a mínima: com o vão, a referência por força bruta confere que não atravessa e que um pouco menos atravessa
    expect(penetracao(alvo, m, [])).toBeLessThanOrEqual(0);
    expect(penetracao(alvo - 0.01, m, [])).toBeGreaterThan(-cfg.folga);
  });

  it('o mesmo no meio: o taco que sai pela boca do meio, no eixo dela, fica no repouso; deslocado para o lado da face, sobe', () => {
    const meio = CACAPAS.find((k) => k.id === 'meio-z+')!;
    const pelaBoca: Mira = { x: 0, z: meio.boca.z - 0.15, angulo: -Math.PI / 2 };
    expect(alvoDe(pelaBoca)).toBe(cfg.minima);
    expect(penetracao(cfg.minima, pelaBoca, [])).toBeLessThanOrEqual(0);
    // 6 cm para o lado: o eixo bate na tabela, ao lado da boca (meia boca de 4,75 cm)
    const naFace: Mira = { x: 0.06, z: meio.boca.z - 0.15, angulo: -Math.PI / 2 };
    expect(alvoDe(naFace)).toBeGreaterThan(cfg.minima + 0.02);
    expect(penetracao(alvoDe(naFace), naFace, [])).toBeLessThanOrEqual(0);
  });

  it('bem junto da face da garganta: a largura do próprio taco conta, e ele sobe para não raspar a borracha', () => {
    const meio = CACAPAS.find((k) => k.id === 'meio-z+')!;
    // o eixo a 4 cm do centro da boca: dentro dela, mas a menos que o raio do taco + folga da face (4,75 cm)
    const m: Mira = { x: 0.04, z: meio.boca.z - 0.15, angulo: -Math.PI / 2 };
    expect(alvoDe(m)).toBeGreaterThan(cfg.minima);
    expect(penetracao(alvoDe(m), m, [])).toBeLessThanOrEqual(0);
  });

  it('varredura: em mil miradas ao acaso com bolas e tabelas, o alvo nunca atravessa nada, a não ser quando bate no teto', () => {
    let semente = 12345;
    const sorteio = (): number => {
      semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0;
      return semente / 4294967296;
    };
    let teto = 0;
    let subiu = 0;
    for (let i = 0; i < 1000; i++) {
      const m: Mira = {
        x: (sorteio() - 0.5) * (2 * HX - 0.06),
        z: (sorteio() - 0.5) * (2 * HZ - 0.06),
        angulo: (sorteio() - 0.5) * 2 * Math.PI,
        lateral: (sorteio() - 0.5) * 1.2,
        vertical: (sorteio() - 0.5) * 1.2,
        recuo: sorteio() * 0.28,
      };
      const outras: [number, number][] = [];
      for (let k = 0; k < 6; k++) {
        const bx = (sorteio() - 0.5) * (2 * HX - 0.06);
        const bz = (sorteio() - 0.5) * (2 * HZ - 0.06);
        if (Math.hypot(bx - m.x, bz - m.z) > 2 * r + 0.002) outras.push([bx, bz]);
      }
      const alvo = alvoDe(m, ...outras);
      expect(alvo).toBeGreaterThanOrEqual(cfg.minima);
      expect(alvo).toBeLessThanOrEqual(cfg.maxima);
      if (alvo >= cfg.maxima) {
        teto++;
        continue;
      }
      if (alvo > cfg.minima) subiu++;
      expect(penetracao(alvo, m, outras)).toBeLessThanOrEqual(1e-6);
    }
    // a varredura exercita de fato os dois lados: houve miradas que pediram elevação
    expect(subiu).toBeGreaterThan(100);
    expect(teto).toBeLessThan(100);
  });
});

describe('ElevacaoDoTaco: o que se desenha', () => {
  it('só refaz a conta quando a mira, o efeito, o recuo, o bolão ou as bolas mudam', () => {
    const e = novo();
    const mesa = mesaCom([-0.12, 0]);
    e.definirBolas(mesa);
    e.atualizar(0.016, 0, 0, 0, 0.03, 0, 0);
    expect(e.calculos).toBe(1);
    e.atualizar(0.016, 0, 0, 0, 0.03, 0, 0);
    e.definirBolas(mesa);
    e.atualizar(0.016, 0, 0, 0, 0.03, 0, 0);
    expect(e.calculos).toBe(1);
    e.atualizar(0.016, 0.01, 0, 0, 0.03, 0, 0);
    expect(e.calculos).toBe(2);
    e.atualizar(0.016, 0.01, 0.1, 0, 0.03, 0, 0);
    expect(e.calculos).toBe(3);
    e.atualizar(0.016, 0.01, 0.1, 0.1, 0.03, 0, 0);
    expect(e.calculos).toBe(4);
    e.atualizar(0.016, 0.01, 0.1, 0.1, 0.05, 0, 0);
    expect(e.calculos).toBe(5);
    e.atualizar(0.016, 0.01, 0.1, 0.1, 0.05, 0.01, 0);
    expect(e.calculos).toBe(6);
    e.atualizar(0.016, 0.01, 0.1, 0.1, 0.05, 0.01, 0.01);
    expect(e.calculos).toBe(7);
    e.definirBolas(mesaCom([-0.12, 0]));
    e.atualizar(0.016, 0.01, 0.1, 0.1, 0.05, 0.01, 0.01);
    expect(e.calculos).toBe(8);
  });

  it('a primeira conta (e depois de reiniciar) vai direto ao alvo; as seguintes deslizam', () => {
    const e = novo();
    e.definirBolas(mesaCom([-0.12, 0]));
    const primeira = e.atualizar(0.016, 0, 0, 0, 0, 0, 0);
    expect(primeira).toBe(e.alvo);
    expect(primeira).toBeGreaterThan(cfg.minima);
    // a bola some: o alvo desce para o repouso, mas o desenho desliza
    e.definirBolas(mesaCom());
    const depois = e.atualizar(0.016, 0, 0, 0, 0, 0, 0);
    expect(e.alvo).toBe(cfg.minima);
    expect(depois).toBeLessThan(primeira);
    expect(depois).toBeGreaterThan(cfg.minima);
    e.reiniciar();
    e.definirBolas(mesaCom([-0.12, 0]));
    expect(e.atualizar(0.016, 0, 0, 0, 0, 0, 0)).toBe(e.alvo);
  });

  it('sobe mais depressa do que desce, e chega ao alvo sem passar dele', () => {
    const subida = novo();
    subida.definirBolas(mesaCom());
    subida.atualizar(1, 0, 0, 0, 0, 0, 0);
    subida.definirBolas(mesaCom([-0.12, 0]));
    const antes = subida.atual;
    subida.atualizar(0.016, 0, 0, 0, 0, 0, 0);
    const passoDeSubida = subida.atual - antes;

    const descida = novo();
    descida.definirBolas(mesaCom([-0.12, 0]));
    descida.atualizar(1, 0, 0, 0, 0, 0, 0);
    const alto = descida.atual;
    descida.definirBolas(mesaCom());
    descida.atualizar(0.016, 0, 0, 0, 0, 0, 0);
    const passoDeDescida = alto - descida.atual;

    expect(passoDeSubida).toBeGreaterThan(0);
    expect(passoDeDescida).toBeGreaterThan(0);
    // rebatendo no mesmo percurso: a subida anda uma fração maior do caminho
    const caminhoSubida = subida.alvo - antes;
    const caminhoDescida = alto - descida.alvo;
    expect(passoDeSubida / caminhoSubida).toBeGreaterThan(passoDeDescida / caminhoDescida);
    for (let i = 0; i < 400; i++) {
      subida.atualizar(0.016, 0, 0, 0, 0, 0, 0);
      descida.atualizar(0.016, 0, 0, 0, 0, 0, 0);
      expect(subida.atual).toBeLessThanOrEqual(subida.alvo + 1e-12);
      expect(descida.atual).toBeGreaterThanOrEqual(descida.alvo - 1e-12);
    }
    expect(subida.atual).toBeCloseTo(subida.alvo, 6);
    expect(descida.atual).toBeCloseTo(descida.alvo, 6);
  });

  it('depois de subir ao alvo, a elevação desenhada deixa o taco livre (nada atravessado quadro a quadro)', () => {
    const m: Mira = { x: -HX + 0.0265, z: 0, angulo: 0 };
    const e = novo();
    e.definirBolas(mesaCom());
    for (let i = 0; i < 120; i++) e.atualizar(0.016, m.angulo, 0, 0, 0, m.x, m.z);
    expect(e.atual).toBeCloseTo(e.alvo, 6);
    expect(penetracao(e.atual, m, [])).toBeLessThanOrEqual(0);
  });

  it('a elevação cresce com o recuo sem saltos grandes (transição suave)', () => {
    const e = novo();
    e.definirBolas(mesaCom());
    let anterior = e.atualizar(0.016, 0.3, 0, 0, 0.03, -HX + 0.2, 0.1);
    let maiorPasso = 0;
    for (let recuo = 0.03; recuo <= 0.28; recuo += 0.002) {
      const atual = e.atualizar(0.016, 0.3, 0, 0, recuo, -HX + 0.2, 0.1);
      maiorPasso = Math.max(maiorPasso, Math.abs(atual - anterior));
      anterior = atual;
    }
    // cada quadro de 2 mm de recuo mexe menos de 1° na inclinação
    expect(maiorPasso).toBeLessThan(Math.PI / 180);
  });

  it('ignora o que passa de 16 bolas e o bolão na lista', () => {
    const e = novo();
    const muitas = Array.from({ length: 20 }, (_, i) => bolaParada(i + 1, { x: 0.5, z: -0.5 + i * 0.001 }));
    e.definirBolas({ bolas: [bolaParada(ID_BOLAO, { x: 0, z: 0 }), ...muitas] });
    expect(() => e.atualizar(0.016, 0, 0, 0, 0, 0, 0)).not.toThrow();
  });
});
