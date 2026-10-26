/** Como o emoji que sobe do balão se comporta. Tempos em ms, alturas em alturas do balão na tela. */
export interface OpcoesDaSubida {
  readonly vidaMs: number;
  /** O quanto sobe do topo do balão ao sumir, em alturas do balão na tela. */
  readonly subida: number;
  /** Quantos ao mesmo tempo: o que chega acima disso tira o mais velho. */
  readonly maximo: number;
  /** A fração da vida em que ele aparece (fade-in e estouro) e a em que começa a sumir. */
  readonly aparece: number;
  readonly some: number;
}

export const SUBIDA_PADRAO: OpcoesDaSubida = { vidaMs: 1800, subida: 1.1, maximo: 4, aparece: 0.12, some: 0.6 };

/** Um emoji no ar. `lugar` é de quem o mandou. */
export interface EmojiSubindo {
  readonly id: number;
  readonly emoji: string;
  readonly lugar: number | null;
  readonly chegouEmMs: number;
}

/** Onde e como desenhar um emoji que sobe, num instante. */
export interface QuadroDaSubida {
  /** 0 a 1 da vida. */
  readonly progresso: number;
  /** O quanto já subiu, em alturas do balão na tela. */
  readonly altura: number;
  readonly opacidade: number;
  readonly escala: number;
}

/** O desenho do emoji no progresso `p` (0 a 1): sobe com folga no começo e devagar no fim, aparece estourando e some no fim. */
export function quadroDaSubida(p: number, opcoes: OpcoesDaSubida = SUBIDA_PADRAO): QuadroDaSubida {
  const k = Math.min(Math.max(p, 0), 1);
  const subida = 1 - (1 - k) ** 2;
  const entrada = Math.min(k / opcoes.aparece, 1);
  const saida = k <= opcoes.some ? 1 : 1 - (k - opcoes.some) / (1 - opcoes.some);
  // Estoura um pouco acima do tamanho no fim da entrada e assenta.
  const estouro = entrada < 1 ? entrada * 1.2 : 1 + 0.2 * Math.max(0, 1 - (k - opcoes.aparece) / 0.15);
  return { progresso: k, altura: subida * opcoes.subida, opacidade: entrada * Math.max(saida, 0), escala: 0.5 + 0.5 * estouro };
}

/** Os emojis no ar acima do balão de quem joga (puro): cada `emoji-retransmitido` do dono do balão vira um que sobe e expira pelo relógio. */
export class SubidasDeEmojis {
  private itens: EmojiSubindo[] = [];
  private proximoId = 1;

  constructor(readonly opcoes: OpcoesDaSubida = SUBIDA_PADRAO) {}

  get quantidade(): number {
    return this.itens.length;
  }

  chegar(emoji: string, lugar: number | null, agoraMs: number): void {
    this.itens.push({ id: this.proximoId++, emoji, lugar, chegouEmMs: agoraMs });
    if (this.itens.length > this.opcoes.maximo) this.itens.shift();
  }

  /** Tira os que já passaram da vida e devolve os que sobraram, do mais velho ao mais novo. */
  vivos(agoraMs: number): readonly EmojiSubindo[] {
    if (this.itens.some((e) => agoraMs - e.chegouEmMs >= this.opcoes.vidaMs)) {
      this.itens = this.itens.filter((e) => agoraMs - e.chegouEmMs < this.opcoes.vidaMs);
    }
    return this.itens;
  }

  progressoDe(item: EmojiSubindo, agoraMs: number): number {
    return Math.min(Math.max((agoraMs - item.chegouEmMs) / this.opcoes.vidaMs, 0), 1);
  }

  limpar(): void {
    this.itens = [];
  }
}
