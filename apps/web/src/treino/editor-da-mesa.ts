import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, distanciaContatoTabela, medidasDaBola, type ConfigFisica, type EstadoMesa, type IdBola, type Ponto2 } from '@sinuca/fisica';
import { bolaSobOPonto, brancaNaMesa, cabeNoPonto, devolverBola, moverBola, numeradasFora, tirarBola } from './mesa-de-treino';

/** A bola que a mão do jogador segura: de onde saiu, onde está o cursor e se ali ela cabe (sem encostar em bola, tabela nem caçapa). */
export interface ArrasteEmCurso {
  readonly id: IdBola;
  readonly origem: Ponto2;
  readonly atual: Ponto2;
  readonly valido: boolean;
}

/** Quem a mão pode pegar: só a branca (bola na mão) ou qualquer bola (arrumar a mesa). */
export type QuemPega = 'branca' | 'todas';

/** A folga além do raio com que o clique ainda pega a bola (m): mão não acerta o centro de uma bola de 5,4 cm. */
export const FOLGA_DO_CLIQUE = 0.012;

/**
 * A mesa do treino em edição (puro, sem DOM nem three): pega uma bola, arrasta, solta onde ela cabe (senão volta de onde saiu),
 * tira bolas para a bandeja e as devolve. A mesa só muda quando a bola é solta num lugar livre; o arraste em curso é só do desenho.
 * Quem usa (`main.ts`) entrega o `mesa` ao `Jogo` e às regras (`sincronizarMesa`) ao terminar.
 */
export class EditorDaMesa {
  private mesaAtual: EstadoMesa;
  private arrasteAtual: ArrasteEmCurso | null = null;

  constructor(
    mesa: EstadoMesa,
    /** As numeradas da casa (a bandeja é o que delas não está na mesa). */
    private readonly casa: readonly IdBola[],
    private readonly config: ConfigFisica = CONFIG_FISICA_PADRAO,
  ) {
    this.mesaAtual = mesa;
  }

  /** A mesa como está: sem a bola que a mão segura agora. */
  get mesa(): EstadoMesa {
    return this.mesaAtual;
  }

  get arraste(): ArrasteEmCurso | null {
    return this.arrasteAtual;
  }

  /** As numeradas fora da mesa, em ordem. */
  get bandeja(): IdBola[] {
    return numeradasFora(this.mesaAtual, this.casa);
  }

  /**
   * A mão pega uma bola em `ponto`. `branca`: pega sempre a branca, onde quer que o clique caia (é a bola na mão, ela vem para o
   * cursor); `todas`: a bola que está sob o ponto, ou nenhuma. Devolve o id pego, ou `null`.
   */
  pegar(ponto: Ponto2, quem: QuemPega): IdBola | null {
    if (this.arrasteAtual) this.cancelar();
    let id: IdBola | null;
    if (quem === 'branca') id = brancaNaMesa(this.mesaAtual) ? ID_BOLAO : null;
    else id = bolaSobOPonto(this.mesaAtual, ponto, FOLGA_DO_CLIQUE, this.config);
    if (id === null) return null;
    const bola = this.mesaAtual.bolas.find((b) => b.id === id)!;
    const origem = { x: bola.posicao.x, z: bola.posicao.z };
    // A branca da mão vem ao cursor; a bola pega por cima segura onde estava até a mão mexer.
    this.arrasteAtual = quem === 'branca' ? this.com(id, origem, ponto) : { id, origem, atual: origem, valido: true };
    return id;
  }

  /** O cursor andou com a bola na mão. */
  mover(ponto: Ponto2): void {
    const a = this.arrasteAtual;
    if (a) this.arrasteAtual = this.com(a.id, a.origem, ponto);
  }

  /**
   * Larga a bola. Onde ela cabe, fica; onde não cabe, volta de onde saiu. Devolve o que houve, ou `null` sem bola na mão.
   */
  soltar(): { readonly id: IdBola; readonly colocada: boolean } | null {
    const a = this.arrasteAtual;
    if (!a) return null;
    this.arrasteAtual = null;
    if (a.valido) this.mesaAtual = moverBola(this.mesaAtual, a.id, a.atual, this.config);
    return { id: a.id, colocada: a.valido };
  }

  /** Larga a bola de volta onde estava. */
  cancelar(): void {
    this.arrasteAtual = null;
  }

  /** Tira a bola `id` da mesa (para a bandeja). A branca nunca sai. */
  tirar(id: IdBola): boolean {
    if (id === ID_BOLAO) return false;
    const antes = this.mesaAtual;
    this.mesaAtual = tirarBola(antes, id);
    if (this.arrasteAtual?.id === id) this.arrasteAtual = null;
    return this.mesaAtual !== antes;
  }

  /** Tira a bola que está sob `ponto`, se houver. */
  tirarSob(ponto: Ponto2): IdBola | null {
    const id = bolaSobOPonto(this.mesaAtual, ponto, FOLGA_DO_CLIQUE, this.config);
    return id !== null && this.tirar(id) ? id : null;
  }

  /** Devolve a bola `id` à mesa, no ponto livre mais perto de `alvo` (o meio, em geral). */
  devolver(id: IdBola, alvo: Ponto2 = { x: 0, z: 0 }): boolean {
    if (!this.casa.includes(id)) return false;
    const antes = this.mesaAtual;
    this.mesaAtual = devolverBola(antes, id, alvo, this.config);
    return this.mesaAtual !== antes;
  }

  /** A mesa para desenhar: com a bola da mão no cursor (dentro da mesa), mesmo onde ela não caberia. */
  mesaDesenhada(): EstadoMesa {
    const a = this.arrasteAtual;
    if (!a) return this.mesaAtual;
    return {
      bolas: this.mesaAtual.bolas.map((b) => (b.id === a.id ? bolaParada(a.id, this.dentroDaMesa(a.id, a.atual), this.config) : b)),
    };
  }

  private com(id: IdBola, origem: Ponto2, ponto: Ponto2): ArrasteEmCurso {
    const atual = this.dentroDaMesa(id, ponto);
    return { id, origem, atual, valido: cabeNoPonto(this.mesaAtual, id, atual, this.config) };
  }

  private dentroDaMesa(id: IdBola, p: Ponto2): Ponto2 {
    const raio = medidasDaBola(id, this.config).raio;
    const folga = distanciaContatoTabela(raio, this.config.mesa);
    const lx = this.config.mesa.comprimento / 2 - folga;
    const lz = this.config.mesa.largura / 2 - folga;
    return { x: Math.max(-lx, Math.min(lx, p.x)), z: Math.max(-lz, Math.min(lz, p.z)) };
  }
}
