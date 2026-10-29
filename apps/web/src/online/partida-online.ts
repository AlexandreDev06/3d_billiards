import { criarRng, mesaInicial, type ConfigFisica, type Gravacao, type ParametrosTacada, type Rng } from '@sinuca/fisica';
import type {
  ApostaSala,
  CodigoErro,
  EmojiSala,
  FisicaParcial,
  FisicaSala,
  ForcaSala,
  GizSala,
  LinhaSala,
  MensagemDaSala,
  MensagemDoCliente,
  ModoSala,
  MotivoRetrato,
  MsgApostaPaga,
  MsgMissoes,
  MsgBoasVindas,
  MsgChatRetransmitido,
  MsgEmojiRetransmitido,
  MsgErro,
  MsgEstadoSala,
  MsgFisicaAlterada,
  MsgMiraRetransmitida,
  MsgRetrato,
  MsgTacadaRetransmitida,
  MsgTempoEsgotado,
  RelogioSala,
} from '@sinuca/protocolo';
import { FISICA_DA_SALA_PADRAO } from '@sinuca/protocolo';
import type { Consequencias, EstadoPartida, Modalidade } from '@sinuca/regras';
import { Jogo, type DependenciasJogo } from '../jogo/jogo';
import { limitarAoTempo, restanteDoPrazo } from '../relogio/modelo';
import { BaldeDeEmojis } from './emojis-modelo';

const ERROS_DE_LUGAR: ReadonlySet<CodigoErro> = new Set(['lugar-invalido', 'lugar-ocupado', 'fase-errada', 'sala-cheia']);

/** A tacada de outro jogador, pronta para animar. */
export interface TacadaParaAnimar {
  readonly lugar: number;
  readonly parametros: ParametrosTacada;
  readonly gravacao: Gravacao;
}

/** Quem desenha. Tudo opcional: cada ouvinte só assina o que usa. */
export interface OuvintesPartida {
  aoBoasVindas?(mensagem: MsgBoasVindas): void;
  aoEstadoSala?(estado: MsgEstadoSala): void;
  /**
   * A partida inteira foi trocada (início, nova partida, volta, ressincronia): refaça tudo e pare a animação. `antes` é a
   * partida que o `Jogo` tinha um instante atrás (o mesmo `Jogo` é adotado no lugar); `null` no primeiro retrato.
   */
  aoRetrato?(motivo: MotivoRetrato, jogo: Jogo, antes: EstadoPartida | null): void;
  /** Hora de tocar a tacada de outro jogador. Ao acabar, chame `animacaoTerminou`. */
  aoAnimar?(tacada: TacadaParaAnimar): void;
  /** A tacada que acabou de tocar passou a valer (partida e mesa já adotadas). */
  aoConcluir?(consequencias: Consequencias, lugar: number): void;
  /** Minha animação acabou antes de a sala confirmar a tacada. */
  aoAguardarSala?(): void;
  aoMira?(mira: MsgMiraRetransmitida): void;
  aoChat?(chat: MsgChatRetransmitido): void;
  /** Alguém soltou um emoji (inclusive eu: ele só aparece quando a sala o devolve). */
  aoEmoji?(emoji: MsgEmojiRetransmitido): void;
  /** O tempo de alguém acabou (ou ele sumiu): a vez passou. Vem antes do `estado-sala` e do `retrato` da vez nova. */
  aoTempoEsgotado?(aviso: MsgTempoEsgotado): void;
  /** A partida apostada acabou e a sala pagou (ou anulou) a aposta; vem antes do `estado-sala` que já leva os saldos novos. */
  aoApostaPaga?(aposta: MsgApostaPaga): void;
  /**
   * O anfitrião mudou a física no meio da partida (L38): vale a que o aviso traz (e o `estado-sala` que vem logo depois), da próxima
   * tacada em diante. `fisicaDaSala` já é a nova quando este ouvinte roda.
   */
  aoFisicaAlterada?(aviso: MsgFisicaAlterada): void;
  /** Uma missão do dia andou ou fechou nesta tacada (L32); só quem tem carteira recebe. Vem depois do `aposta-paga` e antes do `estado-sala`, que já leva o saldo com o prêmio. */
  aoMissoes?(missoes: MsgMissoes): void;
  aoErro?(erro: MsgErro): void;
}

