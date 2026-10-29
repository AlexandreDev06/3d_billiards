import type { EstadoMesa } from '@sinuca/fisica';
import type { EstadoPartida } from '@sinuca/regras';

/**
 * O que a mão do jogador está fazendo no treino:
 * - `mirar`: o jogo normal (mira, efeito, tacada);
 * - `branca`: bola na mão, arrasta só a branca;
 * - `arrumar`: arruma a mesa, arrasta qualquer bola, tira e devolve.
 */
export type ModoDaMao = 'mirar' | 'branca' | 'arrumar';

/** A mesa e a partida de antes de uma tacada, com as tacadas dadas até ali. */
export interface FotoDoTreino {
  readonly partida: EstadoPartida;
  readonly mesa: EstadoMesa;
  readonly tacadas: number;
}

/** Quantas tacadas o "Refazer" lembra (as mais antigas saem). */
export const FOTOS_GUARDADAS = 100;

/**
 * A sessão de treino (pura): quantas tacadas foram dadas, o que a mão faz, o cenário armado e as fotos de antes de cada
 * tacada para "Refazer". A partida e a mesa em si vivem no `Jogo`.
 */
export class SessaoDeTreino {
  private tacadasDadas = 0;
  private modoAtual: ModoDaMao = 'mirar';
  private cenarioAtual: string | null = null;
  private fotos: FotoDoTreino[] = [];

  get tacadas(): number {
    return this.tacadasDadas;
  }

  get modo(): ModoDaMao {
    return this.modoAtual;
  }

  /** O cenário pronto que armou esta mesa (`null` = triângulo ou mesa arrumada à mão). */
  get cenario(): string | null {
    return this.cenarioAtual;
  }

  get podeRefazer(): boolean {
    return this.fotos.length > 0;
  }

  definirModo(modo: ModoDaMao): void {
    this.modoAtual = modo;
  }

  /** Vai dar uma tacada: guarda a mesa de agora para o "Refazer" e conta a tacada. */
  aoTacar(partida: EstadoPartida, mesa: EstadoMesa): void {
    this.fotos.push({ partida, mesa, tacadas: this.tacadasDadas });
    if (this.fotos.length > FOTOS_GUARDADAS) this.fotos.shift();
    this.tacadasDadas++;
  }

  /** Desfaz a última tacada: devolve a mesa de antes dela e volta a conta. `null` sem tacada para desfazer. */
  refazer(): FotoDoTreino | null {
    const foto = this.fotos.pop();
    if (!foto) return null;
    this.tacadasDadas = foto.tacadas;
    return foto;
  }

  /** Mesa nova (triângulo ou cenário): zera a conta e as fotos e sai dos modos da mão. */
  recomecar(cenario: string | null): void {
    this.tacadasDadas = 0;
    this.fotos = [];
    this.modoAtual = 'mirar';
    this.cenarioAtual = cenario;
  }

  /** A mesa foi arrumada à mão: já não é a do cenário. */
  arrumouAMao(): void {
    this.cenarioAtual = null;
  }
}
