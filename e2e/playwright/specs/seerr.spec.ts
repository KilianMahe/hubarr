// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours Seerr (P3f.4), en desktop et en mobile, contre le faux Seerr :
// demandes (approbation), utilisateurs (création, permissions), réglages
// (secrets jamais affichés, serveur Radarr enregistré avec sa clé
// conservée), tâches.

import { expect, test } from '@playwright/test';
import { MOCKS_URL } from './env';

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCKS_URL}/seerr/__reset`);
});

test('demandes : filtre « en attente » et approbation', async ({ page }) => {
  await page.goto('/jellyseerr');
  await expect(page.getByTestId('seerr-request')).toHaveCount(3);
  await expect(page.getByTestId('seerr-request').first()).toContainText('Orbite Basse');
  await page.getByTestId('seerr-filter-pending').click();
  await expect(page).toHaveURL(/filter=pending/);
  await expect(page.getByTestId('seerr-request')).toHaveCount(2);
  await page.getByTestId('seerr-approve').first().click();
  await expect(page.getByTestId('seerr-request')).toHaveCount(1);
});

test('utilisateurs : création puis permissions d’un utilisateur', async ({ page }) => {
  await page.goto('/jellyseerr/utilisateurs');
  await expect(page.getByTestId('seerr-user-row')).toHaveCount(3);
  await page.getByTestId('seerr-user-create').click();
  await page.getByTestId('seerr-create-email').locator('input').fill('dave@seerr.test');
  await page.getByTestId('seerr-create-password').locator('input').fill('motdepasse-e2e');
  await page.getByTestId('seerr-create-submit').click();
  await expect(page.getByTestId('seerr-user-row')).toHaveCount(4);
  await page.getByRole('link', { name: 'bob' }).click();
  await page.getByTestId('seerr-tab-perms').click();
  await page.getByTestId('seerr-perm-128').locator('input').check();
  await page.getByTestId('seerr-perms-save').click();
  await expect(page.getByText('Enregistré')).toBeVisible();
});

test('réglages : aucun secret affiché, serveur Radarr enregistré, tâche lancée', async ({
  page,
}) => {
  await page.goto('/jellyseerr/parametres');
  await expect(page.getByTestId('seerr-app-title').locator('input')).toHaveValue('Seerr E2E');
  await expect(page.locator('body')).not.toContainText('seerr-secret-api-key');
  await page.goto('/jellyseerr/parametres/services');
  await expect(page.getByTestId('seerr-server')).toHaveCount(1);
  await page.getByTestId('seerr-server-edit').click();
  await expect(page.getByTestId('seerr-server-key').locator('input')).toHaveValue('********');
  await page.getByTestId('seerr-server-test').click();
  await expect(page.getByText('Connexion réussie')).toBeVisible();
  // Sur mobile, la snackbar recouvre les actions de la feuille du bas (dette d'UX, P5b).
  await page.getByRole('status').getByRole('button', { name: 'Fermer' }).click();
  await page.getByTestId('seerr-server-name').locator('input').fill('Radarr renommé');
  await page.getByTestId('seerr-server-save').click();
  await expect(page.getByTestId('seerr-server')).toContainText('Radarr renommé');
  await page.goto('/jellyseerr/parametres/taches-cache');
  await page.getByTestId('seerr-job-run').first().click();
  await expect(page.getByTestId('seerr-job').first()).toContainText('En cours');
});
