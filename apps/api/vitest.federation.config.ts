import { defineConfig } from 'vitest/config';

/**
 * Vitest config for federation integration tests.
 *
 * These tests run against live Docker instances (hub:3001, coop-a:3002, coop-b:3003)
 * started via `make dev-federation`. No global setup needed — the tests initialize
 * each instance via the setup API.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/federation-e2e/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    server: {
      deps: {
        inline: [/^@coopsource\//],
      },
    },
  },
});
