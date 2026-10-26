import { MODALIDADE_PADRAO, type ConfrontoPlacar, type PlacarSala } from '@sinuca/protocolo';
import { ROTULO_MODALIDADE, type EstadoPartida, type Modalidade } from '@sinuca/regras';

/**
 * Os apelidos de cada lado, de quem joga agora (ou de quem está sentado na sala de espera), na ordem das equipes: dois lados
 * no par ou ímpar, de dois a quatro (um por pessoa) no mata-mata.
 */
export type Formacao = readonly (readonly string[])[];

/** Um lado do confronto como a tela o mostra. */
export interface LadoNaTela {
  /** "Ana" ou "Ana e Caio". */
  readonly nome: string;
  readonly vitorias: number;
}

/** Um confronto pronto para desenhar: "Ana e Caio 2 × 0 Beto" (dois lados) ou "Ana 2 · Beto 1 · Caio 0" (três ou quatro). */
export interface ConfrontoNaTela {
  /** A modalidade em que foi jogado: o mesmo 1×1 de par ou ímpar e de mata-mata são confrontos diferentes. */
  readonly modalidade: Modalidade;
  /** O nome dela na tela ("Par ou ímpar", "Mata-mata"). */
  readonly rotuloDaModalidade: string;
  /** Dois a quatro lados, na ordem do fio. */
  readonly lados: readonly LadoNaTela[];
  /** A frase inteira, para leitor de tela e dica. */
  readonly texto: string;
  /** O índice do lado que está na frente; `null` no empate (ou quando o primeiro lugar é dividido). */
  readonly lider: number | null;
}

/** O que cada tela mostra do placar: o confronto de agora e os anteriores. */
export interface PlacarParaMostrar {
  /** `null` quando ainda não há o que mostrar (nenhuma partida contada e a formação não se conhece). */
  readonly atual: ConfrontoNaTela | null;
  /**
   * A formação de agora ainda não tem partida contada (0 × 0): é nova na sala. Vale na espera, que diz "confronto
   * novo", e some quando a primeira partida dela termina.
   */
  readonly novo: boolean;
  /** Do mais recente para o mais antigo. */
  readonly historico: readonly ConfrontoNaTela[];
  /** Pelo menos uma partida já foi contada nesta sala (ou neste PC): a sala de espera só mostra o placar daí em diante. */
  readonly contou: boolean;
}

export const SEM_PLACAR: PlacarParaMostrar = { atual: null, novo: false, historico: [], contou: false };

const nomesDoLado = (nomes: readonly string[]): string => nomes.join(' e ');

interface LadoBruto {
  readonly nomes: readonly string[];
  readonly vitorias: number;
}

/** "Ana 3 × 1 Beto" com dois lados; "Ana 2 · Beto 1 · Caio 0" com mais. */
function frase(lados: readonly LadoNaTela[]): string {
  if (lados.length === 2) {
    const [a, b] = lados as readonly [LadoNaTela, LadoNaTela];
    return `${a.nome} ${a.vitorias} × ${b.vitorias} ${b.nome}`;
  }
  return lados.map((l) => `${l.nome} ${l.vitorias}`).join(' · ');
}

/** O lado com mais vitórias; empate no topo não tem líder. */
function liderDe(lados: readonly LadoNaTela[]): number | null {
  const maior = Math.max(...lados.map((l) => l.vitorias));
  const quantos = lados.filter((l) => l.vitorias === maior).length;
  return quantos === 1 ? lados.findIndex((l) => l.vitorias === maior) : null;
}

function montar(lados: readonly LadoBruto[], modalidade: Modalidade): ConfrontoNaTela {
  const naTela = lados.map((l): LadoNaTela => ({ nome: nomesDoLado(l.nomes), vitorias: l.vitorias }));
  return { modalidade, rotuloDaModalidade: ROTULO_MODALIDADE[modalidade] ?? modalidade, lados: naTela, texto: frase(naTela), lider: liderDe(naTela) };
}

/** Um confronto do fio, pronto para a tela (sem `modalidade` vale o par ou ímpar). */
export const confrontoNaTela = (confronto: ConfrontoPlacar): ConfrontoNaTela => montar(confronto.lados, confronto.modalidade ?? MODALIDADE_PADRAO);

