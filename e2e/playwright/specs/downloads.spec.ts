// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours des clients de téléchargement (P3d.6), en desktop et en mobile,
// contre les faux clients : qBittorrent (VPN, pause, fiche, ajout, badge
// Radarr), Transmission (suppression avec les fichiers), Deluge (tout
// reprendre), SABnzbd (file, pause générale, historique), NZBGet
// (suppression) et la page Téléchargements agrégée.

import { expect, test } from '@playwright/test';
import { MOCKS_URL } from './env';

test.beforeEach(async ({ request }) => {
  for (const service of ['qbittorrent', 'transmission-mock', 'deluge', 'sabnzbd', 'nzbget']) {
    await request.post(`${MOCKS_URL}/${service}/__reset`);
  }
});

test('qBittorrent : liste, VPN synchronisé, pause, fiche et ajout d’un magnet', async ({
  page,
}) => {
  await page.goto('/qbittorrent');
  const rows = page.getByTestId('torrent-row');
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('torrent-vpn')).toContainText('203.0.113.7');
  await expect(page.getByTestId('vpn-sync')).toContainText('Sync');

  const first = rows.filter({ hasText: 'Orbite.Basse' });
  await first.getByTestId('torrent-toggle').click();
  await expect(page.getByText('Torrent mis en pause')).toBeVisible();

  await first.getByText('Orbite.Basse.2019').click();
  const detail = page.getByTestId('torrent-detail');
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: 'Fichiers' }).click();
  await expect(detail.getByTestId('torrent-file')).toHaveCount(2);
  await page.keyboard.press('Escape');

  await page.getByTestId('torrent-add-open').click();
  await page
    .getByTestId('torrent-add-urls')
    .locator('textarea')
    .first()
    .fill('magnet:?xt=urn:btih:abc&dn=Nouveau.Film.E2E');
  await page.getByTestId('torrent-add-submit').click();
  await expect(rows.filter({ hasText: 'Nouveau.Film.E2E' })).toHaveCount(1);
});

test('qBittorrent : le badge de catégorie ouvre la fiche Radarr', async ({ page }) => {
  await page.goto('/qbittorrent');
  const row = page.getByTestId('torrent-row').filter({ hasText: 'Orbite.Basse' });
  await row.getByTestId('torrent-category').click();
  await expect(page).toHaveURL(/\/medias\/films\/films\/\d+$/);
});

test('Transmission : suppression avec les fichiers', async ({ page }) => {
  await page.goto('/transmission');
  const rows = page.getByTestId('torrent-row');
  await expect(rows).toHaveCount(4);
  await rows.filter({ hasText: 'Distribution.Libre' }).getByTestId('torrent-delete').click();
  await expect(page.getByTestId('torrent-delete-message')).toContainText('Distribution.Libre');
  await page.getByTestId('torrent-delete-files').locator('input').check();
  await page.getByTestId('torrent-delete-confirm').click();
  await expect(rows).toHaveCount(3);
});

test('Deluge : tout reprendre', async ({ page }) => {
  await page.goto('/deluge');
  await expect(page.getByTestId('torrent-row')).toHaveCount(4);
  await expect(page.getByTestId('torrent-filter-paused')).toContainText('1');
  await page.getByTestId('torrent-resume-all').click();
  await expect(page.getByTestId('torrent-filter-paused')).toContainText('0');
});

test('SABnzbd : file, pause générale et historique paginé', async ({ page }) => {
  await page.goto('/usenet/sabnzbd');
  await expect(page.getByTestId('usenet-row')).toHaveCount(3);
  await expect(page.getByTestId('usenet-history-row').first()).toBeVisible();
  await page.getByTestId('usenet-pause-all').click();
  await expect(page.getByTestId('usenet-resume-all')).toBeVisible();
  await page.getByTestId('usenet-history-link').click();
  await expect(page.getByTestId('usenet-history-page-of')).toContainText('1 / 2');
  await page.getByTestId('usenet-history-next').click();
  await expect(page.getByTestId('usenet-history-page-of')).toContainText('2 / 2');
});

test('NZBGet : suppression confirmée', async ({ page }) => {
  await page.goto('/usenet/nzbget');
  const rows = page.getByTestId('usenet-row');
  await expect(rows).toHaveCount(3);
  await rows.first().getByTestId('usenet-delete').click();
  await page.getByTestId('confirm').click();
  await expect(rows).toHaveCount(2);
});

test('page Téléchargements : un résumé par client configuré', async ({ page }) => {
  await page.goto('/medias/films/telechargements');
  for (const id of ['qbittorrent', 'transmission', 'deluge', 'sabnzbd', 'nzbget']) {
    await expect(page.getByTestId(`downloads-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('downloads-qbittorrent')).toContainText('Orbite.Basse');
});
