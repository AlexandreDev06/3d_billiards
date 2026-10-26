import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, type EstadoMesa } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { poseDaCameraDeTacada, poseVazia, type EntradaDaCameraDeTacada, type GeometriaDaCameraDeTacada } from './camera-tacada';
import { ElevacaoDoTaco, obstaculosDaMesa } from './elevacao-do-taco';

const cfg = CONFIG_WEB.camera.tacada;
const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const GEOMETRIA: GeometriaDaCameraDeTacada = { raioBolao: R, taco: TACO };
const HX = MESA_BAR.comprimento / 2;
const HZ = MESA_BAR.largura / 2;
const REPOUSO = CONFIG_WEB.elevacaoDoTaco.minima;
const grausParaRad = Math.PI / 180;
const ZOOMS = [CONFIG_WEB.camera.zoomMin, 1, CONFIG_WEB.camera.zoomMax] as const;

const entrada = (parcial: Partial<EntradaDaCameraDeTacada> = {}): EntradaDaCameraDeTacada => ({
  x: -0.4,
  y: R,
  z: 0,
  angulo: 0,
  elevacaoDoTaco: REPOUSO,
  recuo: 0,
  zoom: 1,
  ...parcial,
});

describe('poseDaCameraDeTacada: a câmera de sempre com o taco baixo', () => {
  it('bola no meio da mesa: a câmera é a de repouso (distância e altura vezes o zoom, olhando adiante), em qualquer zoom', () => {
    for (const zoom of ZOOMS) {
      const p = poseDaCameraDeTacada(entrada({ zoom, angulo: 0.7 }), cfg, GEOMETRIA);
      expect(p.subiu).toBe(false);
      expect(p.x).toBeCloseTo(-0.4 - Math.cos(0.7) * cfg.distancia * zoom, 12);
      expect(p.z).toBeCloseTo(-Math.sin(0.7) * cfg.distancia * zoom, 12);
      expect(p.y).toBeCloseTo(cfg.altura * zoom, 12);
      expect(p.olharX).toBeCloseTo(-0.4 + Math.cos(0.7) * cfg.olharAdiante, 12);
      expect(p.olharZ).toBeCloseTo(Math.sin(0.7) * cfg.olharAdiante, 12);
      expect(p.olharY).toBe(0);
    }
  });

  it('o taco de repouso, até um pouco mais alto, não mexe na câmera', () => {
    const posicao = (graus: number): number[] => {
      const p = poseDaCameraDeTacada(entrada({ elevacaoDoTaco: graus * grausParaRad }), cfg, GEOMETRIA);
      return [p.x, p.y, p.z, p.olharX, p.olharY, p.olharZ, p.elevacao];
    };
    for (const graus of [3, 5, 6]) expect(posicao(graus)).toEqual(posicao(0));
  });

  it('sem alocar: a pose passada é a devolvida', () => {
    const saida = poseVazia();
    expect(poseDaCameraDeTacada(entrada(), cfg, GEOMETRIA, saida)).toBe(saida);
  });
});

