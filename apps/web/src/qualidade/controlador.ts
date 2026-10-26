import type { QualidadeSalva } from './preferencia';
import { nivelAbaixo, nivelInicial, type NivelDeQualidade, type PreferenciaDeQualidade } from './perfis';

export type MotivoDaMudanca = 'inicio' | 'escolha' | 'queda';

export interface OpcoesDoControlador {
  readonly preferencia: PreferenciaDeQualidade;
  /** O renderizador é de software (SwiftShader, llvmpipe...). */
  readonly software: boolean;
  /** Até onde o automático já desceu em visitas anteriores. */
  readonly rebaixada: NivelDeQualidade | null;
  /** FPS médio de uma janela abaixo disto faz o automático descer um nível. */
  readonly fpsMinimo: number;
  readonly janelaMs: number;
  /** Depois de abrir ou de trocar de nível este tempo não conta. */
  readonly aquecimentoMs: number;
  /** O nível mudou (e também o de abertura, com `motivo: 'inicio'`); `fps` só vem na queda. */
  readonly aoMudar: (nivel: NivelDeQualidade, motivo: MotivoDaMudanca, fps?: number) => void;
  /** Para lembrar neste computador: a escolha e até onde o automático desceu. */
  readonly salvar: (salva: QualidadeSalva) => void;
}

/** Um intervalo entre quadros maior que isto é a aba parada ou o computador suspenso, não FPS baixo. */
const PAUSA_MS = 5000;

/**
 * Decide o nível de qualidade. Com um nível escolhido ele não faz nada; no automático abre pelo renderizador
 * (software → baixa) e mede o FPS em janelas seguidas: janela abaixo do mínimo desce um nível e o novo nível
 * ganha um novo aquecimento. Puro: o relógio vem dos quadros (`aoQuadro`).
 */
export class ControladorDeQualidade {
  private preferenciaAtual: PreferenciaDeQualidade;
  private nivelAtual: NivelDeQualidade;
  private rebaixadaAtual: NivelDeQualidade | null;
  /** Instante em que a medida (já aquecida) pode começar; `-1` até o primeiro quadro. */
  private fimDoAquecimento = -1;
  private inicioDaJanela = -1;
  private quadrosNaJanela = 0;
  private ultimoQuadro = -1;
  private pendenteDeAquecimento = true;

  constructor(private readonly o: OpcoesDoControlador) {
    this.preferenciaAtual = o.preferencia;
    this.rebaixadaAtual = o.rebaixada;
    this.nivelAtual = nivelInicial({ preferencia: o.preferencia, software: o.software, rebaixada: o.rebaixada });
  }

  get nivel(): NivelDeQualidade {
    return this.nivelAtual;
  }

  get preferencia(): PreferenciaDeQualidade {
    return this.preferenciaAtual;
  }

  get rebaixada(): NivelDeQualidade | null {
    return this.rebaixadaAtual;
  }

  /** Está medindo o FPS (automático, e ainda há para onde descer)? */
  get vigiando(): boolean {
    return this.preferenciaAtual === 'auto' && nivelAbaixo(this.nivelAtual) !== null;
  }

  /** Avisa o nível de abertura: chame uma vez, depois de ligar `aoMudar` ao desenho. */
  iniciar(): void {
    this.o.aoMudar(this.nivelAtual, 'inicio');
  }

  /** O jogador escolheu na tela de configurações. "Automática" esquece a queda lembrada e decide de novo. */
  definirPreferencia(preferencia: PreferenciaDeQualidade): void {
    this.preferenciaAtual = preferencia;
    if (preferencia === 'auto') this.rebaixadaAtual = null;
    const novo = nivelInicial({ preferencia, software: this.o.software, rebaixada: this.rebaixadaAtual });
    this.o.salvar({ preferencia, rebaixada: this.rebaixadaAtual });
    this.reiniciarMedida();
    if (novo !== this.nivelAtual) {
      this.nivelAtual = novo;
      this.o.aoMudar(novo, 'escolha');
    }
  }

  /** A aba foi escondida ou voltou: o que vem a seguir não é FPS de jogo. */
  reiniciarMedida(): void {
    this.fimDoAquecimento = -1;
    this.inicioDaJanela = -1;
    this.quadrosNaJanela = 0;
    this.ultimoQuadro = -1;
    this.pendenteDeAquecimento = true;
  }

  /** Uma vez por quadro, com o relógio do quadro (ms). */
  aoQuadro(agoraMs: number): void {
    if (!this.vigiando) return;
    if (this.ultimoQuadro >= 0 && agoraMs - this.ultimoQuadro > PAUSA_MS) this.reiniciarMedida();
    this.ultimoQuadro = agoraMs;
    if (this.pendenteDeAquecimento) {
      this.pendenteDeAquecimento = false;
      this.fimDoAquecimento = agoraMs + this.o.aquecimentoMs;
      return;
    }
    if (agoraMs < this.fimDoAquecimento) return;
    if (this.inicioDaJanela < 0) {
      this.inicioDaJanela = agoraMs;
      this.quadrosNaJanela = 0;
      return;
    }
    this.quadrosNaJanela++;
    const decorrido = agoraMs - this.inicioDaJanela;
    if (decorrido < this.o.janelaMs) return;
    const fps = (this.quadrosNaJanela * 1000) / decorrido;
    this.inicioDaJanela = -1;
    this.quadrosNaJanela = 0;
    if (fps >= this.o.fpsMinimo) return;
    this.descer(fps);
  }

  private descer(fps: number): void {
    const abaixo = nivelAbaixo(this.nivelAtual);
    if (abaixo === null) return;
    this.nivelAtual = abaixo;
    this.rebaixadaAtual = abaixo;
    this.o.salvar({ preferencia: 'auto', rebaixada: this.rebaixadaAtual });
    this.pendenteDeAquecimento = true;
    this.o.aoMudar(abaixo, 'queda', fps);
  }
}
