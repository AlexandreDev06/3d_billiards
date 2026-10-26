import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { ehSoftware, haloDoTacoNoNivel, ladosDosPersonagens, nivelAbaixo, nivelInicial, pedeRecarregar, razaoDePixels, segmentosDoTaco, detalheDasMaos } from './perfis';

const { perfis } = CONFIG_WEB.qualidade;

describe('níveis de qualidade', () => {
  it('descem de alta a média e baixa; a baixa não tem abaixo', () => {
    expect(nivelAbaixo('alta')).toBe('media');
    expect(nivelAbaixo('media')).toBe('baixa');
    expect(nivelAbaixo('baixa')).toBeNull();
  });

  it('cada nível liga menos que o de cima: a baixa é a do pedido (sem sombra, standard, sem ambiente, sem antialias, pixelRatio 1)', () => {
    const { alta, media, baixa } = perfis;
    expect(baixa).toMatchObject({ pixelRatioMax: 1, sombras: false, materiais: 'leves', ambiente: false, antialias: false, focoBarato: true });
    expect(alta).toMatchObject({ sombras: true, materiais: 'fisicos', ambiente: true, antialias: true, focoBarato: false });
    expect(media.materiais).toBe('standard');
    expect(media.pixelRatioMax).toBeLessThan(alta.pixelRatioMax);
    expect(baixa.pixelRatioMax).toBeLessThanOrEqual(media.pixelRatioMax);
    expect(media.escalaTextura).toBeLessThan(alta.escalaTextura);
    expect(baixa.escalaTextura).toBeLessThan(media.escalaTextura);
    expect(baixa.anisotropiaMax).toBeLessThan(media.anisotropiaMax);
    expect(media.anisotropiaMax).toBeLessThan(alta.anisotropiaMax);
    expect(baixa.orcamentoDePixels).toBeLessThan(media.orcamentoDePixels);
    expect(media.orcamentoDePixels).toBeLessThan(alta.orcamentoDePixels);
    for (const nivel of ['alta', 'media', 'baixa'] as const) expect(perfis[nivel].nivel).toBe(nivel);
  });
});

describe('razaoDePixels', () => {
  it('a alta usa o pixelRatio do navegador até o teto de 2', () => {
    expect(razaoDePixels(perfis.alta, 1, 1920, 1080)).toBe(1);
    expect(razaoDePixels(perfis.alta, 1.5, 1920, 1080)).toBe(1.5);
    expect(razaoDePixels(perfis.alta, 3, 1920, 1080)).toBe(2);
  });

  it('a baixa nunca passa de 1 e encolhe em tela grande para caber no orçamento de pixels', () => {
    expect(razaoDePixels(perfis.baixa, 2, 640, 360)).toBe(1);
    const grande = razaoDePixels(perfis.baixa, 1, 1920, 1080);
    expect(grande).toBeLessThan(0.55);
    expect(grande * grande * 1920 * 1080).toBeLessThanOrEqual(perfis.baixa.orcamentoDePixels + 1);
    const medio = razaoDePixels(perfis.baixa, 1, 1280, 720);
    expect(medio).toBeCloseTo(0.75, 1);
  });

  it('nunca cai abaixo de um piso (janela enorme), nem vira zero ou NaN com janela vazia', () => {
    expect(razaoDePixels(perfis.baixa, 1, 8000, 6000)).toBeGreaterThanOrEqual(0.35);
    expect(razaoDePixels(perfis.baixa, 1, 0, 0)).toBe(1);
    // Sem área, o pixelRatio do navegador não vale: nem a alta (que o aceitaria até 2) sai do 1.
    expect(razaoDePixels(perfis.alta, 2, 0, 0)).toBe(1);
  });
});

describe('ehSoftware', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Microsoft Basic Render Driver',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
    'Mesa OffScreen',
    'softpipe',
    'Software Rasterizer',
    'Apple Software Renderer',
  ])('"%s" é renderização por software', (rotulo) => {
    expect(ehSoftware(rotulo)).toBe(true);
  });

  it.each([
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER (0x00002783) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Mesa Intel(R) Xe Graphics (TGL GT2)',
    'AMD Radeon RX 6600',
    'Apple M2',
  ])('"%s" é GPU de verdade', (rotulo) => {
    expect(ehSoftware(rotulo)).toBe(false);
  });

  it('sem texto não afirma nada', () => {
    expect(ehSoftware(null)).toBe(false);
    expect(ehSoftware('')).toBe(false);
  });
});

