// SPDX-License-Identifier: AGPL-3.0-or-later
// Préférences d'affichage du compte (page Profil), en desktop et en mobile :
// la bibliothèque Radarr et la liste qBittorrent s'ouvrent sur le mode et le
// filtre choisis ; un changement fait sur la page ne survit pas à la visite.

import { expect, test, type Page } from '@playwright/test';
import { LIBRARY, MOCKS_URL } from './env';

test.beforeEach(async ({ request }) => {
  for (const service of ['radarr', 'qbittorrent']) {
    await request.post(`${MOCKS_URL}/${service}/__reset`);
  }
});

async function choose(page: Page, field: string, option: RegExp | string): Promise<void> {
  await page.getByTestId(field).click();
  await page
    .getByRole(
      'option',
      typeof option === 'string' ? { name: option, exact: true } : { name: option },
    )
    .click();
}

async function savePreferences(page: Page): Promise<void> {
  await page.getByTestId('profile-preferences-save').click();
  await expect(page.getByText("Préférences d'affichage enregistrées.")).toBeVisible();
}

test('les pages s’ouvrent sur les préférences d’affichage du compte', async ({ page }) => {
  await page.goto('/profil');
  const card = page.getByTestId('profile-preferences');
  await expect(card).toBeVisible();
  try {
    await choose(page, 'pref-movies-view', 'Tableau');
    await choose(page, 'pref-torrents-view', 'Liste');
    await choose(page, 'pref-torrents-filter', 'En cours');
    await savePreferences(page);

    await page.goto(LIBRARY);
    await expect(page.locator('.movie-table')).toBeVisible();

    const filtered = page.waitForRequest(
      (request) =>
        request.url().includes('/api/qbittorrent/torrents?') &&
        request.url().includes('filter=downloading'),
    );
    await page.goto('/qbittorrent');
    await filtered;
    await expect(page.getByTestId('torrent-rows')).toHaveAttribute('data-view', 'list');

    // Un autre mode choisi sur la page ne vaut que pour la visite.
    await page.goto(LIBRARY);
    await page.getByTestId('movies-view-menu').click();
    await page.getByTestId('view-extended').click();
    await expect(page.locator('.movie-table')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.movie-table')).toBeVisible();
  } finally {
    await page.goto('/profil');
    await choose(page, 'pref-movies-view', /^Automatique/);
    await choose(page, 'pref-torrents-view', 'Tableau');
    await choose(page, 'pref-torrents-filter', 'Tous');
    await savePreferences(page);
  }
});
