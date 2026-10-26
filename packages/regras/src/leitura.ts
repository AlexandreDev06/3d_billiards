import type { IdBola } from '@sinuca/fisica';
import { intercalar } from './roda';
import type { ConfigRegras, EstadoPartida, Grupo, Jogador, Modalidade, NomeFalta } from './tipos';

/**
 * A parte da config que `grupoDaBola` usa. Quem monta só um pedaço dela, sem `modalidade`, joga o
 * `par-ou-impar`; com a config inteira, o `mata-mata` não tem grupo.
 */
type Casa = Pick<ConfigRegras, 'bolas' | 'bolaFinal'> & { readonly modalidade?: Modalidade };

/** O que o jogador precisa acertar: qualquer bola (mesa aberta), as do seu grupo ou a bola final (o castigo). */
export type Objetivo = 'qualquer' | 'grupo' | 'castigo';

/** Nome curto de cada falta, para o HUD. */
export const ROTULO_FALTA: Readonly<Record<NomeFalta, string>> = {
  suicidio: 'Suicídio',
  cegar: 'Cegou',
  direta: 'Direta',
  'branca-fora': 'Bolão fora da mesa',
  'castigo-fora-de-hora': 'Castigo fora de hora',
  'bola-fora': 'Bola fora da mesa',
};

/** Nome de cada grupo, para o placar. */
export const ROTULO_GRUPO: Readonly<Record<Grupo, string>> = { par: 'Pares', impar: 'Ímpares' };

const FAIXA_DAS_BOLAS: Readonly<Record<ConfigRegras['bolas'], readonly [IdBola, IdBola]>> = {
  '1-15': [1, 15],
  '2-15': [2, 15],
  '2-14': [2, 14],
};

/** As bolas numeradas da casa, em ordem. */
export function bolasDaCasa(config: Pick<ConfigRegras, 'bolas'>): IdBola[] {
  const [de, ate] = FAIXA_DAS_BOLAS[config.bolas];
  return Array.from({ length: ate - de + 1 }, (_, i) => de + i);
}

/**
 * Grupo da bola pela paridade, entre as bolas da casa. O bolão, a bola final e as que a casa não usam não são de grupo;
 * no mata-mata nenhuma bola é.
 */
export function grupoDaBola(bola: IdBola, config: Casa): Grupo | null {
  if (config.modalidade === 'mata-mata') return null;
  const [de, ate] = FAIXA_DAS_BOLAS[config.bolas];
  if (bola < de || bola > ate || bola === bolaDeCastigo(config)) return null;
  return bola % 2 === 0 ? 'par' : 'impar';
}

/** A bola final (o castigo) da casa, se houver; o mata-mata não tem (`bolaFinal: 'ultima-do-grupo'`). */
export function bolaDeCastigo(config: Pick<ConfigRegras, 'bolaFinal'>): IdBola | null {
  return typeof config.bolaFinal === 'number' ? config.bolaFinal : null;
}

/** Como as frases chamam a bola final: "o castigo" (a 1) ou "a 8"; `null` sem bola final. */
export function nomeDaBolaFinal(config: Pick<ConfigRegras, 'bolaFinal'>): string | null {
  const final = bolaDeCastigo(config);
  if (final === null) return null;
  return final === 1 ? 'o castigo' : `a ${final}`;
}

