import { MolaAmortecida } from './mola';

/** O que o olho está fazendo: parado no alvo (com microssacadas), saltando para um alvo novo, ou seguindo um alvo que anda. */
export type EstadoDoOlhar = 'fixacao' | 'sacada' | 'perseguicao';

/** Como o olho segue um alvo que anda sem parar. Ângulos em rad, velocidades em rad/s. */
export interface OpcoesDaPerseguicao {
  /** Abaixo disto o alvo conta como parado. */
  readonly velocidadeMinimaRadS: number;
  /** Acima disto o olho não consegue seguir: só acerta por sacadas. */
  readonly velocidadeMaximaRadS: number;
  /** Quanto da velocidade do alvo o olho copia (perto de 1). */
  readonly ganho: number;
  /** Quão depressa o olho fecha o erro de posição (1/s). */
  readonly ganhoDaPosicao: number;
  /** Ficando para trás mais que isto, o olho dá uma sacada de correção. */
  readonly limiteDaCorrecaoRad: number;
}

/** Como o olhar se comporta. Tudo em segundos, radianos e metros. */
export interface OpcoesDoOlhar {
  /** O tempo entre o alvo mudar e o olho começar a saltar (sorteado entre os dois). */
  readonly latenciaS: readonly [number, number];
  /** Erro de posição que ainda se aceita sem saltar. */
  readonly limiarDaSacadaRad: number;
  readonly intervaloDasMicrossacadasS: readonly [number, number];
  /** O raio, em torno do alvo, onde caem as microssacadas (0 desliga). */
  readonly amplitudeDasMicrossacadasRad: number;
  readonly perseguicao: OpcoesDaPerseguicao;
  readonly distanciaMinimaM: number;
  readonly distanciaMaximaM: number;
  /** Quão depressa os olhos convergem ou divergem quando a distância do alvo muda. */
  readonly frequenciaDaVergenciaHz: number;
  /** Uma sacada maior que isto pede um piscar. */
  readonly saltoParaPiscarRad: number;
}

/** As opções que se podem trocar (as da perseguição também em parte). */
export type OpcoesParciaisDoOlhar = Partial<Omit<OpcoesDoOlhar, 'perseguicao'>> & { readonly perseguicao?: Partial<OpcoesDaPerseguicao> };

const GRAU = Math.PI / 180;
const VOLTA = 2 * Math.PI;

const PADRAO: OpcoesDoOlhar = {
  latenciaS: [0.05, 0.12],
  limiarDaSacadaRad: 1.5 * GRAU,
  intervaloDasMicrossacadasS: [0.3, 1.1],
  amplitudeDasMicrossacadasRad: 0.4 * GRAU,
  perseguicao: { velocidadeMinimaRadS: 4 * GRAU, velocidadeMaximaRadS: 120 * GRAU, ganho: 0.95, ganhoDaPosicao: 10, limiteDaCorrecaoRad: 3 * GRAU },
  distanciaMinimaM: 0.05,
  distanciaMaximaM: 30,
  frequenciaDaVergenciaHz: 3,
  saltoParaPiscarRad: 25 * GRAU,
};

/** A duração de uma sacada: 20 ms mais 2,5 ms por grau, entre 30 e 60 ms. */
const SACADA_BASE_S = 0.02;
const SACADA_POR_RAD_S = 0.0025 / GRAU;
const SACADA_MIN_S = 0.03;
const SACADA_MAX_S = 0.06;
const MICRO_DURACAO_S = 0.015;
/** A sacada de correção mira um pouco à frente do alvo que anda (s). */
const ANTECIPACAO_S = 0.06;
const FILTRO_DA_VELOCIDADE_S = 0.05;
const BLOQUEIO_DEPOIS_DO_SALTO_S = 0.2;
const DT_MAXIMO = 0.25;

const envolver = (a: number): number => a - VOLTA * Math.floor((a + Math.PI) / VOLTA);
/** Ida e parada sem solavanco: velocidade e aceleração zero nas pontas. */
const idaEParada = (t: number): number => t * t * t * (10 + t * (-15 + 6 * t));

