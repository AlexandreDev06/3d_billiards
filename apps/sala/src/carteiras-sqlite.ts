/**
 * As carteiras no armazenamento SQLite de um Durable Object (L41): o núcleo (`CarteirasBase`, carteiras-base.ts) mais uma tabela com
 * uma linha por carteira (o `id` SHA-256 e o mesmo JSON que a sala Node guarda em `carteiras.json`) e, desde o L47b, outra, `carteiras_balao`,
 * com o balão (itens e aparência) pela chave da carteira. O balão NUNCA vai na linha da carteira: a versão anterior da sala descarta a
 * carteira que traz uma chave que ela não conhece, e com o balão à parte o `wrangler rollback` só o ignora (e a versão nova, ao voltar, o
 * encontra). O mesmo vale para a marca de carteira de conta (L61): a tabela `carteiras_da_conta` só tem o `id`. O saldo e o item de uma compra vão nas duas tabelas na MESMA transação. A memória continua sendo a
 * verdade enquanto o objeto está acordado; cada mudança vai à tabela na hora, de forma síncrona e numa transação só (tudo ou nada: as
 * carteiras que uma mudança tocou entram juntas ou nenhuma), então não há atraso de gravação nem `descarregar()`: o objeto pode ser
 * despejado a qualquer instante sem perder nada que o cliente já viu confirmado.
 *
 * Não importa nada da Cloudflare: o SQL e a transação chegam por `SqlMinimo`/`transacao` (no Worker, `ctx.storage.sql` e
 * `ctx.storage.transactionSync`; nos testes, `node:sqlite`). Nunca loga código nem `id`.
 */
import { entradaMortaValida, entradaValida, type EntradaDaCaixa, type EntradaMorta } from './caixa-do-banco';
import { compraPendenteValida, type CompraPendente } from './compras-pendentes';
import { CarteirasBase, ID_VALIDO, aplicarBaloes, aplicarDaConta, guardadaValida, linhaDaCarteira, type CarteiraDescartada, type OpcoesDasCarteiras } from './carteiras-base';

/** O cursor que `SqlStorage.exec` devolve: só o que se usa aqui. `rowsRead` e `rowsWritten` valem depois de consumido. */
export interface CursorMinimo {
  toArray(): Record<string, unknown>[];
  readonly rowsRead: number;
  readonly rowsWritten: number;
}

export interface SqlMinimo {
  exec(consulta: string, ...ligacoes: (string | number | null)[]): CursorMinimo;
}

export interface OpcoesDoSqlite extends OpcoesDasCarteiras {
  readonly sql: SqlMinimo;
  /** Roda `fn` numa transação síncrona: se lançar, nada do que ela escreveu fica. */
  readonly transacao: <T>(fn: () => T) => T;
}

/** O formato guardado na tabela: o mesmo do arquivo da sala Node (`VERSAO_DO_ARQUIVO`). Formato desconhecido (mais novo) não abre. */
const FORMATO = '2';

const UPSERT = 'INSERT INTO carteiras (id, dados) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET dados = excluded.dados';
const UPSERT_DA_SAIDA =
  'INSERT INTO saida_do_banco (ordem, op, tentativas, criada_em) VALUES (?, ?, ?, ?) ON CONFLICT(ordem) DO UPDATE SET op = excluded.op, tentativas = excluded.tentativas';
const UPSERT_DA_MORTA =
  'INSERT INTO saida_morta (ordem, op, tentativas, criada_em, morreu_em, erro) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(ordem) DO UPDATE SET op = excluded.op, tentativas = excluded.tentativas, morreu_em = excluded.morreu_em, erro = excluded.erro';
