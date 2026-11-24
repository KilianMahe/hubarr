// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours P4 (P4.6), en desktop et en mobile, contre les faux Radarr,
// Sonarr, Seerr et TMDB : tableau de bord (cartes indépendantes, aperçu
// rapide), calendrier et flux iCal, découverte (fiche, watchlist, ajout
// rapide à Radarr, suggestions du lot 8, sous-onglets du lot 12), recherche
// globale.

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
    // Les sorties de la case ne s'ouvrent pas : un clic dessus choisit le jour.
    await month.locator('.cal-block', { hasText: 'Orbite Basse III' }).first().click();
    await expect(month).toBeVisible();
    await expect(page.getByTestId('quicklook')).toBeHidden();
    await expect(page.getByTestId('calendar-day')).toContainText('Orbite Basse III');
  }
  // Couleur par statut de téléchargement : Cartographes (hier) est dans la file.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/calendrier?view=day&date=${yesterday}`);
  const queued = page.getByTestId('calendar-event').filter({ hasText: 'Cartographes' });
  await expect(queued.getByTestId('calendar-event-status')).toHaveText(
    'En cours de téléchargement',
  );
  await page.getByTestId('calendar-status-downloaded').click();
  await expect(queued).toBeHidden();
  await page.getByTestId('calendar-status-all').click();
  const ics = await request.get('/calendrier.ics');
  expect(ics.status()).toBe(200);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const body = await ics.text();
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain('UID:radarr-tmdb-9003-digital@hubarr.local');
});

