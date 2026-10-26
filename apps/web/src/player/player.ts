import type { EventoTacada, Gravacao, IdBola } from '@sinuca/fisica';

export interface AlvoBola {
  readonly position: { set(x: number, y: number, z: number): unknown };
  readonly quaternion: { set(x: number, y: number, z: number, w: number): unknown };
  /** Opcional: com ele, a bola encaçapada afunda encolhendo em vez de sumir de uma vez. */
  readonly scale?: { setScalar(valor: number): unknown };
  visible: boolean;
}

export interface OpcoesPlayer {
  /** Quanto a bola leva afundando na caçapa depois do quadro em que `naMesa` vira 0 (s); 0 = some na hora. */
  readonly duracaoQuedaS?: number;
}

export interface OuvintesPlayer {
  aoEvento?: (evento: EventoTacada) => void;
  aoFim?: () => void;
}

const orientacao: number[] = [0, 0, 0, 1];

/** Slerp pelo caminho curto entre dois quaternions xyzw em arrays planos; escreve em `destino`. */
function interpolarOrientacao(destino: number[], fonte: Float32Array, a: number, b: number, t: number): void {
  const ax = fonte[a]!;
  const ay = fonte[a + 1]!;
  const az = fonte[a + 2]!;
  const aw = fonte[a + 3]!;
  let bx = fonte[b]!;
  let by = fonte[b + 1]!;
  let bz = fonte[b + 2]!;
  let bw = fonte[b + 3]!;
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cos = -cos;
  }
  let peso0 = 1 - t;
  let peso1 = t;
  if (cos < 0.9995) {
    const angulo = Math.acos(cos);
    const sen = Math.sin(angulo);
    peso0 = Math.sin((1 - t) * angulo) / sen;
    peso1 = Math.sin(t * angulo) / sen;
  }
  const x = peso0 * ax + peso1 * bx;
  const y = peso0 * ay + peso1 * by;
  const z = peso0 * az + peso1 * bz;
  const w = peso0 * aw + peso1 * bw;
  const norma = Math.hypot(x, y, z, w) || 1;
  destino[0] = x / norma;
  destino[1] = y / norma;
  destino[2] = z / norma;
  destino[3] = w / norma;
}

/**
 * Toca uma `Gravacao` pelo relógio real: lerp na posição, slerp na orientação,
 * `naMesa` do quadro anterior ao instante atual. Não conhece a física nem a cena.
 */
export class PlayerGravacao {
  private gravacao: Gravacao | null = null;
  private alvos: (AlvoBola | undefined)[] = [];
  private tempoMs = 0;
  private ultimoMs: number | null = null;
  private proximoEvento = 0;
  private velocidadeAtual = 1;
  /** Por bola da gravação: primeiro quadro fora da mesa, ou -1 se ela fica. */
  private quadroDaQueda: number[] = [];
  /** Instante (ms) em que a reprodução acaba: o fim da gravação, ou o da última queda se ela passar dele. */
  private fimMs = 0;
  private readonly duracaoQuedaS: number;

  constructor(
    private readonly bolas: ReadonlyMap<IdBola, AlvoBola>,
    private readonly ouvintes: OuvintesPlayer = {},
    opcoes: OpcoesPlayer = {},
  ) {
    this.duracaoQuedaS = opcoes.duracaoQuedaS ?? 0;
  }

  get tocando(): boolean {
    return this.gravacao !== null;
  }

  get velocidade(): number {
    return this.velocidadeAtual;
  }

  /** O instante da gravação que toca (s desde o impacto do taco), ou `null` se nenhuma toca. */
  get tempoS(): number | null {
    return this.gravacao === null ? null : this.tempoMs / 1000;
  }

  set velocidade(valor: number) {
    if (!(valor > 0)) throw new RangeError(`velocidade de reprodução inválida: ${valor}`);
    this.velocidadeAtual = valor;
  }

  /** Larga a gravação que toca, sem avisar o fim (a partida foi trocada por uma da sala). */
  parar(): void {
    this.gravacao = null;
  }

