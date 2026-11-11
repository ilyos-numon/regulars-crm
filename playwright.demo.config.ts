import { defineConfig, devices } from '@playwright/test';
const port = process.env.E2E_DEMO_PORT ?? '8805';
export default defineConfig({
  testDir: 'tests/e2e-demo', workers: 1, retries: 0, timeout: 30_000,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx tsx src/main.ts', url: `http://localhost:${port}/health`,
    reuseExistingServer: false, timeout: 30_000,
    env: {
      PORT: port, REGULARS_DATA_DIR: 'test-results/e2e-demo-data', REGULARS_HASH_SALT: 'e2e-salt',
      REGULARS_DEMO_MODE: '1', REGULARS_DEMO_TTL_HOURS: '24', REGULARS_DEMO_SWEEP_MINUTES: '0.05',
      REGULARS_DEMO_MAX_VISITORS: '100', STORE_NAME: '테스트 카페',
    },
  },
});
