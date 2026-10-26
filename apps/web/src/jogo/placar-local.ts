import { PLACAR_VAZIO, placarNoFio, registrarPartida, type PartidaTerminada, type PlacarGuardado, type PlacarSala } from '@sinuca/protocolo';
import type { EstadoPartida } from '@sinuca/regras';

/**
 * O placar do mesmo PC: conta as partidas seguidas com a MESMA conta que a sala usa online (`registrarPartida` do
 * protocolo). Cada jogador é pelo `id` (j1, j2...), nunca pelo apelido; mesma modalidade e mesma formação (os lados trocados
 * também; no mata-mata, as mesmas pessoas em qualquer ordem) soma, formação ou modalidade diferente abre um confronto novo e
 * o anterior vai para o histórico. Dois a quatro lados: um por equipe da partida. Vive só na memória da página, sem DOM.
 */
export class PlacarLocal {
  private guardado: PlacarGuardado = PLACAR_VAZIO;
  private ultima: EstadoPartida | null = null;

  /**
   * Conta a partida que acabou de terminar (a vencedora é `partida.vencedor`). Partida sem vencedor, ou a mesma já contada
   * (um quadro a mais do laço), não conta.
   */
  registrar(partida: EstadoPartida): void {
    if (partida.vencedor === null || partida === this.ultima) return;
    const equipes = Math.max(...partida.jogadores.map((j) => j.equipe)) + 1;
    const lados = Array.from({ length: equipes }, (_, n) => partida.jogadores.filter((j) => j.equipe === n).map((j) => ({ id: j.id, nome: j.nome })));
    this.guardado = registrarPartida(this.guardado, {
      equipes: lados as unknown as PartidaTerminada['equipes'],
      vencedor: partida.vencedor,
      modalidade: partida.config.modalidade,
    });
    this.ultima = partida;
  }

  /** Começa do zero (botão "Zerar placar"). */
  zerar(): void {
    this.guardado = PLACAR_VAZIO;
    this.ultima = null;
  }

  /** O placar como a tela o lê (o mesmo formato do `estado-sala`, sem os `id`). */
  noFio(): PlacarSala {
    return placarNoFio(this.guardado);
  }
}
