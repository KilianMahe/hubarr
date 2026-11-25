// SPDX-License-Identifier: AGPL-3.0-or-later
// Gestion d'un import bloqué depuis le tableau de bord : lignes de l'aperçu
// (fichiers cochés d'emblée, correspondance complète, requête), puis carte
// montée (motif affiché, la ligne ouvre la gestion, import manuel suivi
// jusqu'à la fin, retrait de la file avec liste de blocage ; Sonarr par épisodes),
// et même gestion depuis les pages « File d'attente » de Radarr et de Sonarr.

import type {
  BootstrapServices,
  DashboardPage,
  EpisodeManualImportFile,
  MovieManualImportFile,
} from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  episodeImportRequest,
  episodeRows,
  importable,
  movieImportRequest,
  movieRows,
  rowReady,
} from '../src/features/dashboard/manual-import';
import { click } from './arr-admin-fixtures';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle, type FakeHandler } from './helpers';

beforeAll(async () => {
  await setLocale('en');
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const t = (key: string, values: Record<string, unknown> = {}) => i18n.global.t(key, values);
const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

/** Attend une condition (suivi de commande relu toutes les 2 s). */
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met');
    await settle();
  }
}

function movieFile(overrides: Partial<MovieManualImportFile> = {}): MovieManualImportFile {
  return {
    path: '/dl/Film/film.mkv',
    name: 'film.mkv',
    size: 1_000_000,
    quality: { id: 7, name: 'Bluray-1080p' },
    languages: [{ id: 2, name: 'French' }],
    releaseGroup: 'GRP',
    rejections: [],
    movie: { id: 5, title: 'Film', year: 2020 },
    ...overrides,
  };
}

function episodeFile(overrides: Partial<EpisodeManualImportFile> = {}): EpisodeManualImportFile {
  return {
    path: '/dl/Show/E05.mkv',
    name: 'E05.mkv',
    size: 500,
    quality: { id: 3, name: 'WEBDL-1080p' },
    languages: [],
    releaseGroup: null,
    rejections: [],
    series: { id: 1, title: 'Show' },
    seasonNumber: 2,
    episodes: [{ id: 25, seasonNumber: 2, episodeNumber: 5, title: 'Five' }],
    ...overrides,
  };
}

describe('logique', () => {
  it('fichiers reconnus et sans refus cochés d’emblée ; requête des seules lignes complètes', () => {
    const rows = movieRows([
      movieFile(),
      movieFile({ path: '/dl/Film/sample.mkv', rejections: ['Sample'] }),
      movieFile({ path: '/dl/Film/x.mkv', movie: null }),
    ]);
    expect(rows.map((row) => row.selected)).toEqual([true, false, false]);
    const [, sample, unknown] = rows;
    if (sample === undefined || unknown === undefined) throw new Error('rows');
    expect(rowReady(sample, 'radarr')).toBe(true);
    expect(rowReady(unknown, 'radarr')).toBe(false);
    // Une ligne cochée mais incomplète ne part pas.
    unknown.selected = true;
    sample.selected = true;
    sample.releaseGroup = '  ';
    expect(importable(rows, 'radarr')).toHaveLength(2);
    expect(movieImportRequest(rows)).toEqual({
      files: [
        {
          path: '/dl/Film/film.mkv',
          movieId: 5,
          qualityId: 7,
          languages: [{ id: 2, name: 'French' }],
          releaseGroup: 'GRP',
        },
        {
          path: '/dl/Film/sample.mkv',
          movieId: 5,
          qualityId: 7,
          languages: [{ id: 2, name: 'French' }],
          releaseGroup: null,
        },
      ],
    });
  });

  it('Sonarr : saison et épisodes reconnus ; sans épisode, la ligne n’est pas prête', () => {
    const rows = episodeRows([episodeFile(), episodeFile({ path: '/dl/x.mkv', episodes: [] })]);
    expect(rows[0]).toMatchObject({
      seasonNumber: 2,
      episodeIds: [25],
      episodeLabels: ['S02E05 — Five'],
      selected: true,
    });
    expect(rows[1]).toMatchObject({ seasonNumber: 2, selected: false });
    const unmatched = rows[1];
    if (unmatched === undefined) throw new Error('rows');
    expect(rowReady(unmatched, 'sonarr')).toBe(false);
    expect(episodeImportRequest(rows)).toEqual({
      files: [
        {
          path: '/dl/Show/E05.mkv',
          seriesId: 1,
          episodeIds: [25],
          qualityId: 3,
          languages: [],
          releaseGroup: null,
        },
      ],
    });
  });
});

