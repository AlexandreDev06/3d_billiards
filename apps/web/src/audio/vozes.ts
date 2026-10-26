export interface Voz {
  /** Quanto a voz dura a partir de quando entra (s). */
  readonly duracaoS: number;
  /** Quão alta ela é (0–1): na falta de vaga, a mais baixa cede. */
  readonly volume: number;
  /** Corta a voz antes da hora (quando outra toma o lugar). */
  parar(): void;
}

export interface EstatisticasDeVozes {
  readonly aceitas: number;
  readonly recusadas: number;
  readonly roubadas: number;
  /** Maior número de vozes ao mesmo tempo. */
  readonly pico: number;
}

interface Ativa {
  readonly voz: Voz;
  readonly fimS: number;
}

/**
 * Limite de vozes simultâneas, sem Web Audio: o relógio (`agoraS`) vem de quem chama.
 * Cheio, a voz nova só entra se for mais alta que a mais baixa ativa, que então é parada.
 */
export class LimitadorDeVozes {
  private ativasAgora: Ativa[] = [];
  private aceitas = 0;
  private recusadas = 0;
  private roubadas = 0;
  private pico = 0;

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError(`máximo de vozes inválido: ${max}`);
  }

  /** `true` se a voz entrou (e deve tocar); `false` se foi recusada (e não deve). */
  admitir(agoraS: number, voz: Voz): boolean {
    this.limpar(agoraS);
    if (this.ativasAgora.length >= this.max) {
      let indice = 0;
      for (let i = 1; i < this.ativasAgora.length; i++) {
        const a = this.ativasAgora[i]!;
        const m = this.ativasAgora[indice]!;
        if (a.voz.volume < m.voz.volume || (a.voz.volume === m.voz.volume && a.fimS < m.fimS)) indice = i;
      }
      const mais = this.ativasAgora[indice]!;
      if (voz.volume <= mais.voz.volume) {
        this.recusadas++;
        return false;
      }
      this.ativasAgora.splice(indice, 1);
      mais.voz.parar();
      this.roubadas++;
    }
    this.ativasAgora.push({ voz, fimS: agoraS + voz.duracaoS });
    this.aceitas++;
    this.pico = Math.max(this.pico, this.ativasAgora.length);
    return true;
  }

  ativas(agoraS: number): number {
    this.limpar(agoraS);
    return this.ativasAgora.length;
  }

  estatisticas(): EstatisticasDeVozes {
    return { aceitas: this.aceitas, recusadas: this.recusadas, roubadas: this.roubadas, pico: this.pico };
  }

  /** Esquece vozes e contadores, sem parar nenhuma. */
  zerar(): void {
    this.ativasAgora = [];
    this.aceitas = this.recusadas = this.roubadas = this.pico = 0;
  }

  private limpar(agoraS: number): void {
    this.ativasAgora = this.ativasAgora.filter((a) => a.fimS > agoraS);
  }
}