/** O instante em que o congelamento das carteiras vence (L60b), em `carteiras_meta`. */
const CHAVE_DO_CONGELAMENTO = 'congelada_ate';
/** Onde a varredura das contas excluídas pelo portal parou (L61), em `carteiras_meta`; gravado com as exclusões que ele cobre (L61b). */
const CHAVE_DA_VARREDURA = 'excluidas_ate';
const UPSERT_DA_COMPRA =
  'INSERT INTO compras_pendentes (chave, id, tipo, item, preco, criada_em) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(chave) DO UPDATE SET id = excluded.id, tipo = excluded.tipo, item = excluded.item, preco = excluded.preco';
const GRAVAR_DA_CONTA = 'INSERT OR IGNORE INTO carteiras_da_conta (id) VALUES (?)';
const UPSERT_DO_BALAO = 'INSERT INTO carteiras_balao (id, dados) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET dados = excluded.dados';

/** O que o armazenamento custou desde que o objeto acordou, para conferir contra o plano gratuito (100 000 linhas escritas por dia). */
export interface ContadoresDoSqlite {
  linhasLidas: number;
  linhasEscritas: number;
  gravacoesFalhas: number;
}

export class CarteirasNoDO extends CarteirasBase {
  readonly contadores: ContadoresDoSqlite = { linhasLidas: 0, linhasEscritas: 0, gravacoesFalhas: 0 };
  private readonly sql: SqlMinimo;
  private readonly transacao: <T>(fn: () => T) => T;
  /** As carteiras que têm uma linha em `carteiras_balao`: só quem tem precisa de um DELETE quando o balão some (a importação troca tudo). */
  private readonly comBalaoNoBanco = new Set<string>();
  /** As carteiras que têm uma linha em `carteiras_da_conta` (L61): só a carteira que sai precisa de um DELETE. */
  private readonly daContaNoBanco = new Set<string>();

  constructor(opcoes: OpcoesDoSqlite) {
    super(opcoes);
    this.sql = opcoes.sql;
    this.transacao = opcoes.transacao;
    this.rastreiaSujas = true;
    if (this.caixa) this.caixa.rastreiaSujas = true;
    if (this.compras) this.compras.rastreiaSujas = true;
    this.criarEsquema();
    this.carregar();
    this.carregarAsDeConta();
    this.carregarOsExcluidos();
    this.ateDaVarredura = Number(this.executar('SELECT valor FROM carteiras_meta WHERE chave = ?', CHAVE_DA_VARREDURA)[0]?.valor ?? 0) || 0;
    this.carregarOCongelamento();
    this.carregarASaida();
    this.carregarAsMortas();
    this.carregarAsCompras();
    this.carregarAsApostasAbertas();
    this.cutucarACaixa();
  }

  private executar(consulta: string, ...ligacoes: (string | number | null)[]): Record<string, unknown>[] {
    const cursor = this.sql.exec(consulta, ...ligacoes);
    const linhas = cursor.toArray();
    this.contadores.linhasLidas += cursor.rowsRead;
    this.contadores.linhasEscritas += cursor.rowsWritten;
    return linhas;
  }

