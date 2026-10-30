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
import { abrirBancoLocal } from './banco-local';
import { SEGURANCA, politicaDeConteudo } from './cabecalhos';
import { criarHttpDaCarteira } from './carteira-http';
import { carteiraNoNode, escreverResposta, pedidoDoNode } from './carteira-http-node';
import { ArmazemDeCarteiras } from './carteiras';
import type { ConfigSala } from './config';
import { ehCaminhoDaConta, tratarContaDaSinuca, type BancoDaConta } from './conta-na-sinuca';
import { resolverEstatico } from './estatico';
import { ipDoCliente } from './ip';
import { LigacaoDaSala } from './ligacao';
import { BaldesPorChave } from './limite-taxa';
import { origemPermitida } from './origem';
import { logSilencioso, type Logger } from './log';
import { Registro, type DependenciasRegistro } from './registro';
import { tokenDaSessao } from './sessao-da-conta';
import { VarreduraDeExcluidas } from './varredura-de-excluidas';

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
const ipDe = (req: IncomingMessage): string => ipDoCliente(req.headers['x-forwarded-for'], req.socket.remoteAddress);
/** O endereço como o Banco o quer (ele calcula a chave do balde): o último do `X-Forwarded-For` (o do proxy) ou o do socket. */
const ipBrutoDe = (req: IncomingMessage): string => {
  const xff = req.headers['x-forwarded-for'];
  const ultimo = (typeof xff === 'string' ? xff : (xff ?? []).join(',')).split(',').map((i) => i.trim()).filter((i) => i !== '').at(-1);
  return ultimo ?? req.socket.remoteAddress ?? '';
};

