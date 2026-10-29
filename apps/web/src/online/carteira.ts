import {
  PROTOCOLO_VERSAO,
  SALDO_INICIAL,
  ehCodigoDeCarteira,
  ehIdDeItemDoBalao,
  ehSkinDeTaco,
  precoDaSkin,
  precoDoItemDoBalao,
  validarAparenciaDoBalao,
  validarCarteiraCriada,
  validarErroDaCarteira,
  validarEstadoDaCarteira,
  type AparenciaDoBalao,
  type CodigoErroCarteira,
  type EstadoCarteira,
  type IdItemDoBalao,
  type MissoesDoDia,
  type SkinTaco,
} from '@sinuca/protocolo';
import { gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';
import { linkDaCarteira } from './levar-carteira';
import { textoDeMoedas } from './moedas';

/** Onde o navegador guarda o código secreto da carteira (e a versão do formato). */
export const CHAVE_DA_CARTEIRA = 'sinuca.carteira';
const VERSAO_DA_CARTEIRA = 1;

/** O que dizer a quem teve a carteira trocada por uma nova porque o servidor perdeu a dele. */
export const AVISO_CARTEIRA_NOVA = `Sua carteira não existe mais neste servidor: começou uma nova com ${textoDeMoedas(SALDO_INICIAL)}`;

/** O que dizer quando a sala cobraria mais do que a loja mostrava (a vitrine virou o dia): nada foi cobrado. */
export const AVISO_PRECO_MUDOU = 'O preço mudou, confira de novo.';

/**
 * O cabeçalho com que o cliente diz que versão do protocolo fala (L47/L48): todo pedido a `/carteira*` leva `X-Sinuca-Protocolo: 10`. Sem
 * ele a sala responde como à versão 9 (sem o `balao` no estado), então a loja do balão nunca receberia nada.
 */
export const CABECALHO_DO_PROTOCOLO = 'X-Sinuca-Protocolo';

/** Quanto se espera por uma resposta da carteira antes de dar a loja como fora do ar. */
export const ESPERA_MAXIMA_DA_CARTEIRA_MS = 6000;

// ---------------------------------------------------------------- o que usamos do `fetch`

export interface PedidoHttp {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  /** Para abortar o pedido que passou do prazo. */
  readonly sinal?: AbortSignal;
}

export interface RespostaHttp {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type PedirHttp = (url: string, init: PedidoHttp) => Promise<RespostaHttp>;

/** O `fetch` do navegador, no formato acima: sem cookies, sem cache (o saldo muda), no mesmo endereço da página. */
export const pedirPeloNavegador: PedirHttp = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: init.sinal, cache: 'no-store', credentials: 'omit' });

// ---------------------------------------------------------------- resultados

/** `fora-do-ar`: a rede caiu, o servidor não respondeu a tempo ou respondeu algo que não é do protocolo. */
export type FalhaDaCarteira = CodigoErroCarteira | 'fora-do-ar';

export type ResultadoDaCarteira =
  | { readonly ok: true; readonly estado: EstadoCarteira }
  | { readonly ok: false; readonly erro: FalhaDaCarteira; readonly mensagem: string };

/**
 * O que a sala disse de um código que NÃO é o deste aparelho (L43, `conferir`): o estado da carteira dele, se é a mesma que o aparelho já
 * usa e, para quem confirmar, `usar()`, que a adota neste aparelho. O código fica dentro da função, nunca no resultado.
 */
export type ConferenciaDaCarteira =
  | { readonly ok: true; readonly estado: EstadoCarteira; readonly mesma: boolean; readonly usar: () => void }
  | { readonly ok: false; readonly erro: FalhaDaCarteira; readonly mensagem: string };

/**
 * A frase em português de cada erro. `faltam`: quantas moedas faltam, quando o aparelho sabe. `de`: o que se comprava (a skin do taco,
 * o padrão, ou um item do balão).
 */
