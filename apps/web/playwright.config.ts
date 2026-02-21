import { defineConfig, devices } from '@playwright/test';

const TEST_DB_URL = 'postgresql://localhost:5432/coopsource_test';
const TEST_KEY_ENC_KEY = 'yIknTzhyTfVpR7cc/ZrwSpewmhyiOJA97leVbKqccsY=';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @coopsource/api dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        DATABASE_URL: TEST_DB_URL,
        KEY_ENC_KEY: TEST_KEY_ENC_KEY,
        NODE_ENV: 'development',
        PLC_URL: 'local',
        INSTANCE_URL: 'http://localhost:3001',
        SESSION_SECRET: 'e2e-test-session-secret',
      },
    },
    {
      command: 'pnpm --filter @coopsource/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        API_URL: 'http://localhost:3001',
      },
    },
  ],
});
