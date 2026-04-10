import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    globalSetup: ['tests/global-setup.ts'],
  },
});
