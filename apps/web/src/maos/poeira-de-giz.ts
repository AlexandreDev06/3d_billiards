import type { ConfigMaos } from '../config';

type ConfigDaPoeira = ConfigMaos['giz']['poeira'];

const limitar = (v: number, a = 0, b = 1): number => Math.min(Math.max(v, a), b);

/**
 * O pó azul que sai do giz na ponta do taco: uma reserva fixa de partículas (`capacidade`, que o nível de qualidade escolhe;
 * zero = sem pó). Cada uma nasce em volta do ponto de contato, abre para os lados com pouca velocidade, sobe devagar, cresce e some.
 * Só conta (sem three): o desenho lê as listas. O sorteio é injetado (`sorteio`, de 0 a 1), então o teste é repetível.
 */
export class PoeiraDeGiz {
  readonly capacidade: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** Quanto cada uma já viveu e quanto vive (s); `vida` zero = livre. */
  readonly idade: Float32Array;
  readonly vida: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private proxima = 0;
  private resto = 0;

  constructor(
    private readonly cfg: ConfigDaPoeira,
    capacidade: number,
    private readonly sorteio: () => number,
  ) {
    this.capacidade = Math.max(Math.floor(capacidade), 0);
    const n = this.capacidade;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.idade = new Float32Array(n);
    this.vida = new Float32Array(n);
  }

  /** Quantas estão no ar. */
  get vivas(): number {
    let n = 0;
    for (let i = 0; i < this.capacidade; i++) if (this.vida[i]! > 0) n++;
    return n;
  }

  /** Apaga todas (partida nova, mão que sumiu). */
  limpar(): void {
    this.vida.fill(0);
    this.idade.fill(0);
    this.resto = 0;
  }

  /**
   * Solta pó em (`px`, `py`, `pz`) à razão de `cfg.porSegundo` por segundo durante `dt`: os que não completam uma partícula
   * ficam para o quadro seguinte. `ex`, `ey`, `ez` é o eixo do taco (unitário): o pó abre em volta dele.
   */
  emitir(dt: number, px: number, py: number, pz: number, ex: number, ey: number, ez: number): void {
    if (this.capacidade === 0) return;
    this.resto += this.cfg.porSegundo * Math.max(dt, 0);
    while (this.resto >= 1) {
      this.resto -= 1;
      this.nascer(px, py, pz, ex, ey, ez);
    }
  }

  private nascer(px: number, py: number, pz: number, ex: number, ey: number, ez: number): void {
    const i = this.proxima;
    this.proxima = (this.proxima + 1) % this.capacidade;
    // Duas direções perpendiculares ao eixo.
    let ax = ey * 0 - ez * 1;
    let ay = ez * 0 - ex * 0;
    let az = ex * 1 - ey * 0;
    const n = Math.hypot(ax, ay, az);
    if (n < 1e-6) {
      ax = 1;
      ay = 0;
      az = 0;
    } else {
      ax /= n;
      ay /= n;
      az /= n;
    }
    const bx = ey * az - ez * ay;
    const by = ez * ax - ex * az;
    const bz = ex * ay - ey * ax;
    const giro = this.sorteio() * 2 * Math.PI;
    const c = Math.cos(giro);
    const s = Math.sin(giro);
    const v = this.cfg.velocidade * (0.4 + 0.9 * this.sorteio());
    const recuo = this.cfg.velocidade * 0.4 * (this.sorteio() - 0.3);
    this.x[i] = px + (ax * c + bx * s) * 0.004;
    this.y[i] = py + (ay * c + by * s) * 0.004;
    this.z[i] = pz + (az * c + bz * s) * 0.004;
    this.vx[i] = (ax * c + bx * s) * v + ex * recuo;
    this.vy[i] = (ay * c + by * s) * v + ey * recuo + this.cfg.subida * (0.5 + this.sorteio());
    this.vz[i] = (az * c + bz * s) * v + ez * recuo;
    this.idade[i] = 0;
    this.vida[i] = this.cfg.vidaS[0] + (this.cfg.vidaS[1] - this.cfg.vidaS[0]) * this.sorteio();
  }

  /** Anda `dt`: cada partícula desliza, perde velocidade e envelhece; as que passam da vida ficam livres. */
  atualizar(dt: number): void {
    const passo = Math.max(dt, 0);
    const arrasto = Math.exp(-2.2 * passo);
    for (let i = 0; i < this.capacidade; i++) {
      if (this.vida[i]! <= 0) continue;
      this.idade[i]! += passo;
      if (this.idade[i]! >= this.vida[i]!) {
        this.vida[i] = 0;
        continue;
      }
      this.x[i]! += this.vx[i]! * passo;
      this.y[i]! += this.vy[i]! * passo;
      this.z[i]! += this.vz[i]! * passo;
      this.vx[i]! *= arrasto;
      this.vy[i]! *= arrasto;
      this.vz[i]! *= arrasto;
    }
  }

  /** O tamanho da partícula `i` agora (m): cresce do começo ao fim da vida. */
  tamanho(i: number): number {
    if (this.vida[i]! <= 0) return 0;
    const t = limitar(this.idade[i]! / this.vida[i]!);
    return this.cfg.tamanhoM[0] + (this.cfg.tamanhoM[1] - this.cfg.tamanhoM[0]) * Math.sqrt(t);
  }

  /** A opacidade da partícula `i` agora (0 a 1): sobe depressa no começo e some devagar. */
  opacidade(i: number): number {
    if (this.vida[i]! <= 0) return 0;
    const t = limitar(this.idade[i]! / this.vida[i]!);
    return 0.8 * Math.min(t / 0.08, 1) * (1 - t) ** 1.3;
  }
}