describe('poseDaCameraDeTacada: o taco sobe e a câmera vai junto', () => {
  it('sobe em arco em volta do bolão, na mesma distância dele, e a elevação dela é a do taco mais a margem', () => {
    const base = poseDaCameraDeTacada(entrada(), cfg, GEOMETRIA);
    const alto = poseDaCameraDeTacada(entrada({ elevacaoDoTaco: 30 * grausParaRad }), cfg, GEOMETRIA);
    const dist = (p: typeof base): number => Math.hypot(p.x - -0.4, p.y - R, p.z);
    expect(alto.subiu).toBe(true);
    expect(alto.y).toBeGreaterThan(base.y);
    expect(alto.x).toBeGreaterThan(base.x); // mais perto do bolão na horizontal, ao longo da mira
    expect(dist(alto)).toBeCloseTo(dist(base), 9);
    expect(alto.elevacao).toBeCloseTo(30 * grausParaRad + cfg.margemDoTaco, 9);
  });

  it('quanto mais alto o taco, mais alta a câmera', () => {
    let anterior = 0;
    for (const graus of [10, 15, 20, 30, 45, 60, 75]) {
      const p = poseDaCameraDeTacada(entrada({ elevacaoDoTaco: graus * grausParaRad }), cfg, GEOMETRIA);
      expect(p.y).toBeGreaterThanOrEqual(anterior);
      anterior = p.y;
    }
  });

  it('nunca passa do ângulo máximo, e a câmera nunca fica sobre o bolão', () => {
    const p = poseDaCameraDeTacada(entrada({ elevacaoDoTaco: 75 * grausParaRad }), cfg, GEOMETRIA);
    expect(p.elevacao).toBeLessThanOrEqual(cfg.elevacaoMaxima + 1e-12);
    expect(Math.hypot(p.x - -0.4, p.z)).toBeGreaterThan(0.05);
  });

  it('o ponto olhado vem para perto da bola: ela fica na mesma altura da tela, qualquer que seja a subida', () => {
    const camera = new PerspectiveCamera(CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9, 0.01, 50);
    const yDaBola = (graus: number): number => {
      const p = poseDaCameraDeTacada(entrada({ elevacaoDoTaco: graus * grausParaRad }), cfg, GEOMETRIA);
      camera.position.set(p.x, p.y, p.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(p.olharX, p.olharY, p.olharZ);
      camera.updateMatrixWorld();
      return new Vector3(-0.4, R, 0).project(camera).y;
    };
    const base = yDaBola(5);
    for (const graus of [15, 25, 40, 60, 75]) expect(yDaBola(graus)).toBeCloseTo(base, 2);
  });

  it('com a câmera muito baixa (zoom mínimo) o taco que sobe também a leva para cima', () => {
    const base = poseDaCameraDeTacada(entrada({ zoom: CONFIG_WEB.camera.zoomMin }), cfg, GEOMETRIA);
    const alto = poseDaCameraDeTacada(entrada({ zoom: CONFIG_WEB.camera.zoomMin, elevacaoDoTaco: 25 * grausParaRad }), cfg, GEOMETRIA);
    expect(alto.y).toBeGreaterThan(base.y);
  });

  it('a menor distância ao taco: com o taco de repouso é a de sempre e, subindo, nunca cai abaixo do que a margem dá', () => {
    for (const zoom of ZOOMS) {
      const base = poseDaCameraDeTacada(entrada({ zoom }), cfg, GEOMETRIA);
      let anterior = base.folga;
      for (const graus of [5, 15, 30, 50, 70]) {
        const p = poseDaCameraDeTacada(entrada({ zoom, elevacaoDoTaco: graus * grausParaRad }), cfg, GEOMETRIA);
        const rho = Math.hypot(cfg.distancia * zoom, cfg.altura * zoom - R);
        // Perpendicular à linha do taco, ρ·sen(margem), menos a grossura do taco (≤ raioBase) e mais o que o cabo ainda se afasta.
        if (p.elevacao < cfg.elevacaoMaxima) expect(p.folga).toBeGreaterThanOrEqual(rho * Math.sin(cfg.margemDoTaco) - TACO.raioBase - 1e-9);
        expect(p.folga).toBeGreaterThanOrEqual(Math.min(anterior, base.folga) * 0.5);
        anterior = p.folga;
      }
    }
  });

  it('o recuo (a ponta puxada para trás) não faz a câmera chegar mais perto do taco', () => {
    for (const recuo of [0, 0.05, 0.15, 0.25]) {
      const p = poseDaCameraDeTacada(entrada({ elevacaoDoTaco: 25 * grausParaRad, recuo }), cfg, GEOMETRIA);
      expect(p.folga).toBeGreaterThan(0.2);
    }
  });
});

describe('poseDaCameraDeTacada: o taco nunca cobre a bola nem o que ela vai atingir (ElevacaoDoTaco real, mesa de bar)', () => {
  const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
  const camera = new PerspectiveCamera(CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9, 0.01, 50);
  const alvo = new Vector3();
  const ponto = new Vector3();

  /** A elevação do taco desenhada (a conta, sem deslizar) para a bola em (x, z) com a mira `angulo` e o recuo dado. */
  function elevacaoDe(x: number, z: number, angulo: number, recuo: number): number {
    const e = new ElevacaoDoTaco(obstaculos, TACO, R, r, CONFIG_WEB.elevacaoDoTaco);
    const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x, z })] };
    e.definirBolas(mesa);
    return e.atualizar(1, angulo, 0, 0, recuo, x, z);
  }

  /**
   * Põe a câmera na pose e confere o taco amostrado ao longo do eixo: tudo o que está na frente da câmera tem de ficar abaixo
   * do centro da bola na tela e fora do disco da bola mirada (a 0,3 m adiante), e o cabo não chega perto da câmera.
   */
  function confere(x: number, z: number, angulo: number, zoom: number, recuo: number, rotulo: string): number {
    const elevacao = elevacaoDe(x, z, angulo, recuo);
    const p = poseDaCameraDeTacada({ x, y: R, z, angulo, elevacaoDoTaco: elevacao, recuo, zoom }, cfg, GEOMETRIA);
    camera.position.set(p.x, p.y, p.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(p.olharX, p.olharY, p.olharZ);
    camera.updateMatrixWorld();
    const bola = new Vector3(x, R, z).project(camera);
    alvo.set(x + Math.cos(angulo) * 0.3, R, z + Math.sin(angulo) * 0.3).project(camera);
    const ce = Math.cos(elevacao);
    const se = Math.sin(elevacao);
    for (let q = R + recuo; q <= R + recuo + TACO.comprimento; q += 0.02) {
      ponto.set(x - Math.cos(angulo) * ce * q, R + se * q, z - Math.sin(angulo) * ce * q);
      const naFrente = ponto.clone().applyMatrix4(camera.matrixWorldInverse).z < -camera.near;
      if (!naFrente) continue;
      const tela = ponto.clone().project(camera);
      // Abaixo da bola na tela (com uma folga de rasgo: perto da ponta o taco encosta na bola).
      expect(tela.y, `${rotulo}: taco acima da bola na tela em q=${q.toFixed(2)}`).toBeLessThanOrEqual(bola.y + 0.02);
      // Fora do disco da bola mirada (em NDC, com o aspecto da tela): nem na vertical, nem na horizontal.
      const dx = (tela.x - alvo.x) * camera.aspect;
      const dy = tela.y - alvo.y;
      expect(Math.hypot(dx, dy), `${rotulo}: taco sobre a bola mirada em q=${q.toFixed(2)}`).toBeGreaterThan(0.03);
    }
    return p.folga;
  }

  /** Posições com o bolão colado à borracha (o nariz da tabela) e dois pontos dentro da mesa. */
  const POSICOES: readonly (readonly [string, number, number])[] = [
    ['meio da mesa', -0.4, 0.1],
    ['colada na tabela de lado (+Z)', 0.1, HZ - R],
    ['colada na tabela de lado (−Z)', 0.3, -(HZ - R)],
    ['colada na cabeceira (−X)', -(HX - R), 0.05],
    ['colada na tabela do fundo (+X)', HX - R, -0.1],
    ['no canto (−X, +Z)', -(HX - R - 0.02), HZ - R - 0.02],
    ['no canto (+X, −Z)', HX - R - 0.02, -(HZ - R - 0.02)],
    ['quase no canto', -(HX - 0.12), HZ - 0.12],
  ];

  it('em cada posição, mirando em volta (de 15° em 15°), em zoom mínimo, padrão e máximo', () => {
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of ZOOMS) {
        for (let graus = 0; graus < 360; graus += 15) {
          const folga = confere(x, z, graus * grausParaRad, zoom, 0, `${nome} zoom ${zoom} ${graus}°`);
          // Cabo longe da lente: a câmera de repouso tem ~0,3 m × zoom (0,1 m no zoom mínimo); nunca menos que metade disso.
          expect(folga, `${nome} zoom ${zoom} ${graus}°: cabo perto da câmera`).toBeGreaterThan(0.045);
        }
      }
    }
  });

  it('com o taco puxado (recuo de 25 cm), na pior posição, o mesmo', () => {
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of ZOOMS) {
        for (let graus = 0; graus < 360; graus += 30) confere(x, z, graus * grausParaRad, zoom, 0.25, `${nome} zoom ${zoom} ${graus}° recuo 25 cm`);
      }
    }
  });

  it('o taco no meio da mesa a 5°: a câmera não se mexe', () => {
    for (const zoom of ZOOMS) {
      const e = elevacaoDe(-0.4, 0.1, 0, 0);
      const p = poseDaCameraDeTacada({ x: -0.4, y: R, z: 0.1, angulo: 0, elevacaoDoTaco: e, recuo: 0, zoom }, cfg, GEOMETRIA);
      expect(e).toBeCloseTo(REPOUSO, 9);
      expect(p.subiu).toBe(false);
    }
  });

  it('colada na tabela de lado, mirando para o centro: a câmera sobe (o taco sobe por cima da borracha)', () => {
    const e = elevacaoDe(0.1, HZ - R, -Math.PI / 2, 0);
    const p = poseDaCameraDeTacada({ x: 0.1, y: R, z: HZ - R, angulo: -Math.PI / 2, elevacaoDoTaco: e, recuo: 0, zoom: 1 }, cfg, GEOMETRIA);
    expect(e).toBeGreaterThan(10 * grausParaRad);
    expect(p.subiu).toBe(true);
    expect(p.y).toBeGreaterThan(cfg.altura + 0.1);
  });
});
