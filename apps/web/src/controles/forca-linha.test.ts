import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, criarRng, lugares, simularTacada } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { CONTROLES_DE_FORCA, CONTROLE_DE_FORCA_PADRAO, controleDaUrl, controleEfetivo, ehControleDeForca, fracaoDaPuxada, velocidadeDaLinha } from './forca-linha';

const cfg = CONFIG_WEB.tacada;
const COMPRIMENTO = CONFIG_FISICA_PADRAO.mesa.comprimento;

/** Quanto o bolão sozinho anda (caminho total, tabelas incluídas) até parar, saindo da marca de saída. */
function caminhoDoBolao(velocidadeTaco: number, angulo = 0): number {
  const estado = { bolas: [bolaParada(ID_BOLAO, lugares(CONFIG_FISICA_PADRAO.mesa).marcaSaida)] };
  const { gravacao: g } = simularTacada(estado, { angulo, velocidadeTaco, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, criarRng(1));
  let d = 0;
  for (let q = 1; q < g.quadros; q++) d += Math.hypot(g.posicoes[q * 3]! - g.posicoes[(q - 1) * 3]!, g.posicoes[q * 3 + 2]! - g.posicoes[(q - 1) * 3 + 2]!);
  return d;
}

describe('velocidadeDaLinha', () => {
  it('zero na barra vazia e a "Força máxima" de hoje na cheia, que não passa do teto da física', () => {
    expect(velocidadeDaLinha(0, cfg)).toBe(0);
    expect(velocidadeDaLinha(1, cfg)).toBeCloseTo(cfg.velocidadeMax, 12);
    expect(velocidadeDaLinha(1, cfg)).toBeLessThanOrEqual(CONFIG_FISICA_PADRAO.velocidadeMaxTaco);
  });

  it('cresce sempre com a barra, e fora da barra vale o limite', () => {
    let anterior = -1;
    for (let k = 0; k <= 100; k++) {
      const v = velocidadeDaLinha(k / 100, cfg);
      expect(v).toBeGreaterThan(anterior);
      anterior = v;
    }
    expect(velocidadeDaLinha(-0.5, cfg)).toBe(0);
    expect(velocidadeDaLinha(3, cfg)).toBe(velocidadeDaLinha(1, cfg));
  });

  it('segue a "Força máxima" do painel dev: a barra cheia dá o que o painel mandar', () => {
    expect(velocidadeDaLinha(1, { ...cfg, velocidadeMax: 6 })).toBeCloseTo(6, 12);
    expect(velocidadeDaLinha(0.5, { ...cfg, velocidadeMax: 6 })).toBeCloseTo(6 * velocidadeDaLinha(0.5, cfg) / cfg.velocidadeMax, 12);
  });

  it('com a física real: 25% da barra leva o bolão a cerca de 1 comprimento de mesa e 50%, a cerca de 2', () => {
    const quarto = caminhoDoBolao(velocidadeDaLinha(0.25, cfg)) / COMPRIMENTO;
    const metade = caminhoDoBolao(velocidadeDaLinha(0.5, cfg)) / COMPRIMENTO;
    expect(quarto).toBeGreaterThan(0.92);
    expect(quarto).toBeLessThan(1.08);
    expect(metade).toBeGreaterThan(1.85);
    expect(metade).toBeLessThan(2.15);
  });

  it('com a física real: a barra cheia é uma saída forte (mais de 3 comprimentos), não um tiro (menos de 4)', () => {
    const cheia = caminhoDoBolao(velocidadeDaLinha(1, cfg)) / COMPRIMENTO;
    expect(cheia).toBeGreaterThan(3);
    expect(cheia).toBeLessThan(4);
  });

  it('na diagonal e na largura a mesa estreita encurta o caminho, mas a ordem é a mesma (mais barra, mais longe)', () => {
    for (const angulo of [0.4, 1.2, Math.PI / 2]) {
      let anterior = 0;
      for (const f of [0.1, 0.25, 0.5, 0.75, 1]) {
        const d = caminhoDoBolao(velocidadeDaLinha(f, cfg), angulo);
        expect(d).toBeGreaterThan(anterior);
        anterior = d;
      }
      // 25% anda de meio a 1 comprimento de mesa em qualquer direção
      const quarto = caminhoDoBolao(velocidadeDaLinha(0.25, cfg), angulo) / COMPRIMENTO;
      expect(quarto).toBeGreaterThan(0.5);
      expect(quarto).toBeLessThan(1.1);
    }
  });

  it('resolução onde se joga: de 5% a 50% da barra, 1% a mais (2 px de mouse) move o bolão menos de 20 cm', () => {
    let pior = 0;
    for (let k = 5; k < 50; k++) {
      const a = caminhoDoBolao(velocidadeDaLinha(k / 100, cfg));
      const b = caminhoDoBolao(velocidadeDaLinha((k + 1) / 100, cfg));
      pior = Math.max(pior, b - a);
    }
    expect(pior).toBeLessThan(0.2);
  });

  it('a metade de baixo da barra cobre as tacadas fracas e médias: até 50% o bolão nem chega a 2,5 m/s', () => {
    expect(velocidadeDaLinha(0.5, cfg)).toBeLessThan(2.5);
    expect(velocidadeDaLinha(0.5, cfg)).toBeGreaterThan(velocidadeDaLinha(1, cfg) * 0.5);
  });
});

describe('fracaoDaPuxada', () => {
  it('a barra cheia é recuoMaximo − recuoInicial, e a sensibilidade do jogador só muda os pixels', () => {
    const cheia = cfg.recuoMaximo - cfg.recuoInicial;
    expect(fracaoDaPuxada(0, cfg)).toBe(0);
    expect(fracaoDaPuxada(cheia / 2, cfg)).toBeCloseTo(0.5, 12);
    expect(fracaoDaPuxada(cheia, cfg)).toBe(1);
    expect(fracaoDaPuxada(cheia * 3, cfg)).toBe(1);
    expect(fracaoDaPuxada(-1, cfg)).toBe(0);
  });
});

describe('controle de força', () => {
  it('são dois, e o padrão é a linha', () => {
    expect(CONTROLES_DE_FORCA).toEqual(['empurrar', 'linha']);
    expect(CONTROLE_DE_FORCA_PADRAO).toBe('linha');
    expect(ehControleDeForca('linha')).toBe(true);
    expect(ehControleDeForca('empurrar')).toBe(true);
    expect(ehControleDeForca('Linha')).toBe(false);
    expect(ehControleDeForca(null)).toBe(false);
  });

  it('?forca= escolhe o controle; outra coisa não vale', () => {
    expect(controleDaUrl('?forca=empurrar')).toBe('empurrar');
    expect(controleDaUrl('?semente=3&forca=linha')).toBe('linha');
    expect(controleDaUrl('?forca=outra')).toBeNull();
    expect(controleDaUrl('?forca=')).toBeNull();
    expect(controleDaUrl('')).toBeNull();
  });

  it('o ponto único: online vale o que a sala mandar; sem ela, e no mesmo PC, vale o local', () => {
    expect(controleEfetivo(false, undefined, 'linha')).toBe('linha');
    expect(controleEfetivo(false, 'empurrar', 'linha')).toBe('linha');
    expect(controleEfetivo(true, undefined, 'empurrar')).toBe('empurrar');
    expect(controleEfetivo(true, null, 'linha')).toBe('linha');
    expect(controleEfetivo(true, 'empurrar', 'linha')).toBe('empurrar');
    expect(controleEfetivo(true, 'linha', 'empurrar')).toBe('linha');
  });
});