export interface DependenciasPartidaOnline {
  readonly conexao: { enviar(mensagem: MensagemDoCliente): boolean };
  /** Regras, simulação e a config de física inicial do `Jogo`. */
  readonly jogo: DependenciasJogo;
  /** A config de física de agora (o painel dev a muda); a mesa do retrato nasce com ela. */
  readonly fisica: () => ConfigFisica;
  /** O miscue das minhas tacadas. */
  readonly rng: Rng;
  /** Relógio em ms (só diferenças contam): marca quando chegou cada `estado-sala`, base do contador da vez. */
  readonly agora: () => number;
  readonly ouvintes: OuvintesPartida;
}

/**
 * O jogo online, sem DOM nem three.js: a sala é a verdade de lugares, vez e partida; este adaptador
 * aplica o que ela manda ao mesmo `Jogo` do hot-seat.
 *
 * - Na minha vez: `tacar` simula aqui, calcula partida e mesa, manda tudo à sala e devolve a gravação
 *   para animar; a sala confirma com a mesma tacada (as consequências dela valem).
 * - Na vez dos outros: a tacada retransmitida entra numa fila e é animada uma de cada vez; ao fim da
 *   animação, partida e mesa da mensagem passam a valer.
 * - Todo `retrato` reinicia o estado (início, nova partida, volta da queda, ressincronia).
 */
export class PartidaOnline {
  private jogoAtual: Jogo | null = null;
  private estado: MsgEstadoSala | null = null;
  /** `agora()` no instante em que o `estado` chegou. */
  private estadoRecebidoEm = 0;
  private lugarAtual: number | null = null;
  private anfitriaoAtual = false;
  private nome = '';
  private conectadoAgora = false;
  /** Lugar que pedi com `escolher-lugar`, até o `estado-sala` mostrar se deu certo. */
  private lugarPedido: number | null | undefined;
  /** Tacadas que já valem na minha mesa. */
  private seqAplicado = 0;
  /** Próximo `seq` de tacada retransmitida que ainda não vi (descarta repetidas). */
  private seqVisto = 0;
  private readonly fila: MsgTacadaRetransmitida[] = [];
  private minha: { readonly seq: number; confirmada: boolean; aguardando: boolean } | null = null;
  private lugarTocando: number | null = null;
  /** O balde dos meus emojis, o mesmo da sala: passou do limite, nem mando. */
  private readonly baldeEmoji = new BaldeDeEmojis();
  /** A aposta que a sala pagou ao fim da partida de agora; a partida seguinte (`inicio`, `nova-partida`) a esquece. */
  private apostaPagaAtual: MsgApostaPaga | null = null;
  /** A física que a sala manda (o `estado-sala` e o `fisica-alterada` a trazem completa); `null` até a primeira. */
  private fisicaAtual: FisicaSala | null = null;

  constructor(private readonly deps: DependenciasPartidaOnline) {}

  /**
   * A física da sala, os 8 valores com que este cliente simula a tacada e a previsão (sem `seq`: vale a de agora). `null` até a sala
   * dizer; um `estado-sala` sem ela (só montagem de teste) é a padrão.
   */
  get fisicaDaSala(): FisicaSala | null {
    return this.fisicaAtual;
  }

  /** `null` até o primeiro `retrato` (partida ainda não começou). */
  get jogo(): Jogo | null {
    return this.jogoAtual;
  }

  get estadoSala(): MsgEstadoSala | null {
    return this.estado;
  }

  /** Meu lugar (`null` = espectador ou ainda sem boas-vindas). */
  get meuLugar(): number | null {
    return this.lugarAtual;
  }

  get souAnfitriao(): boolean {
    return this.anfitriaoAtual;
  }

  get conectado(): boolean {
    return this.conectadoAgora;
  }

  /** Quanto cada um ganhou ou perdeu na partida que acabou, como a sala mandou; `null` se não houve (ou se cheguei depois). */
  get apostaPaga(): MsgApostaPaga | null {
    return this.apostaPagaAtual;
  }