  private criarEsquema(): void {
    this.executar('CREATE TABLE IF NOT EXISTS carteiras (id TEXT PRIMARY KEY, dados TEXT NOT NULL) WITHOUT ROWID');
    this.executar('CREATE TABLE IF NOT EXISTS carteiras_descartadas (id TEXT NOT NULL, dados TEXT NOT NULL, motivo TEXT NOT NULL, em INTEGER NOT NULL)');
    this.executar('CREATE TABLE IF NOT EXISTS carteiras_balao (id TEXT PRIMARY KEY, dados TEXT NOT NULL) WITHOUT ROWID');
    // L61: as carteiras que só abrem com a sessão da conta; à parte da linha da carteira (a versão anterior descarta a linha com chave a mais)
    this.executar('CREATE TABLE IF NOT EXISTS carteiras_da_conta (id TEXT PRIMARY KEY) WITHOUT ROWID');
    // L61b: o registro dos excluídos (nunca encolhe) e as marcas `daConta` que falharam e esperam nova tentativa; tabelas à parte, a versão anterior as ignora
    this.executar('CREATE TABLE IF NOT EXISTS contas_excluidas (id TEXT PRIMARY KEY, em INTEGER NOT NULL) WITHOUT ROWID');
    this.executar('CREATE TABLE IF NOT EXISTS marcas_pendentes (id TEXT PRIMARY KEY) WITHOUT ROWID');
    // A caixa de saída do saldo (L57) só existe com `SALDO_NO_BANCO=1`; desligado, o esquema é o de sempre
    if (this.caixa) this.executar('CREATE TABLE IF NOT EXISTS saida_do_banco (ordem INTEGER PRIMARY KEY, op TEXT NOT NULL, tentativas INTEGER NOT NULL, criada_em INTEGER NOT NULL)');
    // As operações mortas (L60b) e as apostas abertas (L60b), pela mesma razão: só com a chave ligada
    if (this.caixa) {
      this.executar('CREATE TABLE IF NOT EXISTS saida_morta (ordem INTEGER PRIMARY KEY, op TEXT NOT NULL, tentativas INTEGER NOT NULL, criada_em INTEGER NOT NULL, morreu_em INTEGER NOT NULL, erro TEXT NOT NULL)');
      this.executar('CREATE TABLE IF NOT EXISTS apostas_abertas (chave TEXT PRIMARY KEY) WITHOUT ROWID');
    }
    // As compras pendentes (L59), pela mesma razão: só com a chave ligada
    if (this.compras) this.executar('CREATE TABLE IF NOT EXISTS compras_pendentes (chave TEXT PRIMARY KEY, id TEXT NOT NULL, tipo TEXT NOT NULL, item TEXT NOT NULL, preco INTEGER NOT NULL, criada_em INTEGER NOT NULL)');
    this.executar('CREATE TABLE IF NOT EXISTS carteiras_meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL) WITHOUT ROWID');
    const formato = this.executar("SELECT valor FROM carteiras_meta WHERE chave = 'formato'")[0]?.valor;
    if (formato === undefined) this.executar("INSERT INTO carteiras_meta (chave, valor) VALUES ('formato', ?)", FORMATO);
    else if (formato !== FORMATO) throw new Error(`carteiras: o armazenamento está no formato ${String(formato)}, que esta versão não abre (a dela é o ${FORMATO}); nada foi lido nem escrito`);
  }

  /**
   * Lê as carteiras guardadas. Linha que não presta (JSON quebrado ou forma errada) não derruba as outras e nunca se perde: vai
   * para `carteiras_descartadas` com o motivo e sai da tabela principal, e o log diz quantas.
   */
  private carregar(): void {
    const linhas = this.executar('SELECT id, dados FROM carteiras');
    const ruins: { id: string; dados: string; motivo: string }[] = [];
    const linhasComBalao = new Set<string>();
    for (const { id, dados } of linhas) {
      if (typeof id !== 'string' || typeof dados !== 'string') continue;
      let bruto: unknown;
      let motivo: string | null = null;
      try {
        bruto = JSON.parse(dados);
      } catch {
        motivo = 'json-quebrado';
      }
      // a tabela só guarda o formato atual: uma linha no formato de antes (`skins`) não tem como ganhar semente aqui, então não vale
      let lida: ReturnType<typeof guardadaValida> = null;
      if (motivo === null) {
        try {
          lida = guardadaValida(bruto, () => {
            throw new RangeError('formato-antigo');
          });
        } catch {
          lida = null;
        }
      }
      if (motivo === null && lida === null) motivo = 'forma-invalida';
      if (motivo === null && !ID_VALIDO.test(id)) motivo = 'id-invalido';
      if (motivo === null && lida !== null) {
        this.carteiras.set(id, lida.carteira);
        if (lida.carteira.balao) linhasComBalao.add(id);
      } else ruins.push({ id, dados, motivo: motivo ?? 'forma-invalida' });
    }
    const baloesRuins = this.carregarBaloes();
    if (ruins.length > 0 || baloesRuins.length > 0) {
      this.transacao(() => {
        for (const r of ruins) {
          this.executar('INSERT INTO carteiras_descartadas (id, dados, motivo, em) VALUES (?, ?, ?, ?)', r.id, r.dados, r.motivo, this.opcoes.relogio());
          this.executar('DELETE FROM carteiras WHERE id = ?', r.id);
        }
        for (const r of baloesRuins) {
          this.executar('INSERT INTO carteiras_descartadas (id, dados, motivo, em) VALUES (?, ?, ?, ?)', r.id, r.dados, r.motivo, this.opcoes.relogio());
          this.executar('DELETE FROM carteiras_balao WHERE id = ?', r.id);
        }
      });
      this.opcoes.log('carteiras-descartadas', { descartadas: ruins.length, baloes: baloesRuins.length, mantidas: this.carteiras.size });
    }
    // O balão que uma linha ainda trazia (só o L47, que nunca foi publicado) passa para a tabela dele na hora: é o único caso em que abrir grava
    for (const id of linhasComBalao) this.marcar(id);
    this.persistir();
  }

