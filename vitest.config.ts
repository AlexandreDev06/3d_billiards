import { defineConfig } from 'vitest/config';

/**
 * Os testes que sobem `wrangler dev` (workerd de verdade, portas e pastas de estado): cada um tem a sua pasta temporária e o seu `--env-file`
 * (nada dividido), mas são pesados; rodam um de cada vez, ao lado dos demais.
 */
const INTEGRACAO = ['apps/portal/src/integracao.test.ts', 'apps/sala/src/worker*-integracao.test.ts'];

export default defineConfig({
  test: {
    // O padrão de 5 s derrubava varreduras pesadas quando a máquina está carregada (o pior caso visto em `.outros/lote-65`: 10 falhas numa
    // rodada). Passar com folga em carga alta vale mais que falhar cedo; um teste que trava de verdade continua falhando, só mais tarde.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    projects: [
      {
        extends: true,
        test: { name: 'unidade', include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'], exclude: [...INTEGRACAO, '**/node_modules/**'] },
      },
      { extends: true, test: { name: 'integracao', include: INTEGRACAO, fileParallelism: false } },
    ],
  },
});
