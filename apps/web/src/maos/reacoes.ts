import type { MetaDoPersonagem } from '@sinuca/personagens';
import type { ConfigMaos } from '../config';

/** O que a jogada fez que as mãos sentem: uma bola numerada caiu, houve falta, ou uma bola passou raspando numa caçapa. */
export type MomentoDaJogada = 'caiu' | 'falta' | 'quase';

/** O que cada rosto do balão (`momentosDaGravacao`) quer dizer para as mãos: o mesmo acontecimento da gravação. */
export const MOMENTO_DO_ROSTO = { sorriso: 'caiu', bravo: 'falta', susto: 'quase' } as const satisfies Record<string, MomentoDaJogada>;

/** Os gestos de reação do arquivo da mão. */
export type Reacao = 'joinha' | 'soco_ar' | 'tapinha' | 'quase';

/** A reação que as mãos estão fazendo. É sempre o mesmo objeto: quem lê não guarda. */
export interface ReacaoEmCurso {
  gesto: Reacao;
  /** O instante em que começou (s, no relógio de quem chama). */
  inicioS: number;
  /** Quanto dura (s): a do arquivo, no máximo `duracaoMaximaS`. */
  duracaoS: number;
  /** O ápice do gesto, em s desde o começo (o som de impacto, o toque); `undefined` se o artista não marcou. */
  picoS: number | undefined;
  /** As duas mãos reagem (a raspada); falso: só a da ponte, que está livre. */
  ambas: boolean;
}

/** Quanto vale cada momento, para quem manda na mão quando dois chegam juntos. */
const PRIORIDADE: Record<MomentoDaJogada, number> = { quase: 1, caiu: 2, falta: 3 };

/**
 * Qual reação as mãos de quem joga fazem a cada momento da jogada (L29): bola numerada que cai = joinha ou soco no ar (sorteados,
 * nunca o mesmo duas vezes seguidas); falta = tapinha; raspou na caçapa = `quase` nas duas mãos. Só decide e conta o tempo; quem
 * desenha toca o gesto e põe a mão onde ele pede. O sorteio vem de fora (`sorteio` devolve de 0 a 1), como o RNG de tudo o que é
 * jogo.
 *
 * Cada reação dura o do arquivo (no máximo `duracaoMaximaS`), não segura nada e some na próxima mira (`cancelar`). Dois momentos
 * juntos: o de mais valor fica (falta, bola que caiu, raspada). A falta que a regra acusa depois da gravação não repete o tapinha
 * da bola branca que já caiu na mesma jogada (`comecarJogada` zera isso).
 */
export class ReacoesDaJogada {
  private readonly em: ReacaoEmCurso = { gesto: 'joinha', inicioS: 0, duracaoS: 0, picoS: undefined, ambas: false };
  private tem = false;
  private prioridade = 0;
  private ultimaDoCaiu: Reacao | null = null;
  private faltaNestaJogada = false;

  constructor(
    private readonly cfg: ConfigMaos['reacoes'],
    private readonly meta: MetaDoPersonagem | null,
    private readonly sorteio: () => number,
  ) {}

  /** A reação em curso, ou `null`. */
  get atual(): Readonly<ReacaoEmCurso> | null {
    return this.tem ? this.em : null;
  }

  /** Uma jogada nova (uma gravação começou): a falta pode bater de novo. */
  comecarJogada(): void {
    this.faltaNestaJogada = false;
  }

  /** Um momento da jogada aconteceu em `agoraS`. Devolve se uma reação começou. */
  ouvir(momento: MomentoDaJogada, agoraS: number): boolean {
    this.atualizar(agoraS);
    if (momento === 'falta' && this.faltaNestaJogada) return false;
    const valor = PRIORIDADE[momento];
    if (this.tem && valor < this.prioridade) return false;
    const gesto = this.escolher(momento);
    const nota = this.meta?.gestos.get(gesto);
    this.em.gesto = gesto;
    this.em.inicioS = agoraS;
    this.em.duracaoS = nota === undefined ? this.cfg.duracaoMaximaS : Math.min(nota.duracaoS, this.cfg.duracaoMaximaS);
    this.em.picoS = nota?.picoS;
    this.em.ambas = gesto === 'quase';
    this.tem = true;
    this.prioridade = valor;
    if (momento === 'falta') this.faltaNestaJogada = true;
    if (momento === 'caiu') this.ultimaDoCaiu = gesto;
    return true;
  }

  /** Uma vez por quadro: a reação que passou da duração acaba. */
  atualizar(agoraS: number): void {
    if (this.tem && agoraS - this.em.inicioS >= this.em.duracaoS) this.tem = false;
  }

  /** Larga a reação já (a próxima mira começou). */
  cancelar(): void {
    this.tem = false;
  }

  private escolher(momento: MomentoDaJogada): Reacao {
    if (momento === 'falta') return 'tapinha';
    if (momento === 'quase') return 'quase';
    const sorteada: Reacao = this.sorteio() < 0.5 ? 'joinha' : 'soco_ar';
    if (sorteada !== this.ultimaDoCaiu) return sorteada;
    return sorteada === 'joinha' ? 'soco_ar' : 'joinha';
  }
}
