import { normalizarEmail, validarNome, validarSenha, ehCodigoDeConvidado, ehIdDeConta } from './campos';
import { LINK_DE_NOVA_SENHA } from './carteiro';
import type { ComSessao, ContaPublica, ErroDeConta } from './contrato';
import { bytesParaHex, hashDaSenha, hexParaBytes, iguaisEmTempoConstante, ITERACOES, resumoHex, tokenAleatorio, type Aleatorio } from './cripto';
import type { Moedas } from './moedas';
import type { SqlMinimo, Transacao } from './sql';

const DIA_MS = 24 * 3600_000;
/** Quanto uma sessão vale a partir da última renovação. */
export const VALIDADE_DA_SESSAO_MS = 90 * DIA_MS;
/** Só renova a sessão se a última renovação foi há mais que isto. */
export const RENOVAR_DEPOIS_DE_MS = DIA_MS;
export const MAX_SESSOES_POR_CONTA = 20;
export const VALIDADE_DA_RECUPERACAO_MS = 3600_000;
/** O teto de `excluidasDesde` por chamada. */
export const MAX_EXCLUIDAS_POR_CHAMADA = 500;

/** O que um token de sessão ou de recuperação é: 32 bytes em base64url. */
const FORMA_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TAMANHO_DO_SAL = 16;
/** O sal do hash de mentira: tem o mesmo custo do hash de verdade. */
const SAL_DE_MENTIRA = new Uint8Array(TAMANHO_DO_SAL);

type Falha = { ok: false; erro: ErroDeConta };
const recusa = (erro: ErroDeConta): Falha => ({ ok: false, erro });
/** Só a violação do UNIQUE da coluna `contas.email` quer dizer e-mail em uso; qualquer outra (a chave `contas.id`, por exemplo) é erro de verdade. */
const ehViolacaoDoEmail = (e: unknown): boolean => e instanceof Error && /UNIQUE constraint failed: contas\.email\b/i.test(e.message);

export interface OpcoesDeContas {
  sql: SqlMinimo;
  transacao: Transacao;
  relogio: () => number;
  aleatorio: Aleatorio;
  moedas: Moedas;
  /** `null`: o segredo não está configurado, e toda operação de senha dá `nao-configurado`. */
  pepper: string | null;
  saldoInicial: number;
  maxContas: number;
  /** Só para o teste contar as chamadas. */
  hash?: typeof hashDaSenha;
}

interface LinhaDeSenha {
  id: string;
  hash: string;
  sal: string;
  iteracoes: number;
}

/**
 * Contas, sessões e recuperação de senha. Núcleo puro sobre `SqlMinimo`.
 *
 * Concorrência: entre dois `await` do Web Crypto outro pedido entra no objeto. Por isso todo método faz primeiro os `await` (hash,
 * resumo, token) e depois UMA transação síncrona com tudo o que lê e escreve; nada de `await` dentro dela. Quem perde a corrida
 * (e-mail repetido, convidado já convertido, link já usado) recebe o erro de sempre, nunca uma exceção.
 *
 * A `transacao` é reentrante (`transacaoReentrante`): `Moedas` roda dentro dela sem SAVEPOINT. Por isso esta classe nunca captura a
 * exceção de uma operação de `Moedas` para seguir adiante, e recusa é sempre retorno `{ ok: false }`.
 *
 * Hash e sal ficam em texto hexadecimal, em colunas `TEXT` (`SqlMinimo` só liga texto e número, e o objeto devolveria BLOB como `ArrayBuffer`).
 */
export class Contas {
  private readonly sql: SqlMinimo;
  private readonly transacao: Transacao;
  private readonly relogio: () => number;
  private readonly aleatorio: Aleatorio;
  private readonly moedas: Moedas;
  private readonly pepper: string | null;
  private readonly saldoInicial: number;
  private readonly maxContas: number;
  private readonly hash: typeof hashDaSenha;

  constructor(o: OpcoesDeContas) {
    this.sql = o.sql;
    this.transacao = o.transacao;
    this.relogio = o.relogio;
    this.aleatorio = o.aleatorio;
    this.moedas = o.moedas;
    this.pepper = o.pepper;
    this.saldoInicial = o.saldoInicial;
    this.maxContas = o.maxContas;
    this.hash = o.hash ?? hashDaSenha;
  }

