/**
 * Uma mola amortecida de um número só, resolvida pela solução exata da equação (não por passos): estável com qualquer `dt`, de um
 * quadro de 1 ms a uma aba parada por minutos, e com o mesmo resultado em um passo grande ou em vários pequenos. É a base de tudo
 * o que o personagem faz "com peso": a cara que passa um pouco do alvo e assenta, o corpo que segue os olhos, a gelatina.
 * Nada aloca.
 */
export class MolaAmortecida {
  /** Onde a mola está. */
  valor: number;
  /** A velocidade dela (unidades por segundo). */
  velocidade = 0;
  /** Para onde ela vai. */
  alvo: number;

  /**
   * @param frequenciaHz quantas vezes por segundo oscilaria sem amortecimento; maior = mais rápida
   * @param amortecimento 0 = nunca para, entre 0 e 1 = passa do alvo e assenta (quanto menor, mais passa), 1 = chega sem passar, mais que 1 = chega devagar
   */
  constructor(
    public frequenciaHz: number,
    public amortecimento: number,
    valor = 0,
  ) {
    this.valor = valor;
    this.alvo = valor;
  }

  /** Soma `dv` à velocidade: um empurrão. */
  empurrar(dv: number): void {
    this.velocidade += dv;
  }

  /** Põe a mola em `valor`, parada, e o alvo junto (sem salto depois). */
  forcar(valor: number): void {
    this.valor = valor;
    this.alvo = valor;
    this.velocidade = 0;
  }

  atualizar(dt: number): void {
    if (!(dt > 0)) return;
    const w = 2 * Math.PI * this.frequenciaHz;
    if (!(w > 1e-9)) return;
    const z = Math.max(this.amortecimento, 0);
    const x0 = this.valor - this.alvo;
    const v0 = this.velocidade;
    let x: number;
    let v: number;
    if (Math.abs(z - 1) < 1e-5) {
      // amortecimento crítico
      const e = Math.exp(-w * dt);
      const c2 = v0 + w * x0;
      x = (x0 + c2 * dt) * e;
      v = (v0 - w * c2 * dt) * e;
    } else if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z);
      const e = Math.exp(-z * w * dt);
      const c = Math.cos(wd * dt);
      const s = Math.sin(wd * dt);
      const c2 = (v0 + z * w * x0) / wd;
      x = e * (x0 * c + c2 * s);
      v = e * (v0 * c - (x0 * wd + (z * w * (v0 + z * w * x0)) / wd) * s);
    } else {
      const raiz = w * Math.sqrt(z * z - 1);
      const r1 = -z * w + raiz;
      const r2 = -z * w - raiz;
      const a = (v0 - r2 * x0) / (r1 - r2);
      const b = x0 - a;
      const e1 = Math.exp(r1 * dt);
      const e2 = Math.exp(r2 * dt);
      x = a * e1 + b * e2;
      v = a * r1 * e1 + b * r2 * e2;
    }
    this.valor = this.alvo + x;
    this.velocidade = v;
  }
}
