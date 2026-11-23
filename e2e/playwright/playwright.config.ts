// SPDX-License-Identifier: AGPL-3.0-or-later
// Configuration Playwright (make e2e) : l'image de prod (`E2E_BASE_URL`) et les
// faux upstreams (`E2E_MOCKS_URL`) tournent dans les services `e2e-*` de
// compose.dev.yml. Deux projets : desktop et mobile (critère de P2).

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  // Un seul faux Radarr à état partagé : les tests s'enchaînent.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://e2e-app:7070',
    storageState: './.auth/admin.json',
    locale: 'fr-FR',
    testIdAttribute: 'data-test',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
