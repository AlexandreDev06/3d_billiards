import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, MESA_BAR } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { eixoDoTaco } from './eixo';
import { bolasVazias, escolherPonte, poseDaPonte, poseVaziaDeMao, type ConfigDaPonte } from './pose-das-maos';

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

describe('escolherPonte com `pousam` (L65)', () => {
  // A branca colada na cabeceira, o taco apontado para o centro: atrás dela a mão cai sobre a borracha e a moldura.
  const eixo = eixoDoTaco(-(HX - R), R, 0.05, R, 0, 0.2, REPOUSO, 0, 0);
  const esfera = [{ x: 0, y: -0.01, z: 0, r: 0.02 }];

  it('sem `pousam` o resultado é o de sempre, e `pousa` só diz se há apoio', () => {
    const r = escolherPonte(eixo, REPOUSO, obstaculos, bolasVazias(), cfg, null, esfera, poseVaziaDeMao(), null, true);
    expect(r.pousa).toBe(r.apoio !== 'ar');
  });

  it('o lugar com apoio que o de sempre achou vale sem procurar, e `pousam` nem é perguntado', () => {
    const meio = eixoDoTaco(-0.4, R, 0.1, R, 0, 0.1, REPOUSO, 0, 0);
    let perguntas = 0;
    const a = escolherPonte(meio, REPOUSO, obstaculos, bolasVazias(), cfg, null, [], poseVaziaDeMao(), null, true);
    const b = escolherPonte(meio, REPOUSO, obstaculos, bolasVazias(), cfg, null, [], poseVaziaDeMao(), null, true, () => {
      perguntas++;
      return true;
    });
    expect(b).toEqual(a);
    expect(perguntas).toBe(0);
  });

  it('num mundo sem nenhum apoio nada pousa: fica onde o de sempre a pôs, com `pousa` falso', () => {
    const vazio = { ...obstaculos, vaos: [{ bx: 0, bz: 0, ex: 1, ez: 0, raio: 50, profundidade: 50, cx: 0, cz: 0 }] };
    const lugar = poseVaziaDeMao();
    const sem = escolherPonte(eixo, REPOUSO, vazio, bolasVazias(), cfg, null, esfera, poseVaziaDeMao(), null, true);
    const r = escolherPonte(eixo, REPOUSO, vazio, bolasVazias(), cfg, null, esfera, lugar, null, true, () => true);
    expect(r.ok).toBe(true);
    expect(r.pousa).toBe(false);
    expect(r.distancia).toBeCloseTo(sem.distancia, 9);
  });
});

describe('poseDaPonte: a mão pendurada na moldura (L65)', () => {
  const HZ = MESA_BAR.largura / 2;
  // A branca colada na tabela de cima, o taco para o pano: a mão, 23 cm atrás, passa da moldura; uma esfera dela fica sobre ela.
  const eixo = eixoDoTaco(0.1, R, HZ - R, R, -Math.PI / 2, 0.2, REPOUSO, 0, 0);
  const sobreAMoldura = [{ x: 0.12, y: 0, z: 0, r: 0.02 }];

  it('por padrão a palma no ar é ar, como no L63', () => {
    const r = poseDaPonte(eixo, REPOUSO, 0.23, obstaculos, cfg, poseVaziaDeMao(), sobreAMoldura, false);
    expect(r.apoio).toBe('ar');
    expect(r.sobreAMesa).toBe(true);
  });

  it('com `apoioPelasEsferas` ela está apoiada no que a esfera toca', () => {
    const r = poseDaPonte(eixo, REPOUSO, 0.23, obstaculos, cfg, poseVaziaDeMao(), sobreAMoldura, false, true);
    expect(r.apoio).toBe('moldura');
  });

  it('sem esfera sobre a mesa, nem assim há apoio', () => {
    const longe = [{ x: -0.2, y: 0, z: 0, r: 0.02 }];
    const r = poseDaPonte(eixo, REPOUSO, 0.23, obstaculos, cfg, poseVaziaDeMao(), longe, false, true);
    expect(r.apoio).toBe('ar');
  });
});

