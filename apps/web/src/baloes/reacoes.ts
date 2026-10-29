import type { AcaoDoBalao, ResultadoDoFim } from './acao-do-balao';
import type { CaraDoBalao } from './rosto';

/**
 * Os momentos do jogo em que o balão reage, do mais forte ao mais fraco que ele faz sozinho (`momentoDoBalao` escolhe um):
 *
 * - `ganhou`, `perdeu`: o fim da partida;
 * - `faltou`: a falta do dono do balão; `comemorou`: duas ou mais bolas numa tacada; `encacapou`: uma bola numerada caiu;
 *   `raspou`: a bola dele raspou a caçapa, e `desanimou` quando o susto passa e ela não caiu;
 * - `desconfiou`: a bola de quem joga contra ele corre para uma caçapa (o suspense, antes do resultado); `aliviou`: ela raspou e não caiu;
 * - `gargalhou`, `provocou`: quem joga contra ele errou e ele está à vista (a gargalhada, e depois o ar de convencido);
 * - `impaciente`: a vez dele está demorando; `mirando`: ele está mirando; `parado`: nada acontece.
 */
export type MomentoDoBalao =
  | 'parado'
  | 'mirando'
  | 'impaciente'
  | 'encacapou'
  | 'comemorou'
  | 'raspou'
  | 'desanimou'
  | 'desconfiou'
  | 'aliviou'
  | 'faltou'
  | 'gargalhou'
  | 'provocou'
  | 'ganhou'
  | 'perdeu';

/** O que o balão faz num momento: a ação do corpo (e se repete o trecho do meta até o jogo soltá-la), a cara e o recuo para o `.glb` v1. */
export interface ReacaoDoBalao {
  readonly acao: AcaoDoBalao;
  readonly repetir: boolean;
  readonly cara: CaraDoBalao;
  /**
   * O que fazer se o arquivo não tem a ação (o `.glb` v1): é o que o balão fazia antes do L46, para o jogo ficar igual até o artista
   * trocar o arquivo. Se só falta a cara, vale a cara do recuo.
   */
  readonly recuo: { readonly acao: AcaoDoBalao; readonly repetir: boolean; readonly cara: CaraDoBalao };
}

/**
 * A tabela do L46: cada momento do jogo, a ação e a cara que o balão faz, com o recuo para o v1. Acrescentar uma reação é acrescentar
 * uma linha aqui (e o nome da ação e da cara em `acao-do-balao.ts`), não um `if` no desenho.
 */
export const REACOES: Readonly<Record<MomentoDoBalao, ReacaoDoBalao>> = {
  parado: { acao: 'parado', repetir: false, cara: 'neutro', recuo: { acao: 'parado', repetir: false, cara: 'neutro' } },
  mirando: { acao: 'concentrar', repetir: true, cara: 'concentrado', recuo: { acao: 'inclinar', repetir: true, cara: 'neutro' } },
  impaciente: { acao: 'impaciente', repetir: true, cara: 'tedio', recuo: { acao: 'inclinar', repetir: true, cara: 'neutro' } },
  encacapou: { acao: 'pulinho', repetir: false, cara: 'sorriso', recuo: { acao: 'pulinho', repetir: false, cara: 'sorriso' } },
  comemorou: { acao: 'comemorar', repetir: false, cara: 'comemorando', recuo: { acao: 'pulinho', repetir: false, cara: 'sorriso' } },
  raspou: { acao: 'susto', repetir: false, cara: 'susto', recuo: { acao: 'susto', repetir: false, cara: 'susto' } },
  desanimou: { acao: 'desanimar', repetir: false, cara: 'triste', recuo: { acao: 'parado', repetir: false, cara: 'triste' } },
  desconfiou: { acao: 'inclinar', repetir: true, cara: 'desconfiado', recuo: { acao: 'inclinar', repetir: true, cara: 'neutro' } },
  aliviou: { acao: 'ufa', repetir: false, cara: 'ufa', recuo: { acao: 'parado', repetir: false, cara: 'neutro' } },
  faltou: { acao: 'bravo', repetir: false, cara: 'bravo', recuo: { acao: 'susto', repetir: false, cara: 'susto' } },
  gargalhou: { acao: 'rir', repetir: true, cara: 'rindo', recuo: { acao: 'pulinho', repetir: false, cara: 'sorriso' } },
  provocou: { acao: 'rir', repetir: true, cara: 'convencido', recuo: { acao: 'pulinho', repetir: false, cara: 'sorriso' } },
  ganhou: { acao: 'estufar', repetir: true, cara: 'comemorando', recuo: { acao: 'estufar', repetir: true, cara: 'sorriso' } },
  perdeu: { acao: 'murchar', repetir: true, cara: 'triste', recuo: { acao: 'murchar', repetir: true, cara: 'triste' } },
};

/** Que momento cada cara que a mesa e o jogo provocam é. As outras caras (a neutra, a triste do fim, as do estado) não são momento. */
const MOMENTO_DA_CARA: Readonly<Partial<Record<CaraDoBalao, MomentoDoBalao>>> = {
  sorriso: 'encacapou',
  comemorando: 'comemorou',
  susto: 'raspou',
  desanimado: 'desanimou',
  desconfiado: 'desconfiou',
  ufa: 'aliviou',
  bravo: 'faltou',
  rindo: 'gargalhou',
  convencido: 'provocou',
};

/** O momento que a cara provoca, ou `undefined` se ela não é um momento (a neutra, a triste do fim, as caras do estado). */
export function momentoDaCara(cara: CaraDoBalao): MomentoDoBalao | undefined {
  return MOMENTO_DA_CARA[cara];
}

/** O que há em volta do balão, além da cara: se ele mira, se a vez dele demora, se a partida acabou. */
export interface SituacaoDoBalao {
  readonly mirando: boolean;
  readonly impaciente: boolean;
  readonly fim: ResultadoDoFim | null;
}

/** O momento em que o balão está: o fim manda; depois o que a mesa e o jogo provocam (a cara); depois a impaciência; depois a mira. */
export function momentoDoBalao(cara: CaraDoBalao, situacao: SituacaoDoBalao): MomentoDoBalao {
  if (situacao.fim !== null) return situacao.fim === 'ganhou' ? 'ganhou' : 'perdeu';
  const daCara = momentoDaCara(cara);
  if (daCara !== undefined) return daCara;
  if (situacao.mirando) return situacao.impaciente ? 'impaciente' : 'mirando';
  return 'parado';
}
