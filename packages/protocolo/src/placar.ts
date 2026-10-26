/**
 * A conta do placar por confronto, pura (sem DOM, rede ou relógio): a sala a usa para contar as partidas de cada
 * sala, e o hot-seat do cliente usa a mesma para contar as partidas seguidas no mesmo PC.
 *
 * Um confronto é a modalidade mais o conjunto de lados como conjuntos de pessoas, de 2 a 4: dois no par ou ímpar (1 ou 2
 * pessoas cada), um por pessoa no mata-mata. A ordem dentro do lado não importa, e os lados em outra ordem de equipe contam
 * como o mesmo confronto (as vitórias seguem a pessoa, não a equipe). Só a partida anterior decide: se a modalidade e a
 * formação são as do confronto atual, soma; senão (outra modalidade, ou qualquer pessoa a mais, a menos ou em outro lado)
 * abre um confronto novo em 1 × 0 e o atual vai para o histórico (um confronto antigo igual não é retomado). O mesmo 1×1 de
 * par ou ímpar e de mata-mata são, portanto, confrontos diferentes.
 */
import type { Modalidade } from '@sinuca/regras';
import { LIMITES_PROTOCOLO } from './limites';
import type { ConfrontoPlacar, LadoPlacar, PlacarSala } from './tipos';

/** A modalidade de uma partida que não a diz (o hot-seat e as chamadas de antes do mata-mata). */
const MODALIDADE_DO_PLACAR: Modalidade = 'par-ou-impar';

/** Quem jogou: `id` identifica a pessoa (a entrada dela na sala), `nome` é o apelido mostrado. */
export interface JogadorDoPlacar {
  readonly id: string;
  readonly nome: string;
}

interface LadoGuardado {
  readonly jogadores: readonly JogadorDoPlacar[];
  readonly vitorias: number;
}

interface ConfrontoGuardado {
  readonly modalidade: Modalidade;
  readonly lados: readonly [LadoGuardado, LadoGuardado, ...LadoGuardado[]];
}

/** O placar como a sala o guarda: igual ao do fio, mas com o `id` de cada pessoa (que não vai para a rede). */
export interface PlacarGuardado {
  readonly atual: ConfrontoGuardado | null;
  /** Do confronto mais recente para o mais antigo. */
  readonly historico: readonly ConfrontoGuardado[];
}

export const PLACAR_VAZIO: PlacarGuardado = { atual: null, historico: [] };

/**
 * Uma partida terminada: quem jogou em cada equipe (1 ou 2 pessoas) e qual equipe venceu. De 2 equipes (par ou ímpar,
 * 1×1, 2×1 ou 2×2) a 4 (mata-mata, uma pessoa por equipe).
 */
export interface PartidaTerminada {
  /** `equipes[i]` é a equipe `i` da partida. */
  readonly equipes: readonly [readonly JogadorDoPlacar[], readonly JogadorDoPlacar[], ...(readonly JogadorDoPlacar[])[]];
  /** Índice, em `equipes`, da equipe que venceu. */
  readonly vencedor: number;
  /** A modalidade em que a partida foi jogada; ausente = `par-ou-impar`. Entra na chave do confronto. */
  readonly modalidade?: Modalidade;
}

const mesmoLado = (lado: LadoGuardado, equipe: readonly JogadorDoPlacar[]): boolean => {
  const ids = new Set(equipe.map((j) => j.id));
  return lado.jogadores.length === ids.size && lado.jogadores.every((j) => ids.has(j.id));
};

/** Em que lado do confronto está cada equipe da partida (mesmas pessoas), ou `null` se a formação mudou. */
function ladosDasEquipes(confronto: ConfrontoGuardado, partida: PartidaTerminada): number[] | null {
  const { equipes } = partida;
  if (confronto.modalidade !== (partida.modalidade ?? MODALIDADE_DO_PLACAR)) return null;
  if (confronto.lados.length !== equipes.length) return null;
  const onde: number[] = [];
  for (const equipe of equipes) {
    const lado = confronto.lados.findIndex((l) => mesmoLado(l, equipe));
    if (lado < 0) return null; // as equipes de uma partida não dividem pessoas (`conferir`), então dois lados iguais não se repetem
    onde.push(lado);
  }
  return onde;
}