/** O ângulo entre as direções dos dois olhos (rad) quando eles, `separacaoM` afastados, miram um ponto a `distanciaM` à frente. */
export function anguloDeVergencia(separacaoM: number, distanciaM: number): number {
  return 2 * Math.atan2(separacaoM / 2, Math.max(distanciaM, 1e-9));
}

/**
 * O olhar de um personagem vivo: onde ele olha, no referencial da cabeça (x para a esquerda, y para cima, z para a frente, a origem
 * no meio dos dois olhos). Faz o que o olho de verdade faz:
 *
 * - **sacada**: um alvo novo (um salto, uma troca de interesse) faz o olho esperar uma latência curta e saltar em 30 a 60 ms, com o
 *   perfil de ida e parada, e fixar;
 * - **microssacadas**: na fixação, saltinhos de fração de grau em volta do alvo, a cada 0,3 a 1,1 s;
 * - **perseguição suave**: um alvo que anda sem parar é seguido sem saltar; se o olho fica para trás, uma sacada de correção o
 *   alcança (um pouco à frente); um alvo rápido demais só é acertado por sacadas;
 * - **vergência**: o olhar tem uma distância (que anda por mola, em 1/m), e cada olho mira o *ponto* do olhar: perto, os dois
 *   convergem; longe, ficam quase paralelos;
 * - **piscar**: uma sacada de mais de 25° pede um piscar (`consumirPedidoDePiscar`).
 *
 * Só conta ângulos e pontos: quem desenha leva `yaw`/`pitch`/`ponto` aos ossos. O sorteio (de 0 a 1) é injetado, nunca
 * `Math.random`: o mesmo sorteio e os mesmos alvos dão o mesmo olhar. Nada aloca depois de montado.
 */
export class OlharVivo {
  /** Para onde o olhar aponta, com as microssacadas: giro para a esquerda (rad) e elevação (rad). */
  yaw = 0;
  pitch = 0;
  /** A distância do ponto do olhar (m): a vergência. */
  distancia = 2;
  /** O ponto do olhar no referencial da cabeça (m). */
  pontoX = 0;
  pontoY = 0;
  pontoZ = 2;
  estado: EstadoDoOlhar = 'fixacao';
  /** Quantas sacadas (de alvo e de correção) já deu, e quantas microssacadas. */
  sacadas = 0;
  microssacadas = 0;

  private readonly o: OpcoesDoOlhar;
  // o olhar sem as microssacadas, e as microssacadas
  private gY = 0;
  private gP = 0;
  private mY = 0;
  private mP = 0;
  private mDeY = 0;
  private mDeP = 0;
  private mParaY = 0;
  private mParaP = 0;
  private mT = MICRO_DURACAO_S;
  private proximaMicroS: number;
  // a sacada em curso
  private sDeY = 0;
  private sDeP = 0;
  private sParaY = 0;
  private sParaP = 0;
  private sT = 0;
  private sD = SACADA_MIN_S;
  // o alvo, o quadro anterior dele e a velocidade dele (filtrada)
  private temAlvo = false;
  private pY = 0;
  private pP = 0;
  private vY = 0;
  private vP = 0;
  private bloqueioS = 0;
  private latenciaS = -1;
  private pedidoDePiscar = false;
  private readonly vergencia = new MolaAmortecida(3, 1, 0.5);

  constructor(
    private readonly sorteio: () => number,
    opcoes: OpcoesParciaisDoOlhar = {},
  ) {
    this.o = { ...PADRAO, ...opcoes, perseguicao: { ...PADRAO.perseguicao, ...opcoes.perseguicao } };
    this.vergencia.frequenciaHz = this.o.frequenciaDaVergenciaHz;
    this.proximaMicroS = this.entre(this.o.intervaloDasMicrossacadasS);
  }

  private entre(faixa: readonly [number, number]): number {
    return faixa[0] + Math.min(Math.max(this.sorteio(), 0), 1) * Math.max(faixa[1] - faixa[0], 0);
  }

