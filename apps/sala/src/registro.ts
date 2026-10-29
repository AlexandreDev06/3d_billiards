/**
 * Todas as salas do servidor e quem está em qual. Aplica os limites globais (salas),
 * confere a versão do protocolo e as regras da casa antes de criar uma sala, e despacha
 * o resto para a sala da conexão.
 */
import { randomBytes, randomInt } from 'node:crypto';
import {
  FORCA_DA_SALA_PADRAO,
  MODALIDADE_PADRAO,
  versaoAceita,
  modoServeAModalidade,
  type CodigoErro,
  type MensagemDoCliente,
  type MsgCriarSala,
  type MsgEntrar,
  type RelogioSala,
} from '@sinuca/protocolo';
import { completarAposta, completarGiz, completarLinha, completarRelogio, textoModoRecusado } from './ajustes';
import { ROTULO_MODALIDADE, passarVez, validarPreset, type EstadoPartida } from '@sinuca/regras';
import { CarteirasEmMemoria, type CarteirasBase } from './carteiras-base';
import { gerarCodigo } from './codigo';
import type { ConfigDoNucleo } from './config-nucleo';
import { PESO_DA_RECUSA, TEXTO_DO_ERRO } from './erros';
import { BaldesPorChave } from './limite-taxa';
import { logSilencioso, type Logger } from './log';
import { REGRAS_DO_PACOTE, type MotorDeRegras } from './regras';
import type { DetalheDeSaida } from './rastro';
import { Sala, type Conexao } from './sala';

export interface DependenciasRegistro {
  readonly config: ConfigDoNucleo;
  readonly relogio?: () => number;
  readonly log?: Logger;
  readonly regras?: MotorDeRegras;
  readonly passarVez?: (partida: EstadoPartida) => EstadoPartida;
  readonly gerarToken?: () => string;
  readonly sortear?: (max: number) => number;
  /** As carteiras (L22). Sem elas, o registro cria um armazém só de memória (os testes das salas). */
  readonly carteiras?: CarteirasBase;
}

const TENTATIVAS_DE_CODIGO = 50;

export class Registro {
  private readonly salas = new Map<string, Sala>();
  private readonly salaDe = new Map<Conexao, Sala>();
  private readonly config: ConfigDoNucleo;
  private readonly relogio: () => number;
  private readonly log: Logger;
  private readonly regras: MotorDeRegras;
  private readonly passarVez: (partida: EstadoPartida) => EstadoPartida;
  private readonly gerarToken: () => string;
  private readonly sortear: (max: number) => number;
  private readonly falhasPorIp: BaldesPorChave;
  readonly carteiras: CarteirasBase;

  constructor(deps: DependenciasRegistro) {
    this.config = deps.config;
    this.relogio = deps.relogio ?? Date.now;
    this.log = deps.log ?? logSilencioso;
    this.regras = deps.regras ?? REGRAS_DO_PACOTE;
    this.passarVez = deps.passarVez ?? passarVez;
    this.gerarToken = deps.gerarToken ?? (() => randomBytes(16).toString('hex'));
    this.sortear = deps.sortear ?? ((max) => randomInt(max));
    this.falhasPorIp = new BaldesPorChave(this.config.falhasPorIp.capacidade, this.config.falhasPorIp.porSegundo, this.relogio);
    this.carteiras = deps.carteiras ?? new CarteirasEmMemoria({ maxCarteiras: this.config.maxCarteiras, relogio: this.relogio, log: this.log, presenteDeTeste: this.config.presenteDeTeste });
    // Mudou o saldo ou a skin de uma carteira (loja, ou o pote de outra sala): quem está sentado com ela na sala vê na hora.
    // A sala que acabou de pagar já manda o estado novo na sua própria sequência, então não é avisada de novo.
    this.carteiras.aoMudar((id, origem) => {
      for (const sala of this.salas.values()) if (sala !== origem) sala.carteiraMudou(id);
    });
    // O log da compra diz o apelido de quem comprou, se a carteira está sentada em alguma sala (o HTTP da loja não conhece nome).
    this.carteiras.usarApelidos((id) => {
      for (const sala of this.salas.values()) {
        const apelido = sala.apelidoDaCarteira(id);
        if (apelido !== null) return apelido;
      }
      return null;
    });
  }

