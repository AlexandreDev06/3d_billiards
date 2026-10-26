import {
  PROTOCOLO_VERSAO,
  codificarMensagem,
  decodificarMensagemDaSala,
  type ApostaSala,
  type MensagemDaSala,
  type LinhaSala,
  type ForcaSala,
  type GizSala,
  type MensagemDoCliente,
  type ModoSala,
  type TempoPorTacadaS,
} from '@sinuca/protocolo';
import type { ConfigRegras, Modalidade } from '@sinuca/regras';
import type { ArmazemDeSessao } from './armazem';

/** O que usamos do `WebSocket`; os testes passam um falso. */
export interface SocketMinimo {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((evento: { readonly data: unknown }) => void) | null;
  onclose: ((evento: { readonly code: number; readonly reason?: string }) => void) | null;
  onerror: (() => void) | null;
  send(dado: string | Uint8Array): void;
  close(codigo?: number, motivo?: string): void;
}

export type PedidoDeEntrada =
  | {
      readonly tipo: 'criar';
      readonly nome: string;
      readonly modo: ModoSala;
      /** O jeito de jogar; ausente = par ou ímpar. `regras.modalidade` é a mesma. */
      readonly modalidade?: Modalidade;
      readonly preset: string;
      readonly regras: ConfigRegras;
      /** Tempo por tacada da sala (`null` = sem limite); ausente = o padrão da sala. */
      readonly relogio?: { readonly tempoS: TempoPorTacadaS | null };
      /** A linha de previsão da sala (igual para todos); ausente = desligada. */
      readonly linha?: LinhaSala;
      /** O giz da sala (igual para todos); ausente = o padrão da sala. */
      readonly giz?: GizSala;
      /** O controle de força da sala (igual para todos); ausente = o padrão da sala. */
      readonly forca?: ForcaSala;
      /** Quanto cada jogador com carteira põe na partida; ausente = o padrão da sala. */
      readonly aposta?: ApostaSala;
    }
  | { readonly tipo: 'entrar'; readonly nome: string; readonly codigo: string };

export type EstadoDaConexao =
  | { readonly fase: 'ociosa' }
  | { readonly fase: 'conectando'; readonly tentativa: number }
  | { readonly fase: 'conectada' }
  | { readonly fase: 'reconectando'; readonly tentativa: number; readonly emMs: number }
  /**
   * `recarregar`: o erro só passa recarregando a página (versão do protocolo diferente); tentar de novo não adianta.
   * `expulso`: o anfitrião tirou esta pessoa da sala (o token dela já foi apagado); entrar de novo é uma entrada nova.
   */
  | { readonly fase: 'encerrada'; readonly motivo: string; readonly recarregar?: true; readonly expulso?: true };

export interface DependenciasCliente {
  readonly url: string;
  readonly criarSocket: (url: string) => SocketMinimo;
  readonly armazem: ArmazemDeSessao;
  /** Agenda `fn` daqui a `ms`; devolve o cancelamento. */
  readonly agendar: (fn: () => void, ms: number) => () => void;
  readonly agora: () => number;
  /** Número em [0, 1) para espalhar as tentativas de volta. */
  readonly sortear?: () => number;
  /**
   * O código secreto da carteira deste navegador, lido a cada apresentação (também na volta de uma queda); `undefined` =
   * joga sem carteira. Vai só no `criar-sala` e no `entrar`.
   */
  readonly carteira?: () => string | undefined;
  readonly aoMensagem: (mensagem: MensagemDaSala) => void;
  readonly aoEstado: (estado: EstadoDaConexao) => void;
  readonly tempos?: Partial<TemposDoCliente>;
}

export interface TemposDoCliente {
  /** Primeira espera antes de tentar de novo; dobra a cada falha. */
  readonly esperaInicialMs: number;
  readonly esperaMaximaMs: number;
  /** Socket que não abre neste tempo é descartado. */
  readonly aberturaMs: number;
  readonly pingMs: number;
  /** Sem nada da sala por este tempo, a conexão é dada como morta. */
  readonly silencioMs: number;
  /** Com que frequência a aba diz ao armazém que está viva. */
  readonly batidaMs: number;
}

