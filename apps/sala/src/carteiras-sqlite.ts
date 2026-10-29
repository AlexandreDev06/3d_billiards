/**
 * As carteiras no armazenamento SQLite de um Durable Object (L41): o núcleo (`CarteirasBase`, carteiras-base.ts) mais uma tabela com
 * uma linha por carteira (o `id` SHA-256 e o mesmo JSON que a sala Node guarda em `carteiras.json`) e, desde o L47b, outra, `carteiras_balao`,
 * com o balão (itens e aparência) pela chave da carteira. O balão NUNCA vai na linha da carteira: a versão anterior da sala descarta a
 * carteira que traz uma chave que ela não conhece, e com o balão à parte o `wrangler rollback` só o ignora (e a versão nova, ao voltar, o
 * encontra). O saldo e o item de uma compra vão nas duas tabelas na MESMA transação. A memória continua sendo a
 * verdade enquanto o objeto está acordado; cada mudança vai à tabela na hora, de forma síncrona e numa transação só (tudo ou nada: as
 * carteiras que uma mudança tocou entram juntas ou nenhuma), então não há atraso de gravação nem `descarregar()`: o objeto pode ser
 * despejado a qualquer instante sem perder nada que o cliente já viu confirmado.
 *
 * Não importa nada da Cloudflare: o SQL e a transação chegam por `SqlMinimo`/`transacao` (no Worker, `ctx.storage.sql` e
 * `ctx.storage.transactionSync`; nos testes, `node:sqlite`). Nunca loga código nem `id`.
 */
import { CarteirasBase, ID_VALIDO, aplicarBaloes, guardadaValida, linhaDaCarteira, type CarteiraDescartada, type OpcoesDasCarteiras } from './carteiras-base';

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

  constructor(opcoes: OpcoesDoSqlite) {
    super(opcoes);
    this.sql = opcoes.sql;
    this.transacao = opcoes.transacao;
    this.rastreiaSujas = true;
    this.criarEsquema();
    this.carregar();
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
    if (this.sujas.size === 0) return;
    const ids = [...this.sujas];
    try {
      this.transacao(() => {
        for (const id of ids) {
          const c = this.carteiras.get(id);
          // a carteira e o balão dela vão na mesma transação: o desconto de uma compra nunca chega sem o item, nem o item sem o desconto
          if (c) this.executar(UPSERT, id, JSON.stringify(linhaDaCarteira(c)));
          else this.executar('DELETE FROM carteiras WHERE id = ?', id);
          if (c?.balao) this.executar(UPSERT_DO_BALAO, id, JSON.stringify(c.balao));
          else if (this.comBalaoNoBanco.has(id)) this.executar('DELETE FROM carteiras_balao WHERE id = ?', id);
        }
      });
      for (const id of ids) {
        this.sujas.delete(id);
        if (this.carteiras.get(id)?.balao) this.comBalaoNoBanco.add(id);
        else this.comBalaoNoBanco.delete(id);
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
    return this.sujas.size;
  }

  /** O objeto chama isto de tempos em tempos: tenta de novo o que uma gravação anterior não conseguiu levar. */
  tentarPendentes(): void {
    this.persistir();
  }
}
