// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours d'activité (P3e.4), en desktop et en mobile, contre les faux
// Tautulli et Tracearr : lecture en cours avec affiche proxifiée,
// statistiques, graphiques, historique (« Charger plus »), métadonnées ;
// proxy d'images d'Emby.

import { expect, test } from '@playwright/test';

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

test('Emby : activité et proxy d’images', async ({ request }) => {
  const activity = await request.get('/api/emby/activity');
  const body = (await activity.json()) as { streamCount: number; sessions: { poster: string }[] };
  expect(body.streamCount).toBe(1);
  const image = await request.get(body.sessions[0]?.poster ?? '');
  expect(image.headers()['content-type']).toBe('image/png');
});
