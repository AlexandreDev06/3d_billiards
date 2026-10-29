import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, type ConfigFisica, type EstadoMesa, type IdBola, type Ponto2 } from '@sinuca/fisica';
import { missaoDoCatalogo } from '@sinuca/protocolo';

/** Os cenários prontos do treino são as três missões difíceis do dia: a mesa já vem armada para a jogada. */
export type IdDoCenario = 'tabelada' | 'de-longe' | 'volta-ao-mundo';

/** Uma mesa armada à mão para treinar uma jogada: onde a branca e cada bola ficam (o nome e a descrição são os da missão). */
export interface CenarioDeTreino {
  readonly id: IdDoCenario;
  readonly nome: string;
  readonly descricao: string;
  readonly branca: Ponto2;
  readonly bolas: readonly { readonly id: IdBola; readonly x: number; readonly z: number }[];
}

function doCatalogo(id: IdDoCenario): Pick<CenarioDeTreino, 'id' | 'nome' | 'descricao'> {
  const m = missaoDoCatalogo(id);
  return { id, nome: m.nome, descricao: m.descricao };
}

/**
 * Os três cenários, escolhidos pela física real (`simularTacada` com a física padrão e a conferência da missão: a sala `missoes.ts`
 * lida da gravação; a varredura está em `.outros/lote-42/`). Em todos a tacada que cumpre a missão existe e é estreita, e o teste
 * (`cenarios.test.ts`) dá uma delas e mede a janela de pontaria. O treino não confere missão: o cenário só arma a mesa.
 * - Tabelada: a 1 colada na tabela de baixo; a branca a bate de raspão e ela volta pela tabela e cai direto na caçapa.
 * - De longe: a 1 perto da caçapa do canto, a 1,68 m da branca: um corte fino, de ponta a ponta da mesa.
 * - Volta ao mundo: a branca no canto de cima e a 1 do outro lado, com o caminho livre: a branca tem de sair batendo em três tabelas.
 */
export const CENARIOS_DE_TREINO: readonly CenarioDeTreino[] = [
  { ...doCatalogo('tabelada'), branca: { x: 0, z: -0.35 }, bolas: [{ id: 1, x: -0.15, z: -0.5 }] },
  { ...doCatalogo('de-longe'), branca: { x: -0.5, z: -0.35 }, bolas: [{ id: 1, x: 0.95, z: 0.5 }] },
  { ...doCatalogo('volta-ao-mundo'), branca: { x: -0.85, z: 0.5 }, bolas: [{ id: 1, x: 0.75, z: -0.3 }] },
];

export function cenarioDeTreino(id: IdDoCenario): CenarioDeTreino {
  const c = CENARIOS_DE_TREINO.find((x) => x.id === id);
  if (!c) throw new RangeError(`cenário desconhecido: ${id}`);
  return c;
}

/** A mesa do cenário: a branca e as bolas dele paradas, nada mais. */
export function mesaDoCenario(cenario: CenarioDeTreino, config: ConfigFisica = CONFIG_FISICA_PADRAO): EstadoMesa {
  return { bolas: [bolaParada(ID_BOLAO, cenario.branca, config), ...cenario.bolas.map((b) => bolaParada(b.id, { x: b.x, z: b.z }, config))] };
}
