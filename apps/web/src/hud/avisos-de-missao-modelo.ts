import type { AvisoDeMissao } from '../online/missoes-modelo';

/** Quanto cada tipo de aviso fica na tela (ms) e quantos cabem de uma vez. */
export interface ConfigDosAvisosDeMissao {
  readonly progressoMs: number;
  readonly cumpridaMs: number;
  readonly maximo: number;
}

export interface AvisoNaPilha extends AvisoDeMissao {
  readonly desdeMs: number;
  readonly ateMs: number;
}

/**
 * Os avisos de missão que estão na tela (puro): cada um entra com a hora e sai pelo relógio. A pilha tem teto: o novo que não
 * cabe tira o mais velho. A festa dura mais que o progresso.
 */
export class PilhaDeAvisosDeMissao {
  #itens: AvisoNaPilha[] = [];

  constructor(private readonly cfg: ConfigDosAvisosDeMissao) {}

  empilhar(avisos: readonly AvisoDeMissao[], agoraMs: number): void {
    for (const a of avisos) {
      const dura = a.tipo === 'cumprida' ? this.cfg.cumpridaMs : this.cfg.progressoMs;
      this.#itens.push({ ...a, desdeMs: agoraMs, ateMs: agoraMs + dura });
    }
    if (this.#itens.length > this.cfg.maximo) this.#itens = this.#itens.slice(this.#itens.length - this.cfg.maximo);
  }

  /** Tira o que já passou da hora e devolve o que fica (mais velho primeiro). */
  atualizar(agoraMs: number): readonly AvisoNaPilha[] {
    if (this.#itens.some((i) => agoraMs >= i.ateMs)) this.#itens = this.#itens.filter((i) => agoraMs < i.ateMs);
    return this.#itens;
  }

  limpar(): void {
    this.#itens = [];
  }
}