export function textoDoErroDaCarteira(erro: FalhaDaCarteira, faltam?: number, de: 'skin' | 'balao' = 'skin'): string {
  switch (erro) {
    case 'carteira-invalida':
      return 'Sua carteira não foi encontrada neste servidor.';
    case 'saldo-insuficiente':
      return faltam !== undefined && faltam > 0 ? `Saldo insuficiente: faltam ${textoDeMoedas(faltam)}.` : `Saldo insuficiente para ${de === 'balao' ? 'esse item' : 'essa skin'}.`;
    case 'skin-invalida':
      return 'Essa skin não existe.';
    case 'ja-tem':
      return de === 'balao' ? 'Você já tem esse item.' : 'Você já tem essa skin.';
    case 'nao-tem':
      return de === 'balao' ? 'Você ainda não tem esse item.' : 'Você ainda não tem essa skin.';
    case 'preco-mudou':
      return AVISO_PRECO_MUDOU;
    case 'item-invalido':
      return 'Esse item não existe.';
    case 'aparencia-invalida':
      return 'Essa combinação de balão não existe.';
    case 'limite':
      return 'Muitos pedidos agora. Tente de novo daqui a pouco.';
    case 'requisicao-invalida':
      return 'O servidor não aceitou o pedido. Recarregue a página e tente de novo.';
    case 'fora-do-ar':
      return 'A loja está fora do ar agora. O jogo segue sem ela.';
  }
}

const falha = (erro: FalhaDaCarteira, faltam?: number, de: 'skin' | 'balao' = 'skin'): { readonly ok: false; readonly erro: FalhaDaCarteira; readonly mensagem: string } => ({ ok: false, erro, mensagem: textoDoErroDaCarteira(erro, faltam, de) });

type Resposta = { readonly ok: true; readonly corpo: unknown } | { readonly ok: false; readonly erro: FalhaDaCarteira };

export interface DependenciasDaCarteira {
  readonly armazenamento: ArmazenamentoMinimo | null;
  readonly pedir: PedirHttp;
  /** Agenda `fn` daqui a `ms`; devolve o cancelamento (o mesmo de `online/`). */
  readonly agendar: (fn: () => void, ms: number) => () => void;
  readonly esperaMaximaMs?: number;
  /** Prefixo dos caminhos (`''` = o mesmo endereço da página, que o Vite repassa à sala). */
  readonly base?: string;
}

/**
 * A carteira deste navegador (L24): o código secreto fica no `localStorage`, o saldo e as skins ficam na sala (HTTP em
 * `/carteira`). Sem DOM nem rede própria: o `fetch` entra de fora. O código só sai daqui por `codigo()`, que vai para o
 * `criar-sala` e o `entrar` e para o cabeçalho `Authorization`; nunca para tela, log, gancho ou diagnóstico.
 */
export class CarteiraDoAparelho {
  #codigo: string | null = null;
  #guardada = false;
  #estado: EstadoCarteira | null = null;
  #aviso: string | null = null;
  #emVoo: Promise<ResultadoDaCarteira> | null = null;
  /** Sobe a cada troca de carteira (L43): uma resposta que chega de um pedido feito com o código de antes não vale mais. */
  #geracao = 0;
  readonly #ouvintes = new Set<(estado: EstadoCarteira | null) => void>();

  constructor(private readonly deps: DependenciasDaCarteira) {
    this.#lerGuardado();
  }

  /** O código secreto, ou `undefined` sem carteira. Quem chama não o guarda nem o mostra. */
  codigo(): string | undefined {
    this.#lerGuardado();
    return this.#codigo ?? undefined;
  }

  /** O último saldo e as skins que o servidor deu; `null` antes de ler ou criar. */
  estado(): EstadoCarteira | null {
    return this.#estado;
  }

  /** O código está no `localStorage` (sobrevive a fechar a página)? Falso com o armazenamento bloqueado. */
  guardada(): boolean {
    return this.#guardada;
  }

  /** O recado pendente (a carteira foi trocada por uma nova), até alguém o dispensar. */
  aviso(): string | null {
    return this.#aviso;
  }

