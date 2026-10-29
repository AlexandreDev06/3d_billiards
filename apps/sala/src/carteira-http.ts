/**
 * O HTTP da carteira (L22), no mesmo servidor da sala: o menu abre a loja sem estar numa sala.
 *
 *   POST /carteira            sem código → cria; devolve { codigo, saldo, skins, skin } (o código sai daqui uma vez só)
 *   GET  /carteira            Authorization: Bearer <codigo> → { saldo, skins, skin }
 *   POST /carteira/comprar    { skin } → só com saldo para o preço inteiro
 *   POST /carteira/usar       { skin } → só skin que a carteira tem
 *   POST /carteira/balao/comprar   { item, preco? } → um item do balão (L47), pelo preço do catálogo
 *   POST /carteira/balao/equipar   { aparencia } → a aparência inteira do balão, só com o que a carteira tem
 *
 * Versões (L47): o cliente da versão 10 manda `X-Sinuca-Protocolo: 10` e recebe o `balao` no estado; o da 9 não manda nada e recebe
 * a carteira exatamente como antes (o esquema dele é estrito e recusaria a chave nova). As duas rotas do balão só a 10 conhece, e
 * respondem sempre o estado completo.
 *
 * Tudo é JSON, o corpo tem até 1 KB e cada erro é `{ erro, mensagem }` com um código do protocolo. Defesas, na ordem em que
 * agem: método e rota; Origin (a mesma lista do WebSocket); limite geral por IP; forma do código; tipo e tamanho do corpo;
 * existência da carteira (código errado gasta o balde de falhas do IP, que esgotado vira `limite`); limite por carteira (só
 * as que existem têm balde, então chutar códigos não enche a memória); e só então o corpo é lido, com prazo.
 *
 * Nunca há CORS: a página fala com o próprio servidor (ou pelo proxy do Vite), e outro site não lê nada daqui. O código e
 * o IP nunca vão a log.
 */
import {
  CABECALHO_DO_PROTOCOLO,
  LIMITES_PROTOCOLO,
  TAMANHO_CODIGO_CARTEIRA,
  VERSAO_DO_BALAO,
  estadoDaCarteiraParaVersao,
  validarPedidoDeAparencia,
  validarPedidoDeItemDoBalao,
  validarPedidoDeSkin,
  versaoDoCabecalho,
  type CodigoErroCarteira,
  type ErroDaCarteira,
} from '@sinuca/protocolo';
import { SEGURANCA } from './cabecalhos';
import type { CarteirasBase, ResultadoDeLoja } from './carteiras-base';
import type { ConfigDoNucleo } from './config-nucleo';
import { BaldesPorChave } from './limite-taxa';
import { origemPermitida } from './origem';

/** O que o corpo de um pedido deu: o texto, ou por que não deu (maior que o limite, mais lento que o prazo, cancelado, não é UTF-8). */
export type LeituraDoCorpo = { readonly tipo: 'texto'; readonly texto: string } | { readonly tipo: 'grande' | 'lento' | 'abortado' | 'ilegivel' };

/**
 * Um pedido à carteira sem nada de `node:http` nem de `Request`: a sala Node e o Worker da Cloudflare entregam o seu já traduzido.
 * Os cabeçalhos têm o nome em minúsculas; `lerCorpo` obedece ao limite e ao prazo e nunca lê mais do que o limite.
 */
export interface PedidoDaCarteira {
  readonly metodo: string;
  /** O caminho, sem consulta (`?`) nem fragmento. */
  readonly caminho: string;
  /** A CHAVE do balde do IP (`ipDoCliente`); nunca vai a log. */
  readonly ip: string;
  cabecalho(nome: string): string | undefined;
  lerCorpo(limite: number, tempoMs: number): Promise<LeituraDoCorpo>;
  /** O corpo ainda pode chegar (ninguém o leu): a resposta pede para fechar a conexão e o resto é descartado. Sem corpo ou já lido: `false`. */
  corpoPendente(): boolean;
  descartarCorpo(): void;
}

/** A resposta pronta: o JSON já em texto e os cabeçalhos completos (Content-Length incluído). */
export interface RespostaDaCarteira {
  readonly status: number;
  readonly cabecalhos: Readonly<Record<string, string | number>>;
  readonly corpo: string;
}

