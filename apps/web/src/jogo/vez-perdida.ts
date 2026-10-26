import type { EstadoPartida } from '@sinuca/regras';

/** O que a roda fez com a vez perdida numa passagem da vez (uma tacada ou o `passarVez`). */
export interface VezPerdida {
  /** Quem tacou entrou agora em `perdemAProximaVez`: perde a próxima vez (nunca no fim da partida). */
  readonly puniu: boolean;
  /** Índices em `jogadores` de quem a roda pulou, na ordem em que a roda os alcançou. */
  readonly pulados: readonly number[];
}

const NADA: VezPerdida = { puniu: false, pulados: [] };

/**
 * Lê, só pelas duas partidas, o que a roda fez com a vez perdida (`EstadoPartida.perdemAProximaVez`, sem olhar a
 * modalidade): quem entrou na lista nesta passagem e quem a roda pulou (saiu da lista). `antes` é a partida de quem tinha
 * a vez e `depois` a que veio dela, por tacada ou por `passarVez`. A roda anda de `antes.vez` até `depois.vez` e só pula
 * quem estava na lista, então os pulados são os jogadores no caminho que saíram da lista. Pura.
 *
 * O caso de borda: se todos os outros estavam na lista e quem tacou entrou nela, a roda dá a volta, pula também quem
 * tacou e segue para o seguinte a ele; isso não deixa o caminho (`depois.vez` é o seguinte), mas deixa uma marca: saíram
 * da lista todos os outros.
 */
export function vezPerdida(antes: EstadoPartida, depois: EstadoPartida): VezPerdida {
  const n = antes.jogadores.length;
  if (n < 2 || depois.fase === 'fim' || !Number.isInteger(depois.vez) || depois.vez < 0 || depois.vez >= n) return NADA;
  const quem = antes.vez;
  const listaDepois = depois.perdemAProximaVez ?? [];
  const consumidos = new Set((antes.perdemAProximaVez ?? []).filter((i) => !listaDepois.includes(i)));
  const seguinte = (quem + 1) % n;

  // A roda deu a volta: pulou todos os outros, quem tacou (que acabou de entrar na lista) e parou no seguinte a ele.
  if (depois.vez === seguinte && consumidos.size === n - 1) {
    return { puniu: true, pulados: Array.from({ length: n }, (_, k) => (seguinte + k) % n) };
  }

  const pulados: number[] = [];
  for (let i = seguinte; i !== depois.vez; i = (i + 1) % n) if (consumidos.has(i)) pulados.push(i);
  return { puniu: listaDepois.includes(quem), pulados };
}

const enumerar = (nomes: readonly string[]): string => (nomes.length < 2 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`);

/**
 * O aviso curto do pulo: "Ana pula a vez (falta)" ou "Ana e Beto pulam a vez (falta)". Vale para as duas faltas que punem
 * (cegar e suicídio: a lista não diz qual foi) e é diferente do "perdeu a vez" do tempo esgotado. Vazio sem pulados.
 */
export function avisoDoPulo(partida: Pick<EstadoPartida, 'jogadores'>, pulados: readonly number[]): string {
  if (pulados.length === 0) return '';
  const nomes = pulados.map((i) => partida.jogadores[i]?.nome ?? `Jogador ${i + 1}`);
  return `${enumerar(nomes)} ${nomes.length > 1 ? 'pulam' : 'pula'} a vez (falta)`;
}

/** "Ana perde a próxima vez": a linha do aviso grande da falta (vazia se quem tacou não perde). */
export function avisoDaPena(partida: Pick<EstadoPartida, 'jogadores'>, quemTacou: number, puniu: boolean): string {
  return puniu ? `${partida.jogadores[quemTacou]?.nome ?? `Jogador ${quemTacou + 1}`} perde a próxima vez` : '';
}