  dispensarAviso(): void {
    if (this.#aviso === null) return;
    this.#aviso = null;
    this.#avisar();
  }

  /** O estado mudou (leitura, compra, troca de skin, carteira nova). Devolve o cancelamento. */
  aoMudar(ouvinte: (estado: EstadoCarteira | null) => void): () => void {
    this.#ouvintes.add(ouvinte);
    return () => void this.#ouvintes.delete(ouvinte);
  }

  /**
   * Põe a carteira em dia: sem código cria uma; com código lê o saldo; se o servidor não a conhece mais, começa uma nova (e deixa
   * o `aviso`). Pedidos simultâneos dividem uma ida só ao servidor.
   */
  garantir(): Promise<ResultadoDaCarteira> {
    if (this.#emVoo === null) {
      const pedido: Promise<ResultadoDaCarteira> = this.#sincronizar().finally(() => {
        if (this.#emVoo === pedido) this.#emVoo = null;
      });
      this.#emVoo = pedido;
    }
    return this.#emVoo;
  }

  /**
   * O quadro de missões que a sala mandou na `missoes` (L32): entra no estado sem tocar no saldo nem nas skins, para o painel do
   * lobby já mostrar o progresso novo sem esperar a próxima leitura. Sem estado lido, não há onde guardar.
   */
  adotarMissoes(quadro: MissoesDoDia): void {
    if (this.#estado === null) return;
    this.#estado = { ...this.#estado, missoes: quadro };
    this.#avisar();
  }

  /**
   * Compra a skin. `preco` é o que a tela mostrou: a sala o usa só como teto e, se o preço dela na hora for maior (a vitrine virou o
   * dia), recusa com `preco-mudou` sem cobrar; aí a carteira é relida (o preço novo já está em `estado()`) e o aviso é o
   * `AVISO_PRECO_MUDOU`.
   */
  async comprar(skin: SkinTaco, preco?: number): Promise<ResultadoDaCarteira> {
    return this.#pedirSkin('/carteira/comprar', skin, preco);
  }

  async usar(skin: SkinTaco): Promise<ResultadoDaCarteira> {
    return this.#pedirSkin('/carteira/usar', skin);
  }

  /**
   * Compra um item do balão (L48, `POST /carteira/balao/comprar`): `preco` é o que a tela mostrou, só um teto (o preço do balão é fixo).
   * A sala responde o estado completo, com o `balao`; o saldo curto vem com "faltam N moedas".
   */
  async comprarItemDoBalao(item: IdItemDoBalao, preco?: number): Promise<ResultadoDaCarteira> {
    if (!ehIdDeItemDoBalao(item)) return falha('item-invalido', undefined, 'balao');
    const pedido = preco !== undefined && Number.isInteger(preco) && preco > 0 ? { item, preco } : { item };
    const r = await this.#pedirComCarteira('/carteira/balao/comprar', pedido);
    if (!r.ok) {
      if (r.erro === 'carteira-invalida') {
        await this.#recomecar();
        return falha('carteira-invalida');
      }
      const faltam = r.erro === 'saldo-insuficiente' && this.#estado !== null ? precoDoItemDoBalao(item) - this.#estado.saldo : undefined;
      return falha(r.erro, faltam, 'balao');
    }
    return this.#adotar(r.corpo);
  }

  /**
   * Equipa a aparência inteira (L48, `POST /carteira/balao/equipar`): a sala só aceita o que a carteira tem (os grátis incluídos) e,
   * se um campo não vale, não muda nada. Uma aparência que nem tem a forma do protocolo não vai à rede.
   */
  async equiparAparencia(aparencia: AparenciaDoBalao): Promise<ResultadoDaCarteira> {
    const valida = validarAparenciaDoBalao(aparencia);
    if (!valida.ok) return falha('aparencia-invalida', undefined, 'balao');
    const r = await this.#pedirComCarteira('/carteira/balao/equipar', { aparencia: valida.valor });
    if (!r.ok) {
      if (r.erro === 'carteira-invalida') {
        await this.#recomecar();
        return falha('carteira-invalida');
      }
      return falha(r.erro, undefined, 'balao');
    }
    return this.#adotar(r.corpo);
  }

  /** Existe um código guardado neste aparelho? (Só a resposta: o código não sai.) */
  tem(): boolean {
    this.#lerGuardado();
    return this.#codigo !== null;
  }

  /**
   * O link que leva esta carteira a outro aparelho (L43): `base#carteira=CODIGO`, com o código no fragmento, que nunca vai à rede. É o
   * único lugar, fora o cabeçalho e o `criar-sala`/`entrar`, por onde o código sai; quem o recebe só o mostra a quem pediu. `null` sem carteira.
   */
  linkParaLevar(base: string): string | null {
    this.#lerGuardado();
    return this.#codigo === null ? null : linkDaCarteira(base, this.#codigo);
  }

  /**
   * Pergunta à sala se este código é de uma carteira (L43, `GET /carteira` com ele), SEM mexer em nada: o código, o estado e os ouvintes
   * deste aparelho ficam como estavam. Quem confirmar chama `usar()` do resultado, que adota o código e o estado que a sala deu.
   */
  async conferir(codigo: string): Promise<ConferenciaDaCarteira> {
    if (!ehCodigoDeCarteira(codigo)) return falha('carteira-invalida');
    const geracao = this.#geracao;
    const r = await this.#pedir('GET', '/carteira', null, codigo);
    if (!r.ok) return falha(r.erro);
    const lido = validarEstadoDaCarteira(r.corpo);
    if (!lido.ok) return falha('fora-do-ar');
    this.#lerGuardado();
    const estado = lido.valor;
    return {
      ok: true,
      estado,
      mesma: codigo === this.#codigo,
      usar: () => {
        if (geracao !== this.#geracao) return;
        this.#trocarPara(codigo, estado);
      },
    };
  }

  // ---------------------------------------------------------------- por dentro

  /** Adota `codigo` como a carteira deste aparelho: guarda, esquece o recado da anterior e invalida o que ainda estiver a caminho. */
  #trocarPara(codigo: string, estado: EstadoCarteira): void {
    this.#geracao++;
    this.#emVoo = null;
    this.#codigo = codigo;
    this.#guardada = gravarJson(CHAVE_DA_CARTEIRA, { versao: VERSAO_DA_CARTEIRA, codigo }, this.deps.armazenamento);
    this.#estado = estado;
    this.#aviso = null;
    this.#avisar();
  }

  async #sincronizar(): Promise<ResultadoDaCarteira> {
    this.#lerGuardado();
    if (this.#codigo === null) return this.#criar();
    const r = await this.#pedir('GET', '/carteira', null);
    if (!r.ok) return r.erro === 'carteira-invalida' ? this.#recomecar() : falha(r.erro);
    return this.#adotar(r.corpo);
  }

  async #pedirSkin(caminho: '/carteira/comprar' | '/carteira/usar', skin: SkinTaco, preco?: number): Promise<ResultadoDaCarteira> {
    if (!ehSkinDeTaco(skin)) return falha('skin-invalida');
    this.#lerGuardado();
    if (this.#codigo === null) {
      const pronta = await this.garantir();
      if (!pronta.ok) return pronta;
    }
    const pedido = caminho === '/carteira/comprar' && preco !== undefined && Number.isInteger(preco) && preco > 0 ? { skin, preco } : { skin };
    const r = await this.#pedir('POST', caminho, pedido);
    if (!r.ok) {
      if (r.erro === 'carteira-invalida') {
        await this.#recomecar();
        return falha('carteira-invalida');
      }
      if (r.erro === 'preco-mudou') {
        // Relê o saldo e a vitrine: a tela já mostra o preço novo quando o aviso aparece.
        await this.garantir();
        return falha('preco-mudou');
      }
      const faltam = r.erro === 'saldo-insuficiente' && this.#estado !== null ? precoDaSkin(skin) - this.#estado.saldo : undefined;
      return falha(r.erro, faltam);
    }
    return this.#adotar(r.corpo);
  }

