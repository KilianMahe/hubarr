// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `MovieLibraryFilterTest` (partie filtre, tri, pagination, facettes) ;
// la partie requête (`fromRequest`, `toQueryArray`…) est dans le paquet partagé.

import { DEFAULT_MOVIE_LIBRARY_QUERY, type MovieLibraryQuery } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import {
  applyMovieLibraryFilter,
  libraryStats,
  pageOfMovie,
  type FilterableMovie,
} from '../../../src/modules/movies/library-filter';

function movie(id: number, overrides: Partial<FilterableMovie> = {}): FilterableMovie {
  return {
    id,
    title: `Movie ${id}`,
    sortTitle: `movie ${id}`,
    year: 2000,
    added: '2024-01-01T00:00:00Z',
    sizeOnDisk: 0,
    hasFile: false,
    monitored: true,
    quality: null,
    genres: [],
    languages: [],
    ...overrides,
  };
}

const query = (overrides: Partial<MovieLibraryQuery> = {}): MovieLibraryQuery => ({
  ...DEFAULT_MOVIE_LIBRARY_QUERY,
  ...overrides,
});

const ids = (items: readonly FilterableMovie[]) => items.map((item) => item.id);

describe('applyMovieLibraryFilter', () => {
  it('bibliothèque vide : résultat vide, une page pour que la pagination s’affiche', () => {
    const result = applyMovieLibraryFilter([], query());
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.libraryTotal).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.genres).toEqual([]);
    expect(result.qualities).toEqual([]);
    expect(result.languages).toEqual([]);
  });

  describe('statut', () => {
    it('« all » garde tout', () => {
      const movies = [
        movie(1, { hasFile: true }),
        movie(2, { hasFile: false, monitored: true }),
        movie(3, { monitored: false }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ status: 'all' })).items)).toEqual([
        1, 2, 3,
      ]);
    });

    it('« downloaded » ne garde que les films avec fichier', () => {
      const movies = [
        movie(1, { hasFile: true }),
        movie(2, { hasFile: false, monitored: true }),
        movie(3, { hasFile: false, monitored: false }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ status: 'downloaded' })).items)).toEqual([
        1,
      ]);
    });

    it('« missing » exige un film suivi sans fichier', () => {
      const movies = [
        movie(1, { hasFile: false, monitored: true }),
        movie(2, { hasFile: true, monitored: true }),
        movie(3, { hasFile: false, monitored: false }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ status: 'missing' })).items)).toEqual([1]);
    });

    it('« unmonitored » écarte les films suivis', () => {
      const movies = [movie(1, { monitored: false }), movie(2, { monitored: true })];
      expect(ids(applyMovieLibraryFilter(movies, query({ status: 'unmonitored' })).items)).toEqual([
        1,
      ]);
    });

    it('« monitored » écarte les films non suivis', () => {
      const movies = [movie(1, { monitored: true }), movie(2, { monitored: false })];
      expect(ids(applyMovieLibraryFilter(movies, query({ status: 'monitored' })).items)).toEqual([
        1,
      ]);
    });
  });

  describe('recherche et filtres', () => {
    it('recherche insensible à la casse sur le titre', () => {
      const movies = [movie(1, { title: 'The Matrix' }), movie(2, { title: 'Inception' })];
      expect(ids(applyMovieLibraryFilter(movies, query({ q: 'matrix' })).items)).toEqual([1]);
    });

    it('recherche aussi sur le titre de tri', () => {
      const movies = [movie(1, { title: 'Le Seigneur', sortTitle: 'matrix' })];
      expect(applyMovieLibraryFilter(movies, query({ q: 'matrix' })).items).toHaveLength(1);
    });

    it('qualité : égalité exacte', () => {
      const movies = [movie(1, { quality: 'WEBDL-1080p' }), movie(2, { quality: 'Bluray-2160p' })];
      expect(ids(applyMovieLibraryFilter(movies, query({ quality: 'WEBDL-1080p' })).items)).toEqual(
        [1],
      );
    });

    it('genre : appartenance exacte', () => {
      const movies = [
        movie(1, { genres: ['Action', 'Sci-Fi'] }),
        movie(2, { genres: ['Drama'] }),
        movie(3, { genres: ['Sci-Fi'] }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ genre: 'Sci-Fi' })).items)).toEqual([
        1, 3,
      ]);
    });

    it('langue : sous-chaîne (« rench » trouve « French »)', () => {
      const movies = [
        movie(1, { languages: ['French', 'English'] }),
        movie(2, { languages: ['Japanese'] }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ language: 'rench' })).items)).toEqual([1]);
    });

    it('les filtres se combinent', () => {
      const movies = [
        movie(1, { hasFile: true, quality: '1080p', genres: ['Action'] }),
        movie(2, { hasFile: true, quality: '720p', genres: ['Action'] }),
        movie(3, { hasFile: true, quality: '1080p', genres: ['Drama'] }),
      ];
      const result = applyMovieLibraryFilter(
        movies,
        query({ status: 'downloaded', quality: '1080p', genre: 'Action' }),
      );
      expect(ids(result.items)).toEqual([1]);
    });
  });

  describe('tri', () => {
    it('titre croissant, naturel et insensible à la casse', () => {
      const movies = [
        movie(10, { sortTitle: 'movie 10' }),
        movie(2, { sortTitle: 'Movie 2' }),
        movie(1, { sortTitle: 'Movie 1' }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'title-asc' })).items)).toEqual([
        1, 2, 10,
      ]);
    });

    it('titre décroissant', () => {
      const movies = [movie(1, { title: 'aaa' }), movie(2, { title: 'bbb' })];
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'title-desc' })).items)).toEqual([
        2, 1,
      ]);
    });

    it('l’article est conservé : « The Batman » se range sous T', () => {
      const movies = [
        movie(1, { title: 'Dans le noir', sortTitle: 'dans le noir' }),
        movie(2, { title: 'The Batman', sortTitle: 'batman' }),
        movie(3, { title: 'Apocalypse Now', sortTitle: 'apocalypse now' }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'title-asc' })).items)).toEqual([
        3, 1, 2,
      ]);
    });

    it('sans titre, repli sur le titre de tri', () => {
      const movies = [movie(1, { title: '', sortTitle: 'zz' }), movie(2, { title: 'Aa' })];
      expect(ids(applyMovieLibraryFilter(movies, query()).items)).toEqual([2, 1]);
    });

    it('année décroissante et croissante', () => {
      const movies = [movie(1, { year: 1999 }), movie(2, { year: 2023 }), movie(3, { year: 2010 })];
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'year-desc' })).items)).toEqual([
        2, 3, 1,
      ]);
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'year-asc' })).items)).toEqual([
        1, 3, 2,
      ]);
    });

    it('ajout le plus récent en premier', () => {
      const movies = [
        movie(1, { added: '2024-01-01T00:00:00Z' }),
        movie(2, { added: '2026-05-10T00:00:00Z' }),
        movie(3, { added: '2025-06-15T00:00:00Z' }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'added-desc' })).items)).toEqual([
        2, 3, 1,
      ]);
    });

    it('taille décroissante et croissante', () => {
      const movies = [
        movie(1, { sizeOnDisk: 1_000_000_000 }),
        movie(2, { sizeOnDisk: 5_000_000_000 }),
        movie(3, { sizeOnDisk: 2_000_000_000 }),
      ];
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'size-desc' })).items)).toEqual([
        2, 3, 1,
      ]);
      expect(ids(applyMovieLibraryFilter(movies, query({ sort: 'size-asc' })).items)).toEqual([
        1, 3, 2,
      ]);
    });
  });

  describe('pagination', () => {
    const five = Array.from({ length: 5 }, (_, index) =>
      movie(index + 1, { title: `m${String(index + 1).padStart(2, '0')}` }),
    );

    it('première page', () => {
      const result = applyMovieLibraryFilter(five, query({ perPage: 2, page: 1 }));
      expect(ids(result.items)).toEqual([1, 2]);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(1);
    });

    it('dernière page incomplète', () => {
      const result = applyMovieLibraryFilter(five, query({ perPage: 2, page: 3 }));
      expect(ids(result.items)).toEqual([5]);
      expect(result.page).toBe(3);
    });

    it('une page hors limites est ramenée à la dernière', () => {
      const result = applyMovieLibraryFilter(
        [movie(1), movie(2)],
        query({ perPage: 50, page: 42 }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('« unlimited » contourne la pagination', () => {
      const movies = Array.from({ length: 1000 }, (_, index) =>
        movie(index + 1, { title: `m${String(index + 1).padStart(4, '0')}` }),
      );
      const result = applyMovieLibraryFilter(
        movies,
        query({ perPage: 50, page: 1, unlimited: true }),
      );
      expect(result.items).toHaveLength(1000);
      expect(result.totalPages).toBe(1);
      expect(result.unlimited).toBe(true);
    });

    it('le total suit le filtre, le total de la bibliothèque ne bouge pas', () => {
      const movies = [
        movie(1, { hasFile: true }),
        movie(2, { hasFile: false, monitored: true }),
        movie(3, { hasFile: false, monitored: true }),
      ];
      const result = applyMovieLibraryFilter(movies, query({ status: 'downloaded' }));
      expect(result.total).toBe(1);
      expect(result.libraryTotal).toBe(3);
    });
  });

  describe('facettes', () => {
    it('calculées sur la bibliothèque non filtrée', () => {
      const movies = [
        movie(1, { genres: ['Action'], quality: '1080p', languages: ['French'] }),
        movie(2, { genres: ['Drama'], quality: '720p', languages: ['English'] }),
      ];
      const result = applyMovieLibraryFilter(movies, query({ genre: 'Action' }));
      expect(result.genres).toEqual(['Action', 'Drama']);
      // Tri naturel : 720p avant 1080p.
      expect(result.qualities).toEqual(['720p', '1080p']);
      expect(result.languages).toEqual(['English', 'French']);
      expect(ids(result.items)).toEqual([1]);
    });

    it('dédoublonnées (casse distincte conservée), tri naturel insensible à la casse', () => {
      const movies = [
        movie(1, { genres: ['Action', 'Sci-Fi'] }),
        movie(2, { genres: ['action', 'Drama'] }),
        movie(3, { genres: ['Sci-Fi'] }),
      ];
      expect(applyMovieLibraryFilter(movies, query()).genres).toEqual([
        'Action',
        'action',
        'Drama',
        'Sci-Fi',
      ]);
    });

    it('sans valeur vide ni « — »', () => {
      const movies = [
        movie(1, { languages: ['French', '—', ''] }),
        movie(2, { languages: ['English'] }),
      ];
      expect(applyMovieLibraryFilter(movies, query()).languages).toEqual(['English', 'French']);
    });
  });
});

describe('pageOfMovie (?open=)', () => {
  it('donne la page du filtre qui contient le film, ou null', () => {
    const movies = Array.from({ length: 5 }, (_, index) =>
      movie(index + 1, { title: `m${index + 1}` }),
    );
    expect(pageOfMovie(movies, query({ perPage: 2 }), 5)).toBe(3);
    expect(pageOfMovie(movies, query({ perPage: 2 }), 1)).toBe(1);
    expect(pageOfMovie(movies, query({ perPage: 2 }), 99)).toBeNull();
    expect(pageOfMovie(movies, query({ perPage: 2, status: 'unmonitored' }), 1)).toBeNull();
  });
});

describe('libraryStats', () => {
  it('compte sur toute la bibliothèque : téléchargés, en attente, taille en Go', () => {
    const stats = libraryStats([
      movie(1, { hasFile: true, sizeGb: 1.26 }),
      movie(2, { hasFile: false, monitored: true }),
      movie(3, { hasFile: false, monitored: false, sizeGb: 2.01 }),
    ]);
    expect(stats).toEqual({ total: 3, downloaded: 1, waiting: 1, totalGb: 3.3 });
  });
});
