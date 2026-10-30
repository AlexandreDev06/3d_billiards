/**
 * A sala inteira num Durable Object (L41): um objeto só, como o processo da sala Node — todas as salas, as carteiras e os baldes.
 * O Worker (entrada.ts) encaminha para cá o WebSocket `/sala`, o HTTP `/carteira*` e as rotas de administração; o resto do trabalho é
 * do mesmo núcleo da sala Node (`Registro`, `LigacaoDaSala`, `criarHttpDaCarteira`).
 *
 * WebSocket com hibernação (`acceptWebSocket`): enquanto há sala aberta o objeto tem um `setInterval` (o tick do `Registro`: o
 * relógio da vez, a tolerância, a expiração e o silêncio) e por isso NÃO hiberna. O `setInterval` sozinho não basta contra o
 * despejo: a doc diz que um timer pendente segura a memória por no máximo 15 minutos desde que foi criado, e que o objeto parado
 * que não pode hibernar é despejado 70 a 140 s depois do último pedido ou evento. Por isso, com sala aberta, um alarm rearmado a
 * cada 45 s (`AlarmeDaSala`) é o evento que o mantém na memória; sem sala, sem alarm. Fechada a última sala o tick para, e o objeto
 * pode dormir com as conexões ainda abertas (sem custo de duração); ao acordar, o construtor adota cada WebSocket de novo
 * (`SoquetesDaSala.adotar`, a partir do anexo: o IP e o último sinal). As carteiras não dependem disso: vão ao SQLite do objeto a
 * cada mudança. Se o runtime despejar o objeto com salas abertas (implantação nova, falha da máquina), as salas e as partidas se
 * perdem, como num reinício da sala Node; as carteiras voltam.
 */
import { DurableObject } from 'cloudflare:workers';
import type { BancoDaMigracao, BancoDaSala } from '../banco-da-sala';
import type { BancoDaConta } from '../conta-na-sinuca';
import { criarHttpDaCarteira, type HttpDaCarteira } from '../carteira-http';
import { ID_VALIDO } from '../carteiras-base';
import { CarteirasNoDO } from '../carteiras-sqlite';
import { ipDoCliente } from '../ip';
import { BaldesPorChave } from '../limite-taxa';
import type { Logger } from '../log';
import { MigracaoDeSaldos } from '../migracao-de-saldos';
import { origemPermitida } from '../origem';
import { Registro } from '../registro';
import { tokenDoCabecalho } from '../sessao-da-conta';
import { VarreduraDeExcluidas } from '../varredura-de-excluidas';
import { AdminDoWorker } from './admin';
import { AlarmeDaSala } from './alarme';
import { configDoWorker, type ConfigDoWorker } from './config-do-env';
import { pedidoDoRequest, respostaDoResultado } from './corpo-do-pedido';
import { SoquetesDaSala, anexoDoUpgrade, type AnexoDoSoquete } from './soquetes';

/** Registro de eventos em JSON, uma linha por evento (os Workers Logs indexam os campos). Só código da sala, contagens e apelido. */
export const logEmJson: Logger = (evento, campos = {}) => console.log(JSON.stringify({ evento, ...campos }));

/** De quanto em quanto tempo o alarm tenta de novo uma marca `daConta` que falhou (L61b). */
const REPETIR_MARCA_MS = 60_000;

const texto = (status: number, corpo: string, extra: Record<string, string> = {}): Response =>
  new Response(corpo, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });

