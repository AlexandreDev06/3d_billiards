/** Como o balão escolhe o que olhar. */
export interface ConfigDoSeguidor {
  /** Abaixo disto (m/s) nenhuma bola conta como andando. */
  readonly velocidadeMinima: number;
  /** A bola que já se segue fica enquanto andar pelo menos esta fração da mais rápida (0 a 1). */
  readonly histerese: number;
  /** Quão depressa o ponto olhado alcança a bola (1/s). */
  readonly taxa: number;
  /** Altura do ponto olhado sobre o pano (m): o centro da bola. */
  readonly altura: number;
}

/** A suavização da velocidade de cada bola (fração do quadro novo): tira o tremor da conta posição a posição. */
const MISTURA_DA_VELOCIDADE = 0.5;

/**
 * Para onde o balão olha: a bola branca enquanto nada anda e, depois da tacada, a bola que corre mais rápido. A velocidade sai da
 * diferença de posição entre dois quadros (a gravação só guarda posições). O ponto olhado (`x`, `y`, `z`) anda suave de uma bola
 * para a outra. Não aloca depois do primeiro quadro.
 */
export class SeguidorDoOlhar {
  x = 0;
  y: number;
  z = 0;
  /** O índice da bola que o balão segue agora. */
  bolaSeguida: number;
  /** Onde a bola seguida está (sem suavização: o olho do personagem persegue sozinho, com sacadas de correção). */
  bolaX = 0;
  bolaZ = 0;
  /** Alguma bola anda (também a branca, logo depois da tacada). */
  andando = false;
  private anteriorX = new Float64Array(0);
  private anteriorZ = new Float64Array(0);
  private velocidade = new Float64Array(0);
  private primeiro = true;

  constructor(
    private readonly cfg: ConfigDoSeguidor,
    private readonly branca: number,
  ) {
    this.y = cfg.altura;
    this.bolaSeguida = branca;
  }

  /** Esquece as velocidades e volta a olhar a branca (vez nova, balão novo). */
  reiniciar(): void {
    this.primeiro = true;
    this.bolaSeguida = this.branca;
    this.andando = false;
    this.velocidade.fill(0);
  }

  /** `xs`, `zs` e `ativas` (a bola ainda está na mesa) têm uma posição por bola, pelo índice dela. */
  atualizar(dt: number, xs: ArrayLike<number>, zs: ArrayLike<number>, ativas: ArrayLike<number | boolean>): void {
    const n = xs.length;
    if (this.anteriorX.length !== n) {
      this.anteriorX = new Float64Array(n);
      this.anteriorZ = new Float64Array(n);
      this.velocidade = new Float64Array(n);
      this.primeiro = true;
    }
    if (!this.primeiro && dt > 0) {
      for (let i = 0; i < n; i++) {
        const v = ativas[i] ? Math.hypot(xs[i]! - this.anteriorX[i]!, zs[i]! - this.anteriorZ[i]!) / dt : 0;
        this.velocidade[i] = this.velocidade[i]! + (v - this.velocidade[i]!) * MISTURA_DA_VELOCIDADE;
      }
    }
    for (let i = 0; i < n; i++) {
      this.anteriorX[i] = xs[i]!;
      this.anteriorZ[i] = zs[i]!;
    }
    let melhor = -1;
    for (let i = 0; i < n; i++) if (ativas[i] && (melhor < 0 || this.velocidade[i]! > this.velocidade[melhor]!)) melhor = i;
    const { velocidadeMinima, histerese } = this.cfg;
    if (melhor < 0 || this.velocidade[melhor]! < velocidadeMinima) this.bolaSeguida = this.branca;
    else {
      const atual = this.bolaSeguida;
      const segue = atual !== this.branca && ativas[atual] && this.velocidade[atual]! >= velocidadeMinima && this.velocidade[atual]! >= histerese * this.velocidade[melhor]!;
      if (!segue) this.bolaSeguida = melhor;
    }
    const i = this.bolaSeguida;
    this.bolaX = xs[i]!;
    this.bolaZ = zs[i]!;
    this.andando = melhor >= 0 && this.velocidade[melhor]! >= velocidadeMinima;
    if (this.primeiro) {
      this.x = xs[i]!;
      this.z = zs[i]!;
      this.primeiro = false;
    } else {
      const k = 1 - Math.exp(-this.cfg.taxa * Math.max(dt, 0));
      this.x += (xs[i]! - this.x) * k;
      this.z += (zs[i]! - this.z) * k;
    }
  }
}
