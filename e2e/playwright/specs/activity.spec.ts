// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours d'activité (P3e.4), en desktop et en mobile, contre les faux
// Tautulli et Tracearr : lecture en cours avec affiche proxifiée,
// statistiques, graphiques, historique (« Charger plus »), métadonnées ;
// proxy d'images d'Emby ; « Vu » via Tracearr (lot 7).

import { expect, test } from '@playwright/test';
import { LIBRARY, SERIES_LIBRARY } from './env';

test('Tautulli : en cours, statistiques, graphiques, historique et métadonnées', async ({
  page,
}) => {
  await page.goto('/tautulli');
  const card = page.getByTestId('session-card');
  await expect(card).toContainText('Orbite Basse');
  await expect(card.locator('img')).toHaveAttribute('src', /^api\/tautulli\/image\?img=/);
  await expect(page.getByTestId('tautulli-stats')).toContainText('Les Veilleurs');
  await expect(page.getByTestId('bar-chart').first()).toBeVisible();
  const rows = page.getByTestId('tautulli-history-row');
  await expect(rows).toHaveCount(25);
  await page.getByTestId('tautulli-history-more').click();
  await expect(rows).toHaveCount(40);
  await card.click();
  await expect(page.getByTestId('tautulli-metadata')).toContainText('signal');

  // Tableau de bord (source Tautulli) : la même fenêtre que la page.
  await page.goto('/tableau-de-bord');
  await page.getByTestId('card-activity').getByTestId('activity-row').first().click();
  await expect(page.getByTestId('tautulli-metadata')).toContainText('signal');
});

test('Tracearr : onglets (résumé, en cours, statistiques, historique, utilisateurs) et détail d’une lecture', async ({
  page,
  isMobile,
}) => {
  // Onglets en haut sur desktop, barre basse sur mobile (P5c.7, V9).
  const go = async (label: string) => {
    if (isMobile)
      await page.getByTestId('service-bottom-nav').getByRole('link', { name: label }).click();
    else await page.getByTestId('tracearr-nav').getByRole('tab', { name: label }).click();
  };
  await page.goto('/tracearr');
  await expect(page.getByTestId('tracearr-stats')).toContainText('87');
  await expect(page.getByTestId('tracearr-history-row')).toHaveCount(5);

  await go('En cours');
  await expect(page).toHaveURL(/\/tracearr\/en-cours$/);
  const card = page.getByTestId('session-card');
  await expect(card).toContainText('Les Veilleurs — S01E03 · Le Guet');
  // Détail d'une lecture (V19), bottom sheet sur mobile.
  await card.click();
  await expect(page.getByTestId('session-detail')).toBeVisible();
  await page.keyboard.press('Escape');
  // Arrêt d'une lecture (admin) : confirmation avec message, puis fermeture du détail.
  await card.click();
  await page.getByTestId('session-detail-terminate').click();
  await expect(page.getByTestId('session-terminate-message')).toContainText('Les Veilleurs');
  await page.getByTestId('session-terminate-reason').locator('input').fill('Pause dîner');
  await page.getByTestId('session-terminate-confirm').click();
  await expect(page.getByTestId('session-detail')).toBeHidden();
  await expect(page.getByText('Lecture arrêtée')).toBeVisible();

  await go('Statistiques');
  await expect(page.getByTestId('tracearr-quality')).toBeVisible();
  await page.getByTestId('tracearr-period').getByRole('button').first().click();

  await go('Historique');
  const rows = page.getByTestId('tracearr-history-row');
  await expect(rows).toHaveCount(24);
  await page.getByTestId('tracearr-history-more').click();
  await expect(rows).toHaveCount(28);

  await go('Utilisateurs');
  await expect(page.getByTestId('tracearr-users')).toContainText('alice');

  // Fiche d'un utilisateur (P5d.2, V23) : historique et statistiques.
  await expect(page.getByTestId('tracearr-user-card')).toHaveCount(2);
  await page.getByTestId('tracearr-user-card').filter({ hasText: 'bob' }).click();
  await expect(page).toHaveURL(/\/tracearr\/utilisateurs\/[A-Za-z0-9_-]{22}$/);
  await expect(page.getByTestId('tracearr-user-name')).toContainText('bob');
  // 9 épisodes de « Les Veilleurs » sur Android TV dans l'historique simulé.
  await expect(page.getByTestId('tracearr-user-stats')).toContainText('9');
  await expect(page.getByTestId('tracearr-user-top')).toContainText('Les Veilleurs');
  await expect(page.getByTestId('tracearr-user-platforms')).toContainText('Android TV');
  await expect(page.getByTestId('tracearr-user-history-row')).toHaveCount(9);
  if (isMobile)
    await expect(
      page.getByTestId('service-bottom-nav').getByRole('link', { name: 'Utilisateurs' }),
    ).toHaveClass(/active/);
  await page.getByTestId('tracearr-user-back').click();
  await expect(page).toHaveURL(/\/tracearr\/utilisateurs$/);
});