export class SalaDO extends DurableObject<Env> {
  private readonly config: ConfigDoWorker;
  private readonly relogio = (): number => Date.now();
  private readonly carteiras: CarteirasNoDO;
  private readonly registro: Registro;
  private readonly httpCarteira: HttpDaCarteira;
  private readonly admin: AdminDoWorker;
  private readonly novasConexoes: BaldesPorChave;
  private readonly soquetes: SoquetesDaSala;
  private readonly alarme: AlarmeDaSala;
  private readonly varredura: VarreduraDeExcluidas | null;
  private origensAceitas: readonly string[] = [];
  private tick: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private readonly acordouEm = Date.now();
  private readonly contadores = { requisicoes: 0, mensagens: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.config = configDoWorker(env);
    const log = logEmJson;
    // L57: com SALDO_NO_BANCO=1 o Banco é o service binding CONTA (RPC para o entrypoint `Banco`); sem o binding o objeto nem sobe
    if (this.config.saldoNoBanco && env.CONTA === undefined) throw new Error('SALDO_NO_BANCO=1 exige o service binding CONTA (wrangler.jsonc, "services")');
    this.carteiras = new CarteirasNoDO({
      sql: ctx.storage.sql,
      transacao: (fn) => ctx.storage.transactionSync(fn),
      maxCarteiras: this.config.maxCarteiras,
      relogio: this.relogio,
      log,
      presenteDeTeste: this.config.presenteDeTeste,
      banco: this.config.saldoNoBanco ? (env.CONTA as unknown as BancoDaSala) : null,
      // a hora da próxima tentativa da caixa mudou: o alarm acompanha (o `alarme` nasce logo abaixo; este gancho só dispara depois do construtor)
      aoAgendarCaixa: () => void this.alarme?.aoHaverSala(),
    });
    this.registro = new Registro({
      config: this.config,
      log,
      relogio: this.relogio,
      carteiras: this.carteiras,
      // L61b: a sessão de quem tem conta é relida no Banco (no máximo a cada 10 min por conexão) antes de criar, entrar ou começar partida com aposta
      ...(env.CONTA === undefined ? {} : { contaDaSessao: (token: string) => (env.CONTA as unknown as BancoDaConta).contaDaSessao(token) }),
      aoMudarConta: (conn) => this.soquetes.regravarAnexo(conn),
    });
    this.httpCarteira = criarHttpDaCarteira({ config: this.config, carteiras: this.carteiras, relogio: this.relogio, origensAceitas: () => this.origensAceitas });
    this.novasConexoes = new BaldesPorChave(this.config.conexoesNovasPorIp.capacidade, this.config.conexoesNovasPorIp.porSegundo, this.relogio);
    this.admin = new AdminDoWorker({
      segredo: env.SEGREDO_ADMIN,
      carteiras: this.carteiras,
      relogio: this.relogio,
      log,
      uso: () => this.uso(),
      salasAbertas: () => this.registro.totalSalas,
      // o binding CONTA existe mesmo com SALDO_NO_BANCO desligada: a migração roda antes de ligar a chave
      migracao: new MigracaoDeSaldos({
        banco: env.CONTA === undefined ? undefined : (env.CONTA as unknown as BancoDaMigracao),
        carteiras: this.carteiras,
        salasAbertas: () => this.registro.totalSalas,
        log,
      }),
    });
    this.soquetes = new SoquetesDaSala({ config: this.config, registro: this.registro, relogio: this.relogio, log });
    this.alarme = new AlarmeDaSala({
      intervaloMs: this.config.alarmeMs,
      relogio: this.relogio,
      salasAbertas: () => this.registro.totalSalas,
      armar: (quando) => ctx.storage.setAlarm(quando),
      desarmar: () => ctx.storage.deleteAlarm(),
      log,
      proximaDaCaixa: () => this.proximoDespertar(),
      drenarCaixa: async () => {
        this.carteiras.tentarMarcasPendentes(); // L61b: a marca `daConta` que falhou é tentada de novo
        await this.carteiras.drenarCaixa();
      },
      varrer: () => this.varrerExcluidas(false),
    });
    // L61: as contas excluídas pelo portal (a sinuca não viu a exclusão) têm a carteira de itens apagada ao acordar e, no máximo uma vez por hora, no alarm
    this.varredura =
      env.CONTA === undefined
        ? null
        : new VarreduraDeExcluidas({
            banco: env.CONTA as unknown as BancoDaConta,
            // L61b: as exclusões, o registro dos excluídos e o ponto onde a varredura parou vão na mesma gravação
            apagar: (ids, ate) => this.carteiras.apagarDasContas(ids, ate),
            relogio: this.relogio,
            log,
            lerAte: () => this.carteiras.varridasAte,
          });
    // Acordou da hibernação com WebSockets abertos: cada um volta ao controle de silêncio, com o último sinal que guardou
    for (const ws of ctx.getWebSockets()) this.soquetes.adotar(ws);
    // Acordou com operações na caixa de saída (uma queda no meio do envio): o `CarteirasNoDO` já começou a drená-las; o alarm cobre o resto
    void this.alarme.aoHaverSala();
    void this.varrerExcluidas(true);
    log('sala-acordou', { carteiras: this.carteiras.total, conexoes: ctx.getWebSockets().length, ...(this.carteiras.saldoNoBanco ? { caixaDoBanco: this.carteiras.pendentesNaCaixa, comprasPendentes: this.carteiras.comprasPendentes } : {}) });
  }

