import type { ConfigMaos } from '../config';

const limitar = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/** O maior passo da integração da mola (s): um quadro longo se divide, para a mola nunca explodir. */
const PASSO_MAXIMO = 1 / 120;

/**
 * O que a mão de trás faz de si mesma enquanto segura o taco (L29): o pulso que balança como um pêndulo quando o taco vai e volta,
 * e o aperto na batida. Só conta, a partir do recuo do taco; quem desenha gira o osso do pulso em `pulso` (rad) e fecha os dedos
 * em `aperto` (0 a 1) vezes `vida.aperto.rad`. Nada aloca.
 *
 * - `pulso`: uma mola de segunda ordem (frequência e amortecimento da config) que persegue `ganho` vezes a velocidade do recuo
 *   (m/s, positiva para trás), limitada ao máximo: puxando, o pulso fica para trás; parando de repente, passa do zero e assenta;
 * - `aperto`: sobe em `subidaS` quando o taco vai à bola mais rápido que `velocidadeMinima`, fica enquanto a batida dura e por
 *   `seguirS` depois dela (a mão segue o taco) e relaxa em `soltaS`.
 */
export class PunhoVivo {
  /** O quanto o pulso gira (rad); positivo = para trás. */
  pulso = 0;
  /** 0 = a mão solta no taco, 1 = apertando. */
  aperto = 0;
  private velocidadeAngular = 0;
  private anterior = NaN;
  private restaDoSeguir = 0;
  private batendo = false;

  constructor(private readonly cfg: ConfigMaos['vida']) {}

  /** A vez começou outra vez: sem balanço nem aperto, e o próximo recuo não conta como velocidade. */
  reiniciar(): void {
    this.pulso = 0;
    this.velocidadeAngular = 0;
    this.aperto = 0;
    this.anterior = NaN;
    this.restaDoSeguir = 0;
    this.batendo = false;
  }

  /** Uma vez por quadro, com o recuo (m) com que o taco é desenhado agora. */
  atualizar(dt: number, recuo: number): void {
    if (!(dt > 0)) return;
    const velocidade = Number.isNaN(this.anterior) ? 0 : (recuo - this.anterior) / dt;
    this.anterior = recuo;
    this.moverPulso(dt, velocidade);
    this.apertar(dt, velocidade);
  }

  private moverPulso(dt: number, velocidade: number): void {
    const { ganho, maximo, frequencia: w, amortecimento: z } = this.cfg.pulso;
    const alvo = limitar(ganho * velocidade, -maximo, maximo);
    let resto = dt;
    while (resto > 1e-9) {
      const h = Math.min(resto, PASSO_MAXIMO);
      this.velocidadeAngular += (w * w * (alvo - this.pulso) - 2 * z * w * this.velocidadeAngular) * h;
      this.pulso += this.velocidadeAngular * h;
      resto -= h;
    }
    if (Math.abs(this.pulso) > maximo) {
      this.pulso = Math.sign(this.pulso) * maximo;
      this.velocidadeAngular = 0;
    }
    if (Math.abs(this.pulso) < 1e-5 && Math.abs(this.velocidadeAngular) < 1e-4 && alvo === 0) {
      this.pulso = 0;
      this.velocidadeAngular = 0;
    }
  }

  private apertar(dt: number, velocidade: number): void {
    const { velocidadeMinima, subidaS, seguirS, soltaS } = this.cfg.aperto;
    this.batendo = velocidade < -velocidadeMinima;
    if (this.batendo) {
      this.restaDoSeguir = seguirS;
      this.aperto = Math.min(this.aperto + dt / subidaS, 1);
    } else if (this.restaDoSeguir > 0) {
      this.restaDoSeguir = Math.max(this.restaDoSeguir - dt, 0);
    } else {
      this.aperto = Math.max(this.aperto - dt / soltaS, 0);
    }
  }
}
