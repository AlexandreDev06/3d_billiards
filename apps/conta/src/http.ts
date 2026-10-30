import { normalizarEmail, validarNome, validarSenha } from './campos';
import { emailDeNovaSenha, type Carteiro } from './carteiro';
import { BaldesNoSql, limparBaldesAntigos } from './baldes-sql';
import type { Contas } from './contas';
import type { ContaPublica, ErroDeConta, PedidoDaConta, RespostaDaConta } from './contrato';
import { resumoHex } from './cripto';
import { chaveDoIp } from './ip';
import { BaldeDeTokens, BaldesPorChave } from './limite-taxa';
import type { SqlMinimo } from './sql';

/** O corpo de um pedido tem no máximo isto (em bytes); acima é 413, antes de qualquer hash. O portal também nem lê além disso. */
export const MAX_CORPO = 8 * 1024;
export const NOME_DO_COOKIE = 'becogames_sessao';
const VALIDADE_DO_COOKIE_S = 7_776_000;
const FORMA_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** `https://becogames.app` e `https://<sub>.becogames.app`: o `https` e o `.app` inteiros, uma etiqueta de subdomínio, sem porta. */
const ORIGEM_DA_BECO = /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)?becogames\.app$/;
const LIMPAR_A_CADA_MS = 5 * 60_000;

const ROTAS: ReadonlyMap<string, 'GET' | 'POST'> = new Map([
  ['criar', 'POST'],
  ['entrar', 'POST'],
  ['eu', 'GET'],
  ['sair', 'POST'],
  ['nome', 'POST'],
  ['excluir', 'POST'],
  ['esqueci', 'POST'],
  ['nova-senha', 'POST'],
]);

const FORA_DO_AR = 'A conta está fora do ar. Tente mais tarde.';
const MENSAGENS: Readonly<Record<ErroDeConta, string>> = {
  'email-invalido': 'Confira o e-mail.',
  'senha-curta': 'A senha precisa ter pelo menos 8 caracteres.',
  'senha-longa': 'A senha pode ter até 128 caracteres.',
  'nome-invalido': 'O nome precisa ter de 1 a 20 caracteres.',
  'email-em-uso': 'Este e-mail já tem conta. Entre com ele ou peça uma senha nova.',
  'email-ou-senha': 'E-mail ou senha errados.',
  'link-vencido': 'Este link venceu ou já foi usado. Peça outro.',
  'sem-sessao': 'Você não está na sua conta.',
  'senha-errada': 'Senha errada.',
  'convidado-ja-e-conta': 'Esta carteira já é de uma conta.',
  cheio: FORA_DO_AR,
  'nao-configurado': FORA_DO_AR,
};
const STATUS: Readonly<Record<ErroDeConta, number>> = {
  'email-invalido': 400,
  'senha-curta': 400,
  'senha-longa': 400,
  'nome-invalido': 400,
  'link-vencido': 400,
  'email-em-uso': 409,
  'convidado-ja-e-conta': 409,
  'email-ou-senha': 401,
  'sem-sessao': 401,
  'senha-errada': 401,
  cheio: 503,
  'nao-configurado': 503,
};

const MENSAGEM_DO_ESQUECI = 'Se houver uma conta com este e-mail, mandamos um link para criar a senha nova. Confira também o spam.';

/** Capacidade e reposição por segundo dos baldes por chave (os números do plano). */
const BALDES = {
  entrarPorIp: { capacidade: 20, porSegundo: 20 / 3600 },
  entrarPorEmail: { capacidade: 5, porSegundo: 5 / 900 },
  criarPorIp: { capacidade: 3, porSegundo: 3 / 3600 },
  esqueciPorIp: { capacidade: 5, porSegundo: 5 / 3600 },
  esqueciPorEmail: { capacidade: 3, porSegundo: 3 / 3600 },
  novaSenhaPorIp: { capacidade: 10, porSegundo: 10 / 3600 },
  excluirPorIp: { capacidade: 10, porSegundo: 10 / 3600 },
  excluirPorConta: { capacidade: 5, porSegundo: 5 / 900 },
} as const;
type NomeDoBalde = keyof typeof BALDES;
/** Os baldes que vivem no SQLite do objeto (sobrevivem ao despejo); os outros ficam na memória. */
type NomeNoSql = 'entrarPorEmail' | 'esqueciPorEmail' | 'criarPorIp' | 'excluirPorConta';
type NomeNaMemoria = Exclude<NomeDoBalde, NomeNoSql>;
const NA_MEMORIA: readonly NomeNaMemoria[] = ['entrarPorIp', 'esqueciPorIp', 'novaSenhaPorIp', 'excluirPorIp'];

