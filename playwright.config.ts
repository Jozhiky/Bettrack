import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'cloud.spec.ts',
  timeout: 120000,
  workers: 1,
  use: { baseURL: process.env.BETTRACK_TEST_URL || 'http://127.0.0.1:5189', browserName: 'chromium', headless: true },
  webServer: process.env.BETTRACK_TEST_URL ? undefined : {
    command: 'npm run preview -- --port 5189 --strictPort',
    url: 'http://127.0.0.1:5189',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
