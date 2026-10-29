/**
 * `@sinuca/personagens`: a camada genérica dos personagens do jogo (hoje a mão), sem nada de sinuca. A parte pura (este arquivo) não
 * conhece three nem DOM; a que desenha está em `@sinuca/personagens/three`. Um personagem é um arquivo `.glb` (malha, esqueleto,
 * poses e gestos com nome) mais um arquivo de contatos (onde ele segura um cilindro e pinça um cubo em cada pose).
 */
export type { Ponto, Quarteto, Trio } from './tipos';
export { pontoVazio } from './tipos';
export { baseDoQuaternio, girarVetor, multiplicarQuaternios, quaternioDaBase, quaternioDoEixo } from './quaternios';
export type { Ficha, OssoDaFicha, PoseDaFicha } from './ficha';
export { indiceDoOsso, poseDeRepouso, validarFicha } from './ficha';
export type { Corrente } from './cinematica';
export { Cinematica } from './cinematica';
export type { ApoioDoContato, ContatoDeCilindro, ContatoDeGesto, ContatoDePalma, ContatoDePinca, Contatos } from './contatos';
export type { GestoDaMeta, MetaDoPersonagem } from './meta';
export { lerMeta } from './meta';
export { lerContatos, raioNoPonto } from './contatos';
export type {
  AcaoDoRosto,
  AncoraDaMeta,
  AncoraDeAcessorioDaMeta,
  CoresDeOlhoDaMeta,
  CordinhaDaMeta,
  EstiloDeOlhoDaMeta,
  EstilosDeOlhoDaMeta,
  LatexProposto,
  MetaDoRosto,
  OlhoDaMeta,
  PalpebrasDaMeta,
  RegraDeEscalaDoAcessorio,
  TamanhoDeRepouso,
  VarianteDaMeta,
} from './meta-do-rosto';
export { lerMetaDoRosto } from './meta-do-rosto';
export type { AcessorioDaMeta, MetaDosAcessorios } from './meta-dos-acessorios';
export { lerMetaDosAcessorios } from './meta-dos-acessorios';
export { escalaDoAcessorio } from './escala-do-acessorio';
export type { DefinicaoDaAcao, OpcoesDaAcao } from './acoes';
export { MisturaDeAcoes } from './acoes';
export type { OpcoesDasPalpebras, OpcoesDoPiscador } from './rosto';
export { MisturaDeCaras, PalpebrasDoOlhar, Piscadinha, Piscador } from './rosto';
export { girarOlho } from './olhar';
/** L46: o que faz o personagem parecer vivo, sem three (uma mola exata, ruído, o olhar, a atenção, o corpo e a cordinha). */
export { MolaAmortecida } from './mola';
export { RuidoSuave } from './ruido';
export type { EstadoDoOlhar, OpcoesDaPerseguicao, OpcoesDoOlhar, OpcoesParciaisDoOlhar } from './olhar-vivo';
export { OlharVivo, anguloDeVergencia } from './olhar-vivo';
export type { OpcoesDaAtencao } from './atencao';
export { Atencao } from './atencao';
export type { OpcoesDaGelatina, OpcoesDoCorpo, OpcoesDoFlutuar } from './movimento-secundario';
export { Flutuar, GelatinaDoCorpo, SeguidorDoCorpo } from './movimento-secundario';
export type { OpcoesDaCordinha } from './cordinha';
export { CordinhaSimulada } from './cordinha';
export { ancoraDaMatriz } from './ancora';
export type { AlvoDeCilindro, AlvoDePinca, AlvoDePlano, Colocacao, Quadro } from './alinhar';
export {
  alvoDeCilindroVazio,
  alvoDePincaVazio,
  alvoDePlanoVazio,
  apoiarPalma,
  baseDoCilindro,
  cilindroDoQuadro,
  cuboDoQuadro,
  misturarQuadros,
  pincarCubo,
  pontoNoMundo,
  quadroVazio,
  segurarCilindro,
  vetorNoMundo,
} from './alinhar';
export { MisturaDePoses, type OpcoesDoGesto } from './mistura';
export type { EsferaDoOsso, MalhaComPele } from './malha';
export { esferasDosOssos, pelarMalha, pontosDeApoio } from './malha';
export type { ModeloDoPersonagem, OpcoesDoModelo } from './modelo';
export { acharCorrentes, construirModelo, esferasNaPose } from './modelo';