  /**
   * Cria a conta. Com `convidadoId` a conta nasce do convidado (o mesmo `id` e o mesmo saldo); sem ele, do zero com o saldo inicial.
   * `convidadoId` que não é um id, ou de linha que já é conta ou foi excluída, dá `convidado-ja-e-conta`.
   */
  async criar(d: { email: unknown; senha: unknown; nome: unknown; convidadoId?: string }): Promise<ComSessao> {
    const email = normalizarEmail(d.email);
    if (email === null) return recusa('email-invalido');
    const tamanho = validarSenha(d.senha);
    if (tamanho !== 'ok') return recusa(tamanho);
    const nome = validarNome(d.nome);
    if (nome === null) return recusa('nome-invalido');
    const senha = d.senha as string;
    const convidadoId = d.convidadoId;
    if (convidadoId !== undefined && !ehIdDeConta(convidadoId)) return recusa('convidado-ja-e-conta');
    const pepper = this.pepper;
    if (pepper === null) return recusa('nao-configurado');
    const cedo = this.recusaDeCriar(email, convidadoId, true);
    if (cedo !== null) return recusa(cedo);

    const sal = this.aleatorio(TAMANHO_DO_SAL);
    const hash = await this.hash(senha, sal, pepper, ITERACOES);
    const idNovo = convidadoId ?? (await resumoHex(tokenAleatorio(this.aleatorio)));
    const sessao = await this.sessaoNova();

    try {
      return this.transacao((): ComSessao => {
        const erro = this.recusaDeCriar(email, convidadoId, false);
        if (erro !== null) return recusa(erro);
        this.moedas.garantirConta(idNovo, this.saldoInicial, false);
        // O UNIQUE(email) é a última palavra: quem perdeu a corrida dá violação aqui e a transação inteira se desfaz.
        this.sql.exec(
          'UPDATE contas SET email = ?, nome = ?, hash = ?, sal = ?, iteracoes = ?, convidado = 0 WHERE id = ?',
          email,
          nome,
          bytesParaHex(hash),
          bytesParaHex(sal),
          ITERACOES,
          idNovo,
        );
        this.abrirSessao(idNovo, sessao.resumo);
        return { ok: true, conta: this.contaPublica(idNovo)!, token: sessao.token };
      });
    } catch (e) {
      if (ehViolacaoDoEmail(e)) return recusa('email-em-uso');
      throw e;
    }
  }

  async entrar(email: unknown, senha: unknown): Promise<ComSessao> {
    const normalizado = normalizarEmail(email);
    const tamanho = validarSenha(senha);
    if (tamanho === 'senha-longa') return recusa('senha-longa');
    if (normalizado === null || tamanho !== 'ok') return recusa('email-ou-senha');
    const pepper = this.pepper;
    if (pepper === null) return recusa('nao-configurado');
    const guardado = this.senhaDoEmail(normalizado);
    if (guardado === null) {
      await this.hash(senha as string, SAL_DE_MENTIRA, pepper, ITERACOES);
      return recusa('email-ou-senha');
    }
    if (!(await this.confere(senha as string, guardado, pepper))) return recusa('email-ou-senha');
    const sessao = await this.sessaoNova();
    return this.transacao((): ComSessao => {
      // A senha pode ter mudado ou a conta sido excluída durante o hash.
      const agora = this.senhaDaConta(guardado.id);
      if (agora === null || agora.hash !== guardado.hash) return recusa('email-ou-senha');
      this.abrirSessao(guardado.id, sessao.resumo);
      return { ok: true, conta: this.contaPublica(guardado.id)!, token: sessao.token };
    });
  }

  /** A conta da sessão; renova o prazo (90 dias) se a última renovação foi há mais de 1 dia. Vencida ou de conta excluída: `null`. */
  async sessao(token: string): Promise<{ conta: ContaPublica; renovada: boolean } | null> {
    if (typeof token !== 'string' || !FORMA_DO_TOKEN.test(token)) return null;
    const resumo = await resumoHex(token);
    return this.transacao(() => this.lerSessao(resumo));
  }

  async sair(token: string): Promise<void> {
    if (typeof token !== 'string' || !FORMA_DO_TOKEN.test(token)) return;
    const resumo = await resumoHex(token);
    this.sql.exec('DELETE FROM sessoes WHERE hash = ?', resumo);
  }

