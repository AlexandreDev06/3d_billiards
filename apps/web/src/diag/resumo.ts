import { LIMITES_PROTOCOLO, type MsgDiagnostico } from '@sinuca/protocolo';
import type { NivelDeQualidade } from '../config';
import type { EstatisticasDeQuadros } from './quadros';

/** O que o cliente conta à sala a cada período: como o jogo andou neste computador. */
export interface ResumoDeDesempenho {
  readonly fpsMedio: number;
  readonly piorQuadroMs: number;
  readonly qualidade: NivelDeQualidade;
  readonly renderizador: string | null;
  /** Heap do JavaScript em MB; `null` se o navegador não expõe. */
  readonly memoriaMb: number | null;
}

export interface FonteDoResumo {
  readonly quadros: EstatisticasDeQuadros;
  readonly qualidade: () => NivelDeQualidade;
  readonly renderizador: string | null;
  readonly memoriaMb: () => number | null;
}

const arredondar = (v: number, casas: number): number => Math.round(v * 10 ** casas) / 10 ** casas;

/** Fecha o período: devolve o resumo e zera os acumuladores. `null` se não houve quadro (aba escondida). */
export function fecharResumo(fonte: FonteDoResumo): ResumoDeDesempenho | null {
  const periodo = fonte.quadros.periodo();
  fonte.quadros.zerarPeriodo();
  if (periodo.quadros === 0) return null;
  const memoria = fonte.memoriaMb();
  return {
    fpsMedio: arredondar(periodo.fpsMedio, 1),
    piorQuadroMs: arredondar(periodo.piorMs, 1),
    qualidade: fonte.qualidade(),
    renderizador: fonte.renderizador,
    memoriaMb: memoria === null ? null : arredondar(memoria, 1),
  };
}

/**
 * De `intervaloMs` em `intervaloMs`, fecha um resumo e o entrega a `enviar`. Só conta o tempo enquanto
 * `ativo()` (online e conectado); ao ficar inativo o período recomeça, para não misturar a hora ruim.
 */
export class EmissorDeDiagnostico {
  private inicioDoPeriodo = -1;

  constructor(
    private readonly fonte: FonteDoResumo,
    private readonly intervaloMs: number,
    private readonly ativo: () => boolean,
    private readonly enviar: (resumo: ResumoDeDesempenho) => void,
  ) {}

  /** Uma vez por quadro. */
  atualizar(agoraMs: number): void {
    if (!this.ativo()) {
      this.inicioDoPeriodo = -1;
      return;
    }
    if (this.inicioDoPeriodo < 0) {
      this.inicioDoPeriodo = agoraMs;
      this.fonte.quadros.zerarPeriodo();
      return;
    }
    if (agoraMs - this.inicioDoPeriodo < this.intervaloMs) return;
    this.inicioDoPeriodo = agoraMs;
    const resumo = fecharResumo(this.fonte);
    if (resumo !== null) this.enviar(resumo);
  }
}

/** Heap do JS em MB onde o navegador expõe (Chrome); `null` nos outros. */
export function memoriaDoJsMb(desempenho: Performance = performance): number | null {
  const memoria = (desempenho as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const usada = memoria?.usedJSHeapSize;
  return typeof usada === 'number' && Number.isFinite(usada) ? usada / (1024 * 1024) : null;
}

/** Texto livre do renderizador no formato do protocolo: sem caracteres de controle, no teto de tamanho, `desconhecida` se faltar. */
function gpuParaOFio(renderizador: string | null): string {
  // eslint-disable-next-line no-control-regex
  const limpo = (renderizador ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return limpo === '' ? 'desconhecida' : limpo.slice(0, LIMITES_PROTOCOLO.gpu);
}

/** O resumo como a sala o recebe (`diagnostico` do protocolo): números nas faixas dela, textos curtos, memória só se existe. */
export function mensagemDeDiagnostico(resumo: ResumoDeDesempenho): MsgDiagnostico {
  const base = {
    tipo: 'diagnostico' as const,
    fpsMedio: Math.min(Math.max(resumo.fpsMedio, 0), 1000),
    piorQuadroMs: Math.min(Math.max(resumo.piorQuadroMs, 0), 600_000),
    qualidade: resumo.qualidade.slice(0, LIMITES_PROTOCOLO.qualidade),
    gpu: gpuParaOFio(resumo.renderizador),
  };
  return resumo.memoriaMb === null ? base : { ...base, memoriaMb: Math.min(Math.max(resumo.memoriaMb, 0), 1_000_000) };
}
