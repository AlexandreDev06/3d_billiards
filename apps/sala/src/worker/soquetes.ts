/**
 * Os WebSockets do `SalaDO` (L41b), sem o runtime: uma ligação por soquete (`LigacaoDaSala`), o que a sala Node faz sozinha com a
 * biblioteca `ws` e o Worker tem de fazer à mão, e a cota do dia.
 *
 * - **Tamanho** (igual ao `maxPayload` do `ws`): o que passa de `bytesPorMensagem` fecha com 1009 antes de ser codificado. No
 *   workerd o quadro chega inteiro (até 32 MiB), e sem este corte um soquete só mandaria 5 por segundo sem cair.
 * - **Cota por endereço**: cada mensagem recebida custa 1/20 de requisição ao objeto, seja qual for o conteúdo, e o balde da
 *   conexão (20/s) deixa 12 conexões do mesmo endereço gastarem 12 requisições por segundo. Um balde por IP, somando as conexões:
 *   esgotado, quem mandou a mensagem cai com 1008 (descartar calado não adianta: já foi cobrada).
 * - **Silêncio**: o Worker não pode pingar, então quem some sem fechar é achado por não dar sinal em 3 x `heartbeatMs` (75 s; o
 *   cliente pinga a cada 15 s) e é fechado com 4003. Fechar não basta: com o outro lado morto o handshake não volta e o
 *   `webSocketClose` pode nunca chegar, e a sala seguiria vendo o jogador conectado (a tolerância da vez nem começaria). Por isso
 *   toda queda decidida aqui também solta a ligação na hora, como o `terminate()` do Node dispara o `close` na hora.
 * - **Hibernação**: o último sinal de cada soquete vai no anexo (`serializeAttachment`, sobrevive à hibernação), e ao acordar
 *   `adotar` refaz a ligação de cada soquete com ele, para o silêncio enxergar quem voltou sem falar e não zerar a cada despertar.
 * - **Anexo antigo (L66)**: até o L61c o anexo guardava o TOKEN da sessão (`sessao`); agora só o resumo (`resumoDaSessao`). Uma conexão que
 *   hibernou antes da publicação acorda com o anexo antigo, e `migrarAnexosAntigos` (o construtor do objeto, antes de qualquer evento) calcula
 *   o resumo, regrava o anexo sem o token e mantém a hora da última conferência.
 */
import { LigacaoDaSala } from '../ligacao';
import { CABECALHO_DA_CONTA, CABECALHO_DO_RESUMO_DA_SESSAO, ehTokenDeSessao, idDaContaDoCabecalho, resumoDaSessao, resumoDeSessaoValido } from '../sessao-da-conta';
import { BaldesPorChave } from '../limite-taxa';
import type { Logger } from '../log';
import type { OrigemDaQueda } from '../rastro';
import type { Registro } from '../registro';
import type { Conexao } from '../sala';
import type { ConfigDoWorker } from './config-do-env';

const ABERTO = 1;


/** O que o `SalaDO` precisa de um WebSocket (o do workerd tem isto e mais). */
export interface SoqueteDoObjeto {
  readonly readyState: number;
  send(dado: string | ArrayBuffer | Uint8Array): void;
  close(codigo?: number, motivo?: string): void;
  serializeAttachment(valor: unknown): void;
  deserializeAttachment(): unknown;
}

/** O que cada WebSocket guarda para sobreviver à hibernação (no máximo 16 KiB; aqui são poucos bytes). */
export interface AnexoDoSoquete {
  /** A CHAVE do balde do IP (`ipDoCliente`). */
  readonly ip: string;
  /** Quando o cliente deu o último sinal (ms do relógio da sala), para o silêncio sobreviver à hibernação. */
  readonly sinalEm?: number;
  /** O `id` da conta que a sessão provou ao abrir a conexão (L61); sobrevive à hibernação no anexo. */
  readonly idDaConta?: string;
  /** O resumo (SHA-256 em hexadecimal) da sessão que provou `idDaConta` (L61b, resumo no L66), para reler a sessão antes de mexer em moeda; só com `idDaConta`. Nunca o token. */
  readonly resumoDaSessao?: string;
  /** Quando a sessão foi conferida com o Banco pela última vez (ms do relógio da sala). */
  readonly sessaoConferidaEm?: number;
}

/**
 * O que se pode LER de um anexo: o atual e, de uma conexão que hibernou antes do L66, o campo `sessao` com o token em claro. Nada grava este
 * campo; `migrarAnexosAntigos` o troca pelo resumo.
 */
type AnexoLido = Partial<AnexoDoSoquete> & { readonly sessao?: unknown };

