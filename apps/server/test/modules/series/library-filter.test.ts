// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `SeriesLibraryFilterTest` (partie filtre) : statuts propres à Sonarr,
// chaîne, tri par progression, pagination, facettes. La partie « requête »
// (`fromRequest`, `toQueryArray`…) est portée dans le paquet partagé.

import { DEFAULT_SERIES_LIBRARY_QUERY, type SeriesLibraryQuery } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import {
  applySeriesLibraryFilter,
  pageOfSeries,
  seriesStats,
  type FilterableSeries,
} from '../../../src/modules/series/library-filter';

function series(id: number, overrides: Partial<FilterableSeries> = {}): FilterableSeries {
  return {
    id,
    title: `Series ${id}`,
    sortTitle: `series ${id}`,
    year: 2010,
    status: 'continuing',
    monitored: true,
    seriesType: 'standard',
    episodeCount: 10,
    percent: 100,
    sizeOnDisk: 0,
    sizeGb: 0,
    network: null,
    genres: [],
    addedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const query = (overrides: Partial<SeriesLibraryQuery> = {}): SeriesLibraryQuery => ({
  ...DEFAULT_SERIES_LIBRARY_QUERY,
  ...overrides,
});
const ids = (items: readonly FilterableSeries[]) => items.map((entry) => entry.id);

describe('SeriesLibraryFilter', () => {
  it('bibliothèque vide', () => {
    const result = applySeriesLibraryFilter([], query());
    expect(result).toMatchObject({
      items: [],
      total: 0,
      libraryTotal: 0,
      totalPages: 1,
      genres: [],
      networks: [],
    });
  });

  it('« en cours » et « terminées » comparent le statut de l’instance', () => {
    const library = [
      series(1, { status: 'continuing' }),
      series(2, { status: 'ended' }),
      series(3, { status: 'upcoming' }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ status: 'continuing' })).items)).toEqual([
      1,
    ]);
    expect(ids(applySeriesLibraryFilter(library, query({ status: 'ended' })).items)).toEqual([2]);
  });

  it('« animés » compare le type de série', () => {
    const library = [
      series(1, { seriesType: 'standard' }),
      series(2, { seriesType: 'anime' }),
      series(3, { seriesType: 'daily' }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ status: 'anime' })).items)).toEqual([2]);
  });

  it('« manquants » : suivie, incomplète, au moins un épisode diffusé', () => {
    const library = [
      series(1, { monitored: true, percent: 80, episodeCount: 10 }),
      series(2, { monitored: true, percent: 100, episodeCount: 10 }),
      series(3, { monitored: false, percent: 50, episodeCount: 10 }),
      series(4, { monitored: true, percent: 50, episodeCount: 0 }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ status: 'missing' })).items)).toEqual([1]);
  });

  it('suivies et non suivies sont des opposés', () => {
    const library = [series(1, { monitored: true }), series(2, { monitored: false })];
    expect(ids(applySeriesLibraryFilter(library, query({ status: 'monitored' })).items)).toEqual([
      1,
    ]);
    expect(ids(applySeriesLibraryFilter(library, query({ status: 'unmonitored' })).items)).toEqual([
      2,
    ]);
  });

  it('recherche insensible à la casse sur le titre', () => {
    const library = [
      series(1, { title: 'Breaking Bad' }),
      series(2, { title: 'Better Call Saul' }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ q: 'BREAKING' })).items)).toEqual([1]);
  });

  it('genre par appartenance exacte, chaîne par égalité exacte', () => {
    const library = [
      series(1, { genres: ['Drama', 'Crime'], network: 'AMC' }),
      series(2, { genres: ['Comedy'], network: 'HBO' }),
      series(3, { network: 'AMC' }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ genre: 'Drama' })).items)).toEqual([1]);
    expect(ids(applySeriesLibraryFilter(library, query({ network: 'AMC' })).items)).toEqual([1, 3]);
  });

  it('le tri par titre garde l’article en place', () => {
    const library = [
      series(1, { title: 'Breaking Bad', sortTitle: 'breaking bad' }),
      series(2, { title: 'The Wire', sortTitle: 'wire' }),
      series(3, { title: 'Atlanta', sortTitle: 'atlanta' }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ sort: 'title-asc' })).items)).toEqual([
      3, 1, 2,
    ]);
  });

  it('tri par progression, dans les deux sens', () => {
    const library = [
      series(1, { percent: 100 }),
      series(2, { percent: 30 }),
      series(3, { percent: 75 }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ sort: 'percent-desc' })).items)).toEqual([
      1, 3, 2,
    ]);
    expect(ids(applySeriesLibraryFilter(library, query({ sort: 'percent-asc' })).items)).toEqual([
      2, 3, 1,
    ]);
  });

  it('« ajoutées récemment » sur la date d’ajout normalisée', () => {
    const library = [
      series(1, { addedAt: '2024-01-01T00:00:00.000Z' }),
      series(2, { addedAt: '2026-05-10T00:00:00.000Z' }),
      series(3, { addedAt: '2025-06-15T00:00:00.000Z' }),
    ];
    expect(ids(applySeriesLibraryFilter(library, query({ sort: 'added-desc' })).items)).toEqual([
      2, 3, 1,
    ]);
  });

  it('pagination, page ramenée à la dernière', () => {
    const library = Array.from({ length: 5 }, (_, index) =>
      series(index + 1, { title: `Series 0${index + 1}` }),
    );
    const first = applySeriesLibraryFilter(library, query({ perPage: 2, page: 1 }));
    expect(ids(first.items)).toEqual([1, 2]);
    expect(first.totalPages).toBe(3);
    expect(ids(applySeriesLibraryFilter(library, query({ perPage: 2, page: 42 })).items)).toEqual([
      5,
    ]);
  });

  it('`unlimited` contourne la pagination', () => {
    const library = Array.from({ length: 800 }, (_, index) => series(index + 1));
    const result = applySeriesLibraryFilter(library, query({ perPage: 50, unlimited: true }));
    expect(result.items).toHaveLength(800);
    expect(result.totalPages).toBe(1);
    expect(result.unlimited).toBe(true);
  });

  it('facettes calculées sur la bibliothèque non filtrée', () => {
    const library = [
      series(1, { genres: ['Drama'], network: 'HBO' }),
      series(2, { genres: ['Comedy'], network: 'NBC' }),
    ];
    const result = applySeriesLibraryFilter(library, query({ genre: 'Drama' }));
    expect(result.genres).toEqual(['Comedy', 'Drama']);
    expect(result.networks).toEqual(['HBO', 'NBC']);
  });

  it('les filtres combinés se croisent', () => {
    const library = [
      series(1, { status: 'continuing', seriesType: 'anime', network: 'Crunchyroll' }),
      series(2, { status: 'continuing', seriesType: 'standard', network: 'AMC' }),
      series(3, { status: 'ended', seriesType: 'anime', network: 'Crunchyroll' }),
    ];
    const result = applySeriesLibraryFilter(
      library,
      query({ status: 'anime', network: 'Crunchyroll' }),
    );
    expect(ids(result.items)).toEqual([1, 3]);
  });

  it('lien profond : page qui contient la série', () => {
    const library = Array.from({ length: 5 }, (_, index) =>
      series(index + 1, { title: `Series 0${index + 1}` }),
    );
    expect(pageOfSeries(library, query({ perPage: 2 }), 5)).toBe(3);
    expect(pageOfSeries(library, query({ perPage: 2 }), 99)).toBeNull();
  });

  it('statistiques de toute la bibliothèque', () => {
    expect(
      seriesStats([
        series(1, { status: 'continuing', sizeGb: 1.26 }),
        series(2, { status: 'ended', sizeGb: 2.5 }),
        series(3, { status: 'upcoming', sizeGb: null }),
      ]),
    ).toEqual({ total: 3, continuing: 1, ended: 1, totalGb: 3.8 });
  });
});
