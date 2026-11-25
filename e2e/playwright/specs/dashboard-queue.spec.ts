// SPDX-License-Identifier: AGPL-3.0-or-later
// Gestion d'un import bloqué depuis le tableau de bord, contre le faux Sonarr :
// motif sous la ligne, la ligne ouvre la gestion, fichier reconnu coché,
// import manuel suivi jusqu'à la sortie de la file ; même gestion depuis la
// page « File d'attente » de Sonarr.

import { expect, test } from '@playwright/test';
import { MOCKS_URL } from './env';

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/sonarr/__reset`);
});

test('tableau de bord : import manuel d’un téléchargement bloqué', async ({ page }) => {
  await page.goto('/tableau-de-bord');
  const card = page.getByTestId('card-queue');
  const blocked = card.locator('[data-test="dashboard-queue-row"][data-manageable="true"]');
  // La file est relue toutes les 10 s : le serveur garde 3 s la file du passage précédent.
  await expect(blocked).toHaveCount(1, { timeout: 15_000 });
  await expect(blocked.getByTestId('dashboard-queue-reason')).toHaveText('Unable to parse episode');

  await blocked.click();
  const dialog = page.getByTestId('queue-manage');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('queue-manage-reasons')).toContainText('Unable to parse episode');
  const file = page.getByTestId('manual-file');
  await expect(file).toHaveCount(1);
  await expect(file).toContainText('episode.mkv');
  await expect(file.getByTestId('manual-file-media')).toContainText('Les Veilleurs');
  await expect(file.getByTestId('manual-file-select').locator('input')).toBeChecked();

  await page.getByTestId('queue-manage-import').click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/Import terminé/)).toBeVisible();
  await expect(blocked).toHaveCount(0, { timeout: 15_000 });
});

test('file d’attente Sonarr : import manuel depuis la ligne bloquée', async ({ page }) => {
  await page.goto('/medias/series/series/file-attente');
  const manage = page.getByTestId('series-queue-manage');
  await expect(manage).toHaveCount(1, { timeout: 15_000 });
  await manage.click();
  const dialog = page.getByTestId('queue-manage');
  await expect(dialog).toBeVisible();
  // Déjà sur la page de la file : pas de lien vers elle.
  await expect(page.getByTestId('queue-manage-open')).toHaveCount(0);
  await expect(page.getByTestId('manual-file')).toContainText('episode.mkv');

  await page.getByTestId('queue-manage-import').click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(manage).toHaveCount(0, { timeout: 15_000 });
});