/**
 * O anexo de um WebSocket recém-aberto, a partir dos cabeçalhos internos que a borda pôs (L61, L61b, L66): o `id` da conta e, só com ele, o
 * resumo da sessão e a hora da conferência. Sem o resumo no anexo a conexão nunca é relida enquanto viver.
 */
export function anexoDoUpgrade(cabecalhos: Headers, ip: string, agora: number): AnexoDoSoquete {
  const idDaConta = idDaContaDoCabecalho(cabecalhos.get(CABECALHO_DA_CONTA));
  const resumo = idDaConta === undefined ? undefined : resumoDeSessaoValido(cabecalhos.get(CABECALHO_DO_RESUMO_DA_SESSAO));
  return {
    ip,
    sinalEm: agora,
    ...(idDaConta === undefined ? {} : { idDaConta }),
    ...(resumo === undefined ? {} : { resumoDaSessao: resumo, sessaoConferidaEm: agora }),
  };
}

export interface DependenciasDosSoquetes {
  readonly config: ConfigDoWorker;
  readonly registro: Registro;
  readonly relogio: () => number;
  readonly log: Logger;
}

/** Quantas conexões a sala encerrou por cada causa, desde que o objeto acordou (vai ao `/admin/uso`). */
export interface EncerradosPorCausa {
  tamanho: number;
  cotaPorIp: number;
  silencio: number;
}

/** Por que a sala encerra uma conexão por conta própria: o que o rastro anota, o código de fechamento e o motivo (até 123 bytes). */
const CAUSAS = {
  /** Como o `ws` do Node fecha o que passa de `maxPayload`. */
  tamanho: { origem: 'tamanho', codigo: 1009, motivo: 'Mensagem grande demais.' },
  /** Política violada: o endereço gastou a cota de mensagens. */
  cotaPorIp: { origem: 'cota-por-ip', codigo: 1008, motivo: 'Mensagens demais deste endereço.' },
  /** De 4000 a 4999 é do aplicativo. */
  silencio: { origem: 'heartbeat', codigo: 4003, motivo: 'Sem sinal do cliente.' },
} as const satisfies Record<keyof EncerradosPorCausa, { origem: OrigemDaQueda; codigo: number; motivo: string }>;

/** Fechar um WebSocket que já caiu lança; quem fecha não quer saber. */
export function fecharSemErro(ws: Pick<SoqueteDoObjeto, 'close'>, codigo: number, motivo: string): void {
  try {
    ws.close(codigo, motivo);
  } catch {
    // já fechado
  }
}

export class SoquetesDaSala {
  private readonly ligacoes = new Map<SoqueteDoObjeto, LigacaoDaSala>();
  private readonly encerrados = new WeakSet<SoqueteDoObjeto>();
  private readonly mensagensPorIp: BaldesPorChave;
  readonly encerradosPorCausa: EncerradosPorCausa = { tamanho: 0, cotaPorIp: 0, silencio: 0 };

  constructor(private readonly deps: DependenciasDosSoquetes) {
    const { mensagensPorIp } = deps.config;
    this.mensagensPorIp = new BaldesPorChave(mensagensPorIp.capacidade, mensagensPorIp.porSegundo, deps.relogio);
  }

  /** Quantas ligações a sala acompanha. */
  get total(): number {
    return this.ligacoes.size;
  }

  /**
   * Algum endereço ainda está devendo ao balde de mensagens. Enquanto isso o objeto não pode hibernar: a hibernação zera a
   * memória, e quem esvaziou o balde, parando 10 s, o receberia cheio de novo (o objeto fica acordado pelo tick até recarregar).
   */
  get comDivida(): boolean {
    return this.mensagensPorIp.tamanho > 0;
  }

  /** Quantos endereços têm balde de mensagens (cheio ou não). */
  get enderecosComBalde(): number {
    return this.mensagensPorIp.tamanho;
  }

  /** Esquece os baldes que já voltaram a ficar cheios; roda a cada tick. */
  limpar(): void {
    this.mensagensPorIp.limparCheios();
  }

