/** Como a atenção reparte o olhar. Tempos em segundos. */
export interface OpcoesDaAtencao {
  /** Quanto fica no ponto principal antes de poder olhar outra coisa. */
  readonly fixarS: readonly [number, number];
  /** Quanto dura uma olhada em outro ponto. */
  readonly espiarS: readonly [number, number];
  /** A chance (0 a 1) de, acabada uma fixação, olhar outra coisa (senão fixa de novo). */
  readonly chanceDeEspiar: number;
  /** Um ponto cuja prioridade é pelo menos esta vez a do ponto de agora o interrompe na hora. */
  readonly fatorDeInterrupcao: number;
}

const PADRAO: OpcoesDaAtencao = { fixarS: [1.8, 4.5], espiarS: [0.5, 1.3], chanceDeEspiar: 0.75, fatorDeInterrupcao: 1.8 };

/**
 * No que o personagem presta atenção. O jogo dá pontos de interesse com prioridade (`definir`, todo quadro se o ponto anda) e a
 * atenção escolhe com tempo natural: fixa o mais importante por alguns segundos, olha outra coisa (sorteada na proporção da
 * prioridade) por uma fração de segundo e volta. Um ponto que passa a valer 1,8 vez o de agora (a bola que começa a rolar)
 * interrompe na hora. "A câmera" é só mais um ponto, de prioridade baixa: o olhar nos olhos do jogador de vez em quando é o que dá
 * carisma. Os pontos ficam em `capacidade` vagas fixas; o sorteio (0 a 1) é injetado. Nada aloca depois de montada.
 *
 * Só escolhe: quem olha (`OlharVivo`) leva o `x`, `y`, `z` escolhido (no referencial que o jogo usar) até o olho.
 */
export class Atencao {
  /** A vaga do ponto de agora, ou -1. */
  id = -1;
  x = 0;
  y = 0;
  z = 0;
  /** Está olhando outra coisa que não o ponto principal. */
  espiando = false;

  private readonly prioridade: Float64Array;
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly pz: Float64Array;
  private restanteS = 0;
  /** O principal (e quanto valia) quando o ponto de agora foi escolhido: só uma mudança nele interrompe uma olhada. */
  private referencia = -1;
  private prioridadeDaReferencia = 0;
  private readonly o: OpcoesDaAtencao;

  constructor(
    private readonly sorteio: () => number,
    readonly capacidade = 8,
    opcoes: Partial<OpcoesDaAtencao> = {},
    /** A vaga que prende o olhar: com ponto nela, a atenção fica nela o tempo todo (não espia, não sorteia), até ela ser tirada. -1: nenhuma. */
    readonly vagaQuePrende = -1,
  ) {
    this.prioridade = new Float64Array(capacidade);
    this.px = new Float64Array(capacidade);
    this.py = new Float64Array(capacidade);
    this.pz = new Float64Array(capacidade);
    this.o = { ...PADRAO, ...opcoes };
  }

  /** Já escolheu um ponto (depois do primeiro `atualizar` com algum ponto dado). */
  get temAlvo(): boolean {
    return this.id >= 0;
  }

  /** Há algum ponto dado, escolhido ou não. */
  get temPontos(): boolean {
    for (let i = 0; i < this.capacidade; i++) if (this.prioridade[i]! > 0) return true;
    return false;
  }

  private conferir(id: number): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.capacidade) throw new Error(`atenção: a vaga ${id} não existe (0 a ${this.capacidade - 1})`);
  }

  /** Põe (ou muda) o ponto da vaga `id`. Prioridade zero ou negativa tira o ponto. */
  definir(id: number, x: number, y: number, z: number, prioridade: number): void {
    this.conferir(id);
    this.px[id] = x;
    this.py[id] = y;
    this.pz[id] = z;
    this.prioridade[id] = prioridade > 0 ? prioridade : 0;
  }

  remover(id: number): void {
    this.conferir(id);
    this.prioridade[id] = 0;
  }

  limpar(): void {
    this.prioridade.fill(0);
    this.id = -1;
    this.espiando = false;
    this.restanteS = 0;
    this.referencia = -1;
  }

  private entre(faixa: readonly [number, number]): number {
    return faixa[0] + Math.min(Math.max(this.sorteio(), 0), 1) * Math.max(faixa[1] - faixa[0], 0);
  }

  private principal(): number {
    let melhor = -1;
    for (let i = 0; i < this.capacidade; i++) if (this.prioridade[i]! > 0 && (melhor < 0 || this.prioridade[i]! > this.prioridade[melhor]!)) melhor = i;
    return melhor;
  }

  private fixarEm(id: number): void {
    this.id = id;
    this.espiando = false;
    this.restanteS = this.entre(this.o.fixarS);
    this.referencia = id;
    this.prioridadeDaReferencia = this.prioridade[id]!;
  }

  /** Sorteia, na proporção da prioridade, um ponto que não é `principal`; -1 se não há outro. */
  private outro(principal: number): number {
    let total = 0;
    for (let i = 0; i < this.capacidade; i++) if (i !== principal) total += this.prioridade[i]!;
    if (total <= 0) return -1;
    let sorteado = Math.min(Math.max(this.sorteio(), 0), 1) * total;
    let ultimo = -1;
    for (let i = 0; i < this.capacidade; i++) {
      if (i === principal || this.prioridade[i]! <= 0) continue;
      ultimo = i;
      sorteado -= this.prioridade[i]!;
      if (sorteado < 0) return i;
    }
    return ultimo;
  }

  /** O principal agora é outro, ou ficou muito mais importante, e vale pelo menos `fatorDeInterrupcao` vezes o ponto de agora? */
  private interrompe(principal: number): boolean {
    if (principal === this.id) return false;
    const { fatorDeInterrupcao: fator } = this.o;
    const mudou = principal !== this.referencia || this.prioridade[principal]! >= fator * this.prioridadeDaReferencia;
    return mudou && this.prioridade[principal]! >= fator * this.prioridade[this.id]!;
  }

  atualizar(dt: number): void {
    const presa = this.vagaQuePrende;
    if (presa >= 0 && this.prioridade[presa]! > 0) {
      // olhar preso: nada de espiar outro ponto nem de sorteio; ao soltar, a atenção recomeça do principal
      this.id = presa;
      this.espiando = false;
      this.restanteS = 0;
      this.referencia = presa;
      this.prioridadeDaReferencia = this.prioridade[presa]!;
      this.x = this.px[presa]!;
      this.y = this.py[presa]!;
      this.z = this.pz[presa]!;
      return;
    }
    const principal = this.principal();
    if (principal < 0) {
      this.id = -1;
      this.espiando = false;
      this.restanteS = 0;
      return;
    }
    if (this.id < 0 || this.prioridade[this.id]! <= 0) this.fixarEm(principal);
    else if (this.interrompe(principal)) this.fixarEm(principal);
    else {
      this.restanteS -= Math.max(dt, 0);
      if (this.restanteS <= 0) {
        if (this.espiando || this.id !== principal) this.fixarEm(principal);
        else if (this.sorteio() < this.o.chanceDeEspiar) {
          const outro = this.outro(principal);
          if (outro < 0) this.fixarEm(principal);
          else {
            this.id = outro;
            this.espiando = true;
            this.restanteS = this.entre(this.o.espiarS);
            this.referencia = principal;
            this.prioridadeDaReferencia = this.prioridade[principal]!;
          }
        } else this.fixarEm(principal);
      }
    }
    this.x = this.px[this.id]!;
    this.y = this.py[this.id]!;
    this.z = this.pz[this.id]!;
  }
}
