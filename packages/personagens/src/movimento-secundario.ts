import { MolaAmortecida } from './mola';
import { RuidoSuave } from './ruido';

const GRAU = Math.PI / 180;
const limitar = (v: number, maximo: number): number => Math.min(Math.max(v, -maximo), maximo);

// ---- o corpo segue os olhos -------------------------------------------------------------------------------------------------

/** Como o corpo acompanha o olhar. Ângulos em rad. */
export interface OpcoesDoCorpo {
  /** Até onde o olho gira sozinho (o `limite_graus` da meta): passando disso o corpo gira mais. */
  readonly limiteDoOlharRad: number;
  /** Que fração do giro lateral do olhar o corpo acompanha dentro do limite. */
  readonly fracaoDoGiro?: number;
  /** Que fração da elevação do olhar o corpo acompanha dentro do limite. */
  readonly fracaoDaInclinacao?: number;
  readonly giroMaximoRad?: number;
  readonly inclinacaoMaximaRad?: number;
  /** A mola do corpo: devagar, para o olho chegar primeiro. */
  readonly frequenciaHz?: number;
  readonly amortecimento?: number;
}

/**
 * A parte do ângulo `a` do olhar que o corpo assume: `fracao` dele dentro do limite dos olhos; passando do limite, o corpo gira
 * também o que sobra além do limite (assim o olho fica com `(1 - fracao) × limite` e nunca precisa passar do que o osso aguenta).
 */
function parteDoCorpo(a: number, fracao: number, limite: number, maximo: number): number {
  const m = Math.abs(a);
  const v = Math.min(fracao * m + (m > limite ? (m - limite) * (1 - fracao) : 0), maximo);
  return a < 0 ? -v : v;
}

/**
 * O corpo que segue os olhos com atraso: os olhos lideram e o corpo gira e inclina uma fração do ângulo do olhar, por mola
 * (passa um pouco do ponto e assenta). Só conta: `giro` (em torno do vertical, positivo para a esquerda) e `inclinacao` (positiva
 * olhando para cima) são o que se soma por cima da ação do corpo. Nada aloca.
 */
export class SeguidorDoCorpo {
  private readonly molaDoGiro: MolaAmortecida;
  private readonly molaDaInclinacao: MolaAmortecida;
  private readonly o: Required<OpcoesDoCorpo>;

  constructor(opcoes: OpcoesDoCorpo) {
    this.o = {
      fracaoDoGiro: 0.35,
      fracaoDaInclinacao: 0.3,
      giroMaximoRad: 40 * GRAU,
      inclinacaoMaximaRad: 14 * GRAU,
      frequenciaHz: 1.5,
      amortecimento: 0.62,
      ...opcoes,
    };
    this.molaDoGiro = new MolaAmortecida(this.o.frequenciaHz, this.o.amortecimento);
    this.molaDaInclinacao = new MolaAmortecida(this.o.frequenciaHz * 1.2, this.o.amortecimento);
  }

  /** O giro lateral do corpo agora (rad). */
  get giro(): number {
    return this.molaDoGiro.valor;
  }

  /** A inclinação do corpo agora (rad). */
  get inclinacao(): number {
    return this.molaDaInclinacao.valor;
  }

  reiniciar(): void {
    this.molaDoGiro.forcar(0);
    this.molaDaInclinacao.forcar(0);
  }

  /** `yaw` e `pitch` são os do olhar (`OlharVivo`), no referencial da cabeça sem o giro do corpo. */
  atualizar(dt: number, yaw: number, pitch: number): void {
    const { limiteDoOlharRad: limite, fracaoDoGiro, fracaoDaInclinacao, giroMaximoRad, inclinacaoMaximaRad } = this.o;
    this.molaDoGiro.alvo = parteDoCorpo(yaw, fracaoDoGiro, limite, giroMaximoRad);
    this.molaDaInclinacao.alvo = parteDoCorpo(pitch, fracaoDaInclinacao, limite, inclinacaoMaximaRad);
    this.molaDoGiro.atualizar(dt);
    this.molaDaInclinacao.atualizar(dt);
  }
}

// ---- a gelatina do corpo ----------------------------------------------------------------------------------------------------

