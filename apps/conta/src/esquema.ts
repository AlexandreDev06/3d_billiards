import type { SqlMinimo } from './sql';

export const VERSAO_DO_ESQUEMA = 1;

/** Um comando por item (o SQLite do Durable Object e o `node:sqlite` preparam um por vez). */
export const COMANDOS_DO_ESQUEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS contas (id TEXT PRIMARY KEY, email TEXT UNIQUE, nome TEXT, hash TEXT, sal TEXT, iteracoes INTEGER,
  convidado INTEGER NOT NULL, saldo INTEGER NOT NULL, criada_em INTEGER NOT NULL, excluida_em INTEGER)`,
  // só as excluídas (poucas) entram: a varredura dos jogos (`excluidasDesde`) não lê as 50 000 contas a cada vez
  `CREATE INDEX IF NOT EXISTS contas_excluida_em ON contas(excluida_em) WHERE excluida_em IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS sessoes (hash TEXT PRIMARY KEY, conta TEXT NOT NULL, vence_em INTEGER NOT NULL, criada_em INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessoes_conta ON sessoes(conta)`,
  `CREATE TABLE IF NOT EXISTS recuperacoes (hash TEXT PRIMARY KEY, conta TEXT NOT NULL, vence_em INTEGER NOT NULL, usada INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS operacoes (chave TEXT PRIMARY KEY, assinatura TEXT NOT NULL, resultado TEXT NOT NULL, em INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS livro (chave TEXT NOT NULL, conta TEXT NOT NULL, delta INTEGER NOT NULL, jogo TEXT NOT NULL, motivo TEXT NOT NULL,
  em INTEGER NOT NULL, PRIMARY KEY (chave, conta))`,
  `CREATE TABLE IF NOT EXISTS reservas (chave TEXT NOT NULL, conta TEXT NOT NULL, valor INTEGER NOT NULL, em INTEGER NOT NULL, PRIMARY KEY (chave, conta))`,
  `CREATE INDEX IF NOT EXISTS reservas_em ON reservas(em)`,
  `CREATE TABLE IF NOT EXISTS baldes (chave TEXT PRIMARY KEY, fichas REAL NOT NULL, atualizado_em INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS baldes_atualizado ON baldes(atualizado_em)`,
];

export function criarEsquema(sql: SqlMinimo): void {
  for (const comando of COMANDOS_DO_ESQUEMA) sql.exec(comando);
}
