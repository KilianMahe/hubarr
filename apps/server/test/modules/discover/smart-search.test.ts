// SPDX-License-Identifier: AGPL-3.0-or-later
// Recherche de la page Découverte : port des tests `smartSearch` de
// `TmdbControllerTest` (classement, personnes, filtres, exploration,
// correction des fautes, requête exacte, longueur plafonnée).

import { describe, expect, it } from 'vitest';
import type { TmdbClient, TmdbRaw } from '../../../src/integrations/tmdb/client';
import { smartSearch } from '../../../src/modules/discover/smart-search';
import type { LibraryIndex } from '../../../src/modules/media/library';

interface Page {
  page: number;
  total_pages: number;
  results: TmdbRaw[];
}
const page = (results: TmdbRaw[], totalPages = 1): Page => ({
  page: 1,
  total_pages: totalPages,
  results,
});

function fakeTmdb(options: {
  search?: (q: string, p: number) => Page;
  genresMovies?: TmdbRaw[];
  discoverTv?: (params: Record<string, unknown>) => Page;
  discoverMovies?: (params: Record<string, unknown>) => Page;
}) {
  const calls = {
    search: [] as string[],
    discoverTv: [] as Record<string, unknown>[],
    discoverMovies: 0,
  };
  const client = {
    locale: 'fr-FR',
    configured: true,
    searchMulti: async (q: string, p = 1) => {
      calls.search.push(q);
      return (options.search ?? (() => page([])))(q, p);
    },
    genresMovies: async () => ({ genres: options.genresMovies ?? [] }),
    genresTv: async () => ({ genres: [] }),
    discoverTv: async (params: Record<string, unknown>) => {
      calls.discoverTv.push(params);
      return (options.discoverTv ?? (() => page([])))(params);
    },
    discoverMovies: async (params: Record<string, unknown>) => {
      calls.discoverMovies += 1;
      return (options.discoverMovies ?? (() => page([])))(params);
    },
  };
  return { client: client as unknown as TmdbClient, calls };
}

function index(owned: number[] = []): LibraryIndex {
  return {
    movie: new Map(
      owned.map((id) => [id, { id: 100 + id, status: 'downloaded' as const, slug: 'films' }]),
    ),
    tv: new Map(),
  };
}

const deps = { vocabulary: () => [], now: new Date('2026-11-22T12:00:00Z') };

const matrixMulti = () =>
  page([
    {
      media_type: 'movie',
      id: 624860,
      title: 'The Matrix Resurrections',
      popularity: 900,
      vote_count: 6000,
      vote_average: 6.4,
      release_date: '2021-12-16',
      genre_ids: [28],
    },
    {
      media_type: 'person',
      id: 6384,
      name: 'Keanu Reeves',
      popularity: 40,
      known_for_department: 'Acting',
      known_for: [{ title: 'The Matrix' }, { title: 'John Wick' }],
    },
    {
      media_type: 'movie',
      id: 603,
      title: 'The Matrix',
      popularity: 80,
      vote_count: 25000,
      vote_average: 8.2,
      release_date: '1999-03-30',
      genre_ids: [28, 878],
    },
    {
      media_type: 'tv',
      id: 99,
      name: 'Matrix Theories',
      popularity: 2,
      vote_count: 5,
      first_air_date: '2010-01-01',
      genre_ids: [99],
    },
  ]);

function typoTmdb() {
  const interstellar = {
    media_type: 'movie',
    id: 157336,
    title: 'Interstellar',
    popularity: 150,
    vote_count: 35000,
    release_date: '2014-11-05',
    genre_ids: [878],
  };
  return fakeTmdb({
    // TMDB ne tolère aucune faute : la faute ne trouve rien, un début plus court trouve le titre.
    search: (q) => {
      const lower = q.toLowerCase();
      if (lower === 'interstelar') return page([]);
      if (lower === 'interstellr')
        return page([
          {
            media_type: 'movie',
            id: 5,
            title: 'Stellar Docs',
            popularity: 20,
            vote_count: 300,
            release_date: '2020-01-01',
          },
        ]);
      if (lower.startsWith('interst')) return page([interstellar]);
      return page([]);
    },
    genresMovies: [{ id: 878, name: 'Science-Fiction' }],
  });
}

