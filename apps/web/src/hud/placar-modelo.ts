import { ROTULO_GRUPO, bolaDeCastigo, bolasRestantes, nomeDaBolaFinal, objetivo, pontosPorEquipe, type EstadoPartida, type Grupo } from '@sinuca/regras';
import { fichaDaBola, type FichaDaBola } from '../cena/bola-estilo';
import { pronomeDaBolaFinal } from './anuncio-modelo';

/** Um jogador dentro da linha da equipe: o nome, se é a vez dele e (online) se está na sala. */
export interface MembroDoPlacar {
  readonly nome: string;
  /** É ele quem taca agora (a linha da equipe só está `naVez` se algum membro está). */
  readonly naVez: boolean;
  /** Online: se o jogador está na sala e se sou eu; `null` no hot-seat. */
  readonly presenca: Presenca | null;
  /** Está em `EstadoPartida.perdemAProximaVez`: a roda o pula na próxima vez dele. */
  readonly perdeAProxima: boolean;
}

/**
 * Uma linha por equipe: no 1x1 é o jogador; no 2x1 e no 2x2, os jogadores da equipe dividem o grupo e as fichas; no
 * mata-mata (cada um por si) é cada jogador, com os pontos e as bolas que ele matou.
 */
export interface LinhaPlacar {
  /** Índice em `jogadores` do primeiro da equipe: a âncora da linha, para onde voam as fichas da transição. */
  readonly jogador: number;
  /** Os nomes da equipe, na ordem da roda: "Ana" ou "Ana e Caio". */
  readonly nome: string;
  readonly membros: readonly MembroDoPlacar[];
  readonly equipe: number;
  readonly naVez: boolean;
  /** Alguém da linha perde a próxima vez (a marca discreta ao lado do nome). */
  readonly perdeAProxima: boolean;
  readonly grupo: Grupo | null;
  readonly rotuloGrupo: string;
  /** "Pares · 3 restantes": o grupo e quantas faltam, para não precisar contar as fichas; no mata-mata, "3 pontos". */
  readonly resumo: string;
  /** Os pontos da equipe (`pontosPorEquipe`) quando a partida se joga por pontos; `null` quando se joga por grupo. */
  readonly pontos: number | null;
  /** As bolas que a equipe encaçapou, na ordem em que caíram, quando a partida se joga por pontos; vazio por grupo. */
  readonly encacapadas: readonly FichaDaBola[];
  /** Bolas do grupo que ainda estão na mesa, em ordem, com o estilo que a casa dá a cada uma; vazio enquanto o grupo não está definido. */
  readonly restantes: readonly FichaDaBola[];
  /** Quem joga já tirou o grupo todo e vai à bola final (o castigo). */
  readonly noCastigo: boolean;
  /** A bola final das regras (lisa) quando `noCastigo`; senão `null`. */
  readonly bolaFinal: FichaDaBola | null;
  /** Como a frase chama a bola final ("a 8", "o castigo"), do pacote de regras; `null` fora do castigo. */
  readonly nomeDaBolaFinal: string | null;
}

export interface Presenca {
  readonly conectado: boolean;
  readonly voce: boolean;
}

export interface ModeloPlacar {
  readonly linhas: readonly LinhaPlacar[];
  /** O que quem tem a vez precisa fazer. */
  readonly objetivo: string;
}

/**
 * A partida se joga por pontos, cada bola encaçapada valendo um para quem tacou, e não por grupo: não há grupo nem bola
 * final. É o mata-mata; as regras ainda não dizem isto por um campo, então lê-se da modalidade.
 */
export const jogaPorPontos = (partida: Pick<EstadoPartida, 'config'>): boolean => partida.config.modalidade === 'mata-mata';

function resumirPontos(pontos: number): string {
  return `${pontos} ${pontos === 1 ? 'ponto' : 'pontos'}`;
}