const layout = [{ key: 'queue', visible: true }] as DashboardPage['layout'];

function dashboardPage(): DashboardPage {
  return {
    layout,
    configured: {
      radarr: true,
      sonarr: true,
      seerr: false,
      tmdb: false,
      tautulli: false,
      transmission: false,
      tracearr: false,
      emby: false,
      downloads: false,
    },
    watchlist: [],
  };
}

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    movieId: 5,
    title: 'Film',
    year: 2020,
    size: 100,
    sizeleft: 0,
    status: 'completed',
    trackedStatus: 'warning',
    trackedState: 'importBlocked',
    quality: 'Bluray-1080p',
    protocol: 'torrent',
    eta: null,
    indexer: null,
    downloadId: 'HASH9',
    outputPath: '/dl/Film',
    downloadClient: null,
    statusMessages: [{ title: 'film.mkv', messages: ['Not an upgrade for existing movie file'] }],
    ...overrides,
  };
}

function baseRoutes(extra: Record<string, FakeHandler>): Record<string, FakeHandler> {
  return {
    'GET /api/health/services': () => ({
      body: { services: {}, instances: { radarr: [], sonarr: [] } },
    }),
    'GET /api/tableau-de-bord': () => ({ body: dashboardPage() }),
    'GET /api/decouverte/watchlist/status': () => ({ body: { keys: [] } }),
    'GET /api/medias/films/quality-definitions': () => ({
      body: [
        { id: 7, name: 'Bluray-1080p' },
        { id: 9, name: 'Remux-1080p' },
      ],
    }),
    ...extra,
  };
}

async function mountDashboard(services: BootstrapServices, routes: Record<string, FakeHandler>) {
  const fetch = fakeFetch(baseRoutes(routes));
  const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
  mounted.push(wrapper);
  await settle();
  return { wrapper, fetch };
}

const radarrServices: BootstrapServices = {
  states: { radarr: { configured: true, disabled: false } },
  instances: {
    radarr: [{ slug: 'films', name: 'Films', enabled: true, isDefault: true }],
    sonarr: [],
  },
  sidebar: {},
};

