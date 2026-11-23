// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `MediaLibraryRefresherTest`.

import { describe, expect, it, vi } from 'vitest';
import { MediaLibraryCache } from '../../src/cache/library-cache';
import {
  MediaLibraryRefresher,
  type LibraryInstance,
} from '../../src/cache/refreshers/media-library';
import { ServiceHealthCache } from '../../src/integrations/http';
import { createSwr, recordingLogger } from './helpers';

const KEY = 'media.movies.radarr-1';

function setup(
  options: {
    load?: (instance: LibraryInstance) => Promise<unknown[]>;
    instance?: LibraryInstance | null;
  } = {},
) {
  const env = createSwr();
  const health = new ServiceHealthCache({ now: env.clock.now });
  const instance =
    options.instance === undefined ? { slug: 'radarr-1', enabled: true } : options.instance;
  const findInstance = vi.fn((service: 'radarr' | 'sonarr', slug: string) =>
    service === 'radarr' && slug === 'radarr-1' ? instance : null,
  );
  const load = vi.fn(options.load ?? (() => Promise.resolve([{ id: 5 }])));
  const logger = recordingLogger();
  const refresher = new MediaLibraryRefresher({
    swr: env.swr,
    health,
    findInstance,
    loaders: { movies: load },
    logger,
  });
  return { ...env, health, findInstance, load, logger, refresher };
}

describe('MediaLibraryRefresher', () => {
  it('ne revendique que les clés de bibliothèque', () => {
    const { refresher } = setup();
    expect(refresher.supports('media.movies.radarr-1')).toBe(true);
    expect(refresher.supports('media.series.sonarr-1')).toBe(true);
    expect(refresher.supports('queue.counts.qbittorrent')).toBe(false);
  });

  it('écrit la liste chargée', async () => {
    const { refresher, swr, load } = setup();
    await refresher.refresh(KEY);
    expect(load).toHaveBeenCalledOnce();
    expect(swr.read(KEY, MediaLibraryCache.TTL_MS)).toEqual({ value: [{ id: 5 }], state: 'fresh' });
  });

  it('ne fait rien si l’entrée est déjà fraîche', async () => {
    const { refresher, swr, load } = setup();
    swr.write(KEY, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS);
    await refresher.refresh(KEY);
    expect(load).not.toHaveBeenCalled();
  });

  it('ne fait rien si le disjoncteur de l’instance est ouvert', async () => {
    const { refresher, health, load } = setup();
    health.markDown('radarr', 'radarr-1');
    await refresher.refresh(KEY);
    expect(load).not.toHaveBeenCalled();
  });

  it('le disjoncteur d’une autre instance ne bloque pas', async () => {
    const { refresher, health, load } = setup();
    health.markDown('radarr', 'radarr-4k');
    await refresher.refresh(KEY);
    expect(load).toHaveBeenCalledOnce();
  });

  it('un fetch vide n’écrase jamais une bonne valeur', async () => {
    const { refresher, swr, store } = setup({ load: () => Promise.resolve([]) });
    swr.write(KEY, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: store.now() - 120_000,
    });
    await refresher.refresh(KEY);
    expect(swr.read(KEY, MediaLibraryCache.TTL_MS)?.value).toEqual([{ id: 1 }]);
  });

  it('un fetch en erreur garde la valeur et journalise un avertissement', async () => {
    const { refresher, swr, store, logger } = setup({
      load: () => Promise.reject(new Error('timeout')),
    });
    swr.write(KEY, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: store.now() - 120_000,
    });
    await refresher.refresh(KEY);
    expect(swr.read(KEY, MediaLibraryCache.TTL_MS)?.value).toEqual([{ id: 1 }]);
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({ level: 'warn', obj: { key: KEY } });
  });

  it('un slug inconnu ne fait rien', async () => {
    const { refresher, load } = setup();
    await refresher.refresh('media.movies.does-not-exist');
    expect(load).not.toHaveBeenCalled();
  });

  it('une instance désactivée ne fait rien', async () => {
    const { refresher, load } = setup({ instance: { slug: 'radarr-1', enabled: false } });
    await refresher.refresh(KEY);
    expect(load).not.toHaveBeenCalled();
  });

  it('un slug vide ne consulte même pas les instances', async () => {
    const { refresher, findInstance, load } = setup();
    await refresher.refresh('media.movies.');
    expect(findInstance).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('les séries sans chargeur (Sonarr avant P3a) ne font rien', async () => {
    const { refresher, load } = setup();
    await refresher.refresh('media.series.radarr-1');
    expect(load).not.toHaveBeenCalled();
  });

  it('un rafraîchissement qui chevauche une invalidation ne ressuscite pas l’ancienne liste', async () => {
    const env = setup();
    const cache = new MediaLibraryCache(env.swr);
    env.load.mockImplementation(() => {
      cache.invalidate('radarr', 'radarr-1');
      return Promise.resolve([{ id: 5 }, { id: 6 }]);
    });
    await env.refresher.refresh(KEY);
    expect(env.swr.read(KEY, MediaLibraryCache.TTL_MS)).toBeNull();
  });
});
