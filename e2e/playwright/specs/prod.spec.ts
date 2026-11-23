// SPDX-License-Identifier: AGPL-3.0-or-later
// Image de prod (P6) : préfixe de chemin derrière un reverse proxy (matrice
// n° 65, conteneur `e2e-app-prefix` lancé avec HUBARR_BASE_PATH=/hubarr),
// manifeste et icônes de la PWA, documentation embarquée.

import { expect, test } from '@playwright/test';

const PREFIX_URL = process.env.E2E_PREFIX_URL ?? 'http://e2e-app-prefix:7070/hubarr';

test.describe('sous un préfixe de chemin', () => {
  // Base neuve, sans session : l'assistant d'installation s'affiche.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('la SPA, son API et sa documentation répondent sous /hubarr', async ({ page }) => {
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host === new URL(PREFIX_URL).host && !url.pathname.startsWith('/hubarr/')) {
        outside.push(url.pathname);
      }
    });
    await page.goto(`${PREFIX_URL}/`);
    await expect(page).toHaveURL(/\/hubarr\/setup\//);
    await expect(page.getByRole('button').first()).toBeVisible();
    expect(outside).toEqual([]);

    await page.goto(`${PREFIX_URL}/docs/`);
    await expect(page.locator('.VPContent')).toBeVisible();
    await page.getByRole('link', { name: 'Install Hubarr' }).click();
    await expect(page).toHaveURL(/\/hubarr\/docs\/installation/);
    expect(outside).toEqual([]);
  });
});

test('PWA : manifeste, icônes et service worker servis', async ({ page, request }) => {
  await page.goto('/tableau-de-bord');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('manifest.webmanifest');
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as { name: string; icons: { src: string }[] };
  expect(body.name).toBe('Hubarr');
  for (const icon of body.icons) {
    expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
  }
  const worker = await request.get('/sw.js');
  expect(worker.ok()).toBe(true);
  expect(worker.headers()['cache-control']).toBe('no-cache');
});
