/** Como a cordinha se comporta. Unidades do mundo (m, s). */
export interface OpcoesDaCordinha {
  /** O passo da simulação (s): fixo, nunca o do quadro de tela. */
  readonly passoS: number;
  /** No máximo quantos passos por quadro; o que passar disso é descartado (um quadro de 1 s não trava nem acelera o tempo). */
  readonly maxSubpassos: number;
  /** A gravidade (m/s²), para baixo. Menor que a da Terra faz um objeto pequeno parecer maior. */
  readonly gravidade: number;
  /** O arrasto do ar (1/s): faz a cordinha assentar. */
  readonly amortecimento: number;
  /** Quantas rodadas de restrição de comprimento por passo (a última passada sempre deixa os elos exatos). */
  readonly iteracoes: number;
  /** De 0 a 1: o quanto o primeiro elo é puxado, a cada passo, para a direção em que sai do nó. */
  readonly rigidezDaBase: number;
  /** Um deslocamento da âncora de mais que isto vezes o comprimento total, num quadro, é teletransporte. */
  readonly saltoMaximo: number;
}

const PADRAO: OpcoesDaCordinha = { passoS: 1 / 120, maxSubpassos: 6, gravidade: 5, amortecimento: 2.5, iteracoes: 4, rigidezDaBase: 0.15, saltoMaximo: 4 };

/**
 * Uma cordinha simulada: uma corrente de pontos presa a uma âncora (o nó do balão), em verlet com gravidade, arrasto, e as
 * distâncias entre os pontos presas ao comprimento de cada elo. O corpo se move e a cordinha fica para trás e balança, em vez de
 * seguir a ação gravada. Passo fixo, com no máximo `maxSubpassos` por quadro; a âncora anda aos poucos entre um quadro e o outro.
 *
 * Os comprimentos são exatos ao fim de cada passo (uma última passada da âncora para a ponta os refaz), então a corrente nunca
 * estica nem passa do alcance da âncora, venha o movimento que vier; um teletransporte da âncora leva a corrente junto, sem
 * chicote. Os pontos estão em `pontos` (`(elos + 1) × 3`, o primeiro é a âncora). Só conta: quem desenha leva os pontos aos ossos.
 * Nada aloca depois de montada.
 */
export class CordinhaSimulada {
  /** x, y, z de cada ponto, do nó para a ponta. */
  readonly pontos: Float64Array;
  /** Os comprimentos de repouso (m), um por elo. */
  readonly comprimentos: Float64Array;
  /** Multiplica todos os comprimentos (o balão que aparece, estufa e murcha). */
  escala = 1;
  /** Quantos passos o último quadro rodou. */
  passos = 0;

  private readonly anterior: Float64Array;
  private readonly o: OpcoesDaCordinha;
  private readonly total: number;
  private iniciada = false;
  private acumuladoS = 0;

  constructor(comprimentos: ArrayLike<number>, opcoes: Partial<OpcoesDaCordinha> = {}) {
    if (comprimentos.length === 0) throw new Error('cordinha: sem elos');
    this.comprimentos = Float64Array.from(comprimentos);
    for (let i = 0; i < this.comprimentos.length; i++) {
      if (!(this.comprimentos[i]! > 0)) throw new Error(`cordinha: o elo ${i} tem de ter comprimento maior que zero`);
    }
    this.total = this.comprimentos.reduce((s, c) => s + c, 0);
    this.pontos = new Float64Array((comprimentos.length + 1) * 3);
    this.anterior = new Float64Array(this.pontos.length);
    this.o = { ...PADRAO, ...opcoes };
  }

  /** Quantos elos tem. */
  get elos(): number {
    return this.comprimentos.length;
  }

  /** Estica a cordinha a partir de `(ax, ay, az)` na direção `(dx, dy, dz)`, parada. */
  reiniciar(ax: number, ay: number, az: number, dx: number, dy: number, dz: number): void {
    const n = Math.hypot(dx, dy, dz);
    const ex = n > 1e-9 ? dx / n : 0;
    const ey = n > 1e-9 ? dy / n : -1;
    const ez = n > 1e-9 ? dz / n : 0;
    let acumulado = 0;
    for (let i = 0; i <= this.elos; i++) {
      if (i > 0) acumulado += this.comprimentos[i - 1]! * this.escala;
      this.pontos[i * 3] = ax + ex * acumulado;
      this.pontos[i * 3 + 1] = ay + ey * acumulado;
      this.pontos[i * 3 + 2] = az + ez * acumulado;
    }
    this.anterior.set(this.pontos);
    this.acumuladoS = 0;
    this.passos = 0;
    this.iniciada = true;
  }

