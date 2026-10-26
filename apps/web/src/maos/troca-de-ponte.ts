import type { NomeDaPonte } from './pontes';
import { poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';

const limitar = (v: number): number => Math.min(Math.max(v, 0), 1);
const suave = (t: number): number => t * t * (3 - 2 * t);

/**
 * A troca de uma ponte por outra (L29): a mão não desliza, levanta, faz um arco curto até o lugar novo e pousa. Só conta o tempo:
 * guarda a ponte e a pose de onde saiu (congelada, no quadro daquela ponte) e diz, a cada quadro, quanto da saída já foi para a
 * chegada (`mistura`) e quanto a mão está erguida (`levanta`). Quem desenha mistura os dois quadros da mão com isso. Nada aloca.
 */
export class TrocaDePonte {
  /** 0 = acabou de começar, 1 = pousou (ou nunca houve troca). */
  progresso = 1;
  /** A ponte de onde a mão saiu. */
  de: NomeDaPonte = 'v';
  /** A pose da mão quando a troca começou, no quadro da ponte `de`. */
  readonly pose: PoseDeMao = poseVaziaDeMao();
  private duracao = 0;

  /** Quanto dura a troca que começou por último (s). */
  get duracaoS(): number {
    return this.duracao;
  }

  /** Há troca em curso. */
  get ativa(): boolean {
    return this.progresso < 1;
  }

  /** Quanto da pose de saída já foi para a de chegada (0 a 1), suavizado: a mão sai devagar, passa e assenta. */
  get mistura(): number {
    return suave(this.progresso);
  }

  /** Começa uma troca de `de`, cuja pose (agora) é `pose`, em `duracaoS`. Duração 0 não faz troca. */
  iniciar(de: NomeDaPonte, pose: PoseDeMao, duracaoS: number): void {
    this.de = de;
    Object.assign(this.pose, pose);
    this.duracao = duracaoS;
    this.progresso = duracaoS > 0 ? 0 : 1;
  }

  atualizar(dt: number): void {
    if (this.progresso >= 1) return;
    this.progresso = limitar(this.progresso + Math.max(dt, 0) / this.duracao);
  }

  /** Para a troca já: a mão fica onde a ponte nova a pôs. */
  cancelar(): void {
    this.progresso = 1;
  }

  /** Quanto a mão está erguida (m): 0 na saída e na chegada, `altura` no meio do caminho. */
  levanta(altura: number): number {
    return this.ativa ? 4 * this.progresso * (1 - this.progresso) * altura : 0;
  }
}
