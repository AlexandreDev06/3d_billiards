/**
 * A física da sala (L38): os 8 valores da física que o anfitrião pode mexer (os mesmos do painel F1 do cliente), com a faixa, o
 * passo e o padrão de cada um, como dado. A sala guarda os valores e manda a todos; cada cliente simula com eles, e a gravação
 * que ele transmite segue sendo a verdade (a sala não re-simula).
 *
 * Os padrões são os de `CONFIG_FISICA_PADRAO` da física: aqui eles são números escritos à mão (este pacote só importa TIPOS de
 * `@sinuca/fisica`) e um teste compara cada um com a física, então mudar um lá sem mudar aqui deixa o teste vermelho.
 */
import type { ConfigFisica } from '@sinuca/fisica';

/** As chaves de `ConfigFisica` que a sala deixa o anfitrião mexer, na ordem do painel. */
export const CHAVES_DA_FISICA_DA_SALA = [
  'atritoDeslizamento',
  'atritoRolamento',
  'desaceleracaoGiro',
  'fatorEfeitoLateral',
  'restituicaoBolaBola',
  'restituicaoBolaTabela',
  'atritoBolaTabela',
  'velocidadeMaxTaco',
] as const satisfies readonly (keyof ConfigFisica)[];

export type ChaveDaFisicaDaSala = (typeof CHAVES_DA_FISICA_DA_SALA)[number];

/** A faixa que o painel oferece (`min` a `max`, de `passo` em `passo`) e o valor padrão da física. */
export interface FaixaDaFisica {
  readonly min: number;
  readonly max: number;
  readonly passo: number;
  readonly padrao: number;
}

/** As faixas do painel do cliente (`DESCRITORES` do grupo `fisica`), com folga nas pontas para o ouvido decidir; o padrão é o da física. */
export const FAIXAS_DA_FISICA_DA_SALA: Readonly<Record<ChaveDaFisicaDaSala, FaixaDaFisica>> = {
  atritoDeslizamento: { min: 0.1, max: 0.5, passo: 0.005, padrao: 0.2 },
  atritoRolamento: { min: 0.002, max: 0.05, passo: 0.0005, padrao: 0.02 },
  desaceleracaoGiro: { min: 2, max: 25, passo: 0.5, padrao: 20 },
  fatorEfeitoLateral: { min: 0.2, max: 1, passo: 0.05, padrao: 0.6 },
  restituicaoBolaBola: { min: 0.85, max: 0.99, passo: 0.005, padrao: 0.95 },
  restituicaoBolaTabela: { min: 0.5, max: 0.95, passo: 0.01, padrao: 0.85 },
  atritoBolaTabela: { min: 0.05, max: 0.5, passo: 0.01, padrao: 0.2 },
  velocidadeMaxTaco: { min: 3, max: 12, passo: 0.1, padrao: 8 },
};

/** A física da sala completa: os 8 valores. É o que o `estado-sala` leva e o que cada cliente usa para simular. */
export type FisicaSala = Readonly<Record<ChaveDaFisicaDaSala, number>>;

/** O pedido do anfitrião em `configurar-sala`: só as chaves que quer mudar. */
export type FisicaParcial = Readonly<Partial<Record<ChaveDaFisicaDaSala, number>>>;

/** A física de quem não mexe: a padrão da física. */
export const FISICA_DA_SALA_PADRAO: FisicaSala = Object.freeze(
  Object.fromEntries(CHAVES_DA_FISICA_DA_SALA.map((chave) => [chave, FAIXAS_DA_FISICA_DA_SALA[chave].padrao])),
) as FisicaSala;

/**
 * Quantas casas decimais tem o passo da chave (0,0005 tem 4): é a precisão a que um valor encaixado é arredondado, para a conta
 * de grade (`min + degrau × passo`) não deixar sobra de ponto flutuante.
 */
function casasDoPasso(passo: number): number {
  return (String(passo).split('.')[1] ?? '').length;
}

/**
 * Leva um número à grade da chave: corta à faixa (`min` a `max`), vai ao degrau mais próximo (de `passo` em `passo` a partir do
 * `min`) e arredonda às casas do passo. Sem o arredondamento, o que um controle deslizante calcula (`0,002 + 36 × 0,0005` dá
 * `0,020000000000000004`) nunca seria igual ao padrão (`0,02`) e deixaria a sala "mexida" para sempre. O resultado é sempre o
 * mesmo número que se escreve à mão (`0,02`), e encaixar de novo não o muda.
 */
function encaixarNaGrade(chave: ChaveDaFisicaDaSala, valor: number): number {
  const { min, max, passo } = FAIXAS_DA_FISICA_DA_SALA[chave];
  const cortado = Math.min(max, Math.max(min, valor));
  const encaixado = Number((min + Math.round((cortado - min) / passo) * passo).toFixed(casasDoPasso(passo)));
  return Math.min(max, Math.max(min, encaixado));
}

/**
 * Limpa um pedido de física que vem de fora (rede, disco, URL): fica só o que é uma das 8 chaves com um número finito, cortado
 * à faixa dela (`min` a `max`), encaixado no passo e arredondado às casas dele (`encaixarNaGrade`); o resto (chave desconhecida,
 * texto, `NaN`, `null`, o próprio pedido que não é um objeto) é descartado. Não completa nada: quem completa é
 * `completarFisicaDaSala`.
 */
export function sanearFisicaDaSala(valor: unknown): FisicaParcial {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return {};
  const saida: Partial<Record<ChaveDaFisicaDaSala, number>> = {};
  for (const chave of CHAVES_DA_FISICA_DA_SALA) {
    if (!Object.hasOwn(valor, chave)) continue;
    const v = (valor as Record<string, unknown>)[chave];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    saida[chave] = encaixarNaGrade(chave, v);
  }
  return saida;
}

/**
 * A física depois de um pedido: `null` restaura o padrão; um parcial (já limpo por `sanearFisicaDaSala`, que esta função chama
 * de novo, porque a sala não confia em quem chamou) muda só as chaves que traz sobre `base`; `undefined` não muda nada.
 */
export function completarFisicaDaSala(pedido: FisicaParcial | null | undefined, base: FisicaSala = FISICA_DA_SALA_PADRAO): FisicaSala {
  if (pedido === undefined) return base;
  if (pedido === null) return FISICA_DA_SALA_PADRAO;
  return { ...base, ...sanearFisicaDaSala(pedido) };
}

/**
 * A física difere da padrão em alguma das 8 chaves? É o que tira uma tacada (e a partida) das missões e das estatísticas. Cada
 * valor passa antes pela mesma grade de `sanearFisicaDaSala`, então uma sobra de ponto flutuante (`0,020000000000000004`) não conta
 * como diferença.
 */
export function fisicaDiferenteDoPadrao(fisica: FisicaSala): boolean {
  return CHAVES_DA_FISICA_DA_SALA.some((chave) => encaixarNaGrade(chave, fisica[chave]) !== FAIXAS_DA_FISICA_DA_SALA[chave].padrao);
}
