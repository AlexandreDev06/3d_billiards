import type { IdBola } from '@sinuca/fisica';
import { TECLAS_DO_TREINO } from '../treino/teclas';
import type { ModoDaMao } from '../treino/sessao-de-treino';

/** O que o HUD do treino precisa saber a cada quadro. */
export interface EntradaDoHudTreino {
  readonly bolasNaMesa: number;
  readonly tacadas: number;
  readonly modo: ModoDaMao;
  readonly cenario: { readonly nome: string; readonly descricao: string } | null;
  /** A mesa ficou limpa (a partida acabou). */
  readonly mesaLimpa: boolean;
  readonly podeRefazer: boolean;
  /** As numeradas fora da mesa (a bandeja). */
  readonly bandeja: readonly IdBola[];
}

/** O HUD do treino já em texto: `treino.ts` só o desenha. */
export interface HudDoTreinoNaTela {
  readonly bolas: string;
  readonly tacadas: string;
  readonly cenario: { readonly nome: string; readonly descricao: string } | null;
  /** A frase de ajuda do modo da mão, ou a da mesa limpa; `null` mirando. */
  readonly dica: string | null;
  readonly mesaLimpa: boolean;
  readonly modo: ModoDaMao;
  readonly refazerAtivo: boolean;
  readonly bandeja: readonly IdBola[];
  /** A bandeja só aparece arrumando a mesa. */
  readonly mostrarBandeja: boolean;
}

/** "1 bola na mesa" / "12 bolas na mesa" / "Mesa limpa". */
export function textoDasBolas(n: number): string {
  if (n <= 0) return 'Mesa limpa';
  return n === 1 ? '1 bola na mesa' : `${n} bolas na mesa`;
}

/** "Nenhuma tacada" / "1 tacada" / "7 tacadas". */
export function textoDasTacadas(n: number): string {
  if (n <= 0) return 'Nenhuma tacada';
  return n === 1 ? '1 tacada' : `${n} tacadas`;
}

const rotuloDaTecla = (code: string): string => (code.startsWith('Key') ? code.slice(3) : code);

export function dicaDoModo(modo: ModoDaMao, mesaLimpa: boolean, tacadas: number): string | null {
  if (modo === 'branca') {
    return `Bola na mão: arraste a branca e solte onde ela couber (vermelho: encosta). ${rotuloDaTecla(TECLAS_DO_TREINO.bolaNaMao)} ou Esc volta a mirar.`;
  }
  if (modo === 'arrumar') {
    return `Arrumando a mesa: arraste as bolas; ${rotuloDaTecla(TECLAS_DO_TREINO.tirarBola)} tira a bola sob o mouse e clicar na bandeja a devolve. ${rotuloDaTecla(TECLAS_DO_TREINO.arrumar)} ou Esc volta a mirar.`;
  }
  if (mesaLimpa) {
    return `Mesa limpa em ${textoDasTacadas(tacadas).toLowerCase()}! ${rotuloDaTecla(TECLAS_DO_TREINO.novoTriangulo)} arruma de novo, ${rotuloDaTecla(TECLAS_DO_TREINO.refazer)} refaz a última tacada.`;
  }
  return null;
}

export function hudDoTreino(e: EntradaDoHudTreino): HudDoTreinoNaTela {
  return {
    bolas: textoDasBolas(e.bolasNaMesa),
    tacadas: textoDasTacadas(e.tacadas),
    cenario: e.cenario,
    dica: dicaDoModo(e.modo, e.mesaLimpa, e.tacadas),
    mesaLimpa: e.mesaLimpa,
    modo: e.modo,
    refazerAtivo: e.podeRefazer,
    bandeja: e.bandeja,
    mostrarBandeja: e.modo === 'arrumar',
  };
}
