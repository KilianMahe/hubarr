// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux TMDB (API v3), monté sous `/tmdb` : Hubarr l'appelle via
// `HUBARR_TMDB_API_URL` pendant les E2E. Listes (tendances, populaires…),
// fiches, recherche, genres, découverte, personnes et collections, sur un
// petit catalogue inventé ; clé `e2e-tmdb-key` exigée. Les titres
// 9001 à 9010 correspondent aux films du faux Radarr.

import type { FastifyPluginAsync } from 'fastify';

export const TMDB_KEY = 'e2e-tmdb-key';

type Row = Record<string, unknown>;

const movie = (id: number, title: string, year: number, extra: Row = {}): Row => ({
  id,
  media_type: 'movie',
  title,
  original_title: title,
  release_date: `${year}-03-01`,
  overview: `Synopsis TMDB de « ${title} ».`,
  poster_path: null,
  backdrop_path: `/backdrop-${id}.jpg`,
  vote_average: 7.4,
  vote_count: 1200,
  popularity: 80 - (id % 50),
  genre_ids: [878],
  ...extra,
});
const tv = (id: number, name: string, year: number, extra: Row = {}): Row => ({
  id,
  media_type: 'tv',
  name,
  original_name: name,
  first_air_date: `${year}-01-10`,
  overview: `Synopsis TMDB de « ${name} ».`,
  poster_path: null,
  backdrop_path: `/backdrop-${id}.jpg`,
  vote_average: 8.1,
  vote_count: 900,
  popularity: 60,
  genre_ids: [18],
  ...extra,
});

const MOVIES = [
  movie(9001, 'Orbite Basse', 2019),
  movie(9501, 'Le Grand Détour', 2020, { genre_ids: [35] }),
  movie(9801, 'Nébuleuse', 2025),
  movie(9802, 'Nébuleuse 2', 2026, { popularity: 3, vote_count: 4 }),
];
const SHOWS = [tv(9601, 'Les Veilleurs', 2021), tv(9602, 'Marées Hautes', 2023)];
const ALL = [...MOVIES, ...SHOWS];

const page = (results: Row[], totalPages = 1) => ({
  page: 1,
  total_pages: totalPages,
  total_results: results.length,
  results,
});

function detail(item: Row): Row {
  const isTv = item.media_type === 'tv';
  const base: Row = {
    ...item,
    genres: [{ id: 878, name: 'Science-Fiction' }],
    tagline: 'Une accroche inventée.',
    status: isTv ? 'Returning Series' : 'Released',
    credits: {
      cast: [{ name: 'Alice Martin', character: 'Capitaine', profile_path: null }],
      crew: [{ job: 'Director', name: 'Jeanne Réalisatrice' }],
    },
    videos: {
      results: [
        { site: 'YouTube', key: 'e2e-trailer', type: 'Trailer', official: true, iso_639_1: 'en' },
      ],
    },
    'watch/providers': {
      results: { FR: { flatrate: [{ provider_name: 'Plateforme Fictive', logo_path: null }] } },
    },
    external_ids: isTv ? { tvdb_id: 81000 + Number(item.id) } : { imdb_id: `tt${String(item.id)}` },
  };
  if (isTv) {
    return {
      ...base,
      number_of_seasons: 2,
      number_of_episodes: 16,
      networks: [{ name: 'Chaîne Fictive' }],
      seasons: [{ season_number: 1, name: 'Saison 1', episode_count: 8, air_date: '2021-01-10' }],
      content_ratings: { results: [{ iso_3166_1: 'FR', rating: '12' }] },
    };
  }
  return {
    ...base,
    runtime: 118,
    release_dates: {
      results: [
        {
          iso_3166_1: 'FR',
          release_dates: [
            {
              type: 3,
              release_date: `${String(item.release_date)}T00:00:00.000Z`,
              certification: '12',
            },
          ],
        },
      ],
    },
  };
}

export const tmdbMock: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    const key = (request.query as { api_key?: string }).api_key;
    if (key !== TMDB_KEY) {
      await reply.code(401).send({ status_code: 7, status_message: 'Invalid API key' });
    }
  });
  app.post('/__reset', async () => ({ ok: true }));

  app.get('/3/configuration', async () => ({ images: {} }));
  app.get('/3/trending/all/week', async () => page(ALL));
  app.get('/3/trending/movie/week', async () => page(MOVIES));
  app.get('/3/trending/tv/week', async () => page(SHOWS));
  for (const path of [
    '/3/movie/popular',
    '/3/movie/upcoming',
    '/3/movie/top_rated',
    '/3/movie/now_playing',
  ]) {
    app.get(path, async () => page(MOVIES.slice(0, 3)));
  }
  for (const path of [
    '/3/tv/popular',
    '/3/tv/on_the_air',
    '/3/tv/top_rated',
    '/3/tv/airing_today',
  ]) {
    app.get(path, async () => page(SHOWS));
  }
  app.get('/3/person/popular', async () =>
    page([{ id: 77, media_type: 'person', name: 'Alice Martin', popularity: 12 }]),
  );
  app.get('/3/genre/movie/list', async () => ({
    genres: [
      { id: 878, name: 'Science-Fiction' },
      { id: 35, name: 'Comédie' },
    ],
  }));
  app.get('/3/genre/tv/list', async () => ({ genres: [{ id: 18, name: 'Drame' }] }));
  app.get('/3/search/multi', async (request) => {
    const query = ((request.query as { query?: string }).query ?? '').toLowerCase();
    const found = ALL.filter((item) =>
      String(item.title ?? item.name)
        .toLowerCase()
        .includes(query),
    );
    return page(found);
  });
  app.get('/3/discover/movie', async () => page(MOVIES, 2));
  app.get('/3/discover/tv', async () => page(SHOWS));
  app.get('/3/search/collection', async () =>
    page([{ id: 7001, name: 'Orbite Basse — la collection', poster_path: null }]),
  );
  app.get('/3/collection/7001', async () => ({
    id: 7001,
    name: 'Orbite Basse — la collection',
    parts: [MOVIES[0]],
  }));
  app.get('/3/search/person', async () =>
    page([{ id: 77, name: 'Alice Martin', known_for_department: 'Acting' }]),
  );
  app.get('/3/person/77', async () => ({
    id: 77,
    name: 'Alice Martin',
    biography: 'Actrice inventée.',
  }));
  app.get('/3/person/77/combined_credits', async () => ({ cast: [MOVIES[2]], crew: [] }));
  app.get('/3/find/:id', async () => ({ movie_results: [], tv_results: [] }));

  for (const kind of ['movie', 'tv'] as const) {
    const list = kind === 'movie' ? MOVIES : SHOWS;
    app.get(`/3/${kind}/:id`, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const item = list.find((row) => row.id === id);
      return item === undefined ? reply.code(404).send({ status_code: 34 }) : detail(item);
    });
    app.get(`/3/${kind}/:id/similar`, async () => page(list.slice(0, 2)));
    app.get(`/3/${kind}/:id/recommendations`, async () => page(list.slice(1, 3)));
  }
};
