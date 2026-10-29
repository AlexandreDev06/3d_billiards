/** Um acessório do arquivo à parte: o nó de cada nível de detalhe (a origem do nó é o ponto que encosta na âncora do personagem). */
export interface AcessorioDaMeta {
  readonly noAlta: string;
  readonly noBaixa: string;
}

/** As notas do artista sobre o arquivo de acessórios (`chapeus-meta.json`): os acessórios por id, na ordem do arquivo. */
export interface MetaDosAcessorios {
  readonly versao: 1;
  readonly acessorios: ReadonlyMap<string, AcessorioDaMeta>;
}

function objeto(valor: unknown, onde: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new Error(`meta dos acessórios: ${onde} tem de ser um objeto`);
  return valor as Record<string, unknown>;
}

function nivel(valor: unknown, onde: string): string {
  const no = objeto(valor, onde).no;
  if (typeof no !== 'string' || no === '') throw new Error(`meta dos acessórios: ${onde}.no tem de ser o nome do nó (texto)`);
  return no;
}

/**
 * Lê `chapeus-meta.json`, o arquivo de notas que vai junto do `chapeus.glb`: `versao` 1 e, em `chapeus`, cada id com `alta.no` e
 * `baixa.no`. Uma grafia por chave: o que falta, é de outro tipo ou tem versão que o pacote não conhece lança dizendo o campo.
 */
export function lerMetaDosAcessorios(json: unknown): MetaDosAcessorios {
  const raiz = objeto(json, 'o arquivo');
  if (raiz.versao !== 1) throw new Error(`meta dos acessórios: versao tem de ser 1 (veio ${JSON.stringify(raiz.versao) ?? 'nada'})`);
  const lista = objeto(raiz.chapeus, 'chapeus');
  const ids = Object.keys(lista);
  if (ids.length === 0) throw new Error('meta dos acessórios: chapeus não pode estar vazio');
  const acessorios = new Map<string, AcessorioDaMeta>();
  for (const id of ids) {
    const c = objeto(lista[id], `chapeus.${id}`);
    acessorios.set(id, { noAlta: nivel(c.alta, `chapeus.${id}.alta`), noBaixa: nivel(c.baixa, `chapeus.${id}.baixa`) });
  }
  return { versao: 1, acessorios };
}
