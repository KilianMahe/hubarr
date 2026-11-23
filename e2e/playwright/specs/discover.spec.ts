// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours P4 (P4.6), en desktop et en mobile, contre les faux Radarr,
// Sonarr, Seerr et TMDB : tableau de bord (cartes indépendantes, aperçu
// rapide), calendrier et flux iCal, découverte (fiche, watchlist, ajout
// rapide à Radarr), recherche globale.

import { expect, test } from '@playwright/test';
import { MOCKS_URL } from './env';

test.beforeEach(async ({ request }) => {
  for (const service of ['radarr', 'sonarr', 'seerr', 'tmdb']) {
    await request.post(`${MOCKS_URL}/${service}/__reset`);
  }
});

test('tableau de bord : bandeau, cartes, aperçu rapide d’un ajout récent', async ({ page }) => {
  await page.goto('/tableau-de-bord');
  await expect(page.getByTestId('dashboard-hero')).toContainText('Admin E2E');
  await expect(page.getByTestId('hero-stat').first().locator('.stat-tile__value')).not.toHaveText(
    '—',
  );
  await expect(page.getByTestId('card-health')).toContainText('Films');
  await expect(page.getByTestId('card-upcoming')).toContainText('Orbite Basse III');
  await expect(page.getByTestId('card-requests')).toContainText('bob');
  await expect(page.getByTestId('card-trending')).toContainText('Nébuleuse');
  await page.getByTestId('card-recent').locator('.v-card').first().click();
  await expect(page.getByTestId('quicklook')).toBeVisible();
  await expect(page.getByTestId('quicklook-action')).toHaveAttribute(
    'href',
    /\/medias\/[^/]+\/(films|series)\/\d+$/,
  );
});

test('calendrier : sorties dédoublonnées, vue jour, flux iCal', async ({
  page,
  request,
  isMobile,
}) => {
  await page.goto('/calendrier');
  await page.getByTestId('view-day').click();
  await expect(page.getByTestId('calendar-day')).toBeVisible();
  await page.getByTestId('view-month').click();
  if (isMobile) {
    // Mobile (P5c.3, V12) : une pastille par sortie, le jour touché listé sous la grille.
    const month = page.getByTestId('calendar-month');
    await expect(month.locator('.cal-dot').first()).toBeVisible();
    await month.locator('[role="button"]:has(.cal-dot)').first().click();
    await expect(page.getByTestId('calendar-month-day')).not.toContainText('Rien de prévu');
  } else {
    const month = page.getByTestId('calendar-month');
    await expect(month).toContainText('Orbite Basse III');
    // Desktop (P5d.5, V26) : un clic sur un jour met à jour la liste du dessous, sans changer de vue.
    // Clic sur le numéro du jour : un clic sur une sortie ouvre son aperçu.
    await month
      .locator('[role="button"]', { hasText: 'Orbite Basse III' })
      .first()
      .click({ position: { x: 10, y: 10 } });
    await expect(month).toBeVisible();
    await expect(page.getByTestId('calendar-day')).toContainText('Orbite Basse III');
  }
  const ics = await request.get('/calendrier.ics');
  expect(ics.status()).toBe(200);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const body = await ics.text();
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain('UID:radarr-tmdb-9003-digital@hubarr.local');
});

test('découverte : fiche par l’URL, watchlist, puis page Watchlist', async ({ page }) => {
  await page.goto('/decouverte');
  await expect(
    page.getByTestId('media-card-movie-9001').first().getByTestId('lib-status'),
  ).toBeVisible();
  await page.getByTestId('media-card-movie-9801').first().click();
  await expect(page).toHaveURL(/detail=movie\/9801/);
  const detail = page.getByTestId('tmdb-detail');
  await expect(detail).toContainText('Jeanne Réalisatrice');
  await detail.getByTestId('detail-watchlist').click();
  await expect(detail.getByTestId('detail-watchlist')).toContainText('watchlist', {
    ignoreCase: true,
  });
  await page.goto('/decouverte/watchlist');
  await expect(page.getByTestId('watchlist-item-9801')).toBeVisible();
  await page.getByTestId('watchlist-item-9801').getByTestId('watchlist-remove').click();
  await page
    .getByRole('button', { name: /confirmer|supprimer/i })
    .last()
    .click();
  await expect(page.getByTestId('watchlist-item-9801')).toHaveCount(0);
});

test('découverte : recherche puis ajout rapide à Radarr', async ({ page }) => {
  await page.goto('/decouverte');
  await page.getByTestId('discover-search').locator('input').fill('grand détour');
  await expect(page.getByTestId('best-match')).toContainText('Le Grand Détour');
  await page.getByTestId('best-match').click();
  await page.getByTestId('tmdb-detail').getByTestId('detail-add').click();
  const dialog = page.getByTestId('quick-add-dialog');
  await expect(dialog).toContainText('Le Grand Détour');
  await page.getByTestId('qa-submit').click();
  await expect(page.getByTestId('qa-submit')).toBeDisabled();
});

test('recherche globale : bibliothèque et en ligne', async ({ page, isMobile }) => {
  await page.goto('/profil');
  if (isMobile) {
    await page.getByTestId('global-search-open').click();
    await page.getByRole('dialog').locator('input').fill('orbite');
    await expect(page.getByRole('dialog')).toContainText('Orbite Basse II');
  } else {
    await page.getByTestId('global-search').locator('input').fill('orbite');
    await expect(page.getByTestId('global-search-results')).toContainText('Orbite Basse II');
    await page.getByTestId('search-hit-local').first().click();
    await expect(page.getByTestId('quicklook')).toBeVisible();
  }
});