export const TEMPOS_PADRAO: TemposDoCliente = {
  esperaInicialMs: 500,
  esperaMaximaMs: 10_000,
  aberturaMs: 10_000,
  pingMs: 15_000,
  silencioMs: 40_000,
  batidaMs: 4_000,
};

/** Fechamentos que a sala decide e que não se resolvem tentando de novo (`FECHAMENTO` de `apps/sala`). */
const FECHOU_SUBSTITUIDA = 4000;
const FECHOU_EXPIRADA = 4001;
const FECHOU_EXPULSO = 4002;

const MOTIVO_EXPULSO = 'Você foi removido da sala pelo anfitrião.';

/** Quantas vezes se tenta criar a sala sem receber as boas-vindas, antes de desistir (cada falha pode ter criado uma). */
const TENTATIVAS_DE_CRIAR = 3;

/**
 * A conexão com a sala: abre o WebSocket, faz `criar-sala` ou `entrar`, guarda o token e, se a rede cai,
 * volta sozinha com espera crescente e o mesmo token (a sala devolve o mesmo lugar e manda o retrato).
 * Mensagens enviadas fora da conexão se perdem: o retrato da volta refaz o estado.
 */
export class ClienteSala {
  private readonly tempos: TemposDoCliente;
  /** O `t` do ping é relativo a isto: a sala só aceita |t| ≤ 1e12 e `Date.now()` já passa disso. */
  private readonly origem: number;
  private socket: SocketMinimo | null = null;
  private pedido: PedidoDeEntrada | null = null;
  private codigoAtual: string | null = null;
  private nome = '';
  private tentativa = 0;
  private estadoAtual: EstadoDaConexao = { fase: 'ociosa' };
  private apresentado = false;
  private ultimaRecepcao = 0;
  private cancelarEspera: (() => void) | null = null;
  private cancelarPing: (() => void) | null = null;
  private cancelarBatida: (() => void) | null = null;

  constructor(private readonly deps: DependenciasCliente) {
    this.tempos = { ...TEMPOS_PADRAO, ...deps.tempos };
    this.origem = deps.agora();
  }

  get estado(): EstadoDaConexao {
    return this.estadoAtual;
  }

  get conectado(): boolean {
    return this.estadoAtual.fase === 'conectada';
  }

  /** O código da sala, depois das boas-vindas (ou o do pedido de entrada). */
  get codigo(): string | null {
    return this.codigoAtual;
  }

  abrir(pedido: PedidoDeEntrada): void {
    this.fechar();
    this.pedido = pedido;
    this.nome = pedido.nome;
    this.codigoAtual = pedido.tipo === 'entrar' ? pedido.codigo : null;
    this.tentativa = 0;
    this.conectar();
  }

  /** Falso se a conexão não está de pé (a mensagem se perde). */
  enviar(mensagem: MensagemDoCliente): boolean {
    const socket = this.socket;
    if (!socket || !this.apresentado) return false;
    try {
      socket.send(codificarMensagem(mensagem));
      return true;
    } catch {
      return false;
    }
  }

  /** A rede voltou ou a aba voltou a aparecer: se está esperando para tentar de novo, tenta já. */
  tentarAgora(): void {
    if (this.estadoAtual.fase !== 'reconectando') return;
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.conectar();
  }

  /**
   * A aba voltou (descongelou, voltou a aparecer, a rede voltou). Esperando para tentar de novo: tenta já. Conectada
   * há tempo demais sem notícia da sala (os timers não rodaram enquanto a aba estava congelada, e o Chrome fecha os
   * WebSockets dela ao descongelar): dá a conexão por perdida agora, sem esperar o próximo ping. Conectada de
   * verdade: só pergunta se a sala está viva.
   */
  retomar(): void {
    const fase = this.estadoAtual.fase;
    if (fase === 'reconectando') return this.tentarAgora();
    if (fase !== 'conectada') return;
    if (this.deps.agora() - this.ultimaRecepcao > this.tempos.silencioMs) return this.perdeu('a sala parou de responder');
    this.enviar({ tipo: 'ping', t: this.deps.agora() - this.origem });
  }

  /** Para testes e diagnóstico: derruba o socket como se a rede tivesse caído. */
  derrubar(): void {
    if (this.socket) this.perdeu('conexão derrubada');
  }

