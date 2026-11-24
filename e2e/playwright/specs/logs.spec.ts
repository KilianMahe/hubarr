// SPDX-License-Identifier: AGPL-3.0-or-later
// Journaux (lot 4), section des paramètres depuis le lot 9 : entrées gardées
// en mémoire par le serveur. Au premier démarrage sur un /data vide, les
// migrations appliquées sont journalisées en `warn` : l'entrée est toujours là.
// L'ancienne adresse `/admin/logs` mène à la section.

import { expect, test } from '@playwright/test';

test('journaux : liste, détail, recherche et téléchargement', async ({ page }) => {
  await page.goto('/admin/logs');
  await expect(page).toHaveURL(/\/admin\/settings#section-logs$/);
  const list = page.getByTestId('logs-list');
  const entry = list.locator('.log-row', { hasText: 'migrations appliquées' }).first();
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('Alerte');

  await entry.click();
  const detail = page.getByTestId('log-detail');
  await expect(detail).toBeVisible();
  await expect(page.getByTestId('log-detail-context')).toContainText('"applied"');
  await page.getByTestId('dialog-close').click();
  await expect(detail).toBeHidden();

  await page.getByTestId('logs-search').locator('input').fill('aucune-entree-ne-contient-ceci');
  await expect(page.getByTestId('logs-empty')).toContainText(
    'Aucune entrée ne correspond aux filtres',
  );
  await expect(page.getByTestId('logs-download')).toHaveAttribute(
    'href',
    'api/admin/logs/export?q=aucune-entree-ne-contient-ceci',
  );
  await page.getByTestId('logs-reset').click();
  await expect(entry).toBeVisible();
});
