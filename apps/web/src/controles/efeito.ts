import type { ConfigFisica } from '@sinuca/fisica';
import type { ConfigEfeito } from '../config';

export class PontoDeContato {
  lateral = 0;
  vertical = 0;

  constructor(private readonly cfg: ConfigEfeito) {}

  /** Volta ao centro da bola (a cada jogador que pega o taco). */
  centralizar(): void {
    this.lateral = 0;
    this.vertical = 0;
  }

  /** `dirLateral` e `dirVertical` em {-1, 0, 1} (teclas A/D e S/W); `dt` em s. */
  mover(dirLateral: number, dirVertical: number, dt: number): void {
    const comprimento = Math.hypot(dirLateral, dirVertical);
    if (comprimento === 0) return;
    const passo = (this.cfg.velocidade * dt) / comprimento;
    this.lateral += dirLateral * passo;
    this.vertical += dirVertical * passo;
    const raio = Math.hypot(this.lateral, this.vertical);
    if (raio > this.cfg.raioMaximo) {
      const escala = this.cfg.raioMaximo / raio;
      this.lateral *= escala;
      this.vertical *= escala;
    }
  }
}

/** Raio (fração do raio da bola) do círculo sem risco de miscue para o nível de giz dado. */
export function limiteSeguro(
  nivelGiz: number,
  fisica: Pick<ConfigFisica, 'limiteEfeitoComGiz' | 'limiteEfeitoSemGiz'>,
): number {
  const nivel = Math.min(Math.max(nivelGiz, 0), 1);
  return fisica.limiteEfeitoSemGiz + (fisica.limiteEfeitoComGiz - fisica.limiteEfeitoSemGiz) * nivel;
}
