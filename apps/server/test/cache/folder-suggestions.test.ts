// SPDX-License-Identifier: AGPL-3.0-or-later
// Suggestions par dossier racine (lot 8) : premier calcul en ligne, entrée
// périmée servie puis reconstruite par le refresher, échec sans écrasement.

import type { Movie } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import { FolderSuggestionsRefresher } from '../../src/cache/refreshers/folder-suggestions';
import type { TmdbClient, TmdbRaw } from '../../src/integrations/tmdb/client';
import {
  FOLDERS_SOFT_TTL_MS,
  FolderSuggestions,
  type StoredFolder,
} from '../../src/modules/discover/folders';
import { createSwr } from './helpers';

function setup() {
  const { swr, clock, dispatched } = createSwr();
  let recommendations: TmdbRaw = { results: [{ id: 700, title: 'Suggestion' }] };
  let calls = 0;
  const tmdb = {
    locale: 'fr-FR',
    movieRecommendations: () => {
      calls += 1;
      return Promise.resolve(recommendations);
    },
    tvRecommendations: () => Promise.resolve({}),
    findTmdbIdByTvdbId: () => Promise.resolve(null),
  } as unknown as TmdbClient;
  const movie = { tmdbId: 501, rootFolderPath: '/movies', path: null, addedAt: null } as Movie;
  const folders = new FolderSuggestions({
    swr,
    tmdb: () => tmdb,
    library: () =>
      Promise.resolve({
        movies: [{ item: movie, slug: 'films', instanceName: 'Films' }],
        series: [],
      }),
    index: () => Promise.resolve({ movie: new Map(), tv: new Map() }),
  });
  return {
    swr,
    clock,
    dispatched,
    folders,
    refresher: new FolderSuggestionsRefresher(folders, swr),
    calls: () => calls,
    setRecommendations: (data: TmdbRaw) => {
      recommendations = data;
    },
  };
}

const ids = (rows: StoredFolder[]) => rows.flatMap((row) => row.results.map((card) => card.id));

describe('FolderSuggestions', () => {
  it('calcul au premier appel, puis cache ; périmé : servi et reconstruit en arrière-plan', async () => {
    const t = setup();
    expect(ids(await t.folders.read())).toEqual([700]);
    expect(ids(await t.folders.read())).toEqual([700]);
    expect(t.calls()).toBe(1);

    t.clock.advance(FOLDERS_SOFT_TTL_MS + 1);
    t.setRecommendations({ results: [{ id: 701, title: 'Nouvelle' }] });
    expect(ids(await t.folders.read())).toEqual([700]);
    expect(t.dispatched).toEqual(['discover.folders.fr-FR']);
    expect(t.refresher.supports('discover.folders.fr-FR')).toBe(true);
    await t.refresher.refresh('discover.folders.fr-FR');
    expect(ids(await t.folders.read())).toEqual([701]);
  });

  it('TMDB injoignable : rien n’est mis en cache, la dernière valeur est gardée', async () => {
    const t = setup();
    t.setRecommendations({});
    expect(await t.folders.read()).toEqual([]);
    t.setRecommendations({ results: [{ id: 700 }] });
    expect(ids(await t.folders.read())).toEqual([700]);

    t.clock.advance(FOLDERS_SOFT_TTL_MS + 1);
    t.setRecommendations({});
    await t.refresher.refresh('discover.folders.fr-FR');
    expect(ids(await t.folders.read())).toEqual([700]);
  });
});
