export interface LinhaDeChat {
  readonly id: number;
  /** `null` = espectador. */
  readonly lugar: number | null;
  readonly nome: string;
  readonly texto: string;
  readonly recebidaEmMs: number;
  /** Mensagem do próprio jogo (entrou, voltou), não de gente. */
  readonly aviso: boolean;
}

export interface OpcoesDoChat {
  /** Quantas linhas ficam guardadas. */
  readonly guardar: number;
  /** Quanto tempo uma linha fica à vista com o campo de chat fechado. */
  readonly visivelMs: number;
}

export const CHAT_PADRAO: OpcoesDoChat = { guardar: 50, visivelMs: 12_000 };

/** O histórico do chat da sala (puro). Com o campo aberto tudo o que está guardado aparece; fechado, só o recente. */
export class LogDeChat {
  private linhas: LinhaDeChat[] = [];
  private proximoId = 1;

  constructor(private readonly opcoes: OpcoesDoChat = CHAT_PADRAO) {}

  get quantidade(): number {
    return this.linhas.length;
  }

  adicionar(nome: string, texto: string, lugar: number | null, agoraMs: number, aviso = false): LinhaDeChat {
    const linha: LinhaDeChat = { id: this.proximoId++, lugar, nome, texto, recebidaEmMs: agoraMs, aviso };
    this.linhas.push(linha);
    if (this.linhas.length > this.opcoes.guardar) this.linhas.splice(0, this.linhas.length - this.opcoes.guardar);
    return linha;
  }

  /** As linhas a mostrar: as últimas `maximo`; com `aberto` falso, só as que chegaram há menos de `visivelMs`. */
  visiveis(agoraMs: number, aberto: boolean, maximo: number): readonly LinhaDeChat[] {
    const candidatas = aberto ? this.linhas : this.linhas.filter((l) => agoraMs - l.recebidaEmMs < this.opcoes.visivelMs);
    return candidatas.slice(-maximo);
  }

  limpar(): void {
    this.linhas = [];
  }
}