describe('recherche de la découverte', () => {
  it('classe, extrait les personnes et signale la bibliothèque', async () => {
    const { client } = fakeTmdb({
      search: matrixMulti,
      genresMovies: [
        { id: 28, name: 'Action' },
        { id: 878, name: 'Science-Fiction' },
      ],
    });
    const data = await smartSearch(client, index([603]), { q: 'the matrix' }, deps);
    expect(data.mode).toBe('search');
    expect(data.best?.id).toBe(603);
    expect(data.best?.inLibrary).toBe(true);
    expect(data.best?.genres).toEqual(['Action', 'Science-Fiction']);
    expect(data.people[0]?.name).toBe('Keanu Reeves');
    expect(data.people[0]?.titles).toEqual(['The Matrix', 'John Wick']);
    expect(data.total).toBe(3);
  });

  it('filtre le type et masque les titres possédés (tri inconnu → pertinence)', async () => {
    const { client } = fakeTmdb({ search: matrixMulti });
    const data = await smartSearch(
      client,
      index([603]),
      { q: 'matrix', type: 'movie', hide_owned: '1', sort: 'bogus' },
      deps,
    );
    expect([data.best?.id, ...data.results.map((r) => r.id)]).toEqual([624860]);
  });

  it('explore avec les filtres quand il n’y a pas de requête', async () => {
    const { client, calls } = fakeTmdb({
      discoverTv: () =>
        page(
          [{ id: 1396, name: 'Breaking Bad', popularity: 300, first_air_date: '2008-01-20' }],
          3,
        ),
    });
    const data = await smartSearch(
      client,
      index(),
      { type: 'tv', genre: '18', year_min: '2015' },
      deps,
    );
    expect(calls.search).toEqual([]);
    expect(calls.discoverMovies).toBe(0);
    expect(calls.discoverTv[0]).toMatchObject({
      with_genres: 18,
      'first_air_date.gte': '2015-01-01',
      sort_by: 'popularity.desc',
    });
    expect(data.mode).toBe('discover');
    expect(data.results[0]?.type).toBe('tv');
    expect(data.totalPages).toBe(3);
  });

  it('corrige une faute sans résultat', async () => {
    const data = await smartSearch(typoTmdb().client, index(), { q: 'interstelar' }, deps);
    expect(data.best?.id).toBe(157336);
    expect(data.correctedFrom).toBe('interstelar');
    expect(data.correctedTo).toBe('Interstellar');
    expect(data.suggestion).toBeNull();
  });

  it('propose seulement quand quelque chose a été trouvé', async () => {
    const data = await smartSearch(typoTmdb().client, index(), { q: 'interstellr' }, deps);
    expect(data.best?.id).toBe(5);
    expect(data.correctedFrom).toBeNull();
    expect(data.suggestion).toBe('Interstellar');
  });

  it('corrige quand seuls des titres obscurs correspondent littéralement', async () => {
    const starWars = {
      media_type: 'movie',
      id: 11,
      title: 'Star Wars',
      popularity: 90,
      vote_count: 20000,
      release_date: '1977-05-25',
    };
    const { client } = fakeTmdb({
      search: (q) =>
        q.toLowerCase() === 'star wors'
          ? page([
              {
                media_type: 'movie',
                id: 7,
                title: 'Star Worse',
                popularity: 0.3,
                vote_count: 1,
                release_date: '2019-01-01',
              },
            ])
          : page([starWars]),
    });
    const data = await smartSearch(client, index(), { q: 'star wors' }, deps);
    expect(data.best?.id).toBe(11);
    expect(data.correctedFrom).toBe('star wors');
  });

  it('met en tête une personne connue et replie les homonymes', async () => {
    const { client } = fakeTmdb({
      search: () =>
        page([
          {
            media_type: 'movie',
            id: 1,
            title: "Inside Christopher Nolan's Films",
            popularity: 4,
            vote_count: 20,
            release_date: '2023-01-01',
          },
          {
            media_type: 'person',
            id: 525,
            name: 'Christopher Nolan',
            popularity: 25,
            known_for_department: 'Directing',
            known_for: [{ title: 'Inception' }],
          },
          {
            media_type: 'person',
            id: 9001,
            name: 'Christopher Nolan',
            popularity: 1.6,
            known_for_department: 'Sound',
          },
        ]),
    });
    const data = await smartSearch(client, index(), { q: 'christopher nolan' }, deps);
    expect(data.bestPerson?.id).toBe(525);
    expect(data.best).toBeNull();
    expect(data.people).toEqual([]);
    expect(data.results[0]?.id).toBe(1);
  });

  it('une requête exacte saute la correction', async () => {
    const data = await smartSearch(
      typoTmdb().client,
      index(),
      { q: 'interstelar', exact: '1' },
      deps,
    );
    expect(data.best).toBeNull();
    expect(data.suggestion).toBeNull();
    expect(data.correctedFrom).toBeNull();
  });

  it('plafonne la longueur de la requête', async () => {
    const { client, calls } = fakeTmdb({});
    await smartSearch(client, index(), { q: 'matrix '.repeat(60), exact: '1' }, deps);
    expect(calls.search.length).toBeGreaterThan(0);
    expect(calls.search.every((q) => q.length <= 100)).toBe(true);
  });
});
