import type { ConfigTacada } from '../config';
import { curvaDeForca } from './forca';
import { fracaoDaPuxada, velocidadeDaLinha, type ControleForca } from './forca-linha';
import { JanelaDeVelocidade } from './janela-velocidade';

export type FaseTacada = 'ociosa' | 'travando' | 'armada' | 'animando';

/**
 * Máquina da tacada pelo mouse, sem DOM: a camada de eventos chama `pressionar`, `travou`, `mover`, `soltar` e `cancelar`.
 *
 * Dois controles de força (`ControleForca`):
 * - `empurrar`: puxa e empurra; o impacto é quando `mover` devolve a velocidade (a da curva de força, pela velocidade do mouse);
 * - `linha`: puxa até a barra marcar a força e solta; o impacto é quando `soltar` devolve a velocidade (a da linha de força,
 *   pelo tamanho da puxada), ou `null` se a puxada ficou abaixo do mínimo (cancela). Empurrar de volta só diminui a força.
 */
export class Tacada {
  private faseAtual: FaseTacada = 'ociosa';
  private recuoAtual: number;
  private puxadaAtual = 0;
  private recuoSolto = 0;
  private readonly janela: JanelaDeVelocidade;

  constructor(
    private cfg: ConfigTacada,
    private controleAtual: ControleForca = 'empurrar',
  ) {
    this.recuoAtual = cfg.recuoInicial;
    this.janela = new JanelaDeVelocidade(cfg.janelaVelocidadeMs);
  }

  /** Troca a curva de força (painel dev) e as sensibilidades do jogador; a janela de velocidade segue a do construtor. */
  configurar(cfg: ConfigTacada): void {
    this.cfg = cfg;
  }

  get fase(): FaseTacada {
    return this.faseAtual;
  }

  get controle(): ControleForca {
    return this.controleAtual;
  }

  /** Muda o controle de força; uma tacada em curso (travando ou armada) é cancelada, a animação não. */
  definirControle(controle: ControleForca): void {
    if (controle === this.controleAtual) return;
    this.cancelar();
    this.controleAtual = controle;
  }

  /** Distância da ponta do taco à superfície da bola (m). */
  get recuo(): number {
    return this.recuoAtual;
  }

  /** Força pela linha: quanto da barra está puxado (0 a 1); 0 no controle `empurrar` e fora da mira. */
  get fracaoDaForca(): number {
    return this.controleAtual === 'linha' && this.faseAtual === 'armada' ? fracaoDaPuxada(this.puxadaAtual, this.cfg) : 0;
  }

  /** Onde o taco estava (m, ponta–bola) quando o botão foi solto e deu a tacada pela linha; 0 no `empurrar`. Vale até a próxima tacada. */
  get recuoDaBatida(): number {
    return this.recuoSolto;
  }

  /** Botão esquerdo apertado. `false` se não pode começar (animando ou já em curso). */
  pressionar(): boolean {
    if (this.faseAtual !== 'ociosa') return false;
    this.faseAtual = 'travando';
    return true;
  }

  /** O Pointer Lock foi concedido. */
  travou(): void {
    if (this.faseAtual !== 'travando') return;
    this.faseAtual = 'armada';
    this.recuoAtual = this.cfg.recuoInicial;
    this.puxadaAtual = 0;
    this.recuoSolto = 0;
    this.janela.reiniciar();
  }

  /**
   * Movimento vertical do mouse (px; + = para o jogador = recuar) no instante `tempoMs`.
   * No `empurrar`, devolve a velocidade do taco (m/s) se a ponta chegou na bola; senão `null`. Na `linha` só mexe na
   * puxada e devolve sempre `null`: quem dá a tacada é `soltar`.
   */
  mover(pixelsY: number, tempoMs: number): number | null {
    if (this.faseAtual !== 'armada') return null;
    if (this.controleAtual === 'linha') {
      const cheia = this.cfg.recuoMaximo - this.cfg.recuoInicial;
      this.puxadaAtual = Math.min(Math.max(this.puxadaAtual + pixelsY * this.cfg.metrosPorPixel, 0), cheia);
      this.recuoAtual = this.cfg.recuoInicial + this.puxadaAtual;
      return null;
    }
    const bruto = this.recuoAtual + pixelsY * this.cfg.metrosPorPixel;
    const posicao = Math.min(bruto, this.cfg.recuoMaximo);
    this.janela.registrar(tempoMs, posicao);
    if (posicao > 0) {
      this.recuoAtual = posicao;
      return null;
    }
    const velocidade = curvaDeForca(this.janela.velocidade(tempoMs), this.cfg);
    this.recuoAtual = 0;
    this.faseAtual = 'animando';
    return velocidade;
  }

  /**
   * O botão foi solto. Na `linha`, dá a tacada com a força da barra e devolve a velocidade do taco (m/s), ou cancela e
   * devolve `null` se a barra está abaixo do mínimo. No `empurrar` soltar antes do impacto é cancelar: devolve `null`.
   */
  soltar(): number | null {
    if (this.faseAtual !== 'armada') return null;
    if (this.controleAtual !== 'linha') {
      this.cancelar();
      return null;
    }
    const fracao = fracaoDaPuxada(this.puxadaAtual, this.cfg);
    if (fracao < this.cfg.linha.fracaoMinima) {
      this.cancelar();
      return null;
    }
    this.recuoSolto = this.recuoAtual;
    this.recuoAtual = 0;
    this.puxadaAtual = 0;
    this.faseAtual = 'animando';
    return velocidadeDaLinha(fracao, this.cfg);
  }

  /** Soltou o botão sem tacar, perdeu o Pointer Lock ou a janela: nada de tacada. Não mexe em `animando`. */
  cancelar(): void {
    if (this.faseAtual !== 'travando' && this.faseAtual !== 'armada') return;
    this.faseAtual = 'ociosa';
    this.recuoAtual = this.cfg.recuoInicial;
    this.puxadaAtual = 0;
  }

  /** Tacada dada por fora do mouse (gancho de teste). `false` se já está animando. */
  iniciarAnimacao(): boolean {
    if (this.faseAtual === 'animando') return false;
    this.faseAtual = 'animando';
    this.recuoAtual = 0;
    this.puxadaAtual = 0;
    this.recuoSolto = 0;
    return true;
  }

  concluir(): void {
    if (this.faseAtual !== 'animando') return;
    this.faseAtual = 'ociosa';
    this.recuoAtual = this.cfg.recuoInicial;
    this.puxadaAtual = 0;
  }
}
