// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours principal Sonarr (P3a.4), en desktop et en mobile, contre le faux
// Sonarr : bibliothèque et filtre, fiche et suivi, recherche d'un épisode et
// recherche interactive d'une saison (les épisodes entrent dans la file),
// import d'un téléchargement bloqué, ajout d'une série, pages de l'instance,
// redirection de la page d'une série.

import { expect, test, type Page } from '@playwright/test';
import { MOCKS_URL, SERIES_LIBRARY } from './env';
import { librarySearch, openServiceAdmin, openServicePage } from './nav';

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/sonarr/__reset`);
});

// Hubarr garde la bibliothèque en cache (45 s) : les tests ne dépendent pas du total.
async function openLibrary(page: Page, query = ''): Promise<void> {
  await page.goto(`${SERIES_LIBRARY}${query}`);
  await expect(page.getByTestId('series-stats')).toBeVisible();
  await expect(page.getByTestId('series-content')).toBeVisible();
}

test('bibliothèque : filtre, fiche et suivi', async ({ page }) => {
  await openLibrary(page);
  await page.getByTestId('status-ended').click();
  await expect(page).toHaveURL(/status=ended/);
  const content = page.getByTestId('series-content');
  await expect(content).toContainText('Brume');
  await expect(content).not.toContainText('Les Veilleurs');

  await content.getByText('Brume', { exact: true }).first().click();
  const detail = page.getByTestId('series-detail');
  await expect(detail.getByTestId('series-title')).toHaveText('Brume (2016)');
  await expect(detail.getByTestId('episode-row')).toHaveCount(4);

  const monitor = detail.getByTestId('series-monitor');
  await expect(monitor).toHaveText('Ne plus suivre');
  await monitor.click();
  await expect(monitor).toHaveText('Suivre');

  // Fiche en page (D130, page n° 195) : « Retour » ramène à la bibliothèque.
  await expect(page).toHaveURL(/\/series\/\d+$/);
  await detail.getByTestId('series-detail-close').click();
  await expect(page.getByTestId('series-detail')).toBeHidden();
  await expect(page.getByTestId('series-content')).toBeVisible();
});

test('fiche : recherche d’un épisode puis recherche interactive de la saison', async ({ page }) => {
  await openLibrary(page);
  await expect(page.getByTestId('series-queue-count')).toHaveText('1');
  await page.goto(`${SERIES_LIBRARY}?open=1`);
  await expect(page).toHaveURL(/\/series\/1$/);
  const detail = page.getByTestId('series-detail');
  await expect(detail.getByTestId('series-title')).toHaveText('Les Veilleurs (2021)');
  // Saison 2 ouverte : les épisodes 5 et 6 manquent ; le dernier en premier (V20).
  const rows = detail.getByTestId('episode-row');
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText('6');
  await rows.first().getByTestId('episode-search').click();
  await expect(detail.getByTestId('series-detail-banner')).toContainText(
    'téléchargement(s) lancé(s)',
  );

  await detail.getByTestId('season-interactive').first().click();
  // Releases en feuille (bottom sheet sur mobile, dialogue sur desktop).
  const sheet = page.getByTestId('series-releases');
  await expect(sheet.getByTestId('release-row')).toHaveCount(2);
  await expect(sheet.getByTestId('release-label').first()).toContainText('Saison 2');
  await sheet.getByTestId('release-grab').first().click();
  await expect(detail.getByTestId('series-detail-banner')).toContainText('Téléchargement lancé');
  await page.getByTestId('series-panel-back').click();
  await expect(sheet).toBeHidden();
  await expect(detail.getByTestId('series-seasons')).toBeVisible();

  await detail.getByTestId('series-detail-close').click();
  await expect(page.getByTestId('series-queue-count')).not.toHaveText('1', { timeout: 15_000 });
});

test('file d’attente : import d’un téléchargement bloqué', async ({ page }) => {
  await openLibrary(page);
  await expect(page.getByTestId('series-queue-count')).toHaveText('1');
  await page.getByTestId('series-queue-toggle').click();
  await expect(page.getByTestId('series-queue-warnings')).toContainText('import en attente');
  await page.getByTestId('series-queue-import').click();
  await expect(page.getByTestId('series-banner')).toContainText('importé');
  await expect(page.getByTestId('series-queue')).toBeHidden({ timeout: 15_000 });
});

test('ajout d’une série depuis la recherche', async ({ page, isMobile }) => {
  await openLibrary(page);
  await page.getByTestId('series-add').click();
  const dialog = page.getByTestId('add-series');
  await dialog.getByTestId('add-series-search').locator('input').fill('Archipel');
  await expect(dialog.getByTestId('add-series-result-item')).toHaveCount(1);
  await dialog.getByTestId('add-series-result-item').click();
  await expect(dialog.getByTestId('add-series-form')).toContainText('Archipel Nord (2022)');
  await dialog.getByTestId('add-series-confirm').click();
  await expect(dialog.getByTestId('add-series-result')).toContainText('Série ajoutée');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await librarySearch(page, isMobile, 'series-search').fill('Archipel');
  await expect(page.getByTestId('series-content')).toContainText('Archipel Nord');
});

test('pages de l’instance : manquants, historique, liste de blocage, système', async ({
  page,
  isMobile,
}) => {
  await openLibrary(page);
  const nav = 'sonarr-nav';

  // Mobile : manquants et historique sont dans « Serveur » (P5c.6, D143).
  await openServicePage(page, isMobile, { nav, tab: 'Manquants', serverItem: 'sonarr-missing' });
  await expect(page).toHaveURL(/\/series\/manquants$/);
  await expect(page.getByTestId('missing-row').first()).toBeVisible();

  await openServicePage(page, isMobile, { nav, tab: 'Historique', serverItem: 'sonarr-history' });
  await expect(page.getByTestId('history-row').first()).toBeVisible();

  await openServicePage(page, isMobile, {
    nav,
    tab: 'Blocklist',
    serverItem: 'sonarr-blocklist',
  });
  await expect(page.getByTestId('blocklist-row')).toHaveCount(1);
  await expect(page.getByTestId('blocklist-row')).toContainText('Brume');

  // État du système : administration, depuis les paramètres de Hubarr (P5c.4, D140).
  await openServiceAdmin(page, 'sonarr', 'instance-settings-series', 'sonarr-system');
  await expect(page.getByTestId('system-status')).toContainText('4.0.20.3014');
});

test('page d’une série (n° 195) : la fiche en page', async ({ page }) => {
  await page.goto(`${SERIES_LIBRARY}/2`);
  await expect(page).toHaveURL(/\/series\/2$/);
  await expect(page.getByTestId('series-title')).toHaveText('Brume (2016)');
});

test('onglets « Prochains » et « File d’attente » (P5c.6, V17, V18)', async ({
  page,
  isMobile,
}) => {
  await openLibrary(page);
  const nav = 'sonarr-nav';
  await openServicePage(page, isMobile, { nav, tab: 'Prochains', bottomLabel: 'Prochains' });
  await expect(page).toHaveURL(/\/series\/prochains$/);
  await expect(page.getByTestId('sonarr-upcoming-page')).toBeVisible();

  await openServicePage(page, isMobile, {
    nav,
    tab: "File d'attente",
    bottomLabel: "File d'attente",
  });
  await expect(page).toHaveURL(/\/series\/file-attente$/);
  await expect(page.getByTestId('series-queue-row').first()).toBeVisible();
  await page.getByTestId('series-queue-rescan').first().click();
  await expect(page.getByText(/Commande lancée/)).toBeVisible();
});
