import type { EventoTacada, IdBola } from '@sinuca/fisica';
import type { NomeFalta } from './tipos';

/** O bolão (= `ID_BOLAO` da física, que as regras não importam em tempo de execução). */
export const BOLAO: IdBola = 0;

/** Toques da branca a menos disto (s) um do outro contam como simultâneos. */
const SIMULTANEO = 1e-6;

export interface Fatos {
  /** Bolas que a branca tocou primeiro (mais de uma = toque simultâneo). */
  readonly primeiro: readonly IdBola[];
  /** Numeradas encaçapadas, em ordem de queda. */
  readonly caidas: readonly IdBola[];
  /** Numeradas que pularam para fora da mesa. */
  readonly pularam: readonly IdBola[];
  readonly brancaCaiu: boolean;
  readonly brancaFora: boolean;
}

export function fatos(eventos: readonly EventoTacada[], emJogo: ReadonlySet<IdBola>, naMesa: readonly IdBola[]): Fatos {
  const primeiro: IdBola[] = [];
  let tPrimeiro = 0;
  const caidas: IdBola[] = [];
  const pularam: IdBola[] = [];
  let brancaCaiu = false;
  let brancaFora = false;
  for (const e of eventos) {
    if (e.tipo === 'bola-bola') {
      const outra = e.a === BOLAO ? e.b : e.b === BOLAO ? e.a : null;
      if (outra === null || !emJogo.has(outra)) continue;
      if (primeiro.length === 0) tPrimeiro = e.t;
      if (Math.abs(e.t - tPrimeiro) <= SIMULTANEO && !primeiro.includes(outra)) primeiro.push(outra);
    } else if (e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa') {
      if (e.bola === BOLAO) {
        if (!brancaCaiu && !brancaFora) {
          brancaCaiu = e.tipo === 'cacapa';
          brancaFora = e.tipo === 'fora-da-mesa';
        }
        continue;
      }
      if (!naMesa.includes(e.bola)) throw new Error(`aplicarTacada: a bola ${e.bola} não está na mesa`);
      if (!emJogo.has(e.bola) || caidas.includes(e.bola) || pularam.includes(e.bola)) continue;
      (e.tipo === 'cacapa' ? caidas : pularam).push(e.bola);
    }
  }
  return { primeiro, caidas, pularam, brancaCaiu, brancaFora };
}

/** Sem toque, cegou; sem tocar um alvo (`bolasAlvo`), a bola final fora de hora se só ela foi tocada, senão direta. */
export function faltaDoToque(primeiro: readonly IdBola[], alvo: readonly IdBola[], castigo: IdBola | null): NomeFalta | null {
  if (primeiro.length === 0) return 'cegar';
  if (primeiro.some((b) => alvo.includes(b))) return null;
  return primeiro.every((b) => b === castigo) ? 'castigo-fora-de-hora' : 'direta';
}

