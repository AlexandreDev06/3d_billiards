import { describe, expect, it } from 'vitest';
import { comRenderizadorDaUrl, detectarGpu, type CanvasSonda, type ContextoSonda } from './gpu';

function contexto(renderizador: string | null, perdidos: string[] = []): ContextoSonda {
  return {
    RENDERER: 7937,
    getExtension: (nome) => {
      if (nome === 'WEBGL_debug_renderer_info') return renderizador === null ? null : { UNMASKED_RENDERER_WEBGL: 37446 };
      if (nome === 'WEBGL_lose_context') return { loseContext: () => void perdidos.push('perdido') };
      return null;
    },
    getParameter: (p) => (p === 37446 ? renderizador : p === 7937 ? 'WebKit WebGL' : null),
  };
}

/** `exigente`: o contexto que o navegador entrega quando se pede `failIfMajorPerformanceCaveat` (`null` = recusa). */
function canvas(comum: ContextoSonda | null, exigente: ContextoSonda | null): () => CanvasSonda {
  return () => ({ getContext: (_tipo, atributos) => (atributos?.failIfMajorPerformanceCaveat ? exigente : comum) });
}

describe('detectarGpu', () => {
  it('GPU de verdade: não é software e devolve o nome', () => {
    const gpu = contexto('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11)');
    expect(detectarGpu(canvas(gpu, gpu))).toEqual({ renderizador: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11)', software: false });
  });

  it('SwiftShader: software pelo nome, mesmo se o navegador aceitar o contexto exigente', () => {
    const sw = contexto('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)');
    expect(detectarGpu(canvas(sw, sw)).software).toBe(true);
  });

  it('o navegador recusa o contexto exigente (sem GPU de verdade): software mesmo com nome neutro', () => {
    const gpu = contexto('Intel Graphics');
    expect(detectarGpu(canvas(gpu, null))).toEqual({ renderizador: 'Intel Graphics', software: true });
  });

  it('o navegador esconde o nome: cai no renderizador genérico e não afirma software sozinho', () => {
    const gpu = contexto(null);
    expect(detectarGpu(canvas(gpu, gpu))).toEqual({ renderizador: 'WebKit WebGL', software: false });
  });

  it('sem WebGL: sem informação (o jogo nem abre, mas a sonda não pode derrubar nada)', () => {
    expect(detectarGpu(canvas(null, null))).toEqual({ renderizador: null, software: false });
  });

  it('qualquer erro da sonda é engolido', () => {
    expect(
      detectarGpu(() => {
        throw new Error('sem canvas');
      }),
    ).toEqual({ renderizador: null, software: false });
  });

  it('solta os contextos de sonda (o navegador limita quantos ficam vivos)', () => {
    const perdidos: string[] = [];
    const gpu = contexto('Intel Graphics', perdidos);
    detectarGpu(canvas(gpu, gpu));
    expect(perdidos).toHaveLength(2);
  });
});

describe('comRenderizadorDaUrl', () => {
  const real = { renderizador: 'NVIDIA', software: false };
  const sw = { renderizador: 'SwiftShader', software: true };

  it('sem o parâmetro vale o que a sonda disse', () => {
    expect(comRenderizadorDaUrl(real, '')).toBe(real);
    expect(comRenderizadorDaUrl(sw, '?semente=3')).toBe(sw);
  });

  it('software e gpu forçam a resposta e mantêm o nome', () => {
    expect(comRenderizadorDaUrl(real, '?renderizador=software')).toEqual({ renderizador: 'NVIDIA', software: true });
    expect(comRenderizadorDaUrl(sw, '?renderizador=gpu')).toEqual({ renderizador: 'SwiftShader', software: false });
  });

  it('valor desconhecido é ignorado', () => {
    expect(comRenderizadorDaUrl(sw, '?renderizador=ultra')).toBe(sw);
  });
});