  /** Quando o alarm precisa acordar o objeto: a próxima tentativa da caixa do Banco ou uma marca `daConta` pendente (L61b); `null` se nada pede. */
  private proximoDespertar(): number | null {
    const caixa = this.carteiras.proximaTentativaDaCaixa;
    const marca = this.carteiras.totalMarcasPendentes > 0 ? this.relogio() + REPETIR_MARCA_MS : null;
    return caixa === null ? marca : marca === null ? caixa : Math.min(caixa, marca);
  }

  /**
   * A varredura das contas excluídas (L61). Com a chave do Banco desligada e nenhuma carteira de conta, não há o que varrer e a sala nem
   * encosta no Banco (como antes do L61: um pedido ao Banco pendurado também impediria o objeto de hibernar).
   */
  private varrerExcluidas(forcar: boolean): Promise<number> {
    if (this.varredura === null || (!this.carteiras.saldoNoBanco && this.carteiras.totalDaConta === 0)) return Promise.resolve(0);
    return this.varredura.varrer(forcar);
  }

  /** O que o objeto fez desde que acordou. Zera quando ele dorme ou é despejado; serve para conferir a conta do plano gratuito. */
  private uso(): Record<string, unknown> {
    return {
      acordouEm: this.acordouEm,
      salas: this.registro.totalSalas,
      conexoes: this.ctx.getWebSockets().length,
      carteiras: this.carteiras.total,
      congeladaAte: this.carteiras.congeladaAteMs,
      carteirasPendentesDeGravacao: this.carteiras.pendentes,
      desdeQueAcordou: {
        requisicoesAoObjeto: this.contadores.requisicoes,
        mensagensRecebidas: this.contadores.mensagens,
        linhasLidas: this.carteiras.contadores.linhasLidas,
        linhasEscritas: this.carteiras.contadores.linhasEscritas,
        gravacoesFalhas: this.carteiras.contadores.gravacoesFalhas,
      },
      alarme: { proximoEm: this.alarme.proximoEm, disparos: this.alarme.disparos },
      ...(this.carteiras.saldoNoBanco ? { caixaDoBanco: { pendentes: this.carteiras.pendentesNaCaixa, mortas: this.carteiras.mortasNaCaixa, comprasPendentes: this.carteiras.comprasPendentes, proximaTentativaEm: this.carteiras.proximaTentativaDaCaixa } } : {}),
      soquetes: { ligacoes: this.soquetes.total, enderecosComBalde: this.soquetes.enderecosComBalde, encerrados: { ...this.soquetes.encerradosPorCausa } },
    };
  }

  override async fetch(request: Request): Promise<Response> {
    this.contadores.requisicoes++;
    const url = new URL(request.url);
    // O Origin aceito é o da lista (`ORIGENS`) e o do próprio endereço pelo qual o Worker foi chamado: o cliente é servido por ele.
    this.origensAceitas = [...this.config.origensPermitidas, url.origin];
    const ip = ipDoCliente(request.headers.get('cf-connecting-ip') ?? undefined, undefined);
    const caminho = url.pathname;
    if (caminho === '/sala') return this.abrirWebSocket(request, ip);
    if (caminho === '/carteira' || caminho.startsWith('/carteira/')) {
      const r = await this.httpCarteira.tratar(pedidoDoRequest(request, ip));
      if (r === 'nao-e-da-carteira' || r === 'abortada') return texto(404, 'Não encontrado.');
      return respostaDoResultado(r);
    }
    if (caminho.startsWith('/admin/')) return this.admin.tratar(request, url, ip);
    return texto(404, 'Não encontrado.');
  }

  /**
   * RPC da borda (L61): `POST /conta/criar` com o código de um convidado deu certo, então a carteira desse `id` só abre com a sessão.
   * Devolve se a carteira existe na sinuca. Só a borda do Worker tem o stub do objeto.
   */
  async marcarDaConta(id: string): Promise<boolean> {
    if (!ID_VALIDO.test(id)) throw new RangeError('id inválido');
    return this.carteiras.marcarDaConta(id);
  }

  /**
   * RPC da borda (L61b): `POST /conta/sair` ou `/conta/excluir` deu certo. As conexões que traziam essa conta a perdem (a conexão segue, sem conta),
   * inclusive no anexo que sobrevive à hibernação, e os lugares que usam a carteira dela ficam sem carteira. Devolve quantas conexões perderam a conta.
   */
  async esquecerConta(id: string, sessao?: string): Promise<number> {
    if (!ID_VALIDO.test(id)) throw new RangeError('id inválido');
    if (sessao !== undefined && tokenDoCabecalho(sessao) === undefined) throw new RangeError('sessão inválida');
    return this.registro.esquecerConta(id, sessao);
  }