  get totalSalas(): number {
    return this.salas.size;
  }

  get totalConexoes(): number {
    return this.salaDe.size;
  }

  /** `mensagem` já passou pela validação de forma do protocolo. */
  receber(conn: Conexao, mensagem: MensagemDoCliente): void {
    switch (mensagem.tipo) {
      case 'ping':
        return conn.enviar({ tipo: 'pong', t: mensagem.t });
      case 'criar-sala':
        return this.criar(conn, mensagem);
      case 'entrar':
        return this.entrar(conn, mensagem);
      default: {
        const sala = this.salaDe.get(conn);
        if (!sala) return this.erro(conn, 'fora-da-sala');
        sala.receber(conn, mensagem);
      }
    }
  }

  /**
   * `conn` poderia mandar uma tacada com este `seq` agora? É a pergunta que o transporte faz antes de
   * decodificar a gravação; devolve o código da recusa, ou `null`.
   */
  conferirTacada(conn: Conexao, seq: number): CodigoErro | null {
    const sala = this.salaDe.get(conn);
    return sala ? sala.conferirTacada(conn, seq) : 'fora-da-sala';
  }

  /** Responde a uma tacada que `conferirTacada` barrou: erro, retrato de ressincronia (se há partida) e infração. */
  recusarTacada(conn: Conexao, codigo: CodigoErro): void {
    const sala = this.salaDe.get(conn);
    if (sala) sala.recusarTacada(conn, codigo);
    else this.erro(conn, codigo);
  }

  desconectar(conn: Conexao, saida?: DetalheDeSaida): void {
    const sala = this.salaDe.get(conn);
    if (!sala) return;
    this.salaDe.delete(conn);
    sala.desconectar(conn, saida);
  }

  /** Roda a cada `tickMs`: tempo das salas e expiração. */
  tick(): void {
    this.falhasPorIp.limpar();
    for (const [codigo, sala] of [...this.salas]) {
      sala.tick();
      if (!sala.expirou()) continue;
      this.log('sala-expirou', { sala: codigo, conectados: sala.conectados });
      sala.encerrar('Sala encerrada por inatividade.');
      this.salas.delete(codigo);
      for (const [conn, s] of [...this.salaDe]) if (s === sala) this.salaDe.delete(conn);
    }
  }

  private criar(conn: Conexao, m: MsgCriarSala): void {
    if (this.salaDe.has(conn)) return this.erro(conn, 'ja-na-sala');
    if (!versaoAceita(m.versao)) return this.erro(conn, 'versao');
    conn.versao = m.versao;
    if (this.salas.size >= this.config.maxSalas) return this.erro(conn, 'servidor-cheio');
    if ([...this.salas.values()].filter((s) => s.ipCriador === conn.ip).length >= this.config.maxSalasPorIp) {
      return this.erro(conn, 'servidor-cheio', 'Você já tem salas demais abertas.');
    }

    let regras;
    try {
      regras = validarPreset({ nome: m.preset, provisorio: [], regras: m.regras }).regras;
    } catch {
      return this.erro(conn, 'regras-invalidas');
    }

    const modalidade = m.modalidade ?? MODALIDADE_PADRAO;
    if (regras.modalidade !== modalidade) {
      return this.erro(conn, 'regras-invalidas', `A sala é de ${ROTULO_MODALIDADE[modalidade]}, mas as regras mandadas são de ${ROTULO_MODALIDADE[regras.modalidade]}.`);
    }
    if (!modoServeAModalidade(modalidade, m.modo)) return this.erro(conn, 'regras-invalidas', textoModoRecusado(modalidade, m.modo));

    const relogio = this.relogioDe(m);
    if (typeof relogio === 'string') return this.erro(conn, 'regras-invalidas', relogio);
    const giz = completarGiz(m.giz);
    if (typeof giz === 'string') return this.erro(conn, 'regras-invalidas', giz);
    const aposta = completarAposta(m.aposta);
    if (typeof aposta === 'string') return this.erro(conn, 'regras-invalidas', aposta);

    const carteira = this.carteiraDe(conn, m.carteira);
    if (carteira === undefined) return this.orcamentoDeFalhasEsgotado(conn);

    const codigo = this.codigoLivre();
    if (codigo === null) return this.erro(conn, 'servidor-cheio');
    const sala = new Sala(
      { codigo, modo: m.modo, preset: m.preset, regras, relogio, linha: completarLinha(m.linha), giz, forca: m.forca ?? FORCA_DA_SALA_PADRAO, aposta, ipCriador: conn.ip },
      {
        config: this.config,
        relogio: this.relogio,
        gerarToken: this.gerarToken,
        sortear: this.sortear,
        regras: this.regras,
        passarVez: this.passarVez,
        log: this.log,
        carteiras: this.carteiras,
      },
    );
    const falha = sala.abrir(conn, m.nome, carteira);
    if (falha) return this.erro(conn, falha);
    this.salas.set(codigo, sala);
    this.salaDe.set(conn, sala);
    this.log('sala-criada', { sala: codigo, modalidade, modo: m.modo, linha: m.linha?.previsao === true, forca: m.forca ?? FORCA_DA_SALA_PADRAO, aposta, salas: this.salas.size });
  }

