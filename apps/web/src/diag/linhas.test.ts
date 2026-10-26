import { describe, expect, it } from 'vitest';
import { linhasDoDiagnostico, type DadosDoDiagnostico } from './linhas';

const base: DadosDoDiagnostico = {
  fps: 59.84,
  piorQuadroMs: 24.06,
  janelaFpsS: 1,
  janelaPiorS: 5,
  chamadas: 42,
  triangulos: 85120,
  geometrias: 61,
  texturas: 34,
  memoriaMb: 87.34,
  renderizador: 'ANGLE (NVIDIA RTX)',
  software: false,
  nivel: 'media',
  rotuloDoNivel: 'Média',
  preferencia: 'auto',
  razaoDePixels: 0.75,
  largura: 1280,
  altura: 720,
};

describe('linhasDoDiagnostico', () => {
  it('mostra FPS, pior quadro, chamadas, geometrias, texturas, memória, GPU e qualidade', () => {
    const texto = linhasDoDiagnostico(base).join('\n');
    expect(texto).toContain('FPS 59,8');
    expect(texto).toContain('pior quadro 24,1 ms (5 s)');
    expect(texto).toContain('Chamadas 42');
    expect(texto).toContain('triângulos 85.120');
    expect(texto).toContain('Geometrias 61');
    expect(texto).toContain('texturas 34');
    expect(texto).toContain('Memória JS 87,3 MB');
    expect(texto).toContain('GPU: ANGLE (NVIDIA RTX)');
    expect(texto).toContain('Qualidade: Média (automática)');
    expect(texto).toContain('960×540');
  });

  it('nível fixo diz "fixa"; software aparece na linha da GPU', () => {
    const texto = linhasDoDiagnostico({ ...base, preferencia: 'baixa', software: true, renderizador: 'SwiftShader' }).join('\n');
    expect(texto).toContain('(fixa)');
    expect(texto).toContain('GPU: SwiftShader (software)');
  });

  it('sem memória exposta e sem nome de GPU não inventa número', () => {
    const texto = linhasDoDiagnostico({ ...base, memoriaMb: null, renderizador: null }).join('\n');
    expect(texto).toContain('Memória JS: o navegador não informa');
    expect(texto).toContain('GPU: desconhecida');
  });
});
