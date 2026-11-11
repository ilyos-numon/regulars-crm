import { defineConfig, devices } from '@playwright/test';
const port = process.env.E2E_PORT ?? '8790';
export default defineConfig({
  testDir: 'tests/e2e', workers: 1, retries: 0, timeout: 30_000,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx tsx src/main.ts', url: `http://localhost:${port}/health`,
    reuseExistingServer: false, timeout: 30_000,
    env: {
      PORT: port, REGULARS_DATA_DIR: process.env.E2E_DATA_DIR ?? 'test-results/e2e-data',
      REGULARS_HASH_SALT: 'e2e-salt', REGULARS_ALLOW_RESET: '1', STORE_NAME: '테스트 카페',
      PUSH_CHANNEL: 'webhook', PUSH_WEBHOOK_URL: 'http://localhost:8798/push',
    },
  },
});
