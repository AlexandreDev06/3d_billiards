import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const SEM_MATH_RANDOM = ['error', { object: 'Math', property: 'random', message: 'Use o RNG semeado injetado.' }];

export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**', '.outros/**', '.maestri/**', 'arte/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Com verbatimModuleSyntax, `import { type X }` vira `import {}` e ainda carrega o módulo.
    rules: { '@typescript-eslint/no-import-type-side-effects': 'error' },
  },
  {
    files: ['packages/fisica/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['three', 'three/*', '@sinuca/*'], message: 'packages/fisica é puro: sem three e sem outros pacotes.' }] },
      ],
      'no-restricted-properties': SEM_MATH_RANDOM,
    },
  },
  {
    files: ['packages/regras/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'packages/regras é puro: sem three.' },
            { group: ['@sinuca/*', '!@sinuca/fisica'], message: 'packages/regras só depende de @sinuca/fisica.' },
            {
              group: ['@sinuca/fisica', '@sinuca/fisica/*'],
              allowTypeImports: true,
              message: 'De @sinuca/fisica, packages/regras importa só tipos (import type).',
            },
          ],
        },
      ],
      'no-restricted-properties': SEM_MATH_RANDOM,
    },
  },
  {
    files: ['packages/protocolo/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'packages/protocolo é puro: sem three.' },
            { group: ['@sinuca/*', '!@sinuca/fisica', '!@sinuca/regras'], message: 'packages/protocolo só depende de @sinuca/fisica e @sinuca/regras.' },
            {
              group: ['@sinuca/fisica', '@sinuca/fisica/*', '@sinuca/regras', '@sinuca/regras/*'],
              allowTypeImports: true,
              message: 'De fisica e regras, packages/protocolo importa só tipos (import type).',
            },
          ],
        },
      ],
      'no-restricted-properties': SEM_MATH_RANDOM,
    },
  },
  {
    files: ['packages/personagens/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@sinuca/*'], message: 'packages/personagens é genérico: não conhece o jogo nem os outros pacotes.' }] }],
    },
  },
  {
    files: ['packages/personagens/src/**/*.ts'],
    ignores: ['packages/personagens/src/three/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@sinuca/*'], message: 'packages/personagens é genérico: não conhece o jogo nem os outros pacotes.' },
            { group: ['three', 'three/*'], message: 'A parte pura de packages/personagens não usa three: o que desenha vai em src/three.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/sala/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*', '@sinuca/web', '@sinuca/web/*'], message: 'apps/sala não conhece o cliente.' },
            {
              group: ['@sinuca/fisica', '@sinuca/fisica/*'],
              allowTypeImports: true,
              message: 'apps/sala não re-simula: de @sinuca/fisica importa só tipos (import type).',
            },
            {
              group: ['@sinuca/conta', '@sinuca/conta/*'],
              allowTypeImports: true,
              message: 'apps/sala não conhece o código do Banco: de @sinuca/conta importa só tipos (import type de @sinuca/conta/contrato). Só banco-local.ts (sala Node) importa o núcleo.',
            },
          ],
        },
      ],
      'no-restricted-properties': SEM_MATH_RANDOM,
    },
  },
  {
    // A sala Node roda o núcleo do Banco (Moedas) sobre node:sqlite no lugar do service binding; este arquivo nunca entra no Worker.
    files: ['apps/sala/src/banco-local.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*', '@sinuca/web', '@sinuca/web/*'], message: 'apps/sala não conhece o cliente.' },
            {
              group: ['@sinuca/fisica', '@sinuca/fisica/*'],
              allowTypeImports: true,
              message: 'apps/sala não re-simula: de @sinuca/fisica importa só tipos (import type).',
            },
          ],
        },
      ],
    },
  },
  {
    // O Banco da Beco Games roda no Worker sem Node (sem nodejs_compat) e não conhece a sinuca: o contrato sai de src/contrato.ts.
    files: ['apps/conta/**/*.ts'],
    ignores: ['apps/conta/**/*.test.ts', 'apps/conta/src/para-testes.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@sinuca/*'], message: 'apps/conta não conhece a sinuca nem os outros pacotes: o contrato fica em src/contrato.ts.' },
            { group: ['node:*'], message: 'apps/conta roda no Worker sem Node: só Web Crypto e SQL pelo SqlMinimo.' },
          ],
        },
      ],
      'no-restricted-properties': SEM_MATH_RANDOM,
    },
  },
  {
    // Os testes montam tacadas reais com a física; a fronteira vale para o código de produção.
    files: ['packages/protocolo/**/*.test.ts', 'packages/protocolo/src/para-testes.ts', 'apps/sala/**/*.test.ts', 'apps/sala/src/para-testes*.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
);