/** O confronto da formação de agora, antes de qualquer partida: 0 × 0. */
export const confrontoZerado = (formacao: Formacao, modalidade: Modalidade = MODALIDADE_PADRAO): ConfrontoNaTela =>
  montar(
    formacao.map((nomes) => ({ nomes, vitorias: 0 })),
    modalidade,
  );

/** Os apelidos de um lado como conjunto: a ordem dentro dele não conta. */
const chaveDoLado = (nomes: readonly string[]): string => [...new Set(nomes)].sort().join('\u0000');

/**
 * A formação é a do confronto, como conjuntos de apelidos: a ordem dentro do lado e a ordem dos lados não importam (os lados
 * trocados contam como o mesmo confronto; no mata-mata, as mesmas pessoas em qualquer ordem), e a modalidade tem de ser a
 * mesma (a sala decide por pessoa e não vê isto, mas dois apelidos diferentes são sempre duas pessoas diferentes: se o
 * apelido muda, a sala também abre outro confronto). Confronto sem `modalidade` é de par ou ímpar.
 */
export function mesmaFormacao(confronto: ConfrontoPlacar, formacao: Formacao, modalidade: Modalidade = MODALIDADE_PADRAO): boolean {
  if ((confronto.modalidade ?? MODALIDADE_PADRAO) !== modalidade) return false;
  const doConfronto = confronto.lados.map((l) => chaveDoLado(l.nomes)).sort();
  const dela = formacao.map(chaveDoLado).sort();
  return doConfronto.length === dela.length && doConfronto.every((chave, i) => chave === dela[i]);
}

/** Quem joga em cada equipe da partida, pelos apelidos, na ordem da roda; a equipe 0 vem primeiro. */
export function formacaoDaPartida(partida: EstadoPartida): Formacao {
  const equipes = Math.max(...partida.jogadores.map((j) => j.equipe)) + 1;
  return Array.from({ length: equipes }, (_, equipe) => partida.jogadores.filter((j) => j.equipe === equipe).map((j) => j.nome));
}

/**
 * O placar como cada tela o mostra (`null` ou `undefined` = sem placar: nada para mostrar). `formacao` é quem joga (ou está sentado) agora, se se sabe: se não é a do confronto
 * em curso, a sala só vai abrir um confronto novo quando a próxima partida terminar, então a tela já o mostra, em 0 × 0,
 * e o anterior desce para o histórico (como ficará). Sem `formacao` (sala de espera com lugar vago) o confronto em curso
 * fica como a sala o mandou: quem voltar continua nele.
 */
export function placarParaMostrar(placar: PlacarSala | null | undefined, formacao: Formacao | null, modalidade: Modalidade = MODALIDADE_PADRAO): PlacarParaMostrar {
  // Sem placar (sala de uma versão que ainda não o manda): não há o que mostrar, nem um 0 × 0 que seria mentira.
  if (placar == null) return SEM_PLACAR;
  const historico = placar.historico.map(confrontoNaTela);
  if (placar.atual === null) {
    return { atual: formacao === null ? null : confrontoZerado(formacao, modalidade), novo: formacao !== null, historico, contou: false };
  }
  if (formacao === null || mesmaFormacao(placar.atual, formacao, modalidade)) {
    return { atual: confrontoNaTela(placar.atual), novo: false, historico, contou: true };
  }
  return { atual: confrontoZerado(formacao, modalidade), novo: true, historico: [confrontoNaTela(placar.atual), ...historico], contou: true };
}

/**
 * Qual placar bruto a tela usa agora. No hot-seat, o contado neste PC. Online, o que a sala mandou, MENOS enquanto uma tacada
 * toca: o `estado-sala` com a partida contada chega na frente da animação da tacada que a decide, e mostrá-lo antes
 * estragaria o suspense; fica o de antes até a tacada valer.
 */
export function placarDaTela(entrada: {
  readonly online: boolean;
  /** Uma tacada ainda toca (ou espera a sala confirmá-la). */
  readonly tocando: boolean;
  /** O que a tela mostra agora. */
  readonly mostrado: PlacarSala | null;
  readonly sala: PlacarSala | undefined;
  readonly local: PlacarSala;
}): PlacarSala | null {
  if (!entrada.online) return entrada.local;
  return entrada.tocando ? entrada.mostrado : (entrada.sala ?? null);
}
