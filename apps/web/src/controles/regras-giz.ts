/**
 * As regras do giz da mesa, iguais para todos: quanto cada tacada gasta e como se passa o giz de novo. Hoje valem os
 * padrões; o L17 faz a sala escolher os quatro números no lobby e entregá-los por `aplicarRegrasDaMesa` (main.ts).
 */
export interface RegrasGiz {
  /** Menor desgaste de uma tacada (fração do giz inteiro); o desgaste é sorteado uniforme entre este e `desgasteMax`. */
  readonly desgasteMin: number;
  /** Maior desgaste de uma tacada (fração do giz inteiro). */
  readonly desgasteMax: number;
  /** Quanto cada passada soma ao nível (fração do giz inteiro). */
  readonly passada: number;
  /** Quanto demora cada passada (s); segurando G elas se encadeiam até o giz ficar cheio. */
  readonly passadaS: number;
}

export const REGRAS_GIZ_PADRAO: RegrasGiz = { desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 };

/** Faixas aceitas: o que a sala mandar é cortado aqui, para um número fora de jogo não travar a mesa. */
export const FAIXAS_DO_GIZ = {
  desgaste: { min: 0, max: 1 },
  passada: { min: 0.01, max: 1 },
  passadaS: { min: 0.2, max: 30 },
} as const;

const dentro = (valor: unknown, padrao: number, min: number, max: number): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.min(Math.max(valor, min), max) : padrao;

/**
 * Completa o que faltar com o padrão e põe cada número na sua faixa; se o mínimo do desgaste passar do máximo, os dois
 * trocam de lugar (o sorteio sempre tem um intervalo válido).
 */
export function sanearRegrasGiz(bruto: Partial<Record<keyof RegrasGiz, unknown>> | null | undefined): RegrasGiz {
  const f = FAIXAS_DO_GIZ;
  const p = REGRAS_GIZ_PADRAO;
  const min = dentro(bruto?.desgasteMin, p.desgasteMin, f.desgaste.min, f.desgaste.max);
  const max = dentro(bruto?.desgasteMax, p.desgasteMax, f.desgaste.min, f.desgaste.max);
  return {
    desgasteMin: Math.min(min, max),
    desgasteMax: Math.max(min, max),
    passada: dentro(bruto?.passada, p.passada, f.passada.min, f.passada.max),
    passadaS: dentro(bruto?.passadaS, p.passadaS, f.passadaS.min, f.passadaS.max),
  };
}
