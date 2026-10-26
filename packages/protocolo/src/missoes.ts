/**
 * As missões diárias (L31): o catálogo, o prêmio e o sorteio do dia. Só dados e funções puras, sem rede nem relógio: quem
 * sabe a hora é quem chama.
 *
 * Todo mundo no servidor vê as mesmas 3 missões no dia (uma fácil, uma média e uma difícil), e cada uma paga o `PREMIO_POR_NIVEL`
 * dela uma vez por dia, na tacada que a cumpre. O que cada missão exige é conferido pela sala (`apps/sala/src/missoes.ts`);
 * aqui estão o nome, o texto da tela, a meta e os limiares como dado, para trocar uma missão sem mexer na conta.
 */

export type NivelDaMissao = 'facil' | 'media' | 'dificil';

/**
 * Como o progresso de uma missão anda: `soma` acumula entre tacadas e partidas do dia (matar 5 bolas); `maximo` guarda o
 * melhor valor visto (2 numa tacada, 3 seguidas).
 */
export type AcumuloDaMissao = 'soma' | 'maximo';

export interface Missao {
  readonly id: string;
  readonly nome: string;
  /** Frase curta para a tela. */
  readonly descricao: string;
  readonly nivel: NivelDaMissao;
  /** Quanto o progresso precisa chegar a valer. */
  readonly meta: number;
  readonly acumulo: AcumuloDaMissao;
  /**
   * O número que a missão compara, quando tem um: m/s do taco (na-pancada, no-carinho), efeito de 0 a 1 (efeito-ingles, siga,
   * puxada), metros (de-longe) ou tabelas da branca (volta-ao-mundo).
   */
  readonly limiar?: number;
}

/** Quanto cada missão paga, pelo nível, uma vez por dia (até 220 por dia: uma de cada nível). */
export const PREMIO_POR_NIVEL: Readonly<Record<NivelDaMissao, number>> = { facil: 50, media: 70, dificil: 100 };

/** O prêmio da missão: o do nível dela. */
export const premioDaMissao = (id: IdMissao): number => PREMIO_POR_NIVEL[missaoDoCatalogo(id).nivel];

/** O catálogo, na ordem em que a tela lista: fáceis, médias, difíceis. */
export const MISSOES = [
  { id: 'fregues-da-casa', nome: 'Freguês da casa', descricao: 'Termine 2 partidas.', nivel: 'facil', meta: 2, acumulo: 'soma' },
  { id: 'mao-quente', nome: 'Mão quente', descricao: 'Mate 5 bolas.', nivel: 'facil', meta: 5, acumulo: 'soma' },
  { id: 'pelo-meio', nome: 'Pelo meio', descricao: 'Mate 2 bolas nas caçapas do meio.', nivel: 'facil', meta: 2, acumulo: 'soma' },
  { id: 'saida-premiada', nome: 'Saída premiada', descricao: 'Mate uma bola na tacada de saída.', nivel: 'facil', meta: 1, acumulo: 'soma' },
  { id: 'embalado', nome: 'Embalado', descricao: 'Mate 2 bolas seguidas na mesma vez.', nivel: 'media', meta: 2, acumulo: 'maximo' },
  { id: 'na-pancada', nome: 'Na pancada', descricao: 'Mate uma bola com o taco a toda força.', nivel: 'media', meta: 1, acumulo: 'soma', limiar: 3.4 },
  { id: 'no-carinho', nome: 'No carinho', descricao: 'Mate uma bola com uma tacada bem de leve.', nivel: 'media', meta: 1, acumulo: 'soma', limiar: 1.0 },
  { id: 'efeito-ingles', nome: 'Efeito inglês', descricao: 'Mate uma bola com efeito para o lado.', nivel: 'media', meta: 1, acumulo: 'soma', limiar: 0.5 },
  { id: 'siga', nome: 'Siga!', descricao: 'Mate uma bola com efeito para cima.', nivel: 'media', meta: 1, acumulo: 'soma', limiar: 0.5 },
  { id: 'puxada', nome: 'Puxada', descricao: 'Mate uma bola com efeito para baixo.', nivel: 'media', meta: 1, acumulo: 'soma', limiar: 0.5 },
  { id: 'fecha-a-conta', nome: 'Fecha a conta', descricao: 'Ganhe uma partida.', nivel: 'media', meta: 1, acumulo: 'soma' },
  { id: 'tabelada', nome: 'Tabelada', descricao: 'Mate uma bola que bateu na tabela antes de cair.', nivel: 'dificil', meta: 1, acumulo: 'soma' },
  { id: 'de-longe', nome: 'De longe', descricao: 'Mate uma bola que estava a mais de 1,5 m da branca.', nivel: 'dificil', meta: 1, acumulo: 'soma', limiar: 1.5 },
  { id: 'volta-ao-mundo', nome: 'Volta ao mundo', descricao: 'Faça a branca bater em 3 tabelas antes de tocar uma bola.', nivel: 'dificil', meta: 1, acumulo: 'soma', limiar: 3 },
  { id: 'limpinho', nome: 'Limpinho', descricao: 'Ganhe uma partida sem cometer falta.', nivel: 'dificil', meta: 1, acumulo: 'soma' },
] as const satisfies readonly Missao[];

