import { Giz } from './giz';
import type { RegrasGiz } from './regras-giz';

/** O que a entrada e o HUD precisam do giz de quem está na vez. */
export interface GizDaVez {
  readonly nivel: number;
  readonly passando: boolean;
  /** Gasta o giz de uma tacada (sorteado pelas regras); devolve quanto foi. */
  consumir(): number;
  passar(): boolean;
  atualizar(dt: number): void;
}

/** Um giz por jogador (cada um tem o seu taco); responde pelo de quem tem a vez. */
export class GizDosJogadores implements GizDaVez {
  private gizes: Giz[];
  private vez = 0;

  constructor(
    private readonly jogadores: number,
    private regras: RegrasGiz,
    private readonly sortear: () => number,
  ) {
    this.gizes = this.novos();
  }

  /** As regras da mesa: valem para todos a partir da próxima tacada e da próxima passada. */
  definirRegras(regras: RegrasGiz): void {
    this.regras = regras;
    for (const giz of this.gizes) giz.definirRegras(regras);
  }

  get regrasAtuais(): RegrasGiz {
    return this.regras;
  }

  /** Partida nova: todo mundo com giz fresco e a vez do primeiro. */
  reiniciar(): void {
    this.gizes = this.novos();
    this.vez = 0;
  }

  /** Passa a vez; lança se não houver esse jogador. */
  definirVez(indice: number): void {
    if (!Number.isInteger(indice) || indice < 0 || indice >= this.gizes.length) throw new RangeError(`jogador inválido: ${indice}`);
    this.vez = indice;
  }

  nivelDe(indice: number): number {
    return this.gizes[indice]!.nivel;
  }

  private novos(): Giz[] {
    return Array.from({ length: this.jogadores }, () => new Giz(this.regras, this.sortear));
  }

  get nivel(): number {
    return this.gizes[this.vez]!.nivel;
  }

  get passando(): boolean {
    return this.gizes[this.vez]!.passando;
  }

  consumir(): number {
    return this.gizes[this.vez]!.consumir();
  }

  passar(): boolean {
    return this.gizes[this.vez]!.passar();
  }

  atualizar(dt: number): void {
    this.gizes[this.vez]!.atualizar(dt);
  }
}
