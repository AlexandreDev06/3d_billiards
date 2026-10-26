/** A camada que desenha: carrega o `.glb`, tinge o látex, escolhe a malha pelo nível, espelha e toca poses e gestos com o `AnimationMixer`. */
export { BaseDoPersonagem, carregarPersonagem, carregarPersonagemDeBytes, type OpcoesDeCarga, type OpcoesDeCargaPelaRede } from './carregar';
export { PersonagemEmCena, type InsumosDoPersonagem, type OpcoesDoGestoEmCena } from './personagem';
export { materialDeLatex, tingirMaterial, type MaterialTingivel, type NivelDeDetalhe } from './latex';
export { DE_GLTF_PARA_PERSONAGEM, NOMES_DAS_MALHAS_PADRAO, type NomesDasMalhas } from './ficha-do-gltf';
export { BaseDoRosto, carregarPersonagemDeRosto, carregarPersonagemDeRostoDeBytes, type OpcoesDeCargaDoRosto } from './carregar-rosto';
export { PersonagemDeRosto, type InsumosDoRosto, type OpcoesDaInstancia, type PontoDoMundo } from './rosto-em-cena';
