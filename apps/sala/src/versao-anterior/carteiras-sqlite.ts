/* eslint-disable */
// @ts-nocheck
/**
 * CÓPIA CONGELADA (L47b) da versão ANTERIOR ao L47, tirada do índice do git (`git show :apps/sala/src/carteiras-sqlite.ts`); só os imports mudaram (`./` virou `../`).
 * NÃO EDITE e não importe fora de `*.test.ts`: serve para os testes provarem que o que a versão nova grava, a anterior ainda lê sem descartar
 * nem mudar uma carteira (o caminho de volta, `wrangler rollback` ou a sala Node velha). Apague quando não houver mais versão publicada
 * anterior a esta para voltar.
 */
/**
 * As carteiras no armazenamento SQLite de um Durable Object (L41): o núcleo (`CarteirasBase`, carteiras-base.ts) mais uma tabela com
 * uma linha por carteira (o `id` SHA-256 e o mesmo JSON que a sala Node guarda em `carteiras.json`). A memória continua sendo a
 * verdade enquanto o objeto está acordado; cada mudança vai à tabela na hora, de forma síncrona e numa transação só (tudo ou nada: as
 * carteiras que uma mudança tocou entram juntas ou nenhuma), então não há atraso de gravação nem `descarregar()`: o objeto pode ser
 * despejado a qualquer instante sem perder nada que o cliente já viu confirmado.
 *
 * Não importa nada da Cloudflare: o SQL e a transação chegam por `SqlMinimo`/`transacao` (no Worker, `ctx.storage.sql` e
 * `ctx.storage.transactionSync`; nos testes, `node:sqlite`). Nunca loga código nem `id`.
 */
import { CarteirasBase, ID_VALIDO, guardadaValida, type OpcoesDasCarteiras } from './carteiras-base';

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
      if (motivo === null && lida !== null) this.carteiras.set(id, lida.carteira);
      else ruins.push({ id, dados, motivo: motivo ?? 'forma-invalida' });
    }
    if (ruins.length === 0) return;
    this.transacao(() => {
      for (const r of ruins) {
        this.executar('INSERT INTO carteiras_descartadas (id, dados, motivo, em) VALUES (?, ?, ?, ?)', r.id, r.dados, r.motivo, this.opcoes.relogio());
        this.executar('DELETE FROM carteiras WHERE id = ?', r.id);
      }
    });
    this.opcoes.log('carteiras-descartadas', { descartadas: ruins.length, mantidas: this.carteiras.size });
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
          if (c) this.executar(UPSERT, id, JSON.stringify(c));
          else this.executar('DELETE FROM carteiras WHERE id = ?', id);
        }
      });
      for (const id of ids) this.sujas.delete(id);
    } catch (e) {
      this.contadores.gravacoesFalhas++;
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