  /** Um POST autenticado da carteira (cria a carteira antes se o aparelho ainda não tem uma). */
  async #pedirComCarteira(caminho: string, corpo: object): Promise<Resposta> {
    this.#lerGuardado();
    if (this.#codigo === null) {
      const pronta = await this.garantir();
      if (!pronta.ok) return { ok: false, erro: pronta.erro };
    }
    return this.#pedir('POST', caminho, corpo);
  }

  /** O servidor não conhece o código: esquece-o e cria uma carteira nova, com o aviso se deu certo. */
  async #recomecar(): Promise<ResultadoDaCarteira> {
    this.#codigo = null;
    this.#guardada = false;
    const r = await this.#criar();
    if (r.ok) {
      this.#aviso = AVISO_CARTEIRA_NOVA;
      this.#avisar();
    }
    return r;
  }

  async #criar(): Promise<ResultadoDaCarteira> {
    const r = await this.#pedir('POST', '/carteira', null);
    if (!r.ok) return falha(r.erro);
    const criada = validarCarteiraCriada(r.corpo);
    if (!criada.ok) return falha('fora-do-ar');
    const { codigo, ...estado } = criada.valor;
    this.#codigo = codigo;
    this.#guardada = gravarJson(CHAVE_DA_CARTEIRA, { versao: VERSAO_DA_CARTEIRA, codigo }, this.deps.armazenamento);
    this.#estado = estado;
    this.#avisar();
    return { ok: true, estado };
  }

  #adotar(corpo: unknown): ResultadoDaCarteira {
    const lido = validarEstadoDaCarteira(corpo);
    if (!lido.ok) return falha('fora-do-ar');
    this.#estado = lido.valor;
    this.#avisar();
    return { ok: true, estado: lido.valor };
  }

  /** O código que o `localStorage` tem agora (outra aba pode ter criado a carteira); sem nada válido lá, vale o da memória. */
  #lerGuardado(): void {
    const lido = lerJson(CHAVE_DA_CARTEIRA, this.deps.armazenamento);
    if (typeof lido !== 'object' || lido === null) return;
    const v = lido as Record<string, unknown>;
    if (v.versao !== VERSAO_DA_CARTEIRA || !ehCodigoDeCarteira(v.codigo)) return;
    this.#codigo = v.codigo;
    this.#guardada = true;
  }

  async #pedir(metodo: 'GET' | 'POST', caminho: string, corpo: object | null, codigoDeFora?: string): Promise<Resposta> {
    // Pedido com o código DESTE aparelho: se a carteira for trocada enquanto ele voa, a resposta é da carteira de antes e não vale.
    const geracao = this.#geracao;
    const headers: Record<string, string> = { Accept: 'application/json', [CABECALHO_DO_PROTOCOLO]: String(PROTOCOLO_VERSAO) };
    if (caminho !== '/carteira' || metodo === 'GET') headers.Authorization = `Bearer ${codigoDeFora ?? this.#codigo}`;
    if (corpo !== null) headers['Content-Type'] = 'application/json';
    const aborto = new AbortController();
    const limite = this.deps.esperaMaximaMs ?? ESPERA_MAXIMA_DA_CARTEIRA_MS;
    /** O prazo vale por fase (cabeçalhos, depois corpo): uma página engasgada não perde a resposta que já chegou. */
    const comPrazo = async <T>(promessa: Promise<T>): Promise<T | 'prazo'> => {
      let cancelar: () => void = () => {};
      const prazo = new Promise<'prazo'>((resolver) => {
        cancelar = this.deps.agendar(() => {
          aborto.abort();
          resolver('prazo');
        }, limite);
      });
      try {
        return await Promise.race([promessa, prazo]);
      } finally {
        cancelar();
      }
    };
    try {
      const init: PedidoHttp = { method: metodo, headers, sinal: aborto.signal, ...(corpo === null ? {} : { body: JSON.stringify(corpo) }) };
      const resposta = await comPrazo(this.deps.pedir(`${this.deps.base ?? ''}${caminho}`, init));
      if (resposta === 'prazo') return { ok: false, erro: 'fora-do-ar' };
      const json = await comPrazo(resposta.json());
      if (json === 'prazo') return { ok: false, erro: 'fora-do-ar' };
      if (codigoDeFora === undefined && geracao !== this.#geracao) return { ok: false, erro: 'fora-do-ar' };
      if (resposta.ok) return { ok: true, corpo: json };
      const erro = validarErroDaCarteira(json);
      return { ok: false, erro: erro.ok ? erro.valor.erro : 'fora-do-ar' };
    } catch {
      return { ok: false, erro: 'fora-do-ar' };
    }
  }

  #avisar(): void {
    for (const ouvinte of this.#ouvintes) ouvinte(this.#estado);
  }
}
