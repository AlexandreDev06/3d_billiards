/**
 * O processo do servidor: HTTP estático (o build do apps/web) e a sala WebSocket em `/sala`, na mesma porta.
 * Aqui ficam só as bordas — sockets, limites por conexão, heartbeat e arquivos; as regras da sala estão em `Registro`.
 */
import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { codificarMensagem, decodificarMensagemDoCliente, type MensagemDaSala } from '@sinuca/protocolo';
import { SEGURANCA } from './cabecalhos';
import { criarHttpDaCarteira } from './carteira-http';
import { ArmazemDeCarteiras } from './carteiras';
import type { ConfigSala } from './config';
import { PESO_DA_RECUSA, TEXTO_DO_ERRO } from './erros';
import { resolverEstatico } from './estatico';
import { ipDoCliente } from './ip';
import { BaldeDeTokens, BaldesPorChave } from './limite-taxa';
import { origemPermitida } from './origem';
import { logSilencioso, type Logger } from './log';
import { RastroDaConexao } from './rastro';
import { Registro, type DependenciasRegistro } from './registro';
import type { Conexao } from './sala';

export interface Servidor {
  readonly porta: number;
  readonly endereco: string;
  readonly registro: Registro;
  /** As carteiras (L22); `fechar()` as descarrega em disco e solta a trava da pasta de dados. */
  readonly carteiras: ArmazemDeCarteiras;
  fechar(): Promise<void>;
}

export interface OpcoesDoServidor {
  readonly log?: Logger;
  readonly registro?: Partial<DependenciasRegistro>;
  /** As carteiras já abertas (os testes); por padrão o servidor abre as de `config.pastaDados`. */
  readonly carteiras?: ArmazemDeCarteiras;
  /** Relógio dos limites de taxa (ms); os testes injetam o seu. */
  readonly relogio?: () => number;
}

const COMPRESSIVEL = /^(text\/|application\/(json|manifest\+json|wasm)|image\/svg\+xml)|javascript/;
const MIN_GZIP = 1024;
const MAX_ENTRADAS_GZIP = 200;
/** Cliente lento demais: se o buffer de envio passar disto, a conexão cai em vez de encher a memória. */
const MAX_BUFFER_ENVIO = 4 * 1024 * 1024;

const cacheDeCodificacao = new WeakMap<MensagemDaSala, string | Uint8Array>();

function codificarUmaVez(mensagem: MensagemDaSala): string | Uint8Array {
  let dado = cacheDeCodificacao.get(mensagem);
  if (dado === undefined) {
    dado = codificarMensagem(mensagem);
    cacheDeCodificacao.set(mensagem, dado);
  }
  return dado;
}

const ipDe = (req: IncomingMessage): string => ipDoCliente(req.headers['x-forwarded-for'], req.socket.remoteAddress);

const PARECE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Política de conteúdo do HTML: só scripts do próprio site (sem eval nem inline), imagens e áudio locais ou
 * gerados em memória (blob/data), e WebSocket só para o próprio host (`ws`/`wss` escritos, porque `'self'`
 * nem sempre vale para esquemas ws em todo navegador). Estilo inline fica: o HUD usa `style`.
 */
