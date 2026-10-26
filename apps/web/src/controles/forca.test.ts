import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { curvaDeForca } from './forca';

const cfg = CONFIG_WEB.tacada;

describe('curvaDeForca', () => {
  it('a força máxima é a metade do teto da física (pedido do usuário: as bolas iam rápido demais), que segue valendo na sala', () => {
    expect(cfg.velocidadeMax).toBe(CONFIG_FISICA_PADRAO.velocidadeMaxTaco / 2);
    expect(cfg.velocidadeMax).toBe(4);
    expect(CONFIG_FISICA_PADRAO.velocidadeMaxTaco).toBe(8);
  });

  it('a mesma puxada dá metade da velocidade de antes (teto de 8 m/s) e a curva tem a mesma forma', () => {
    const antes = { ...cfg, velocidadeMax: CONFIG_FISICA_PADRAO.velocidadeMaxTaco };
    for (let k = 1; k <= 10; k++) {
      const entrada = (k / 10) * cfg.velocidadeEntradaMax;
      const agora = curvaDeForca(entrada, cfg);
      const era = curvaDeForca(entrada, antes);
      // metade da parte que passa da força mínima (0,05 m/s, que não muda): a razão é (4 − mín) / (8 − mín) em toda a curva
      expect((agora - cfg.velocidadeMin) / (era - cfg.velocidadeMin)).toBeCloseTo((cfg.velocidadeMax - cfg.velocidadeMin) / (antes.velocidadeMax - cfg.velocidadeMin), 10);
      expect(agora).toBeLessThan(era);
      // o mesmo ponto da faixa: (v − mín) / (máx − mín) = (entrada / entradaMáx)^expoente
      const ponto = (agora - cfg.velocidadeMin) / (cfg.velocidadeMax - cfg.velocidadeMin);
      expect(ponto).toBeCloseTo((entrada / cfg.velocidadeEntradaMax) ** cfg.expoenteForca, 10);
      expect(ponto).toBeCloseTo((era - cfg.velocidadeMin) / (antes.velocidadeMax - cfg.velocidadeMin), 10);
    }
  });

  it('nunca passa do teto da física, por mais rápido que o mouse vá', () => {
    expect(cfg.velocidadeMax).toBeLessThanOrEqual(CONFIG_FISICA_PADRAO.velocidadeMaxTaco);
    expect(curvaDeForca(1e6, cfg)).toBe(cfg.velocidadeMax);
    expect(curvaDeForca(cfg.velocidadeEntradaMax, cfg)).toBeCloseTo(cfg.velocidadeMax, 10);
  });

  it('dá o mínimo para movimento nulo ou para trás', () => {
    expect(curvaDeForca(0, cfg)).toBe(cfg.velocidadeMin);
    expect(curvaDeForca(-3, cfg)).toBe(cfg.velocidadeMin);
  });

  it('cresce sempre com a velocidade de entrada', () => {
    let anterior = -Infinity;
    for (let v = 0; v <= cfg.velocidadeEntradaMax; v += cfg.velocidadeEntradaMax / 50) {
      const f = curvaDeForca(v, cfg);
      expect(f).toBeGreaterThanOrEqual(anterior);
      anterior = f;
    }
  });

  it('não é linear: metade da entrada dá menos que metade da faixa', () => {
    const meio = curvaDeForca(cfg.velocidadeEntradaMax / 2, cfg);
    const linear = (cfg.velocidadeMin + cfg.velocidadeMax) / 2;
    expect(meio).toBeGreaterThan(cfg.velocidadeMin);
    expect(meio).toBeLessThan(linear);
  });
});
