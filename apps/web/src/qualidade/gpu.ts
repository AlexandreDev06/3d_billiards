import { ehSoftware } from './perfis';

export interface InfoDaGpu {
  /** O nome que o driver dá (WEBGL_debug_renderer_info), ou `null` se o navegador esconde. */
  readonly renderizador: string | null;
  /** Renderização por software: o navegador diz que não há GPU de verdade ou o nome do renderizador entrega. */
  readonly software: boolean;
}

/** O pouco que usamos de um contexto WebGL; aceita um falso nos testes. */
export interface ContextoSonda {
  getExtension(nome: string): unknown;
  getParameter(parametro: number): unknown;
  readonly RENDERER: number;
}

export interface CanvasSonda {
  getContext(tipo: string, atributos?: Record<string, unknown>): ContextoSonda | null;
}

const SEM_INFO: InfoDaGpu = { renderizador: null, software: false };

function nomeDoRenderizador(gl: ContextoSonda): string | null {
  const info = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  const nome = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  return typeof nome === 'string' && nome !== '' ? nome : null;
}

function soltar(gl: ContextoSonda | null): void {
  (gl?.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
}

/**
 * Sonda o WebGL num canvas descartável, antes de criar o renderizador do jogo (o antialias e o nível de abertura
 * dependem disto). Dois sinais de software: o contexto com `failIfMajorPerformanceCaveat` recusado enquanto o comum
 * abre, ou o nome do renderizador (SwiftShader, llvmpipe, "Basic Render"...).
 */
export function detectarGpu(criarCanvas: () => CanvasSonda = () => document.createElement('canvas') as unknown as CanvasSonda): InfoDaGpu {
  try {
    const comum = criarCanvas().getContext('webgl2') ?? criarCanvas().getContext('webgl');
    if (!comum) return SEM_INFO;
    const renderizador = nomeDoRenderizador(comum);
    soltar(comum);
    let semGpu = false;
    try {
      const exigente = criarCanvas().getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ?? criarCanvas().getContext('webgl', { failIfMajorPerformanceCaveat: true });
      semGpu = exigente === null;
      soltar(exigente);
    } catch {
      semGpu = false;
    }
    return { renderizador, software: semGpu || ehSoftware(renderizador) };
  } catch {
    return SEM_INFO;
  }
}

/**
 * `?renderizador=software` ou `?renderizador=gpu` na URL força a resposta da sonda nesta visita (para testar o modo
 * automático numa máquina que não é como a do jogador: o SwiftShader do CI "é" uma GPU, por exemplo).
 */
export function comRenderizadorDaUrl(info: InfoDaGpu, busca: string): InfoDaGpu {
  const pedido = new URLSearchParams(busca).get('renderizador');
  if (pedido === 'software') return { ...info, software: true };
  if (pedido === 'gpu') return { ...info, software: false };
  return info;
}
