import {
  CONFIG_FISICA_PADRAO,
  mesaInicial,
  type ConfigFisica,
  type EstadoMesa,
  type Gravacao,
  type ParametrosTacada,
  type ResultadoTacada,
  type Rng,
  type simularTacada,
} from '@sinuca/fisica';
import { jogadoresDaProxima, passarVez, type ConfigRegras, type Consequencias, type EstadoPartida, type Jogador } from '@sinuca/regras';
import { aplicarConsequencias, garantirBolao } from './mesa';
import type { MotorDeRegras } from './regras';

/**
 * - `jogando`: à espera da próxima tacada;
 * - `tocando`: a tacada já foi simulada e a gravação está sendo animada;
 * - `fim`: há vencedor.
 */
export type FaseJogo = 'jogando' | 'tocando' | 'fim';

export interface DependenciasJogo {
  readonly regras: MotorDeRegras;
  /** `simularTacada`; os testes injetam simuladores falsos. */
  readonly simular: typeof simularTacada;
  readonly fisica?: ConfigFisica;
}

/** Sorteio da previsão: nunca dá miscue (mostra a tacada que dá certo) e deixa o `rng` do jogo como está. 1 fica fora de [0, 1) de propósito: `proximo() < chance` é sempre falso. */
const RNG_SEM_ACASO: Rng = { proximo: () => 1 };

/** O que a tacada causou: a partida e a mesa de depois e as consequências para o HUD. */
export interface DesfechoDaTacada {
  readonly partida: EstadoPartida;
  readonly mesa: EstadoMesa;
  readonly consequencias: Consequencias;
}

const terminou = (partida: EstadoPartida): boolean => partida.fase === 'fim' || partida.vencedor !== null;

/** Quem joga a partida seguinte: depois de um vencedor, a roda gira para quem as regras mandam sair; sem vencedor, a mesma. */
export function jogadoresDaNovaPartida(partida: EstadoPartida): readonly Jogador[] {
  return partida.vencedor !== null ? jogadoresDaProxima(partida) : partida.jogadores;
}

/**
 * Laço da partida, sem DOM nem three.js (serve ao hot-seat e, depois, ao online):
 * `tacar` simula a tacada inteira e devolve a gravação para animar; `concluir`,
 * quando a animação acaba, aplica as regras ao resultado e passa a vez.
 * Até lá `partida` e `mesa` seguem mostrando o estado de antes da tacada.
 */
export class Jogo {
  private partidaAtual: EstadoPartida;
  private mesaAtual: EstadoMesa;
  private faseAtual: FaseJogo = 'jogando';
  private pendente: DesfechoDaTacada | null = null;
  private ultimas: Consequencias | null = null;
  private antes: { readonly partida: EstadoPartida; readonly mesa: EstadoMesa } | null = null;
  private fisica: ConfigFisica;

  constructor(
    private readonly deps: DependenciasJogo,
    config: ConfigRegras,
    jogadores: readonly Jogador[],
    private readonly rng: Rng,
  ) {
    this.fisica = deps.fisica ?? CONFIG_FISICA_PADRAO;
    const { partida, arrumacao } = deps.regras.novaPartida(config, jogadores, rng);
    this.partidaAtual = partida;
    // O castigo fica fora da mesa até a saída: as regras o põem pelo `recolocar` dela.
    this.mesaAtual = mesaInicial(arrumacao, this.fisica, rng);
  }

  /**
   * O jogo no ponto em que a sala o deixou (online: retrato de quem entra ou volta). A `partida` traz
   * a config da casa e a roda de jogadores; o `rng` serve só ao miscue das tacadas deste cliente.
   */
  static restaurar(deps: DependenciasJogo, partida: EstadoPartida, mesa: EstadoMesa, rng: Rng): Jogo {
    const jogo = new Jogo(deps, partida.config, partida.jogadores, rng);
    jogo.adotar(partida, mesa);
    return jogo;
  }

  get partida(): EstadoPartida {
    return this.partidaAtual;
  }

  get mesa(): EstadoMesa {
    return this.mesaAtual;
  }

  get fase(): FaseJogo {
    return this.faseAtual;
  }

  /** Consequências da última tacada concluída; `null` antes da primeira. */
  get ultimasConsequencias(): Consequencias | null {
    return this.ultimas;
  }

  /** A partida e a mesa de antes da última tacada concluída: a transição compara com o que veio depois. `null` antes da primeira ou depois de um retrato da sala. */
  get antesDaUltimaTacada(): { readonly partida: EstadoPartida; readonly mesa: EstadoMesa } | null {
    return this.antes;
  }

