import { gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';

const CHAVE = 'sinuca.ajuda-aberta';

/**
 * Se a ajuda de controles está aberta; lembra a escolha entre visitas. Sem DOM.
 * `abertaPorPadrao` vale só até o jogador escolher (janela baixa: o cartão cobriria a mesa).
 */
export class ModeloDaAjuda {
  private abertaAgora: boolean;
  private readonly ouvintes: ((aberta: boolean) => void)[] = [];

  constructor(
    private readonly armazenamento?: ArmazenamentoMinimo | null,
    abertaPorPadrao = true,
  ) {
    const salvo = lerJson(CHAVE, armazenamento);
    this.abertaAgora = typeof salvo === 'boolean' ? salvo : abertaPorPadrao;
  }

  get aberta(): boolean {
    return this.abertaAgora;
  }

  alternar(): void {
    this.abertaAgora = !this.abertaAgora;
    gravarJson(CHAVE, this.abertaAgora, this.armazenamento);
    for (const ouvinte of [...this.ouvintes]) ouvinte(this.abertaAgora);
  }

  aoMudar(ouvinte: (aberta: boolean) => void): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      const i = this.ouvintes.indexOf(ouvinte);
      if (i >= 0) this.ouvintes.splice(i, 1);
    };
  }
}
