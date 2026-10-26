/**
 * O HTTP da carteira (L22), no mesmo servidor da sala: o menu abre a loja sem estar numa sala.
 *
 *   POST /carteira            sem código → cria; devolve { codigo, saldo, skins, skin } (o código sai daqui uma vez só)
 *   GET  /carteira            Authorization: Bearer <codigo> → { saldo, skins, skin }
 *   POST /carteira/comprar    { skin } → só com saldo para o preço inteiro
 *   POST /carteira/usar       { skin } → só skin que a carteira tem
 *
 * Tudo é JSON, o corpo tem até 1 KB e cada erro é `{ erro, mensagem }` com um código do protocolo. Defesas, na ordem em que
 * agem: método e rota; Origin (a mesma lista do WebSocket); limite geral por IP; forma do código; tipo e tamanho do corpo;
 * existência da carteira (código errado gasta o balde de falhas do IP, que esgotado vira `limite`); limite por carteira (só
 * as que existem têm balde, então chutar códigos não enche a memória); e só então o corpo é lido, com prazo.
 *
 * Nunca há CORS: a página fala com o próprio servidor (ou pelo proxy do Vite), e outro site não lê nada daqui. O código e
 * o IP nunca vão a log.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  LIMITES_PROTOCOLO,
  TAMANHO_CODIGO_CARTEIRA,
  validarPedidoDeSkin,
  type CodigoErroCarteira,
  type ErroDaCarteira,
} from '@sinuca/protocolo';
import { SEGURANCA } from './cabecalhos';
import type { ArmazemDeCarteiras } from './carteiras';
import type { ConfigSala } from './config';
import { BaldesPorChave } from './limite-taxa';
import { origemPermitida } from './origem';

export interface DependenciasDaCarteira {
  readonly config: ConfigSala;
  readonly carteiras: ArmazemDeCarteiras;
  readonly relogio: () => number;
  /** Os Origin aceitos agora (a lista da config mais o próprio servidor, que só se sabe depois de abrir a porta). */
  readonly origensAceitas: () => readonly string[];
  readonly ipDe: (req: IncomingMessage) => string;
}

export interface HttpDaCarteira {
  /** `true` se a requisição era da carteira (e foi respondida); `false` deixa o caminho para o resto do servidor. */
  tratar(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** Esquece os baldes que já recarregaram; o servidor chama a cada tick. */
  limpar(): void;
}

const STATUS_DO_ERRO: Readonly<Record<CodigoErroCarteira, number>> = {
  'carteira-invalida': 401,
  'saldo-insuficiente': 402,
  'skin-invalida': 400,
  'ja-tem': 409,
  'nao-tem': 409,
  limite: 429,
  'requisicao-invalida': 400,
};

const TEXTO_DO_ERRO: Readonly<Record<CodigoErroCarteira, string>> = {
  'carteira-invalida': 'Carteira não encontrada. Confira o código.',
  'saldo-insuficiente': 'Saldo insuficiente para essa skin.',
  'skin-invalida': 'Essa skin não existe.',
  'ja-tem': 'Você já tem essa skin.',
  'nao-tem': 'Você ainda não tem essa skin.',
  limite: 'Calma: pedidos demais. Tente de novo daqui a pouco.',
  'requisicao-invalida': 'Pedido inválido.',
};

const MENSAGEM_ENCERRANDO = 'O servidor está reiniciando. Tente de novo daqui a pouco.';

const ROTAS: Readonly<Record<string, readonly string[]>> = {
  '/carteira': ['GET', 'POST'],
  '/carteira/comprar': ['POST'],
  '/carteira/usar': ['POST'],
};

const BEARER = new RegExp(`^Bearer ([A-Za-z0-9_-]{${TAMANHO_CODIGO_CARTEIRA}})$`, 'i');
const JSON_PURO = /^application\/json\s*(;.*)?$/i;

type Leitura = { readonly tipo: 'texto'; readonly texto: string } | { readonly tipo: 'grande' | 'lento' | 'abortado' | 'ilegivel' };

/** Lê o corpo até `limite` bytes e `tempoMs`; passou de um dos dois, desiste sem ler o resto. */
function lerCorpo(req: IncomingMessage, limite: number, tempoMs: number): Promise<Leitura> {
  return new Promise((resolve) => {
    const partes: Buffer[] = [];
    let total = 0;
    let pronto = false;
    const terminar = (r: Leitura): void => {
      if (pronto) return;
      pronto = true;
      clearTimeout(prazo);
      req.off('data', aoChegar);
      req.off('end', aoFim);
      req.off('error', aoErro);
      req.off('close', aoErro);
      resolve(r);
    };
    const aoChegar = (parte: Buffer): void => {
      total += parte.length;
      if (total > limite) return terminar({ tipo: 'grande' });
      partes.push(parte);
    };
    const aoFim = (): void => {
      try {
        terminar({ tipo: 'texto', texto: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes)) });
      } catch {
        terminar({ tipo: 'ilegivel' });
      }
    };
    const aoErro = (): void => terminar({ tipo: 'abortado' });
    const prazo = setTimeout(() => terminar({ tipo: 'lento' }), tempoMs);
    req.on('data', aoChegar);
    req.once('end', aoFim);
    req.once('error', aoErro);
    req.once('close', aoErro);
  });
}