  async mudarNome(token: string, nome: unknown): Promise<{ ok: true; conta: ContaPublica } | Falha> {
    if (typeof token !== 'string' || !FORMA_DO_TOKEN.test(token)) return recusa('sem-sessao');
    const resumo = await resumoHex(token);
    const valido = validarNome(nome);
    return this.transacao((): { ok: true; conta: ContaPublica } | Falha => {
      const s = this.lerSessao(resumo);
      if (s === null) return recusa('sem-sessao');
      if (valido === null) return recusa('nome-invalido');
      this.sql.exec('UPDATE contas SET nome = ? WHERE id = ?', valido, s.conta.id);
      return { ok: true, conta: this.contaPublica(s.conta.id)! };
    });
  }

  /**
   * Exclui a conta de quem está na sessão, pedindo a senha. Numa transação só: o saldo vai a zero (no livro), as reservas saem, os dados
   * pessoais viram nulos, `excluida_em` é preenchido e todas as sessões e recuperações somem. O `id` nunca volta a ser usado.
   */
  async excluir(token: string, senha: unknown): Promise<{ ok: true } | Falha> {
    if (typeof token !== 'string' || !FORMA_DO_TOKEN.test(token)) return recusa('sem-sessao');
    const resumo = await resumoHex(token);
    const tamanho = validarSenha(senha);
    if (tamanho === 'senha-longa') return recusa('senha-longa');
    const pepper = this.pepper;
    const sessaoAntes = this.transacao(() => this.lerSessao(resumo));
    if (sessaoAntes === null) return recusa('sem-sessao');
    if (tamanho !== 'ok') return recusa('senha-errada');
    if (pepper === null) return recusa('nao-configurado');
    const guardado = this.senhaDaConta(sessaoAntes.conta.id);
    if (guardado === null || !(await this.confere(senha as string, guardado, pepper))) return recusa('senha-errada');
    return this.transacao((): { ok: true } | Falha => {
      const agora = this.senhaDaConta(guardado.id);
      if (agora === null || agora.hash !== guardado.hash) return recusa('senha-errada');
      if (this.lerSessao(resumo) === null) return recusa('sem-sessao');
      const id = guardado.id;
      this.moedas.zerar(id, `excluir:${id}`);
      this.sql.exec(
        'UPDATE contas SET email = NULL, nome = NULL, hash = NULL, sal = NULL, iteracoes = NULL, saldo = 0, excluida_em = ? WHERE id = ?',
        this.relogio(),
        id,
      );
      this.sql.exec('DELETE FROM sessoes WHERE conta = ?', id);
      this.sql.exec('DELETE FROM recuperacoes WHERE conta = ?', id);
      return { ok: true };
    });
  }

  /** Para os jogos: o `id` de quem tem este código de convidado e se ainda é convidado. `null` se não há conta ou foi excluída. */
  async contaDoCodigo(codigo: string): Promise<{ id: string; convidado: boolean } | null> {
    if (!ehCodigoDeConvidado(codigo)) return null;
    const id = await resumoHex(codigo);
    const linha = this.sql.exec('SELECT convidado FROM contas WHERE id = ? AND excluida_em IS NULL', id).toArray()[0];
    return linha === undefined ? null : { id, convidado: Number(linha.convidado) === 1 };
  }

