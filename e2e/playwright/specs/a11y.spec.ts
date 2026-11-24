// SPDX-License-Identifier: AGPL-3.0-or-later
// Accessibilité (P5.5), en desktop et en mobile : lien d'évitement atteint au
// premier Tab et qui place le focus sur le contenu ; sur les écrans clés,
// chaque bouton, lien et champ porte un nom accessible ; langue du document.

import { expect, test, type Page } from '@playwright/test';
import { LIBRARY } from './env';

/**
 * Éléments interactifs visibles sans nom accessible (texte, aria-label, title,
 * libellé). Script exécuté dans la page (le projet Playwright n'a pas les
 * types du DOM).
 */
const UNNAMED_CONTROLS = `(() => {
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const nameOf = (el) => {
    const labelledBy = el.getAttribute('aria-labelledby');
    // Référence introuvable ou vide : ignorée (calcul du nom accessible).
    const fromIds = labelledBy
      ? labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
      : '';
    if (fromIds !== '') return fromIds;
    const aria = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
    if (aria.trim() !== '') return aria;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const label = el.id ? document.querySelector('label[for="' + el.id + '"]')?.textContent : null;
      return (label ?? el.placeholder ?? '').trim();
    }
    const img = el.querySelector('img[alt]');
    return ((el.textContent ?? '') + (img?.getAttribute('alt') ?? '')).trim();
  };
  const controls = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), textarea, [role="button"], [role="tab"]',
  );
  return [...controls].filter((el) => visible(el) && nameOf(el) === '').map((el) => el.outerHTML.slice(0, 120));
})()`;

async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(UNNAMED_CONTROLS);
}

test('lien d’évitement : premier arrêt du clavier, focus sur le contenu', async ({ page }) => {
  await page.goto('/tableau-de-bord');
  await expect(page.getByTestId('dashboard-view')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.keyboard.press('Tab');
  const skip = page.getByTestId('skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveText('Aller au contenu');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

for (const [name, path, ready] of [
  ['tableau de bord', '/tableau-de-bord', 'dashboard-view'],
  ['films', LIBRARY, 'movies-content'],
  ['découverte', '/decouverte', 'discover-view'],
  ['calendrier', '/calendrier', 'calendar-view'],
  ['qBittorrent', '/qbittorrent', 'torrents-qbittorrent'],
  // Écrans ajoutés ou retouchés en P5c.
  ['historique Radarr', `${LIBRARY}/historique`, 'history-search'],
  ['file d’attente Radarr', '/medias/films/films/file-attente', 'radarr-queue-page'],
  ['prochains épisodes', '/medias/series/series/prochains', 'sonarr-upcoming-page'],
  ['file d’attente Sonarr', '/medias/series/series/file-attente', 'sonarr-queue-page'],
  ['Tracearr', '/tracearr', 'tracearr-page'],
  ['paramètres', '/admin/settings', 'tab-services'],
  // Écrans ajoutés ou retouchés en P5d.
  ['utilisateurs Tracearr', '/tracearr/utilisateurs', 'tracearr-users'],
  ['statistiques Tracearr', '/tracearr/statistiques', 'tracearr-quality'],
  ['paramètres d’un service', '/medias/films/radarr/tags', 'service-settings-nav'],
  ['Transmission', '/transmission', 'torrents-transmission'],
  ['SABnzbd', '/usenet/sabnzbd', 'usenet-row'],
  // Lot 4.
  ['journaux', '/admin/logs', 'logs-list'],
] as const) {
  test(`noms accessibles : ${name}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId(ready).first()).toBeVisible();
    // Laisse les cartes chargées à part s'afficher.
    await page.waitForLoadState('networkidle');
    expect(await unnamedControls(page)).toEqual([]);
  });
}

test('noms accessibles : fiche d’un utilisateur Tracearr', async ({ page }) => {
  // Adresse à jeton (D148) : on passe par la liste des utilisateurs.
  await page.goto('/tracearr/utilisateurs');
  await page.getByTestId('tracearr-user-card').first().click();
  await expect(page.getByTestId('tracearr-user-stats')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await unnamedControls(page)).toEqual([]);
});
