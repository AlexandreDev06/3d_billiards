/**
 * Uma conexão de cliente do ponto de vista da sala, sem saber se o transporte é o `ws` do Node ou o WebSocket de um Durable Object:
 * os baldes de mensagens e de tolerância, a decodificação estrita do protocolo, a entrega ao `Registro` e a saída com o rastro de
 * por que a conexão caiu. O transporte (servidor.ts, na sala Node; worker/sala-do.ts, no Worker) só empresta o `SoqueteDaSala` e
 * chama `aoReceber` e `aoFechar`.
 */
import { PROTOCOLO_VERSAO, codificarMensagem, decodificarMensagemDoCliente, paraVersaoDoCliente, type MensagemDaSala } from '@sinuca/protocolo';
import type { ConfigDoNucleo } from './config-nucleo';
import { PESO_DA_RECUSA, TEXTO_DO_ERRO } from './erros';
import { BaldeDeTokens } from './limite-taxa';
import { logSilencioso, type Logger } from './log';
import { RastroDaConexao } from './rastro';
import type { Registro } from './registro';
import type { Conexao } from './sala';

/** O que o transporte sabe fazer com o outro lado da conexão. */
export interface SoqueteDaSala {
  /** Ainda dá para enviar? Fechado, `enviar` não é chamado. */
  aberto(): boolean;
  /** Envia um quadro: texto (`string`) ou binário. */
  enviar(dado: string | Uint8Array): void;
  /** Fecha com o handshake de fechamento. */
  fechar(codigo: number, motivo: string): void;
  /** Derruba sem esperar o outro lado. */
  derrubar(): void;
  /** Bytes que ficaram presos no envio (cliente lento); o transporte que não vê isso devolve 0. */
  presos(): number;
}

/** Cliente lento demais: se o buffer de envio passar disto, a conexão cai em vez de encher a memória. */
export const MAX_BUFFER_ENVIO = 4 * 1024 * 1024;

const cacheDeCodificacao = new WeakMap<MensagemDaSala, string | Uint8Array>();

/** A mesma mensagem vai a vários clientes: codifica uma vez só. */
function codificarUmaVez(mensagem: MensagemDaSala): string | Uint8Array {
  let dado = cacheDeCodificacao.get(mensagem);
  if (dado === undefined) {
    dado = codificarMensagem(mensagem);
    cacheDeCodificacao.set(mensagem, dado);
  }
  return dado;
}

export interface DependenciasDaLigacao {
  readonly config: Pick<ConfigDoNucleo, 'mensagens' | 'tolerancia' | 'bytesPorFicha' | 'bytesPorMensagem'>;
  readonly registro: Registro;
  readonly relogio: () => number;
  readonly log?: Logger;
  /** A CHAVE do balde do IP (`ipDoCliente`); nunca vai a log. */
  readonly ip: string;
  readonly soquete: SoqueteDaSala;
  /** Quando o cliente deu o último sinal, se esta ligação continua uma de antes (o Worker refaz a ligação depois de hibernar). */
  readonly sinalEm?: number;
}

export class LigacaoDaSala {
  readonly rastro: RastroDaConexao;
  readonly conn: Conexao;
  private readonly balde: BaldeDeTokens;
  private readonly tolerancia: BaldeDeTokens;
  private readonly log: Logger;

  constructor(private readonly deps: DependenciasDaLigacao) {
    const { config, relogio, soquete } = deps;
    this.log = deps.log ?? logSilencioso;
    this.rastro = new RastroDaConexao(relogio, deps.sinalEm);
    this.balde = new BaldeDeTokens(config.mensagens.capacidade, config.mensagens.porSegundo, relogio);
    this.tolerancia = new BaldeDeTokens(config.tolerancia.capacidade, config.tolerancia.porSegundo, relogio);
    this.conn = {
      id: 'ws',
      ip: deps.ip,
      punir: (peso) => void this.punir(peso),
      enviar: (mensagem) => {
        if (!soquete.aberto()) return;
        const presos = soquete.presos();
        if (presos > MAX_BUFFER_ENVIO) {
          this.rastro.encerrando('envio-lento', presos);
          return soquete.derrubar();
        }
        // a mesma mensagem vai a vários clientes e é codificada uma vez só; o da versão mínima recebe uma cópia sem o que não conhece, que é um
        // objeto novo a cada envio e por isso é codificada na hora, fora do cache (ninguém a acharia de novo)
        const paraEle = paraVersaoDoCliente(mensagem, this.conn.versao ?? PROTOCOLO_VERSAO);
        soquete.enviar(paraEle === mensagem ? codificarUmaVez(mensagem) : codificarMensagem(paraEle));
      },
      fechar: (codigo, motivo) => soquete.fechar(codigo, motivo),
    };
  }

  /** Conta uma infração de `peso` fichas; esgotada a tolerância, derruba a conexão. */
  private punir(peso: number): boolean {
    if (this.tolerancia.tentar(peso)) return true;
    this.rastro.encerrando('tolerancia', this.deps.soquete.presos());
    this.deps.soquete.fechar(1008, 'Mensagens demais ou recusadas demais.');
    return false;
  }

  /** Um quadro chegou. `binario` diz se é o envelope binário ou um quadro de texto (UTF-8). */
  aoReceber(bruto: Uint8Array, binario: boolean): void {
    const { config, registro } = this.deps;
    const { conn } = this;
    this.rastro.sinal();
    // Mensagem grande gasta mais do balde. Os tetos por tipo de quadro e a ordem das conferências ficam no decodificador:
    // tamanho antes de qualquer parse, e a gravação (a parte cara) só depois de sala, vez e seq.
    if (!this.balde.tentar(1 + Math.floor(bruto.length / config.bytesPorFicha))) {
      if (this.punir(1)) conn.enviar({ tipo: 'erro', codigo: 'limite-mensagens', mensagem: TEXTO_DO_ERRO['limite-mensagens'] });
      return;
    }
    const r = decodificarMensagemDoCliente(bruto, {
      texto: !binario,
      limites: { quadro: config.bytesPorMensagem },
      autorizarGravacao: ({ seq }) => registro.conferirTacada(conn, seq),
    });
    if (!r.ok) {
      if (r.recusadaPelaSala) return registro.recusarTacada(conn, r.codigo);
      conn.enviar({ tipo: 'erro', codigo: r.codigo, mensagem: TEXTO_DO_ERRO[r.codigo] });
      this.punir(PESO_DA_RECUSA[r.codigo] ?? 1);
      return;
    }
    try {
      registro.receber(conn, r.valor);
    } catch (e) {
      this.log('erro-interno', { tipo: r.valor.tipo, erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }

  /** O outro lado fechou (ou a conexão caiu). */
  aoFechar(codigo: number, motivo: Uint8Array | string): void {
    this.deps.registro.desconectar(this.conn, this.rastro.saida(codigo, motivo, this.deps.soquete.presos()));
  }
}
