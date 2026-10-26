import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, cacapas } from '@sinuca/fisica';
import { larguraDaMoldura } from './cena/geometria-mesa';
import { CONFIG_WEB } from './config';

describe('CONFIG_WEB: pedidos do usuário que são só valores', () => {
  it('a luz é quente, de luminária de bar: lâmpada e preenchimento entre 2700 e 3000 K', () => {
    const { luminaria, preenchimento } = CONFIG_WEB.luz;
    for (const k of [luminaria.temperaturaK, preenchimento.temperaturaK]) {
      expect(k).toBeGreaterThanOrEqual(2700);
      expect(k).toBeLessThanOrEqual(3000);
    }
  });

  it('a luminária fica perto do pano, uns 0,9 m acima', () => {
    expect(CONFIG_WEB.luz.luminaria.altura).toBeGreaterThanOrEqual(0.8);
    expect(CONFIG_WEB.luz.luminaria.altura).toBeLessThanOrEqual(1);
  });

  it('o verniz da madeira é discreto: pouco clearcoat e pouca intensidade especular', () => {
    expect(CONFIG_WEB.mesa.madeira.verniz).toBeLessThanOrEqual(0.4);
    expect(CONFIG_WEB.mesa.madeira.especular).toBeLessThanOrEqual(0.6);
  });

  it('o buraco da caçapa desce uns 15 cm e o lábio de alumínio passa da moldura no máximo 3 mm', () => {
    expect(CONFIG_WEB.mesa.profundidadeTubo).toBeGreaterThanOrEqual(0.15);
    expect(CONFIG_WEB.mesa.labio.sobra).toBeLessThanOrEqual(0.003);
  });

  it('o buraco do meio é o círculo de queda da física e a moldura do desenho deixa pelo menos paredeDaCacapa de madeira até a borda', () => {
    const { mesa } = CONFIG_FISICA_PADRAO;
    const doMeio = cacapas(mesa).find((c) => c.id === 'meio-z+')!;
    // o círculo de queda vai fundoMeio + a boca inteira além do nariz: mais fundo que a moldura das medidas
    const alcance = doMeio.fundo + 2 * doMeio.raio;
    expect(mesa.larguraTabela + mesa.larguraMoldura - alcance).toBeLessThan(CONFIG_WEB.mesa.paredeDaCacapa);
    expect(mesa.larguraTabela + larguraDaMoldura(mesa, CONFIG_WEB.mesa) - alcance).toBeGreaterThanOrEqual(CONFIG_WEB.mesa.paredeDaCacapa - 1e-9);
    expect(CONFIG_WEB.mesa.paredeDaCacapa).toBeGreaterThanOrEqual(0.015);
  });

  it('a linha de previsão nasce desligada (é regra da partida, escolhida antes de começar), e a da bola atingida também', () => {
    expect(CONFIG_WEB.previsao.ligada).toBe(false);
    expect(CONFIG_WEB.previsao.bolaAtingida).toBe(false);
  });

  it('online a transição da falta cabe inteira na margem do relógio da sala (3,2 s): nada de encurtar', () => {
    const { anelS, vooS, deslizeS, margemOnlineS } = CONFIG_WEB.transicao;
    expect(anelS + vooS + deslizeS).toBeCloseTo(3.1, 9);
    expect(margemOnlineS).toBe(3.2);
    expect(margemOnlineS).toBeGreaterThanOrEqual(anelS + vooS + deslizeS);
  });

  it('a linha da bola atingida é curta, uns 15 cm', () => {
    expect(CONFIG_WEB.previsao.comprimentoBolaAtingida).toBeCloseTo(0.15, 3);
  });

  it('a força da previsão é média: entre um quarto e 60% do teto do taco', () => {
    const teto = CONFIG_FISICA_PADRAO.velocidadeMaxTaco;
    expect(CONFIG_WEB.previsao.velocidadeTaco).toBeGreaterThanOrEqual(teto * 0.25);
    expect(CONFIG_WEB.previsao.velocidadeTaco).toBeLessThanOrEqual(teto * 0.6);
  });

  it('as linhas são finas (até 4 mm) e ficam a poucos milímetros acima do pano', () => {
    expect(CONFIG_WEB.previsao.linha.largura).toBeLessThanOrEqual(0.004);
    expect(CONFIG_WEB.previsao.linha.altura).toBeGreaterThan(0);
    expect(CONFIG_WEB.previsao.linha.altura).toBeLessThanOrEqual(0.003);
  });

  it('a previsão ocupa no máximo uma fração pequena do tempo: espaço mínimo de 30 ms ou mais e fator de custo de 5 ou mais', () => {
    expect(CONFIG_WEB.previsao.espacoMinimoMs).toBeGreaterThanOrEqual(30);
    expect(CONFIG_WEB.previsao.fatorCusto).toBeGreaterThanOrEqual(5);
  });
});
