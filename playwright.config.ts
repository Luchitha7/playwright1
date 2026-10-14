import { defineConfig } from '@playwright/test';
import 'dotenv/config';
import { requireEnv } from './tests/env';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1, // one test at a time, all tests share the same test account
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['json', { outputFile: 'results.json' }]],
  use: {
    baseURL: requireEnv('BASE_URL'),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { browserName: 'chromium', storageState: '.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
});
