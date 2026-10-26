/**
 * O que o anfitrião configura na sala (relógio da tacada, linha de previsão, giz, força e o modo da modalidade):
 * completar o pedido, parcial, com o que a sala já tem. Puro: serve igual ao criar a sala (a base é o padrão) e na
 * espera (a base é a sala).
 */
import {
  APOSTAS_DA_SALA,
  APOSTA_PADRAO,
  GIZ_DA_SALA_PADRAO,
  LUGARES_POR_MODO,
  MODOS_POR_MODALIDADE,
  type ApostaSala,
  type GizSala,
  type LinhaSala,
  type ModoSala,
  type RelogioSala,
} from '@sinuca/protocolo';
import { ROTULO_MODALIDADE, type Modalidade } from '@sinuca/regras';

export type LinhaCompleta = Required<LinhaSala>;

export const LINHA_DESLIGADA: LinhaCompleta = { previsao: false, bolaAtingida: false };

/** A linha pedida completada com `base`; `bolaAtingida` só vale com a previsão ligada. */
export function completarLinha(pedido: Partial<LinhaSala> | undefined, base: LinhaCompleta = LINHA_DESLIGADA): LinhaCompleta {
  const previsao = pedido?.previsao ?? base.previsao;
  return { previsao, bolaAtingida: previsao && (pedido?.bolaAtingida ?? base.bolaAtingida) };
}

/** O relógio pedido completado com `base`, ou o texto da recusa (só `perde-a-vez` existe por enquanto). */
export function completarRelogio(pedido: Partial<RelogioSala> | undefined, base: RelogioSala): RelogioSala | string {
  const aoEsgotar = pedido?.aoEsgotar ?? base.aoEsgotar;
  if (aoEsgotar !== 'perde-a-vez') {
    return `Consequência "${aoEsgotar}" para o tempo esgotado ainda não existe: use "perde-a-vez".`;
  }
  return { tempoS: pedido?.tempoS === undefined ? base.tempoS : pedido.tempoS, aoEsgotar };
}

const percentual = (fracao: number): string => `${Math.round(fracao * 1000) / 10}%`;

/**
 * O giz pedido completado com `base` (o padrão ao criar a sala, o da sala na espera), ou o texto da recusa quando o
 * mínimo do desgaste passa do máximo. Cada número já vem dentro da faixa do protocolo (o esquema conferiu).
 */
export function completarGiz(pedido: Partial<GizSala> | undefined, base: GizSala = GIZ_DA_SALA_PADRAO): GizSala | string {
  const giz: GizSala = {
    desgasteMin: pedido?.desgasteMin ?? base.desgasteMin,
    desgasteMax: pedido?.desgasteMax ?? base.desgasteMax,
    passada: pedido?.passada ?? base.passada,
    passadaS: pedido?.passadaS ?? base.passadaS,
  };
  if (giz.desgasteMin > giz.desgasteMax) {
    return `O desgaste mínimo do giz (${percentual(giz.desgasteMin)}) passa do máximo (${percentual(giz.desgasteMax)}).`;
  }
  return giz;
}

/**
 * A aposta pedida (ou a `base`, quando não veio), ou o texto da recusa se não for uma do catálogo. O esquema do protocolo já
 * confere a forma no fio; a sala confere de novo porque dinheiro não depende de quem chamou.
 */
export function completarAposta(pedida: unknown, base: ApostaSala = APOSTA_PADRAO): ApostaSala | string {
  if (pedida === undefined) return base;
  const valida = APOSTAS_DA_SALA.find((a) => a === pedida);
  return valida ?? `A aposta tem de ser uma destas: ${APOSTAS_DA_SALA.join(', ')}.`;
}

/** A recusa de um modo que a modalidade não joga, com o que ela aceita. */
export const textoModoRecusado = (modalidade: Modalidade, modo: ModoSala): string =>
  `${ROTULO_MODALIDADE[modalidade]} não joga em ${modo} (aceita ${MODOS_POR_MODALIDADE[modalidade].join(', ')}).`;

/**
 * O modo da sala depois de um `configurar-sala`: o pedido, se a modalidade o joga (senão a recusa, com o que ela aceita);
 * sem pedido, o modo atual se ele serve à modalidade. Se não serve, o modo do catálogo com o MESMO número de lugares (quem
 * está sentado continua sentado: 2x2 → 1x1x1x1, 2x1 → 1x1x1) e, só se nenhum tiver o mesmo número, o primeiro do catálogo.
 * `catalogo` existe para os testes provarem o último caso.
 */
export function escolherModo(
  modalidade: Modalidade,
  pedido: ModoSala | undefined,
  atual: ModoSala,
  catalogo: Readonly<Record<Modalidade, readonly ModoSala[]>> = MODOS_POR_MODALIDADE,
): { readonly modo: ModoSala } | { readonly recusa: string } {
  const modos = catalogo[modalidade];
  if (pedido !== undefined) return modos.includes(pedido) ? { modo: pedido } : { recusa: textoModoRecusado(modalidade, pedido) };
  if (modos.includes(atual)) return { modo: atual };
  return { modo: modos.find((m) => LUGARES_POR_MODO[m] === LUGARES_POR_MODO[atual]) ?? modos[0]! };
}
