/** Cliente WebSocket real para testes de integração: fala o protocolo de verdade (codec e quadros binários). */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, type ClientOptions } from 'ws';
import {
  PROTOCOLO_VERSAO,
  codificarMensagem,
  decodificarMensagemDaSala,
  type MensagemDaSala,
  type MensagemDoCliente,
  type ModoSala,
  type MsgCriarSala,
} from '@sinuca/protocolo';
import { PRESET_BOTECO, type ConfigRegras } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO, type ConfigSala } from './config';
import { SEM_LIMITE, mensagemDeCriar, sortearDeTeste, visaoDasMensagens, type VisaoDoCliente } from './para-testes';
import { iniciarServidor, type OpcoesDoServidor, type Servidor } from './servidor';

export class ClienteWs {
  readonly recebidas: MensagemDaSala[] = [];
  /** Tamanho de cada quadro recebido, em bytes, com o tipo da mensagem. */
  readonly quadros: { tipo: string; bytes: number }[] = [];
  readonly invalidas: string[] = [];
  fechou: { codigo: number; motivo: string } | null = null;
  private leitores: (() => void)[] = [];

  private constructor(
    readonly ws: WebSocket,
    readonly nome: string,
  ) {
    ws.on('message', (data, isBinary) => {
      const bruto = data as Buffer;
      const r = decodificarMensagemDaSala(isBinary ? bruto : bruto.toString('utf8'));
      if (r.ok) {
        this.recebidas.push(r.valor);
        this.quadros.push({ tipo: r.valor.tipo, bytes: bruto.length });
      } else this.invalidas.push(r.erro);
      for (const l of this.leitores.splice(0)) l();
    });
    ws.on('close', (codigo, motivo) => {
      this.fechou = { codigo, motivo: motivo.toString() };
      for (const l of this.leitores.splice(0)) l();
    });
    ws.on('error', () => {});
  }

