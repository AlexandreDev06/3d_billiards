import type { RegrasGiz } from './regras-giz';

/** Abaixo disto o nível conta como cheio: somar décimos em ponto flutuante deixa 0,9999999. */
const QUASE_CHEIO = 1 - 1e-9;

/**
 * O giz de um jogador. Cada tacada gasta um desgaste sorteado entre `desgasteMin` e `desgasteMax`; cada passada sobe
 * `passada` do nível em `passadaS` segundos e, uma vez começada, vai até o fim.
 */
export class Giz {
  private nivelAtual = 1;
  private nivelInicioPassada = 1;
  private nivelFimPassada = 1;
  private decorrido = 0;
  private passandoAgora = false;

  constructor(
    private regras: RegrasGiz,
    private readonly sortear: () => number,
  ) {}

  get nivel(): number {
    return this.nivelAtual;
  }

  get passando(): boolean {
    return this.passandoAgora;
  }

  /** Vale a partir da próxima tacada e da próxima passada; a que está em curso termina como começou. */
  definirRegras(regras: RegrasGiz): void {
    this.regras = regras;
  }

  /** Gasta o giz de uma tacada; devolve quanto foi (fração do giz inteiro). */
  consumir(): number {
    const { desgasteMin, desgasteMax } = this.regras;
    const gasto = desgasteMin + (desgasteMax - desgasteMin) * this.sortear();
    this.passandoAgora = false;
    this.nivelAtual = Math.max(this.nivelAtual - gasto, 0);
    return gasto;
  }

  /** `false` se já está passando ou o giz já está cheio. */
  passar(): boolean {
    if (this.passandoAgora || this.nivelAtual >= QUASE_CHEIO) return false;
    const alvo = this.nivelAtual + this.regras.passada;
    this.passandoAgora = true;
    this.nivelInicioPassada = this.nivelAtual;
    this.nivelFimPassada = alvo >= QUASE_CHEIO ? 1 : alvo;
    this.decorrido = 0;
    return true;
  }

  atualizar(dt: number): void {
    if (!this.passandoAgora) return;
    this.decorrido += dt;
    const fracao = Math.min(this.decorrido / this.regras.passadaS, 1);
    this.nivelAtual = this.nivelInicioPassada + (this.nivelFimPassada - this.nivelInicioPassada) * fracao;
    if (fracao >= 1) {
      this.nivelAtual = this.nivelFimPassada;
      this.passandoAgora = false;
    }
  }
}
