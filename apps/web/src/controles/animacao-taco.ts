import type { ConfigTacada } from '../config';

/**
 * O taco depois da tacada. Quando o botão é solto com o taco puxado (força pela linha), primeiro vem a batida: o taco corre
 * da puxada até a bola, cada vez mais depressa, e só no impacto (`emBatida` vira falso) as bolas devem começar a andar.
 * Depois vem o seguimento: avança um pouco, fica parado e some até a próxima mira.
 */
export class AnimacaoTaco {
  private decorrido = Infinity;
  private parado = true;
  private recuoDaBatida = 0;
  private duracaoDaBatida = 0;

  constructor(private readonly cfg: ConfigTacada) {}

  /** Distância ponta–bola (m); negativa = ponta além do ponto de impacto. */
  get recuo(): number {
    if (this.decorrido < this.duracaoDaBatida) {
      const u = this.decorrido / this.duracaoDaBatida;
      return this.recuoDaBatida * (1 - u * u);
    }
    const fracao = Math.min((this.decorrido - this.duracaoDaBatida) / this.cfg.duracaoSeguimentoS, 1);
    return -this.cfg.seguimento * (1 - (1 - fracao) ** 2);
  }

  get visivel(): boolean {
    return !this.parado && this.decorrido < this.duracaoDaBatida + this.cfg.duracaoSeguimentoS + this.cfg.permanenciaS;
  }

  /** O taco ainda corre para a bola; a gravação deve esperar. */
  get emBatida(): boolean {
    return !this.parado && this.decorrido < this.duracaoDaBatida;
  }

  /**
   * `recuoDaBatida`: onde o taco estava ao soltar (m, ponta–bola); 0 = a ponta já está na bola (empurrar), sem batida.
   * `velocidadeTaco`: a do impacto (m/s), que dá a duração da batida.
   */
  iniciar(recuoDaBatida = 0, velocidadeTaco = 0): void {
    this.decorrido = 0;
    this.parado = false;
    this.recuoDaBatida = Math.max(recuoDaBatida, 0);
    const { batidaMinS, batidaMaxS } = this.cfg.linha;
    this.duracaoDaBatida =
      this.recuoDaBatida > 0 ? Math.min(Math.max((2 * this.recuoDaBatida) / Math.max(velocidadeTaco, 1e-6), batidaMinS), batidaMaxS) : 0;
  }

  atualizar(dt: number): void {
    if (!this.parado) this.decorrido += dt;
  }

  parar(): void {
    this.parado = true;
  }
}
