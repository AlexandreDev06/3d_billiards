import {
  PREMIO_POR_NIVEL,
  diaDaMissao,
  fimDoDiaMs,
  missaoDoCatalogo,
  missoesDoDia,
  premioDaMissao,
  type IdMissao,
  type MissoesDoDia,
  type NivelDaMissao,
} from '@sinuca/protocolo';

/** O nome do nível na tela. */
export const ROTULO_DO_NIVEL: Readonly<Record<NivelDaMissao, string>> = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' };

/** Quanto se ganha por dia se as três missões fecham (uma de cada nível). */
export const TOTAL_DO_DIA = PREMIO_POR_NIVEL.facil + PREMIO_POR_NIVEL.media + PREMIO_POR_NIVEL.dificil;

const MS_POR_MINUTO = 60_000;

/** "3 h 20 min", "42 min" ou "menos de 1 min": o tempo até virar o dia (nunca negativo). */
export function tempoParaVirar(fimMs: number, agoraMs: number): string {
  const minutos = Math.max(Math.ceil((fimMs - agoraMs) / MS_POR_MINUTO), 0);
  if (minutos < 1) return 'menos de 1 min';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

export interface CartaoDeMissao {
  readonly id: IdMissao;
  readonly nivel: NivelDaMissao;
  /** "Fácil", "Média" ou "Difícil". */
  readonly rotuloDoNivel: string;
  readonly nome: string;
  readonly descricao: string;
  readonly premio: number;
  /** "+50". */
  readonly textoDoPremio: string;
  readonly progresso: number;
  readonly meta: number;
  /** "3 de 5". */
  readonly textoDoProgresso: string;
  /** De 0 a 1, para a largura da barra. */
  readonly fracao: number;
  readonly cumprida: boolean;
}

export interface MissoesNaTela {
  /** `carteira`: o progresso é o da carteira; `catalogo`: só as missões do dia, sem progresso (sem carteira ou servidor fora do ar). */
  readonly origem: 'carteira' | 'catalogo';
  /** O recado de quem não tem carteira: as missões só valem online, em partida apostada. `null` quando o progresso é de verdade. */
  readonly aviso: string | null;
  /** "Faltam 3 h 20 min para virar o dia". */
  readonly restante: string;
  /** Moedas já ganhas hoje com as missões. */
  readonly ganhoHoje: number;
  /** "70 de 220 moedas hoje". */
  readonly textoDoGanho: string;
  readonly cartoes: readonly CartaoDeMissao[];
  /** O fim do dia que a tela mostra (ms desde 1970), para quem agenda a virada. */
  readonly fimMs: number;
}

export const AVISO_SEM_CARTEIRA = 'Sem carteira, as missões só aparecem: elas valem online, em partida apostada.';

function cartao(id: IdMissao, progresso: number): CartaoDeMissao {
  const m = missaoDoCatalogo(id);
  const andado = Math.min(Math.max(Math.trunc(progresso), 0), m.meta);
  const premio = premioDaMissao(id);
  return {
    id,
    nivel: m.nivel,
    rotuloDoNivel: ROTULO_DO_NIVEL[m.nivel],
    nome: m.nome,
    descricao: m.descricao,
    premio,
    textoDoPremio: `+${premio}`,
    progresso: andado,
    meta: m.meta,
    textoDoProgresso: `${andado} de ${m.meta}`,
    fracao: andado / m.meta,
    cumprida: andado >= m.meta,
  };
}

/**
 * O painel "Missões do dia" a partir do quadro da carteira (`null` = sem carteira lida, ou sala que não manda missões): sem
 * quadro mostra as 3 do dia de agora (`missoesDoDia`) com o aviso. Um quadro cujo dia já acabou (o lobby ficou aberto na virada)
 * mostra as do dia novo, zeradas, enquanto a leitura nova não chega.
 */
export function missoesNaTela(quadro: MissoesDoDia | null, agoraMs: number): MissoesNaTela {
  const virou = quadro !== null && agoraMs >= quadro.fimMs;
  const usaQuadro = quadro !== null && !virou;
  const dia = diaDaMissao(agoraMs);
  const cartoes = usaQuadro ? quadro.itens.map((i) => cartao(i.id, i.progresso)) : missoesDoDia(dia).map((m) => cartao(m.id, 0));
  const fimMs = usaQuadro ? quadro.fimMs : fimDoDiaMs(agoraMs);
  const ganhoHoje = cartoes.filter((c) => c.cumprida).reduce((soma, c) => soma + c.premio, 0);
  return {
    origem: quadro === null ? 'catalogo' : 'carteira',
    aviso: quadro === null ? AVISO_SEM_CARTEIRA : null,
    restante: `Faltam ${tempoParaVirar(fimMs, agoraMs)} para virar o dia`,
    ganhoHoje,
    textoDoGanho: `${ganhoHoje} de ${TOTAL_DO_DIA} moedas hoje`,
    cartoes,
    fimMs,
  };
}

// ---------------------------------------------------------------- o que a tacada trouxe

export type TipoDoAvisoDeMissao = 'progresso' | 'cumprida';

export interface AvisoDeMissao {
  readonly tipo: TipoDoAvisoDeMissao;
  readonly id: IdMissao;
  /** "Mão quente 3/5" ou "Missão cumprida! Tabelada +100". */
  readonly texto: string;
}

/** O aviso discreto de uma missão que andou sem fechar. */
export const textoDoProgresso = (id: IdMissao, progresso: number): string => `${missaoDoCatalogo(id).nome} ${progresso}/${missaoDoCatalogo(id).meta}`;

/** O aviso de festa de uma missão que fechou e pagou. */
export const textoDaMissaoCumprida = (id: IdMissao): string => `Missão cumprida! ${missaoDoCatalogo(id).nome} +${premioDaMissao(id)}`;

/**
 * O que mostrar quando chega a mensagem `missoes`: as que fecharam primeiro, em festa (e na ordem da sala), depois as que só
 * andaram. `antes` é o quadro que o aparelho conhecia (`null` = não conhecia; um quadro de outro dia conta como zerado): sem ele,
 * toda missão com progresso aparece, porque a sala só manda a mensagem quando alguma andou. Não olha o saldo: o prêmio já está nele.
 */
export function avisosDeMissao(antes: MissoesDoDia | null, depois: MissoesDoDia, cumpridas: readonly IdMissao[]): readonly AvisoDeMissao[] {
  const mesmoDia = antes !== null && antes.dia === depois.dia;
  const progressoAntes = (id: IdMissao): number => (mesmoDia ? (antes.itens.find((i) => i.id === id)?.progresso ?? 0) : 0);
  const festas: AvisoDeMissao[] = cumpridas.map((id) => ({ tipo: 'cumprida', id, texto: textoDaMissaoCumprida(id) }));
  const andaram: AvisoDeMissao[] = [];
  for (const item of depois.itens) {
    if (cumpridas.includes(item.id) || item.cumprida) continue;
    if (item.progresso > progressoAntes(item.id)) andaram.push({ tipo: 'progresso', id: item.id, texto: textoDoProgresso(item.id, item.progresso) });
  }
  return [...festas, ...andaram];
}
