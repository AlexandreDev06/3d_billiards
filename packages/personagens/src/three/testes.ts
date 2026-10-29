/**
 * `@sinuca/personagens/testes`: o que só os testes usam (quem carrega o `.glb` no Node e quem prova que um quadro não aloca). Fica
 * fora de `@sinuca/personagens` e de `@sinuca/personagens/three` de propósito: `gerenciadorDeTestes` mexe em `globalThis.self`, e o
 * perfilador de alocação usa o inspetor do Node.
 */
export { gerenciadorDeTestes } from './para-testes-three';
export { medirAlocacao, provarSemAlocar, TAMANHO_DE_UM_NUMERO_B, TEMPO_DO_PERFILADOR_MS, type AlocacaoMedida, type LocalDeAlocacao } from '../alocacao-para-testes';
export { sorteioDeTeste } from '../para-testes';
