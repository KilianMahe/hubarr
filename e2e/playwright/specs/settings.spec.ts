// SPDX-License-Identifier: AGPL-3.0-or-later
// Page Paramètres de Hubarr (lot 3) : sections dans la navigation latérale sur
// desktop, dans la barre basse sur mobile, avec la section nommée dans la
// barre du haut (« Paramètres · Sauvegarde »). Sur mobile, la barre du haut
// nomme aussi le service et la page des vues de service (« Radarr · Films »).

import { expect, test } from '@playwright/test';
import { LIBRARY, SERIES_LIBRARY } from './env';

test('paramètres : navigation entre les sections', async ({ page, isMobile }) => {
  await page.goto('/admin/settings');
  await expect(page.getByTestId('tab-services')).toBeVisible();
  await page.getByTestId('tab-backup').click();
  await expect(page).toHaveURL(/\/admin\/settings#section-backup$/);
  if (isMobile) {
    const bottom = page.getByTestId('service-bottom-nav');
    await expect(bottom.getByTestId('tab-backup')).toHaveClass(/v-btn--active/);
    await expect(page.getByTestId('topbar-title')).toHaveText('Paramètres · Sauvegarde');
  } else {
    await expect(page.getByTestId('service-bottom-nav')).toHaveCount(0);
    await expect(page.getByTestId('topbar-title')).toHaveText('');
  }
});

test('paramètres : section Journaux', async ({ page, isMobile }) => {
  await page.goto('/admin/settings');
  await page.getByTestId('tab-logs').click();
  await expect(page).toHaveURL(/\/admin\/settings#section-logs$/);
  await expect(page.getByTestId('logs-list')).toBeVisible();
  if (isMobile) {
    await expect(page.getByTestId('topbar-title')).toHaveText('Paramètres · Journaux');
  }
});

test('tiroir : pied en liste verticale, sans Journaux', async ({ page, isMobile }) => {
  await page.goto(LIBRARY);
  if (isMobile) await page.getByTestId('nav-toggle').click();
  const footer = page.getByTestId('drawer-footer');
  const items = footer.locator('.v-list-item');
  await expect(items).toHaveText(['Paramètres', 'Aide', 'Code source']);
  await expect(footer.getByRole('link', { name: 'Code source' })).toHaveAttribute(
    'target',
    '_blank',
  );
  // Liste verticale : chaque lien sous le précédent.
  const [first, second] = await Promise.all([
    items.nth(0).boundingBox(),
    items.nth(1).boundingBox(),
  ]);
  expect(first).not.toBeNull();
  expect(second?.y ?? 0).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0) - 1);
  await footer.getByRole('link', { name: 'Paramètres' }).click();
  await expect(page).toHaveURL(/\/admin\/settings/);
});

test('mobile : service et page dans la barre du haut (Radarr, Sonarr)', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Titre de la barre du haut propre au mobile');
  await page.goto(LIBRARY);
  await expect(page.getByTestId('topbar-title')).toHaveText('Radarr · Films');
  await expect(page.getByTestId('topbar-search-open')).toBeVisible();
  await page.getByTestId('service-bottom-nav').getByRole('link', { name: 'Serveur' }).click();
  await expect(page.getByTestId('topbar-title')).toHaveText('Radarr · Serveur');
  await page.goto(SERIES_LIBRARY);
  await expect(page.getByTestId('topbar-title')).toHaveText('Sonarr · Séries');
});