  /** Volta o olhar para a frente, parado, e esquece o alvo (personagem novo em cena). */
  reiniciar(): void {
    this.gY = this.gP = this.mY = this.mP = 0;
    this.mT = MICRO_DURACAO_S;
    this.estado = 'fixacao';
    this.temAlvo = false;
    this.vY = this.vP = 0;
    this.bloqueioS = 0;
    this.latenciaS = -1;
    this.pedidoDePiscar = false;
    this.proximaMicroS = this.entre(this.o.intervaloDasMicrossacadasS);
    this.vergencia.forcar(0.5);
    this.compor();
  }

  /** O olhar pediu um piscar (uma sacada grande) desde a última vez que se perguntou? Perguntar zera. */
  consumirPedidoDePiscar(): boolean {
    const p = this.pedidoDePiscar;
    this.pedidoDePiscar = false;
    return p;
  }

  /**
   * Avança `dt` s mirando o alvo `(x, y, z)` (m, referencial da cabeça). Passe o alvo de todo quadro, parado ou andando: é a
   * comparação entre um quadro e outro que diz ao olho se ele salta, fixa ou persegue.
   */
  atualizar(dtEntrada: number, x: number, y: number, z: number): void {
    const dt = dtEntrada > 0 ? Math.min(dtEntrada, DT_MAXIMO) : 0;
    const { perseguicao: p } = this.o;
    const plano = Math.hypot(x, z);
    const n = Math.hypot(plano, y);
    const tY = n > 1e-6 ? Math.atan2(x, z) : 0;
    const tP = n > 1e-6 ? Math.atan2(y, plano) : 0;
    const tD = n > 1e-6 ? Math.min(Math.max(n, this.o.distanciaMinimaM), this.o.distanciaMaximaM) : 1;
    const cosAlvo = Math.cos(tP);

    if (!this.temAlvo) {
      this.temAlvo = true;
      this.vergencia.forcar(1 / tD);
    } else if (dt > 0) {
      const dY = envolver(tY - this.pY);
      const dP = tP - this.pP;
      if (Math.hypot(dY * cosAlvo, dP) > Math.max(p.velocidadeMaximaRadS * dt * 1.5, 2 * GRAU)) {
        // o alvo saltou (uma troca de interesse): nada de velocidade para perseguir
        this.vY = this.vP = 0;
        this.bloqueioS = BLOQUEIO_DEPOIS_DO_SALTO_S;
      } else {
        const k = 1 - Math.exp(-dt / FILTRO_DA_VELOCIDADE_S);
        this.vY += (dY / dt - this.vY) * k;
        this.vP += (dP / dt - this.vP) * k;
      }
    }
    this.pY = tY;
    this.pP = tP;
    if (this.bloqueioS > 0) this.bloqueioS -= dt;

    const velocidade = Math.hypot(this.vY * cosAlvo, this.vP);
    const dYe = envolver(tY - this.gY);
    const dPe = tP - this.gP;
    const erro = Math.hypot(dYe * Math.cos(this.gP), dPe);
    const movendo = this.bloqueioS <= 0 && velocidade >= p.velocidadeMinimaRadS && velocidade <= p.velocidadeMaximaRadS;

    if (this.estado !== 'sacada') {
      if (this.estado === 'fixacao') {
        if (movendo && erro < p.limiteDaCorrecaoRad) {
          this.estado = 'perseguicao';
          this.latenciaS = -1;
        } else if (erro > this.o.limiarDaSacadaRad) {
          if (this.latenciaS < 0) this.latenciaS = this.entre(this.o.latenciaS) - dt;
          else this.latenciaS -= dt;
          if (this.latenciaS <= 0) this.iniciarSacada(tY, tP, movendo);
        } else this.latenciaS = -1;
      } else if (this.bloqueioS > 0 || velocidade < p.velocidadeMinimaRadS * 0.5 || velocidade > p.velocidadeMaximaRadS) {
        this.estado = 'fixacao';
      } else if (erro > p.limiteDaCorrecaoRad) {
        this.iniciarSacada(tY, tP, true);
      } else {
        const k = 1 - Math.exp(-p.ganhoDaPosicao * dt);
        this.gY = envolver(this.gY + p.ganho * this.vY * dt + dYe * k);
        this.gP += p.ganho * this.vP * dt + dPe * k;
      }
    }
    if (this.estado === 'sacada') this.avancarSacada(dt);
    this.passoDaMicro(dt);

    this.vergencia.alvo = 1 / tD;
    this.vergencia.atualizar(dt);
    this.compor();
  }

