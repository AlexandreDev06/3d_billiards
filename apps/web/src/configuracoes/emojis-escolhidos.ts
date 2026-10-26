import { EMOJIS_DA_SALA, EMOJIS_PADRAO, type EmojiSala } from '@sinuca/protocolo';
import { apagarJson, gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';

/** Onde este aparelho guarda os 8 emojis das teclas 1 a 8. */
export const CHAVE_DOS_EMOJIS = 'sinuca.emojis';
const VERSAO = 1;

/** Quantos emojis cada jogador escolhe: os das teclas 1 a 8. */
export const QUANTOS_EMOJIS = EMOJIS_PADRAO.length;

const DO_CATALOGO: ReadonlySet<string> = new Set<string>(EMOJIS_DA_SALA);

/** Este valor é um emoji do catálogo da sala (e não qualquer texto)? */
export function ehEmojiDaSala(valor: unknown): valor is EmojiSala {
  return typeof valor === 'string' && DO_CATALOGO.has(valor);
}

/** Um número de tecla/slot válido: inteiro de 1 a `QUANTOS_EMOJIS`. */
export function ehSlotDeEmoji(slot: unknown): slot is number {
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= QUANTOS_EMOJIS;
}

/** Os 8 emojis estão bem formados: tamanho certo, todos do catálogo, nenhum repetido. */
export function escolhaValida(valor: unknown): valor is readonly EmojiSala[] {
  return Array.isArray(valor) && valor.length === QUANTOS_EMOJIS && valor.every(ehEmojiDaSala) && new Set<unknown>(valor).size === QUANTOS_EMOJIS;
}

/** O que `valor` diz, ou os emojis padrão se não for uma escolha válida (nunca lança). */
export function sanearEmojis(valor: unknown): readonly EmojiSala[] {
  return escolhaValida(valor) ? [...valor] : EMOJIS_PADRAO;
}

/**
 * A escolha depois de pôr `emoji` no `slot` (1 a 8). Se o emoji já está em outro slot, os dois trocam de lugar; se já está
 * neste, nada muda. `null` quando nada muda ou o pedido é inválido (slot fora de 1 a 8, emoji fora do catálogo).
 */
export function trocarEmoji(atuais: readonly EmojiSala[], slot: unknown, emoji: unknown): readonly EmojiSala[] | null {
  if (!ehSlotDeEmoji(slot) || !ehEmojiDaSala(emoji)) return null;
  const i = slot - 1;
  const atual = atuais[i];
  if (atual === undefined || atual === emoji) return null;
  const novo = [...atuais];
  const j = novo.indexOf(emoji);
  novo[i] = emoji;
  if (j >= 0) novo[j] = atual;
  return novo;
}

function ehPadrao(emojis: readonly EmojiSala[]): boolean {
  return emojis.every((e, i) => e === EMOJIS_PADRAO[i]);
}

/**
 * Os 8 emojis que este jogador manda nas teclas 1 a 8 (e na fileira do botão): um de cada slot, sem repetir, do catálogo
 * da sala. Ficam neste aparelho (`sinuca.emojis`, com versão) e valem na hora para quem escuta `aoMudar`. Sem
 * armazenamento (bloqueado) ou com o que estava guardado estragado, valem os padrões do protocolo, sem derrubar nada.
 */
export class EmojisEscolhidos {
  private atuais: readonly EmojiSala[];
  private readonly ouvintes = new Set<() => void>();

  constructor(private readonly armazenamento: ArmazenamentoMinimo | null) {
    const bruto = lerJson(CHAVE_DOS_EMOJIS, armazenamento) as { versao?: unknown; emojis?: unknown } | null;
    this.atuais = bruto !== null && typeof bruto === 'object' && bruto.versao === VERSAO ? sanearEmojis(bruto.emojis) : EMOJIS_PADRAO;
  }

  /** Os 8 de agora, na ordem das teclas. A mesma lista (imutável) até algo mudar. */
  get emojis(): readonly EmojiSala[] {
    return this.atuais;
  }

  /** São os emojis padrão? */
  get padrao(): boolean {
    return ehPadrao(this.atuais);
  }

  /** O emoji da tecla `slot` (1 a 8); `null` fora disso. */
  doSlot(slot: number): EmojiSala | null {
    return this.atuais[slot - 1] ?? null;
  }

  /** Em que slot (1 a 8) este emoji está; `null` se não está em nenhum. */
  slotDe(emoji: unknown): number | null {
    const i = ehEmojiDaSala(emoji) ? this.atuais.indexOf(emoji) : -1;
    return i < 0 ? null : i + 1;
  }

  /** Põe `emoji` no `slot` (1 a 8), trocando com o outro slot se ele já estava lá. Devolve se algo mudou. */
  escolher(slot: number, emoji: unknown): boolean {
    const novo = trocarEmoji(this.atuais, slot, emoji);
    if (novo === null) return false;
    this.definir(novo);
    return true;
  }

  /** Volta aos emojis padrão do protocolo. */
  restaurar(): void {
    if (this.padrao) return;
    this.definir(EMOJIS_PADRAO);
  }

  /** Escuta qualquer mudança; devolve quem para de escutar. */
  aoMudar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => void this.ouvintes.delete(ouvinte);
  }

  private definir(emojis: readonly EmojiSala[]): void {
    this.atuais = emojis;
    if (this.padrao) apagarJson(CHAVE_DOS_EMOJIS, this.armazenamento);
    else gravarJson(CHAVE_DOS_EMOJIS, { versao: VERSAO, emojis }, this.armazenamento);
    for (const ouvinte of [...this.ouvintes]) ouvinte();
  }
}