  /** Lugar de quem tem a vez na sala; `null` fora da partida. */
  get lugarDaVez(): number | null {
    return this.estado?.vez ?? null;
  }

  get nomeDaVez(): string | null {
    const lugar = this.lugarDaVez;
    return lugar === null ? null : (this.estado?.lugares[lugar]?.nome ?? null);
  }

  /**
   * Quanto falta, em ms, para acabar o tempo de quem tem a vez (a mesma conta para todos os clientes); `null` =
   * sem contador (sem limite, partida fora de curso, sem conexão). A sala é a autoridade do prazo; isto só o mostra.
   */
  restanteDaVezMs(agora: number): number | null {
    const e = this.estado;
    if (!e || !this.conectadoAgora || e.fase !== 'jogando' || e.vez === null) return null;
    return limitarAoTempo(restanteDoPrazo(e.prazoMs, this.estadoRecebidoEm, agora), e.relogio?.tempoS);
  }

  /** Posição do meu lugar na roda de jogadores da partida (o id do jogador é `lugar-N`). */
  get meuIndice(): number | null {
    return this.lugarAtual === null ? null : this.indiceDoLugar(this.lugarAtual);
  }

  /** Dá para mirar e tacar: é a minha vez, tudo o que a sala aceitou já está na mesa e nada anima. */
  get minhaVez(): boolean {
    const e = this.estado;
    const jogo = this.jogoAtual;
    return (
      this.conectadoAgora &&
      e !== null &&
      jogo !== null &&
      e.fase === 'jogando' &&
      e.vez !== null &&
      e.vez === this.lugarAtual &&
      jogo.fase === 'jogando' &&
      this.fila.length === 0 &&
      this.seqAplicado === e.seq
    );
  }

  /** Tacadas que já valem na minha mesa (para conferir se as telas estão em dia). */
  get seqNaMesa(): number {
    return this.seqAplicado;
  }

  /** Dei uma tacada que ainda toca ou espera a confirmação da sala (o taco que se vê é o meu). */
  get euTaco(): boolean {
    return this.minha !== null;
  }

  /** Minha animação acabou e falta a sala confirmar a tacada. */
  get aguardandoSala(): boolean {
    return this.minha?.aguardando === true;
  }

  indiceDoLugar(lugar: number): number | null {
    const indice = this.jogoAtual?.partida.jogadores.findIndex((j) => j.id === `lugar-${lugar}`) ?? -1;
    return indice < 0 ? null : indice;
  }

  /** O nome com que entrei (para reconhecer meu lugar no `estado-sala`). */
  definirNome(nome: string): void {
    this.nome = nome;
  }

  /** A conexão caiu ou voltou. Sem ela não é minha vez; ao voltar, a sala manda o retrato. */
  definirConectado(conectado: boolean): void {
    this.conectadoAgora = conectado;
  }

  receber(mensagem: MensagemDaSala): void {
    switch (mensagem.tipo) {
      case 'boas-vindas':
        this.lugarAtual = mensagem.lugar;
        this.anfitriaoAtual = mensagem.anfitriao;
        this.lugarPedido = undefined;
        this.deps.ouvintes.aoBoasVindas?.(mensagem);
        return;
      case 'estado-sala':
        this.estado = mensagem;
        this.fisicaAtual = mensagem.fisica ?? FISICA_DA_SALA_PADRAO;
        this.estadoRecebidoEm = this.deps.agora();
        this.reconhecerMeuLugar(mensagem);
        this.deps.ouvintes.aoEstadoSala?.(mensagem);
        return;
      case 'retrato':
        this.adotarRetrato(mensagem);
        return;
      case 'tacada-retransmitida':
        this.aoTacadaRetransmitida(mensagem);
        return;
      case 'mira-retransmitida':
        if (mensagem.lugar !== this.lugarAtual) this.deps.ouvintes.aoMira?.(mensagem);
        return;
      case 'chat-retransmitido':
        this.deps.ouvintes.aoChat?.(mensagem);
        return;
      case 'emoji-retransmitido':
        this.deps.ouvintes.aoEmoji?.(mensagem);
        return;
      case 'tempo-esgotado':
        this.deps.ouvintes.aoTempoEsgotado?.(mensagem);
        return;
      case 'aposta-paga':
        this.apostaPagaAtual = mensagem;
        this.deps.ouvintes.aoApostaPaga?.(mensagem);
        return;
      case 'fisica-alterada':
        this.fisicaAtual = mensagem.fisica;
        this.deps.ouvintes.aoFisicaAlterada?.(mensagem);
        return;
      case 'missoes':
        this.deps.ouvintes.aoMissoes?.(mensagem);
        return;
      case 'erro':
        if (ERROS_DE_LUGAR.has(mensagem.codigo)) this.lugarPedido = undefined;
        this.deps.ouvintes.aoErro?.(mensagem);
        return;
      case 'pong':
        return;
    }
  }

