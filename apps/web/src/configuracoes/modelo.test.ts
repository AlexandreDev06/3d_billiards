import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import {
  CONFIGURACOES_PADRAO,
  DESCRITORES,
  cameraDoJogador,
  ehPadrao,
  limitar,
  miraDoJogador,
  sanear,
  tacadaDoJogador,
  type ConfiguracoesDoJogador,
} from './modelo';

const com = (parcial: Partial<ConfiguracoesDoJogador>): ConfiguracoesDoJogador => ({ ...CONFIGURACOES_PADRAO, ...parcial });

describe('padrão', () => {
  it('o padrão deixa o jogo exatamente como vem (todas as configs de fábrica voltam iguais)', () => {
    expect(miraDoJogador(CONFIG_WEB.mira, CONFIGURACOES_PADRAO)).toEqual(CONFIG_WEB.mira);
    expect(tacadaDoJogador(CONFIG_WEB.tacada, CONFIGURACOES_PADRAO)).toEqual(CONFIG_WEB.tacada);
    expect(cameraDoJogador(CONFIG_WEB.camera, CONFIGURACOES_PADRAO)).toEqual(CONFIG_WEB.camera);
  });

  it('todo descritor tem o padrão (1) dentro da faixa e a faixa em ordem', () => {
    for (const d of DESCRITORES) {
      expect(d.minimo).toBeLessThan(1);
      expect(d.maximo).toBeGreaterThan(1);
      expect(CONFIGURACOES_PADRAO[d.chave]).toBe(1);
    }
    expect(DESCRITORES.map((d) => d.chave).sort()).toEqual(Object.keys(CONFIGURACOES_PADRAO).sort());
  });

  it('ehPadrao só vale quando nada se mexeu', () => {
    expect(ehPadrao(CONFIGURACOES_PADRAO)).toBe(true);
    expect(ehPadrao(com({ curvaForca: 1.1 }))).toBe(false);
  });
});

describe('limitar e sanear', () => {
  it('prende o valor na faixa do controle', () => {
    expect(limitar('sensibilidadeMira', 100)).toBe(4);
    expect(limitar('sensibilidadeMira', -3)).toBe(0.2);
    expect(limitar('sensibilidadeMira', 1.7)).toBe(1.7);
  });

  it('o que não é número finito vira o padrão', () => {
    for (const lixo of [Number.NaN, Infinity, '2', null, undefined, {}]) expect(limitar('curvaForca', lixo)).toBe(1);
  });

  it('sanear completa o que falta, descarta chave desconhecida e prende o resto', () => {
    const s = sanear({ sensibilidadeMira: 2, curvaForca: 99, intrusa: 5 });
    expect(s).toEqual({ ...CONFIGURACOES_PADRAO, sensibilidadeMira: 2, curvaForca: 1.6 });
    expect('intrusa' in s).toBe(false);
  });

  it('sanear aguenta qualquer coisa', () => {
    for (const lixo of [null, undefined, 3, 'x', [], true]) expect(sanear(lixo)).toEqual(CONFIGURACOES_PADRAO);
  });
});

describe('aplicação à config de fábrica', () => {
  it('mira: multiplica os radianos por pixel; mira fina multiplica a fração e nunca passa de 1', () => {
    const m = miraDoJogador(CONFIG_WEB.mira, com({ sensibilidadeMira: 2, sensibilidadeMiraFina: 2 }));
    expect(m.radianosPorPixel).toBeCloseTo(CONFIG_WEB.mira.radianosPorPixel * 2, 9);
    expect(m.fatorFino).toBeCloseTo(CONFIG_WEB.mira.fatorFino * 2, 9);
    expect(miraDoJogador({ radianosPorPixel: 0.0025, fatorFino: 0.9 }, com({ sensibilidadeMiraFina: 3 })).fatorFino).toBe(1);
  });

  it('força: metros por pixel e expoente; o resto da config da tacada fica como está', () => {
    const t = tacadaDoJogador(CONFIG_WEB.tacada, com({ sensibilidadeForca: 1.5, curvaForca: 1.25 }));
    expect(t.metrosPorPixel).toBeCloseTo(CONFIG_WEB.tacada.metrosPorPixel * 1.5, 9);
    expect(t.expoenteForca).toBeCloseTo(CONFIG_WEB.tacada.expoenteForca * 1.25, 9);
    expect({ ...t, metrosPorPixel: 0, expoenteForca: 0 }).toEqual({ ...CONFIG_WEB.tacada, metrosPorPixel: 0, expoenteForca: 0 });
  });

  it('o expoente da força nunca cai abaixo de 0,5, mesmo sobre uma base baixa (painel dev)', () => {
    expect(tacadaDoJogador({ ...CONFIG_WEB.tacada, expoenteForca: 0.6 }, com({ curvaForca: 0.6 })).expoenteForca).toBe(0.5);
  });

  it('câmera: órbita, passo do zoom e velocidade do giro; limites do zoom e o resto não mexem', () => {
    const c = cameraDoJogador(CONFIG_WEB.camera, com({ sensibilidadeOrbita: 2, sensibilidadeZoom: 3, giroDaCamera: 0.5 }));
    expect(c.orbital.radiosPorPixel).toBeCloseTo(CONFIG_WEB.camera.orbital.radiosPorPixel * 2, 9);
    expect(c.orbital.elevacaoMaxGraus).toBe(CONFIG_WEB.camera.orbital.elevacaoMaxGraus);
    expect(c.passoZoom).toBeCloseTo(CONFIG_WEB.camera.passoZoom * 3, 9);
    expect(c.taxaSuavizacao).toBeCloseTo(CONFIG_WEB.camera.taxaSuavizacao * 0.5, 9);
    expect(c.zoomMin).toBe(CONFIG_WEB.camera.zoomMin);
    expect(c.zoomMax).toBe(CONFIG_WEB.camera.zoomMax);
  });

  it('o passo do zoom nunca passa de 0,5 por clique', () => {
    expect(cameraDoJogador({ ...CONFIG_WEB.camera, passoZoom: 0.4 }, com({ sensibilidadeZoom: 4 })).passoZoom).toBe(0.5);
  });

  it('não altera a config de fábrica (devolve cópias)', () => {
    const antes = JSON.stringify(CONFIG_WEB.camera);
    cameraDoJogador(CONFIG_WEB.camera, com({ sensibilidadeOrbita: 2 }));
    expect(JSON.stringify(CONFIG_WEB.camera)).toBe(antes);
  });
});