export function criarHttpDaCarteira(deps: DependenciasDaCarteira): HttpDaCarteira {
  const { config, carteiras, relogio } = deps;
  const c = config.carteira;
  const criarPorIp = new BaldesPorChave(c.criarPorIp.capacidade, c.criarPorIp.porSegundo, relogio);
  const requisicoesPorIp = new BaldesPorChave(c.requisicoesPorIp.capacidade, c.requisicoesPorIp.porSegundo, relogio);
  const falhasPorIp = new BaldesPorChave(c.falhasPorIp.capacidade, c.falhasPorIp.porSegundo, relogio);
  const porCarteira = new BaldesPorChave(c.operacoesPorCarteira.capacidade, c.operacoesPorCarteira.porSegundo, relogio);

  function responder(res: ServerResponse, status: number, corpo: object, extra: Record<string, string | number> = {}): void {
    const dado = JSON.stringify(corpo);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SEGURANCA,
      'Content-Length': Buffer.byteLength(dado),
      ...extra,
    });
    res.end(dado);
  }

  /** Erro com o corpo `{ erro, mensagem }`; `status` troca o padrão do código (403, 404, 405, 408, 413, 415, 503). */
  function recusar(req: IncomingMessage, res: ServerResponse, erro: CodigoErroCarteira, opcoes: { status?: number; mensagem?: string; extra?: Record<string, string | number> } = {}): void {
    const corpo: ErroDaCarteira = { erro, mensagem: opcoes.mensagem ?? TEXTO_DO_ERRO[erro] };
    const extra: Record<string, string | number> = { ...opcoes.extra };
    // Pode haver corpo ainda por ler: fecha a conexão depois da resposta e descarta o que vier, sem lê-lo.
    if (!req.complete) {
      extra.Connection = 'close';
      req.resume();
    }
    responder(res, opcoes.status ?? STATUS_DO_ERRO[erro], corpo, extra);
  }

  const limite = (req: IncomingMessage, res: ServerResponse, esperaS = 60): void =>
    recusar(req, res, 'limite', { extra: { 'Retry-After': esperaS } });

  async function tratar(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const caminho = (req.url ?? '/').split(/[?#]/, 1)[0] ?? '/';
    if (caminho !== '/carteira' && !caminho.startsWith('/carteira/')) return false;

    const metodos = Object.hasOwn(ROTAS, caminho) ? ROTAS[caminho] : undefined;
    if (!metodos) {
      recusar(req, res, 'requisicao-invalida', { status: 404, mensagem: 'Rota desconhecida.' });
      return true;
    }
    const metodo = req.method ?? 'GET';
    if (!metodos.includes(metodo)) {
      recusar(req, res, 'requisicao-invalida', { status: 405, mensagem: 'Método não permitido.', extra: { Allow: metodos.join(', ') } });
      return true;
    }
    if (!origemPermitida(req.headers.origin, deps.origensAceitas())) {
      recusar(req, res, 'requisicao-invalida', { status: 403, mensagem: 'Origem não permitida.' });
      return true;
    }
    const ip = deps.ipDe(req);
    if (!requisicoesPorIp.tentar(ip)) {
      limite(req, res);
      return true;
    }

    const criando = metodo === 'POST' && caminho === '/carteira';
    const lendo = metodo === 'GET';
    const declarado = req.headers['content-length'];
    const temCorpo = req.headers['transfer-encoding'] !== undefined || (declarado !== undefined && declarado !== '0');

    // quem é: tudo menos criar exige o código certo no cabeçalho
    let id: string | undefined;
    if (criando) {
      if (req.headers.authorization !== undefined) {
        recusar(req, res, 'requisicao-invalida', { mensagem: 'Criar uma carteira não leva código.' });
        return true;
      }
    } else {
      const codigo = BEARER.exec(req.headers.authorization ?? '')?.[1];
      id = codigo === undefined ? undefined : carteiras.resolver(codigo);
      if (id === undefined) {
        // sem código, mal formado ou inexistente: a mesma resposta, e cada um gasta o balde de falhas do IP
        if (falhasPorIp.tentar(ip)) recusar(req, res, 'carteira-invalida');
        else limite(req, res, 600);
        return true;
      }
    }

    if (lendo && temCorpo) {
      recusar(req, res, 'requisicao-invalida', { mensagem: 'Esta rota não leva corpo.' });
      return true;
    }
    // comprar e usar precisam do corpo; criar aceita sem ele, mas se vier tem de ser JSON
    if (!lendo && (temCorpo || !criando)) {
      if (!JSON_PURO.test(req.headers['content-type'] ?? '')) {
        recusar(req, res, 'requisicao-invalida', { status: 415, mensagem: 'O corpo precisa ser application/json.' });
        return true;
      }
      if (declarado !== undefined && Number(declarado) > LIMITES_PROTOCOLO.bytesCorpoDaCarteira) {
        recusar(req, res, 'requisicao-invalida', { status: 413, mensagem: 'Corpo grande demais.' });
        return true;
      }
    }

    if (id !== undefined && !porCarteira.tentar(id)) {
      limite(req, res);
      return true;
    }

    // o corpo (criar aceita sem ele; comprar e usar precisam)
    let texto = '';
    if (!lendo && temCorpo) {
      const leitura = await lerCorpo(req, LIMITES_PROTOCOLO.bytesCorpoDaCarteira, c.tempoDoCorpoMs);
      switch (leitura.tipo) {
        case 'abortado':
          return true;
        case 'grande':
          recusar(req, res, 'requisicao-invalida', { status: 413, mensagem: 'Corpo grande demais.' });
          return true;
        case 'lento':
          recusar(req, res, 'requisicao-invalida', { status: 408, mensagem: 'O corpo demorou demais.' });
          return true;
        case 'ilegivel':
          recusar(req, res, 'requisicao-invalida', { mensagem: 'O corpo não é UTF-8.' });
          return true;
        case 'texto':
          texto = leitura.texto;
      }
    }

    if (criando) {
      if (temCorpo && !corpoVazio(texto)) {
        recusar(req, res, 'requisicao-invalida', { mensagem: 'Criar uma carteira não leva corpo.' });
        return true;
      }
      if (!criarPorIp.tentar(ip)) {
        limite(req, res, 3600);
        return true;
      }
      const nova = carteiras.criar();
      if (!nova) {
        recusar(req, res, 'limite', { status: 503, mensagem: carteiras.encerrado ? MENSAGEM_ENCERRANDO : 'Não cabem mais carteiras agora. Tente mais tarde.' });
        return true;
      }
      responder(res, 201, { codigo: nova.codigo, ...carteiras.ler(nova.id)! });
      return true;
    }

    if (lendo) {
      responder(res, 200, carteiras.ler(id!)!);
      return true;
    }

    let pedido: unknown;
    try {
      pedido = JSON.parse(texto);
    } catch {
      recusar(req, res, 'requisicao-invalida', { mensagem: 'O corpo não é JSON.' });
      return true;
    }
    const valido = validarPedidoDeSkin(pedido);
    if (!valido.ok) {
      recusar(req, res, 'requisicao-invalida', { mensagem: 'O corpo precisa ser { "skin": "..." }.' });
      return true;
    }
    // compra e troca são síncronas dentro do armazém: nada entre conferir o saldo e descontá-lo
    const r = caminho === '/carteira/comprar' ? carteiras.comprar(id!, valido.valor.skin) : carteiras.usar(id!, valido.valor.skin);
    if (r.ok) responder(res, 200, r.estado);
    else if (r.erro === 'encerrado') recusar(req, res, 'limite', { status: 503, mensagem: MENSAGEM_ENCERRANDO });
    else recusar(req, res, r.erro);
    return true;
  }

  return {
    tratar,
    limpar() {
      criarPorIp.limpar();
      requisicoesPorIp.limpar();
      falhasPorIp.limpar();
      porCarteira.limpar();
    },
  };
}

/** Corpo ausente ou `{}`: o único corpo que criar uma carteira aceita. */
function corpoVazio(texto: string): boolean {
  if (texto.trim() === '') return true;
  try {
    const v: unknown = JSON.parse(texto);
    return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0;
  } catch {
    return false;
  }
}