/**
 * O balde de todos, gasto por quem vai rodar um hash (criar, entrar, nova-senha, excluir): o PBKDF2 trava o único objeto, e este teto
 * garante que o hash nunca ocupe o objeto mais que uma parte de cada segundo, não importa de quantos IPs e e-mails venha o ataque.
 */
const HASH_POR_SEGUNDO = { capacidade: 40, porSegundo: 20 } as const;

export interface OpcoesDoHttp {
  contas: Contas;
  /** `null`: sem chave do Resend; o esqueci só registra `email-nao-configurado`. */
  carteiro: Carteiro | null;
  /** Um evento por linha, só com contagens, status e `conta` (8 caracteres do id). Nunca e-mail, senha, token nem código. */
  log: (evento: string, dados: Record<string, unknown>) => void;
  relogio: () => number;
  /** O `Domain` do cookie (`.becogames.app`); `null` em desenvolvimento (o cookie fica do host). */
  dominioDoCookie: string | null;
  /** Falso só em desenvolvimento, para o cookie valer em `http://localhost`. */
  cookieSeguro: boolean;
  /** Origin extras aceitas além da Beco Games (em minúsculas); vazio em produção. */
  origensDeDev: readonly string[];
  /** O SQLite do objeto: guarda os baldes que não podem sumir com o despejo (tabela `baldes`). */
  sql: SqlMinimo;
  /** Roda a promessa depois da resposta (`ctx.waitUntil`): o e-mail da recuperação não segura o pedido. */
  depois: (p: Promise<unknown>) => void;
}

const resposta = (status: number, corpo: Record<string, unknown>, cookie?: string): RespostaDaConta => (cookie === undefined ? { status, corpo } : { status, corpo, cookie });
const falha = (status: number, erro: string, mensagem: string, extra: Record<string, unknown> = {}): RespostaDaConta => resposta(status, { erro, mensagem, ...extra });
const falhaDeConta = (erro: ErroDeConta, cookie?: string): RespostaDaConta => resposta(STATUS[erro], { erro, mensagem: MENSAGENS[erro] }, cookie);
const publica = (c: ContaPublica): Record<string, unknown> => ({ conta: { nome: c.nome, email: c.email, saldo: c.saldo } });

function tokenDoCookie(cookie: string | null): string | null {
  if (cookie === null) return null;
  for (const par of cookie.split(';')) {
    const i = par.indexOf('=');
    if (i < 0 || par.slice(0, i).trim() !== NOME_DO_COOKIE) continue;
    const valor = par.slice(i + 1).trim();
    if (FORMA_DO_TOKEN.test(valor)) return valor;
  }
  return null;
}

