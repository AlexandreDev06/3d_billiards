/**
 * O Worker `becogames-conta` roda no workerd sem `nodejs_compat`: o caminho de imports de `worker/entrada.ts` só pode puxar o núcleo
 * puro e `cloudflare:workers`. Confere o grafo de verdade (o que o esbuild do wrangler seguiria): nenhum `node:*`, nenhum `@sinuca/*`,
 * nenhum `para-testes` nem teste, e nada de `process`, `require`, `Math.random`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(fileURLToPath(import.meta.url));
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
/** `import('x')`, em qualquer lugar do texto; o grupo 1 é o argumento literal, se for um. */
const IMPORT_DINAMICO = /\bimport\s*\(\s*(?:(['"`])([^'"`]*)\1)?/g;
/** Módulos do Node escritos sem o prefixo `node:`: o workerd sem `nodejs_compat` não os tem. */
export const NODE_SEM_PREFIXO = ['crypto', 'fs', 'path', 'os', 'net', 'http', 'https', 'child_process', 'stream', 'buffer', 'util', 'url', 'zlib', 'events', 'process'];

const semComentarios = (texto: string): string => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Cada módulo que o texto importa (estático ou `import()`), sem os `import type`; `import()` com argumento que não é texto literal vira `<dinamico>`. */
export function importados(texto: string): string[] {
  const limpo = semComentarios(texto);
  const achados: string[] = [];
  for (const m of limpo.matchAll(IMPORT)) if (m[1] === undefined) achados.push(m[2] ?? m[3]!);
  for (const m of limpo.matchAll(IMPORT_DINAMICO)) achados.push(m[1] === undefined || m[2]!.includes('${') ? '<dinamico>' : m[2]!);
  return achados;
}

/** Os únicos módulos que não são do projeto e o Worker pode importar. */
const PERMITIDOS = new Set(['cloudflare:workers']);

function grafo(entrada: string): { arquivos: Set<string>; externos: Set<string> } {
  const arquivos = new Set<string>();
  const externos = new Set<string>();
  const pendentes = [entrada];
  while (pendentes.length > 0) {
    const arquivo = pendentes.pop()!;
    if (arquivos.has(arquivo)) continue;
    arquivos.add(arquivo);
    for (const alvo of importados(readFileSync(arquivo, 'utf8'))) {
      if (alvo.startsWith('.')) {
        const base = resolve(dirname(arquivo), alvo);
        const achado = [`${base}.ts`, join(base, 'index.ts')].find((c) => existsSync(c));
        if (!achado) throw new Error(`${relative(SRC, arquivo)} importa ${alvo}, que não existe`);
        pendentes.push(achado);
      } else externos.add(alvo);
    }
  }
  return { arquivos, externos };
}

describe('o varredor de imports enxerga o que o Worker não pode ter', () => {
  it('import() dinâmico, literal ou não', () => {
    expect(importados(`const m = await import('node:fs');`)).toEqual(['node:fs']);
    expect(importados(`const m = await import("fs")`)).toEqual(['fs']);
    expect(importados('const m = import(`crypto`)')).toEqual(['crypto']);
    expect(importados(`const m = await import ( './outro' )`)).toEqual(['./outro']);
    expect(importados(`const nome = 'fs'; await import(nome);`)).toEqual(['<dinamico>']);
    expect(importados(`await import(\`node:\${x}\`)`)).toEqual(['<dinamico>']);
  });
  it('os módulos do Node sem o prefixo, em qualquer forma de import', () => {
    for (const nome of NODE_SEM_PREFIXO) {
      expect(importados(`import x from '${nome}';`), nome).toEqual([nome]);
      expect(importados(`import { a } from "${nome}"`), nome).toEqual([nome]);
      expect(importados(`import '${nome}';`), nome).toEqual([nome]);
      expect(importados(`export * from '${nome}';`), nome).toEqual([nome]);
      expect(importados(`const a = await import('${nome}')`), nome).toEqual([nome]);
    }
  });
  it('import type e texto em comentário não contam', () => {
    expect(importados(`import type { X } from 'fs';`)).toEqual([]);
    expect(importados(`// import('fs')\n/* import x from 'crypto' */\nconst a = 1;`)).toEqual([]);
  });
  it('nenhum desses passa pela lista de permitidos', () => {
    for (const nome of [...NODE_SEM_PREFIXO, '<dinamico>', 'node:fs', '@sinuca/fisica']) expect(PERMITIDOS.has(nome), nome).toBe(false);
  });
});

describe('o Worker não puxa Node, a sinuca nem código de teste', () => {
  const { arquivos, externos } = grafo(join(SRC, 'worker', 'entrada.ts'));
  const nomes = [...arquivos].map((a) => relative(SRC, a));

  it('o grafo achou o núcleo (senão o teste não prova nada)', () => {
    for (const esperado of ['worker/banco-do.ts', 'http.ts', 'contas.ts', 'moedas.ts', 'cripto.ts', 'esquema.ts', 'carteiro.ts', 'limite-taxa.ts', 'ip.ts', 'config.ts', 'sql.ts']) expect(nomes).toContain(esperado);
  });

  it('nenhum arquivo de teste nem o para-testes (node:sqlite) está no caminho', () => {
    expect(nomes.filter((n) => n.includes('.test.') || n.endsWith('para-testes.ts'))).toEqual([]);
  });

  it('só cloudflare:workers vem de fora: nada de node:*, @sinuca/* nem pacote', () => {
    expect([...externos].filter((e) => !PERMITIDOS.has(e)).sort()).toEqual([]);
  });

  it('nada do caminho usa `process`, `require`, `__dirname`, `Math.random` nem `Buffer`', () => {
    for (const arquivo of arquivos) {
      const codigo = semComentarios(readFileSync(arquivo, 'utf8'));
      expect(codigo, relative(SRC, arquivo)).not.toMatch(/\bprocess\.(env|argv|exit|on|cwd|pid)\b|\brequire\(|__dirname|__filename|Math\.random|\bBuffer\b/);
    }
  });
});
