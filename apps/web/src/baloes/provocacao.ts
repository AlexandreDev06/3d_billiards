import type { ConfigBaloes } from '../config';

/** Por que quem joga contra o dono do balão perdeu a vez: a `falta` (sempre provoca) ou o `erro` simples, a bola que não caiu (provoca de vez em quando). */
export type MotivoDaProvocacao = 'falta' | 'erro';

/**
 * Quando o balão ri de quem joga contra o dono dele (`rindo` e depois `convencido`). A falta provoca sempre; o erro simples, no máximo
 * uma vez a cada `provocacaoNoErroEntreS` de partida (para o balão não ser repetitivo). A vez passou para o dono: `armar` guarda o
 * pedido, que vale por `provocacaoValeS`; `disparar`, a cada quadro com o balão à vista, diz quando ele deve rir. A janela do erro só
 * gasta quando o balão ri de verdade.
 */
export class ProvocacaoDoBalao {
  private motivo: MotivoDaProvocacao | null = null;
  private equipeAlvo = -1;
  private valeAteS = 0;
  private ultimoErroS = -Infinity;

  constructor(private readonly cfg: Pick<ConfigBaloes['rosto'], 'provocacaoValeS' | 'provocacaoEscala' | 'provocacaoNoErroEntreS'>) {}

  /** `equipeAlvo` ficou com a vez depois do `motivo`. Devolve se o pedido ficou guardado (o erro simples dentro da janela não fica). */
  armar(motivo: MotivoDaProvocacao, equipeAlvo: number, agoraS: number): boolean {
    this.motivo = null;
    if (motivo === 'erro' && agoraS - this.ultimoErroS < this.cfg.provocacaoNoErroEntreS) return false;
    this.motivo = motivo;
    this.equipeAlvo = equipeAlvo;
    this.valeAteS = agoraS + this.cfg.provocacaoValeS;
    return true;
  }

  /**
   * O balão da equipe `equipeDoDono` está à vista com `escala` (0 a 1): é hora de rir? Verdadeiro uma vez por pedido. O pedido de
   * outra equipe espera o dono certo aparecer, até vencer.
   */
  disparar(equipeDoDono: number, agoraS: number, escala: number): boolean {
    if (this.motivo === null) return false;
    if (agoraS > this.valeAteS) {
      this.motivo = null;
      return false;
    }
    if (equipeDoDono !== this.equipeAlvo || escala <= this.cfg.provocacaoEscala) return false;
    if (this.motivo === 'erro') this.ultimoErroS = agoraS;
    this.motivo = null;
    return true;
  }

  /** O pedido que esperava não vale mais (o dono saiu de cena, a partida acabou). */
  cancelar(): void {
    this.motivo = null;
  }

  /** Partida nova ou sala nova: sem pedido e sem lembrar da última provocação por erro. */
  reiniciar(): void {
    this.motivo = null;
    this.ultimoErroS = -Infinity;
  }
}