  /** A ligação deste WebSocket; depois de uma hibernação ela não existe mais na memória e é refeita do anexo (o IP e o último sinal). */
  adotar(ws: SoqueteDoObjeto): LigacaoDaSala {
    let ligacao = this.ligacoes.get(ws);
    if (ligacao) return ligacao;
    const { config, registro, relogio, log } = this.deps;
    const anexo = ws.deserializeAttachment() as AnexoLido | null;
    const resumo = resumoDeSessaoValido(anexo?.resumoDaSessao);
    // um anexo que ainda tem o token (`sessao`) e não foi migrado, sem resumo válido, falha fechado: o resumo não se calcula aqui e o token não segue
    // adiante, e conta sem releitura não pode ficar (a releitura a pularia e o `sair` daquele aparelho não a acharia); a conexão vira sem conta
    const semSessaoParaReler = anexo !== null && typeof anexo === 'object' && 'sessao' in anexo && resumo === undefined;
    const idDoAnexo = anexo?.idDaConta;
    const idDaConta = typeof idDoAnexo === 'string' && !semSessaoParaReler ? idDoAnexo : undefined;
    ligacao = new LigacaoDaSala({
      config,
      registro,
      relogio,
      log,
      ip: anexo?.ip ?? 'desconhecido',
      ...(idDaConta === undefined ? {} : { idDaConta }),
      ...(idDaConta !== undefined && resumo !== undefined ? { resumoDaSessao: resumo, ...(typeof anexo?.sessaoConferidaEm === 'number' ? { sessaoConferidaEm: anexo.sessaoConferidaEm } : {}) } : {}),
      ...(typeof anexo?.sinalEm === 'number' ? { sinalEm: anexo.sinalEm } : {}),
      soquete: {
        aberto: () => ws.readyState === ABERTO,
        enviar: (dado) => ws.send(dado),
        fechar: (codigo, motivo) => fecharSemErro(ws, codigo, motivo),
        // não há como derrubar sem handshake: o outro lado fecha em seguida
        derrubar: () => fecharSemErro(ws, 1011, 'Conexão encerrada.'),
        presos: () => 0,
      },
    });
    this.ligacoes.set(ws, ligacao);
    return ligacao;
  }

  /** Uma mensagem chegou ao objeto (`webSocketMessage`). */
  aoReceber(ws: SoqueteDoObjeto, mensagem: string | ArrayBuffer): void {
    // Já encerrado por aqui (ou fechando): o que ainda chega na fila do soquete não vale nada, nem recria a ligação
    if (this.encerrados.has(ws) || ws.readyState !== ABERTO) return;
    const ligacao = this.adotar(ws);
    const { config, relogio } = this.deps;
    // Toda mensagem custa à cota do dia, mesmo a que a sala recusa: conta antes de olhar o que ela é
    if (!this.mensagensPorIp.tentar(ligacao.conn.ip)) return this.encerrar(ws, ligacao, 'cotaPorIp');
    const binario = typeof mensagem !== 'string';
    // Um texto de N unidades UTF-16 tem ao menos N bytes em UTF-8: se N já passa do teto, não há o que codificar
    if ((binario ? mensagem.byteLength : mensagem.length) > config.bytesPorMensagem) return this.encerrar(ws, ligacao, 'tamanho');
    const bruto = binario ? new Uint8Array(mensagem) : new TextEncoder().encode(mensagem);
    if (bruto.length > config.bytesPorMensagem) return this.encerrar(ws, ligacao, 'tamanho');
    ligacao.aoReceber(bruto, binario);
    this.guardarSinal(ws, ligacao.conn, relogio());
  }

  /**
   * Troca o anexo antigo (L61b: o TOKEN da sessão em `sessao`) pelo atual (o resumo em `resumoDaSessao`), regravando-o sem o token e sem mexer no
   * resto (IP, último sinal, `id`, hora da conferência). Roda no construtor do objeto, antes de `adotar` e de qualquer evento: é o único lugar
   * em que o token de um anexo é lido, e é para ser trocado, nunca para seguir. Falha fechado: sem resumo válido (nem o que o anexo já tinha, nem
   * o calculado do token) o anexo perde também o `idDaConta` e a hora da conferência, e a conexão vira sem conta. Nunca lança (um soquete cujo
   * anexo não se lê ou não se grava é pulado, e o `adotar` ainda tira a conta de um anexo com `sessao` e sem resumo). Devolve quantos anexos
   * foram migrados.
   */
  async migrarAnexosAntigos(soquetes: Iterable<SoqueteDoObjeto>): Promise<number> {
    let migrados = 0;
    for (const ws of soquetes) {
      try {
        const anexo = ws.deserializeAttachment() as AnexoLido | null;
        if (anexo === null || typeof anexo !== 'object' || !('sessao' in anexo)) continue;
        const { sessao, ...resto } = anexo;
        const { resumoDaSessao: resumoGravado, idDaConta, sessaoConferidaEm, ...semConta } = resto;
        const resumo = resumoDeSessaoValido(resumoGravado) ?? (ehTokenDeSessao(sessao) ? await resumoDaSessao(sessao) : undefined);
        const comConta = typeof idDaConta === 'string' && resumo !== undefined;
        ws.serializeAttachment({ ...semConta, ...(comConta ? { idDaConta, resumoDaSessao: resumo, ...(sessaoConferidaEm === undefined ? {} : { sessaoConferidaEm }) } : {}) });
        migrados++;
      } catch {
        // soquete que fechou no meio, ou anexo ilegível
      }
    }
    if (migrados > 0) this.deps.log('anexos-migrados', { conexoes: migrados });
    return migrados;
  }

