// SPDX-License-Identifier: AGPL-3.0-or-later
// Statistiques du tableau de bord (lot 13), contre les faux clients de
// téléchargement et les faux Radarr et Sonarr : téléchargés par jour sur 30
// jours (torrents terminés, historique Usenet) et espace disque des dossiers
// racines.

import { expect, test } from '@playwright/test';

test('tableau de bord : téléchargés par jour et espace disque', async ({ page }) => {
  await page.goto('/tableau-de-bord');

  const downloads = page.getByTestId('card-downloads');
  await expect(downloads).toBeVisible();
  await expect(downloads.getByTestId('downloads-bar')).toHaveCount(30);
  await expect(downloads.getByTestId('downloads-total')).not.toHaveText(/^0/);
  await expect(downloads.getByTestId('downloads-failed')).toHaveCount(0);
  // Une barre au survol donne le jour et la quantité.
  await expect(downloads.getByTestId('downloads-bar').last().locator('title')).toHaveText(/ : /);

  const disks = page.getByTestId('card-disks');
  await expect(disks.getByTestId('disk')).toHaveCount(2);
  await expect(disks).toContainText('/movies');
  await expect(disks).toContainText('/tv');
  await expect(disks.getByTestId('disks-failed')).toHaveCount(0);
});

test('disposition du tableau de bord : glisser-déposer par la poignée', async ({ page }) => {
  await page.goto('/tableau-de-bord');
  await page.getByTestId('layout-edit').click();
  const rows = page.locator('[data-test^="layout-row-"]');
  const first = await rows.first().getAttribute('data-test');
  // La première section est glissée sous la troisième ; rien n'est enregistré.
  await rows
    .first()
    .getByTestId('layout-drag')
    .dragTo(rows.nth(2), {
      targetPosition: { x: 20, y: 30 },
    });
  await expect(rows.nth(2)).toHaveAttribute('data-test', first ?? '');
  await page.getByRole('button', { name: /annuler/i }).click();
});
