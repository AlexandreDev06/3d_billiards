/**
 * O Worker (L41) só pode puxar do núcleo da sala o que roda no workerd: nenhum `node:fs`, `node:http`, `node:net`, `ws` nem a entrada
 * Node (`servidor.ts`, `main.ts`, o armazém em disco) pode estar no caminho de imports da `entrada.ts`. Confere o grafo de verdade (o
 * que o esbuild do wrangler seguiria), e que o único Node que sobra é o que o `nodejs_compat` do `wrangler.jsonc` cobre.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

/** Os módulos que não são do projeto e o Worker pode importar: o próprio runtime e o que o `nodejs_compat` entrega. */
const PERMITIDOS = new Set(['cloudflare:workers', 'node:crypto', 'node:util', '@sinuca/protocolo', '@sinuca/regras']);
const PROIBIDOS_NO_CAMINHO = ['servidor.ts', 'main.ts', 'carteiras.ts', 'trava.ts', 'encerramento.ts', 'estatico.ts', 'carteira-http-node.ts', 'para-testes.ts', 'para-testes-ws.ts', 'para-testes-worker.ts'];

function grafo(entrada: string): { arquivos: Set<string>; externos: Set<string> } {
  const arquivos = new Set<string>();
  const externos = new Set<string>();
  const pendentes = [entrada];
  while (pendentes.length > 0) {
    const arquivo = pendentes.pop()!;
    if (arquivos.has(arquivo)) continue;
    arquivos.add(arquivo);
    const texto = readFileSync(arquivo, 'utf8');
    for (const m of texto.matchAll(IMPORT)) {
      const soTipo = m[1] !== undefined;
      const alvo = m[2] ?? m[3]!;
      if (soTipo) continue; // `import type` some na compilação
      if (alvo.startsWith('.')) {
        const base = resolve(dirname(arquivo), alvo);
        const achado = [`${base}.ts`, join(base, 'index.ts'), base].find((c) => c.endsWith('.ts') && existsSync(c));
        if (!achado) throw new Error(`${relative(SRC, arquivo)} importa ${alvo}, que não existe`);
        pendentes.push(achado);
      } else externos.add(alvo);
    }
  }
  return { arquivos, externos };
}

describe('o Worker não puxa a entrada Node nem módulos que o workerd não tem', () => {
  const { arquivos, externos } = grafo(join(SRC, 'worker', 'entrada.ts'));
  const nomes = [...arquivos].map((a) => relative(SRC, a));

  it('o grafo achou o núcleo (senão o teste não prova nada)', () => {
    for (const esperado of ['worker/sala-do.ts', 'registro.ts', 'sala.ts', 'ligacao.ts', 'carteiras-sqlite.ts', 'carteiras-base.ts', 'carteira-http.ts', 'worker/admin.ts']) expect(nomes).toContain(esperado);
  });

  it('nenhum arquivo da entrada Node, do disco ou de teste está no caminho', () => {
    for (const proibido of PROIBIDOS_NO_CAMINHO) expect(nomes.filter((n) => n === proibido || n.endsWith(`/${proibido}`)), proibido).toEqual([]);
    expect(nomes.filter((n) => n.includes('.test.'))).toEqual([]);
  });

  it('só o runtime, o node:crypto e o node:util (nodejs_compat) e os pacotes puros do projeto são importados', () => {
    expect([...externos].filter((e) => !PERMITIDOS.has(e)).sort()).toEqual([]);
    // e a física não entra em valor: o núcleo da sala só a importa como tipo
    expect(externos.has('@sinuca/fisica')).toBe(false);
  });

  it('nada do caminho usa `process`, `require` nem `__dirname` (o workerd não tem)', () => {
    for (const arquivo of arquivos) {
      const semComentarios = readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(semComentarios, relative(SRC, arquivo)).not.toMatch(/\bprocess\.(env|argv|exit|on|cwd|pid)\b|\brequire\(|__dirname|__filename/);
    }
  });
});