test('Tracearr : « Vu » après association du compte dans le profil', async ({ page }) => {
  await page.goto('/profil');
  const card = page.getByTestId('profile-tracearr');
  await card.getByTestId('profile-tracearr-account').click();
  await page.getByRole('option', { name: 'alice' }).click();
  // Premier import en arrière-plan : la carte se relit jusqu'à sa fin.
  await expect(card.getByTestId('profile-tracearr-sync')).toContainText('3 lectures');

  try {
    // Film vu : badge dans la bibliothèque (carte sur desktop, ligne de la
    // vue liste sur mobile) et sur la fiche.
    await page.goto(LIBRARY);
    const movie = page
      .locator('[data-test="poster-card"], .movie-row')
      .filter({ has: page.getByText('Orbite Basse', { exact: true }) });
    await expect(movie.getByTestId('watched-badge')).toHaveText('Vu');
    await page.goto(`${LIBRARY}/1`);
    await expect(page.getByTestId('movie-detail').getByTestId('watched-badge')).toHaveText('Vu');

    // Série : épisodes vus sur la carte, la fiche, la saison et les épisodes.
    await page.goto(SERIES_LIBRARY);
    const series = page
      .locator('[data-test="poster-card"], .series-row')
      .filter({ has: page.getByText('Les Veilleurs', { exact: true }) });
    await expect(series.getByTestId('watched-badge')).toHaveText(/^2\/\d+ vus$/);
    await page.goto(`${SERIES_LIBRARY}/1`);
    await expect(page.getByTestId('series-badges').getByTestId('watched-badge')).toHaveText(
      /^2\/\d+ vus$/,
    );
    const season = page.locator('[data-season="1"]');
    await expect(season.getByTestId('season-watched')).toHaveText(/^2\/\d+ vus$/);
    if ((await season.getByTestId('episode-row').count()) === 0)
      await season.locator('.season__toggle').click();
    await expect(season.getByTestId('episode-watched')).toHaveCount(2);

    // Tableau de bord : tendances TMDB et derniers ajouts.
    await page.goto('/tableau-de-bord');
    const tile = (card: string, title: string) =>
      page
        .getByTestId(card)
        .locator('.v-card')
        .filter({ has: page.getByText(title, { exact: true }) })
        .getByTestId('watched-badge');
    await expect(tile('card-trending', 'Orbite Basse')).toHaveText('Vu');
    await expect(tile('card-recent', 'Les Veilleurs')).toHaveText(/^2\/\d+ vus$/);
  } finally {
    // Dissociation : les autres parcours voient la bibliothèque sans badge.
    await page.goto('/profil');
    await page.getByTestId('profile-tracearr-account').locator('.v-field__clearable').click();
    await expect(page.getByTestId('profile-tracearr-sync')).toHaveCount(0);
  }
});

test('Emby : activité et proxy d’images', async ({ request }) => {
  const activity = await request.get('/api/emby/activity');
  const body = (await activity.json()) as { streamCount: number; sessions: { poster: string }[] };
  expect(body.streamCount).toBe(1);
  const image = await request.get(body.sessions[0]?.poster ?? '');
  expect(image.headers()['content-type']).toBe('image/png');
});
