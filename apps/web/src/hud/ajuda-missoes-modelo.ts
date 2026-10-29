import type { MissoesNaTela } from '../online/missoes-modelo';

/** De quanto em quanto tempo a seção aberta confere o relógio (ms): o "faltam N min" muda de minuto em minuto. */
export const INTERVALO_DA_SECAO_MS = 15_000;

export interface DependenciasDaSecao {
  /** O que a seção mostra em `agoraMs` (o progresso da carteira e o aviso de onde se joga). */
  readonly missoes: (agoraMs: number) => MissoesNaTela;
  /** Escreve o modelo na tela. */
  readonly desenhar: (modelo: MissoesNaTela) => void;
  /** O dia virou com a seção aberta: a carteira precisa ser lida de novo. */
  readonly aoPrecisarDeMissoes: () => void;
  /** Verdadeiro enquanto uma tacada ainda toca: o progresso novo espera as bolas pararem, como os avisos de missão. */
  readonly segurar?: () => boolean;
}

/**
 * Quando a seção "Missões do dia" do H se redesenha (L37). Sem DOM nem relógio próprio: quem usa passa `agoraMs`.
 * Fechada, nunca desenha. Aberta, desenha ao abrir, quando o quadro ou o lugar mudam (esperando o fim da tacada que toca) e a
 * cada `INTERVALO_DA_SECAO_MS`. Se o dia virou desde o último desenho, pede a leitura da carteira.
 */
export class SecaoDeMissoes {
  private abertaAgora = false;
  private pendente = false;
  private ultimoDesenhoMs = Number.NEGATIVE_INFINITY;
  private fimMostradoMs = 0;
  private desenhosFeitos = 0;

  constructor(private readonly deps: DependenciasDaSecao) {}

  get aberta(): boolean {
    return this.abertaAgora;
  }

  /** Quantas vezes a seção foi desenhada (prova de que fechada não redesenha). */
  get desenhos(): number {
    return this.desenhosFeitos;
  }

  /** Abre ou fecha junto com a ajuda. Abrir desenha na hora, com o que vale agora, mesmo com uma tacada tocando. */
  definirAberta(aberta: boolean, agoraMs: number): void {
    if (aberta === this.abertaAgora) return;
    this.abertaAgora = aberta;
    if (aberta) this.desenhar(agoraMs);
  }

  /** O quadro da carteira ou o lugar onde se joga mudou: aberta, desenha na hora, ou quando a tacada que toca acabar. */
  mudou(agoraMs: number): void {
    if (!this.abertaAgora) return;
    if (this.deps.segurar?.() === true) this.pendente = true;
    else this.desenhar(agoraMs);
  }

  /** Uma vez por quadro (custo fixo, nada alocado): solta o que esperava a tacada e, a cada 15 s, confere o relógio. */
  tic(agoraMs: number): void {
    if (!this.abertaAgora) return;
    if (this.pendente) {
      if (this.deps.segurar?.() !== true) this.desenhar(agoraMs);
      return;
    }
    if (agoraMs - this.ultimoDesenhoMs >= INTERVALO_DA_SECAO_MS) this.desenhar(agoraMs);
  }

  private desenhar(agoraMs: number): void {
    const virou = this.fimMostradoMs !== 0 && agoraMs >= this.fimMostradoMs;
    const modelo = this.deps.missoes(agoraMs);
    this.fimMostradoMs = modelo.fimMs;
    this.ultimoDesenhoMs = agoraMs;
    this.pendente = false;
    this.desenhosFeitos++;
    this.deps.desenhar(modelo);
    if (virou) this.deps.aoPrecisarDeMissoes();
  }
}
