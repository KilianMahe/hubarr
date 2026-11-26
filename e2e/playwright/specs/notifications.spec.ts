// SPDX-License-Identifier: AGPL-3.0-or-later
// Centre de notifications de la barre du haut, en desktop et en mobile : un
// message consigné (toast bref + cloche), lu à la fermeture du menu, conservé
// au rechargement, effaçable ; cloche présente aussi dans la pilule mobile.

import { expect, test } from '@playwright/test';
import { LIBRARY } from './env';

test('centre de notifications : historique, lecture, persistance, effacement', async ({ page }) => {
  await page.goto('/profil');
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('hubarr.notifications.')) localStorage.removeItem(key);
  });
  await page.reload();

  const bell = page.getByTestId('notification-center');
  const badge = page.getByTestId('notification-badge').locator('.v-badge__badge');
  await expect(bell).toBeVisible();
  await expect(badge).toBeHidden();

  await page.getByTestId('profile-preferences-save').click();
  // Retour d'action : toast bref, et consigné dans le centre.
  await expect(page.locator('.v-snackbar')).toContainText("Préférences d'affichage enregistrées.");
  await expect(badge).toHaveText('1');

  await bell.click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel.locator('[data-notification="success"][data-unread]')).toContainText(
    "Préférences d'affichage enregistrées.",
  );
  await page.keyboard.press('Escape');
  await expect(badge).toBeHidden();

  await page.reload();
  await page.getByTestId('notification-center').click();
  await expect(panel.locator('[data-notification]')).toHaveCount(1);
  await expect(panel.locator('[data-unread]')).toHaveCount(0);
  await panel.getByTestId('notification-clear').click();
  await expect(panel.getByTestId('notification-empty')).toBeVisible();
});

test('centre de notifications : cloche dans la barre des vues de service', async ({
  page,
  isMobile,
}) => {
  await page.goto(LIBRARY);
  const scope = isMobile ? page.getByTestId('topbar-pill') : page;
  await expect(scope.getByTestId('notification-center')).toBeVisible();
});
