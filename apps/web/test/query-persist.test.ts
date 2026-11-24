// SPDX-License-Identifier: AGPL-3.0-or-later
// Cache persistant de TanStack Query : liste blanche, clé utilisateur + version,
// durée maximale, purge, indicateur « mise à jour… ».
import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import {
  QUERY_CACHE_MAX_AGE,
  QUERY_PERSISTENCE,
  cacheBuster,
  createQueryPersistence,
  isPersistedQueryKey,
  useRestoredRefreshing,
} from '../src/app/query-persist';

function memoryPersister(): Persister & { stored: PersistedClient | undefined } {
  const persister = {
    stored: undefined as PersistedClient | undefined,
    persistClient: (client: PersistedClient) => {
      persister.stored = structuredClone(client);
    },
    restoreClient: () => persister.stored,
    removeClient: () => {
      persister.stored = undefined;
    },
  };
  return persister;
}

const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(persister = memoryPersister(), version = '1.0.0') {
  const queryClient = new QueryClient();
  const persistence = createQueryPersistence(queryClient, {
    persister,
    version,
    throttleMs: 0,
  });
  return { queryClient, persistence, persister };
}

describe('isPersistedQueryKey', () => {
  it('garde le contenu de consultation', () => {
    expect(isPersistedQueryKey(['dashboard', 'page'])).toBe(true);
    expect(isPersistedQueryKey(['dashboard', 'trending'])).toBe(true);
    expect(isPersistedQueryKey(['discover', 'home'])).toBe(true);
    expect(isPersistedQueryKey(['calendar', '2026-11'])).toBe(true);
    expect(isPersistedQueryKey(['radarr', 'main', 'library', 'page=1'])).toBe(true);
    expect(isPersistedQueryKey(['radarr', 'main', 'movie', 12])).toBe(true);
    expect(isPersistedQueryKey(['radarr', 'main', 'movie', 12, 'credits'])).toBe(true);
    expect(isPersistedQueryKey(['sonarr', 'main', 'series', 3, 'episodes'])).toBe(true);
  });

  it('écarte journaux, paramètres, profil et flux temps réel', () => {
    expect(isPersistedQueryKey(['admin', 'logs'])).toBe(false);
    expect(isPersistedQueryKey(['admin', 'settings'])).toBe(false);
    expect(isPersistedQueryKey(['profile'])).toBe(false);
    expect(isPersistedQueryKey(['dashboard', 'activity'])).toBe(false);
    expect(isPersistedQueryKey(['dashboard', 'health'])).toBe(false);
    expect(isPersistedQueryKey(['downloads', 'summary'])).toBe(false);
    expect(isPersistedQueryKey(['torrents', 'qbittorrent', 'list', {}])).toBe(false);
    expect(isPersistedQueryKey(['radarr', 'main', 'queue'])).toBe(false);
    expect(isPersistedQueryKey(['radarr', 'main', 'config'])).toBe(false);
    expect(isPersistedQueryKey(['radarr', 'main', 'movie', 12, 'history'])).toBe(false);
    expect(isPersistedQueryKey(['sonarr', 'main', 'movie', 12])).toBe(false);
  });
});

