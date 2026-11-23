// SPDX-License-Identifier: AGPL-3.0-or-later
// Captures de présentation (README et documentation), en anglais, écrites dans
// `docs/public/screenshots/`. Lancées à la demande seulement : `make screenshots`
// (E2E_SHOWCASE=1), jamais par `make e2e`.
//
// Les faux services n'ont pas d'affiches : pour des captures lisibles, les
// réponses JSON de l'API reçoivent des URL d'images TMDB fictives, servies par
// Playwright sous forme d'affiches générées (dégradé et titre). Le nom de
// l'administrateur de test est remplacé par un prénom. Rien d'autre n'est
// modifié : les écrans montrent les données des faux services.

import { expect, test, type Locator, type Page, type Route, type TestInfo } from '@playwright/test';
import { LIBRARY, MOCKS_URL, SERIES_LIBRARY } from './env';

test.skip(process.env.E2E_SHOWCASE !== '1', 'Captures de présentation : make screenshots');

const OUT = '../../docs/public/screenshots';
const FAKE_IMAGES = 'https://image.tmdb.org/t/p/original/hubarr-showcase.svg';
const IMAGE_KEYS: Record<string, 'poster' | 'backdrop' | 'profile'> = {
  poster: 'poster',
  backdrop: 'backdrop',
  fanart: 'backdrop',
  profile: 'profile',
};

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${String(char.charCodeAt(0))};`);
}

/** Affiche générée : dégradé déterminé par le titre, formes douces, titre en bas. */
function fakeImage(kind: string, title: string): string {
  const hue = hash(title) % 360;
  const [w, h] = kind === 'backdrop' ? [1280, 720] : kind === 'profile' ? [300, 450] : [500, 750];
  // Titre centré dans le tiers haut, loin des badges posés sur les cartes.
  const lines: string[] = [];
  for (const word of title.split(/\s+/)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= 12)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const size = kind === 'backdrop' ? 56 : 38;
  const top = kind === 'backdrop' ? h * 0.4 : h * 0.3;
  const text =
    kind === 'profile'
      ? ''
      : lines
          .slice(0, 3)
          .map(
            (line, index) =>
              `<text x="${String(w / 2)}" y="${String(top + index * (size + 10))}" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-weight="700" letter-spacing="2" font-size="${String(size)}" fill="#fff" fill-opacity="0.9">${escapeXml(line.toUpperCase())}</text>`,
          )
          .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}" viewBox="0 0 ${String(w)} ${String(h)}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${String(hue)} 65% 42%)"/>
<stop offset="1" stop-color="hsl(${String((hue + 50) % 360)} 70% 14%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${String(w * 0.78)}" cy="${String(h * 0.28)}" r="${String(w * 0.32)}" fill="#fff" fill-opacity="0.08"/>
<circle cx="${String(w * 0.18)}" cy="${String(h * 0.55)}" r="${String(w * 0.2)}" fill="#000" fill-opacity="0.12"/>
<rect y="${String(h * 0.55)}" width="100%" height="${String(h * 0.45)}" fill="#000" fill-opacity="0.25"/>
${text}</svg>`;
}

/** Ajoute une image fictive aux objets titrés qui n'en ont pas. */
function decorate(value: unknown, inherited = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => decorate(item, inherited));
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const label = [record.title, record.name, record.seriesTitle, record.displayName].find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate !== '',
  );
  const title = label ?? inherited;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(record)) {
    const kind = IMAGE_KEYS[key];
    if (kind !== undefined && field === null && title !== '') {
      out[key] = `${FAKE_IMAGES}?k=${kind}&t=${encodeURIComponent(title)}`;
    } else if (key === 'displayName' && field === 'Admin E2E') {
      out[key] = 'Alex';
    } else {
      out[key] = decorate(field, title);
    }
  }
  return out;
}

async function dressUp(page: Page): Promise<void> {
  await page.route('https://image.tmdb.org/**', (route: Route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: fakeImage(url.searchParams.get('k') ?? 'poster', url.searchParams.get('t') ?? 'Hubarr'),
    });
  });
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'GET' || request.headers().accept === 'text/event-stream') {
      return route.fallback();
    }
    const response = await route.fetch();
    if (!(response.headers()['content-type'] ?? '').includes('application/json')) {
      return route.fulfill({ response });
    }
    return route.fulfill({ response, json: decorate(await response.json()) });
  });
}

/** Page en anglais (`?_locale=en`, langue de l'aperçu, sans toucher aux préférences). */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}_locale=en`);
}

async function shoot(page: Page, info: TestInfo, name: string, ready: Locator): Promise<void> {
  await expect(ready.first()).toBeVisible();
  await page.waitForLoadState('load');
  // Alertes de santé simulées par les faux services : masquées.
  for (const close of await page.getByRole('button', { name: 'Hide this alert' }).all()) {
    await close.click().catch(() => undefined);
  }
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png` });
}

test.beforeEach(async ({ page, request }) => {
  for (const service of ['radarr', 'sonarr', 'qbittorrent', 'seerr']) {
    await request.post(`${MOCKS_URL}/${service}/__reset`).catch(() => undefined);
  }
  await dressUp(page);
});

test('tableau de bord', async ({ page }, info) => {
  await open(page, '/tableau-de-bord');
  await shoot(page, info, 'dashboard', page.getByTestId('dashboard-view'));
});

test('bibliothèque de films', async ({ page }, info) => {
  await open(page, LIBRARY);
  await shoot(page, info, 'movies', page.getByTestId('movies-content'));
});

test('fiche film', async ({ page }, info) => {
  await open(page, `${LIBRARY}/7`);
  await shoot(page, info, 'movie', page.getByTestId('movie-detail'));
});

test('fiche série', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop seulement');
  await open(page, `${SERIES_LIBRARY}/2`);
  await shoot(page, info, 'series', page.getByTestId('series-detail'));
});

test('téléchargements', async ({ page }, info) => {
  await open(page, '/qbittorrent');
  await shoot(page, info, 'downloads', page.getByTestId('torrent-row'));
});

test('calendrier', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop seulement');
  await open(page, '/calendrier?view=month');
  await shoot(page, info, 'calendar', page.getByTestId('calendar-month'));
});

test('découverte', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop seulement');
  await open(page, '/decouverte');
  await shoot(page, info, 'discover', page.locator('.v-img').nth(4));
});

test('demandes Seerr', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop seulement');
  await open(page, '/jellyseerr');
  await shoot(page, info, 'requests', page.getByTestId('seerr-request'));
});

test('activité Tautulli', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop seulement');
  await open(page, '/tautulli');
  await shoot(page, info, 'activity', page.getByTestId('tautulli-stats'));
});

test('indexeurs Prowlarr', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop seulement');
  await open(page, '/prowlarr');
  await shoot(page, info, 'indexers', page.getByTestId('prowlarr-indexer-row'));
});

test('paramètres', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop seulement');
  await open(page, '/admin/settings');
  await shoot(page, info, 'settings', page.getByTestId('tab-services'));
});

test('tiroir (mobile)', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'Mobile seulement');
  await open(page, '/tableau-de-bord');
  await expect(page.getByTestId('dashboard-view')).toBeVisible();
  await page.getByTestId('nav-toggle').click();
  await shoot(page, info, 'drawer', page.getByTestId('nav-drawer'));
});