/** Como o corpo balança nas acelerações. */
export interface OpcoesDaGelatina {
  readonly frequenciaHz: number;
  readonly amortecimento: number;
  /** Quanto o corpo estica (fração) por m/s² de aceleração vertical, para o lado contrário ao dela. */
  readonly ganhoVertical: number;
  /** O teto do esticar e do achatar (fração). */
  readonly maximo: number;
  /** Quanto o corpo pende (rad) por m/s² de aceleração horizontal, para o lado contrário. */
  readonly ganhoDaInclinacao: number;
  readonly inclinacaoMaximaRad: number;
  /** A suavização da aceleração medida (s): tira o tremor da conta posição a posição. */
  readonly filtroS: number;
  /** Aceleração acima disto (m/s²) é pancada de medida e é cortada. */
  readonly aceleracaoMaxima: number;
  /** Um deslocamento de um quadro maior que isto (m) é teletransporte, não movimento. */
  readonly saltoMaximoM: number;
}

const GELATINA_PADRAO: OpcoesDaGelatina = {
  frequenciaHz: 3.4,
  amortecimento: 0.3,
  ganhoVertical: 0.01,
  maximo: 0.2,
  ganhoDaInclinacao: 0.005,
  inclinacaoMaximaRad: 0.18,
  filtroS: 0.04,
  aceleracaoMaxima: 60,
  saltoMaximoM: 0.5,
};

/**
 * A gelatina do corpo (squash and stretch): o corpo mede a própria aceleração (a posição dele no mundo, quadro a quadro) e uma
 * mola o achata ao arrancar para cima, o estica ao parar, e o faz pender para trás ao sair de lado, sempre conservando o volume
 * (`escalaY × escalaXZ² = 1`). Por cima de qualquer ação: quem desenha multiplica a escala do osso do corpo por `escalaY` e
 * `escalaXZ` e o inclina por `inclinacaoX`/`inclinacaoZ` (o deslocamento da parte de cima, nos eixos x e z do mundo).
 * Um teletransporte (o balão que surge em outro lugar) não é movimento: a medida recomeça. Nada aloca.
 */
export class GelatinaDoCorpo {
  /** Fração de esticar (positiva) ou achatar (negativa) na vertical. */
  esticar = 0;
  escalaY = 1;
  escalaXZ = 1;
  inclinacaoX = 0;
  inclinacaoZ = 0;

  private readonly o: OpcoesDaGelatina;
  private readonly molaVertical: MolaAmortecida;
  private readonly molaX: MolaAmortecida;
  private readonly molaZ: MolaAmortecida;
  private medido = false;
  private px = 0;
  private py = 0;
  private pz = 0;
  private temVelocidade = false;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private ax = 0;
  private ay = 0;
  private az = 0;

  constructor(opcoes: Partial<OpcoesDaGelatina> = {}) {
    this.o = { ...GELATINA_PADRAO, ...opcoes };
    this.molaVertical = new MolaAmortecida(this.o.frequenciaHz, this.o.amortecimento);
    this.molaX = new MolaAmortecida(this.o.frequenciaHz * 0.8, this.o.amortecimento);
    this.molaZ = new MolaAmortecida(this.o.frequenciaHz * 0.8, this.o.amortecimento);
  }

  reiniciar(): void {
    this.molaVertical.forcar(0);
    this.molaX.forcar(0);
    this.molaZ.forcar(0);
    this.medido = false;
    this.temVelocidade = false;
    this.ax = this.ay = this.az = 0;
    this.compor();
  }

  /** `x`, `y`, `z`: onde o corpo está no mundo neste quadro (m), já com o movimento da ação e do jogo. */
  atualizar(dt: number, x: number, y: number, z: number): void {
    const o = this.o;
    if (!this.medido || Math.hypot(x - this.px, y - this.py, z - this.pz) > o.saltoMaximoM) {
      this.medido = true;
      this.temVelocidade = false;
      this.ax = this.ay = this.az = 0;
    } else if (dt > 0) {
      const passo = Math.min(Math.max(dt, 1 / 240), 0.1);
      const vx = (x - this.px) / passo;
      const vy = (y - this.py) / passo;
      const vz = (z - this.pz) / passo;
      if (this.temVelocidade) {
        const k = 1 - Math.exp(-passo / o.filtroS);
        this.ax += (limitar((vx - this.vx) / passo, o.aceleracaoMaxima) - this.ax) * k;
        this.ay += (limitar((vy - this.vy) / passo, o.aceleracaoMaxima) - this.ay) * k;
        this.az += (limitar((vz - this.vz) / passo, o.aceleracaoMaxima) - this.az) * k;
      }
      this.vx = vx;
      this.vy = vy;
      this.vz = vz;
      this.temVelocidade = true;
    }
    this.px = x;
    this.py = y;
    this.pz = z;
    this.molaVertical.alvo = limitar(-o.ganhoVertical * this.ay, o.maximo);
    this.molaX.alvo = limitar(-o.ganhoDaInclinacao * this.ax, o.inclinacaoMaximaRad);
    this.molaZ.alvo = limitar(-o.ganhoDaInclinacao * this.az, o.inclinacaoMaximaRad);
    this.molaVertical.atualizar(dt);
    this.molaX.atualizar(dt);
    this.molaZ.atualizar(dt);
    this.compor();
  }

