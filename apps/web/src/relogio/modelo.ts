import { TEMPOS_POR_TACADA_S, type TempoPorTacadaS } from '@sinuca/protocolo';

/** `null` = sem limite. */
export type TempoDaTacadaS = TempoPorTacadaS | null;

/** As opções do seletor da sala e do hot-seat, na ordem em que aparecem. */
export const TEMPOS_DO_SELETOR: readonly TempoDaTacadaS[] = [...TEMPOS_POR_TACADA_S, null];

export const rotuloDoTempo = (tempoS: TempoDaTacadaS): string => (tempoS === null ? 'Sem limite' : `${tempoS} s`);

/**
 * Quanto falta para a vez acabar, em ms. A sala manda `prazoMs` relativo ao instante do envio (nenhum relógio
 * absoluto): aqui se desconta o que passou desde que o `estado-sala` chegou (`recebidoEm`). `null` = sem prazo.
 */
export function restanteDoPrazo(prazoMs: number | null | undefined, recebidoEm: number, agora: number): number | null {
  if (prazoMs === null || prazoMs === undefined) return null;
  return Math.max(0, prazoMs - Math.max(0, agora - recebidoEm));
}

/**
 * O prazo da sala já inclui a animação da tacada anterior e uma margem: enquanto ela toca, o contador espera no
 * tempo cheio da tacada em vez de descer de um número maior que o configurado.
 */
export function limitarAoTempo(restanteMs: number | null, tempoS: TempoDaTacadaS | undefined): number | null {
  if (restanteMs === null || tempoS === null || tempoS === undefined) return restanteMs;
  return Math.min(restanteMs, tempoS * 1000);
}

export interface LeituraDoContador {
  /** `m:ss`. */
  readonly texto: string;
  readonly segundos: number;
  /** Nos últimos `alertaS` segundos o contador fica vermelho. */
  readonly urgente: boolean;
}

/** O que o contador escreve para `restanteMs`; `null` (sem prazo) esconde. Arredonda para cima: 0:00 só quando acaba. */
export function leituraDoContador(restanteMs: number | null, alertaS: number): LeituraDoContador | null {
  if (restanteMs === null) return null;
  const segundos = Math.ceil(Math.max(0, restanteMs) / 1000);
  const resto = segundos % 60;
  return { texto: `${Math.floor(segundos / 60)}:${resto < 10 ? '0' : ''}${resto}`, segundos, urgente: segundos <= alertaS };
}

/**
 * O relógio do hot-seat: a mesma regra da sala (tempo por tacada, esgotou = perde a vez), contado aqui.
 * `avancar` roda todo quadro; fora do `ativo` (animação da tacada, painel aberto) o tempo fica parado.
 */
export class RelogioLocal {
  private restante: number | null = null;
  private ultimo: number | null = null;

  constructor(private tempo: TempoDaTacadaS) {}

  get tempoS(): TempoDaTacadaS {
    return this.tempo;
  }

  /** Começa uma tacada nova com o tempo cheio. */
  reiniciar(agoraMs: number): void {
    this.restante = this.tempo === null ? null : this.tempo * 1000;
    this.ultimo = agoraMs;
  }

  definirTempo(tempoS: TempoDaTacadaS, agoraMs: number): void {
    this.tempo = tempoS;
    this.reiniciar(agoraMs);
  }

  avancar(agoraMs: number, ativo: boolean): void {
    if (this.restante !== null && ativo && this.ultimo !== null) this.restante = Math.max(0, this.restante - (agoraMs - this.ultimo));
    this.ultimo = agoraMs;
  }

  /** `null` = sem limite (ou ainda sem tacada começada). */
  restanteMs(): number | null {
    return this.restante;
  }

  esgotou(): boolean {
    return this.restante === 0;
  }
}
