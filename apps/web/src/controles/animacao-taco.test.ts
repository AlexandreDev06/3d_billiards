import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { AnimacaoTaco } from './animacao-taco';

const cfg = CONFIG_WEB.tacada;

describe('AnimacaoTaco', () => {
  it('antes de iniciar, não aparece', () => {
    expect(new AnimacaoTaco(cfg).visivel).toBe(false);
  });

  it('avança além do impacto até o fim do seguimento, sem passar', () => {
    const animacao = new AnimacaoTaco(cfg);
    animacao.iniciar();
    expect(animacao.visivel).toBe(true);
    expect(animacao.recuo).toBeCloseTo(0, 9);
    animacao.atualizar(cfg.duracaoSeguimentoS / 2);
    expect(animacao.recuo).toBeLessThan(0);
    expect(animacao.recuo).toBeGreaterThan(-cfg.seguimento);
    animacao.atualizar(10 * cfg.duracaoSeguimentoS);
    expect(animacao.recuo).toBeCloseTo(-cfg.seguimento, 9);
  });

  it('some depois da permanência e só volta com nova tacada', () => {
    const animacao = new AnimacaoTaco(cfg);
    animacao.iniciar();
    animacao.atualizar(cfg.duracaoSeguimentoS + cfg.permanenciaS - 0.01);
    expect(animacao.visivel).toBe(true);
    animacao.atualizar(0.02);
    expect(animacao.visivel).toBe(false);
    animacao.iniciar();
    expect(animacao.visivel).toBe(true);
  });

  it('parar esconde na hora', () => {
    const animacao = new AnimacaoTaco(cfg);
    animacao.iniciar();
    animacao.parar();
    expect(animacao.visivel).toBe(false);
  });
});

describe('AnimacaoTaco — batida da força pela linha', () => {
  const { batidaMinS, batidaMaxS } = cfg.linha;

  it('sem recuo (empurrar) não há batida: é o seguimento de sempre, desde o primeiro instante', () => {
    const animacao = new AnimacaoTaco(cfg);
    animacao.iniciar();
    expect(animacao.emBatida).toBe(false);
    expect(animacao.recuo).toBeCloseTo(0, 9);
    animacao.iniciar(0, 3);
    expect(animacao.emBatida).toBe(false);
  });

  it('com o taco puxado ele corre até a bola, cada vez mais depressa, e só no impacto a batida acaba', () => {
    const animacao = new AnimacaoTaco(cfg);
    animacao.iniciar(0.2, 2);
    expect(animacao.emBatida).toBe(true);
    expect(animacao.visivel).toBe(true);
    expect(animacao.recuo).toBeCloseTo(0.2, 9);
    const duracao = 2 * 0.2 / 2;
    expect(duracao).toBeGreaterThan(batidaMinS);
    expect(duracao).toBeLessThan(batidaMaxS + 1);
    let anterior = animacao.recuo;
    let passoAnterior = 0;
    let maisDepressa = 0;
    const dt = 0.01;
    for (let t = 0; animacao.emBatida; t += dt) {
      animacao.atualizar(dt);
      const passo = anterior - animacao.recuo;
      expect(animacao.recuo).toBeLessThanOrEqual(anterior);
      if (animacao.emBatida) {
        expect(passo).toBeGreaterThanOrEqual(passoAnterior - 1e-12);
        if (passo > passoAnterior + 1e-9) maisDepressa++;
      }
      passoAnterior = passo;
      anterior = animacao.recuo;
    }
    // cada passo é maior que o anterior (aceleração), não só "não menor": um taco a velocidade constante não passa
    expect(maisDepressa).toBeGreaterThanOrEqual(8);
    expect(animacao.emBatida).toBe(false);
    expect(animacao.recuo).toBeLessThanOrEqual(0);
  });

  it('a batida dura distância ÷ metade da velocidade, entre o mínimo e o máximo', () => {
    const duracaoDe = (recuo: number, v: number): number => {
      const a = new AnimacaoTaco(cfg);
      a.iniciar(recuo, v);
      let t = 0;
      while (a.emBatida) {
        a.atualizar(0.001);
        t += 0.001;
      }
      return t;
    };
    expect(duracaoDe(0.2, 2)).toBeCloseTo(Math.min(0.2, Math.max(batidaMinS, 0.2)), 2);
    expect(duracaoDe(0.25, 8)).toBeCloseTo(batidaMinS, 2);
    expect(duracaoDe(0.2, 0.2)).toBeCloseTo(batidaMaxS, 2);
  });

  it('o seguimento só começa depois da batida, e parar esconde o taco na hora', () => {
    const animacao = new AnimacaoTaco(cfg);
    animacao.iniciar(0.2, 4);
    animacao.atualizar(0.1);
    expect(animacao.emBatida).toBe(false);
    expect(animacao.recuo).toBeCloseTo(0, 9);
    animacao.atualizar(cfg.duracaoSeguimentoS);
    expect(animacao.recuo).toBeCloseTo(-cfg.seguimento, 9);
    animacao.atualizar(cfg.permanenciaS + 0.01);
    expect(animacao.visivel).toBe(false);
    animacao.iniciar(0.2, 4);
    expect(animacao.emBatida).toBe(true);
    animacao.parar();
    expect(animacao.emBatida).toBe(false);
    expect(animacao.visivel).toBe(false);
  });
});
