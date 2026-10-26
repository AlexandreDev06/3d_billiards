import type { ConfigRegras, Formacao, Jogador, Modalidade } from './tipos';

/** Nome de cada modalidade, para a tela de escolha. */
export const ROTULO_MODALIDADE: Readonly<Record<Modalidade, string>> = {
  'par-ou-impar': 'Par ou ímpar',
  'mata-mata': 'Mata-mata',
};

const FORMACOES: Readonly<Record<Modalidade, readonly Formacao[]>> = {
  'par-ou-impar': [[1, 1], [2, 1], [1, 2], [2, 2]],
  'mata-mata': [[1, 1], [1, 1, 1], [1, 1, 1, 1]],
};

/**
 * Os tamanhos das equipes que a modalidade da `config` aceita, do menor para o maior
 * número de jogadores: no par ou ímpar `[1, 1]`, `[2, 1]`, `[1, 2]` e `[2, 2]`; no
 * mata-mata `[1, 1]`, `[1, 1, 1]` e `[1, 1, 1, 1]`. É por esta lista que a sala e o
 * lobby montam a escolha de modo, e `novaPartida` recusa o que estiver fora dela.
 */
export function formacoesAceitas(config: Pick<ConfigRegras, 'modalidade'>): readonly Formacao[] {
  return FORMACOES[config.modalidade];
}

/** "2×1", "1×1×1": os tamanhos das equipes separados por ×. */
export function rotuloDaFormacao(formacao: Formacao): string {
  return formacao.join('×');
}

/** Os tamanhos das equipes 0, 1, 2... de `jogadores`; `null` se alguma equipe não for um inteiro de 0 a `jogadores.length - 1`. */
export function formacaoDosJogadores(jogadores: readonly Jogador[]): Formacao | null {
  const tamanhos = jogadores.map(() => 0);
  for (const { equipe } of jogadores) {
    if (!Number.isInteger(equipe) || equipe < 0 || equipe >= jogadores.length) return null;
    tamanhos[equipe]!++;
  }
  const ultima = tamanhos.findLastIndex((t) => t > 0);
  return tamanhos.slice(0, ultima + 1);
}