  /**
   * Lê a caixa de saída do saldo (L57). Linha que não presta (JSON quebrado, forma errada) NÃO é enviada nem apagada: fica na tabela
   * para alguém olhar, e o log diz quantas. A próxima ordem passa da maior que a tabela tem, inclusive a dessas.
   */
  private carregarASaida(): void {
    if (!this.caixa) return;
    const entradas: EntradaDaCaixa[] = [];
    let maior = 0;
    let invalidas = 0;
    for (const l of this.executar('SELECT ordem, op, tentativas, criada_em FROM saida_do_banco ORDER BY ordem')) {
      if (typeof l.ordem === 'number') maior = Math.max(maior, l.ordem);
      let op: unknown;
      try {
        op = JSON.parse(String(l.op));
      } catch {
        op = null;
      }
      const entrada = entradaValida({ ordem: l.ordem, op, tentativas: l.tentativas, criadaEm: l.criada_em });
      if (entrada) entradas.push(entrada);
      else invalidas++;
    }
    this.caixa.carregar(entradas, maior);
    this.linhasInvalidasNoArmazenamento += invalidas;
    if (invalidas > 0) this.opcoes.log('saida-invalida', { entradas: invalidas });
  }

  /** Lê `carteiras_da_conta` (L61) e marca as carteiras que existem. Id de carteira que não está mais na tabela principal é deixado como está. */
  private carregarAsDeConta(): void {
    const ids: string[] = [];
    for (const { id } of this.executar('SELECT id FROM carteiras_da_conta')) if (typeof id === 'string') ids.push(id);
    aplicarDaConta(ids, this.carteiras);
    for (const id of ids) if (this.carteiras.get(id)?.daConta) this.daContaNoBanco.add(id);
  }

  /** Lê `contas_excluidas` e `marcas_pendentes` (L61b). Linha que não é um `id` é ignorada. */
  private carregarOsExcluidos(): void {
    const excluidas: string[] = [];
    for (const { id } of this.executar('SELECT id FROM contas_excluidas')) if (typeof id === 'string') excluidas.push(id);
    const pendentes: string[] = [];
    for (const { id } of this.executar('SELECT id FROM marcas_pendentes')) if (typeof id === 'string') pendentes.push(id);
    this.carregarContas(excluidas, pendentes);
  }