/** O corpo como objeto JSON, ou `null` se falta, não é JSON ou não é um objeto. */
function lerObjeto(corpo: string | null): Record<string, unknown> | null {
  if (corpo === null) return null;
  try {
    const x: unknown = JSON.parse(corpo);
    return typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** O que cabe em `MAX_CORPO` bytes. Texto com mais caracteres que isso já passou, sem codificar um corpo enorme para descobrir. */
function corpoGrande(corpo: string): boolean {
  return corpo.length > MAX_CORPO || new TextEncoder().encode(corpo).length > MAX_CORPO;
}

/**
 * O HTTP da conta: recebe o pedido já em partes (`PedidoDaConta`) e devolve a resposta (`RespostaDaConta`), sem `Request` nem `Response`.
 * Ordem das checagens: rota, método, Origin, tamanho do corpo, JSON e campos, baldes por IP/e-mail/conta, o teto de hash de todos
 * (`hashPorSegundo`, 503 `ocupado`) e só então `Contas`. Nenhum hash roda antes dos baldes. Os baldes por e-mail, o de criar por IP e o
 * de excluir por conta moram no SQLite do objeto (sobrevivem ao despejo); os de IP de entrar/esqueci/nova-senha/excluir e o global, na memória.
 */
export class HttpDaConta {
  private readonly o: OpcoesDoHttp;
  private readonly baldes: Readonly<Record<NomeNaMemoria, BaldesPorChave>>;
  private readonly noSql: Readonly<Record<NomeNoSql, BaldesNoSql>>;
  private readonly hashPorSegundo: BaldeDeTokens;
  private limpouEm: number;

  constructor(o: OpcoesDoHttp) {
    this.o = o;
    const naMemoria = (n: NomeNaMemoria): BaldesPorChave => new BaldesPorChave(BALDES[n].capacidade, BALDES[n].porSegundo, o.relogio);
    const guardado = (n: NomeNoSql): BaldesNoSql => new BaldesNoSql(o.sql, n, BALDES[n].capacidade, BALDES[n].porSegundo, o.relogio);
    this.baldes = {
      entrarPorIp: naMemoria('entrarPorIp'),
      esqueciPorIp: naMemoria('esqueciPorIp'),
      novaSenhaPorIp: naMemoria('novaSenhaPorIp'),
      excluirPorIp: naMemoria('excluirPorIp'),
    };
    this.noSql = {
      entrarPorEmail: guardado('entrarPorEmail'),
      esqueciPorEmail: guardado('esqueciPorEmail'),
      criarPorIp: guardado('criarPorIp'),
      excluirPorConta: guardado('excluirPorConta'),
    };
    this.hashPorSegundo = new BaldeDeTokens(HASH_POR_SEGUNDO.capacidade, HASH_POR_SEGUNDO.porSegundo, o.relogio);
    this.limpouEm = o.relogio();
  }

  async tratar(p: PedidoDaConta): Promise<RespostaDaConta> {
    const metodo = ROTAS.get(p.acao);
    if (metodo === undefined) return falha(404, 'nao-encontrado', 'Não encontrado.');
    if (p.metodo !== metodo) return falha(405, 'metodo', 'Método não permitido.');
    if (metodo === 'POST' && !this.origemPermitida(p.origem)) {
      this.o.log('origem-recusada', { acao: p.acao });
      return falha(403, 'origem', 'Pedido recusado.');
    }
    if (p.corpo !== null && corpoGrande(p.corpo)) return falha(413, 'corpo-grande', 'Pedido grande demais.');
    this.limparBaldes();
    try {
      return await this.despachar(p);
    } catch (e) {
      this.o.log('erro-interno', { acao: p.acao, tipo: e instanceof Error ? e.name : typeof e });
      return falha(500, 'interno', FORA_DO_AR);
    }
  }

  private async despachar(p: PedidoDaConta): Promise<RespostaDaConta> {
    const token = tokenDoCookie(p.cookie);
    if (p.acao === 'eu') return this.eu(token);
    if (p.acao === 'sair') return this.sair(token);
    const c = lerObjeto(p.corpo);
    if (c === null) return falha(400, 'corpo-invalido', 'Pedido inválido.');
    const ip = chaveDoIp(p.ip);
    switch (p.acao) {
      case 'criar':
        return this.criar(c, ip, p.convidado);
      case 'entrar':
        return this.entrar(c, ip);
      case 'nome':
        return token === null ? falhaDeConta('sem-sessao') : this.nome(token, c);
      case 'excluir':
        return token === null ? falhaDeConta('sem-sessao') : this.excluir(token, c, ip);
      case 'esqueci':
        return this.esqueci(c, ip);
      default:
        return this.novaSenha(c, ip);
    }
  }

  private async criar(c: Record<string, unknown>, ip: string, codigo: string | null): Promise<RespostaDaConta> {
    // Campo ruim é 400 antes dos baldes: errar o formulário não gasta as 3 criações por hora do IP.
    const ruim = normalizarEmail(c.email) === null ? 'email-invalido' : validarSenha(c.senha) !== 'ok' ? validarSenha(c.senha) : validarNome(c.nome) === null ? 'nome-invalido' : null;
    if (ruim !== null && ruim !== 'ok') return falhaDeConta(ruim);
    const bloqueio = this.gastar('criarPorIp', ip);
    if (bloqueio !== null) return bloqueio;
    // O código malformado é ignorado (a conta nasce do zero); o bem formado vira o id do convidado, que o Banco converte ou cria.
    const convidadoId = codigo !== null && FORMA_DO_TOKEN.test(codigo) ? await resumoHex(codigo) : undefined;
    const ocupado = this.gastarHash();
    if (ocupado !== null) return ocupado;
    const r = await this.o.contas.criar({ email: c.email, senha: c.senha, nome: c.nome, ...(convidadoId === undefined ? {} : { convidadoId }) });
    if (!r.ok) return falhaDeConta(r.erro);
    this.o.log('conta-criada', { conta: r.conta.id.slice(0, 8), convidado: convidadoId !== undefined });
    return resposta(201, publica(r.conta), this.cookie(r.token));
  }

  private async entrar(c: Record<string, unknown>, ip: string): Promise<RespostaDaConta> {
    const email = normalizarEmail(c.email);
    const porIp = this.gastar('entrarPorIp', ip);
    if (porIp !== null) return porIp;
    if (email !== null) {
      const porEmail = this.gastar('entrarPorEmail', await resumoHex(email));
      if (porEmail !== null) return porEmail;
    }
    const ocupado = this.gastarHash();
    if (ocupado !== null) return ocupado;
    const r = await this.o.contas.entrar(c.email, c.senha);
    if (!r.ok) return falhaDeConta(r.erro);
    this.o.log('entrou', { conta: r.conta.id.slice(0, 8) });
    return resposta(200, publica(r.conta), this.cookie(r.token));
  }

  private async eu(token: string | null): Promise<RespostaDaConta> {
    if (token === null) return falhaDeConta('sem-sessao');
    const s = await this.o.contas.sessao(token);
    if (s === null) return falhaDeConta('sem-sessao', this.cookieApagado());
    return resposta(200, publica(s.conta), s.renovada ? this.cookie(token) : undefined);
  }

  private async sair(token: string | null): Promise<RespostaDaConta> {
    if (token !== null) await this.o.contas.sair(token);
    return resposta(200, { ok: true }, this.cookieApagado());
  }

  private async nome(token: string, c: Record<string, unknown>): Promise<RespostaDaConta> {
    const r = await this.o.contas.mudarNome(token, c.nome);
    return r.ok ? resposta(200, publica(r.conta)) : falhaDeConta(r.erro);
  }

  /** Resolve a sessão antes (sem hash) para limitar por conta e por IP; o hash só roda depois dos baldes e do teto de todos. */
  private async excluir(token: string, c: Record<string, unknown>, ip: string): Promise<RespostaDaConta> {
    const sessao = await this.o.contas.sessao(token);
    if (sessao === null) return falhaDeConta('sem-sessao');
    const porIp = this.gastar('excluirPorIp', ip);
    if (porIp !== null) return porIp;
    const porConta = this.gastar('excluirPorConta', sessao.conta.id);
    if (porConta !== null) return porConta;
    const ocupado = this.gastarHash();
    if (ocupado !== null) return ocupado;
    const r = await this.o.contas.excluir(token, c.senha);
    if (!r.ok) return falhaDeConta(r.erro);
    this.o.log('conta-excluida', {});
    return resposta(200, { ok: true }, this.cookieApagado());
  }

  /** Responde igual com e sem conta. O e-mail sai por `depois`, e a resposta não espera por ele. */
  private async esqueci(c: Record<string, unknown>, ip: string): Promise<RespostaDaConta> {
    const email = normalizarEmail(c.email);
    if (email === null) return falhaDeConta('email-invalido');
    const porIp = this.gastar('esqueciPorIp', ip);
    if (porIp !== null) return porIp;
    const porEmail = this.gastar('esqueciPorEmail', await resumoHex(email));
    if (porEmail !== null) return porEmail;
    const ok = resposta(200, { ok: true, mensagem: MENSAGEM_DO_ESQUECI });
    const carteiro = this.o.carteiro;
    if (carteiro === null) {
      this.o.log('email-nao-configurado', {});
      return ok;
    }
    const pedido = await this.o.contas.pedirRecuperacao(email);
    if (pedido === null) return ok;
    this.o.log('recuperacao-pedida', {});
    this.o.depois(this.enviar(carteiro, pedido));
    return ok;
  }

  private async enviar(carteiro: Carteiro, pedido: { para: string; link: string }): Promise<void> {
    try {
      const r = await carteiro.enviar({ para: pedido.para, ...emailDeNovaSenha(pedido.link) });
      this.o.log('recuperacao-enviada', { status: r.status, ok: r.ok });
    } catch {
      this.o.log('recuperacao-enviada', { status: 0, ok: false });
    }
  }

  private async novaSenha(c: Record<string, unknown>, ip: string): Promise<RespostaDaConta> {
    const tamanho = validarSenha(c.senha);
    if (tamanho !== 'ok') return falhaDeConta(tamanho);
    const bloqueio = this.gastar('novaSenhaPorIp', ip);
    if (bloqueio !== null) return bloqueio;
    const ocupado = this.gastarHash();
    if (ocupado !== null) return ocupado;
    const r = await this.o.contas.novaSenha(c.token, c.senha);
    if (!r.ok) return falhaDeConta(r.erro);
    this.o.log('nova-senha', { conta: r.conta.id.slice(0, 8) });
    return resposta(200, publica(r.conta), this.cookie(r.token));
  }

  /** `null` se o balde deixou passar; senão o 429 com quanto esperar (o tempo de uma ficha voltar, no pior caso). */
  private gastar(balde: NomeDoBalde, chave: string): RespostaDaConta | null {
    const b = (NA_MEMORIA as readonly string[]).includes(balde) ? this.baldes[balde as NomeNaMemoria] : this.noSql[balde as NomeNoSql];
    if (b.tentar(chave)) return null;
    this.o.log('limite', { balde });
    return falha(429, 'limite', 'Muitas tentativas. Tente de novo daqui a pouco.', { tenteEmS: Math.ceil(1 / BALDES[balde].porSegundo) });
  }

  /** `null` se há ficha no balde de todos; senão o 503 `ocupado`, antes de qualquer hash. */
  private gastarHash(): RespostaDaConta | null {
    if (this.hashPorSegundo.tentar()) return null;
    this.o.log('limite', { balde: 'hashPorSegundo' });
    return falha(503, 'ocupado', 'Muitos pedidos agora. Tente de novo em alguns segundos.', { tenteEmS: Math.ceil(1 / HASH_POR_SEGUNDO.porSegundo) });
  }

  private origemPermitida(origem: string | null): boolean {
    if (origem === null) return false;
    const o = origem.toLowerCase();
    return ORIGEM_DA_BECO.test(o) || this.o.origensDeDev.includes(o);
  }

  private cookie(token: string): string {
    return this.montarCookie(token, VALIDADE_DO_COOKIE_S);
  }

  private cookieApagado(): string {
    return this.montarCookie('', 0);
  }

  private montarCookie(valor: string, maxAge: number): string {
    const dominio = this.o.dominioDoCookie === null ? '' : `; Domain=${this.o.dominioDoCookie}`;
    return `${NOME_DO_COOKIE}=${valor}; Max-Age=${maxAge}${dominio}; Path=/; HttpOnly${this.o.cookieSeguro ? '; Secure' : ''}; SameSite=Lax`;
  }

  /**
   * Os baldes do SQLite perdem, a cada pedido, até 50 linhas paradas há mais de 1 dia; os da memória esquecem de vez em quando as chaves
   * que já recarregaram, para a memória do objeto não crescer com cada IP que passou.
   */
  private limparBaldes(): void {
    const agora = this.o.relogio();
    limparBaldesAntigos(this.o.sql, agora);
    if (agora - this.limpouEm < LIMPAR_A_CADA_MS) return;
    this.limpouEm = agora;
    for (const b of Object.values(this.baldes)) b.limpar();
  }
}
