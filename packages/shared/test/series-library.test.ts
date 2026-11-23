// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `SeriesLibraryFilterTest` (partie requête) : lecture tolérante de
// la chaîne de requête, lien `?filter=` de la v1.0, filtre actif, URL propre.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERIES_LIBRARY_QUERY,
  hasActiveSeriesFilter,
  parseSeriesLibraryQuery,
  seriesAddRequestSchema,
  seriesBulkEditRequestSchema,
  seriesFilterCount,
  seriesLibraryQueryParams,
  seriesWithoutPagination,
} from '../src';

const parse = (search: string) =>
  parseSeriesLibraryQuery(Object.fromEntries(new URLSearchParams(search)));

describe('SeriesLibraryQuery', () => {
  it('valeurs inconnues ramenées aux défauts', () => {
    const query = parse('status=evilvalue&sort=hax&per_page=99');
    expect(query.status).toBe('all');
    expect(query.sort).toBe('title-asc');
    expect(query.perPage).toBe(200);
  });

  it('lien hérité `?filter=` honoré sans `?status=`', () => {
    expect(parse('filter=continuing').status).toBe('continuing');
    expect(parse('filter=anime&status=ended').status).toBe('ended');
    expect(parse('filter=garbage').status).toBe('all');
    const legacy = parse('filter=missing&page=4');
    expect(legacy.status).toBe('missing');
    expect(legacy.page).toBe(4);
  });

  it('taille de page par défaut = préférence, si elle est permise', () => {
    expect(parseSeriesLibraryQuery({}, 50).perPage).toBe(50);
    expect(parseSeriesLibraryQuery({}, 7).perPage).toBe(200);
  });

  it('filtre actif : la recherche seule ne compte pas', () => {
    expect(hasActiveSeriesFilter(DEFAULT_SERIES_LIBRARY_QUERY)).toBe(false);
    expect(hasActiveSeriesFilter({ ...DEFAULT_SERIES_LIBRARY_QUERY, q: 'wire' })).toBe(false);
    expect(hasActiveSeriesFilter({ ...DEFAULT_SERIES_LIBRARY_QUERY, status: 'continuing' })).toBe(
      true,
    );
    expect(hasActiveSeriesFilter({ ...DEFAULT_SERIES_LIBRARY_QUERY, genre: 'Drama' })).toBe(true);
    expect(hasActiveSeriesFilter({ ...DEFAULT_SERIES_LIBRARY_QUERY, network: 'HBO' })).toBe(true);
  });

  it('sans pagination : filtres gardés', () => {
    const bulk = seriesWithoutPagination({
      ...DEFAULT_SERIES_LIBRARY_QUERY,
      q: 'wire',
      status: 'missing',
      genre: 'Drama',
      network: 'HBO',
      page: 5,
      perPage: 50,
    });
    expect(bulk).toMatchObject({
      q: 'wire',
      status: 'missing',
      genre: 'Drama',
      network: 'HBO',
      page: 1,
      unlimited: true,
    });
  });

  it('URL propre : valeurs par défaut retirées', () => {
    expect(seriesLibraryQueryParams(DEFAULT_SERIES_LIBRARY_QUERY)).toEqual({});
    expect(
      seriesLibraryQueryParams({
        ...DEFAULT_SERIES_LIBRARY_QUERY,
        q: 'wire',
        status: 'continuing',
        network: 'HBO',
        sort: 'year-desc',
        perPage: 100,
      }),
    ).toEqual({
      q: 'wire',
      status: 'continuing',
      network: 'HBO',
      sort: 'year-desc',
      per_page: '100',
    });
  });

  it('pastille des filtres (tri compris)', () => {
    expect(
      seriesFilterCount({ ...DEFAULT_SERIES_LIBRARY_QUERY, q: 'x', sort: 'percent-asc' }),
    ).toBe(2);
  });
});

describe('contrats', () => {
  it('masse : liste vide refusée avec la clé de l’original', () => {
    const result = seriesBulkEditRequestSchema.safeParse({ seriesIds: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('media.api.no_series');
  });

  it('ajout : dossier racine obligatoire, défauts de l’original', () => {
    expect(seriesAddRequestSchema.safeParse({ tvdbId: 1, rootFolderPath: ' ' }).success).toBe(
      false,
    );
    expect(seriesAddRequestSchema.parse({ tvdbId: 1, rootFolderPath: '/tv' })).toEqual({
      tvdbId: 1,
      qualityProfileId: 0,
      rootFolderPath: '/tv',
      monitored: true,
      seasonFolder: true,
      monitor: 'all',
      searchForMissing: false,
    });
  });
});
