// SPDX-License-Identifier: AGPL-3.0-or-later
// Cache persistant (lot 10) : au rechargement, la bibliothèque s'affiche depuis
// IndexedDB avant la réponse de l'API, avec l'indicateur « mise à jour… » ; la
// déconnexion vide le cache. Session propre à chaque test (la déconnexion ne
// doit pas fermer celle des autres specs).

import { expect, test, type Page } from '@playwright/test';
import { ADMIN, LIBRARY, MOCKS_URL } from './env';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/radarr/__reset`);
});

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').locator('input').fill(ADMIN.email);
  await page.getByTestId('login-password').locator('input').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Clés des requêtes enregistrées dans IndexedDB (vide si rien n'est gardé).
 * Script exécuté dans la page (le projet Playwright n'a pas les types du DOM).
 */
const PERSISTED_KEYS = `new Promise((resolve) => {
  const open = indexedDB.open('hubarr', 1);
  open.onupgradeneeded = () => open.result.createObjectStore('query-cache');
  open.onsuccess = () => {
    const get = open.result.transaction('query-cache', 'readonly').objectStore('query-cache').get('client');
    get.onsuccess = () => {
      open.result.close();
      resolve(get.result ? get.result.clientState.queries.map((query) => query.queryKey.join('/')) : []);
    };
  };
})`;

function persistedKeys(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(PERSISTED_KEYS);
}

test('cache persistant : rechargement, contenu immédiat puis mise à jour', async ({ page }) => {
  await login(page);
  await page.goto(LIBRARY);
  const content = page.getByTestId('movies-content');
  await expect(content.getByText('Orbite Basse II', { exact: true }).first()).toBeVisible();
  await expect
    .poll(() => persistedKeys(page))
    .toContainEqual(expect.stringMatching(/^radarr\/films\/library\//));

  // L'API de la bibliothèque reste en attente : seul le cache peut l'afficher.
  const held: (() => Promise<void>)[] = [];
  await page.route(/\/api\/medias\/films\/films\?/, (route) => {
    held.push(() => route.continue());
  });
  await page.reload();
  await expect(content.getByText('Orbite Basse II', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('cache-refreshing')).toBeVisible();

  // Requêtes retenues relâchées (une requête annulée entre-temps est ignorée).
  await Promise.all(held.map((release) => release().catch(() => undefined)));
  await page.unroute(/\/api\/medias\/films\/films\?/);
  await expect(page.getByTestId('cache-refreshing')).toHaveCount(0);
});

test('cache persistant : vidé à la déconnexion', async ({ page, isMobile }) => {
  await login(page);
  await page.goto(LIBRARY);
  await expect(page.getByTestId('movies-content')).toBeVisible();
  await expect.poll(() => persistedKeys(page)).not.toEqual([]);

  if (isMobile) await page.getByTestId('nav-toggle').click();
  await page.getByTestId('drawer-logout').click();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => persistedKeys(page)).toEqual([]);
});
