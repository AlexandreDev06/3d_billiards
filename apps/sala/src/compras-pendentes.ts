/**
 * As compras pendentes (L59): com `SALDO_NO_BANCO=1` a compra de uma skin ou de um item do balão precisa da resposta do Banco antes de
 * dar o item. Antes de chamar `debitar`, a carteira grava aqui uma pendência (a chave do débito, quem, o quê e o preço) NA MESMA
 * persistência das carteiras (a tabela `compras_pendentes` no Durable Object, o campo `compras` do `carteiras.json` na sala Node). Se o
 * objeto cair entre o débito e o item, ou o Banco não responder, a pendência diz o que perguntar (`operacao(chave)`): aplicada, dá o
 * item; nunca aplicada, apaga. Nunca se estorna às cegas.
 *
 * Este arquivo é puro (sem disco, sem rede, sem Node). Nunca loga a chave nem o `id` inteiro.
 */

export type TipoDeCompra = 'skin' | 'balao';

export interface CompraPendente {
  /** A chave idempotente do débito no Banco (`sinuca:compra:<id>:<agora-ms>:<sorteio>`). */
  readonly chave: string;
  readonly id: string;
  readonly tipo: TipoDeCompra;
  /** O id da skin ou do item do balão. */
  readonly item: string;
  readonly preco: number;
  readonly criadaEm: number;
}

/** O `ehChave` do Banco: minúsculas, dígitos e `: . _ -`, até 120 caracteres. */
const FORMA_DA_CHAVE = /^[a-z0-9:._-]{1,120}$/;
const FORMA_DO_ID = /^[0-9a-f]{64}$/;
const FORMA_DO_ITEM = /^[a-z0-9_-]{1,60}$/;

/** Única no mundo: o nome do jogo (o Banco é de todos), o `id` inteiro, o instante e um sorteio (a chave vale para o Banco todo). Sempre em minúsculas; cabe nos 120 (13 + 64 + 1 + 13 + 1 + 10). */
export const chaveDaCompra = (id: string, agoraMs: number, sorteio: number): string => `sinuca:compra:${id}:${agoraMs}:${sorteio}`.toLowerCase();

const inteiroSeguro = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A pendência como foi guardada (arquivo ou tabela), ou `null` se a forma não presta (nunca é reconciliada). */
export function compraPendenteValida(x: unknown): CompraPendente | null {
  if (!objeto(x)) return null;
  const { chave, id, tipo, item, preco, criadaEm } = x;
  if (typeof chave !== 'string' || !FORMA_DA_CHAVE.test(chave) || typeof id !== 'string' || !FORMA_DO_ID.test(id)) return null;
  if ((tipo !== 'skin' && tipo !== 'balao') || typeof item !== 'string' || !FORMA_DO_ITEM.test(item)) return null;
  if (!inteiroSeguro(preco) || preco <= 0 || typeof criadaEm !== 'number' || !Number.isFinite(criadaEm)) return null;
  return { chave, id, tipo, item, preco, criadaEm };
}

/** As pendências de um campo `compras` lido do arquivo; devolve o que presta e quantas não. */
export function comprasDoArquivo(compras: unknown): { compras: CompraPendente[]; invalidas: number } {
  if (!Array.isArray(compras)) return { compras: [], invalidas: compras === undefined ? 0 : 1 };
  const lidas: CompraPendente[] = [];
  const vistas = new Set<string>();
  let invalidas = 0;
  for (const bruta of compras) {
    const p = compraPendenteValida(bruta);
    if (p === null || vistas.has(p.chave)) invalidas++;
    else {
      vistas.add(p.chave);
      lidas.push(p);
    }
  }
  return { compras: lidas, invalidas };
}

/** As pendências em memória. Quem as guarda em disco lê `sujas`: as chaves cujo estado no armazenamento pode estar diferente (gravar se ainda existe, apagar se não). */
export class ComprasPendentes {
  private readonly porChave = new Map<string, CompraPendente>();
  /** Ligado pelo armazenamento que grava por linha (SQLite); o arquivo grava tudo e dispensa. */
  rastreiaSujas = false;
  readonly sujas = new Set<string>();

  get lista(): readonly CompraPendente[] {
    return [...this.porChave.values()];
  }

  get vazia(): boolean {
    return this.porChave.size === 0;
  }

  get tamanho(): number {
    return this.porChave.size;
  }

  buscar(chave: string): CompraPendente | undefined {
    return this.porChave.get(chave);
  }

  /** A pendência desta carteira para este item, se houver. */
  doItem(id: string, tipo: TipoDeCompra, item: string): CompraPendente | undefined {
    for (const p of this.porChave.values()) if (p.id === id && p.tipo === tipo && p.item === item) return p;
    return undefined;
  }

  /** Põe o que o armazenamento tinha (já validado). Chamado uma vez, ao abrir. */
  carregar(compras: readonly CompraPendente[]): void {
    this.porChave.clear();
    for (const p of compras) this.porChave.set(p.chave, p);
  }

  adicionar(p: CompraPendente): void {
    this.porChave.set(p.chave, p);
    this.marcar(p.chave);
  }

  apagar(chave: string): void {
    this.porChave.delete(chave);
    this.marcar(chave);
  }

  /** O que vai ao `carteiras.json`. */
  paraOArquivo(): CompraPendente[] {
    return this.lista.map((p) => ({ ...p }));
  }

  private marcar(chave: string): void {
    if (this.rastreiaSujas) this.sujas.add(chave);
  }
}
