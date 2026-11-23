// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours de l'administration Radarr/Sonarr (P3b.6), en desktop et en
// mobile, contre les faux services : administration ouverte depuis les
// paramètres de Hubarr (P5c.4, D140),
// indexeur ajouté par modèle (test refusé puis enregistrement, secrets jamais
// affichés), étiquettes, général (mot de passe non renvoyé), nommage
// (exemples), sauvegarde suivie, parseur et calendrier Sonarr, redirection
// d'une ancienne page Sonarr.

import { expect, test } from '@playwright/test';
import { MOCKS_URL } from './env';
import { openServiceAdmin } from './nav';

const RADARR = '/medias/films/radarr';
const SONARR = '/medias/series/sonarr';

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/radarr/__reset`);
  await request.post(`${MOCKS_URL}/sonarr/__reset`);
});

test('paramètres de Hubarr vers les indexeurs de l’instance, puis retour', async ({ page }) => {
  await openServiceAdmin(page, 'radarr', 'instance-settings-films', 'radarr-indexers');
  await expect(page).toHaveURL(/\/medias\/films\/radarr\/indexeurs$/);
  await expect(page.getByTestId('arr-admin-title')).toHaveText('Indexeurs');
  await expect(page.getByTestId('provider-row')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText('cle-secrete-indexeur');
  // Ni barre basse, ni onglets : un lien ramène aux paramètres.
  await expect(page.getByTestId('service-bottom-nav')).toHaveCount(0);
  await page.getByTestId('settings-back').click();
  await expect(page).toHaveURL(/\/admin\/settings#section-services$/);
});

test('indexeur ajouté par modèle : test refusé, puis enregistré', async ({ page }) => {
  await page.goto(`${RADARR}/indexeurs`);
  await expect(page.getByTestId('provider-row')).toHaveCount(2);
  await page.getByTestId('provider-add').click();
  const dialog = page.getByTestId('arr-admin-dialog');
  await dialog.getByTestId('provider-type').click();
  await page.getByRole('option', { name: 'Newznab' }).click();
  await expect(dialog.getByTestId('provider-name').locator('input')).toHaveValue('Newznab');
  await dialog.getByTestId('provider-field-baseUrl').locator('input').fill('https://invalide.test');
  await dialog.getByTestId('provider-test').click();
  await expect(dialog.getByTestId('provider-test-result')).toContainText('Unable to connect');
  await dialog
    .getByTestId('provider-field-baseUrl')
    .locator('input')
    .fill('https://nouvel-indexeur.test');
  await dialog.getByTestId('provider-name').locator('input').fill('Indexeur E2E');
  await dialog.getByTestId('arr-admin-dialog-save').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('provider-row')).toHaveCount(3);
  await expect(page.getByTestId('provider-row').nth(2)).toContainText('Indexeur E2E');
});

test('modification d’un client : mot de passe masqué, conservé à l’enregistrement', async ({
  page,
}) => {
  await page.goto(`${SONARR}/clients-telechargement`);
  await page.getByTestId('provider-edit').first().click();
  const dialog = page.getByTestId('arr-admin-dialog');
  const password = dialog.getByTestId('provider-field-password').locator('input');
  await expect(password).toHaveValue('********');
  await dialog.getByTestId('provider-field-host').locator('input').fill('qbittorrent-2');
  await dialog.getByTestId('arr-admin-dialog-save').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('provider-row').first()).toContainText('qbittorrent-2');
  await expect(page.locator('body')).not.toContainText('mot-de-passe-client');
});

test('étiquettes (Sonarr) : ajout, renommage, suppression', async ({ page }) => {
  await page.goto(`${SONARR}/tags`);
  await expect(page.getByTestId('tag-row')).toHaveCount(1);
  await page.getByTestId('tag-new-label').locator('input').fill('anime');
  await page.getByTestId('tag-add').click();
  await expect(page.getByTestId('tag-row')).toHaveCount(2);
  await page.getByTestId('tag-row').filter({ hasText: 'anime' }).getByTestId('tag-rename').click();
  const dialog = page.getByTestId('arr-admin-dialog');
  await dialog.getByTestId('tag-rename-label').locator('input').fill('animes');
  await dialog.getByTestId('arr-admin-dialog-save').click();
  await expect(page.getByTestId('tag-row').filter({ hasText: 'animes' })).toHaveCount(1);
  await page.getByTestId('tag-row').filter({ hasText: 'animes' }).getByTestId('tag-delete').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('tag-row')).toHaveCount(1);
});

test('général : mot de passe et clé d’API jamais affichés, port enregistré', async ({ page }) => {
  await page.goto(`${RADARR}/parametres`);
  await expect(page.getByTestId('config-field-port').locator('input')).toHaveValue('7878');
  await expect(page.getByTestId('config-field-password').locator('input')).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('cle-api-instance');
  await page.getByTestId('config-field-port').locator('input').fill('7879');
  await page.getByTestId('config-save').click();
  await expect(page.getByTestId('arr-admin-feedback')).toContainText('sauvegardée');
  await page.reload();
  await expect(page.getByTestId('config-field-port').locator('input')).toHaveValue('7879');
});

test('nommage : exemples d’après le format saisi', async ({ page }) => {
  await page.goto(`${RADARR}/gestion-medias`);
  await page
    .getByTestId('config-field-standardMovieFormat')
    .locator('input')
    .fill('{Movie Title} [{Release Year}]');
  await page.getByTestId('naming-preview').click();
  await expect(page.getByTestId('naming-examples')).toContainText('Horizon Blanc [2019]');
});

test('sauvegarde créée et suivie jusqu’à la fin', async ({ page }) => {
  await page.goto(`${SONARR}/sauvegardes`);
  await expect(page.getByTestId('backup-row')).toHaveCount(1);
  await page.getByTestId('backup-create').click();
  await expect(page.getByTestId('arr-admin-feedback')).toContainText('Sauvegarde créée', {
    timeout: 15_000,
  });
});

test('parseur et calendrier Sonarr, ancienne page redirigée', async ({ page }) => {
  await page.goto(`${SONARR}/parser`);
  await page.getByTestId('parse-title').locator('input').fill('Les.Phares.S01E02.1080p.WEB-DL');
  await page.getByTestId('parse-submit').click();
  await expect(page).toHaveURL(/title=Les\.Phares/);
  await expect(page.getByTestId('parse-result')).toContainText('S01E02');
  await expect(page.getByTestId('parse-result')).toContainText('WEBDL-1080p');

  await page.goto(`${SONARR}/calendrier`);
  await expect(page.getByTestId('arr-admin-title')).toHaveText('Calendrier');

  await page.goto(`${SONARR}/historique`);
  await expect(page).toHaveURL(/\/medias\/series\/series\/historique/);
});