  /** Sai de vez: fecha a conexão, esquece o token e não volta. */
  sair(): void {
    const codigo = this.codigoAtual;
    this.fechar();
    if (codigo !== null) this.deps.armazem.apagar(codigo);
    this.pedido = null;
    this.codigoAtual = null;
    this.mudar({ fase: 'ociosa' });
  }

  private conectar(): void {
    this.descartarSocket();
    this.apresentado = false;
    this.mudar({ fase: 'conectando', tentativa: this.tentativa });
    let socket: SocketMinimo;
    try {
      socket = this.deps.criarSocket(this.deps.url);
    } catch {
      this.perdeu('não foi possível abrir a conexão');
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.ultimaRecepcao = this.deps.agora();
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.cancelarEspera?.();
      this.cancelarEspera = null;
      this.apresentar();
    };
    socket.onmessage = (evento) => {
      if (this.socket === socket) this.aoDado(evento.data);
    };
    socket.onclose = (evento) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.aoFechar(evento.code);
    };
    socket.onerror = () => {};
    this.cancelarEspera = this.deps.agendar(() => {
      if (this.socket === socket && !this.apresentado) this.perdeu('a sala não respondeu');
    }, this.tempos.aberturaMs);
  }

  /** Primeira mensagem da conexão: criar a sala (só na primeira vez) ou entrar com o token. */
  private apresentar(): void {
    const pedido = this.pedido;
    const socket = this.socket;
    if (!pedido || !socket) return;
    const codigo = this.codigoAtual;
    const token = codigo === null ? undefined : this.deps.armazem.ler(codigo)?.token;
    const carteira = this.deps.carteira?.();
    const mensagem: MensagemDoCliente =
      pedido.tipo === 'criar' && codigo === null
        ? {
            tipo: 'criar-sala',
            versao: PROTOCOLO_VERSAO,
            nome: pedido.nome,
            modo: pedido.modo,
            ...(pedido.modalidade === undefined ? {} : { modalidade: pedido.modalidade }),
            preset: pedido.preset,
            regras: pedido.regras,
            ...(pedido.relogio === undefined ? {} : { relogio: pedido.relogio }),
            ...(pedido.linha === undefined ? {} : { linha: pedido.linha }),
            ...(pedido.giz === undefined ? {} : { giz: pedido.giz }),
            ...(pedido.forca === undefined ? {} : { forca: pedido.forca }),
            ...(pedido.aposta === undefined ? {} : { aposta: pedido.aposta }),
            ...(carteira === undefined ? {} : { carteira }),
          }
        : {
            tipo: 'entrar',
            versao: PROTOCOLO_VERSAO,
            codigo: codigo!,
            nome: this.nome,
            ...(token === undefined ? {} : { token }),
            ...(carteira === undefined ? {} : { carteira }),
          };
    try {
      socket.send(codificarMensagem(mensagem));
    } catch {
      this.perdeu('não foi possível falar com a sala');
    }
  }

  private aoDado(dado: unknown): void {
    this.ultimaRecepcao = this.deps.agora();
    const r = decodificarMensagemDaSala(dado as string | ArrayBuffer);
    if (!r.ok) {
      console.warn(`Mensagem da sala ignorada: ${r.erro}`);
      return;
    }
    const mensagem = r.valor;
    if (mensagem.tipo === 'expulso') return this.encerrarExpulso();
    if (!this.apresentado) {
      if (mensagem.tipo === 'boas-vindas') this.aoBoasVindas(mensagem);
      else if (mensagem.tipo === 'erro') {
        // Antes das boas-vindas, o erro é a recusa da entrada: tentar de novo não resolve. Com a versão errada
        // o token fica (depois de recarregar a página a sala ainda é minha). `token-invalido` é o token revogado de
        // quem foi expulso (a sala trata token desconhecido como entrada nova): quem voltou de uma queda sem saber.
        if (mensagem.codigo === 'token-invalido') return this.encerrarExpulso();
        this.encerrarPor(mensagem.mensagem, mensagem.codigo === 'sala-inexistente', mensagem.codigo === 'versao');
        this.deps.aoMensagem(mensagem);
        return;
      } else return;
    }
    this.deps.aoMensagem(mensagem);
  }

  private aoBoasVindas(m: Extract<MensagemDaSala, { tipo: 'boas-vindas' }>): void {
    this.apresentado = true;
    this.codigoAtual = m.codigo;
    this.tentativa = 0;
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.deps.armazem.gravar(m.codigo, { token: m.token, nome: this.nome });
    this.deps.armazem.lembrarApelido(this.nome);
    this.mudar({ fase: 'conectada' });
    this.iniciarRelogios(m.codigo);
  }

  private iniciarRelogios(codigo: string): void {
    this.cancelarRelogios();
    const pingar = (): void => {
      if (this.deps.agora() - this.ultimaRecepcao > this.tempos.silencioMs) {
        this.perdeu('a sala parou de responder');
        return;
      }
      this.enviar({ tipo: 'ping', t: this.deps.agora() - this.origem });
      this.cancelarPing = this.deps.agendar(pingar, this.tempos.pingMs);
    };
    const bater = (): void => {
      this.deps.armazem.batida(codigo);
      this.cancelarBatida = this.deps.agendar(bater, this.tempos.batidaMs);
    };
    this.cancelarPing = this.deps.agendar(pingar, this.tempos.pingMs);
    bater();
  }

  private aoFechar(codigo: number): void {
    if (codigo === FECHOU_SUBSTITUIDA) return this.encerrarPor('Você entrou nesta sala por outra janela; esta foi desligada.', false);
    if (codigo === FECHOU_EXPIRADA) return this.encerrarPor('A sala foi encerrada por inatividade.', true);
    if (codigo === FECHOU_EXPULSO) return this.encerrarExpulso();
    this.perdeu('conexão fechada');
  }

  /** A conexão caiu (ou nunca abriu): tenta de novo com espera crescente. */
  private perdeu(motivo: string): void {
    if (!this.pedido) return;
    const criandoSemResposta = this.pedido.tipo === 'criar' && this.codigoAtual === null;
    this.descartarSocket();
    this.apresentado = false;
    this.cancelarRelogios();
    this.tentativa++;
    if (criandoSemResposta && this.tentativa >= TENTATIVAS_DE_CRIAR) {
      this.encerrarPor(`Não consegui criar a sala (${motivo}).`, false);
      return;
    }
    const base = Math.min(this.tempos.esperaInicialMs * 2 ** (this.tentativa - 1), this.tempos.esperaMaximaMs);
    const emMs = Math.round(base * (0.75 + 0.25 * (this.deps.sortear?.() ?? 0.5)));
    this.mudar({ fase: 'reconectando', tentativa: this.tentativa, emMs });
    this.cancelarEspera = this.deps.agendar(() => {
      this.cancelarEspera = null;
      this.conectar();
    }, emMs);
  }

  /** Fim da linha: não tenta mais. `esquecer` apaga o token (a sala não existe mais). */
  private encerrarPor(motivo: string, esquecer: boolean, recarregar = false, expulso = false): void {
    const codigo = this.codigoAtual;
    this.fechar();
    if (esquecer && codigo !== null) this.deps.armazem.apagar(codigo);
    this.pedido = null;
    if (recarregar) this.mudar({ fase: 'encerrada', motivo, recarregar: true });
    else if (expulso) this.mudar({ fase: 'encerrada', motivo, expulso: true });
    else this.mudar({ fase: 'encerrada', motivo });
  }

  /**
   * O anfitrião me tirou da sala (`expulso`, o fechamento 4002 ou o token revogado numa volta de queda): não reconecta e
   * apaga o token, para o link da sala valer como entrada nova. O código fica em `codigo` para "Entrar de novo".
   */
  private encerrarExpulso(): void {
    this.encerrarPor(MOTIVO_EXPULSO, true, false, true);
  }

  private fechar(): void {
    this.descartarSocket();
    this.apresentado = false;
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.cancelarRelogios();
  }

  private descartarSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close();
    } catch {
      // já fechado
    }
  }

  private cancelarRelogios(): void {
    this.cancelarPing?.();
    this.cancelarBatida?.();
    this.cancelarPing = null;
    this.cancelarBatida = null;
  }

  private mudar(estado: EstadoDaConexao): void {
    this.estadoAtual = estado;
    this.deps.aoEstado(estado);
  }
}