function resumirGrupo(rotulo: string, grupo: Grupo | null, faltam: number): string {
  if (grupo === null) return 'Grupo a definir';
  if (faltam === 0) return `${rotulo} · todas encaçapadas`;
  return `${rotulo} · ${faltam} ${faltam === 1 ? 'restante' : 'restantes'}`;
}

function descreverObjetivo(partida: EstadoPartida): string {
  if (partida.fase === 'fim') return 'Fim de partida';
  if (partida.fase === 'saida') return 'Tacada de saída';
  if (jogaPorPontos(partida)) return 'Cada bola encaçapada vale 1 ponto';
  const castigo = nomeDaBolaFinal(partida.config);
  switch (objetivo(partida, partida.vez)) {
    case 'qualquer':
      return 'Mesa aberta: encaçape uma bola para definir o grupo';
    case 'castigo':
      return castigo === null ? 'Só falta a última bola: encaçape-a!' : `Só falta ${castigo}: encaçape-${pronomeDaBolaFinal(castigo)}!`;
    case 'grupo': {
      const grupo = partida.grupos[partida.jogadores[partida.vez]!.equipe] ?? null;
      return grupo === null ? 'Encaçape as bolas do seu grupo' : `Encaçape as ${ROTULO_GRUPO[grupo].toLowerCase()}`;
    }
  }
}

/**
 * O que o placar mostra, tirado só do estado da partida (puro, sem DOM): uma linha por equipe, na ordem em que a equipe
 * aparece em `jogadores`, com os nomes de quem a forma. O grupo, as bolas que faltam e o castigo são da equipe.
 */
export function modeloDoPlacar(partida: EstadoPartida, presencaDe?: (idDoJogador: string) => Presenca | null): ModeloPlacar {
  const emJogo = partida.fase !== 'fim';
  const equipes = [...new Set(partida.jogadores.map((j) => j.equipe))];
  const equipeDaVez = partida.jogadores[partida.vez]?.equipe;
  const porPontos = jogaPorPontos(partida);
  const pontos = porPontos ? pontosPorEquipe(partida) : [];
  const perdem = partida.perdemAProximaVez ?? [];
  const linhas = equipes.map((equipe): LinhaPlacar => {
    const indices = partida.jogadores.flatMap((j, i) => (j.equipe === equipe ? [i] : []));
    const primeiro = indices[0]!;
    const grupo = partida.grupos[equipe] ?? null;
    const naVez = emJogo && equipe === equipeDaVez;
    const restantes = bolasRestantes(partida, primeiro);
    const noCastigo = naVez && !porPontos && objetivo(partida, primeiro) === 'castigo';
    const membros = indices.map(
      (i): MembroDoPlacar => ({
        nome: partida.jogadores[i]!.nome,
        naVez: emJogo && i === partida.vez,
        presenca: presencaDe?.(partida.jogadores[i]!.id) ?? null,
        perdeAProxima: emJogo && perdem.includes(i),
      }),
    );
    return {
      jogador: primeiro,
      nome: membros.map((m) => m.nome).join(' e '),
      membros,
      equipe,
      naVez,
      perdeAProxima: membros.some((m) => m.perdeAProxima),
      grupo,
      rotuloGrupo: grupo === null ? 'A definir' : ROTULO_GRUPO[grupo],
      resumo: porPontos ? resumirPontos(pontos[equipe] ?? 0) : resumirGrupo(grupo === null ? '' : ROTULO_GRUPO[grupo], grupo, restantes.length),
      pontos: porPontos ? (pontos[equipe] ?? 0) : null,
      encacapadas: porPontos ? partida.encacapadas.filter((e) => partida.jogadores[e.jogador]?.equipe === equipe).map((e) => fichaDaBola(e.bola, partida.config)) : [],
      restantes: restantes.map((id) => fichaDaBola(id, partida.config)),
      noCastigo,
      bolaFinal: noCastigo ? fichaDaBola(bolaDeCastigo(partida.config)!, partida.config) : null,
      nomeDaBolaFinal: noCastigo ? nomeDaBolaFinal(partida.config) : null,
    };
  });
  return { linhas, objetivo: descreverObjetivo(partida) };
}
