import { criarRng } from '@sinuca/fisica';
import { FORMATO_DO_MODO, MODOS_POR_MODALIDADE, equipeDoLugar, type ModoSala } from '@sinuca/protocolo';
import type { ConfigRegras, Jogador, Modalidade, PresetRegras } from '@sinuca/regras';
import type { MotorDeRegras } from './regras';

/**
 * Os modos que as regras sabem jogar com a `config` (a casa de uma modalidade): dos formatos que o catálogo do protocolo
 * dá a ela, os que `novaPartida` aceita. A prova é montar uma partida com a roda do modo, `lugar-N` em ordem como a sala os
 * põe. Na ordem do catálogo.
 */
export function modosDisponiveis(regras: MotorDeRegras, config: ConfigRegras): ModoSala[] {
  return MODOS_POR_MODALIDADE[config.modalidade].filter((modo) => {
    const roda: Jogador[] = FORMATO_DO_MODO[modo].equipes.map((_, lugar) => ({ id: `lugar-${lugar}`, nome: `Jogador ${lugar + 1}`, equipe: equipeDoLugar(modo, lugar) }));
    try {
      regras.novaPartida(config, roda, criarRng(1));
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Pergunta pronta para a tela: `(modalidade, modo) => as regras jogam?`, provada uma vez com o preset de cada modalidade
 * (`presets`, os de fábrica). Modalidade sem preset não joga nada.
 */
export function disponibilidadeDosModos(regras: MotorDeRegras, presets: readonly PresetRegras[]): (modalidade: Modalidade, modo: ModoSala) => boolean {
  const jogaveis = new Map<Modalidade, ReadonlySet<ModoSala>>(presets.map((p) => [p.regras.modalidade, new Set(modosDisponiveis(regras, p.regras))]));
  return (modalidade, modo) => jogaveis.get(modalidade)?.has(modo) ?? false;
}

/**
 * O que o "Jogar" da tela do mesmo PC faz com a partida que está de pé:
 * - `continuar`: é a mesma modalidade, o mesmo formato e ela não acabou (voltou pelo botão Menu): segue a mesma;
 * - `proxima`: a mesma modalidade e o mesmo formato e ela acabou: a partida nova sai pela roda que as regras mandam;
 * - `do-modo`: a modalidade ou o número de jogadores mudou: a partida nova começa com a roda inicial do modo.
 */
export type DecisaoDoJogar = 'continuar' | 'proxima' | 'do-modo';

/** A partida de pé, como `decidirJogarLocal` a vê. */
export interface PartidaDePe {
  readonly jogadores: number;
  readonly modalidade: Modalidade;
  readonly acabou: boolean;
}

export function decidirJogarLocal(partida: PartidaDePe, escolha: { readonly modalidade: Modalidade; readonly modo: ModoSala }): DecisaoDoJogar {
  if (partida.modalidade !== escolha.modalidade || partida.jogadores !== FORMATO_DO_MODO[escolha.modo].equipes.length) return 'do-modo';
  return partida.acabou ? 'proxima' : 'continuar';
}