  // ---------------------------------------------------------------- minhas ações

  /** Simula e manda a tacada. Devolve a gravação para animar já; a sala confirma depois. */
  tacar(parametros: ParametrosTacada): Gravacao {
    const jogo = this.jogoAtual;
    const estado = this.estado;
    if (!jogo || !estado || !this.minhaVez) throw new Error('tacar: não é a sua vez');
    const gravacao = jogo.tacar(parametros);
    const desfecho = jogo.desfechoPendente!;
    this.minha = { seq: estado.seq, confirmada: false, aguardando: false };
    this.lugarTocando = this.lugarAtual;
    this.deps.conexao.enviar({ tipo: 'tacada', seq: estado.seq, parametros, gravacao, partida: desfecho.partida, mesa: desfecho.mesa });
    return gravacao;
  }

  /** A animação de `aoAnimar` (ou da minha tacada) acabou. */
  animacaoTerminou(): void {
    const jogo = this.jogoAtual;
    if (!jogo || jogo.fase !== 'tocando') return;
    if (this.minha && !this.minha.confirmada) {
      this.minha.aguardando = true;
      this.deps.ouvintes.aoAguardarSala?.();
      return;
    }
    this.concluir();
  }

  /** Só na espera: `null` vira espectador. */
  escolherLugar(lugar: number | null): void {
    this.lugarPedido = lugar;
    this.deps.conexao.enviar({ tipo: 'escolher-lugar', lugar });
  }

  iniciar(): void {
    this.deps.conexao.enviar({ tipo: 'iniciar' });
  }

  /** Anfitrião, só na espera: tira da sala quem está no `lugar`. A sala responde com um `estado-sala` novo (o lugar fica vago). */
  expulsar(lugar: number): void {
    this.deps.conexao.enviar({ tipo: 'expulsar', lugar });
  }

  /** Anfitrião, com a partida terminada: a sala volta à espera, com os mesmos lugares (`voltar-ao-lobby`). */
  voltarAoLobby(): void {
    this.deps.conexao.enviar({ tipo: 'voltar-ao-lobby' });
  }

  /**
   * Anfitrião, só na espera: muda a modalidade, o formato, o tempo por tacada, a linha de previsão, o giz, o controle de
   * força ou a aposta (cada campo é parcial; ausente não muda). Trocar a modalidade sem dizer o formato deixa a sala escolher o que tem o
   * mesmo número de lugares.
   */
  configurarSala(mudanca: {
    readonly modalidade?: Modalidade;
    readonly modo?: ModoSala;
    readonly relogio?: Partial<RelogioSala>;
    readonly linha?: Partial<LinhaSala>;
    readonly giz?: Partial<GizSala>;
    readonly forca?: ForcaSala;
    readonly aposta?: ApostaSala;
    /** Só do anfitrião: parcial; `null` restaura a padrão. Na partida é o único campo que a sala aceita (e só sem aposta valendo). */
    readonly fisica?: FisicaParcial | null;
  }): void {
    this.deps.conexao.enviar({ tipo: 'configurar-sala', ...mudanca });
  }

  enviarMira(mira: { readonly angulo: number; readonly lateral: number; readonly vertical: number; readonly recuo: number; readonly giz?: true }): boolean {
    return this.deps.conexao.enviar({ tipo: 'mira', ...mira });
  }

