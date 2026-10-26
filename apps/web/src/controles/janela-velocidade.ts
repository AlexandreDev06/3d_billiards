const DT_MINIMO_MS = 1;

/** Anel de amostras (tempo, posição) para a velocidade média de avanço nos últimos `janelaMs`. */
export class JanelaDeVelocidade {
  private readonly tempos: Float64Array;
  private readonly posicoes: Float64Array;
  private proximo = 0;
  private quantidade = 0;

  constructor(
    private readonly janelaMs: number,
    capacidade = 64,
  ) {
    this.tempos = new Float64Array(capacidade);
    this.posicoes = new Float64Array(capacidade);
  }

  registrar(tempoMs: number, posicao: number): void {
    this.tempos[this.proximo] = tempoMs;
    this.posicoes[this.proximo] = posicao;
    this.proximo = (this.proximo + 1) % this.tempos.length;
    if (this.quantidade < this.tempos.length) this.quantidade++;
  }

  /** m/s no sentido em que a posição diminui (taco indo para a bola); negativa se estiver recuando. */
  velocidade(agoraMs: number): number {
    if (this.quantidade < 2) return 0;
    const capacidade = this.tempos.length;
    const recente = (this.proximo - 1 + capacidade) % capacidade;
    const inicioJanela = agoraMs - this.janelaMs;
    let referencia = (recente - 1 + capacidade) % capacidade;
    // Sobe até a amostra mais antiga dentro da janela; se só a mais recente estiver nela, fica a anterior.
    for (let k = 1; k < this.quantidade; k++) {
      const indice = (recente - k + capacidade) % capacidade;
      if (this.tempos[indice]! < inicioJanela) break;
      referencia = indice;
    }
    const dt = Math.max(this.tempos[recente]! - this.tempos[referencia]!, DT_MINIMO_MS);
    return ((this.posicoes[referencia]! - this.posicoes[recente]!) / dt) * 1000;
  }

  reiniciar(): void {
    this.proximo = 0;
    this.quantidade = 0;
  }
}
