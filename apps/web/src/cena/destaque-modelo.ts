import type { IdBola } from '@sinuca/fisica';
import { bolasAlvo, type EstadoPartida } from '@sinuca/regras';

export interface ConfigDoDestaque {
  /** Quanto o destaque dura desde o começo da vez. */
  readonly duracaoS: number;
  /** Tempo para acender (e para acender a tecla segurada). */
  readonly aparecerS: number;
  /** Tempo para apagar, terminando em `duracaoS`. */
  readonly sumirS: number;
  /** Na tacada de saída todas as bolas valem: o anel só poluiria o triângulo. `false` não acende nela. */
  readonly naSaida: boolean;
}

/** O que desenhar agora. O objeto é o mesmo a cada quadro (sem alocar): leia os campos na hora. */
export interface EstadoDoDestaque {
  /** Há destaque em curso (mesmo no primeiro quadro, quando a intensidade ainda é 0). */
  visivel: boolean;
  /** De 0 a 1: vira a opacidade do anel. */
  intensidade: number;
  /** As bolas de `bolasAlvo` do jogador da vez. */
  bolas: readonly IdBola[];
}

/** Sobe em `aparecerS`, segura e desce nos últimos `sumirS`, terminando em `duracaoS`. */
export function envelopeDoDestaque(tS: number, cfg: Pick<ConfigDoDestaque, 'duracaoS' | 'aparecerS' | 'sumirS'>): number {
  if (tS <= 0 || tS >= cfg.duracaoS) return 0;
  const subindo = cfg.aparecerS > 0 ? Math.min(tS / cfg.aparecerS, 1) : 1;
  const descendo = cfg.sumirS > 0 ? Math.min((cfg.duracaoS - tS) / cfg.sumirS, 1) : 1;
  return Math.min(subindo, descendo);
}

/**
 * Decide quando e quais bolas destacar: no começo de cada vez (a vez mudou, ou a partida recomeçou) as bolas que
 * valem para quem joga (`bolasAlvo` das regras) acendem por um tempo, e a tecla de mostrar de novo as acende
 * enquanto segurada. O tempo só corre quando a mesa está liberada (sem tacada tocando, sem menu por cima).
 */
export class DestaqueDaVez {
  private vezDestacada = -1;
  private inicioMs = 0;
  private segurandoDesde: number | null = null;
  private partidaVista: EstadoPartida | null = null;
  private todasValem = false;
  private readonly estado: EstadoDoDestaque = { visivel: false, intensidade: 0, bolas: [] };

  constructor(private readonly cfg: ConfigDoDestaque) {}

  /** O último estado calculado (para o gancho de teste). */
  get estadoAtual(): Readonly<EstadoDoDestaque> {
    return this.estado;
  }

  /** Partida nova ou retrato da sala: o próximo estado conta como começo de vez. */
  reiniciar(): void {
    this.vezDestacada = -1;
    this.partidaVista = null;
  }

  /** `liberado`: dá para mirar agora (nada tocando, sem menu). `segurando`: a tecla de mostrar de novo está apertada. */
  atualizar(partida: EstadoPartida, agoraMs: number, liberado: boolean, segurando: boolean): Readonly<EstadoDoDestaque> {
    const e = this.estado;
    if (!liberado || partida.vencedor !== null) {
      this.segurandoDesde = null;
      return this.apagar(e);
    }
    if (partida !== this.partidaVista) {
      this.partidaVista = partida;
      e.bolas = bolasAlvo(partida);
      this.todasValem = partida.naMesa.length > 1 && e.bolas.length === partida.naMesa.length;
    }
    if (partida.vez !== this.vezDestacada) {
      this.vezDestacada = partida.vez;
      // Na saída, ou quando todas as bolas da mesa valem (mata-mata), o destaque fica de fora: seria só ruído. A vez conta
      // como vista, e quem segue depois dela não acende de novo.
      const semDestaque = this.todasValem || (partida.fase === 'saida' && !this.cfg.naSaida);
      this.inicioMs = semDestaque ? -Infinity : agoraMs;
    }
    const tS = (agoraMs - this.inicioMs) / 1000;
    let intensidade = envelopeDoDestaque(tS, this.cfg);
    let dentro = tS >= 0 && tS < this.cfg.duracaoS;
    if (segurando) {
      dentro = true;
      this.segurandoDesde ??= agoraMs;
      const rampa = this.cfg.aparecerS > 0 ? Math.min((agoraMs - this.segurandoDesde) / 1000 / this.cfg.aparecerS, 1) : 1;
      intensidade = Math.max(intensidade, rampa);
    } else {
      this.segurandoDesde = null;
    }
    e.intensidade = intensidade;
    e.visivel = dentro && e.bolas.length > 0;
    return e;
  }

  private apagar(e: EstadoDoDestaque): EstadoDoDestaque {
    e.visivel = false;
    e.intensidade = 0;
    return e;
  }
}