  /** Lê `saida_morta` (L60b): fora da fila até alguém reenviar (`POST /admin/reenviar-mortas`). Linha que não presta fica onde está e o log diz quantas. */
  private carregarAsMortas(): void {
    if (!this.caixa) return;
    const lidas: EntradaMorta[] = [];
    let maior = 0;
    let invalidas = 0;
    for (const l of this.executar('SELECT ordem, op, tentativas, criada_em, morreu_em, erro FROM saida_morta ORDER BY ordem')) {
      if (typeof l.ordem === 'number') maior = Math.max(maior, l.ordem);
      let op: unknown;
      try {
        op = JSON.parse(String(l.op));
      } catch {
        op = null;
      }
      const morta = entradaMortaValida({ ordem: l.ordem, op, tentativas: l.tentativas, criadaEm: l.criada_em, morreuEm: l.morreu_em, erro: l.erro });
      if (morta) lidas.push(morta);
      else invalidas++;
    }
    this.caixa.carregarMortas(lidas, maior);
    if (lidas.length > 0 || invalidas > 0) this.opcoes.log('saida-morta', { entradas: lidas.length, invalidas });
  }

  /** Lê as apostas abertas (L60b): o objeto reiniciou, as salas sumiram, e cada uma ganha um `devolver` na caixa (em `cutucarACaixa`). */
  private carregarAsApostasAbertas(): void {
    if (!this.caixa) return;
    const chaves: string[] = [];
    for (const l of this.executar('SELECT chave FROM apostas_abertas')) if (typeof l.chave === 'string') chaves.push(l.chave);
    this.carregarApostasAbertas(chaves);
    // a linha que não é texto não pode ser devolvida nem fica para sempre: some junto com as outras na primeira gravação
  }

  private carregarOCongelamento(): void {
    const valor = this.executar('SELECT valor FROM carteiras_meta WHERE chave = ?', CHAVE_DO_CONGELAMENTO)[0]?.valor;
    if (typeof valor === 'string') this.restaurarCongelamento(Number(valor));
  }

  /** O congelamento vai ao `carteiras_meta` na hora (a rota só responde `ok` depois): uma publicação que reinicia o objeto o encontra. Lança se a gravação falhar. */
  protected override gravarCongelamento(ate: number): void {
    if (ate > 0) this.executar('INSERT INTO carteiras_meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', CHAVE_DO_CONGELAMENTO, String(ate));
    else this.executar('DELETE FROM carteiras_meta WHERE chave = ?', CHAVE_DO_CONGELAMENTO);
  }

  /** Lê as compras pendentes (L59). Linha que não presta NÃO é conferida nem apagada: fica na tabela para alguém olhar, e o log diz quantas. */
  private carregarAsCompras(): void {
    if (!this.compras) return;
    const lidas: CompraPendente[] = [];
    let invalidas = 0;
    for (const l of this.executar('SELECT chave, id, tipo, item, preco, criada_em FROM compras_pendentes ORDER BY criada_em, chave')) {
      const p = compraPendenteValida({ chave: l.chave, id: l.id, tipo: l.tipo, item: l.item, preco: l.preco, criadaEm: l.criada_em });
      if (p) lidas.push(p);
      else invalidas++;
    }
    this.compras.carregar(lidas);
    this.linhasInvalidasNoArmazenamento += invalidas;
    if (invalidas > 0) this.opcoes.log('compras-pendentes-invalidas', { entradas: invalidas });
  }

  /**
   * Lê `carteiras_balao` e põe o balão em cada carteira que existe. Linha de carteira que não está mais na tabela principal é deixada
   * como está (o balão de quem saiu não volta, e nada é apagado); linha cujo JSON não se lê devolve para ir a `carteiras_descartadas`.
   */
  private carregarBaloes(): { id: string; dados: string; motivo: string }[] {
    const lidos: [string, unknown][] = [];
    const ruins: { id: string; dados: string; motivo: string }[] = [];
    for (const { id, dados } of this.executar('SELECT id, dados FROM carteiras_balao')) {
      if (typeof id !== 'string' || typeof dados !== 'string' || !this.carteiras.has(id)) continue;
      try {
        lidos.push([id, JSON.parse(dados)]);
        this.comBalaoNoBanco.add(id);
      } catch {
        ruins.push({ id, dados, motivo: 'balao-json-quebrado' });
      }
    }
    aplicarBaloes(lidos, this.carteiras);
    return ruins;
  }