describe('createQueryPersistence', () => {
  it('enregistre seulement les requêtes de la liste blanche', async () => {
    const { queryClient, persistence, persister } = setup();
    await persistence.start(1);
    queryClient.setQueryData(['dashboard', 'page'], { cards: ['hero'] });
    queryClient.setQueryData(['admin', 'logs'], ['secret']);
    await wait();
    const keys = persister.stored?.clientState.queries.map((query) => query.queryKey);
    expect(keys).toEqual([['dashboard', 'page']]);
    expect(persister.stored?.buster).toBe(cacheBuster('1.0.0', 1));
  });

  it('restaure les données du même utilisateur et de la même version', async () => {
    const first = setup();
    await first.persistence.start(1);
    first.queryClient.setQueryData(['discover', 'home'], { rows: 3 });
    await wait();

    const second = setup(first.persister);
    await second.persistence.start(1);
    expect(second.queryClient.getQueryData(['discover', 'home'])).toEqual({ rows: 3 });
    // Revalidées au prochain affichage, même récentes.
    expect(second.queryClient.getQueryState(['discover', 'home'])?.isInvalidated).toBe(true);
    expect(second.persistence.restoredAt()).toBeGreaterThan(0);
  });

  it('écarte le cache d’un autre utilisateur ou d’une autre version', async () => {
    const first = setup();
    await first.persistence.start(1);
    first.queryClient.setQueryData(['discover', 'home'], { rows: 3 });
    await wait();
    const saved = first.persister.stored;

    const other = setup(memoryPersister());
    other.persister.stored = saved;
    await other.persistence.start(2);
    expect(other.queryClient.getQueryData(['discover', 'home'])).toBeUndefined();

    const upgraded = setup(memoryPersister(), '1.1.0');
    upgraded.persister.stored = saved;
    await upgraded.persistence.start(1);
    expect(upgraded.queryClient.getQueryData(['discover', 'home'])).toBeUndefined();
  });

  it('écarte un cache de plus de 24 h', async () => {
    const { persistence, queryClient, persister } = setup();
    persister.stored = {
      timestamp: Date.now() - QUERY_CACHE_MAX_AGE - 1000,
      buster: cacheBuster('1.0.0', 1),
      clientState: { mutations: [], queries: [] },
    };
    await persistence.start(1);
    expect(persister.stored).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('purge la mémoire et le stockage, puis n’enregistre plus rien', async () => {
    const { queryClient, persistence, persister } = setup();
    await persistence.start(1);
    queryClient.setQueryData(['calendar'], { days: [] });
    await wait();
    expect(persister.stored).toBeDefined();

    await persistence.purge();
    expect(persister.stored).toBeUndefined();
    expect(queryClient.getQueryData(['calendar'])).toBeUndefined();
    expect(persistence.restoredAt()).toBe(0);

    queryClient.setQueryData(['calendar'], { days: [1] });
    await wait();
    expect(persister.stored).toBeUndefined();
  });

  it('garde 24 h en mémoire les requêtes persistées', () => {
    const { queryClient } = setup();
    expect(queryClient.getQueryDefaults(['radarr', 'main', 'library']).gcTime).toBe(
      QUERY_CACHE_MAX_AGE,
    );
    expect(queryClient.getQueryDefaults(['admin', 'logs']).gcTime).toBeUndefined();
  });
});

describe('useRestoredRefreshing', () => {
  it('signale le rafraîchissement des données restaurées seulement', async () => {
    const { queryClient, persistence, persister } = setup();
    persister.stored = {
      timestamp: Date.now(),
      buster: cacheBuster('1.0.0', 1),
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['dashboard', 'page'],
            queryHash: JSON.stringify(['dashboard', 'page']),
            dehydratedAt: Date.now() - 60_000,
            state: {
              data: { old: true },
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now() - 60_000,
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
            },
          },
        ],
      },
    };
    await persistence.start(1);

    let refreshing = false;
    const Probe = defineComponent({
      setup() {
        const state = useRestoredRefreshing();
        return () => {
          refreshing = state.value;
          return h('div');
        };
      },
    });
    mount(Probe, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        provide: { [QUERY_PERSISTENCE as symbol]: persistence },
      },
    });
    expect(refreshing).toBe(false);

    let release: (value: unknown) => void = () => undefined;
    const fetching = queryClient.query({
      queryKey: ['dashboard', 'page'],
      queryFn: () => new Promise((resolve) => (release = resolve)),
    });
    // Une requête non restaurée ne compte pas.
    void queryClient
      .query({ queryKey: ['admin', 'logs'], queryFn: () => new Promise(() => undefined) })
      .catch(() => undefined);
    await wait();
    expect(refreshing).toBe(true);

    release({ old: false });
    await fetching;
    await wait();
    expect(refreshing).toBe(false);
  });
});