  /** Começa no primeiro `atualizar` depois desta chamada. */
  tocar(gravacao: Gravacao): void {
    this.gravacao = gravacao;
    this.alvos = gravacao.ids.map((id) => this.bolas.get(id));
    this.quadroDaQueda = gravacao.ids.map((_, i) => {
      for (let q = 0; q < gravacao.quadros; q++) if (gravacao.naMesa[q * gravacao.ids.length + i] === 0) return q;
      return -1;
    });
    this.fimMs = gravacao.duracao * 1000;
    if (this.duracaoQuedaS > 0) {
      for (const q of this.quadroDaQueda) {
        if (q >= 0) this.fimMs = Math.max(this.fimMs, (q / gravacao.frequencia + this.duracaoQuedaS) * 1000);
      }
    }
    this.tempoMs = 0;
    this.ultimoMs = null;
    this.proximoEvento = 0;
  }

  /** `agoraMs`: relógio real em ms (o `time` do laço de animação serve). */
  atualizar(agoraMs: number): void {
    const gravacao = this.gravacao;
    if (!gravacao) return;
    if (this.ultimoMs !== null) this.tempoMs += (agoraMs - this.ultimoMs) * this.velocidadeAtual;
    this.ultimoMs = agoraMs;

    const fim = this.tempoMs >= this.fimMs;
    const tempoReal = fim ? this.fimMs / 1000 : this.tempoMs / 1000;
    this.aplicarQuadro(gravacao, Math.min(tempoReal, (gravacao.quadros - 1) / gravacao.frequencia), tempoReal);

    const eventos = gravacao.eventos;
    while (this.proximoEvento < eventos.length) {
      const evento = eventos[this.proximoEvento]!;
      if (!fim && evento.t * 1000 > this.tempoMs) break;
      this.proximoEvento++;
      this.ouvintes.aoEvento?.(evento);
    }

    if (fim) {
      this.gravacao = null;
      this.ouvintes.aoFim?.();
    }
  }

  /** `tempo`: instante na gravação (no máximo o do último quadro, que pode vir depois de `duracao`); `tempoReal`: o mesmo sem o teto, que a queda usa para continuar depois do último quadro. */
  private aplicarQuadro(gravacao: Gravacao, tempo: number, tempoReal: number): void {
    const { frequencia, ids, quadros, posicoes, orientacoes, naMesa } = gravacao;
    const n = ids.length;
    const posicaoQuadro = tempo * frequencia;
    const q0 = Math.min(Math.floor(posicaoQuadro), quadros - 1);
    const q1 = Math.min(q0 + 1, quadros - 1);
    const f = Math.min(posicaoQuadro - q0, 1);
    for (let i = 0; i < n; i++) {
      const alvo = this.alvos[i];
      if (!alvo) continue;
      const a = (q0 * n + i) * 3;
      const b = (q1 * n + i) * 3;
      const naMesaAgora = naMesa[q0 * n + i] === 1;
      // Fora da mesa: afunda e encolhe durante `duracaoQuedaS`, depois some.
      let escala = 1;
      if (!naMesaAgora) {
        const desdeQueda = tempoReal - this.quadroDaQueda[i]! / frequencia;
        escala = this.duracaoQuedaS > 0 ? Math.max(0, 1 - desdeQueda / this.duracaoQuedaS) : 0;
        alvo.scale?.setScalar(escala);
      }
      alvo.position.set(
        posicoes[a]! + (posicoes[b]! - posicoes[a]!) * f,
        (posicoes[a + 1]! + (posicoes[b + 1]! - posicoes[a + 1]!) * f) * escala,
        posicoes[a + 2]! + (posicoes[b + 2]! - posicoes[a + 2]!) * f,
      );
      interpolarOrientacao(orientacao, orientacoes, (q0 * n + i) * 4, (q1 * n + i) * 4, f);
      alvo.quaternion.set(orientacao[0]!, orientacao[1]!, orientacao[2]!, orientacao[3]!);
      alvo.visible = escala > 1e-6;
    }
  }
}
