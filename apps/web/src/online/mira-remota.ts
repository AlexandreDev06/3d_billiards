import { diferencaAngular, fatorDeSuavizacao } from '../controles/suavizar';

/** Mira do jogador da vez: ângulo do taco, efeito (fração do raio) e a distância da ponta à bola (m). */
export interface DadosDeMira {
  readonly angulo: number;
  readonly lateral: number;
  readonly vertical: number;
  readonly recuo: number;
  /** `true` = está passando giz agora; ausente = não está (a mesma chave da `mira` do protocolo). */
  readonly giz?: true;
}

/** ~10 mensagens por segundo: a sala aceita até 20, com folga para o resto. */
export const INTERVALO_DA_MIRA_MS = 100;

/**
 * O taco de quem está mirando na outra tela: as mensagens chegam a ~10/s e o desenho é amortecido
 * até o último alvo, para o taco deslizar em vez de pular. Escreve nos campos, sem alocar por quadro.
 */
export class MiraRemota {
  angulo = 0;
  lateral = 0;
  vertical = 0;
  recuo = 0;
  /** O jogador da vez está passando giz agora (como a última mira dele disse); não desliza, vale na hora. */
  giz = false;
  private alvo: DadosDeMira = { angulo: 0, lateral: 0, vertical: 0, recuo: 0 };
  private sincronizada = false;

  constructor(
    /** Quão depressa o desenho alcança o alvo (1/s). */
    private readonly taxa = 18,
    private readonly recuoParado = 0,
  ) {
    this.recuo = recuoParado;
    this.alvo = { angulo: 0, lateral: 0, vertical: 0, recuo: recuoParado };
  }

  /** Nova mira de quem tem a vez. A primeira depois de `esquecer` salta direto, sem deslizar de onde estava. */
  definir(mira: DadosDeMira): void {
    this.alvo = mira;
    this.giz = mira.giz === true;
    if (!this.sincronizada) this.saltar();
  }

  /** Muda o desenho já, sem deslizar (a tacada chegou: o taco vai para onde a tacada foi dada). */
  saltarPara(mira: DadosDeMira): void {
    this.alvo = mira;
    this.giz = mira.giz === true;
    this.saltar();
  }

  /** A vez mudou: a próxima mira recebida salta direto. */
  esquecer(): void {
    this.sincronizada = false;
    this.giz = false;
    this.alvo = { angulo: this.angulo, lateral: 0, vertical: 0, recuo: this.recuoParado };
  }

  atualizar(dt: number): void {
    const f = fatorDeSuavizacao(this.taxa, dt);
    this.angulo += diferencaAngular(this.angulo, this.alvo.angulo) * f;
    this.lateral += (this.alvo.lateral - this.lateral) * f;
    this.vertical += (this.alvo.vertical - this.vertical) * f;
    this.recuo += (this.alvo.recuo - this.recuo) * f;
  }

  private saltar(): void {
    this.angulo = this.alvo.angulo;
    this.lateral = this.alvo.lateral;
    this.vertical = this.alvo.vertical;
    this.recuo = this.alvo.recuo;
    this.sincronizada = true;
  }
}

/**
 * Manda a minha mira para a sala no máximo a cada `intervaloMs`, e só se mudou. Chamado uma vez por
 * quadro: o que mudou no meio do intervalo sai no primeiro quadro depois dele.
 */
export class EmissorDeMira {
  private ultimoEnvioMs = -Infinity;
  private enviada: DadosDeMira | null = null;

  constructor(
    private readonly enviar: (mira: DadosDeMira) => boolean,
    private readonly intervaloMs = INTERVALO_DA_MIRA_MS,
  ) {}

  /** A próxima mira sai de novo mesmo igual à última (vez nova, volta da queda). */
  esquecer(): void {
    this.enviada = null;
  }

  atualizar(agoraMs: number, ativo: boolean, angulo: number, lateral: number, vertical: number, recuo: number, giz = false): void {
    if (!ativo || agoraMs - this.ultimoEnvioMs < this.intervaloMs) return;
    const e = this.enviada;
    if (e && e.angulo === angulo && e.lateral === lateral && e.vertical === vertical && e.recuo === recuo && (e.giz === true) === giz) return;
    // Sem giz a chave nem existe (o esquema da sala só aceita `true`).
    const mira: DadosDeMira = giz ? { angulo, lateral, vertical, recuo, giz: true } : { angulo, lateral, vertical, recuo };
    if (!this.enviar(mira)) return;
    this.enviada = mira;
    this.ultimoEnvioMs = agoraMs;
  }
}
