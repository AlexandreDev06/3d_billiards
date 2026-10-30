import type { SqlMinimo } from './sql';

const DIA_MS = 24 * 3600_000;
/** Quantas linhas velhas `limparBaldesAntigos` apaga por chamada. */
export const LIMPAR_NO_MAXIMO = 50;

/**
 * Balde de fichas por chave guardado no SQLite do objeto: sobrevive ao despejo do Durable Object. A conta é a de `BaldeDeTokens`
 * (`capacidade` de rajada, `porSegundo` de reposição, relógio injetado em ms). Uma linha por chave em `baldes`, com `nome:chave` como
 * chave; a chave que ninguém gastou ainda nem tem linha (vale o balde cheio). Recusa não escreve nada: a reposição sai da linha
 * antiga. Síncrono, sem `await`: dentro do objeto cada chamada é atômica.
 */
export class BaldesNoSql {
  constructor(
    private readonly sql: SqlMinimo,
    private readonly nome: string,
    private readonly capacidade: number,
    private readonly porSegundo: number,
    private readonly agora: () => number,
  ) {
    // `limparBaldesAntigos` só apaga linha de mais de 1 dia, e isso só é seguro se todo balde já voltou a encher nesse tempo.
    if (!(porSegundo > 0) || (capacidade / porSegundo) * 1000 > DIA_MS) throw new RangeError(`balde ${nome}: a reposição passa de 1 dia`);
  }

  tentar(chave: string, custo = 1): boolean {
    const linhaId = `${this.nome}:${chave}`;
    const t = this.agora();
    const linha = this.sql.exec('SELECT fichas, atualizado_em FROM baldes WHERE chave = ?', linhaId).toArray()[0];
    let fichas = this.capacidade;
    if (linha !== undefined) {
      const antes = Number(linha.atualizado_em);
      fichas = Math.min(this.capacidade, Number(linha.fichas) + (t > antes ? ((t - antes) / 1000) * this.porSegundo : 0));
    }
    if (fichas < custo) return false;
    this.sql.exec(
      'INSERT INTO baldes (chave, fichas, atualizado_em) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET fichas = excluded.fichas, atualizado_em = excluded.atualizado_em',
      linhaId,
      fichas - custo,
      t,
    );
    return true;
  }
}

/** Apaga, das mais velhas para as mais novas, até `max` linhas paradas há mais de 1 dia (todas já cheias). */
export function limparBaldesAntigos(sql: SqlMinimo, agora: number, max = LIMPAR_NO_MAXIMO): void {
  sql.exec('DELETE FROM baldes WHERE chave IN (SELECT chave FROM baldes WHERE atualizado_em < ? ORDER BY atualizado_em LIMIT ?)', agora - DIA_MS, max);
}