test('découverte : fiche par l’URL, watchlist, puis page Watchlist', async ({ page }) => {
  await page.goto('/decouverte?onglet=tendances');
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

test('découverte : sous-onglets, suggestions d’après Tracearr, par dossier racine, par année', async ({
  page,
}) => {
  // alice a vu « Orbite Basse » (TMDB 9001) et des épisodes des « Veilleurs ».
  await page.goto('/profil');
  const card = page.getByTestId('profile-tracearr');
  await card.getByTestId('profile-tracearr-account').click();
  await page.getByRole('option', { name: 'alice' }).click();
  await expect(card.getByTestId('profile-tracearr-sync')).toContainText('3 lectures');
  try {
    // « Pour vous » par défaut, sans les requêtes des autres onglets.
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto('/decouverte');
    await expect(page.getByTestId('discover-tab-pour-vous')).toHaveClass(/text-primary/);
    const watched = page.getByTestId('discover-watched');
    await expect(watched).toContainText('Nébuleuse');
    await expect(watched.getByTestId('media-card-movie-9001')).toHaveCount(0);

    // Dossier racine « /movies » du faux Radarr : sans les films possédés.
    const folder = page.getByTestId('discover-folder').filter({ hasText: 'Pour « movies »' });
    await expect(folder).toContainText('Nébuleuse');
    await expect(folder.getByTestId('media-card-movie-9001')).toHaveCount(0);

    expect(requests.some((path) => path.endsWith('/api/decouverte'))).toBe(false);
    expect(requests.some((path) => path.includes('/api/decouverte/annee/'))).toBe(false);

    await page.getByTestId('discover-tab-par-annee').click();
    await expect(page).toHaveURL(/onglet=par-annee/);
    await expect(watched).toHaveCount(0);
    const byYear = page.getByTestId('discover-by-year');
    await expect(byYear).toContainText(`Populaires en ${new Date().getFullYear()}`);
    await expect(
      byYear.getByTestId('media-card-movie-9001').getByTestId('lib-status'),
    ).toBeVisible();
    await byYear.getByTestId('by-year-tv').click();
    await expect(byYear).toContainText('Les Veilleurs');

    // Rangée sans barre de défilement : flèches aux bords, la précédente au-delà du début.
    await expect(byYear.locator('.scroll-row__track')).toHaveCSS('scrollbar-width', 'none');
    await expect(byYear.getByTestId('scroll-prev')).toBeHidden();

    // Onglet mémorisé dans l'URL : il survit au rechargement.
    await page.getByTestId('discover-tab-mieux-notes').click();
    await expect(page).toHaveURL(/onglet=mieux-notes/);
    await page.reload();
    await expect(page.getByTestId('discover-tab-mieux-notes')).toHaveClass(/text-primary/);
    await expect(page.getByText('Films les mieux notés')).toBeVisible();
  } finally {
    await page.goto('/profil');
    await page.getByTestId('profile-tracearr-account').locator('.v-field__clearable').click();
    await expect(page.getByTestId('profile-tracearr-sync')).toHaveCount(0);
  }
});

test('explorateur : filtre par année précise, qui remplace la décennie', async ({ page }) => {
  await page.goto('/decouverte/explorer');
  await page.getByText('Années 1990').click();
  await page.getByTestId('explorer-year').click();
  await page.getByRole('option', { name: '2020', exact: true }).click();
  const request = page.waitForRequest((r) => r.url().includes('/api/decouverte/filter'));
  await page.getByTestId('explorer-search').click();
  const url = new URL((await request).url());
  expect(url.searchParams.get('year_min')).toBe('2020');
  expect(url.searchParams.get('year_max')).toBe('2020');
  await expect(page.getByTestId('media-card-movie-9801')).toBeVisible();
});

test('animés : type de l’explorateur (séries par défaut) et filtre de la recherche', async ({
  page,
}) => {
  await page.goto('/decouverte/explorer');
  await page.getByTestId('explorer-type-anime').click();
  await expect(page.getByTestId('explorer-anime-type')).toBeVisible();
  let request = page.waitForRequest((r) => r.url().includes('/api/decouverte/filter'));
  await page.getByTestId('explorer-search').click();
  let url = new URL((await request).url());
  expect(url.searchParams.get('type')).toBe('tv');
  expect(url.searchParams.get('anime')).toBe('1');
  await page.getByTestId('explorer-anime-type').getByRole('button', { name: 'Films' }).click();
  request = page.waitForRequest((r) => r.url().includes('/api/decouverte/filter'));
  await page.getByTestId('explorer-search').click();
  url = new URL((await request).url());
  expect(url.searchParams.get('type')).toBe('movie');

  await page.goto('/decouverte');
  request = page.waitForRequest(
    (r) => r.url().includes('/api/decouverte/recherche') && r.url().includes('anime=1'),
  );
  await page.getByTestId('discover-type-anime').click();
  url = new URL((await request).url());
  expect(url.searchParams.get('type')).toBe('all');
  await expect(page.getByTestId('search-results')).toBeVisible();
});

test('découverte : recherche puis ajout rapide à Radarr', async ({ page }) => {
  await page.goto('/decouverte');
  await page.getByTestId('discover-search').locator('input').fill('grand détour');
  await expect(page.getByTestId('best-match')).toContainText('Le Grand Détour');
  await page.getByTestId('best-match').click();
  await page.getByTestId('tmdb-detail').getByTestId('detail-add').click();
  const dialog = page.getByTestId('quick-add-dialog');
  await expect(dialog).toContainText('Le Grand Détour');
  const added = page.waitForResponse((r) => r.url().endsWith('/api/medias/films/films/add'));
  await page.getByTestId('qa-submit').click();
  await expect(page.getByTestId('qa-submit')).toBeDisabled();
  // Retrait par Hubarr, qui vide sa bibliothèque en cache : la réinitialisation
  // du faux Radarr ne l'atteint pas, et le passage suivant (mobile) verrait
  // le film comme déjà présent, sans bouton « Ajouter ».
  const { movieId } = (await (await added).json()) as { movieId: number };
  const { token } = (await (await page.request.get('/api/auth/csrf')).json()) as { token: string };
  const removed = await page.request.post(`/api/medias/films/films/${movieId}/delete`, {
    data: {},
    headers: { 'x-csrf-token': token },
  });
  expect(removed.ok()).toBe(true);
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
