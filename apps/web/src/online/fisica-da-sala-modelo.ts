import type { ConfigFisica } from '@sinuca/fisica';
import {
  CHAVES_DA_FISICA_DA_SALA,
  FISICA_DA_SALA_PADRAO,
  fisicaDiferenteDoPadrao,
  type FisicaParcial,
  type FisicaSala,
  type MsgEstadoSala,
  type MsgFisicaAlterada,
} from '@sinuca/protocolo';

/**
 * A física pelo anfitrião (L42, contra o L38 da sala), sem DOM: qual física vale para simular, o que o painel F1 mostra e pode
 * mexer, e os textos da espera e do aviso. A gravação que cada cliente transmite segue sendo a verdade; aqui só se escolhe com que
 * física a tacada e a previsão deste aparelho são simuladas.
 */

/**
 * A config de física de uma tacada: a local (a padrão, ou a do painel no mesmo PC e no treino) com os 8 valores da sala por cima
 * quando há sala. Sem sala (`null`, também depois de sair dela) volta a local, sem sobra da sala.
 */
export function configDeFisica(local: ConfigFisica, sala: FisicaSala | null | undefined): ConfigFisica {
  if (!sala) return local;
  const cfg = { ...local } as { -readonly [K in keyof ConfigFisica]: ConfigFisica[K] };
  for (const chave of CHAVES_DA_FISICA_DA_SALA) cfg[chave] = sala[chave];
  return cfg;
}

/** A física da sala como o `estado-sala` a mandou (completa); uma sala que não disse nada tem a padrão. */
export const fisicaDoEstado = (estado: MsgEstadoSala | null | undefined): FisicaSala => estado?.fisica ?? FISICA_DA_SALA_PADRAO;

/** A sala diz que a física difere da padrão (o `fisicaMexida` dela; sem ele, a conta dos valores). */
export const fisicaMexidaDoEstado = (estado: MsgEstadoSala | null | undefined): boolean =>
  estado?.fisicaMexida ?? (estado?.fisica === undefined ? false : fisicaDiferenteDoPadrao(estado.fisica));

/**
 * O que o painel F1 faz agora:
 * - `local`: sem sala (mesmo PC, treino, menu): os sliders mexem na física local;
 * - `anfitriao`: o dono da sala: cada mudança vai à sala (`configurar-sala.fisica`), "Restaurar" manda `null`;
 * - `travada`: o dono da sala, mas a sala não deixa agora (aposta valendo): só leitura, com a razão;
 * - `leitura`: quem não é anfitrião: vê a física da sala sem mexer.
 */
export type ModoDoPainelDeFisica =
  | { readonly tipo: 'local' }
  | { readonly tipo: 'anfitriao'; readonly fisica: FisicaSala; readonly mexida: boolean }
  | { readonly tipo: 'travada'; readonly fisica: FisicaSala; readonly mexida: boolean }
  | { readonly tipo: 'leitura'; readonly fisica: FisicaSala; readonly mexida: boolean };

/** Por que a sala não deixa o anfitrião mexer agora (o mesmo texto que ela manda no `erro`, para a nota do painel). */
export const NOTA_DA_FISICA_TRAVADA = 'A aposta trava a física: ela só muda na sala de espera, antes de apostar.';

/** `null` = sem sala. O anfitrião é quem a sala disse (`boas-vindas.anfitriao`). */
export function modoDoPainelDeFisica(sala: { readonly estado: MsgEstadoSala | null; readonly souAnfitriao: boolean } | null): ModoDoPainelDeFisica {
  if (sala === null) return { tipo: 'local' };
  const fisica = fisicaDoEstado(sala.estado);
  const mexida = fisicaMexidaDoEstado(sala.estado);
  if (!sala.souAnfitriao) return { tipo: 'leitura', fisica, mexida };
  return sala.estado?.fisicaTravada === true ? { tipo: 'travada', fisica, mexida } : { tipo: 'anfitriao', fisica, mexida };
}

/** Os valores que o painel mostra: os da sala quando há sala, os locais (do `EstadoDoPainel`) quando não. */
export function valoresDaFisicaNoPainel<V extends Readonly<Record<string, number>>>(modo: ModoDoPainelDeFisica, locais: V): V {
  if (modo.tipo === 'local') return locais;
  return { ...locais, ...modo.fisica };
}

/** O pedido de uma chave só (um slider mexeu): o parcial que o `configurar-sala` leva. */
export const pedidoDeUmaChave = (chave: keyof FisicaSala, valor: number): FisicaParcial => ({ [chave]: valor });

/** Junta pedidos que chegaram em pouco tempo (o slider manda um a cada pixel): vale o último valor de cada chave. */
export function juntarPedidos(pedidos: readonly FisicaParcial[]): FisicaParcial {
  return Object.assign({}, ...pedidos) as FisicaParcial;
}

/** A linha de física nas regras da espera: "Física: padrão" ou o aviso em destaque. */
export function linhaDaFisicaNaEspera(mexida: boolean): { readonly texto: string; readonly destaque: boolean } {
  return mexida ? { texto: 'Física mexida: missões e estatísticas não contam', destaque: true } : { texto: 'Física: padrão', destaque: false };
}

/** O aviso discreto da partida quando o anfitrião mexe na física (`fisica-alterada`). */
export function avisoDeFisicaAlterada(aviso: Pick<MsgFisicaAlterada, 'mexida'>): string {
  return aviso.mexida ? 'O anfitrião mudou a física' : 'O anfitrião voltou a física ao padrão';
}
