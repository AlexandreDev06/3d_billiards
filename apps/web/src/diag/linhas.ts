import type { PreferenciaDeQualidade } from '../qualidade/perfis';
import type { NivelDeQualidade } from '../config';

export interface DadosDoDiagnostico {
  readonly fps: number;
  readonly piorQuadroMs: number;
  readonly janelaFpsS: number;
  readonly janelaPiorS: number;
  readonly chamadas: number;
  readonly triangulos: number;
  readonly geometrias: number;
  readonly texturas: number;
  readonly memoriaMb: number | null;
  readonly renderizador: string | null;
  readonly software: boolean;
  readonly nivel: NivelDeQualidade;
  readonly rotuloDoNivel: string;
  readonly preferencia: PreferenciaDeQualidade;
  readonly razaoDePixels: number;
  readonly largura: number;
  readonly altura: number;
}

const num = (v: number, casas: number): string => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const inteiro = (v: number): string => Math.round(v).toLocaleString('pt-BR');

/** As linhas do painel F3, em texto puro (o painel só as desenha). */
export function linhasDoDiagnostico(d: DadosDoDiagnostico): string[] {
  const escolha = d.preferencia === 'auto' ? 'automática' : 'fixa';
  const pixels = `${inteiro(d.largura * d.razaoDePixels)}×${inteiro(d.altura * d.razaoDePixels)}`;
  return [
    `FPS ${num(d.fps, 1)} · pior quadro ${num(d.piorQuadroMs, 1)} ms (${d.janelaPiorS} s)`,
    `Qualidade: ${d.rotuloDoNivel} (${escolha}) · escala ${num(d.razaoDePixels, 2)} · ${pixels}`,
    `Chamadas ${inteiro(d.chamadas)} · triângulos ${inteiro(d.triangulos)}`,
    `Geometrias ${inteiro(d.geometrias)} · texturas ${inteiro(d.texturas)}`,
    d.memoriaMb === null ? 'Memória JS: o navegador não informa' : `Memória JS ${num(d.memoriaMb, 1)} MB`,
    `GPU: ${d.renderizador ?? 'desconhecida'}${d.software ? ' (software)' : ''}`,
  ];
}