  /** RPC da borda (L61b): a marca `daConta` do convidado que virou conta não pôde ser posta; fica pendente, persistida, e o alarm a tenta de novo. */
  async adiarMarca(id: string): Promise<boolean> {
    if (!ID_VALIDO.test(id)) throw new RangeError('id inválido');
    const adiou = this.carteiras.adiarMarca(id);
    void this.alarme.aoHaverSala();
    return adiou;
  }

  /** RPC da borda (L61): `POST /conta/excluir` deu certo; a carteira de itens da conta é apagada (a caixa do Banco não é tocada). */
  async apagarDaConta(id: string): Promise<number> {
    if (!ID_VALIDO.test(id)) throw new RangeError('id inválido');
    return this.carteiras.apagarDasContas([id]);
  }

  private abrirWebSocket(request: Request, ip: string): Response {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return texto(426, 'Use WebSocket em /sala.', { Upgrade: 'websocket' });
    if (!origemPermitida(request.headers.get('origin') ?? undefined, this.origensAceitas)) return texto(403, 'Forbidden');
    // Quem sumiu sem fechar libera a vaga antes de contar (sem sala não há tick que o faça)
    this.soquetes.vigiarSilencio();
    const abertos = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
    if (abertos.length >= this.config.maxConexoes) return texto(503, 'Service Unavailable');
    let doMesmoIp = 0;
    for (const ws of abertos) if ((ws.deserializeAttachment() as AnexoDoSoquete | null)?.ip === ip) doMesmoIp++;
    if (doMesmoIp >= this.config.maxConexoesPorIp) return texto(429, 'Too Many Requests');
    if (!this.novasConexoes.tentar(ip)) return texto(429, 'Too Many Requests');

    const par = new WebSocketPair();
    const [cliente, servidor] = [par[0], par[1]];
    // L61b: o anexo leva o token da sessão que a borda provou, para reler a sessão antes de mexer em moeda
    servidor.serializeAttachment(anexoDoUpgrade(request.headers, ip, this.relogio()) satisfies AnexoDoSoquete);
    this.ctx.acceptWebSocket(servidor);
    this.soquetes.adotar(servidor);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  override webSocketMessage(ws: WebSocket, mensagem: string | ArrayBuffer): void {
    this.contadores.mensagens++;
    this.soquetes.aoReceber(ws, mensagem);
    this.garantirTick();
    void this.alarme.aoHaverSala();
  }

  override webSocketClose(ws: WebSocket, codigo: number, motivo: string): void {
    this.soquetes.aoFechar(ws, codigo, motivo);
  }

  override webSocketError(ws: WebSocket): void {
    this.soquetes.aoFechar(ws, 1006, 'erro do WebSocket');
  }

  /** O alarm que segura o objeto na memória enquanto há sala (alarme.ts): rearma, ou deixa morrer se a última sala já fechou. */
  override async alarm(): Promise<void> {
    await this.alarme.aoDisparar();
  }

  /**
   * O objeto tem o tick (e por isso fica acordado) enquanto há sala ou enquanto algum endereço deve ao balde de mensagens (a
   * hibernação zeraria o balde); sem nenhum dos dois o tick para e o objeto pode dormir.
   */
  private garantirTick(): void {
    if (this.tick !== null || (this.registro.totalSalas === 0 && !this.soquetes.comDivida)) return;
    this.tick = setInterval(() => this.passar(), this.config.tickMs);
  }

  private passar(): void {
    try {
      this.registro.tick();
      this.novasConexoes.limpar();
      this.httpCarteira.limpar();
      this.admin.limpar();
      this.soquetes.limpar();
      // Sem `ping` do servidor (o Worker não pode pingar), quem some sem fechar é descoberto pelo silêncio: o cliente pinga a cada 15 s.
      this.soquetes.vigiarSilencio();
      if (++this.ticks % 5 === 0 && this.carteiras.pendentes > 0) this.carteiras.tentarPendentes();
      if (this.ticks % 5 === 0) this.carteiras.tentarMarcasPendentes();
    } catch (e) {
      logEmJson('erro-interno', { tipo: 'tick', erro: e instanceof Error ? e.message : 'desconhecido' });
    }
    // Sem sala o alarm de sobra sai: ele só acordaria um objeto que dorme (e acordar lê as carteiras todas)
    if (this.registro.totalSalas === 0) void this.alarme.aoFicarSemSala();
    if (this.registro.totalSalas === 0 && !this.soquetes.comDivida && this.tick !== null) {
      clearInterval(this.tick);
      this.tick = null;
    }
  }
}