  private compor(): void {
    this.esticar = limitar(this.molaVertical.valor, this.o.maximo);
    this.escalaY = 1 + this.esticar;
    this.escalaXZ = 1 / Math.sqrt(this.escalaY);
    this.inclinacaoX = limitar(this.molaX.valor, this.o.inclinacaoMaximaRad);
    this.inclinacaoZ = limitar(this.molaZ.valor, this.o.inclinacaoMaximaRad);
  }
}

// ---- flutuar ----------------------------------------------------------------------------------------------------------------

/** Quanto e quão depressa o personagem parado deriva. */
export interface OpcoesDoFlutuar {
  /** O quanto sobe, desce e anda de lado (m). */
  readonly amplitudeM: number;
  /** O quanto balança (rad). */
  readonly amplitudeRad: number;
  /** A rapidez da deriva mais lenta (Hz). */
  readonly frequenciaHz: number;
  /** Quanto o relógio da ação parada acelera e freia (fração de 1): é o que a faz nunca repetir igual. */
  readonly variacaoDoRitmo: number;
}

/**
 * A deriva lenta do personagem parado, por ruído semeado (nunca um laço): um deslocamento e um balanço pequenos por cima da ação
 * parada, e um `ritmo` (em volta de 1) que acelera e freia o relógio dela. `peso` (0 a 1) é o peso da parada: com outra ação por
 * cima a deriva some junto. Nada aloca.
 */
export class Flutuar {
  x = 0;
  y = 0;
  z = 0;
  giroX = 0;
  giroZ = 0;
  /** O quanto o relógio da ação parada corre em relação ao normal (1 = normal). */
  ritmo = 1;

  private tempoS = 0;
  private readonly o: OpcoesDoFlutuar;
  private readonly ruidoX: RuidoSuave;
  private readonly ruidoY: RuidoSuave;
  private readonly ruidoZ: RuidoSuave;
  private readonly ruidoGiroX: RuidoSuave;
  private readonly ruidoGiroZ: RuidoSuave;
  private readonly ruidoRitmo: RuidoSuave;

  constructor(sorteio: () => number, opcoes: Partial<OpcoesDoFlutuar> = {}) {
    this.o = { amplitudeM: 0.004, amplitudeRad: 0.025, frequenciaHz: 0.22, variacaoDoRitmo: 0.15, ...opcoes };
    const f = this.o.frequenciaHz;
    this.ruidoX = new RuidoSuave(sorteio, f * 0.7);
    this.ruidoY = new RuidoSuave(sorteio, f);
    this.ruidoZ = new RuidoSuave(sorteio, f * 0.8);
    this.ruidoGiroX = new RuidoSuave(sorteio, f * 0.9);
    this.ruidoGiroZ = new RuidoSuave(sorteio, f * 1.1);
    this.ruidoRitmo = new RuidoSuave(sorteio, f * 0.6, 2);
  }

  atualizar(dt: number, peso: number): void {
    this.tempoS += Math.max(dt, 0);
    const t = this.tempoS;
    const w = Math.min(Math.max(peso, 0), 1);
    const { amplitudeM: m, amplitudeRad: r } = this.o;
    // `+ 0` troca um -0 por 0
    this.x = m * 0.6 * this.ruidoX.valor(t) * w + 0;
    this.y = m * this.ruidoY.valor(t) * w + 0;
    this.z = m * 0.6 * this.ruidoZ.valor(t) * w + 0;
    this.giroX = r * this.ruidoGiroX.valor(t) * w + 0;
    this.giroZ = r * this.ruidoGiroZ.valor(t) * w + 0;
    this.ritmo = 1 + this.o.variacaoDoRitmo * this.ruidoRitmo.valor(t);
  }
}