describe('carte des files d’attente', () => {
  it('Radarr : motif affiché, la ligne ouvre la gestion, import du fichier coché à la main', async () => {
    let status = 'started';
    const { wrapper, fetch } = await mountDashboard(radarrServices, {
      'GET /api/medias/films/films/queue': () => ({
        body: [
          queueItem(),
          queueItem({
            id: 10,
            trackedState: 'downloading',
            trackedStatus: 'ok',
            status: 'downloading',
            statusMessages: [],
          }),
        ],
      }),
      'GET /api/medias/films/films/queue/9/manual-import': () => ({
        body: {
          files: [movieFile({ rejections: ['Not an upgrade for existing movie file'] })],
        },
      }),
      'POST /api/medias/films/films/queue/9/manual-import': () => ({
        body: { ok: true, cmdId: 44 },
      }),
      'GET /api/medias/films/films/command/44': () => ({
        body: {
          id: 44,
          name: 'ManualImport',
          status,
          message: null,
          queued: null,
          started: null,
          ended: null,
        },
      }),
    });
    const rows = wrapper.findAll('[data-test="dashboard-queue-row"]');
    expect(rows[0]?.attributes('data-manageable')).toBe('true');
    expect(rows[0]?.attributes('href')).toBeUndefined();
    expect(rows[0]?.get('[data-test="dashboard-queue-reason"]').text()).toBe(
      'Not an upgrade for existing movie file',
    );
    // Un téléchargement en cours mène à la file d'attente de l'instance.
    expect(rows[1]?.attributes('data-manageable')).toBeUndefined();
    expect(rows[1]?.attributes('href')).toBe('/medias/films/films/file-attente');

    await rows[0]?.trigger('click');
    await settle();
    expect($('[data-test="queue-manage"]')).not.toBeNull();
    expect($('[data-test="queue-manage-reasons"]')?.textContent).toContain(
      'film.mkv: Not an upgrade for existing movie file',
    );
    expect($$('[data-test="manual-file"]')).toHaveLength(1);
    expect($('[data-test="manual-file-rejection"]')?.textContent).toContain('Not an upgrade');
    // Refusé par Radarr : non coché, l'import attend un choix explicite.
    const importButton = () => $('[data-test="queue-manage-import"]');
    expect(importButton()?.hasAttribute('disabled')).toBe(true);
    click('[data-test="manual-file-select"] input');
    await settle();
    expect(importButton()?.textContent).toContain(t('dashboard.queue.manage.import', { count: 1 }));

    click('[data-test="queue-manage-import"]');
    await settle();
    const post = fetch.calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/queue/9/manual-import'),
    );
    expect(post?.body).toEqual({
      files: [
        {
          path: '/dl/Film/film.mkv',
          movieId: 5,
          qualityId: 7,
          languages: [{ id: 2, name: 'French' }],
          releaseGroup: 'GRP',
        },
      ],
    });
    // La commande se termine : la file est relue et le dialogue se ferme.
    status = 'completed';
    const queueCalls = () =>
      fetch.calls.filter((call) => call.url === '/api/medias/films/films/queue').length;
    const before = queueCalls();
    await until(() => queueCalls() > before);
    await until(() =>
      document.body.textContent.includes(
        t('dashboard.queue.manage.import_done', { title: 'Film' }),
      ),
    );
  });

  it('retrait de la file avec liste de blocage ; aperçu en échec signalé', async () => {
    const { wrapper, fetch } = await mountDashboard(radarrServices, {
      'GET /api/medias/films/films/queue': () => ({
        body: [
          queueItem({ trackedState: 'downloading', trackedStatus: 'error', status: 'failed' }),
        ],
      }),
      'GET /api/medias/films/films/queue/9/manual-import': () => ({
        status: 503,
        body: { code: 'SERVICE_UNREACHABLE' },
      }),
      'POST /api/medias/films/films/queue/9/delete': () => ({ body: { ok: true } }),
    });
    await wrapper.get('[data-test="dashboard-queue-row"]').trigger('click');
    await settle();
    expect($('[data-test="queue-manage-preview-error"]')).not.toBeNull();
    click('[data-test="queue-manage-remove"]');
    await settle();
    click('[data-test="queue-manage-blocklist"] input');
    click('[data-test="queue-manage-remove-confirm"]');
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/medias/films/films/queue/9/delete');
    expect(call?.body).toEqual({ removeFromClient: false, blocklist: true, skipRedownload: false });
  });

  it('Sonarr : épisodes reconnus cochés, import par épisodes', async () => {
    const services: BootstrapServices = {
      states: { sonarr: { configured: true, disabled: false } },
      instances: {
        radarr: [],
        sonarr: [{ slug: 'tv', name: 'TV', enabled: true, isDefault: true }],
      },
      sidebar: {},
    };
    const { wrapper, fetch } = await mountDashboard(services, {
      'GET /api/medias/tv/series/queue': () => ({
        body: [
          {
            id: 5,
            seriesId: 1,
            episodeId: 25,
            seriesTitle: 'Show',
            episode: 'S02E05',
            size: 100,
            sizeleft: 0,
            status: 'completed',
            trackedStatus: 'warning',
            trackedState: 'importBlocked',
            quality: 'WEBDL-1080p',
            protocol: 'torrent',
            eta: null,
            indexer: null,
            downloadId: 'HASH5',
            outputPath: '/dl/Show',
            downloadClient: null,
            statusMessages: [],
          },
        ],
      }),
      'GET /api/medias/tv/series/quality-definitions': () => ({
        body: [{ id: 3, name: 'WEBDL-1080p' }],
      }),
      'GET /api/medias/tv/series/queue/5/manual-import': () => ({
        body: { files: [episodeFile()] },
      }),
      'POST /api/medias/tv/series/queue/5/manual-import': () => ({
        body: { ok: true, cmdId: null },
      }),
    });
    await wrapper.get('[data-test="dashboard-queue-row"]').trigger('click');
    await settle();
    expect($('[data-test="queue-manage"]')?.textContent).toContain(
      t('dashboard.queue.manage.no_reason'),
    );
    click('[data-test="queue-manage-import"]');
    await settle();
    const post = fetch.calls.find(
      (call) =>
        call.url === '/api/medias/tv/series/queue/5/manual-import' && call.method === 'POST',
    );
    expect(post?.body).toEqual({
      files: [
        {
          path: '/dl/Show/E05.mkv',
          seriesId: 1,
          episodeIds: [25],
          qualityId: 3,
          languages: [],
          releaseGroup: null,
        },
      ],
    });
    // Commande non lancée : l'erreur reste dans le dialogue.
    expect($('[data-test="queue-manage-error"]')?.textContent).toContain(
      t('dashboard.queue.manage.import_failed'),
    );
  });
});