/** `nao-e-da-carteira`: a rota não é `/carteira*`, o resto do servidor cuida; `abortada`: quem pediu foi embora, não há a quem responder. */
export type ResultadoDaCarteira = RespostaDaCarteira | 'nao-e-da-carteira' | 'abortada';

export interface DependenciasDaCarteira {
  readonly config: ConfigDoNucleo;
  readonly carteiras: CarteirasBase;
  readonly relogio: () => number;
  /** Os Origin aceitos agora (a lista da config mais o próprio servidor, que só se sabe depois de abrir a porta). */
  readonly origensAceitas: () => readonly string[];
}

export interface HttpDaCarteira {
  tratar(pedido: PedidoDaCarteira): Promise<ResultadoDaCarteira>;
  /** Esquece os baldes que já recarregaram; o servidor chama a cada tick. */
  limpar(): void;
}

const STATUS_DO_ERRO: Readonly<Record<CodigoErroCarteira, number>> = {
  'carteira-invalida': 401,
  'saldo-insuficiente': 402,
  'skin-invalida': 400,
  'ja-tem': 409,
  'nao-tem': 409,
  'preco-mudou': 409,
  'item-invalido': 400,
  'aparencia-invalida': 400,
  limite: 429,
  'requisicao-invalida': 400,
};

const TEXTO_DO_ERRO: Readonly<Record<CodigoErroCarteira, string>> = {
  'carteira-invalida': 'Carteira não encontrada. Confira o código.',
  'saldo-insuficiente': 'Saldo insuficiente para essa skin.',
  'skin-invalida': 'Essa skin não existe.',
  'ja-tem': 'Você já tem essa skin.',
  'nao-tem': 'Você ainda não tem essa skin.',
  'preco-mudou': 'O preço dessa skin mudou. Confira o preço novo e tente de novo.',
  'item-invalido': 'Esse item do balão não existe.',
  'aparencia-invalida': 'Essa aparência do balão não vale.',
  limite: 'Calma: pedidos demais. Tente de novo daqui a pouco.',
  'requisicao-invalida': 'Pedido inválido.',
};

const MENSAGEM_ENCERRANDO = 'O servidor está reiniciando. Tente de novo daqui a pouco.';

const ROTAS: Readonly<Record<string, readonly string[]>> = {
  '/carteira': ['GET', 'POST'],
  '/carteira/comprar': ['POST'],
  '/carteira/usar': ['POST'],
  '/carteira/balao/comprar': ['POST'],
  '/carteira/balao/equipar': ['POST'],
};

const BEARER = new RegExp(`^Bearer ([A-Za-z0-9_-]{${TAMANHO_CODIGO_CARTEIRA}})$`, 'i');
const JSON_PURO = /^application\/json\s*(;.*)?$/i;

