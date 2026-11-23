// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours Prowlarr (P3c.5), en desktop et en mobile, contre le faux Prowlarr :
// page des indexeurs (tuiles, santé, bascule, test global), ajout d'un
// indexeur depuis le catalogue, recherche et grab, applications et profils,
// général, pages système.

import { expect, test } from '@playwright/test';
import { MOCKS_URL } from './env';
import { openServiceAdmin } from './nav';

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/prowlarr/__reset`);
});

test('indexeurs : tuiles, santé, bascule et test global', async ({ page }) => {
  await page.goto('/prowlarr');
  await expect(page.getByTestId('prowlarr-indexer-row')).toHaveCount(3);
  await expect(page.getByTestId('prowlarr-tile-indexers')).toContainText('3');
  await expect(page.getByTestId('prowlarr-tile-active')).toContainText('2');
  await expect(page.getByTestId('prowlarr-health')).toContainText('Archives Lentes');
  await expect(page.locator('body')).not.toContainText('secret-mock');

  await page.getByTestId('prowlarr-indexer-toggle').first().click();
  await expect(page.getByTestId('prowlarr-tile-active')).toContainText('1');

  await page.getByTestId('prowlarr-test-all').click();
  await expect(page.getByTestId('prowlarr-feedback')).toContainText('Délai dépassé');
});

test('ajout d’un indexeur depuis le catalogue, test puis ajout', async ({ page }) => {
  await page.goto('/prowlarr');
  await expect(page.getByTestId('prowlarr-indexer-row')).toHaveCount(3);
  await page.getByTestId('prowlarr-add').click();
  const dialog = page.getByTestId('arr-admin-dialog');
  await expect(dialog.getByTestId('indexer-definition')).toHaveCount(2);
  await dialog.getByTestId('indexer-catalog-search').locator('input').fill('cinema');
  await expect(dialog.getByTestId('indexer-definition')).toHaveCount(1);
  await dialog.getByTestId('indexer-definition').click();
  await expect(dialog.getByTestId('indexer-name').locator('input')).toHaveValue('Cinéma Libre');
  await dialog.getByTestId('indexer-test').click();
  await expect(dialog.getByTestId('indexer-test-result')).toContainText('Connexion réussie');
  await dialog.getByTestId('arr-admin-dialog-save').click();
  await expect(page.getByTestId('prowlarr-feedback')).toContainText('Indexeur ajouté');
  await expect(page.getByTestId('prowlarr-indexer-row')).toHaveCount(4);
});

test('recherche multi-indexeurs et grab', async ({ page }) => {
  await page.goto('/prowlarr');
  await page.getByTestId('prowlarr-search-input').locator('input').fill('orbite');
  await page.getByTestId('prowlarr-search-submit').click();
  await expect(page.getByTestId('prowlarr-release')).toHaveCount(2);
  await expect(page.getByTestId('prowlarr-search-count')).toContainText('2 résultats');
  await expect(page.getByTestId('prowlarr-search').locator('a[href^="javascript"]')).toHaveCount(0);
  await page.getByTestId('prowlarr-grab').first().click();
  await expect(page.getByText('Envoyé au client de téléchargement')).toBeVisible();
});

test('applications et profil de synchronisation, général, système', async ({ page }) => {
  // Réglages et système : depuis les paramètres de Hubarr (P5c.4, D140).
  await openServiceAdmin(page, 'prowlarr', 'service-settings-prowlarr', 'prowlarr-apps');
  await expect(page).toHaveURL(/\/prowlarr\/apps$/);
  await expect(page.getByTestId('provider-card')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('radarr-secret');
  await page.getByTestId('app-profile-add').click();
  const dialog = page.getByTestId('arr-admin-dialog').last();
  await dialog.getByTestId('app-profile-name').locator('input').fill('Interactif');
  await dialog.getByTestId('arr-admin-dialog-save').click();
  await expect(page.getByTestId('app-profile-row')).toHaveCount(2);

  await page.goto('/prowlarr/general');
  const port = page.getByTestId('config-field-port').locator('input');
  await expect(port).toHaveValue('9696');
  await port.fill('9697');
  await page.getByTestId('config-save').click();
  await expect(page.getByTestId('prowlarr-feedback')).toContainText('Sauvegardé');
  await expect(page.locator('body')).not.toContainText('prowlarr-api-key');

  await page.goto('/prowlarr/systeme');
  await expect(page.getByTestId('prowlarr-system-info')).toContainText('3.0.2.5780');
  await page.goto('/prowlarr/historique');
  await expect(page.getByTestId('history-row')).toHaveCount(2);
});