  enviarChat(texto: string): boolean {
    const limpo = texto.trim();
    return limpo !== '' && this.deps.conexao.enviar({ tipo: 'chat', texto: limpo });
  }

  /**
   * Solta um emoji da lista da sala, em qualquer fase (jogador ou espectador). Falso se não mandou: sem conexão, ou o balde
   * (o mesmo da sala) está vazio. O emoji só aparece na tela quando a sala o devolve.
   */
  enviarEmoji(emoji: EmojiSala): boolean {
    if (!this.conectadoAgora || !this.baldeEmoji.tentar(this.deps.agora())) return false;
    return this.deps.conexao.enviar({ tipo: 'emoji', emoji });
  }

  // ---------------------------------------------------------------- o que a sala manda

  private adotarRetrato(m: MsgRetrato): void {
    const fisica = this.deps.fisica();
    const mesa = m.mesa ?? mesaInicial(m.arrumacao, fisica, criarRng(m.semente));
    const antes = this.jogoAtual?.partida ?? null;
    if (m.motivo === 'inicio' || m.motivo === 'nova-partida') this.apostaPagaAtual = null;
    if (this.jogoAtual) {
      this.jogoAtual.usarFisica(fisica);
      this.jogoAtual.adotar(m.partida, mesa);
    } else {
      this.jogoAtual = Jogo.restaurar({ ...this.deps.jogo, fisica }, m.partida, mesa, this.deps.rng);
    }
    this.seqAplicado = m.seq;
    this.seqVisto = m.seq;
    this.fila.length = 0;
    this.minha = null;
    this.lugarTocando = null;
    this.deps.ouvintes.aoRetrato?.(m.motivo, this.jogoAtual, antes);
  }

  private aoTacadaRetransmitida(m: MsgTacadaRetransmitida): void {
    const jogo = this.jogoAtual;
    if (!jogo) return;
    const minha = this.minha;
    if (minha && m.lugar === this.lugarAtual && m.seq === minha.seq) {
      // A confirmação da minha tacada: o desfecho da sala vale, mesmo que eu tenha calculado igual.
      minha.confirmada = true;
      this.seqVisto = m.seq + 1;
      if (jogo.fase === 'tocando') jogo.confirmarDesfecho({ partida: m.partida, mesa: m.mesa, consequencias: m.consequencias });
      if (minha.aguardando) this.concluir();
      return;
    }
    if (m.seq < this.seqVisto) return;
    this.seqVisto = m.seq + 1;
    this.fila.push(m);
    this.iniciarProxima();
  }

  private iniciarProxima(): void {
    const jogo = this.jogoAtual;
    if (!jogo || jogo.fase !== 'jogando') return;
    const tacada = this.fila.shift();
    if (!tacada) return;
    jogo.receberTacada({ partida: tacada.partida, mesa: tacada.mesa, consequencias: tacada.consequencias });
    this.lugarTocando = tacada.lugar;
    this.deps.ouvintes.aoAnimar?.({ lugar: tacada.lugar, parametros: tacada.parametros, gravacao: tacada.gravacao });
  }

  private concluir(): void {
    const jogo = this.jogoAtual!;
    const lugar = this.lugarTocando ?? this.lugarAtual ?? 0;
    const consequencias = jogo.concluir();
    this.seqAplicado++;
    this.minha = null;
    this.lugarTocando = null;
    this.deps.ouvintes.aoConcluir?.(consequencias, lugar);
    this.iniciarProxima();
  }

  /**
   * Depois de `escolher-lugar` a sala não manda boas-vindas de novo: meu lugar novo aparece no
   * `estado-sala` com o meu nome. O pedido fica de pé até aparecer (ou até a sala recusar).
   */
  private reconhecerMeuLugar(e: MsgEstadoSala): void {
    const pedido = this.lugarPedido;
    if (pedido === undefined) return;
    if (pedido === null) {
      const sentado = e.lugares.some((l) => l.lugar === this.lugarAtual && l.nome === this.nome);
      if (sentado) return;
      this.lugarAtual = null;
    } else {
      if (e.lugares[pedido]?.nome !== this.nome) return;
      this.lugarAtual = pedido;
    }
    this.lugarPedido = undefined;
  }
}
