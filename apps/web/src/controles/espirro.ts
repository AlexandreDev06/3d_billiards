import type { ConfigFisica, EventoTacada, ParametrosTacada } from '@sinuca/fisica';

/** Por que o taco espirrou: `giz` (faltou giz na ponta) ou `efeito` (o efeito passou do que nem o giz inteiro segura). */
export type CausaDoEspirro = 'giz' | 'efeito';

export const TEXTO_DO_ESPIRRO: Readonly<Record<CausaDoEspirro, string>> = {
  giz: 'Espirrou! Faltou giz',
  efeito: 'Espirrou! Efeito demais',
};

/** O taco bateu no bolão e espirrou (miscue): o único evento que dispara o alerta. */
export function ehEspirro(evento: EventoTacada): boolean {
  return evento.tipo === 'taco-bola' && evento.miscue;
}

/**
 * A causa mostrada no alerta. É `efeito` quando o giz já estava alto (`gizAlto`, 0–1: sobrou pouco a ganhar passando mais) ou
 * quando o efeito passa do limite com giz inteiro (`limiteEfeitoComGiz`: nem um giz novo salvaria); senão é `giz`: um taco
 * com giz melhor teria aguentado aquele efeito. Os `parametros` são os da tacada que espirrou, também os de quem joga em
 * outra tela.
 */
export function causaDoEspirro(
  parametros: Pick<ParametrosTacada, 'efeito' | 'giz'>,
  fisica: Pick<ConfigFisica, 'limiteEfeitoComGiz' | 'efeitoMaximo'>,
  gizAlto: number,
): CausaDoEspirro {
  const deslocamento = Math.min(Math.hypot(parametros.efeito.lateral, parametros.efeito.vertical), fisica.efeitoMaximo);
  return parametros.giz >= gizAlto || deslocamento > fisica.limiteEfeitoComGiz ? 'efeito' : 'giz';
}

/** A frase do alerta da tacada que espirrou. */
export function textoDoEspirro(
  parametros: Pick<ParametrosTacada, 'efeito' | 'giz'>,
  fisica: Pick<ConfigFisica, 'limiteEfeitoComGiz' | 'efeitoMaximo'>,
  gizAlto: number,
): string {
  return TEXTO_DO_ESPIRRO[causaDoEspirro(parametros, fisica, gizAlto)];
}