export type IdMissao = (typeof MISSOES)[number]['id'];

/** Uma missão do catálogo, com o id já tipado (`Missao.id` é texto para o catálogo poder ser escrito à mão). */
export type MissaoDoCatalogo = Missao & { readonly id: IdMissao };

const IDS_DAS_MISSOES: readonly string[] = MISSOES.map((m) => m.id);

/** O valor é o id de uma missão do catálogo? (`toString`, `__proto__` e afins não são.) */
export const ehIdDeMissao = (valor: unknown): valor is IdMissao => typeof valor === 'string' && IDS_DAS_MISSOES.includes(valor);

/** A missão do catálogo; lança se o id não existe (o tipo `IdMissao` já impede, isto cobre dado de fora). */
export function missaoDoCatalogo(id: IdMissao): MissaoDoCatalogo {
  const m = MISSOES.find((x) => x.id === id);
  if (!m) throw new RangeError(`missão desconhecida: ${id}`);
  return m;
}

// ---------------------------------------------------------------- o dia

const MS_POR_DIA = 86_400_000;
/** O dia vira à meia-noite de Brasília, em UTC−3 fixo (o Brasil não tem mais horário de verão). */
const DESLOCAMENTO_MS = 3 * 3_600_000;
const FORMATO_DO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** O dia da missão ('AAAA-MM-DD', em UTC−3) em que cai este instante (ms desde 1970). */
export function diaDaMissao(instanteMs: number): string {
  return new Date(instanteMs - DESLOCAMENTO_MS).toISOString().slice(0, 10);
}

/** Número inteiro do dia (dias desde 1970), ou `null` se o texto não é uma data de calendário. */
function numeroDoDia(dia: string): number | null {
  if (!FORMATO_DO_DIA.test(dia)) return null;
  const ms = Date.parse(`${dia}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== dia) return null;
  return ms / MS_POR_DIA;
}

/** O texto tem a forma de um dia da missão e é uma data que existe? */
export const ehDiaDaMissao = (valor: unknown): valor is string => typeof valor === 'string' && numeroDoDia(valor) !== null;

/** Quando o dia da missão `dia` termina (ms desde 1970): a próxima meia-noite de Brasília. */
export function fimDoDia(dia: string): number {
  const n = numeroDoDia(dia);
  if (n === null) throw new RangeError(`dia inválido: ${dia}`);
  return (n + 1) * MS_POR_DIA + DESLOCAMENTO_MS;
}

/** Quando termina o dia da missão em que cai este instante. */
export const fimDoDiaMs = (instanteMs: number): number => fimDoDia(diaDaMissao(instanteMs));

/** FNV-1a de 32 bits: o suficiente para espalhar o texto do dia, e igual em qualquer máquina. */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const NIVEIS: readonly NivelDaMissao[] = ['facil', 'media', 'dificil'];

/**
 * As 3 missões do dia, uma de cada nível (fácil, média, difícil), sorteadas por um hash do texto do dia: o mesmo dia dá as
 * mesmas missões em qualquer lugar e a qualquer hora, sem estado. Duas datas seguidas nunca dão a mesma trinca: a difícil de
 * dia par sai das posições pares da lista dos difíceis no catálogo e a de dia ímpar, das ímpares (com o catálogo atual, ao
 * menos 2 difíceis bastam). Lança se `dia` não for uma data 'AAAA-MM-DD'.
 */
export function missoesDoDia(dia: string): readonly [MissaoDoCatalogo, MissaoDoCatalogo, MissaoDoCatalogo] {
  const n = numeroDoDia(dia);
  if (n === null) throw new RangeError(`dia inválido: ${dia}`);
  const paridade = ((n % 2) + 2) % 2; // dias antes de 1970 (relógios de teste) têm n negativo
  const [facil, media, dificil] = NIVEIS.map((nivel) => {
    const doNivel: readonly MissaoDoCatalogo[] = MISSOES.filter((m) => m.nivel === nivel);
    const candidatas = nivel === 'dificil' && doNivel.length > 1 ? doNivel.filter((_, i) => i % 2 === paridade) : doNivel;
    return candidatas[hash(`${dia}/${nivel}`) % candidatas.length]!;
  });
  return [facil!, media!, dificil!];
}

// ---------------------------------------------------------------- o que a carteira mostra

export interface ItemDeMissao {
  readonly id: IdMissao;
  /** De 0 até a `meta` (o que passa dela não conta). */
  readonly progresso: number;
  readonly meta: number;
  /** `progresso` chegou à `meta`: a missão já pagou hoje. */
  readonly cumprida: boolean;
}

/** As missões de um dia e quanto a carteira já andou em cada uma. */
export interface MissoesDoDia {
  /** O dia da missão, 'AAAA-MM-DD' em UTC−3. */
  readonly dia: string;
  /** Quando o dia termina e as missões trocam (ms desde 1970, o relógio do servidor). */
  readonly fimMs: number;
  /** As 3 do dia, na ordem fácil, média, difícil. */
  readonly itens: readonly ItemDeMissao[];
}