  /**
   * O objeto acordou (ou foi publicado de novo) com estes WebSockets abertos: troca os anexos antigos (`migrarAnexosAntigos`) e só então adota
   * cada soquete. É o que o construtor do `SalaDO` roda dentro de `blockConcurrencyWhile`, para nenhum evento ver um anexo com o token.
   */
  async adotarTodos(soquetes: readonly SoqueteDoObjeto[]): Promise<void> {
    await this.migrarAnexosAntigos(soquetes);
    for (const ws of soquetes) this.adotar(ws);
  }

  /**
   * A conta de uma conexão mudou (saiu, foi excluída, a sessão morreu ou foi conferida de novo): o anexo, que sobrevive à hibernação, é regravado
   * com o que a conexão tem agora, SEM mexer no último sinal (senão uma conta esquecida adiaria o silêncio). Sem isto o objeto que acordasse
   * adotaria o soquete com a conta de antes.
   */
  regravarAnexo(conn: Conexao): void {
    for (const [ws, ligacao] of this.ligacoes) {
      if (ligacao.conn !== conn || ws.readyState !== ABERTO) continue;
      const anterior = ws.deserializeAttachment() as AnexoLido | null;
      this.gravarAnexo(ws, conn, typeof anterior?.sinalEm === 'number' ? anterior.sinalEm : undefined);
      return;
    }
  }

  /** O soquete fechou ou deu erro (`webSocketClose`, `webSocketError`). */
  aoFechar(ws: SoqueteDoObjeto, codigo: number, motivo: string): void {
    this.soltar(ws, codigo, motivo);
  }

  /** Fecha e solta quem passou de 3 x `heartbeatMs` sem dar sinal. Roda a cada tick e a cada conexão nova. */
  vigiarSilencio(): void {
    const limiteDeSilencio = 3 * this.deps.config.heartbeatMs;
    for (const [ws, ligacao] of this.ligacoes) {
      if (ligacao.rastro.silencioMs() <= limiteDeSilencio) continue;
      this.encerrar(ws, ligacao, 'silencio');
    }
  }

  /**
   * O servidor decide encerrar: anota a causa no rastro (o log `saiu` a mostra), fecha com handshake e, sem esperar o outro
   * lado, solta a ligação, para a sala ver o jogador sair já. O `webSocketClose` que vier depois não acha mais a ligação.
   */
  private encerrar(ws: SoqueteDoObjeto, ligacao: LigacaoDaSala, causa: keyof EncerradosPorCausa): void {
    const { origem, codigo, motivo } = CAUSAS[causa];
    this.encerradosPorCausa[causa]++;
    ligacao.rastro.encerrando(origem, 0);
    this.encerrados.add(ws);
    fecharSemErro(ws, codigo, motivo);
    this.soltar(ws, codigo, motivo);
  }

  private soltar(ws: SoqueteDoObjeto, codigo: number, motivo: string): void {
    const ligacao = this.ligacoes.get(ws);
    if (!ligacao) return;
    this.ligacoes.delete(ws);
    ligacao.aoFechar(codigo, motivo);
  }

  private guardarSinal(ws: SoqueteDoObjeto, conn: Conexao, agora: number): void {
    if (ws.readyState !== ABERTO) return;
    this.gravarAnexo(ws, conn, agora);
  }

  private gravarAnexo(ws: SoqueteDoObjeto, conn: Conexao, sinalEm: number | undefined): void {
    const comConta = conn.idDaConta !== undefined;
    try {
      ws.serializeAttachment({
        ip: conn.ip,
        ...(sinalEm === undefined ? {} : { sinalEm }),
        ...(comConta ? { idDaConta: conn.idDaConta } : {}),
        ...(comConta && conn.resumoDaSessao !== undefined ? { resumoDaSessao: conn.resumoDaSessao, ...(conn.sessaoConferidaEm === undefined ? {} : { sessaoConferidaEm: conn.sessaoConferidaEm }) } : {}),
      } satisfies AnexoDoSoquete);
    } catch {
      // soquete que fechou entre a conferência e a gravação: o anexo não importa mais
    }
  }
}