/** Nome curto da falta para o HUD; a de tocar a bola final fora de hora leva o nome dela ("A 8 fora de hora"). */
export function rotuloDaFalta(falta: NomeFalta, config: Pick<ConfigRegras, 'bolaFinal'>): string {
  const nome = nomeDaBolaFinal(config);
  if (falta !== 'castigo-fora-de-hora' || nome === null || nome === 'o castigo') return ROTULO_FALTA[falta];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} fora de hora`;
}

/** Bolas do grupo do jogador (índice em `jogadores`) que ainda estão na mesa, em ordem; nenhuma com a mesa aberta. */
export function bolasRestantes(partida: EstadoPartida, jogador: number): IdBola[] {
  const grupo = partida.grupos[equipeDe(partida, jogador)] ?? null;
  if (grupo === null) return [];
  return partida.naMesa.filter((b) => grupoDaBola(b, partida.config) === grupo).sort((a, b) => a - b);
}

/** O que o jogador (índice em `jogadores`) precisa acertar primeiro na próxima tacada dele; no mata-mata, sem grupos, sempre qualquer bola. */
export function objetivo(partida: EstadoPartida, jogador: number): Objetivo {
  if ((partida.grupos[equipeDe(partida, jogador)] ?? null) === null) return 'qualquer';
  if (bolaDeCastigo(partida.config) !== null && bolasRestantes(partida, jogador).length === 0) return 'castigo';
  return 'grupo';
}

/**
 * Pontos de cada equipe (índice = `Jogador.equipe`): cada bola encaçapada vale 1 para quem tacou, na saída e em tacada
 * com falta também. É a conta do mata-mata; no par ou ímpar são as bolas que cada equipe encaçapou.
 */
export function pontosPorEquipe(partida: EstadoPartida): number[] {
  const pontos = Array.from({ length: Math.max(...partida.jogadores.map((j) => j.equipe)) + 1 }, () => 0);
  for (const { jogador } of partida.encacapadas) pontos[equipeDe(partida, jogador)]!++;
  return pontos;
}

/**
 * As bolas que o jogador (índice em `jogadores`; omitido, quem tem a vez) pode
 * tocar primeiro sem falta de toque (`direta`, `castigo-fora-de-hora`) na
 * próxima tacada dele, em ordem. Mesa aberta: as numeradas em jogo, e a bola
 * final só com `castigoPrimeiroMesaAberta: 'livre'`; com grupo: as do grupo da
 * equipe; no castigo: só a bola final. Só bolas na mesa (na saída, sem a bola
 * final que ainda não entrou); nenhuma com a partida encerrada. `aplicarTacada`
 * decide as faltas de toque por esta lista.
 */
export function bolasAlvo(partida: EstadoPartida, jogador: number = partida.vez): IdBola[] {
  const equipe = equipeDe(partida, jogador);
  if (partida.vencedor !== null) return [];
  const c = partida.config;
  const final = bolaDeCastigo(c);
  const naMesa = [...partida.naMesa].sort((a, b) => a - b);
  switch (objetivo(partida, jogador)) {
    case 'qualquer': {
      const finalFora = partida.fase === 'saida' && c.castigoInicio === 'depois-da-saida';
      const semFinal = finalFora || c.castigoPrimeiroMesaAberta === 'falta';
      return naMesa.filter((b) => !semFinal || b !== final);
    }
    case 'grupo':
      return naMesa.filter((b) => grupoDaBola(b, c) === partida.grupos[equipe]);
    case 'castigo':
      return naMesa.filter((b) => b === final);
  }
}

/**
 * Os jogadores da próxima partida, na ordem da roda, começando por quem dá a
 * saída (`partida.vez` no fim, conforme `config.proximaSaida`). Passe a lista a
 * `novaPartida`. No 1×1, a mesma roda girada. Com equipes de 2, cada equipe segue
 * na ordem em que estava depois de quem saiu nesta, e assim o parceiro de quem
 * saiu é o próximo da equipe dele a sair; no 2×1, A1, B1, A2 se a equipe de 2
 * sai, B1, A1, A2 se sai a de 1. No mata-mata, a roda gira até o próximo depois de quem saiu nesta
 * (todos mantêm a equipe).
 */
export function jogadoresDaProxima(partida: EstadoPartida): Jogador[] {
  if (partida.vencedor === null) throw new Error('jogadoresDaProxima: a partida ainda não terminou');
  const { jogadores } = partida;
  if (partida.config.modalidade === 'mata-mata') return [...jogadores.slice(partida.vez), ...jogadores.slice(0, partida.vez)];
  const sai = jogadores[partida.vez]!;
  const depoisDeQuemSaiu = [...jogadores.slice(1), jogadores[0]!];
  const daEquipe = (equipe: number) => depoisDeQuemSaiu.filter((j) => j.equipe === equipe && j !== sai);
  const quemSai = [sai, ...daEquipe(sai.equipe)];
  const outra = daEquipe(1 - sai.equipe);
  switch (partida.config.ordemDaVez) {
    case 'alternada':
      return intercalar(quemSai, outra);
  }
}

function equipeDe(partida: EstadoPartida, jogador: number): number {
  const j = partida.jogadores[jogador];
  if (!j) throw new Error(`jogador ${jogador} não existe`);
  return j.equipe;
}
