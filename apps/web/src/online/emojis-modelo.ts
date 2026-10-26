import { LIMITES_PROTOCOLO, type EmojiSala } from '@sinuca/protocolo';

/**
 * O emoji que a tecla `code` manda: `Digit1`..`Digit8` e `Numpad1`..`Numpad8` são os oito que o jogador escolheu
 * (`escolhidos`, na ordem das teclas). Qualquer outra tecla (inclusive `Digit0` e `Digit9`) não manda nada.
 */
export function emojiDaTecla(code: string, escolhidos: readonly EmojiSala[]): EmojiSala | null {
  const achou = /^(?:Digit|Numpad)([1-8])$/.exec(code);
  return achou ? (escolhidos[Number(achou[1]) - 1] ?? null) : null;
}

/** O emoji de número `n` (1 a 8, o da tecla e do botão) entre os `escolhidos`; fora disso, `null`. */
export function emojiDoNumero(n: number, escolhidos: readonly EmojiSala[]): EmojiSala | null {
  return Number.isInteger(n) && n >= 1 && n <= escolhidos.length ? (escolhidos[n - 1] ?? null) : null;
}

/**
 * O mesmo balde que a sala usa por participante (`LIMITES_PROTOCOLO.emojiRajada` de rajada, recarregando
 * `emojiPorSegundo`): passou do limite, o cliente nem manda, porque a sala descartaria calada. O relógio entra em cada
 * chamada (ms; só as diferenças contam); o balde começa cheio.
 */
export class BaldeDeEmojis {
  private fichas: number;
  private ultimo: number | null = null;

  constructor(
    private readonly capacidade: number = LIMITES_PROTOCOLO.emojiRajada,
    private readonly porSegundo: number = LIMITES_PROTOCOLO.emojiPorSegundo,
  ) {
    this.fichas = capacidade;
  }

  /** Gasta uma ficha e devolve `true`, ou devolve `false` sem gastar se não houver. */
  tentar(agoraMs: number): boolean {
    if (this.ultimo !== null && agoraMs > this.ultimo) {
      this.fichas = Math.min(this.capacidade, this.fichas + ((agoraMs - this.ultimo) / 1000) * this.porSegundo);
    }
    if (this.ultimo === null || agoraMs > this.ultimo) this.ultimo = agoraMs;
    if (this.fichas < 1) return false;
    this.fichas -= 1;
    return true;
  }
}

/** O que um `emoji-retransmitido` traz. `lugar` `null` = espectador. */
export interface EmojiChegado {
  readonly lugar: number | null;
  readonly nome: string;
  readonly emoji: EmojiSala;
}

export interface BolhaDeEmoji extends EmojiChegado {
  readonly id: number;
  readonly chegouEmMs: number;
}

export interface OpcoesDaPilha {
  /** Quantas bolhas cabem ao mesmo tempo: a que chega acima disso tira a mais velha. */
  readonly maximo: number;
  /** Quanto uma bolha fica na tela, do instante em que chega. */
  readonly vidaMs: number;
  /** O pedaço final da vida em que ela some aos poucos (o desenho usa; o modelo só guarda o número). */
  readonly fadeMs: number;
}

export const PILHA_PADRAO: OpcoesDaPilha = { maximo: 4, vidaMs: 3000, fadeMs: 600 };

/**
 * Os emojis que estão no alto da tela (puro). Cada `emoji-retransmitido` vira uma bolha que expira pelo relógio; a ordem é
 * a de chegada (a mais velha primeiro, a mais nova por último, que é embaixo na tela).
 */
export class PilhaDeEmojis {
  private bolhas: BolhaDeEmoji[] = [];
  private proximoId = 1;

  constructor(readonly opcoes: OpcoesDaPilha = PILHA_PADRAO) {}

  get quantidade(): number {
    return this.bolhas.length;
  }

  /** Uma bolha nova; as que já venceram saem antes de contar o teto, e se ainda passar do máximo sai a mais velha. */
  chegar(emoji: EmojiChegado, agoraMs: number): BolhaDeEmoji {
    this.expirar(agoraMs);
    const bolha: BolhaDeEmoji = { id: this.proximoId++, lugar: emoji.lugar, nome: emoji.nome, emoji: emoji.emoji, chegouEmMs: agoraMs };
    this.bolhas.push(bolha);
    if (this.bolhas.length > this.opcoes.maximo) this.bolhas.splice(0, this.bolhas.length - this.opcoes.maximo);
    return bolha;
  }

  /** As bolhas que ainda estão na tela em `agoraMs`, da mais velha à mais nova. */
  visiveis(agoraMs: number): readonly BolhaDeEmoji[] {
    return this.bolhas.filter((b) => agoraMs - b.chegouEmMs < this.opcoes.vidaMs);
  }

  /** Esquece as que já venceram; devolve quantas saíram. */
  expirar(agoraMs: number): number {
    const antes = this.bolhas.length;
    this.bolhas = this.bolhas.filter((b) => agoraMs - b.chegouEmMs < this.opcoes.vidaMs);
    return antes - this.bolhas.length;
  }

  limpar(): void {
    this.bolhas = [];
  }
}
