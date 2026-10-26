import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { MaoCalibrada } from './mao-calibrada';
import { DEDOS_LONGOS, maoDoArtista, pontasNoMundo } from './para-testes';
import { poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';
import { PlantadorDeDedos } from './plantar-dedos';

const DEDOS = DEDOS_LONGOS;
const { taxa, alcance, subidaMaxima } = CONFIG_WEB.maos.plantio;
const ALCANCE_RAD = (alcance * Math.PI) / 180;
const mao = new MaoCalibrada((await maoDoArtista()).modelo, 'ponte_v', CONFIG_WEB.maos.escala, true);

/** O Node, onde o Vitest roda (o tsconfig da web não leva os tipos dele). */
const memoria = (): { heapUsed: number } => (globalThis as unknown as { process: { memoryUsage(): { heapUsed: number } } }).process.memoryUsage();

const pose = poseVaziaDeMao();
const plano = (h: number) => (): number => h;
const parado = (): PlantadorDeDedos => new PlantadorDeDedos(mao, 'ponte_v', ALCANCE_RAD, subidaMaxima);
const dobras = (p: PlantadorDeDedos): number[] => DEDOS.map((_, i) => p.dobra(i));
/** As pontas dos dedos depois de assentar no apoio (o plantador no `t` final). */
const pontas = (p: PlantadorDeDedos, onde: PoseDeMao = pose): ReturnType<typeof pontasNoMundo> => pontasNoMundo(mao, dobras(p), onde);

function assentar(plantador: PlantadorDeDedos, apoio: (x: number, z: number) => number, p: PoseDeMao = pose): PlantadorDeDedos {
  plantador.reiniciar();
  plantador.plantar(1, taxa, p, apoio);
  return plantador;
}

describe('PlantadorDeDedos: as pontas dos dedos pousam no apoio', () => {
  const desenho = pontas(assentar(parado(), () => -Infinity));

  it('sem apoio embaixo da ponta o dedo fica como no desenho', () => {
    const p = assentar(parado(), () => -Infinity);
    expect(dobras(p)).toEqual([0, 0, 0, 0]);
  });

  it('com o apoio um pouco abaixo do desenho, cada ponta desce até ele (a menos de 1 mm)', () => {
    for (const d of DEDOS) {
      const h = desenho[d].y - 0.006;
      const fundo = pontas(assentar(parado(), plano(h)));
      expect(Math.abs(fundo[d].y - h)).toBeLessThan(0.001);
    }
  });

  it('com o apoio um pouco acima do desenho, cada ponta sobe até ele (a menos de 1 mm)', () => {
    for (const d of DEDOS) {
      const h = desenho[d].y + 0.006;
      const fundo = pontas(assentar(parado(), plano(h)));
      expect(Math.abs(fundo[d].y - h)).toBeLessThan(0.001);
    }
  });

  it('cada dedo acha o seu apoio: num degrau, as pontas de cada lado pousam cada uma no seu', () => {
    // o degrau cai entre o médio (z ≈ -26 mm) e o anelar (z ≈ -54 mm): a ponta de cada um pisa só de um lado dele
    const degrau = (_x: number, z: number): number => (z > -0.04 ? desenho.indicador.y - 0.008 : desenho.indicador.y - 0.002);
    const fundo = pontas(assentar(parado(), degrau));
    for (const d of DEDOS) {
      const h = degrau(fundo[d].x, fundo[d].z);
      expect(Math.abs(fundo[d].y - h)).toBeLessThan(0.0015);
    }
  });

  it('muito abaixo do alcance o dedo fica estendido no máximo e flutua', () => {
    const longe = pontas(assentar(parado(), plano(-1)));
    for (const d of DEDOS) {
      expect(longe[d].y).toBeGreaterThan(-1);
      expect(longe[d].y).toBeLessThan(desenho[d].y - 0.008);
    }
  });

  it('se nem o dedo mais alto alcança o apoio, a mão tem de subir o que falta e então todos pousam', () => {
    const h = desenho.indicador.y + 0.02;
    const plantador = parado();
    const subida = plantador.subidaNecessaria(pose, plano(h));
    expect(subida).toBeGreaterThan(0.005);
    const erguida = { ...pose, y: pose.y + subida };
    const fundo = pontas(assentar(plantador, plano(h), erguida), erguida);
    for (const d of DEDOS) expect(Math.abs(fundo[d].y - h), d).toBeLessThan(0.001);
  });

  it('a mão só sobe quando precisa: com o apoio ao alcance dos dedos a subida é zero', () => {
    expect(parado().subidaNecessaria(pose, plano(desenho.indicador.y + 0.004))).toBe(0);
    expect(parado().subidaNecessaria(pose, () => -Infinity)).toBe(0);
  });

  it('a subida tem teto', () => {
    expect(parado().subidaNecessaria(pose, plano(1))).toBeCloseTo(CONFIG_WEB.maos.plantio.subidaMaxima, 9);
  });

  it('a ponta que pisa na borda do apoio fica sobre o lado mais alto, não dentro dele', () => {
    // um degrau de 8 mm a 1 mm do centro da ponta do indicador: a ponta (~9 mm de raio) cobre os dois lados
    const z0 = desenho.indicador.z + 0.001;
    const alto = desenho.indicador.y + 0.004;
    const degrau = (_x: number, z: number): number => (z > z0 ? alto : alto - 0.008);
    const fundo = pontas(assentar(parado(), degrau));
    expect(fundo.indicador.y).toBeGreaterThan(alto - 0.0015);
    expect(fundo.indicador.y).toBeLessThan(alto + 0.0015);
  });

  it('só os quatro dedos longos têm dobra: o polegar e a palma ficam como no arquivo', () => {
    const feita = assentar(parado(), plano(desenho.indicador.y - 0.006));
    expect(feita.quantos).toBe(4);
    expect(dobras(feita).some((d) => d !== 0)).toBe(true);
    expect(DEDOS).not.toContain('polegar');
  });

  it('o dedo acompanha o apoio aos poucos: uma fração do caminho num quadro e todo ele depois de um tempo', () => {
    const plantador = parado();
    const h = desenho.indicador.y - 0.008;
    plantador.reiniciar();
    plantador.plantar(1, taxa, pose, () => -Infinity);
    plantador.plantar(1 / 60, taxa, pose, plano(h));
    const depoisDeUm = pontas(plantador).indicador.y;
    expect(depoisDeUm).toBeLessThan(desenho.indicador.y - 0.0005);
    expect(depoisDeUm).toBeGreaterThan(h + 0.002);
    for (let i = 0; i < 120; i++) plantador.plantar(1 / 60, taxa, pose, plano(h));
    expect(Math.abs(pontas(plantador).indicador.y - h)).toBeLessThan(0.001);
  });

  it('não aloca: cem mil quadros não deixam lixo', () => {
    const plantador = parado();
    const apoio = plano(desenho.indicador.y - 0.004);
    for (let i = 0; i < 2000; i++) plantador.plantar(1 / 60, taxa, pose, apoio);
    const antes = memoria().heapUsed;
    for (let i = 0; i < 100_000; i++) plantador.plantar(1 / 60, taxa, pose, apoio);
    expect(memoria().heapUsed - antes).toBeLessThan(8_000_000);
  }, 30_000);
});