export function politicaDeConteudo(host: string | undefined): string {
  const proprio = host !== undefined && PARECE_HOST.test(host) ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self'${proprio}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function recusarUpgrade(socket: Duplex, status: number, texto: string): void {
  socket.write(`HTTP/1.1 ${status} ${texto}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

const textoSimples = (res: ServerResponse, status: number, corpo: string, extra: Record<string, string> = {}): void => {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURANCA, ...extra });
  res.end(corpo);
};

export async function iniciarServidor(config: ConfigSala, opcoes: OpcoesDoServidor = {}): Promise<Servidor> {
  const log = opcoes.log ?? logSilencioso;
  const relogio = opcoes.relogio ?? Date.now;
  // A pasta de dados tem um dono só (trava): quem sobe sobre um servidor que está saindo espera a trava soltar; se não solta, a
  // chamada rejeita com o motivo e nada foi aberto.
  const carteiras =
    opcoes.carteiras ??
    (await ArmazemDeCarteiras.abrir(
      { pasta: config.pastaDados, maxCarteiras: config.maxCarteiras, atrasoMs: config.carteira.atrasoGravacaoMs, relogio, log },
      { esperaMs: config.carteira.esperaTravaMs },
    ));
  const registro = new Registro({ config, log, relogio, carteiras, ...opcoes.registro });
  const novasConexoes = new BaldesPorChave(config.conexoesNovasPorIp.capacidade, config.conexoesNovasPorIp.porSegundo, relogio);
  /** Origin aceitos: a lista da config mais o próprio servidor (a página que ele serve), depois que a porta é conhecida. */
  let origensAceitas: readonly string[] = config.origensPermitidas;
  const carteira = criarHttpDaCarteira({ config, carteiras, relogio, origensAceitas: () => origensAceitas, ipDe });
  const gzipEmCache = new Map<string, { mtimeMs: number; dado: Buffer }>();

  // ---------------------------------------------------------------- HTTP estático
  const http = createServer((req, res) => {
    tratarHttp(req, res).catch(() => {
      if (!res.headersSent) textoSimples(res, 500, 'Erro interno.');
      else res.destroy();
    });
  });

  async function tratarHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const alvo = req.url ?? '/';
    const caminho = alvo.split(/[?#]/, 1)[0] ?? '/';
    if (await carteira.tratar(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') return textoSimples(res, 405, 'Método não permitido.', { Allow: 'GET, HEAD' });
    if (caminho === '/saude') return textoSimples(res, 200, 'ok', { 'Cache-Control': 'no-store' });
    if (caminho === '/sala') return textoSimples(res, 426, 'Use WebSocket em /sala.', { Upgrade: 'websocket' });

    const r = await resolverEstatico(config.pastaWeb, alvo);
    switch (r.tipo) {
      case 'proibido':
        return textoSimples(res, 403, 'Proibido.');
      case 'nao-encontrado':
        return textoSimples(res, 404, 'Não encontrado.');
      case 'indisponivel':
        return textoSimples(res, 503, 'O build do cliente não foi encontrado. Rode `pnpm build` (ou `pnpm online`).');
    }

    const etag = `W/"${r.tamanho.toString(16)}-${Math.floor(r.mtimeMs).toString(16)}"`;
    const cabecalhos: Record<string, string | number> = { 'Content-Type': r.contentType, 'Cache-Control': r.cache, ETag: etag, ...SEGURANCA };
    if (r.contentType.startsWith('text/html')) cabecalhos['Content-Security-Policy'] = politicaDeConteudo(req.headers.host);
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, cabecalhos);
      return void res.end();
    }

    const aceitaGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (aceitaGzip && COMPRESSIVEL.test(r.contentType) && r.tamanho >= MIN_GZIP) {
      const guardado = gzipEmCache.get(r.caminho);
      let dado = guardado && guardado.mtimeMs === r.mtimeMs ? guardado.dado : undefined;
      if (!dado) {
        const partes: Buffer[] = [];
        for await (const parte of createReadStream(r.caminho)) partes.push(parte as Buffer);
        dado = gzipSync(Buffer.concat(partes));
        if (gzipEmCache.size >= MAX_ENTRADAS_GZIP) gzipEmCache.clear();
        gzipEmCache.set(r.caminho, { mtimeMs: r.mtimeMs, dado });
      }
      res.writeHead(200, { ...cabecalhos, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': dado.length });
      return void res.end(req.method === 'HEAD' ? undefined : dado);
    }

    res.writeHead(200, { ...cabecalhos, 'Content-Length': r.tamanho });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(r.caminho)
      .on('error', () => res.destroy())
      .pipe(res);
  }

  // ---------------------------------------------------------------- WebSocket
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.bytesPorMensagem,
    // Sem permessage-deflate: entrada comprimida deixaria 512 KB caros de interpretar custarem meio KB no fio,
    // e a saída já é compacta (gravação ~12 KB), então comprimir não rende e custa memória por conexão.
    perMessageDeflate: false,
  });
  const vivos = new Map<WebSocket, { vivo: boolean; rastro: RastroDaConexao }>();
  const porIp = new Map<string, number>();

  http.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').split(/[?#]/, 1)[0] !== '/sala') return recusarUpgrade(socket, 404, 'Not Found');
    if (!origemPermitida(req.headers.origin, origensAceitas)) return recusarUpgrade(socket, 403, 'Forbidden');
    if (vivos.size >= config.maxConexoes) return recusarUpgrade(socket, 503, 'Service Unavailable');
    const ip = ipDe(req);
    if ((porIp.get(ip) ?? 0) >= config.maxConexoesPorIp) return recusarUpgrade(socket, 429, 'Too Many Requests');
    if (!novasConexoes.tentar(ip)) return recusarUpgrade(socket, 429, 'Too Many Requests');
    wss.handleUpgrade(req, socket, head, (ws) => aceitar(ws, ip));
  });

  function aceitar(ws: WebSocket, ip: string): void {
    const estado = { vivo: true, rastro: new RastroDaConexao(relogio) };
    vivos.set(ws, estado);
    porIp.set(ip, (porIp.get(ip) ?? 0) + 1);
    const balde = new BaldeDeTokens(config.mensagens.capacidade, config.mensagens.porSegundo, relogio);
    const tolerancia = new BaldeDeTokens(config.tolerancia.capacidade, config.tolerancia.porSegundo, relogio);

    /** Conta uma infração de `peso` fichas; esgotada a tolerância, derruba a conexão. */
    const punir = (peso: number): boolean => {
      if (tolerancia.tentar(peso)) return true;
      estado.rastro.encerrando('tolerancia', ws.bufferedAmount);
      ws.close(1008, 'Mensagens demais ou recusadas demais.');
      return false;
    };

    const conn: Conexao = {
      id: 'ws',
      ip,
      punir(peso) {
        punir(peso);
      },
      enviar(mensagem) {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFER_ENVIO) {
          estado.rastro.encerrando('envio-lento', ws.bufferedAmount);
          return ws.terminate();
        }
        const dado = codificarUmaVez(mensagem);
        ws.send(dado, { binary: typeof dado !== 'string' });
      },
      fechar(codigo, motivo) {
        ws.close(codigo, motivo);
      },
    };

    ws.on('pong', () => {
      estado.vivo = true;
      estado.rastro.sinal();
    });
    ws.on('message', (dado: RawData, binario: boolean) => {
      estado.vivo = true;
      estado.rastro.sinal();
      const bruto = dado as Buffer;
      // Mensagem grande gasta mais do balde. Os tetos por tipo de quadro e a ordem das conferências ficam no decodificador:
      // tamanho antes de qualquer parse, e a gravação (a parte cara) só depois de sala, vez e seq.
      if (!balde.tentar(1 + Math.floor(bruto.length / config.bytesPorFicha))) {
        if (punir(1)) conn.enviar({ tipo: 'erro', codigo: 'limite-mensagens', mensagem: TEXTO_DO_ERRO['limite-mensagens'] });
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
        punir(PESO_DA_RECUSA[r.codigo] ?? 1);
        return;
      }
      try {
        registro.receber(conn, r.valor);
      } catch (e) {
        log('erro-interno', { tipo: r.valor.tipo, erro: e instanceof Error ? e.message : 'desconhecido' });
      }
    });
    ws.on('error', () => {});
    ws.on('close', (codigo: number, motivo: Buffer) => {
      vivos.delete(ws);
      const n = (porIp.get(ip) ?? 1) - 1;
      if (n <= 0) porIp.delete(ip);
      else porIp.set(ip, n);
      registro.desconectar(conn, estado.rastro.saida(codigo, motivo, ws.bufferedAmount));
    });
  }

  const batimento = setInterval(() => {
    for (const [ws, estado] of vivos) {
      if (!estado.vivo) {
        estado.rastro.encerrando('heartbeat', ws.bufferedAmount);
        ws.terminate();
        continue;
      }
      estado.rastro.amostrar(ws.bufferedAmount);
      estado.vivo = false;
      ws.ping();
    }
  }, config.heartbeatMs);
  const passar = setInterval(() => {
    try {
      registro.tick();
      novasConexoes.limpar();
      carteira.limpar();
    } catch (e) {
      log('erro-interno', { tipo: 'tick', erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }, config.tickMs);

  try {
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(config.porta, config.host, () => {
        http.off('error', reject);
        resolve();
      });
    });
  } catch (e) {
    // sem porta o servidor não sobe: nada pode ficar segurando a pasta de dados
    clearInterval(batimento);
    clearInterval(passar);
    wss.close();
    await carteiras.fechar();
    throw e;
  }
  const { port, address } = http.address() as AddressInfo;
  origensAceitas = [...config.origensPermitidas, `http://localhost:${port}`, `http://127.0.0.1:${port}`];
  log('servidor-ouvindo', { porta: port });

  return {
    porta: port,
    endereco: address,
    registro,
    carteiras,
    async fechar() {
      clearInterval(batimento);
      clearInterval(passar);
      for (const ws of vivos.keys()) ws.terminate();
      wss.close();
      // As carteiras primeiro, com a porta ainda presa: o arquivo chega ao disco e a trava solta ANTES de a porta ficar livre,
      // que é o sinal para o reiniciar-sala.sh subir o servidor novo. Daqui em diante o armazém recusa qualquer mudança.
      await carteiras.fechar();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