  /**
   * Avança `dt` s com a âncora em `(ax, ay, az)` (onde o nó está agora, no mundo) e `(dx, dy, dz)` a direção em que a cordinha sai
   * dele (não precisa vir normalizada). A primeira chamada estica a cordinha.
   */
  atualizar(dt: number, ax: number, ay: number, az: number, dx: number, dy: number, dz: number): void {
    if (!(Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(az))) return;
    if (!this.iniciada) {
      this.reiniciar(ax, ay, az, dx, dy, dz);
      return;
    }
    const P = this.pontos;
    const A = this.anterior;
    const o = this.o;
    const nd = Math.hypot(dx, dy, dz);
    const ex = nd > 1e-9 ? dx / nd : 0;
    const ey = nd > 1e-9 ? dy / nd : -1;
    const ez = nd > 1e-9 ? dz / nd : 0;

    // teletransporte: a corrente vai junto, com a mesma forma
    const ox = ax - P[0]!;
    const oy = ay - P[1]!;
    const oz = az - P[2]!;
    if (Math.hypot(ox, oy, oz) > o.saltoMaximo * this.total * this.escala) {
      for (let i = 0; i < P.length; i += 3) {
        P[i] = P[i]! + ox;
        P[i + 1] = P[i + 1]! + oy;
        P[i + 2] = P[i + 2]! + oz;
        A[i] = A[i]! + ox;
        A[i + 1] = A[i + 1]! + oy;
        A[i + 2] = A[i + 2]! + oz;
      }
    }

    this.acumuladoS += Math.max(dt, 0);
    let passos = Math.floor(this.acumuladoS / o.passoS + 1e-9);
    if (passos > o.maxSubpassos) {
      passos = o.maxSubpassos;
      this.acumuladoS = 0;
    } else this.acumuladoS -= passos * o.passoS;
    this.passos = passos;

    const x0 = P[0]!;
    const y0 = P[1]!;
    const z0 = P[2]!;
    const h = o.passoS;
    const amortece = Math.exp(-o.amortecimento * h);
    const g = o.gravidade * h * h;
    const n = this.elos;
    for (let k = 1; k <= passos; k++) {
      const f = k / passos;
      const cx = x0 + (ax - x0) * f;
      const cy = y0 + (ay - y0) * f;
      const cz = z0 + (az - z0) * f;
      for (let i = 1; i <= n; i++) {
        const b = i * 3;
        const px = P[b]!;
        const py = P[b + 1]!;
        const pz = P[b + 2]!;
        P[b] = px + (px - A[b]!) * amortece;
        P[b + 1] = py + (py - A[b + 1]!) * amortece - g;
        P[b + 2] = pz + (pz - A[b + 2]!) * amortece;
        A[b] = px;
        A[b + 1] = py;
        A[b + 2] = pz;
      }
      P[0] = A[0] = cx;
      P[1] = A[1] = cy;
      P[2] = A[2] = cz;
      this.restringir(cx, cy, cz, ex, ey, ez);
    }
    if (passos === 0) {
      P[0] = A[0] = ax;
      P[1] = A[1] = ay;
      P[2] = A[2] = az;
      this.passadaExata();
    }
  }

  private restringir(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number): void {
    const P = this.pontos;
    const n = this.elos;
    const rigidez = this.o.rigidezDaBase;
    if (rigidez > 0) {
      const alvo = this.comprimentos[0]! * this.escala;
      P[3] = P[3]! + (cx + ex * alvo - P[3]!) * rigidez;
      P[4] = P[4]! + (cy + ey * alvo - P[4]!) * rigidez;
      P[5] = P[5]! + (cz + ez * alvo - P[5]!) * rigidez;
    }
    for (let it = 0; it < this.o.iteracoes; it++) {
      for (let i = 0; i < n; i++) {
        const a = i * 3;
        const b = a + 3;
        const dx = P[b]! - P[a]!;
        const dy = P[b + 1]! - P[a + 1]!;
        const dz = P[b + 2]! - P[a + 2]!;
        const d = Math.hypot(dx, dy, dz);
        if (d < 1e-12) continue;
        const k = (d - this.comprimentos[i]! * this.escala) / d;
        // o primeiro ponto é a âncora: só o elo seguinte se move
        const metade = i === 0 ? 1 : 0.5;
        if (i > 0) {
          P[a] = P[a]! + dx * k * metade;
          P[a + 1] = P[a + 1]! + dy * k * metade;
          P[a + 2] = P[a + 2]! + dz * k * metade;
        }
        P[b] = P[b]! - dx * k * metade;
        P[b + 1] = P[b + 1]! - dy * k * metade;
        P[b + 2] = P[b + 2]! - dz * k * metade;
      }
    }
    this.passadaExata();
  }

  /** Da âncora para a ponta, leva cada ponto à distância exata do anterior, na direção que ele já tinha. */
  private passadaExata(): void {
    const P = this.pontos;
    for (let i = 0; i < this.elos; i++) {
      const a = i * 3;
      const b = a + 3;
      let dx = P[b]! - P[a]!;
      let dy = P[b + 1]! - P[a + 1]!;
      let dz = P[b + 2]! - P[a + 2]!;
      let d = Math.hypot(dx, dy, dz);
      if (d < 1e-12) {
        dx = 0;
        dy = -1;
        dz = 0;
        d = 1;
      }
      const k = (this.comprimentos[i]! * this.escala) / d;
      P[b] = P[a]! + dx * k;
      P[b + 1] = P[a + 1]! + dy * k;
      P[b + 2] = P[a + 2]! + dz * k;
    }
  }
}
