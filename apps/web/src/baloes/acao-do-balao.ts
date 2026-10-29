import { REACOES, momentoDaCara, momentoDoBalao, type MomentoDoBalao, type SituacaoDoBalao } from './reacoes';
import { CARA_NO_ATLAS, type CaraDoBalao } from './rosto';

/**
 * As ações do corpo do balão do artista (`balao.glb`), pelo nome do jogo. As seis primeiras são do v1; as outras, do v2 (L46): se o
 * arquivo não as tem, `resolverPedido` recua para a reação do v1.
 */
export type AcaoDoBalao = 'parado' | 'inclinar' | 'pulinho' | 'susto' | 'estufar' | 'murchar' | 'comemorar' | 'rir' | 'bravo' | 'concentrar' | 'impaciente' | 'ufa' | 'desanimar';

/** O nome de cada ação no arquivo do artista. */
export const NOME_DA_ACAO: Readonly<Record<AcaoDoBalao, string>> = {
  parado: 'balao_parado',
  inclinar: 'balao_inclinar',
  pulinho: 'balao_pulinho',
  susto: 'balao_susto',
  estufar: 'balao_estufar',
  murchar: 'balao_murchar',
  comemorar: 'balao_comemorar',
  rir: 'balao_rir',
  bravo: 'balao_bravo',
  concentrar: 'balao_concentrar',
  impaciente: 'balao_impaciente',
  ufa: 'balao_ufa',
  desanimar: 'balao_desanimar',
};

/** O nome de cada cara na forma (morph target) do arquivo. */
export const NOME_DA_CARA: Readonly<Record<CaraDoBalao, string>> = {
  neutro: 'cara_neutro',
  sorriso: 'cara_sorriso',
  comemorando: 'cara_comemorando',
  susto: 'cara_susto',
  desanimado: 'cara_triste',
  desconfiado: 'cara_desconfiado',
  ufa: 'cara_ufa',
  bravo: 'cara_bravo',
  rindo: 'cara_rindo',
  convencido: 'cara_convencido',
  triste: 'cara_triste',
  concentrado: 'cara_concentrado',
  tedio: 'cara_tedio',
};

/** Como a partida acabou para a equipe do balão. */
export type ResultadoDoFim = 'ganhou' | 'perdeu';

/** O que o balão faz agora: a ação do corpo (e se repete o trecho do meta até o jogo soltá-la), a cara, e o momento que a pediu. */
export interface PedidoDoBalao {
  acao: AcaoDoBalao;
  repetir: boolean;
  cara: CaraDoBalao;
  momento: MomentoDoBalao;
}

/** O que o arquivo carregado tem (o `PersonagemDeRosto` responde a isto). */
export interface ArquivoDoBalao {
  temAcao(nome: string): boolean;
  temCiclo(nome: string): boolean;
  temCara(nome: string): boolean;
}

/**
 * O pedido do balão neste instante (a tabela `REACOES`), a partir do rosto que a mesa e o jogo provocam (`RostoDoBalao`), de o
 * outro estar mirando, de a vez dele estar demorando e do fim da partida. Escreve em `saida`; nada aloca.
 *
 * Uma cara que a tabela não conhece (a triste fora do fim, a forçada pelo gancho de teste) segue como veio. No fim, a cara do roteiro
 * é a neutra até a virada: antes dela o corpo já faz a ação e a cara só muda quando o roteiro pede.
 */
export function pedidoDoBalao(cara: CaraDoBalao, situacao: SituacaoDoBalao, saida: PedidoDoBalao = { acao: 'parado', repetir: false, cara: 'neutro', momento: 'parado' }): PedidoDoBalao {
  const momento = momentoDoBalao(cara, situacao);
  const reacao = REACOES[momento];
  saida.momento = momento;
  saida.acao = reacao.acao;
  saida.repetir = reacao.repetir;
  if (situacao.fim !== null) saida.cara = cara === 'neutro' ? 'neutro' : reacao.cara;
  else if (cara !== 'neutro' && momentoDaCara(cara) === undefined) saida.cara = cara;
  else saida.cara = reacao.cara;
  return saida;
}

/**
 * Ajusta o pedido ao arquivo carregado, no lugar. Sem a ação (o `.glb` v1) vale o recuo da tabela, que é o que o balão fazia antes do
 * L46; a ação que existe mas não tem trecho de ciclo é feita uma vez, em vez de lançar; a cara que falta vira a do recuo (ou a mais
 * parecida das que o procedural desenha).
 */
export function resolverPedido(pedido: PedidoDoBalao, arquivo: ArquivoDoBalao): PedidoDoBalao {
  const reacao = REACOES[pedido.momento];
  const daTabela = pedido.cara === reacao.cara;
  if (!arquivo.temAcao(NOME_DA_ACAO[pedido.acao])) {
    pedido.acao = reacao.recuo.acao;
    pedido.repetir = reacao.recuo.repetir;
    if (daTabela) pedido.cara = reacao.recuo.cara;
  }
  if (pedido.repetir && !arquivo.temCiclo(NOME_DA_ACAO[pedido.acao])) pedido.repetir = false;
  if (!arquivo.temCara(NOME_DA_CARA[pedido.cara])) pedido.cara = daTabela ? reacao.recuo.cara : CARA_NO_ATLAS[pedido.cara];
  if (!arquivo.temCara(NOME_DA_CARA[pedido.cara])) pedido.cara = 'neutro';
  return pedido;
}
