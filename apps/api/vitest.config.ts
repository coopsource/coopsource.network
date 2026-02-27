import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    globalSetup: ['tests/helpers/vitest.setup.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
    exclude: ['tests/federation-e2e/**', 'node_modules/**'],
    server: {
      deps: {
        // Allow Vitest to resolve native pg package and workspace packages
        inline: [/^@coopsource\//],
      },
    },
  },
});
