// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `MovieLibraryFilterTest`, partie requête : `fromRequest`,
// `hasActiveFilter`, `withoutPagination`, `toQueryArray` ; schémas des actions.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOVIE_LIBRARY_QUERY,
  hasActiveLibraryFilter,
  libraryFilterCount,
  movieIdsRequestSchema,
  movieLibraryQueryParams,
  moviesBulkDeleteRequestSchema,
  moviesBulkEditRequestSchema,
  parseMovieLibraryQuery,
  withoutPagination,
  type MovieLibraryQuery,
} from '../src/index';

const fromUrl = (search: string, defaultPerPage?: number) =>
  parseMovieLibraryQuery(
    Object.fromEntries(new URLSearchParams(search)),
    ...(defaultPerPage === undefined ? [] : [defaultPerPage]),
  );
const query = (overrides: Partial<MovieLibraryQuery> = {}): MovieLibraryQuery => ({
  ...DEFAULT_MOVIE_LIBRARY_QUERY,
  ...overrides,
});

describe('parseMovieLibraryQuery', () => {
  it('une valeur inconnue retombe sur le défaut', () => {
    const parsed = fromUrl('status=eviltext&sort=hax&per_page=99');
    expect(parsed.status).toBe('all');
    expect(parsed.sort).toBe('title-asc');
    expect(parsed.perPage).toBe(200);
  });

  it('lit l’ancien paramètre `filter` (liens de la v1.0)', () => {
    expect(fromUrl('filter=missing').status).toBe('missing');
  });

  it('`status` l’emporte sur l’ancien `filter`', () => {
    expect(fromUrl('filter=missing&status=downloaded').status).toBe('downloaded');
  });

  it('ignore un ancien `filter` invalide', () => {
    expect(fromUrl('filter=evilvalue').status).toBe('all');
  });

  it('`filter` et `page` se lisent ensemble', () => {
    const parsed = fromUrl('filter=missing&page=2');
    expect(parsed.status).toBe('missing');
    expect(parsed.page).toBe(2);
  });

  it('la page est au moins 1', () => {
    expect(fromUrl('page=-5').page).toBe(1);
    expect(fromUrl('page=abc').page).toBe(1);
  });

  it('retire les espaces', () => {
    const parsed = fromUrl('q=%20%20matrix%20%20&genre=%20Action%20');
    expect(parsed.q).toBe('matrix');
    expect(parsed.genre).toBe('Action');
  });

  it('respecte une taille de page par défaut permise', () => {
    expect(fromUrl('', 100).perPage).toBe(100);
    expect(fromUrl('', 75).perPage).toBe(200);
    expect(fromUrl('per_page=500', 100).perPage).toBe(500);
  });

  it('`unlimited` comme un booléen de Symfony', () => {
    expect(fromUrl('unlimited=1').unlimited).toBe(true);
    expect(fromUrl('unlimited=true').unlimited).toBe(true);
    expect(fromUrl('unlimited=0').unlimited).toBe(false);
    expect(fromUrl('').unlimited).toBe(false);
  });

  it('prend la première valeur d’un paramètre répété', () => {
    expect(parseMovieLibraryQuery({ status: ['missing', 'downloaded'] }).status).toBe('missing');
  });
});

describe('critères', () => {
  it('filtre actif : statut, qualité, genre ou langue, pas la recherche seule', () => {
    expect(hasActiveLibraryFilter(query())).toBe(false);
    expect(hasActiveLibraryFilter(query({ q: 'matrix' }))).toBe(false);
    expect(hasActiveLibraryFilter(query({ status: 'missing' }))).toBe(true);
    expect(hasActiveLibraryFilter(query({ genre: 'Action' }))).toBe(true);
    expect(hasActiveLibraryFilter(query({ quality: '1080p' }))).toBe(true);
    expect(hasActiveLibraryFilter(query({ language: 'French' }))).toBe(true);
  });

  it('compte les critères modifiés, tri compris', () => {
    expect(libraryFilterCount(query())).toBe(0);
    expect(libraryFilterCount(query({ q: 'x', sort: 'year-desc', status: 'missing' }))).toBe(3);
  });

  it('sans pagination : garde les filtres', () => {
    const bulk = withoutPagination(
      query({ q: 'matrix', status: 'missing', genre: 'Action', page: 5, perPage: 50 }),
    );
    expect(bulk.q).toBe('matrix');
    expect(bulk.status).toBe('missing');
    expect(bulk.genre).toBe('Action');
    expect(bulk.unlimited).toBe(true);
  });

  it('URL propre : les valeurs par défaut disparaissent', () => {
    expect(movieLibraryQueryParams(query())).toEqual({});
    expect(
      movieLibraryQueryParams(
        query({ q: 'matrix', status: 'missing', sort: 'year-desc', perPage: 100 }),
      ),
    ).toEqual({ q: 'matrix', status: 'missing', sort: 'year-desc', per_page: '100' });
    // La taille de page des préférences est le défaut : elle n'apparaît pas.
    expect(movieLibraryQueryParams(query({ perPage: 100 }), 100)).toEqual({});
  });
});

describe('schémas des actions en masse', () => {
  it('refuse une sélection vide avec la clé de l’original', () => {
    const result = movieIdsRequestSchema.safeParse({ movieIds: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('media.api.no_movies_selected');
  });

  it('éditeur : champs facultatifs, valeurs bornées', () => {
    expect(moviesBulkEditRequestSchema.parse({ movieIds: [1] })).toEqual({ movieIds: [1] });
    expect(
      moviesBulkEditRequestSchema.safeParse({ movieIds: [1], minimumAvailability: 'tba' }).success,
    ).toBe(false);
    expect(
      moviesBulkEditRequestSchema.safeParse({ movieIds: [1], tags: [2], applyTags: 'merge' })
        .success,
    ).toBe(false);
  });

  it('suppression : options à faux par défaut', () => {
    expect(moviesBulkDeleteRequestSchema.parse({ movieIds: [3] })).toEqual({
      movieIds: [3],
      deleteFiles: false,
      addImportExclusion: false,
    });
  });
});
