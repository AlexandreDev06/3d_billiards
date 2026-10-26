/** O que a passada encadeada precisa do giz de quem está na vez. */
interface GizPassavel {
  readonly passando: boolean;
  passar(): boolean;
}

/**
 * Segurar G encadeia passadas: a que o aperto começou termina sozinha e, se G segue apertada, a próxima começa na hora,
 * até o giz ficar cheio. Soltar G não interrompe a passada em curso (ela vai até o fim); só impede a próxima.
 */
export class PassadaEncadeada {
  private ativa = false;

  get encadeando(): boolean {
    return this.ativa;
  }

  /** G foi apertada; `comecou` = o giz aceitou a passada (se recusou, não há o que encadear). */
  apertou(comecou: boolean): void {
    this.ativa = comecou;
  }

  /** G foi solta, ou a janela perdeu o foco. */
  soltou(): void {
    this.ativa = false;
  }

  /**
   * Uma vez por quadro, depois de o giz andar. Se a passada acabou e G segue apertada, começa a próxima; se não dá
   * (o giz está cheio, a tacada está armada, não é a vez), a cadeia acaba.
   */
  quadro(giz: GizPassavel, podePassar: boolean): void {
    if (this.ativa && !giz.passando) this.ativa = podePassar && giz.passar();
  }
}
