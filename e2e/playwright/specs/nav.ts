// SPDX-License-Identifier: AGPL-3.0-or-later
// Parcours communs desktop / mobile (P5b.4) : sur mobile, la
// recherche de la bibliothèque est dans la barre du haut « pilule », les
// actions de la fiche dans un speed-dial, les pages d'un service dans la
// barre basse et l'onglet « Serveur ».

import { expect, type Locator, type Page } from '@playwright/test';

/** Champ de recherche de la bibliothèque (`movies-search`, `series-search`…). */
export function librarySearch(page: Page, isMobile: boolean, testId: string): Locator {
  return isMobile ? page.getByTestId('topbar-search') : page.getByTestId(testId).locator('input');
}

/** Action d'une fiche : bouton sur desktop, entrée du speed-dial sur mobile. */
export async function detailAction(
  page: Page,
  isMobile: boolean,
  speedDial: string,
  action: string,
): Promise<void> {
  if (isMobile) await page.getByTestId(speedDial).click();
  await page.getByTestId(action).click();
}

/**
 * Page d'un service : onglet `tab` (desktop, dans `nav`) ; sur mobile, onglet de
 * la barre basse `bottomLabel`, ou entrée `serverItem` de l'onglet « Serveur ».
 */
export async function openServicePage(
  page: Page,
  isMobile: boolean,
  target: { nav: string; tab: string; bottomLabel?: string; serverItem?: string },
): Promise<void> {
  if (!isMobile) {
    await page.getByTestId(target.nav).getByRole('tab', { name: target.tab }).click();
    return;
  }
  const bottom = page.getByTestId('service-bottom-nav');
  if (target.bottomLabel) {
    await bottom.getByRole('link', { name: target.bottomLabel }).click();
    return;
  }
  await bottom.getByRole('link', { name: 'Serveur' }).click();
  await page.getByTestId(`server-item-${target.serverItem ?? ''}`).click();
}

/**
 * Page d'administration d'un service (P5c.4) : bouton
 * « Paramètres » de sa carte dans `/admin/settings` (`opener` :
 * `service-settings-<service>` ou `instance-settings-<slug>`, P5d.3, D149),
 * panneau déplié au besoin, puis onglet du groupe et de la page `link`.
 */
export async function openServiceAdmin(
  page: Page,
  service: string,
  opener: string,
  link: string,
): Promise<void> {
  await page.goto('/admin/settings#section-services');
  const card = page.locator(`[data-service-card="${service}"]`);
  await card.waitFor();
  const button = page.getByTestId(opener);
  if (!(await button.isVisible())) await card.locator('.v-expansion-panel-title').click();
  await button.click();
  await page.getByTestId('service-settings-pages').waitFor();
  const target = page.getByTestId(`admin-link-${link}`);
  const groups = page.getByTestId('admin-group');
  const count = await groups.count();
  // Page d'un autre groupe : on parcourt les onglets de groupe.
  for (let i = 0; i < count && !(await target.isVisible()); i += 1) {
    await groups.nth(i).click();
    await expect(groups.nth(i)).toHaveClass(/v-tab--selected/);
  }
  await target.click();
}
