// SPDX-License-Identifier: AGPL-3.0-or-later
// Gestion des utilisateurs : l'admin crée un compte avec la lecture seule sur
// l'instance Radarr « Films » ; ce compte se connecte, ne voit que Radarr dans
// le tiroir, consulte la bibliothèque (pastille « Lecture seule », sans bouton
// d'ajout, fiche sans action d'écriture, onglet « Serveur » sans version) et
// n'atteint ni Prowlarr, ni la page Système, ni les paramètres. Un compte par projet (desktop, mobile) : la base est commune
// aux deux passages.

import { expect, test, type BrowserContextOptions } from '@playwright/test';
import { LIBRARY } from './env';

test('utilisateurs : compte en lecture seule sur une instance', async ({
  page,
  browser,
  isMobile,
}, info) => {
  const email = `lecteur-${info.project.name}@hubarr.test`;
  const password = 'lecteur-e2e-123';

  await page.goto('/admin/settings#section-users');
  await expect(page.getByTestId('user-add')).toBeVisible();
  await page.getByTestId('user-add').click();
  const dialog = page.getByTestId('user-dialog');
  await dialog.getByTestId('user-email').locator('input').fill(email);
  await dialog.getByTestId('user-display-name').locator('input').fill('Lecteur');
  await dialog.getByTestId('user-password').locator('input').fill(password);
  await dialog.getByTestId('permission-radarr:films-read').click();
  await dialog.getByTestId('user-submit').click();
  await expect(dialog).toBeHidden();
  const row = page.locator('[data-test^="user-row-"]', { hasText: email });
  await expect(row).toContainText('Lecture : 1');

  // Nouveau contexte, sans la session de l'admin, aux réglages du projet.
  const { baseURL, locale, viewport, isMobile: mobile, hasTouch } = info.project.use;
  const settings = { baseURL, locale, viewport, isMobile: mobile, hasTouch };
  const context = await browser.newContext({
    ...(Object.fromEntries(
      Object.entries(settings).filter(([, value]) => value !== undefined),
    ) as BrowserContextOptions),
    storageState: { cookies: [], origins: [] },
  });
  const reader = await context.newPage();
  await reader.goto('/login');
  await reader.getByTestId('login-email').locator('input').fill(email);
  await reader.getByTestId('login-password').locator('input').fill(password);
  await reader.getByTestId('login-submit').click();
  await expect(reader).not.toHaveURL(/\/login$/);

  await reader.goto(LIBRARY);
  await expect(reader).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(reader.getByTestId('read-only-chip')).toBeVisible();
  await expect(reader.getByTestId('movies-add')).toBeHidden();
  await expect(reader.getByTestId('arr-admin-menu')).toHaveCount(0);

  // Fiche d'un film : consultée sans suivi, édition, renommage ni suppression.
  await reader.goto(`${LIBRARY}/7`);
  const detail = reader.getByTestId('movie-detail');
  await expect(detail.getByTestId('movie-title')).toHaveText('Minuit à Valparaíso (2023)');
  for (const id of ['movie-monitor', 'movie-interactive', 'panel-edit', 'panel-files'])
    await expect(detail.getByTestId(id)).toBeHidden();
  await expect(detail.locator('.detail-more')).toBeHidden();

  // Onglet « Serveur » : sans la version, la page Système étant réservée aux
  // admins (l'API la refuse au compte en lecture).
  await reader.goto('/medias/films/radarr/serveur');
  await expect(reader.getByTestId('server-panel')).toBeVisible();
  await expect(reader.getByTestId('server-version')).toHaveCount(0);
  expect((await reader.request.get('/api/medias/films/radarr/systeme')).status()).toBe(403);

  if (isMobile) await reader.getByTestId('nav-toggle').click();
  const drawer = reader.getByTestId('nav-drawer');
  await expect(drawer).toContainText('Radarr');
  await expect(drawer).not.toContainText('Prowlarr');
  await expect(drawer).not.toContainText('Sonarr');

  // Ni service fermé ni paramètres : retour à l'accueil.
  await reader.goto('/prowlarr');
  await expect(reader).not.toHaveURL(/\/prowlarr$/);
  await reader.goto('/admin/settings');
  await expect(reader).not.toHaveURL(/\/admin\/settings/);
  await context.close();
});