export function criarHttpDaCarteira(deps: DependenciasDaCarteira): HttpDaCarteira {
  const { config, carteiras, relogio } = deps;
  const c = config.carteira;
  const criarPorIp = new BaldesPorChave(c.criarPorIp.capacidade, c.criarPorIp.porSegundo, relogio);
  const requisicoesPorIp = new BaldesPorChave(c.requisicoesPorIp.capacidade, c.requisicoesPorIp.porSegundo, relogio);
  const falhasPorIp = new BaldesPorChave(c.falhasPorIp.capacidade, c.falhasPorIp.porSegundo, relogio);
  const porCarteira = new BaldesPorChave(c.operacoesPorCarteira.capacidade, c.operacoesPorCarteira.porSegundo, relogio);
  const codificador = new TextEncoder();

  function responder(status: number, corpo: object, extra: Record<string, string | number> = {}): RespostaDaCarteira {
    const dado = JSON.stringify(corpo);
    return {
      status,
      corpo: dado,
      cabecalhos: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...SEGURANCA,
        'Content-Length': codificador.encode(dado).length,
        ...extra,
      },
    };
  }

  /** Erro com o corpo `{ erro, mensagem }`; `status` troca o padrão do código (403, 404, 405, 408, 413, 415, 503). */
  function recusar(pedido: PedidoDaCarteira, erro: CodigoErroCarteira, opcoes: { status?: number; mensagem?: string; extra?: Record<string, string | number> } = {}): RespostaDaCarteira {
    const corpo: ErroDaCarteira = { erro, mensagem: opcoes.mensagem ?? TEXTO_DO_ERRO[erro] };
    const extra: Record<string, string | number> = { ...opcoes.extra };
    // Pode haver corpo ainda por ler: fecha a conexão depois da resposta e descarta o que vier, sem lê-lo.
    if (pedido.corpoPendente()) {
      extra.Connection = 'close';
      pedido.descartarCorpo();
    }
    return responder(opcoes.status ?? STATUS_DO_ERRO[erro], corpo, extra);
  }

  const limite = (pedido: PedidoDaCarteira, esperaS = 60): RespostaDaCarteira => recusar(pedido, 'limite', { extra: { 'Retry-After': esperaS } });

  async function tratar(pedido: PedidoDaCarteira): Promise<ResultadoDaCarteira> {
    const caminho = pedido.caminho;
    if (caminho !== '/carteira' && !caminho.startsWith('/carteira/')) return 'nao-e-da-carteira';

    const metodos = Object.hasOwn(ROTAS, caminho) ? ROTAS[caminho] : undefined;
    if (!metodos) return recusar(pedido, 'requisicao-invalida', { status: 404, mensagem: 'Rota desconhecida.' });
    const metodo = pedido.metodo;
    if (!metodos.includes(metodo)) return recusar(pedido, 'requisicao-invalida', { status: 405, mensagem: 'Método não permitido.', extra: { Allow: metodos.join(', ') } });
    if (!origemPermitida(pedido.cabecalho('origin'), deps.origensAceitas())) return recusar(pedido, 'requisicao-invalida', { status: 403, mensagem: 'Origem não permitida.' });
    const ip = pedido.ip;
    if (!requisicoesPorIp.tentar(ip)) return limite(pedido);
    const versao = versaoDoCabecalho(pedido.cabecalho(CABECALHO_DO_PROTOCOLO));

    const criando = metodo === 'POST' && caminho === '/carteira';
    const lendo = metodo === 'GET';
    const declarado = pedido.cabecalho('content-length');
    const temCorpo = pedido.cabecalho('transfer-encoding') !== undefined || (declarado !== undefined && declarado !== '0');
    const autorizacao = pedido.cabecalho('authorization');

    // quem é: tudo menos criar exige o código certo no cabeçalho
    let id: string | undefined;
    if (criando) {
      if (autorizacao !== undefined) return recusar(pedido, 'requisicao-invalida', { mensagem: 'Criar uma carteira não leva código.' });
    } else {
      const codigo = BEARER.exec(autorizacao ?? '')?.[1];
      id = codigo === undefined ? undefined : carteiras.resolver(codigo);
      if (id === undefined) {
        // sem código, mal formado ou inexistente: a mesma resposta, e cada um gasta o balde de falhas do IP
        return falhasPorIp.tentar(ip) ? recusar(pedido, 'carteira-invalida') : limite(pedido, 600);
      }
    }

    if (lendo && temCorpo) return recusar(pedido, 'requisicao-invalida', { mensagem: 'Esta rota não leva corpo.' });
    // comprar e usar precisam do corpo; criar aceita sem ele, mas se vier tem de ser JSON
    if (!lendo && (temCorpo || !criando)) {
      if (!JSON_PURO.test(pedido.cabecalho('content-type') ?? '')) return recusar(pedido, 'requisicao-invalida', { status: 415, mensagem: 'O corpo precisa ser application/json.' });
      if (declarado !== undefined && Number(declarado) > LIMITES_PROTOCOLO.bytesCorpoDaCarteira) return recusar(pedido, 'requisicao-invalida', { status: 413, mensagem: 'Corpo grande demais.' });
    }

    if (id !== undefined && !porCarteira.tentar(id)) return limite(pedido);

    // o corpo (criar aceita sem ele; comprar e usar precisam)
    let texto = '';
    if (!lendo && temCorpo) {
      const leitura = await pedido.lerCorpo(LIMITES_PROTOCOLO.bytesCorpoDaCarteira, c.tempoDoCorpoMs);
      switch (leitura.tipo) {
        case 'abortado':
          return 'abortada';
        case 'grande':
          return recusar(pedido, 'requisicao-invalida', { status: 413, mensagem: 'Corpo grande demais.' });
        case 'lento':
          return recusar(pedido, 'requisicao-invalida', { status: 408, mensagem: 'O corpo demorou demais.' });
        case 'ilegivel':
          return recusar(pedido, 'requisicao-invalida', { mensagem: 'O corpo não é UTF-8.' });
        case 'texto':
          texto = leitura.texto;
      }
    }

    if (criando) {
      if (temCorpo && !corpoVazio(texto)) return recusar(pedido, 'requisicao-invalida', { mensagem: 'Criar uma carteira não leva corpo.' });
      if (!criarPorIp.tentar(ip)) return limite(pedido, 3600);
      const nova = carteiras.criar();
      if (!nova) return recusar(pedido, 'limite', { status: 503, mensagem: carteiras.encerrado ? MENSAGEM_ENCERRANDO : 'Não cabem mais carteiras agora. Tente mais tarde.' });
      return responder(201, estadoDaCarteiraParaVersao({ codigo: nova.codigo, ...carteiras.ler(nova.id)! }, versao));
    }

    if (lendo) return responder(200, estadoDaCarteiraParaVersao(carteiras.ler(id!)!, versao));

    let corpo: unknown;
    try {
      corpo = JSON.parse(texto);
    } catch {
      return recusar(pedido, 'requisicao-invalida', { mensagem: 'O corpo não é JSON.' });
    }

    // balão (L47): compra e troca são síncronas dentro do armazém, como as das skins; só a versão 10 conhece estas rotas, então a resposta é o estado completo
    if (caminho === '/carteira/balao/comprar') {
      const valido = validarPedidoDeItemDoBalao(corpo);
      if (!valido.ok) return recusar(pedido, 'requisicao-invalida', { mensagem: 'O corpo precisa ser { "item": "...", "preco": 123 } (preco é opcional).' });
      return resposta(pedido, carteiras.comprarItemDoBalao(id!, valido.valor.item, undefined, valido.valor.preco), VERSAO_DO_BALAO);
    }
    if (caminho === '/carteira/balao/equipar') {
      const valido = validarPedidoDeAparencia(corpo);
      if (!valido.ok) return recusar(pedido, 'requisicao-invalida', { mensagem: 'O corpo precisa ser { "aparencia": { "chapeu", "bigode", "olhos", "corDosOlhos" } }.' });
      return resposta(pedido, carteiras.equiparAparencia(id!, valido.valor.aparencia), VERSAO_DO_BALAO);
    }

    const valido = validarPedidoDeSkin(corpo);
    if (!valido.ok) {
      return recusar(pedido, 'requisicao-invalida', { mensagem: 'O corpo precisa ser { "skin": "...", "preco": 123 } (preco é opcional e só vale na compra).' });
    }
    if (caminho === '/carteira/usar' && valido.valor.preco !== undefined) {
      return recusar(pedido, 'requisicao-invalida', { mensagem: 'Trocar de skin não leva preço: o corpo é só { "skin": "..." }.' });
    }
    // compra e troca são síncronas dentro do armazém: nada entre conferir o saldo e descontá-lo
    const r =
      caminho === '/carteira/comprar' ? carteiras.comprar(id!, valido.valor.skin, undefined, valido.valor.preco) : carteiras.usar(id!, valido.valor.skin);
    return resposta(pedido, r, versao);
  }

  /** A resposta do armazém: o estado como o cliente que fala `versao` o entende, ou o erro com o código do protocolo. */
  function resposta(pedido: PedidoDaCarteira, r: ResultadoDeLoja, versao: number): RespostaDaCarteira {
    if (r.ok) return responder(200, estadoDaCarteiraParaVersao(r.estado, versao));
    if (r.erro === 'encerrado') return recusar(pedido, 'limite', { status: 503, mensagem: MENSAGEM_ENCERRANDO });
    return recusar(pedido, r.erro);
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
