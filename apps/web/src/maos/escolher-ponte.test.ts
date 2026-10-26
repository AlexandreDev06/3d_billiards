import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, MESA_BAR } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { eixoDoTaco } from './eixo';
import { bolasVazias, escolherPonte, poseVaziaDeMao, type ConfigDaPonte } from './pose-das-maos';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const HX = MESA_BAR.comprimento / 2;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg: ConfigDaPonte = { ...CONFIG_WEB.maos.ponte, fundo: 0.02 };
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;

describe('escolherPonte com evitarAr', () => {
  // A branca a 2,8 cm da cabeceira, mirando para o centro: o V cairia a 27 cm dela, além da moldura, no ar.
  const eixo = eixoDoTaco(-(HX - R), R, 0.05, R, 0, 0.2, REPOUSO, 0, 0);

  it('sem evitarAr a mão fica no ar, fora da mesa, na distância pedida (o L28)', () => {
    const r = escolherPonte(eixo, REPOUSO, obstaculos, bolasVazias(), cfg, null, [], poseVaziaDeMao());
    expect(r.ok).toBe(true);
    expect(r.apoio).toBe('ar');
    expect(r.distancia).toBeCloseTo(cfg.distancia, 9);
  });

  it('com evitarAr ela vem para onde há apoio, na borracha ou na moldura, mais perto da bola', () => {
    const lugar = poseVaziaDeMao();
    const r = escolherPonte(eixo, REPOUSO, obstaculos, bolasVazias(), cfg, null, [], lugar, null, true);
    expect(r.ok).toBe(true);
    expect(['pano', 'borracha', 'moldura']).toContain(r.apoio);
    expect(r.distancia).toBeLessThan(cfg.distancia);
    expect(r.distancia).toBeGreaterThanOrEqual(cfg.distanciaMinima - 1e-9);
  });

  it('se nada tem apoio, ela fica no ar onde a primeira conta a pôs, em vez de sumir', () => {
    // Um mundo sem pano nem madeira: tudo é vão de caçapa.
    const vazio = { ...obstaculos, vaos: [{ bx: 0, bz: 0, ex: 1, ez: 0, raio: 50, profundidade: 50, cx: 0, cz: 0 }] };
    const r = escolherPonte(eixo, REPOUSO, vazio, bolasVazias(), cfg, null, [], poseVaziaDeMao(), null, true);
    expect(r.ok).toBe(true);
    expect(r.apoio).toBe('ar');
  });

  it('no meio da mesa o resultado é o mesmo com ou sem evitarAr', () => {
    const meio = eixoDoTaco(-0.4, R, 0.1, R, 0, 0.1, REPOUSO, 0, 0);
    const a = escolherPonte(meio, REPOUSO, obstaculos, bolasVazias(), cfg, null, [], poseVaziaDeMao());
    const b = escolherPonte(meio, REPOUSO, obstaculos, bolasVazias(), cfg, null, [], poseVaziaDeMao(), null, true);
    expect(b).toEqual(a);
  });
});