describe('pages « File d’attente »', () => {
  it('Radarr : bouton de gestion sur l’import bloqué seulement, dialogue sans lien vers la file', async () => {
    const { wrapper } = await mountDashboard(radarrServices, {
      'GET /api/medias/films/films/queue': () => ({
        body: [
          queueItem(),
          queueItem({
            id: 10,
            trackedState: 'downloading',
            trackedStatus: 'ok',
            status: 'downloading',
            statusMessages: [],
          }),
        ],
      }),
      'GET /api/medias/films/films/queue/9/manual-import': () => ({
        body: { files: [movieFile()] },
      }),
    });
    await wrapper.vm.$router.push('/medias/films/films/file-attente');
    await settle();
    const buttons = wrapper.findAll('[data-test="queue-item-manage"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.attributes('aria-label')).toBe(
      t('dashboard.queue.manage.open', { title: 'Film' }),
    );
    await buttons[0]?.trigger('click');
    await settle();
    expect($('[data-test="queue-manage"]')).not.toBeNull();
    expect($('[data-test="queue-manage-open"]')).toBeNull();
    expect($$('[data-test="manual-file"]')).toHaveLength(1);
    expect($('[data-test="queue-manage-import"]')?.textContent).toContain(
      t('dashboard.queue.manage.import', { count: 1 }),
    );
  });

  it('Sonarr : l’import bloqué ouvre la gestion depuis sa ligne', async () => {
    const services: BootstrapServices = {
      states: { sonarr: { configured: true, disabled: false } },
      instances: {
        radarr: [],
        sonarr: [{ slug: 'tv', name: 'TV', enabled: true, isDefault: true }],
      },
      sidebar: {},
    };
    const { wrapper } = await mountDashboard(services, {
      'GET /api/medias/tv/series/queue': () => ({
        body: [
          {
            id: 5,
            seriesId: 1,
            episodeId: 25,
            seriesTitle: 'Show',
            episode: 'S02E05',
            size: 100,
            sizeleft: 0,
            status: 'completed',
            trackedStatus: 'warning',
            trackedState: 'importBlocked',
            quality: 'WEBDL-1080p',
            protocol: 'torrent',
            eta: null,
            indexer: null,
            downloadId: 'HASH5',
            outputPath: '/dl/Show',
            downloadClient: null,
            statusMessages: [{ title: 'E05.mkv', messages: ['Sample'] }],
          },
        ],
      }),
      'GET /api/medias/tv/series/queue/5/manual-import': () => ({
        body: { files: [episodeFile()] },
      }),
    });
    await wrapper.vm.$router.push('/medias/tv/series/file-attente');
    await settle();
    await wrapper.get('[data-test="series-queue-manage"]').trigger('click');
    await settle();
    expect($('[data-test="queue-manage-reasons"]')?.textContent).toContain('E05.mkv: Sample');
    expect($('[data-test="queue-manage-open"]')).toBeNull();
    expect($$('[data-test="manual-file"]')).toHaveLength(1);
  });
});