  /**
   * Leva à tabela as carteiras que mudaram (ou saíram), numa transação. Se falhar (cota de linhas escritas do dia, disco), a mudança
   * continua valendo na memória, o log avisa e os ids ficam pendentes: a próxima mudança, ou `tentarPendentes()`, tenta de novo.
   */
  protected persistir(): void {
    const ordens = this.caixa ? [...this.caixa.sujas] : [];
    const ordensMortas = this.caixa ? [...this.caixa.mortasSujas] : [];
    const chavesDeCompra = this.compras ? [...this.compras.sujas] : [];
    const chavesDeAposta = [...this.apostasSujas];
    const excluidasSujas = [...this.excluidasSujas];
    const marcasSujas = [...this.marcasSujas];
    const ateSujo = this.ateSujo;
    if (this.sujas.size === 0 && ordens.length === 0 && ordensMortas.length === 0 && chavesDeCompra.length === 0 && chavesDeAposta.length === 0 && excluidasSujas.length === 0 && marcasSujas.length === 0 && !ateSujo) return;
    const ids = [...this.sujas];
    try {
      this.transacao(() => {
        // a caixa de saída vai na mesma transação do saldo: uma operação nunca fica sem o saldo que a gerou, nem o saldo sem ela
        for (const ordem of ordens) {
          const e = this.caixa!.buscar(ordem);
          if (e) this.executar(UPSERT_DA_SAIDA, e.ordem, JSON.stringify(e.op), e.tentativas, e.criadaEm);
          else this.executar('DELETE FROM saida_do_banco WHERE ordem = ?', ordem);
        }
        // a operação que morreu sai de `saida_do_banco` e entra em `saida_morta` na mesma transação (e a que volta, o contrário)
        for (const ordem of ordensMortas) {
          const m = this.caixa!.buscarMorta(ordem);
          if (m) this.executar(UPSERT_DA_MORTA, m.ordem, JSON.stringify(m.op), m.tentativas, m.criadaEm, m.morreuEm, m.erro);
          else this.executar('DELETE FROM saida_morta WHERE ordem = ?', ordem);
        }
        // a chave da aposta aberta vai junto com a operação `reservar` (e sai junto com o `liquidar` ou o `devolver`)
        for (const chave of chavesDeAposta) {
          if (this.apostasAbertas.has(chave)) this.executar('INSERT OR IGNORE INTO apostas_abertas (chave) VALUES (?)', chave);
          else this.executar('DELETE FROM apostas_abertas WHERE chave = ?', chave);
        }
        // a pendência de uma compra também: o débito nunca é pedido sem ela gravada, e o item sai da tabela junto com a pendência
        for (const chave of chavesDeCompra) {
          const p = this.compras!.buscar(chave);
          if (p) this.executar(UPSERT_DA_COMPRA, p.chave, p.id, p.tipo, p.item, p.preco, p.criadaEm);
          else this.executar('DELETE FROM compras_pendentes WHERE chave = ?', chave);
        }
        // o registro dos excluídos vai na MESMA transação que apaga a carteira: a conta nunca fica apagada sem constar, nem constando com a carteira viva
        for (const id of excluidasSujas) this.executar('INSERT OR IGNORE INTO contas_excluidas (id, em) VALUES (?, ?)', id, this.opcoes.relogio());
        if (ateSujo) this.executar('INSERT INTO carteiras_meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', CHAVE_DA_VARREDURA, String(this.ateDaVarredura));
        for (const id of marcasSujas) {
          if (this.marcasPendentes.has(id)) this.executar('INSERT OR IGNORE INTO marcas_pendentes (id) VALUES (?)', id);
          else this.executar('DELETE FROM marcas_pendentes WHERE id = ?', id);
        }
        for (const id of ids) {
          const c = this.carteiras.get(id);
          // a carteira e o balão dela vão na mesma transação: o desconto de uma compra nunca chega sem o item, nem o item sem o desconto
          if (c) this.executar(UPSERT, id, JSON.stringify(linhaDaCarteira(c)));
          else this.executar('DELETE FROM carteiras WHERE id = ?', id);
          if (c?.balao) this.executar(UPSERT_DO_BALAO, id, JSON.stringify(c.balao));
          else if (this.comBalaoNoBanco.has(id)) this.executar('DELETE FROM carteiras_balao WHERE id = ?', id);
          // a marca de conta vai na mesma transação da carteira: a carteira nunca fica sem a marca (o código abriria a conta) nem a marca sem a carteira
          if (c?.daConta === true && !this.daContaNoBanco.has(id)) this.executar(GRAVAR_DA_CONTA, id);
          else if (c?.daConta !== true && this.daContaNoBanco.has(id)) this.executar('DELETE FROM carteiras_da_conta WHERE id = ?', id);
        }
      });
      for (const ordem of ordens) this.caixa!.sujas.delete(ordem);
      for (const ordem of ordensMortas) this.caixa!.mortasSujas.delete(ordem);
      for (const chave of chavesDeAposta) this.apostasSujas.delete(chave);
      for (const chave of chavesDeCompra) this.compras!.sujas.delete(chave);
      for (const id of excluidasSujas) this.excluidasSujas.delete(id);
      for (const id of marcasSujas) this.marcasSujas.delete(id);
      if (ateSujo) this.ateSujo = false;
      for (const id of ids) {
        this.sujas.delete(id);
        if (this.carteiras.get(id)?.balao) this.comBalaoNoBanco.add(id);
        else this.comBalaoNoBanco.delete(id);
        if (this.carteiras.get(id)?.daConta) this.daContaNoBanco.add(id);
        else this.daContaNoBanco.delete(id);
      }
    } catch (e) {
      this.contadores.gravacoesFalhas++;
      this.opcoes.log('carteiras-gravacao-falhou', { pendentes: this.sujas.size, erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }

  /** As linhas de `carteiras_descartadas`, da mais antiga para a mais nova (o que a leitura não aceitou, guardado como estava). */
  override descartadas(): readonly CarteiraDescartada[] {
    return this.executar('SELECT id, dados, motivo, em FROM carteiras_descartadas ORDER BY em, rowid').flatMap((l) =>
      typeof l.id === 'string' && typeof l.dados === 'string' && typeof l.motivo === 'string' && typeof l.em === 'number' ? [{ id: l.id, dados: l.dados, motivo: l.motivo, em: l.em }] : [],
    );
  }

  /** A carteira voltou: sai da lista de descartadas, mas só depois de ter chegado à tabela (uma gravação pendente deixa a cópia onde está). */
  protected override aoRestaurar(ids: readonly string[]): void {
    const gravadas = ids.filter((id) => !this.sujas.has(id));
    if (gravadas.length === 0) return;
    try {
      this.transacao(() => {
        for (const id of gravadas) this.executar('DELETE FROM carteiras_descartadas WHERE id = ?', id);
      });
    } catch (e) {
      this.opcoes.log('carteiras-gravacao-falhou', { pendentes: this.sujas.size, erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }

  /** Quantas carteiras mudaram na memória e ainda não chegaram à tabela (uma gravação falhou). */
  get pendentes(): number {
    return this.sujas.size + (this.caixa?.sujas.size ?? 0) + (this.caixa?.mortasSujas.size ?? 0) + this.apostasSujas.size + (this.compras?.sujas.size ?? 0) + this.excluidasSujas.size + this.marcasSujas.size + (this.ateSujo ? 1 : 0);
  }

  /** O objeto chama isto de tempos em tempos: tenta de novo o que uma gravação anterior não conseguiu levar. */
  tentarPendentes(): void {
    this.persistir();
  }
}
