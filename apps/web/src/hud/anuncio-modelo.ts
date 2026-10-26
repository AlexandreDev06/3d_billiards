import { bolaDeCastigo, nomeDaBolaFinal, objetivo, type EstadoPartida } from '@sinuca/regras';
import { fichaDaBola, type FichaDaBola } from '../cena/bola-estilo';

/** O aviso grande do começo da vez de quem só precisa da bola final. */
export interface Anuncio {
  /** O que o aviso diz: "Agora é só a 8!" (o nome da bola final é o de `nomeDaBolaFinal`). */
  readonly titulo: string;
  /** Quem está na vez e o que precisa fazer. */
  readonly detalhe: string;
  /** A bola final, para o desenho da ficha (número e estilo vêm das regras, nunca fixos). */
  readonly bola: FichaDaBola;
}

/** "a" ou "o": o artigo do nome da bola final ("a 8", "o castigo") é também o pronome de "encaçape-a" / "encaçape-o". */
export const pronomeDaBolaFinal = (nome: string): string => nome.split(' ')[0]!;

/** O aviso devido agora, ou `null` se quem tem a vez ainda tem bolas do grupo (ou a partida acabou, ou a casa não tem bola final). */
export function anuncioDoMomento(partida: EstadoPartida): Anuncio | null {
  if (partida.fase === 'fim' || partida.fase === 'saida') return null;
  const bola = bolaDeCastigo(partida.config);
  if (bola === null || objetivo(partida, partida.vez) !== 'castigo') return null;
  const nome = partida.jogadores[partida.vez]!.nome;
  const daBola = nomeDaBolaFinal(partida.config)!;
  return { titulo: `Agora é só ${daBola}!`, detalhe: `${nome}: só falta ${daBola}. Encaçape-${pronomeDaBolaFinal(daBola)} para vencer.`, bola: fichaDaBola(bola, partida.config) };
}

/**
 * Decide quando o aviso aparece: no começo da vez de quem entrou no castigo, e de novo quando a vez volta
 * para quem está nele. Não repete enquanto a mesma pessoa segue tacando no castigo (ela errou e perdeu a vez
 * ou acertou e continua; só uma nova vez dela, ou uma partida reiniciada, conta como começo).
 */
export class AnunciadorDoCastigo {
  private vezAvisada = -1;

  /** O aviso a mostrar agora, ou `null` se não há ou se já foi mostrado nesta vez. */
  atualizar(partida: EstadoPartida): Anuncio | null {
    const anuncio = anuncioDoMomento(partida);
    if (anuncio === null) {
      this.vezAvisada = -1;
      return null;
    }
    if (partida.vez === this.vezAvisada) return null;
    this.vezAvisada = partida.vez;
    return anuncio;
  }

  /** Partida nova ou retrato da sala: o próximo estado conta como começo de vez. */
  reiniciar(): void {
    this.vezAvisada = -1;
  }
}
