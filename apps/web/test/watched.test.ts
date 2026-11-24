// SPDX-License-Identifier: AGPL-3.0-or-later
// « Vu » via Tracearr (lot 7) : index des titres vus, badges de la
// bibliothèque des séries et carte Tracearr du profil.

import type { BootstrapServices, TracearrLink, TracearrWatched } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import {
  EMPTY_WATCHED,
  indexWatched,
  showEpisodes,
  watchedCount,
  watchedProgress,
} from '../src/features/activity/watched';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';
import {
  SERIES,
  SONARR_HEALTH,
  SONARR_SERVICES,
  cleanupMounted,
  mounted,
  seriesLibraryOf,
} from './series-fixtures';

const WATCHED: TracearrWatched = {
  linked: true,
  movies: [603],
  shows: [
    {
      tmdbId: 1399,
      tvdbId: SERIES[0]?.tvdbId ?? null,
      episodes: [
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 1],
      ],
    },
    { tmdbId: 1399, tvdbId: null, episodes: [[1, 3]] },
  ],
};

const SERVICES: BootstrapServices = {
  ...SONARR_SERVICES,
  states: { ...SONARR_SERVICES.states, tracearr: { configured: true, disabled: false } },
};

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupMounted);

describe('index des titres vus', () => {
  it('sans compte associé : vide', () => {
    expect(indexWatched({ linked: false, movies: [1], shows: [] })).toBe(EMPTY_WATCHED);
    expect(indexWatched(undefined)).toBe(EMPTY_WATCHED);
  });

  it('films, séries par TVDB et TMDB, épisodes fusionnés', () => {
    const index = indexWatched(WATCHED);
    expect(index.movies.has(603)).toBe(true);
    const tvdb = SERIES[0]?.tvdbId ?? 0;
    expect(watchedCount(showEpisodes(index, { tvdbId: tvdb }))).toBe(3);
    expect(watchedCount(showEpisodes(index, { tmdbId: 1399 }))).toBe(4);
    // Les deux identifiants : union, sans doublon.
    const both = showEpisodes(index, { tvdbId: tvdb, tmdbId: 1399 });
    expect(watchedCount(both)).toBe(4);
    expect(watchedCount(both, 0)).toBe(1);
    expect(watchedCount(both, 2)).toBe(1);
    expect(showEpisodes(index, { tvdbId: 1 })).toBeNull();
    expect(watchedCount(null)).toBe(0);
  });

  it('progression : rien, une partie ou tout', () => {
    expect(watchedProgress(0, 10)).toBeNull();
    expect(watchedProgress(3, 10)).toEqual({ kind: 'some', watched: 3, total: 10 });
    expect(watchedProgress(12, 10)).toEqual({ kind: 'all' });
    expect(watchedProgress(2, 0)).toEqual({ kind: 'some', watched: 2, total: 0 });
  });
});

describe('bibliothèque des séries', () => {
  async function mountLibrary(tracearr: boolean) {
    const fetch = fakeFetch({
      'GET /api/health/services': SONARR_HEALTH,
      'GET /api/medias/sonarr/series': () => ({ body: seriesLibraryOf(SERIES) }),
      'GET /api/medias/sonarr/series/warnings': () => ({ body: { warnings: [] } }),
      'GET /api/medias/sonarr/series/commands/active': () => ({ body: [] }),
      'GET /api/medias/sonarr/series/queue': () => ({ body: [] }),
      'GET /api/tracearr/watched': () => ({ body: WATCHED }),
    });
    const app = await mountApp(
      '/medias/sonarr/series',
      bootstrapOf({ user: ADMIN, services: tracearr ? SERVICES : SONARR_SERVICES }),
    );
    mounted.push(app.wrapper);
    await settle();
    return { ...app, fetch };
  }

  it('badge « x/y watched » sur la carte de la série vue', async () => {
    const { wrapper } = await mountLibrary(true);
    const badges = wrapper.findAll('[data-test="watched-badge"]');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.text()).toBe('3/20 watched');
  });

  it('Tracearr non configuré : aucune requête, aucun badge', async () => {
    const { wrapper, fetch } = await mountLibrary(false);
    expect(wrapper.find('[data-test="watched-badge"]').exists()).toBe(false);
    expect(fetch.calls.some((call) => call.url.includes('/api/tracearr/watched'))).toBe(false);
  });
});

describe('profil : compte Tracearr', () => {
  const LINK: TracearrLink = {
    unavailable: null,
    accounts: [
      { key: 'A'.repeat(22), name: 'alice' },
      { key: 'B'.repeat(22), name: 'Bob' },
    ],
    linked: { key: 'B'.repeat(22), name: 'Bob' },
    sync: { lastRunAt: '2026-11-20T20:00:00.000Z', error: null, plays: 42 },
  };
  const PROFILE = {
    user: ADMIN,
    displayNameRaw: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    watchlist: { count: 0, recent: [] },
  };

  async function mountProfile(link: TracearrLink, services: BootstrapServices = SERVICES) {
    const fetch = fakeFetch({
      'GET /api/health/services': SONARR_HEALTH,
      'GET /api/profil': () => ({ body: PROFILE }),
      'GET /api/profil/tracearr': () => ({ body: link }),
      'POST /api/admin/tracearr/resync': () => ({ body: link }),
      'GET /api/tracearr/watched': () => ({ body: WATCHED }),
    });
    const app = await mountApp('/profil', bootstrapOf({ user: ADMIN, services }));
    mounted.push(app.wrapper);
    await settle();
    return { ...app, fetch };
  }

  it('compte associé, état de la synchronisation, resynchronisation', async () => {
    const { wrapper, fetch } = await mountProfile(LINK);
    const card = wrapper.find('[data-test="profile-tracearr"]');
    expect(card.exists()).toBe(true);
    expect(card.find('[data-test="profile-tracearr-account"]').text()).toContain('Bob');
    expect(card.find('[data-test="profile-tracearr-sync"]').text()).toContain('42 plays');
    await card.find('[data-test="profile-tracearr-resync"]').trigger('click');
    await settle();
    expect(fetch.calls.some((call) => call.url.endsWith('/api/admin/tracearr/resync'))).toBe(true);
  });

  it('API v2 absente : avertissement', async () => {
    const { wrapper } = await mountProfile({
      unavailable: 'unsupported',
      accounts: [],
      linked: null,
      sync: null,
    });
    expect(wrapper.find('[data-test="profile-tracearr-unavailable"]').text()).toContain(
      'no v2 API',
    );
    expect(wrapper.find('[data-test="profile-tracearr-resync"]').exists()).toBe(false);
  });

  it('Tracearr non configuré : pas de carte', async () => {
    const { wrapper } = await mountProfile(LINK, SONARR_SERVICES);
    expect(wrapper.find('[data-test="profile-tracearr"]').exists()).toBe(false);
  });
});
