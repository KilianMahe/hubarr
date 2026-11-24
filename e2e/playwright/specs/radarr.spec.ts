// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours principal Radarr (P2.8), en desktop et en mobile, contre le faux
// Radarr : bibliothèque et filtre, fiche et suivi, recherche interactive et
// grab (le film entre dans la file), ajout d'un film, pages de l'instance.

import { expect, test, type Page } from '@playwright/test';
import { LIBRARY, MOCKS_URL } from './env';
import { librarySearch, openServiceAdmin, openServicePage } from './nav';

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/radarr/__reset`);
});

// Hubarr garde la bibliothèque en cache (45 s) : après la remise à zéro du faux
// Radarr, elle peut encore montrer un film ajouté par un test précédent. Les
// tests ne dépendent donc pas du total.
async function openLibrary(page: Page, query = ''): Promise<void> {
  await page.goto(`${LIBRARY}${query}`);
  await expect(page.getByTestId('movies-stats')).toBeVisible();
  await expect(page.getByTestId('movies-content')).toBeVisible();
}

test('bibliothèque : filtre, fiche et suivi', async ({ page, isMobile }) => {
  await openLibrary(page);
  await (await librarySearch(page, isMobile, 'movies-search')).fill('Orbite');
  await expect(page).toHaveURL(/q=Orbite/);
  const content = page.getByTestId('movies-content');
  await expect(content).toContainText('Orbite Basse II');
  await expect(content).not.toContainText('Archipel');

  await content.getByText('Orbite Basse II', { exact: true }).first().click();
  const detail = page.getByTestId('movie-detail');
  await expect(detail.getByTestId('movie-title')).toHaveText('Orbite Basse II (2022)');
  await expect(detail.getByTestId('movie-techinfo')).toContainText('WEBDL-2160p');
  await expect(detail).toContainText('Inès Morel');

  const monitor = detail.getByTestId('movie-monitor');
  await expect(monitor).toHaveText('Ne plus suivre');
  await monitor.click();
  await expect(monitor).toHaveText('Suivre');

  // Fiche en page (D130) : « Retour » ramène à la bibliothèque filtrée.
  await expect(page).toHaveURL(/\/films\/\d+$/);
  await detail.getByTestId('movie-detail-close').click();
  await expect(page.getByTestId('movie-detail')).toBeHidden();
  await expect(page).toHaveURL(/q=Orbite/);
});

test('fiche : recherche interactive et grab, le film entre dans la file', async ({ page }) => {
  await openLibrary(page);
  await expect(page.getByTestId('queue-count')).toHaveText('1');
  // L'ancien lien profond `?open=` mène à la page du film.
  await page.goto(`${LIBRARY}?open=7`);
  await expect(page).toHaveURL(/\/films\/7$/);
  const detail = page.getByTestId('movie-detail');
  await expect(detail.getByTestId('movie-title')).toHaveText('Minuit à Valparaíso (2023)');
  await detail.getByTestId('movie-interactive').click();
  // Releases en feuille (bottom sheet sur mobile, dialogue sur desktop).
  const releases = page.getByTestId('movie-releases');
  await expect(releases.getByTestId('release-row')).toHaveCount(3);
  await releases.getByTestId('release-grab').first().click();
  await expect(detail.getByTestId('movie-feedback')).toContainText('Téléchargement lancé');
  await page.keyboard.press('Escape');
  await expect(releases).toBeHidden();
  await detail.getByTestId('movie-detail-close').click();
  await expect(page.getByTestId('queue-count')).toHaveText('2', { timeout: 15_000 });
});

test('fiche : suggestions TMDB, fiche TMDB ou fiche Hubarr', async ({ page }) => {
  await page.goto(`${LIBRARY}/7`);
  const detail = page.getByTestId('movie-detail');
  await expect(detail.getByTestId('movie-title')).toHaveText('Minuit à Valparaíso (2023)');
  // Faux TMDB : recommandations « Le Grand Détour » et « Nébuleuse » ; le
  // doublon est retiré des similaires, où reste « Orbite Basse » (possédé).
  const recommendations = detail.getByTestId('suggestions-recommendations');
  await expect(recommendations).toContainText('Nébuleuse');
  const similar = detail.getByTestId('suggestions-similar');
  await expect(similar).not.toContainText('Le Grand Détour');
  await recommendations.getByTestId('media-card-movie-9801').click();
  const tmdb = page.getByTestId('tmdb-detail');
  await expect(tmdb).toContainText('Nébuleuse');
  await tmdb.getByTestId('dialog-close').click();
  await expect(tmdb).toBeHidden();
  await similar.getByTestId('media-card-movie-9001').click();
  await expect(page).toHaveURL(/\/films\/1$/);
  await expect(detail.getByTestId('movie-title')).toHaveText('Orbite Basse (2019)');
});

test('ajout d’un film depuis la recherche', async ({ page, isMobile }) => {
  await openLibrary(page);
  await page.getByTestId('movies-add').click();
  const dialog = page.getByTestId('add-movie');
  await dialog.getByTestId('add-movie-search').locator('input').fill('Détour');
  await expect(dialog.getByTestId('add-movie-result-item')).toHaveCount(2);
  await dialog.getByTestId('add-movie-result-item').first().getByTestId('add-movie-pick').click();
  await expect(dialog.getByTestId('add-movie-form')).toContainText('Le Grand Détour (2020)');
  // « Retour » : la recherche et ses résultats sont conservés.
  await dialog.getByTestId('add-movie-back').click();
  await expect(dialog.getByTestId('add-movie-form')).toBeHidden();
  await expect(dialog.getByTestId('add-movie-search').locator('input')).toHaveValue('Détour');
  await expect(dialog.getByTestId('add-movie-result-item')).toHaveCount(2);
  await dialog.getByTestId('add-movie-result-item').first().getByTestId('add-movie-pick').click();
  await expect(dialog.getByTestId('add-movie-form')).toContainText('Le Grand Détour (2020)');
  await dialog.getByTestId('add-movie-confirm').click();
  await expect(dialog.getByTestId('add-movie-result')).toContainText('Le Grand Détour');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Le film ajouté apparaît dans la bibliothèque (relue après l'ajout).
  await (await librarySearch(page, isMobile, 'movies-search')).fill('Détour');
  await expect(page.getByTestId('movies-content')).toContainText('Le Grand Détour');
});

test('pages de l’instance : manquants, historique, collections, système', async ({
  page,
  isMobile,
}) => {
  await openLibrary(page);
  const nav = 'radarr-nav';

  await openServicePage(page, isMobile, { nav, tab: 'Manquants', bottomLabel: 'Manquants' });
  await expect(page).toHaveURL(/\/films\/manquants$/);
  await expect(page.getByTestId('missing-row').first()).toBeVisible();

  // Mobile : l'historique est dans « Serveur » (P5c.6, D143).
  await openServicePage(page, isMobile, { nav, tab: 'Historique', serverItem: 'radarr-history' });
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  await page.getByTestId('history-filter-1').click();
  await expect(page).toHaveURL(/eventType=1/);

  await openServicePage(page, isMobile, {
    nav,
    tab: 'Collections',
    serverItem: 'radarr-collections',
  });
  await expect(page.getByTestId('collection-card')).toHaveCount(1);
  await page.getByTestId('collection-monitor').click();
  await expect(page.getByTestId('collection-monitor')).toHaveText('Ne plus suivre');

  // État du système : administration, depuis les paramètres de Hubarr (P5c.4, D140).
  await openServiceAdmin(page, 'radarr', 'instance-settings-films', 'radarr-system');
  await expect(page.getByTestId('system-status')).toContainText('5.14.0.9383');
  await expect(page.getByTestId('system-health')).toContainText('Un indexeur ne répond pas');
});

test('onglet « File d’attente » : fiche du film, actualiser (P5c.6, V18)', async ({
  page,
  isMobile,
}) => {
  await openLibrary(page);
  await openServicePage(page, isMobile, {
    nav: 'radarr-nav',
    tab: "File d'attente",
    bottomLabel: "File d'attente",
  });
  await expect(page).toHaveURL(/\/films\/file-attente$/);
  await expect(page.getByTestId('queue-item').first()).toBeVisible();
  await page.getByTestId('queue-refresh').first().click();
  await expect(page.getByText(/Commande lancée/)).toBeVisible();
  await page.getByTestId('queue-open').first().click();
  await expect(page).toHaveURL(/\/films\/\d+$/);
});
