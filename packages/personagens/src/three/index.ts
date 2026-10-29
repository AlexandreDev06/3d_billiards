/** A camada que desenha: carrega o `.glb`, tinge o látex, escolhe a malha pelo nível, espelha e toca poses e gestos com o `AnimationMixer`. */
export { BaseDoPersonagem, carregarPersonagem, carregarPersonagemDeBytes, type OpcoesDeCarga, type OpcoesDeCargaPelaRede } from './carregar';
export { PersonagemEmCena, type InsumosDoPersonagem, type OpcoesDoGestoEmCena } from './personagem';
export { materialDeLatex, tingirMaterial, type LatexDoArtista, type MaterialTingivel, type NivelDeDetalhe } from './latex';
export { DE_GLTF_PARA_PERSONAGEM, NOMES_DAS_MALHAS_PADRAO, type NomesDasMalhas } from './ficha-do-gltf';
export { BaseDoRosto, carregarPersonagemDeRosto, carregarPersonagemDeRostoDeBytes, type OpcoesDeCargaDoRosto } from './carregar-rosto';
export { BaseDeAcessorios, carregarAcessorios, carregarAcessoriosDeBytes, type NivelDoAcessorio, type OpcoesDeCargaDosAcessorios } from './acessorios';
export {
  PersonagemDeRosto,
  type AjustesDoMovimento,
  type AparenciaDoPersonagem,
  type InsumosDoRosto,
  type OpcoesDaInstancia,
  type OpcoesDeMovimento,
  type PontoDoMundo,
  type RecursosDoPersonagem,
} from './rosto-em-cena';
export { CorpoEmCena, type OpcoesDoCorpoEmCena, type OssosDoCorpo } from './corpo-em-cena';
export { OlharEmCena, type OpcoesDoOlharEmCena } from './olhar-em-cena';
export { CordinhaEmCena } from './cordinha-em-cena';
export { OssoAditivo } from './aditivo-de-osso';