  static conectar(porta: number, nome = 'cliente', opcoes: ClientOptions = {}): Promise<ClienteWs> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${porta}/sala`, opcoes);
      const c = new ClienteWs(ws, nome);
      ws.once('open', () => resolve(c));
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
  }

  enviar(mensagem: MensagemDoCliente): this {
    this.ws.send(codificarMensagem(mensagem));
    return this;
  }

  enviarBruto(dado: string | Uint8Array): this {
    this.ws.send(dado);
    return this;
  }

  /** Sem limite de tempo por padrão: os testes de rede andam em tempo real e não querem o relógio de 30 s no meio. */
  criar(modo: ModoSala = '1x1', relogio: MsgCriarSala['relogio'] = SEM_LIMITE, linha?: MsgCriarSala['linha'], regras: ConfigRegras = PRESET_BOTECO.regras, extra: Partial<MsgCriarSala> = {}): this {
    return this.enviar(mensagemDeCriar(this.nome, modo, regras, relogio, linha, extra));
  }

  entrar(codigo: string, token?: string, carteira?: string): this {
    return this.enviar({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo, nome: this.nome, ...(token ? { token } : {}), ...(carteira ? { carteira } : {}) });
  }

  /** Espera (até `ms`) pela primeira mensagem, já recebida ou futura, que satisfaz `serve`. */
  async esperar<T extends MensagemDaSala>(serve: (m: MensagemDaSala) => m is T, ms?: number): Promise<T>;
  async esperar(serve: (m: MensagemDaSala) => boolean, ms?: number): Promise<MensagemDaSala>;
  async esperar(serve: (m: MensagemDaSala) => boolean, ms = 5000): Promise<MensagemDaSala> {
    const limite = Date.now() + ms;
    for (;;) {
      const achada = this.recebidas.find(serve);
      if (achada) return achada;
      if (this.fechou) throw new Error(`${this.nome}: conexão fechada (${this.fechou.codigo}) esperando mensagem`);
      const restante = limite - Date.now();
      if (restante <= 0) throw new Error(`${this.nome}: tempo esgotado; recebeu ${this.recebidas.map((m) => m.tipo).join(',')}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${this.nome}: tempo esgotado`)), restante);
        this.leitores.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  esperarTipo<T extends MensagemDaSala['tipo']>(tipo: T, ms?: number): Promise<Extract<MensagemDaSala, { tipo: T }>> {
    return this.esperar((m): m is Extract<MensagemDaSala, { tipo: T }> => m.tipo === tipo, ms);
  }

  async esperarFechar(ms = 3000): Promise<{ codigo: number; motivo: string }> {
    const limite = Date.now() + ms;
    while (!this.fechou) {
      const restante = limite - Date.now();
      if (restante <= 0) throw new Error(`${this.nome}: a conexão não fechou`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, restante);
        this.leitores.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    return this.fechou;
  }

  get ultimoEstado() {
    return this.recebidas.filter((m) => m.tipo === 'estado-sala').at(-1) as Extract<MensagemDaSala, { tipo: 'estado-sala' }> | undefined;
  }

  get boasVindas() {
    return this.recebidas.find((m) => m.tipo === 'boas-vindas') as Extract<MensagemDaSala, { tipo: 'boas-vindas' }> | undefined;
  }

  get visao(): VisaoDoCliente | null {
    return visaoDasMensagens(this.recebidas);
  }

  fechar(): void {
    this.ws.close();
  }

  derrubar(): void {
    this.ws.terminate();
  }
}

/** Servidores e clientes de um teste de rede, com a pasta web de mentira e o encerramento de tudo no fim. */
export class AmbienteDeRede {
  readonly base = mkdtempSync(join(tmpdir(), 'sala-rede-'));
  readonly pasta = join(this.base, 'web');
  private readonly servidores: Servidor[] = [];
  private readonly clientes: ClienteWs[] = [];
  /** Cada servidor sobe com a sua pasta de dados: a pasta tem um dono só (trava). */
  private pastasDeDados = 0;

  constructor() {
    mkdirSync(join(this.pasta, 'assets'), { recursive: true });
    writeFileSync(join(this.pasta, 'index.html'), '<!doctype html><title>Sinuca</title><script type="module" src="/assets/app-1.js"></script>');
    writeFileSync(join(this.pasta, 'assets', 'app-1.js'), 'console.log(1)');
  }

  async subir(config: Partial<ConfigSala> = {}, opcoes: OpcoesDoServidor = {}): Promise<Servidor> {
    const s = await iniciarServidor(
      { ...CONFIG_SALA_PADRAO, porta: 0, pastaWeb: this.pasta, pastaDados: join(this.base, `dados-${++this.pastasDeDados}`), ...config },
      { ...opcoes, registro: { sortear: sortearDeTeste(), ...opcoes.registro } },
    );
    this.servidores.push(s);
    return s;
  }

  async conectar(s: Servidor, nome = 'c', opcoes: ClientOptions = {}): Promise<ClienteWs> {
    const c = await ClienteWs.conectar(s.porta, nome, opcoes);
    this.clientes.push(c);
    return c;
  }

  async encerrar(): Promise<void> {
    for (const c of this.clientes.splice(0)) c.derrubar();
    await Promise.all(this.servidores.splice(0).map((s) => s.fechar()));
    rmSync(this.base, { recursive: true, force: true });
  }
}

/** HTTP cru, sem a normalização de URL e de cabeçalhos do cliente, para os casos de ataque. */
export function httpBruto(porta: number, requisicao: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect(porta, '127.0.0.1', () => sock.write(requisicao));
    let saida = '';
    sock.on('data', (d) => (saida += d.toString('latin1')));
    sock.on('end', () => resolve(saida));
    sock.on('error', reject);
    sock.setTimeout(3000, () => {
      sock.destroy();
      resolve(saida);
    });
  });
}
