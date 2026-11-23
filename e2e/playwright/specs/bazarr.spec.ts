// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours Bazarr (P3c.5), en desktop et en mobile, contre le faux Bazarr :
// accueil (préchauffage puis données), films (recherche et téléchargement
// d'un sous-titre), épisodes d'une série, badge dans la bibliothèque Radarr.

import { expect, test, type Page } from '@playwright/test';
import { LIBRARY, MOCKS_URL } from './env';

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/bazarr/__reset`);
});

/** Accueil chargé (l'index se construit en arrière-plan au premier passage). */
async function warmIndex(page: Page): Promise<void> {
  await page.goto('/bazarr');
  await expect(page.getByTestId('bazarr-tile-movies')).toBeVisible({ timeout: 20_000 });
}

test('accueil : compteurs et sous-titres les plus manquants', async ({ page }) => {
  await warmIndex(page);
  await expect(page.getByTestId('bazarr-tile-providers')).toContainText('2');
  await expect(page.getByTestId('bazarr-missing').first()).toBeVisible();
  await page.getByTestId('bazarr-auto').first().click();
  await expect(page.getByText('Recherche automatique lancée')).toBeVisible();
});

test('films : recherche d’un sous-titre et téléchargement', async ({ page }) => {
  await warmIndex(page);
  await page.goto('/bazarr/movies');
  await expect(page.getByTestId('bazarr-card')).toHaveCount(4, { timeout: 20_000 });
  await page.getByTestId('bazarr-grid-search').locator('input').fill('III');
  await expect(page.getByTestId('bazarr-card')).toHaveCount(1);
  await page.getByTestId('bazarr-card').click();
  const dialog = page.getByTestId('bazarr-search-dialog');
  await expect(dialog.getByTestId('bazarr-result')).toHaveCount(1);
  await dialog.getByTestId('bazarr-download').click();
  await expect(page.getByText('Sous-titre téléchargé')).toBeVisible();
});

test('épisodes d’une série : recherche par épisode', async ({ page }) => {
  await page.goto('/bazarr/series/1');
  await expect(page.getByTestId('bazarr-episode')).toHaveCount(2);
  await page.getByTestId('bazarr-episode-search').click();
  const dialog = page.getByTestId('bazarr-search-dialog');
  await dialog.getByTestId('bazarr-download').click();
  await expect(page.getByText('Sous-titre téléchargé')).toBeVisible();
  await expect(page.getByTestId('bazarr-episode-search')).toHaveCount(0);
});

test('badge de sous-titres dans la bibliothèque Radarr', async ({ page, isMobile }) => {
  test.skip(isMobile, 'La bibliothèque mobile s’affiche en liste (badges en grille et en mur)');
  await warmIndex(page);
  await page.goto(LIBRARY);
  const badge = page.getByTestId('subtitle-badge').filter({ hasText: 'Manquant 1' }).first();
  await expect(badge).toBeVisible({ timeout: 20_000 });
  await badge.click();
  await expect(page.getByTestId('bazarr-search-dialog').getByTestId('bazarr-result')).toHaveCount(
    1,
  );
});