  /** O que a tacada em curso vai causar (simulada aqui ou recebida da sala); `null` fora de `tocando`. */
  get desfechoPendente(): DesfechoDaTacada | null {
    return this.pendente;
  }

  /** Quem tem a vez. */
  get jogadorDaVez(): Jogador {
    return this.partidaAtual.jogadores[this.partidaAtual.vez]!;
  }

  /** Jogadores da equipe vencedora; vazio enquanto não há vencedor. */
  get vencedores(): readonly Jogador[] {
    const equipe = this.partidaAtual.vencedor;
    return equipe === null ? [] : this.partidaAtual.jogadores.filter((j) => j.equipe === equipe);
  }

  /** Troca a config de física a partir da próxima tacada (painel dev); a tacada em andamento não muda. */
  usarFisica(config: ConfigFisica): void {
    this.fisica = config;
  }

  /**
   * Simula a tacada a partir da mesa de agora sem tacar: não muda mesa, partida, fase nem o `rng`
   * do jogo (linha de previsão do painel dev). `ajuste` vale só desta chamada (ex.: `duracaoMaxima`
   * menor); o que acontece antes do corte sai igual ao da tacada real.
   */
  preverTacada(parametros: ParametrosTacada, ajuste?: Partial<ConfigFisica>): ResultadoTacada {
    if (this.faseAtual !== 'jogando') throw new Error(`preverTacada: a partida está em "${this.faseAtual}"`);
    return this.deps.simular(this.mesaAtual, parametros, RNG_SEM_ACASO, ajuste ? { ...this.fisica, ...ajuste } : this.fisica);
  }

  /** A sala é a verdade: troca partida e mesa de uma vez e cancela a tacada em curso, se houver. */
  adotar(partida: EstadoPartida, mesa: EstadoMesa): void {
    this.partidaAtual = partida;
    this.mesaAtual = mesa;
    this.pendente = null;
    this.ultimas = null;
    this.antes = null;
    this.faseAtual = terminou(partida) ? 'fim' : 'jogando';
  }

  /** Tacada de outro jogador (online): vale o desfecho que a sala mandou, depois da animação (`concluir`). */
  receberTacada(desfecho: DesfechoDaTacada): void {
    if (this.faseAtual !== 'jogando') throw new Error(`receberTacada: a partida está em "${this.faseAtual}"`);
    this.pendente = desfecho;
    this.faseAtual = 'tocando';
  }

  /** A sala confirmou (ou corrigiu) o desfecho da minha tacada, que ainda estava tocando. */
  confirmarDesfecho(desfecho: DesfechoDaTacada): void {
    if (this.faseAtual !== 'tocando') throw new Error(`confirmarDesfecho: a partida está em "${this.faseAtual}"`);
    this.pendente = desfecho;
  }

  tacar(parametros: ParametrosTacada): Gravacao {
    if (this.faseAtual !== 'jogando') throw new Error(`tacar: a partida está em "${this.faseAtual}"`);
    const resultado = this.deps.simular(this.mesaAtual, parametros, this.rng, this.fisica);
    const { partida, consequencias } = this.deps.regras.aplicarTacada(this.partidaAtual, resultado.eventos);
    const mesa = garantirBolao(aplicarConsequencias(resultado.estadoFinal, consequencias, this.fisica), this.fisica);
    this.pendente = { partida, mesa, consequencias };
    this.faseAtual = 'tocando';
    return resultado.gravacao;
  }

  /** O tempo da tacada acabou (hot-seat): a vez passa como numa tacada sem bola e sem falta, sem mexer na mesa. */
  passarAVez(): void {
    if (this.faseAtual !== 'jogando') throw new Error(`passarAVez: a partida está em "${this.faseAtual}"`);
    this.partidaAtual = passarVez(this.partidaAtual);
  }

  /** A gravação acabou de tocar: vale o que a tacada causou. */
  concluir(): Consequencias {
    const pendente = this.pendente;
    if (!pendente) throw new Error('concluir: não há tacada em andamento');
    this.pendente = null;
    this.antes = { partida: this.partidaAtual, mesa: this.mesaAtual };
    this.partidaAtual = pendente.partida;
    this.mesaAtual = pendente.mesa;
    this.ultimas = pendente.consequencias;
    this.faseAtual = terminou(pendente.partida) ? 'fim' : 'jogando';
    return pendente.consequencias;
  }
}
