// SPDX-License-Identifier: AGPL-3.0-or-later
// Accueil à onglets (lot 11) : Tableau de bord, Découverte et Calendrier
// gardent leurs URL ; onglets en haut de page sur desktop, barre basse sur
// mobile ; une seule entrée « Accueil » dans le tiroir.

import { expect, test } from '@playwright/test';

test('accueil : navigation entre les onglets', async ({ page, isMobile }) => {
  await page.goto('/tableau-de-bord');
  await expect(page.getByTestId('dashboard-view')).toBeVisible();

  const tabs = isMobile ? page.getByTestId('service-bottom-nav') : page.getByTestId('home-tabs');
  await expect(page.getByTestId(isMobile ? 'home-tabs' : 'service-bottom-nav')).toHaveCount(0);

  await tabs.getByTestId('home-tab-discover').click();
  await expect(page).toHaveURL(/\/decouverte$/);
  await expect(page.getByTestId('discover-view')).toBeVisible();

  await tabs.getByTestId('home-tab-calendar').click();
  await expect(page).toHaveURL(/\/calendrier$/);
  await expect(page.getByTestId('calendar-view')).toBeVisible();

  await tabs.getByTestId('home-tab-dashboard').click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  await expect(page.getByTestId('dashboard-view')).toBeVisible();
});

test('accueil : une entrée « Accueil » dans le tiroir', async ({ page, isMobile }) => {
  await page.goto('/calendrier');
  await expect(page.getByTestId('calendar-view')).toBeVisible();
  if (isMobile) await page.getByTestId('nav-toggle').click();
  const drawer = page.getByTestId('nav-drawer');
  const home = drawer.locator('[data-drawer-item="sidebar.nav.home"]');
  await expect(home).toHaveText('Accueil');
  await expect(home).toHaveClass(/v-list-item--active/);
  await expect(drawer.locator('[data-drawer-item="tmdb"]')).toHaveCount(0);
  await expect(drawer.locator('[data-drawer-item="calendar"]')).toHaveCount(0);

  await home.click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
});