describe('nivelInicial', () => {
  it('um nível escolhido vale como está, mesmo em software', () => {
    expect(nivelInicial({ preferencia: 'alta', software: true, rebaixada: 'baixa' })).toBe('alta');
    expect(nivelInicial({ preferencia: 'media', software: false, rebaixada: null })).toBe('media');
    expect(nivelInicial({ preferencia: 'baixa', software: false, rebaixada: null })).toBe('baixa');
  });

  it('automático em software começa na baixa', () => {
    expect(nivelInicial({ preferencia: 'auto', software: true, rebaixada: null })).toBe('baixa');
  });

  it('automático com GPU começa na alta, ou no nível a que o jogo já teve de descer neste computador', () => {
    expect(nivelInicial({ preferencia: 'auto', software: false, rebaixada: null })).toBe('alta');
    expect(nivelInicial({ preferencia: 'auto', software: false, rebaixada: 'media' })).toBe('media');
    expect(nivelInicial({ preferencia: 'auto', software: false, rebaixada: 'baixa' })).toBe('baixa');
  });
});

describe('pedeRecarregar', () => {
  it('só antialias e tamanho das texturas dependem da abertura', () => {
    expect(pedeRecarregar(perfis.alta, perfis.alta)).toBe(false);
    expect(pedeRecarregar(perfis.alta, perfis.media)).toBe(true); // texturas 1 → 0,75
    expect(pedeRecarregar(perfis.alta, perfis.baixa)).toBe(true);
    expect(pedeRecarregar(perfis.baixa, perfis.baixa)).toBe(false);
    expect(pedeRecarregar(perfis.baixa, perfis.alta)).toBe(true);
    // Só o antialias diferindo já basta (as texturas iguais), e só o tamanho das texturas também.
    expect(pedeRecarregar(perfis.alta, { ...perfis.alta, antialias: false })).toBe(true);
    expect(pedeRecarregar(perfis.alta, { ...perfis.alta, escalaTextura: 0.5 })).toBe(true);
    // Só sombra, ambiente, escala e materiais mudam: vale na hora.
    expect(pedeRecarregar({ ...perfis.alta, sombras: false, ambiente: false, pixelRatioMax: 1, materiais: 'leves' }, perfis.alta)).toBe(false);
  });
});

describe('segmentosDoTaco', () => {
  it('menos lados nos níveis baixos, sempre par e entre 12 e 36', () => {
    const lados = [perfis.alta, perfis.media, perfis.baixa].map(segmentosDoTaco);
    expect(lados[0]!).toBeGreaterThan(lados[1]!);
    expect(lados[1]!).toBeGreaterThan(lados[2]!);
    for (const n of lados) {
      expect(n % 2).toBe(0);
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(36);
    }
  });

  it('o piso e o teto valem para qualquer esfera', () => {
    expect(segmentosDoTaco({ ...perfis.baixa, segmentosEsfera: [4, 4] })).toBe(12);
    expect(segmentosDoTaco({ ...perfis.alta, segmentosEsfera: [400, 4] })).toBe(36);
  });
});

describe('haloDoTacoNoNivel', () => {
  it('o brilho do neon (uma casca aditiva extra) só fora do nível baixo: lá ele custaria fragmentos de uma máquina que já anda a 10 fps', () => {
    expect(haloDoTacoNoNivel(perfis.alta)).toBe(true);
    expect(haloDoTacoNoNivel(perfis.media)).toBe(true);
    expect(haloDoTacoNoNivel(perfis.baixa)).toBe(false);
  });
});

describe('detalheDasMaos', () => {
  it('a malha alta do arquivo nos níveis alta e média e a baixa na baixa', () => {
    expect([perfis.alta, perfis.media, perfis.baixa].map(detalheDasMaos)).toEqual(['alto', 'medio', 'baixo']);
  });
});

describe('ladosDosPersonagens', () => {
  it('as mãos e os balões têm menos lados nos níveis baixos, nunca menos que 8', () => {
    const lados = [perfis.alta, perfis.media, perfis.baixa].map(ladosDosPersonagens);
    expect(lados[0]!).toBeGreaterThan(lados[1]!);
    expect(lados[1]!).toBeGreaterThan(lados[2]!);
    expect(lados[2]!).toBeGreaterThanOrEqual(8);
    expect(ladosDosPersonagens({ ...perfis.baixa, segmentosEsfera: [4, 4] })).toBe(8);
  });
});