export { politicaDeConteudo };

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
  // L57: com SALDO_NO_BANCO=1 o Banco da sala Node é o núcleo do apps/conta sobre node:sqlite, em PASTA_DADOS/banco.sqlite (o SQLite trava
  // o arquivo por conta própria; a caixa de saída que o alimenta mora no carteiras.json, que tem a trava da pasta).
  const bancoLocal = opcoes.carteiras === undefined && config.saldoNoBanco ? abrirBancoLocal(config.pastaDados, relogio) : null;
  let carteiras: ArmazemDeCarteiras;
  try {
    carteiras =
      opcoes.carteiras ??
      (await ArmazemDeCarteiras.abrir(
        { pasta: config.pastaDados, maxCarteiras: config.maxCarteiras, atrasoMs: config.carteira.atrasoGravacaoMs, relogio, log, presenteDeTeste: config.presenteDeTeste, banco: bancoLocal?.banco ?? null },
        { esperaMs: config.carteira.esperaTravaMs },
      ));
  } catch (e) {
    bancoLocal?.fechar();
    throw e;
  }
  const novasConexoes = new BaldesPorChave(config.conexoesNovasPorIp.capacidade, config.conexoesNovasPorIp.porSegundo, relogio);
  /** Origin aceitos: a lista da config mais o próprio servidor (a página que ele serve), depois que a porta é conhecida. */
  let origensAceitas: readonly string[] = config.origensPermitidas;
  // L61: as contas da Beco Games (só com o Banco local, `SALDO_NO_BANCO=1`): `/conta/*`, a sessão do cookie e a varredura das excluídas
  const origensDeDevDaConta: string[] = config.origensPermitidas.map((o) => o.toLowerCase());
  const conta: BancoDaConta | null = bancoLocal === null ? null : bancoLocal.abrirConta({ pepper: config.pepperDaSenha, origensDeDev: origensDeDevDaConta, log });
  // L61b: com o Banco local a sessão de quem tem conta é relida (no máximo a cada 10 min por conexão) antes de criar, entrar ou começar partida com aposta
  const registro = new Registro({ config, log, relogio, carteiras, ...(conta === null ? {} : { contaDaSessao: (token: string) => conta.contaDaSessao(token) }), ...opcoes.registro });
  /** O `id` da conta do cookie do pedido (o Banco local diz) e o token que o provou, ou `undefined`: sem cookie, ou sessão que ele não reconhece, vale o código. */
  const contaDaSessaoDoPedido = async (req: IncomingMessage): Promise<{ readonly id: string; readonly token: string } | undefined> => {
    const token = tokenDaSessao(req.headers.cookie);
    if (token === null || conta === null) return undefined;
    const c = await conta.contaDaSessao(token);
    return c === null ? undefined : { id: c.id, token };
  };
  const idDaSessao = async (req: IncomingMessage): Promise<string | undefined> => (await contaDaSessaoDoPedido(req))?.id;
  const carteira = carteiraNoNode(criarHttpDaCarteira({ config, carteiras, relogio, origensAceitas: () => origensAceitas }), ipDe, idDaSessao);
  const varredura =
    conta === null
      ? null
      : new VarreduraDeExcluidas({ banco: conta, apagar: (ids, ate) => carteiras.apagarDasContas(ids, ate), relogio, log, lerAte: () => carteiras.varridasAte });
  void varredura?.varrer(true);
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
    if (ehCaminhoDaConta(caminho)) {
      if (conta === null) return textoSimples(res, 404, 'Não encontrado.');
      const pedido = pedidoDoNode(req, ipDe(req));
      const r = await tratarContaDaSinuca({
        pedido,
        ipParaOBanco: ipBrutoDe(req),
        banco: conta,
        efeitos: {
          marcarDaConta: (id) => carteiras.marcarDaConta(id),
          apagarDaConta: (id) => carteiras.apagarDasContas([id]),
          esquecerConta: (id, sessao) => registro.esquecerConta(id, sessao),
          adiarMarca: (id) => carteiras.adiarMarca(id),
        },
        tempoDoCorpoMs: config.carteira.tempoDoCorpoMs,
        log,
      });
      if (r !== 'abortada') escreverResposta(res, r);
      return;
    }
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
  const vivos = new Map<WebSocket, { vivo: boolean; ligacao: LigacaoDaSala }>();
  const porIp = new Map<string, number>();

  http.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').split(/[?#]/, 1)[0] !== '/sala') return recusarUpgrade(socket, 404, 'Not Found');
    if (!origemPermitida(req.headers.origin, origensAceitas)) return recusarUpgrade(socket, 403, 'Forbidden');
    if (vivos.size >= config.maxConexoes) return recusarUpgrade(socket, 503, 'Service Unavailable');
    const ip = ipDe(req);
    if ((porIp.get(ip) ?? 0) >= config.maxConexoesPorIp) return recusarUpgrade(socket, 429, 'Too Many Requests');
    if (!novasConexoes.tentar(ip)) return recusarUpgrade(socket, 429, 'Too Many Requests');
    // L61: a sessão da conta manda; a conta é perguntada ao Banco local antes de aceitar. Quem tem cookie e o Banco não responde, não entra.
    const aceitarComConta = (c: { readonly id: string; readonly token: string } | undefined): void => {
      if (socket.destroyed) return;
      wss.handleUpgrade(req, socket, head, (ws) => aceitar(ws, ip, c));
    };
    if (conta === null || tokenDaSessao(req.headers.cookie) === null) return aceitarComConta(undefined);
    contaDaSessaoDoPedido(req).then(aceitarComConta, () => recusarUpgrade(socket, 503, 'Service Unavailable'));
  });

  function aceitar(ws: WebSocket, ip: string, daConta?: { readonly id: string; readonly token: string }): void {
    const ligacao = new LigacaoDaSala({
      config,
      registro,
      relogio,
      log,
      ip,
      ...(daConta === undefined ? {} : { idDaConta: daConta.id, sessao: daConta.token }),
      soquete: {
        aberto: () => ws.readyState === WebSocket.OPEN,
        enviar: (dado) => ws.send(dado, { binary: typeof dado !== 'string' }),
        fechar: (codigo, motivo) => ws.close(codigo, motivo),
        derrubar: () => ws.terminate(),
        presos: () => ws.bufferedAmount,
      },
    });
    const estado = { vivo: true, ligacao };
    vivos.set(ws, estado);
    porIp.set(ip, (porIp.get(ip) ?? 0) + 1);

    ws.on('pong', () => {
      estado.vivo = true;
      ligacao.rastro.sinal();
    });
    ws.on('message', (dado: RawData, binario: boolean) => {
      estado.vivo = true;
      ligacao.aoReceber(dado as Buffer, binario);
    });
    ws.on('error', () => {});
    ws.on('close', (codigo: number, motivo: Buffer) => {
      vivos.delete(ws);
      const n = (porIp.get(ip) ?? 1) - 1;
      if (n <= 0) porIp.delete(ip);
      else porIp.set(ip, n);
      ligacao.aoFechar(codigo, motivo);
    });
  }

  const batimento = setInterval(() => {
    for (const [ws, estado] of vivos) {
      if (!estado.vivo) {
        estado.ligacao.rastro.encerrando('heartbeat', ws.bufferedAmount);
        ws.terminate();
        continue;
      }
      estado.ligacao.rastro.amostrar(ws.bufferedAmount);
      estado.vivo = false;
      ws.ping();
    }
  }, config.heartbeatMs);
  const passar = setInterval(() => {
    try {
      registro.tick();
      novasConexoes.limpar();
      carteira.limpar();
      void varredura?.varrer();
      carteiras.tentarMarcasPendentes(); // L61b: a marca `daConta` que falhou é tentada de novo
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
    bancoLocal?.fechar();
    throw e;
  }
  const { port, address } = http.address() as AddressInfo;
  origensAceitas = [...config.origensPermitidas, `http://localhost:${port}`, `http://127.0.0.1:${port}`];
  origensDeDevDaConta.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
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
      // L57: as salas morrem com o servidor, então as apostas em curso soltam a reserva no Banco (a operação fica no arquivo e sai quando ele voltar)
      registro.devolverApostas();
      await carteiras.fechar();
      bancoLocal?.fechar();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
