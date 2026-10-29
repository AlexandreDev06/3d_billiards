import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { arquivoDoBoteco, corDoMarcador, luzDePonto, NIVEL_DO_BOTECO, tetoVisivel } from './boteco-modelo';

describe('arquivoDoBoteco', () => {
  it('cada qualidade carrega o nível do .glb que casa com ela', () => {
    expect(NIVEL_DO_BOTECO).toEqual({ alta: 'alto', media: 'medio', baixa: 'baixo' });
    expect(arquivoDoBoteco('boteco/', 'alta')).toBe('boteco/boteco-alto.glb');
    expect(arquivoDoBoteco('boteco/', 'media')).toBe('boteco/boteco-medio.glb');
    expect(arquivoDoBoteco('boteco/', 'baixa')).toBe('boteco/boteco-baixo.glb');
  });
});

describe('corDoMarcador', () => {
  it('lê #rrggbb e recusa o resto', () => {
    expect(corDoMarcador('#ff4fa0')).toBe(0xff4fa0);
    expect(corDoMarcador('#FFAA00')).toBe(0xffaa00);
    for (const ruim of ['ff4fa0', '#fff', '#gg0000', '', null, undefined, 3]) expect(corDoMarcador(ruim)).toBeNull();
  });
});

describe('luzDePonto', () => {
  const extras = { tipo: 'ponto', cor: '#ff4fa0', intensidade: 0.5, alcance: 3.2 };

  it('intensidade relativa vira candela pelo fator do visor (8), com cor e alcance do marcador', () => {
    expect(luzDePonto('luz-neon', [1, 2, 3], extras, CONFIG_WEB.boteco.fatorDaLuzDePonto)).toEqual({ nome: 'luz-neon', posicao: [1, 2, 3], cor: 0xff4fa0, intensidade: 4, alcance: 3.2 });
  });

  it('a luz retangular (a luminária) não é de ponto: fica com o ambiente.ts', () => {
    expect(luzDePonto('luz-luminaria', [0, 1.4, 0], { ...extras, tipo: 'retangular' }, 8)).toBeNull();
  });

  it('dado estragado ou ausente não vira luz', () => {
    expect(luzDePonto('x', [0, 0, 0], undefined, 8)).toBeNull();
    for (const ruim of [{ cor: 'rosa' }, { intensidade: 0 }, { intensidade: '1' }, { alcance: -1 }, { alcance: undefined }]) {
      expect(luzDePonto('x', [0, 0, 0], { ...extras, ...ruim }, 8)).toBeNull();
    }
  });
});

describe('tetoVisivel', () => {
  it('some com a câmera acima do limite (a vista de cima), aparece abaixo', () => {
    const { tetoSomeAcimaDe } = CONFIG_WEB.boteco;
    expect(tetoVisivel(1.4, tetoSomeAcimaDe)).toBe(true);
    expect(tetoVisivel(CONFIG_WEB.boteco.sala.yMax, tetoSomeAcimaDe)).toBe(true);
    expect(tetoVisivel(2.5, tetoSomeAcimaDe)).toBe(false);
    expect(tetoVisivel(tetoSomeAcimaDe, tetoSomeAcimaDe)).toBe(false);
  });
});
