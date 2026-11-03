import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { curvaDoPunho, dobraComFolga, dobraDoAgarre, NOMES_DOS_DEDOS_DO_PUNHO, pulsoQueCabe } from './agarre-no-taco';
import { MaoCalibrada } from './mao-calibrada';
import { maoDoArtista } from './para-testes';

const mm = (v: number): number => v / 1000;
const base = await maoDoArtista();
const punho = new MaoCalibrada(base.modelo, 'punho', CONFIG_WEB.maos.escala, false);
const curva = curvaDoPunho(base.modelo, punho, 'punho', NOMES_DOS_DEDOS_DO_PUNHO, { osso: 'pulso', eixo: CONFIG_WEB.maos.vida.pulso.eixo, maximo: CONFIG_WEB.maos.vida.pulso.maximo });
const TOLERANCIA = CONFIG_WEB.maos.ponte.penetracaoNoTaco;

describe('dobraComFolga: a dobra dos dedos em que a pele chega à folga pedida', () => {
  const de = -0.2;
  const passo = 0.1;
  const fecha = Float32Array.from([0, -1, -2, -3, -4].map(mm));

  it('fecha, interpolando, quando a folga pedida é menor que a da pose do arquivo (dobra 0)', () => {
    expect(dobraComFolga(fecha, de, passo, mm(-2))).toBeCloseTo(0, 6);
    expect(dobraComFolga(fecha, de, passo, mm(-3))).toBeCloseTo(0.1, 6);
    expect(dobraComFolga(fecha, de, passo, mm(-2.5))).toBeCloseTo(0.05, 6);
  });

  it('abre quando a folga pedida é maior', () => {
    expect(dobraComFolga(fecha, de, passo, mm(-1.5))).toBeCloseTo(-0.05, 6);
  });

  it('além do fim da curva fica no extremo; se abrir não ajuda, fica na dobra de maior folga', () => {
    expect(dobraComFolga(fecha, de, passo, mm(-9))).toBeCloseTo(0.2, 6);
    const piora = Float32Array.from([-3, -2.5, -2, -4, -6].map(mm));
    expect(dobraComFolga(piora, de, passo, 0)).toBeCloseTo(0, 6);
  });
});

describe('pulsoQueCabe: o pulso que a mão de trás aguenta sem a pele entrar no taco', () => {
  it('o que cabe fica como pedido; pedido demais é cortado, só para o lado em que a palma entra no taco', () => {
    const maximo = CONFIG_WEB.maos.vida.pulso.maximo;
    expect(pulsoQueCabe(curva, punho, 0.66, 0, TOLERANCIA)).toBe(0);
    expect(pulsoQueCabe(curva, punho, 0.66, -maximo, TOLERANCIA)).toBeCloseTo(-maximo, 6);
    const pra = pulsoQueCabe(curva, punho, 0.66, maximo, TOLERANCIA);
    expect(pra).toBeGreaterThanOrEqual(0);
    expect(pra).toBeLessThan(maximo / 2);
  });
});

describe('dobraDoAgarre: os dedos fecham no taco do jogo, que afina para a ponta', () => {
  it('quanto mais perto da ponta, mais fino o taco e mais os dedos fecham', () => {
    const perto = dobraDoAgarre(curva, punho, 0.3, 0, 0, TOLERANCIA);
    const meio = dobraDoAgarre(curva, punho, 0.66, 0, 0, TOLERANCIA);
    const longe = dobraDoAgarre(curva, punho, 1.1, 0, 0, TOLERANCIA);
    expect(perto).toBeGreaterThan(meio);
    expect(meio).toBeGreaterThan(longe - 1e-9);
  });

  it('o aperto da batida fecha a mais, mas só até a folga: o taco não se espreme', () => {
    const solto = dobraDoAgarre(curva, punho, 0.66, 0, 0, TOLERANCIA);
    const aperta = dobraDoAgarre(curva, punho, 0.66, 0, 0.28, TOLERANCIA);
    const demais = dobraDoAgarre(curva, punho, 0.66, 0, 5, TOLERANCIA);
    expect(aperta).toBeGreaterThanOrEqual(solto);
    expect(demais).toBeLessThan(0.3);
    expect(demais).toBeGreaterThanOrEqual(aperta - 1e-9);
  });
});
