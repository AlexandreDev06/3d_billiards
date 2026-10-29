import type { BaseDeAcessorios } from '@sinuca/personagens/three';

export type EstadoDosChapeus = 'parado' | 'carregando' | 'pronto' | 'falhou';

/**
 * O `chapeus.glb` sob demanda (L48): ~0,7 MB que quase ninguém precisa no menu. Nada baixa até alguém pedir (`pedir`, a cada quadro se
 * for preciso: é barato); o pedido baixa uma vez só e avisa quem se registrou em `aoChegar`. Se a carga falha, só se avisa (`avisar`,
 * por padrão `console.warn`) e o jogo segue sem chapéu; um novo pedido só tenta de novo depois de `tentarDeNovoAposMs`, para um
 * servidor sem o arquivo não levar um pedido por quadro.
 */
export class CarregadorDeChapeus {
  private baseCarregada: BaseDeAcessorios | null = null;
  private situacao: EstadoDosChapeus = 'parado';
  private falhouEm = -Infinity;
  private readonly ouvintes: Array<(base: BaseDeAcessorios) => void> = [];

  constructor(
    private readonly carregar: () => Promise<BaseDeAcessorios>,
    private readonly tentarDeNovoAposMs: number,
    private readonly agoraMs: () => number = () => performance.now(),
    private readonly avisar: (mensagem: string) => void = (m) => console.warn(m),
  ) {}

  get base(): BaseDeAcessorios | null {
    return this.baseCarregada;
  }

  get estado(): EstadoDosChapeus {
    return this.situacao;
  }

  /** Alguém precisa de chapéu: começa a baixar, se ainda não baixou nem está baixando. */
  pedir(): void {
    if (this.situacao === 'carregando' || this.situacao === 'pronto') return;
    if (this.situacao === 'falhou' && this.agoraMs() - this.falhouEm < this.tentarDeNovoAposMs) return;
    this.situacao = 'carregando';
    void this.carregar().then(
      (base) => {
        this.baseCarregada = base;
        this.situacao = 'pronto';
        for (const f of [...this.ouvintes]) f(base);
      },
      (erro: unknown) => {
        this.situacao = 'falhou';
        this.falhouEm = this.agoraMs();
        this.avisar(`Chapéus: o arquivo não carregou, os balões seguem sem chapéu (${erro instanceof Error ? erro.message : String(erro)})`);
      },
    );
  }

  /** `f` roda quando o arquivo chega (já, se ele já chegou). Devolve o que tira `f` da lista (a prévia do editor abre e fecha à vontade). */
  aoChegar(f: (base: BaseDeAcessorios) => void): () => void {
    this.ouvintes.push(f);
    if (this.baseCarregada !== null) f(this.baseCarregada);
    return () => {
      const i = this.ouvintes.indexOf(f);
      if (i >= 0) this.ouvintes.splice(i, 1);
    };
  }
}
