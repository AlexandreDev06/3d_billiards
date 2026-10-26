import { pontosPorEquipe, type EstadoPartida } from '@sinuca/regras';
import { jogaPorPontos } from './placar-modelo';

/** Uma linha da classificação do fim da partida: a posição, quem é, os pontos e se venceu. */
export interface LinhaDaClassificacao {
  /** 1 é o primeiro. */
  readonly posicao: number;
  readonly nome: string;
  /** A equipe (0 a 3): dá a cor do nome, a mesma do placar das bolas. */
  readonly equipe: number;
  readonly pontos: number;
  readonly vencedor: boolean;
}

/**
 * A classificação de uma partida que se joga por pontos (o mata-mata), do primeiro ao último: mais pontos primeiro; no
 * empate, quem as regras deram a vitória (`partida.vencedor`) vem antes e os outros seguem a ordem da roda. `null`
 * quando a partida não se joga por pontos (par ou ímpar). Puro.
 */
export function classificacaoDaPartida(partida: EstadoPartida): readonly LinhaDaClassificacao[] | null {
  if (!jogaPorPontos(partida)) return null;
  const pontos = pontosPorEquipe(partida);
  const linhas = partida.jogadores.map((jogador, ordem) => ({
    ordem,
    nome: jogador.nome,
    equipe: jogador.equipe,
    pontos: pontos[jogador.equipe] ?? 0,
    vencedor: partida.vencedor === jogador.equipe,
  }));
  linhas.sort((a, b) => b.pontos - a.pontos || Number(b.vencedor) - Number(a.vencedor) || a.ordem - b.ordem);
  return linhas.map((l, i) => ({ posicao: i + 1, nome: l.nome, equipe: l.equipe, pontos: l.pontos, vencedor: l.vencedor }));
}

/** "1º Ana 8 · 2º Beto 5 · 3º Caio 2", para a dica e o gancho de teste. */
export const textoDaClassificacao = (linhas: readonly LinhaDaClassificacao[]): string => linhas.map((l) => `${l.posicao}º ${l.nome} ${l.pontos}`).join(' · ');
