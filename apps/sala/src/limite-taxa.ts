/** Balde de fichas: `capacidade` de rajada, recarregando `porSegundo`. O relógio é injetado (ms). */
export class BaldeDeTokens {
  private fichas: number;
  private ultimo: number;

  constructor(
    private readonly capacidade: number,
    private readonly porSegundo: number,
    private readonly agora: () => number,
  ) {
    this.fichas = capacidade;
    this.ultimo = agora();
  }

  /** Gasta `custo` fichas e devolve `true`, ou devolve `false` sem gastar se não houver. */
  tentar(custo = 1): boolean {
    const t = this.agora();
    if (t > this.ultimo) {
      this.fichas = Math.min(this.capacidade, this.fichas + ((t - this.ultimo) / 1000) * this.porSegundo);
      this.ultimo = t;
    }
    if (this.fichas < custo) return false;
    this.fichas -= custo;
    return true;
  }
}

/** Um balde por chave (por exemplo, por IP). `limpar` esquece as chaves que já recarregaram por inteiro. */
export class BaldesPorChave {
  private readonly baldes = new Map<string, { balde: BaldeDeTokens; gastouEm: number }>();

  constructor(
    private readonly capacidade: number,
    private readonly porSegundo: number,
    private readonly agora: () => number,
  ) {}

  get tamanho(): number {
    return this.baldes.size;
  }

  tentar(chave: string, custo = 1): boolean {
    let item = this.baldes.get(chave);
    if (!item) {
      item = { balde: new BaldeDeTokens(this.capacidade, this.porSegundo, this.agora), gastouEm: 0 };
      this.baldes.set(chave, item);
    }
    item.gastouEm = this.agora();
    return item.balde.tentar(custo);
  }

  /** Esquece as chaves que não gastaram nada há tempo suficiente para o balde voltar a encher. */
  limpar(): void {
    const recarga = this.porSegundo > 0 ? (this.capacidade / this.porSegundo) * 1000 : Infinity;
    const t = this.agora();
    for (const [chave, item] of this.baldes) if (t - item.gastouEm >= recarga) this.baldes.delete(chave);
  }
}