  private entrar(conn: Conexao, m: MsgEntrar): void {
    if (this.salaDe.has(conn)) return this.erro(conn, 'ja-na-sala');
    if (!versaoAceita(m.versao)) return this.erro(conn, 'versao');
    conn.versao = m.versao;
    const sala = this.salas.get(m.codigo);
    if (!sala) return this.codigoQueNaoExiste(conn);
    // quem volta ao próprio lugar ignora a carteira que mandar: não há o que adivinhar, e uma rede instável não gasta a ficha
    const carteira = sala.reconhece(m.token) ? null : this.carteiraDe(conn, m.carteira);
    if (carteira === undefined) return this.orcamentoDeFalhasEsgotado(conn);
    const falha = sala.entrar(conn, m.nome, m.token, carteira);
    if (falha) return this.erro(conn, falha);
    this.salaDe.set(conn, sala);
  }

  /** O relógio pedido completado com o padrão da sala, ou o texto da recusa (só `perde-a-vez` existe por enquanto). */
  private relogioDe(m: MsgCriarSala): RelogioSala | string {
    return completarRelogio(m.relogio, { tempoS: this.config.relogioTacada.tempoPadraoS, aoEsgotar: 'perde-a-vez' });
  }

  private codigoLivre(): string | null {
    for (let i = 0; i < TENTATIVAS_DE_CODIGO; i++) {
      const codigo = gerarCodigo(this.sortear);
      if (!this.salas.has(codigo)) return codigo;
    }
    return null;
  }

  /** Adivinhar códigos de sala: gasta a tolerância da conexão e o orçamento de falhas do IP (somando todas as conexões dele). */
  private codigoQueNaoExiste(conn: Conexao): void {
    if (this.falhasPorIp.tentar(conn.ip)) return this.erro(conn, 'sala-inexistente');
    this.orcamentoDeFalhasEsgotado(conn);
  }

  /**
   * O `id` da carteira do código que veio, ou `null` para jogar sem carteira (sem código, ou código que o servidor não conhece
   * — disco apagado —, que não é erro). O código desconhecido gasta uma ficha do orçamento de falhas do IP, o mesmo do código
   * de sala que não existe: o `estado-sala` mostra o saldo, então tentar códigos a esmo diria quais existem. `undefined` =
   * o orçamento acabou; quem chamou não segue. Só a entrada nova passa por aqui: a volta com o token da sala ignora a carteira.
   */
  private carteiraDe(conn: Conexao, codigo: string | undefined): string | null | undefined {
    if (codigo === undefined) return null;
    const id = this.carteiras.resolver(codigo);
    if (id !== undefined) return id;
    return this.falhasPorIp.tentar(conn.ip) ? null : undefined;
  }

  /** Orçamento do IP esgotado: nem diz mais se o código existe. */
  private orcamentoDeFalhasEsgotado(conn: Conexao): void {
    this.erro(conn, 'limite-mensagens');
    conn.fechar(1008, 'Tentativas demais de entrar em sala que não existe.');
  }

  private erro(conn: Conexao, codigo: CodigoErro, mensagem: string = TEXTO_DO_ERRO[codigo]): void {
    conn.enviar({ tipo: 'erro', codigo, mensagem });
    const peso = PESO_DA_RECUSA[codigo];
    if (peso) conn.punir(peso);
  }
}

