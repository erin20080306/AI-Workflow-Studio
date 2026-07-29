import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: {
    timeout: 8_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @ai-workflow-studio/web dev --hostname 127.0.0.1 --port 3100',
    env: {
      NEXT_PUBLIC_MOCK_MODE: 'true',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:3100',
  },
  workers: 1,
});