  /**
   * Para os jogos limparem o que é só deles depois de uma exclusão feita por outro caminho (o portal): os `id`s das contas excluídas com
   * `excluida_em >= ms`, da mais antiga para a mais nova (desempate pelo `id`), até `limite` (1 a 500). `ate` é o `excluida_em` da última
   * devolvida, ou o próprio `ms` se não há nenhuma: quem varre guarda o `ate` e o passa como `ms` na vez seguinte. O `>=` repete as
   * últimas (apagar de novo não faz nada), mas nunca deixa uma exclusão do mesmo milissegundo para trás. Página cheia: chame de novo.
   */
  excluidasDesde(ms: number, limite: number): { ids: string[]; ate: number } {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError('ms precisa ser um inteiro de 0 em diante');
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > MAX_EXCLUIDAS_POR_CHAMADA) throw new RangeError(`limite precisa ser um inteiro de 1 a ${MAX_EXCLUIDAS_POR_CHAMADA}`);
    const linhas = this.sql.exec('SELECT id, excluida_em FROM contas WHERE excluida_em IS NOT NULL AND excluida_em >= ? ORDER BY excluida_em, id LIMIT ?', ms, limite).toArray();
    const ids = linhas.map((l) => String(l.id));
    const ultima = linhas.at(-1);
    return { ids, ate: ultima === undefined ? ms : Number(ultima.excluida_em) };
  }

  /**
   * Recuperação, passo 1. `null`: e-mail inválido, sem conta ou sem pepper (o HTTP responde igual, e nada é gravado: o link não teria
   * como ser usado, porque sem pepper a senha nova dá `nao-configurado`). Senão o e-mail e o link para mandar; pedir de novo invalida
   * os pedidos antigos da conta. O token só existe aqui e no link: o Banco guarda o resumo.
   */
  async pedirRecuperacao(email: unknown): Promise<{ para: string; link: string } | null> {
    const normalizado = normalizarEmail(email);
    if (this.pepper === null || normalizado === null || this.idDoEmail(normalizado) === null) return null;
    const token = tokenAleatorio(this.aleatorio);
    const resumo = await resumoHex(token);
    return this.transacao(() => {
      const id = this.idDoEmail(normalizado);
      if (id === null) return null;
      const agora = this.relogio();
      this.sql.exec('DELETE FROM recuperacoes WHERE conta = ? AND vence_em <= ?', id, agora);
      this.sql.exec('UPDATE recuperacoes SET usada = 1 WHERE conta = ?', id);
      this.sql.exec('INSERT INTO recuperacoes (hash, conta, vence_em, usada) VALUES (?, ?, ?, 0)', resumo, id, agora + VALIDADE_DA_RECUPERACAO_MS);
      return { para: normalizado, link: `${LINK_DE_NOVA_SENHA}${token}` };
    });
  }

  /**
   * Recuperação, passo 2: senha nova pelo token do link (uso único, 1 h). Numa transação: o hash novo, os pedidos da conta usados,
   * TODAS as sessões antigas apagadas e uma sessão nova aberta.
   */
  async novaSenha(token: unknown, senha: unknown): Promise<ComSessao> {
    if (typeof token !== 'string' || !FORMA_DO_TOKEN.test(token)) return recusa('link-vencido');
    const tamanho = validarSenha(senha);
    if (tamanho !== 'ok') return recusa(tamanho);
    const pepper = this.pepper;
    if (pepper === null) return recusa('nao-configurado');
    const resumoDoLink = await resumoHex(token);
    if (this.contaDoLink(resumoDoLink) === null) return recusa('link-vencido');

    const sal = this.aleatorio(TAMANHO_DO_SAL);
    const hash = await this.hash(senha as string, sal, pepper, ITERACOES);
    const sessao = await this.sessaoNova();
    return this.transacao((): ComSessao => {
      const id = this.contaDoLink(resumoDoLink);
      if (id === null) return recusa('link-vencido');
      this.sql.exec('UPDATE contas SET hash = ?, sal = ?, iteracoes = ? WHERE id = ?', bytesParaHex(hash), bytesParaHex(sal), ITERACOES, id);
      this.sql.exec('UPDATE recuperacoes SET usada = 1 WHERE conta = ?', id);
      this.sql.exec('DELETE FROM sessoes WHERE conta = ?', id);
      this.abrirSessao(id, sessao.resumo);
      return { ok: true, conta: this.contaPublica(id)!, token: sessao.token };
    });
  }

  /** O `id` da conta do link, se ele existe, não foi usado, não venceu e a conta não foi excluída. */
  private contaDoLink(resumo: string): string | null {
    const linha = this.sql
      .exec(
        `SELECT r.conta AS conta FROM recuperacoes r JOIN contas c ON c.id = r.conta
         WHERE r.hash = ? AND r.usada = 0 AND r.vence_em > ? AND c.excluida_em IS NULL AND c.email IS NOT NULL`,
        resumo,
        this.relogio(),
      )
      .toArray()[0];
    return linha === undefined ? null : String(linha.conta);
  }

  private idDoEmail(email: string): string | null {
    const linha = this.sql.exec('SELECT id FROM contas WHERE email = ? AND excluida_em IS NULL', email).toArray()[0];
    return linha === undefined ? null : String(linha.id);
  }

  /**
   * Por que não dá para criar agora (leitura só): e-mail usado, convidado que já é conta, ou o teto de contas. Dentro da transação
   * `conferirEmail` é falso: ali quem decide o e-mail é o UNIQUE, que vale mesmo se alguém entrar antes.
   */
  private recusaDeCriar(email: string, convidadoId: string | undefined, conferirEmail: boolean): ErroDeConta | null {
    if (conferirEmail && this.sql.exec('SELECT 1 AS x FROM contas WHERE email = ?', email).toArray().length > 0) return 'email-em-uso';
    if (convidadoId !== undefined) {
      const linha = this.sql.exec('SELECT convidado, excluida_em FROM contas WHERE id = ?', convidadoId).toArray()[0];
      if (linha !== undefined && (Number(linha.convidado) !== 1 || linha.excluida_em !== null)) return 'convidado-ja-e-conta';
      if (linha !== undefined) return null;
    }
    const total = Number(this.sql.exec('SELECT COUNT(*) AS n FROM contas WHERE excluida_em IS NULL').toArray()[0]?.n ?? 0);
    return total >= this.maxContas ? 'cheio' : null;
  }

  private senhaDoEmail(email: string): LinhaDeSenha | null {
    const id = this.idDoEmail(email);
    return id === null ? null : this.senhaDaConta(id);
  }

  private senhaDaConta(id: string): LinhaDeSenha | null {
    const linha = this.sql.exec('SELECT hash, sal, iteracoes FROM contas WHERE id = ? AND excluida_em IS NULL AND hash IS NOT NULL', id).toArray()[0];
    if (linha === undefined) return null;
    return { id, hash: String(linha.hash), sal: String(linha.sal), iteracoes: Number(linha.iteracoes) };
  }

  private async confere(senha: string, g: LinhaDeSenha, pepper: string): Promise<boolean> {
    const calculado = await this.hash(senha, hexParaBytes(g.sal), pepper, g.iteracoes);
    return iguaisEmTempoConstante(calculado, hexParaBytes(g.hash));
  }

  private async sessaoNova(): Promise<{ token: string; resumo: string }> {
    const token = tokenAleatorio(this.aleatorio);
    return { token, resumo: await resumoHex(token) };
  }

  private contaPublica(id: string): ContaPublica | null {
    const linha = this.sql.exec('SELECT nome, email, saldo FROM contas WHERE id = ? AND excluida_em IS NULL AND email IS NOT NULL', id).toArray()[0];
    if (linha === undefined) return null;
    return { id, nome: String(linha.nome), email: String(linha.email), saldo: Number(linha.saldo) };
  }

  /** Grava a sessão (só o resumo) e, passando de 20 na conta, tira as mais velhas. */
  private abrirSessao(conta: string, resumo: string): void {
    const agora = this.relogio();
    this.sql.exec('INSERT INTO sessoes (hash, conta, vence_em, criada_em) VALUES (?, ?, ?, ?)', resumo, conta, agora + VALIDADE_DA_SESSAO_MS, agora);
    const sobra = Number(this.sql.exec('SELECT COUNT(*) AS n FROM sessoes WHERE conta = ?', conta).toArray()[0]?.n ?? 0) - MAX_SESSOES_POR_CONTA;
    if (sobra > 0) {
      this.sql.exec('DELETE FROM sessoes WHERE hash IN (SELECT hash FROM sessoes WHERE conta = ? ORDER BY criada_em, rowid LIMIT ?)', conta, sobra);
    }
  }

  /** Dentro de uma transação: a conta da sessão (renovando se for o caso), ou `null` (apagando a sessão vencida ou órfã). */
  private lerSessao(resumo: string): { conta: ContaPublica; renovada: boolean } | null {
    const linha = this.sql.exec('SELECT conta, vence_em FROM sessoes WHERE hash = ?', resumo).toArray()[0];
    if (linha === undefined) return null;
    const agora = this.relogio();
    const venceEm = Number(linha.vence_em);
    const conta = venceEm > agora ? this.contaPublica(String(linha.conta)) : null;
    if (conta === null) {
      this.sql.exec('DELETE FROM sessoes WHERE hash = ?', resumo);
      return null;
    }
    const renovada = agora - (venceEm - VALIDADE_DA_SESSAO_MS) > RENOVAR_DEPOIS_DE_MS;
    if (renovada) this.sql.exec('UPDATE sessoes SET vence_em = ? WHERE hash = ?', agora + VALIDADE_DA_SESSAO_MS, resumo);
    return { conta, renovada };
  }
}
