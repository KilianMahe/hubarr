// SPDX-License-Identifier: AGPL-3.0-or-later
// Captures de référence (P5b) des 6 écrans maquettés en P0 et du tiroir, en
// desktop (1440 px) et en mobile, à comparer avec les maquettes de P0. Les images sont écrites dans `screenshots/<projet>/` et
// versionnées : elles servent de référence visuelle, sans comparaison au pixel
// (les données des faux services et l'heure varient).

import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { LIBRARY, MOCKS_URL, SERIES_LIBRARY } from './env';
import { openServiceAdmin } from './nav';

test.beforeEach(async ({ request }) => {
  for (const service of ['radarr', 'qbittorrent', 'seerr']) {
    await request.post(`${MOCKS_URL}/${service}/__reset`);
  }
});

async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  ready: Locator,
  fullPage = false,
): Promise<void> {
  await expect(ready).toBeVisible();
  // Images proxifiées et transitions Vuetify.
  await page.waitForLoadState('load');
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `screenshots/${info.project.name}/${name}.png`, fullPage });
}

test('tableau de bord', async ({ page }, info) => {
  await page.goto('/tableau-de-bord');
  await capture(page, info, '1-dashboard', page.getByTestId('dashboard-view'), true);
});

test('liste des films', async ({ page }, info) => {
  await page.goto(LIBRARY);
  await capture(page, info, '2-films', page.getByTestId('movies-content'));
});

test('fiche film', async ({ page }, info) => {
  await page.goto(`${LIBRARY}/7`);
  await capture(page, info, '3-film', page.getByTestId('movie-detail'));
});

test('fiche série', async ({ page }, info) => {
  await page.goto(`${SERIES_LIBRARY}/1`);
  await capture(page, info, '3b-serie', page.getByTestId('series-detail'), true);
});

test('qBittorrent', async ({ page }, info) => {
  await page.goto('/qbittorrent');
  await capture(page, info, '4-qbittorrent', page.getByTestId('torrent-row').first());
});

test('demandes Seerr', async ({ page }, info) => {
  await page.goto('/jellyseerr');
  await capture(page, info, '5-seerr', page.getByTestId('seerr-request').first());
});

test('réglages', async ({ page }, info) => {
  await page.goto('/admin/settings');
  await capture(page, info, '6-settings', page.getByTestId('tab-services'));
});

test('tiroir', async ({ page }, info) => {
  await page.goto(LIBRARY);
  await expect(page.getByTestId('movies-content')).toBeVisible();
  if (info.project.name === 'mobile') await page.getByTestId('nav-toggle').click();
  await capture(page, info, '7-drawer', page.getByTestId('nav-drawer'));
});

// Habillage mobile (P5b.4) : onglet « Serveur », actions de la fiche,
// sélection par appui long (barre contextuelle en haut).
test('onglet « Serveur » Radarr', async ({ page }, info) => {
  await page.goto('/medias/films/radarr/serveur');
  await capture(page, info, '8-server', page.getByTestId('server-panel'), true);
});

test('actions de la fiche (mobile)', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'Disposition propre au mobile');
  await page.goto(`${LIBRARY}/7`);
  await expect(page.getByTestId('movie-detail')).toBeVisible();
  // Sur mobile aussi, les actions sont dans la page, sans menu à ouvrir.
  await capture(page, info, '9-detail-actions', page.getByTestId('movie-interactive'));
});

test('sélection par appui long (mobile)', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'Appui long propre au mobile');
  await page.goto(LIBRARY);
  const row = page.getByTestId('movies-content').locator('.movie-row, .poster-card').first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  if (box === null) throw new Error('ligne invisible');
  const point = { identifier: 0, clientX: box.x + 20, clientY: box.y + 20 };
  await row.dispatchEvent('touchstart', { touches: [point], changedTouches: [point] });
  await page.waitForTimeout(700);
  await row.dispatchEvent('touchend', { touches: [], changedTouches: [point] });
  await capture(page, info, '10-selection', page.getByTestId('selection-bar'));
});

// Évolutions d'usage (P5c) : écrans retouchés, captures de référence.
test('P5c recherche globale ancrée sous le champ (desktop)', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Champ de la barre du haut propre au grand écran');
  await page.goto('/tableau-de-bord');
  await expect(page.getByTestId('dashboard-view')).toBeVisible();
  const field = page.getByTestId('global-search');
  await field.locator('input').fill('ma');
  const results = page.getByTestId('global-search-results');
  await expect(results).toBeVisible();
  // Bord gauche des résultats aligné sur celui du champ, juste en dessous (V3).
  const [fieldBox, resultsBox] = [await field.boundingBox(), await results.boundingBox()];
  if (fieldBox === null || resultsBox === null) throw new Error('boîtes invisibles');
  expect(Math.abs(resultsBox.x - fieldBox.x)).toBeLessThan(4);
  expect(resultsBox.y - (fieldBox.y + fieldBox.height)).toBeLessThan(16);
  await capture(page, info, '11-search', results);
});

test('P5c calendrier, mois puis semaine', async ({ page }, info) => {
  await page.goto('/calendrier?view=month');
  await capture(page, info, '12-calendar-month', page.getByTestId('calendar-month'), true);
  await page.getByTestId('view-week').click();
  await capture(page, info, '13-calendar-week', page.getByTestId('calendar-week'), true);
});

test('P5c ajout de film sans recherche saisie', async ({ page }, info) => {
  await page.goto(LIBRARY);
  await expect(page.getByTestId('movies-content')).toBeVisible();
  await page.getByTestId('movies-add').click();
  await capture(page, info, '14-add-movie', page.getByTestId('add-suggestions'));
});

test('ajout de film, formulaire', async ({ page }, info) => {
  await page.goto(LIBRARY);
  await expect(page.getByTestId('movies-content')).toBeVisible();
  await page.getByTestId('movies-add').click();
  const dialog = page.getByTestId('add-movie');
  await dialog.getByTestId('add-movie-search').locator('input').fill('Détour');
  await dialog.getByTestId('add-movie-result-item').first().getByTestId('add-movie-pick').click();
  await capture(page, info, '14b-add-movie-form', dialog.getByTestId('add-movie-form'));
});

test('P5d paramètres d’un service, onglets groupes puis pages', async ({
  page,
  isMobile,
}, info) => {
  await openServiceAdmin(page, 'radarr', 'instance-settings-films', 'radarr-tags');
  if (isMobile) await expect(page.getByTestId('topbar-title')).toHaveText('Radarr · Tags');
  else await expect(page.getByTestId('admin-link-radarr-tags')).toHaveClass(/v-tab--selected/);
  await page.screenshot({
    path: `screenshots/${info.project.name}/15-service-settings.png`,
    fullPage: !isMobile,
  });
});

test('P5d Tracearr, utilisateurs puis statistiques', async ({ page }, info) => {
  await page.goto('/tracearr/utilisateurs');
  await expect(page.getByTestId('tracearr-user-card')).toHaveCount(2);
  await page.screenshot({ path: `screenshots/${info.project.name}/16-tracearr-users.png` });
  await page.goto('/tracearr/statistiques');
  await expect(page.getByTestId('bar-chart').first()).toBeVisible();
  await page.screenshot({
    path: `screenshots/${info.project.name}/17-tracearr-stats.png`,
    fullPage: true,
  });
});
