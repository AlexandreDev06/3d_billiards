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
import { comPrazo } from './conta-na-sinuca';
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
  /**
   * A conta de uma sessão, como o Banco diz (`Banco.contaDaSessao`), ou `null` se a sessão não vale mais (L61b). Com ela o registro relê a
   * sessão de quem tem conta antes de mexer em moeda (`criar-sala`, `entrar`, o começo de uma partida com aposta), no máximo uma vez por
   * `INTERVALO_DA_RELEITURA_MS` por conexão. Sem ela (sala sem contas) nada é relido.
   */
  readonly contaDaSessao?: (token: string) => Promise<{ readonly id: string } | null> | { readonly id: string } | null;
  /** A conta de uma conexão mudou (saiu, foi excluída, a sessão morreu): o transporte que guarda o `id` fora da memória (o anexo do WebSocket do Worker) o regrava. */
  readonly aoMudarConta?: (conn: Conexao) => void;
  /** Quanto a releitura da sessão espera o Banco (ms). */
  readonly prazoDaReleituraMs?: number;
}

/** De quanto em quanto tempo, no máximo, a sessão de uma conexão é relida no Banco (L61b). */
export const INTERVALO_DA_RELEITURA_MS = 10 * 60_000;
/** Banco que não respondeu a releitura: a conexão fica como está e a próxima tentativa vem depois disto. */
const REPETIR_RELEITURA_MS = 60_000;
const PRAZO_DA_RELEITURA_MS = 5000;

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
  /** Todas as conexões vivas que o registro conhece (L61b), em sala ou não: é por aqui que `esquecerConta` acha quem tem o `id` da conta. */
  private readonly conexoes = new Set<Conexao>();
  private readonly releituras = new Map<Conexao, Promise<void>>();
  private readonly contaDaSessao: DependenciasRegistro['contaDaSessao'];
  private readonly aoMudarConta: DependenciasRegistro['aoMudarConta'];
  private readonly prazoDaReleituraMs: number;

  constructor(deps: DependenciasRegistro) {
    this.contaDaSessao = deps.contaDaSessao;
    this.aoMudarConta = deps.aoMudarConta;
    this.prazoDaReleituraMs = deps.prazoDaReleituraMs ?? PRAZO_DA_RELEITURA_MS;
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

  /** O transporte abriu uma conexão (L61b): o registro passa a conhecê-la, mesmo antes de ela falar. */
  conexaoAberta(conn: Conexao): void {
    this.conexoes.add(conn);
  }

  /** `mensagem` já passou pela validação de forma do protocolo. */
  receber(conn: Conexao, mensagem: MensagemDoCliente): void {
    this.conexoes.add(conn);
    switch (mensagem.tipo) {
      case 'ping':
        return conn.enviar({ tipo: 'pong', t: mensagem.t });
      case 'criar-sala':
        return this.depoisDeConferirASessao([conn], conn, mensagem.tipo, () => this.criar(conn, mensagem));
      case 'entrar':
        return this.depoisDeConferirASessao([conn], conn, mensagem.tipo, () => this.entrar(conn, mensagem));
      default: {
        const sala = this.salaDe.get(conn);
        if (!sala) return this.erro(conn, 'fora-da-sala');
        if (mensagem.tipo === 'iniciar' || mensagem.tipo === 'nova-partida') {
          // o começo de uma partida com aposta mexe em moeda: quem está sentado com uma conta tem a sessão conferida antes
          return this.depoisDeConferirASessao(sala.conexoesDeContaNaAposta(), conn, mensagem.tipo, () => {
            if (this.salaDe.get(conn) === sala) sala.receber(conn, mensagem);
          });
        }
        sala.receber(conn, mensagem);
      }
    }
  }

  // ---------------------------------------------------------------- a conta da Beco Games (L61b)

  /**
   * A conta `id` saiu (`/conta/sair`) ou foi excluída (`/conta/excluir`): toda conexão que a trazia a perde (a conexão segue, sem conta, e
   * o que mandar depois joga como convidado) e os lugares que usam a carteira dela ficam sem carteira (o `estado-sala` mostra `saldo: null`).
   * Com `sessao` (o `sair` de um aparelho) só as conexões com esse token esquecem a conta, e o lugar só perde a carteira se nenhuma outra conexão
   * viva da conta continuar nele; sem `sessao` (`excluir`) é tudo da conta.
   * Uma aposta que já está em curso com essa carteira continua até o fim (ver `Sala.esquecerCarteira`). Devolve quantas conexões perderam a conta.
   */
  esquecerConta(id: string, sessao?: string): number {
    let conexoes = 0;
    for (const conn of this.conexoes) {
      if (conn.idDaConta !== id) continue;
      if (sessao !== undefined && conn.sessao !== sessao) continue;
      this.tirarAConta(conn);
      conexoes++;
    }
    const segue = sessao === undefined ? undefined : (c: Conexao) => c.idDaConta === id;
    for (const sala of this.salas.values()) sala.esquecerCarteira(id, segue);
    if (conexoes > 0) this.log('conta-esquecida', { conexoes });
    return conexoes;
  }

  /** A conexão deixa de ter conta: sem `id`, sem token de sessão. */
  private tirarAConta(conn: Conexao): void {
    delete conn.idDaConta;
    delete conn.sessao;
    delete conn.sessaoConferidaEm;
    this.aoMudarConta?.(conn);
  }

  /**
   * Roda `fn` já, ou depois de reler no Banco a sessão das `conexoes` que têm conta e não foram conferidas há `INTERVALO_DA_RELEITURA_MS`.
   * Sessão morta (outro aparelho, o portal, a senha nova) faz o que o `esquecerConta` faz, só naquela conexão; Banco fora do ar não derruba
   * ninguém: a conexão fica como está e o log avisa. `dona` é a conexão que mandou a mensagem: se ela caiu esperando, `fn` não roda.
   */
  private depoisDeConferirASessao(conexoes: readonly Conexao[], dona: Conexao, tipoDoPendente: string, fn: () => void): void {
    const agora = this.relogio();
    const velhas = this.contaDaSessao === undefined ? [] : conexoes.filter((c) => c.idDaConta !== undefined && c.sessao !== undefined && agora - (c.sessaoConferidaEm ?? 0) >= INTERVALO_DA_RELEITURA_MS);
    if (velhas.length === 0) return fn();
    Promise.all(velhas.map((c) => this.reler(c)))
      .then(() => {
        if (!this.conexoes.has(dona)) return;
        try {
          fn();
        } catch (e) {
          this.log('erro-interno', { tipo: tipoDoPendente, erro: e instanceof Error ? e.message : 'desconhecido' });
        }
      })
      .catch((e: unknown) => this.log('erro-interno', { tipo: tipoDoPendente, erro: e instanceof Error ? e.message : 'desconhecido' }));
  }

  private reler(conn: Conexao): Promise<void> {
    const emCurso = this.releituras.get(conn);
    if (emCurso) return emCurso;
    const feita = this.releitura(conn).finally(() => this.releituras.delete(conn));
    this.releituras.set(conn, feita);
    return feita;
  }

  private async releitura(conn: Conexao): Promise<void> {
    const id = conn.idDaConta;
    const token = conn.sessao;
    if (id === undefined || token === undefined || this.contaDaSessao === undefined) return;
    try {
      const conta = await comPrazo(Promise.resolve(this.contaDaSessao(token)), this.prazoDaReleituraMs);
      if (conn.idDaConta !== id) return; // mudou enquanto esperava
      if (conta !== null && conta.id === id) {
        conn.sessaoConferidaEm = this.relogio();
        this.aoMudarConta?.(conn);
        return;
      }
      this.log('sessao-morta');
      this.tirarAConta(conn);
      this.salaDe.get(conn)?.esquecerCarteiraDe(conn, id);
    } catch {
      // o Banco não respondeu: mantém e tenta de novo em um minuto, não a cada mensagem
      this.log('sessao-releitura-falhou');
      conn.sessaoConferidaEm = this.relogio() - INTERVALO_DA_RELEITURA_MS + REPETIR_RELEITURA_MS;
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
    this.conexoes.delete(conn);
    this.releituras.delete(conn);
    const sala = this.salaDe.get(conn);
    if (!sala) return;
    this.salaDe.delete(conn);
    sala.desconectar(conn, saida);
  }

  /** O servidor está saindo e as salas morrem com ele: cada aposta em curso solta a reserva no Banco (L57; sem a caixa ligada não faz nada). */
  devolverApostas(): void {
    for (const sala of this.salas.values()) sala.devolverApostaEmCurso();
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
    // L60b: durante a migração do saldo (carteiras congeladas) não abre sala: uma aposta não poderia ser paga
    if (this.carteiras.congelada) return this.erro(conn, 'servidor-cheio', 'A sala está em manutenção por alguns minutos.');
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
    // com o saldo no Banco (L59) o espelho é relido em segundo plano; se mudou, o estado-sala sai de novo
    if (carteira !== null) void this.carteiras.reler(carteira);
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
    if (carteira !== null) void this.carteiras.reler(carteira); // L59: o espelho relido em segundo plano; se mudou, o estado-sala sai de novo
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
    // L61: a sessão da conta manda e o código é ignorado (sem gastar o orçamento de falhas: não há o que adivinhar). A carteira da
    // conta nasce na primeira vez; se não puder nascer agora (congelada, sem o Banco), joga sem carteira
    if (conn.idDaConta !== undefined) {
      const g = this.carteiras.garantirDaConta(conn.idDaConta);
      if (g.ok) return g.id;
      // L61b: a conta foi excluída (pelo portal, sem a sinuca ver): a conexão que ainda a trazia a perde, e esta entrada joga sem carteira
      if (g.erro === 'excluida') this.tirarAConta(conn);
      return null;
    }
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

