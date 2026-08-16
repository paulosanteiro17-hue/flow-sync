import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');
const rootEnv = resolve(repoRoot, '.env');
if (existsSync(rootEnv)) loadDotenv({ path: rootEnv, override: false });

const WEB_PORT = process.env.WEB_PORT ?? '3000';
const API_PORT = process.env.API_PORT ?? '4000';
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = process.env.API_URL ?? `http://localhost:${API_PORT}`;

/**
 * End-to-end configuration.
 *
 * Both servers are started by Playwright so a single `npm run test:e2e` works on a
 * clean machine and in CI. `reuseExistingServer` keeps the local loop fast when
 * the dev servers are already running.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },

  projects: [
    // Signs the demo accounts in once; every other project reuses those cookies.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /mobile\.spec\.ts/,
    },
  ],

  webServer: [
    {
      command: 'npm run start --workspace @flowsync/api',
      cwd: repoRoot,
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Sign-in is limited to 5 attempts per 15 minutes per IP and email. That is
      // the right production behaviour and it has its own backend test
      // (`test/rate-limit.e2e-spec.ts`), but it would make this suite unrunnable
      // twice in a quarter of an hour, so it is off for the browser tests.
      env: { RATE_LIMIT_ENABLED: 'false' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run start --workspace @flowsync/web',
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { PORT: WEB_PORT, NEXT_PUBLIC_API_URL: API_URL },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
