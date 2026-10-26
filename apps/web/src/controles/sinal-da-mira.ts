import type { EstadoMesa, IdBola } from '@sinuca/fisica';
import { bolaDeCastigo, bolasAlvo, nomeDaBolaFinal, type EstadoPartida } from '@sinuca/regras';
import { primeiraBolaNaLinha } from './primeira-bola';

/**
 * O que a mira diz da primeira bola na reta: nada (sem bola na reta, ou não é a vez de mirar), `certa` (vale tocá-la
 * primeiro) ou `errada` (tocá-la primeiro é falta de toque), com a frase curta do aviso.
 */
export interface SinalDaMira {
  readonly tipo: 'nenhum' | 'certa' | 'errada';
  readonly bola: IdBola | null;
  readonly texto: string;
}

export const SEM_SINAL: SinalDaMira = { tipo: 'nenhum', bola: null, texto: '' };

/**
 * A frase do aviso. A bola final fora de hora leva o nome das regras ("Ainda não é a 8", "Ainda não é o castigo");
 * qualquer outra bola que não vale é do grupo do adversário.
 */
function textoDaBolaErrada(partida: EstadoPartida, bola: IdBola): string {
  if (bola === bolaDeCastigo(partida.config)) return `Ainda não é ${nomeDaBolaFinal(partida.config)}`;
  return `Bola errada: a ${bola} é do adversário`;
}

/** Vale tocar `bola` primeiro na próxima tacada de `jogador` (omitido, quem tem a vez)? A lista de bolas que valem é `bolasAlvo` das regras. */
export function sinalDaBola(partida: EstadoPartida, bola: IdBola | null, jogador: number = partida.vez): SinalDaMira {
  if (bola === null || partida.vencedor !== null) return SEM_SINAL;
  if (bolasAlvo(partida, jogador).includes(bola)) return { tipo: 'certa', bola, texto: '' };
  return { tipo: 'errada', bola, texto: textoDaBolaErrada(partida, bola) };
}

type Varredura = (mesa: EstadoMesa, angulo: number) => IdBola | null;

/**
 * Acompanha a mira quadro a quadro e só recalcula quando algo muda (ângulo, mesa ou partida): com a mesma entrada
 * devolve o mesmo objeto, sem varrer e sem alocar. As bolas que valem (`bolasAlvo`) são lidas uma vez por partida.
 */
export class VigiaDaMira {
  private partida: EstadoPartida | null = null;
  private mesa: EstadoMesa | null = null;
  private angulo = NaN;
  private ativa = false;
  private atual: SinalDaMira = SEM_SINAL;
  /** Bit `n` ligado = a bola `n` vale tocar primeiro. */
  private validas = 0;
  private readonly sinais = new Map<IdBola, SinalDaMira>();

  constructor(private readonly varrer: Varredura = primeiraBolaNaLinha) {}

  atualizar(partida: EstadoPartida, mesa: EstadoMesa, angulo: number, ativa: boolean): SinalDaMira {
    if (!ativa) {
      this.ativa = false;
      this.atual = SEM_SINAL;
      return SEM_SINAL;
    }
    if (ativa === this.ativa && partida === this.partida && mesa === this.mesa && angulo === this.angulo) return this.atual;
    if (partida !== this.partida) {
      this.partida = partida;
      this.sinais.clear();
      this.validas = 0;
      for (const bola of bolasAlvo(partida)) this.validas |= 1 << bola;
    }
    this.ativa = true;
    this.mesa = mesa;
    this.angulo = angulo;
    const bola = this.varrer(mesa, angulo);
    this.atual = bola === null ? SEM_SINAL : this.sinalDe(partida, bola);
    return this.atual;
  }

  private sinalDe(partida: EstadoPartida, bola: IdBola): SinalDaMira {
    let sinal = this.sinais.get(bola);
    if (sinal === undefined) {
      sinal = (this.validas & (1 << bola)) !== 0 ? { tipo: 'certa', bola, texto: '' } : { tipo: 'errada', bola, texto: textoDaBolaErrada(partida, bola) };
      this.sinais.set(bola, sinal);
    }
    return sinal;
  }
}
