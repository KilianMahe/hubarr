// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux Bazarr monté sous `/bazarr` (`/api/…`, en-tête `X-API-KEY`) : films et
// séries alignés sur les faux Radarr et Sonarr (mêmes ids, pour les badges),
// épisodes, historique, recherche chez les fournisseurs, téléchargement (le
// sous-titre manquant devient présent), recherche automatique. État en
// mémoire, réinitialisé par `POST /__reset`. Corps en formulaire, comme
// Bazarr.

import type { FastifyPluginAsync } from 'fastify';

export const BAZARR_API_KEY = 'e2e-bazarr-key';

type Row = Record<string, unknown>;
const fr = { code2: 'fr', code3: 'fra', name: 'French', hi: false, forced: false };
const en = { code2: 'en', code3: 'eng', name: 'English', hi: false, forced: false };

function initialState() {
  return {
    movies: [
      {
        radarrId: 1,
        title: 'Orbite Basse',
        year: 2019,
        profileId: 1,
        subtitles: [en],
        missing_subtitles: [fr],
      },
      {
        radarrId: 2,
        title: 'Orbite Basse II',
        year: 2021,
        profileId: 1,
        subtitles: [en, fr],
        missing_subtitles: [],
      },
      {
        radarrId: 3,
        title: 'Orbite Basse III',
        year: 2024,
        profileId: 1,
        subtitles: [],
        missing_subtitles: [fr, en],
      },
      {
        radarrId: 4,
        title: 'Le Phare des Brumes',
        year: 2018,
        profileId: null,
        subtitles: [],
        missing_subtitles: [],
      },
    ] as Row[],
    series: [
      {
        sonarrSeriesId: 1,
        title: 'Les Veilleurs',
        year: '2021',
        profileId: 1,
        episodeFileCount: 4,
        episodeMissingCount: 2,
        missing_subtitles: [fr],
      },
      {
        sonarrSeriesId: 2,
        title: 'Brume',
        year: '2016',
        profileId: 1,
        episodeFileCount: 4,
        episodeMissingCount: 0,
        missing_subtitles: [],
      },
    ] as Row[],
    episodes: [
      {
        sonarrSeriesId: 1,
        sonarrEpisodeId: 101,
        season: 1,
        episode: 1,
        title: 'Le Guet',
        audio_language: [en],
        subtitles: [en],
        missing_subtitles: [fr],
      },
      {
        sonarrSeriesId: 1,
        sonarrEpisodeId: 102,
        season: 1,
        episode: 2,
        title: 'La Relève',
        audio_language: [en],
        subtitles: [en, fr],
        missing_subtitles: [],
      },
    ] as Row[],
    history: [] as Row[],
  };
}

const results = (title: string) => [
  {
    provider: 'opensubtitles',
    language: fr,
    hearing_impaired: 'False',
    forced: 'False',
    original_format: 'False',
    score: 95,
    release_info: [`${title}.1080p.WEB`],
    uploader: 'e2e',
    subtitle: `token-${title}`,
  },
];

export const bazarrMock: FastifyPluginAsync = async (app) => {
  let state = initialState();
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers['x-api-key'] !== BAZARR_API_KEY) {
      await reply.code(401).send({ message: 'Unauthorized' });
    }
  });
  app.post('/__reset', async () => {
    state = initialState();
    return { ok: true };
  });

  const ids = (query: Record<string, unknown>, key: string): number[] => {
    const raw = query[`${key}[]`];
    return (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map(Number);
  };

  app.get('/api/system/status', async () => ({ data: { bazarr_version: '1.5.1' } }));
  app.get('/api/badges', async () => ({
    movies: state.movies.filter(
      (row) => (row.missing_subtitles as unknown[]).length > 0 && row.profileId !== null,
    ).length,
    episodes: state.episodes.filter((row) => (row.missing_subtitles as unknown[]).length > 0)
      .length,
    providers: 2,
  }));
  app.get<{ Querystring: Record<string, unknown> }>('/api/movies', async (request) => {
    const wanted = ids(request.query, 'radarrid');
    return {
      data: state.movies.filter(
        (row) => wanted.length === 0 || wanted.includes(row.radarrId as number),
      ),
    };
  });
  app.get<{ Querystring: Record<string, unknown> }>('/api/series', async (request) => {
    const wanted = ids(request.query, 'seriesid');
    return {
      data: state.series.filter(
        (row) => wanted.length === 0 || wanted.includes(row.sonarrSeriesId as number),
      ),
    };
  });
  app.get<{ Querystring: Record<string, unknown> }>('/api/episodes', async (request) => {
    const wanted = ids(request.query, 'seriesid');
    return { data: state.episodes.filter((row) => wanted.includes(row.sonarrSeriesId as number)) };
  });
  app.get('/api/movies/history', async () => ({
    data: state.history.filter((row) => row.kind === 'movie'),
  }));
  app.get('/api/episodes/history', async () => ({
    data: state.history.filter((row) => row.kind === 'episode'),
  }));
  app.get<{ Querystring: { radarrid?: string } }>('/api/providers/movies', async (request) => {
    const movie = state.movies.find((row) => row.radarrId === Number(request.query.radarrid));
    return { data: movie ? results(String(movie.title).replace(/\s+/g, '.')) : [] };
  });
  app.get('/api/providers/episodes', async () => ({ data: results('Episode') }));
  app.post<{ Body: Record<string, string> }>('/api/providers/movies', async (request, reply) => {
    const movie = state.movies.find((row) => row.radarrId === Number(request.body.radarrid));
    if (movie) {
      movie.subtitles = [...(movie.subtitles as Row[]), ...(movie.missing_subtitles as Row[])];
      movie.missing_subtitles = [];
      state.history.unshift({
        kind: 'movie',
        title: movie.title,
        action: 1,
        provider: request.body.provider,
        language: fr,
        raw_timestamp: 1_763_700_000,
      });
    }
    return reply.code(204).send();
  });
  app.post<{ Body: Record<string, string> }>('/api/providers/episodes', async (request, reply) => {
    const episode = state.episodes.find(
      (row) => row.sonarrEpisodeId === Number(request.body.episodeid),
    );
    const series = state.series.find((row) => row.sonarrSeriesId === Number(request.body.seriesid));
    if (episode && series) {
      episode.missing_subtitles = [];
      series.episodeMissingCount = Math.max(0, Number(series.episodeMissingCount) - 1);
      state.history.unshift({
        kind: 'episode',
        seriesTitle: series.title,
        episodeTitle: episode.title,
        action: 1,
        provider: request.body.provider,
        language: fr,
        raw_timestamp: 1_763_700_000,
      });
    }
    return reply.code(204).send();
  });
  app.patch('/api/movies', async (_request, reply) => reply.code(204).send());
  app.patch('/api/series', async (_request, reply) => reply.code(204).send());
};
