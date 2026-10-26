import type { ConfigFisica, Rng } from '@sinuca/fisica';
import type { MsgChatRetransmitido, MsgEmojiRetransmitido, MsgEstadoSala, MsgMiraRetransmitida } from '@sinuca/protocolo';
import type { DependenciasJogo } from '../jogo/jogo';
import type { ArmazemDeSessao } from './armazem';
import { LogDeChat } from './chat-modelo';
import { ClienteSala, type EstadoDaConexao, type PedidoDeEntrada, type SocketMinimo, type TemposDoCliente } from './cliente-sala';
import { PilhaDeEmojis } from './emojis-modelo';
import { EmissorDeMira, MiraRemota } from './mira-remota';
import { PartidaOnline, type OuvintesPartida } from './partida-online';
import { avisosDePresenca } from './sala-modelo';

export interface OuvintesSessao extends OuvintesPartida {
  aoConexao?(estado: EstadoDaConexao): void;
  /** Uma linha nova no chat (mensagem de gente ou aviso de presença). */
  aoLinhaDeChat?(): void;
}

export interface DependenciasSessao {
  readonly url: string;
  readonly criarSocket: (url: string) => SocketMinimo;
  readonly armazem: ArmazemDeSessao;
  readonly agendar: (fn: () => void, ms: number) => () => void;
  readonly agora: () => number;
  readonly sortear?: () => number;
  /** O código secreto da carteira deste navegador, lido a cada apresentação à sala (`undefined` = joga sem carteira). */
  readonly carteira?: () => string | undefined;
  readonly tempos?: Partial<TemposDoCliente>;
  readonly jogo: DependenciasJogo;
  readonly fisica: () => ConfigFisica;
  readonly rng: Rng;
  readonly ouvintes: OuvintesSessao;
}

/**
 * Uma ida à sala: conexão, adaptador da partida, mira remota, emissor da minha mira, chat e emojis. Sem DOM nem
 * three.js; quem desenha assina `ouvintes` e lê `partida`, `miraRemota`, `chat` e `emojis` a cada quadro.
 */
export class SessaoOnline {
  readonly cliente: ClienteSala;
  readonly partida: PartidaOnline;
  readonly miraRemota = new MiraRemota();
  readonly emissor: EmissorDeMira;
  readonly chat = new LogDeChat();
  /** Os emojis que estão no alto da tela. */
  readonly emojis = new PilhaDeEmojis();
  private vezAnterior: number | null | undefined;
  private estadoAnterior: MsgEstadoSala | null = null;

  constructor(private readonly deps: DependenciasSessao) {
    const { ouvintes } = deps;
    this.cliente = new ClienteSala({
      url: deps.url,
      criarSocket: deps.criarSocket,
      armazem: deps.armazem,
      agendar: deps.agendar,
      agora: deps.agora,
      sortear: deps.sortear,
      carteira: deps.carteira,
      tempos: deps.tempos,
      aoMensagem: (mensagem) => this.partida.receber(mensagem),
      aoEstado: (estado) => {
        this.partida.definirConectado(estado.fase === 'conectada');
        if (estado.fase !== 'conectada') this.emissor.esquecer();
        ouvintes.aoConexao?.(estado);
      },
    });
    this.partida = new PartidaOnline({
      conexao: this.cliente,
      jogo: deps.jogo,
      fisica: deps.fisica,
      rng: deps.rng,
      agora: deps.agora,
      ouvintes: {
        ...ouvintes,
        aoEstadoSala: (estado) => {
          this.aoEstadoSala(estado);
          ouvintes.aoEstadoSala?.(estado);
        },
        aoRetrato: (motivo, jogo, antes) => {
          this.miraRemota.esquecer();
          this.emissor.esquecer();
          this.vezAnterior = undefined;
          ouvintes.aoRetrato?.(motivo, jogo, antes);
        },
        aoMira: (mira: MsgMiraRetransmitida) => {
          this.miraRemota.definir(mira);
          ouvintes.aoMira?.(mira);
        },
        aoChat: (mensagem: MsgChatRetransmitido) => {
          this.chat.adicionar(mensagem.nome, mensagem.texto, mensagem.lugar, deps.agora());
          ouvintes.aoChat?.(mensagem);
          ouvintes.aoLinhaDeChat?.();
        },
        aoEmoji: (mensagem: MsgEmojiRetransmitido) => {
          this.emojis.chegar({ lugar: mensagem.lugar, nome: mensagem.nome, emoji: mensagem.emoji }, deps.agora());
          ouvintes.aoEmoji?.(mensagem);
        },
      },
    });
    this.emissor = new EmissorDeMira((mira) => this.partida.enviarMira(mira));
  }

  abrir(pedido: PedidoDeEntrada): void {
    this.partida.definirNome(pedido.nome);
    this.cliente.abrir(pedido);
  }

  sair(): void {
    this.cliente.sair();
  }

  private aoEstadoSala(estado: MsgEstadoSala): void {
    // A vez mudou: o taco que se vê vem de outro jogador, então a primeira mira dele salta direto.
    if (this.vezAnterior !== undefined && this.vezAnterior !== estado.vez) {
      this.miraRemota.esquecer();
      this.emissor.esquecer();
    }
    this.vezAnterior = estado.vez;
    const avisos = avisosDePresenca(this.estadoAnterior, estado);
    this.estadoAnterior = estado;
    for (const aviso of avisos) this.chat.adicionar('', aviso, null, this.deps.agora(), true);
    if (avisos.length > 0) this.deps.ouvintes.aoLinhaDeChat?.();
  }
}