  private iniciarSacada(tY: number, tP: number, comAntecipacao: boolean): void {
    const paraY = comAntecipacao ? tY + this.vY * ANTECIPACAO_S : tY;
    const paraP = Math.min(Math.max(comAntecipacao ? tP + this.vP * ANTECIPACAO_S : tP, -1.5), 1.5);
    const dY = envolver(paraY - this.gY);
    const amplitude = Math.hypot(dY * Math.cos(this.gP), paraP - this.gP);
    this.sDeY = this.gY;
    this.sDeP = this.gP;
    this.sParaY = this.gY + dY;
    this.sParaP = paraP;
    this.sT = 0;
    this.sD = Math.min(Math.max(SACADA_BASE_S + SACADA_POR_RAD_S * amplitude, SACADA_MIN_S), SACADA_MAX_S);
    this.estado = 'sacada';
    this.latenciaS = -1;
    this.sacadas++;
    if (amplitude > this.o.saltoParaPiscarRad) this.pedidoDePiscar = true;
  }

  private avancarSacada(dt: number): void {
    this.sT += dt;
    const t = Math.min(this.sT / this.sD, 1);
    const s = idaEParada(t);
    this.gY = this.sDeY + (this.sParaY - this.sDeY) * s;
    this.gP = this.sDeP + (this.sParaP - this.sDeP) * s;
    if (t >= 1) {
      this.gY = envolver(this.sParaY);
      this.gP = this.sParaP;
      this.estado = 'fixacao';
      this.proximaMicroS = this.entre(this.o.intervaloDasMicrossacadasS);
    }
  }

  private passoDaMicro(dt: number): void {
    const amplitude = this.o.amplitudeDasMicrossacadasRad;
    if (amplitude <= 0) return;
    if (this.mT < MICRO_DURACAO_S) {
      this.mT += dt;
      const s = idaEParada(Math.min(this.mT / MICRO_DURACAO_S, 1));
      this.mY = this.mDeY + (this.mParaY - this.mDeY) * s;
      this.mP = this.mDeP + (this.mParaP - this.mDeP) * s;
    }
    if (this.estado === 'sacada') return;
    this.proximaMicroS -= dt;
    if (this.proximaMicroS > 0) return;
    const angulo = VOLTA * this.sorteio();
    const raio = amplitude * Math.sqrt(this.sorteio());
    this.mDeY = this.mY;
    this.mDeP = this.mP;
    this.mParaY = raio * Math.cos(angulo);
    this.mParaP = raio * Math.sin(angulo);
    this.mT = 0;
    this.microssacadas++;
    this.proximaMicroS = this.entre(this.o.intervaloDasMicrossacadasS);
  }

  private compor(): void {
    this.yaw = this.gY + this.mY;
    this.pitch = this.gP + this.mP;
    this.distancia = Math.min(Math.max(1 / Math.max(this.vergencia.valor, 1e-9), this.o.distanciaMinimaM), this.o.distanciaMaximaM);
    const c = Math.cos(this.pitch);
    this.pontoX = this.distancia * c * Math.sin(this.yaw);
    this.pontoY = this.distancia * Math.sin(this.pitch);
    this.pontoZ = this.distancia * c * Math.cos(this.yaw);
  }

  /** A direção do olho em `(ex, ey, ez)` (no referencial da cabeça) até o ponto do olhar, escrita em `saida[so..so+2]` (não normalizada). */
  direcaoDoOlho(ex: number, ey: number, ez: number, saida: Float64Array, so: number): void {
    saida[so] = this.pontoX - ex;
    saida[so + 1] = this.pontoY - ey;
    saida[so + 2] = this.pontoZ - ez;
  }
}