function conferir({ equipes, vencedor }: PartidaTerminada): void {
  if (equipes.length < 2) throw new RangeError('registrarPartida: precisa de ao menos duas equipes');
  if (equipes.length > LIMITES_PROTOCOLO.jogadores) throw new RangeError(`registrarPartida: no máximo ${LIMITES_PROTOCOLO.jogadores} equipes`);
  if (!Number.isInteger(vencedor) || vencedor < 0 || vencedor >= equipes.length) throw new RangeError('registrarPartida: o vencedor precisa ser o índice de uma das equipes');
  if (equipes.some((e) => e.length === 0)) throw new RangeError('registrarPartida: cada equipe precisa de ao menos uma pessoa');
  const ids = equipes.flatMap((e) => e.map((j) => j.id));
  if (new Set(ids).size !== ids.length) throw new RangeError('registrarPartida: a mesma pessoa aparece duas vezes');
}

const somar = (vitorias: number): number => Math.min(vitorias + 1, LIMITES_PROTOCOLO.vitoriasNoPlacar);

/**
 * Conta uma partida terminada. Devolve um placar novo (o recebido não muda). O confronto atual e o histórico somam no
 * máximo `maximo` confrontos; o mais antigo do histórico sai primeiro. As vitórias saturam em
 * `LIMITES_PROTOCOLO.vitoriasNoPlacar`, para o esquema do fio nunca recusar o que a sala conta.
 */
export function registrarPartida(
  placar: PlacarGuardado,
  partida: PartidaTerminada,
  maximo: number = LIMITES_PROTOCOLO.confrontosNoPlacar,
): PlacarGuardado {
  conferir(partida);
  if (!Number.isInteger(maximo) || maximo < 1) throw new RangeError('registrarPartida: maximo precisa ser um inteiro a partir de 1');
  const { atual } = placar;
  const onde = atual ? ladosDasEquipes(atual, partida) : null;
  if (atual && onde !== null) {
    // o lado do confronto que a equipe vencedora ocupa
    const vencedor = onde[partida.vencedor]!;
    const lados = atual.lados.map((lado, i) => (i === vencedor ? { ...lado, vitorias: somar(lado.vitorias) } : lado)) as unknown as ConfrontoGuardado['lados'];
    return { atual: { modalidade: atual.modalidade, lados }, historico: placar.historico };
  }
  const aberto: ConfrontoGuardado = {
    modalidade: partida.modalidade ?? MODALIDADE_DO_PLACAR,
    lados: partida.equipes.map((jogadores, i) => ({ jogadores: [...jogadores], vitorias: i === partida.vencedor ? 1 : 0 })) as unknown as ConfrontoGuardado['lados'],
  };
  return { atual: aberto, historico: (atual ? [atual, ...placar.historico] : placar.historico).slice(0, maximo - 1) };
}

const ladoNoFio = (lado: LadoGuardado): LadoPlacar => ({ nomes: lado.jogadores.map((j) => j.nome), vitorias: lado.vitorias });
const confrontoNoFio = (c: ConfrontoGuardado): ConfrontoPlacar => ({ modalidade: c.modalidade, lados: c.lados.map(ladoNoFio) as unknown as ConfrontoPlacar['lados'] });

/** O que vai para a rede: só apelidos e vitórias, nunca o `id` de ninguém. */
export function placarNoFio(placar: PlacarGuardado): PlacarSala {
  return { atual: placar.atual ? confrontoNoFio(placar.atual) : null, historico: placar.historico.map(confrontoNoFio) };
}
