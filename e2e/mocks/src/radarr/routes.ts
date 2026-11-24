// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux Radarr (API v3) monté sous `/radarr` : de quoi parcourir toutes les
// pages de P2 (bibliothèque, fiche, releases, ajout, file, manquants, cutoff,
// historique, liste de blocage, collections, système). État en mémoire,
// réinitialisé par `POST /__reset`. Clé d'API exigée (`X-Api-Key`).
//
// Comportements simulés : une recherche (`MoviesSearch`) ou un grab place le
// film dans la file et l'historique ; les commandes se terminent aussitôt.

import { createArrAdminMock } from '../arr-admin/routes';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  CREDITS,
  LOOKUP_CANDIDATES,
  QUALITY_DEFINITIONS,
  QUALITY_PROFILES,
  ROOT_FOLDERS,
  releasesFor,
  seedMovies,
  type MockMovie,
} from './fixtures';

export const RADARR_API_KEY = 'e2e-radarr-key';

interface QueueRecord {
  id: number;
  movieId: number;
  title: string;
  size: number;
  sizeleft: number;
  status: string;
  trackedDownloadStatus: string;
  trackedDownloadState: string;
  quality: { quality: { id: number; name: string } };
  protocol: string;
  indexer: string;
  downloadClient: string;
  outputPath: string;
  statusMessages: { title: string; messages: string[] }[];
}

interface State {
  movies: MockMovie[];
  queue: QueueRecord[];
  history: Record<string, unknown>[];
  blocklist: Record<string, unknown>[];
  commands: Map<number, Record<string, unknown>>;
  tags: { id: number; label: string }[];
  importLists: Record<string, unknown>[];
  collectionMonitored: boolean;
  nextId: number;
}

function initialState(): State {
  const movies = seedMovies();
  const missing = movies.find((movie) => movie.title === 'Cartographes');
  return {
    movies,
    queue: [
      {
        id: 1,
        movieId: missing?.id ?? 5,
        title: 'Cartographes.2021.1080p.WEB-DL',
        size: 4_000_000_000,
        sizeleft: 1_000_000_000,
        status: 'downloading',
        trackedDownloadStatus: 'ok',
        trackedDownloadState: 'downloading',
        quality: { quality: { id: 3, name: 'WEBDL-1080p' } },
        protocol: 'torrent',
        indexer: 'IndexeurTest',
        downloadClient: 'qBittorrent',
        outputPath: '/downloads/Cartographes',
        statusMessages: [],
      },
    ],
    history: movies
      .filter((movie) => movie.hasFile)
      .map((movie, index) => ({
        id: index + 1,
        movieId: movie.id,
        eventType: 'downloadFolderImported',
        date: '2025-06-01T10:00:00Z',
        sourceTitle: `${movie.title}.${movie.year}.1080p`,
        quality: { quality: { name: 'Bluray-1080p' } },
        data: { importedPath: movie.path, downloadClientName: 'qBittorrent', protocol: 'torrent' },
      })),
    blocklist: [
      {
        id: 1,
        movieId: 7,
        sourceTitle: 'Minuit.a.Valparaiso.2023.CAM',
        date: '2025-05-01T09:00:00Z',
        protocol: 'torrent',
        indexer: 'AutreIndexeur',
        message: 'Fausse release',
        languages: [],
        quality: { quality: { name: 'CAM' } },
      },
    ],
    commands: new Map(),
    tags: [{ id: 1, label: 'famille' }],
    importLists: [],
    collectionMonitored: false,
    nextId: 1000,
  };
}

const withMovie = (state: State, record: Record<string, unknown>) => {
  const movie = state.movies.find((candidate) => candidate.id === record.movieId);
  return movie === undefined
    ? record
    : { ...record, movie: { title: movie.title, year: movie.year } };
};

function paged<T>(records: T[], request: FastifyRequest) {
  const query = request.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 50));
  return {
    page,
    pageSize,
    totalRecords: records.length,
    records: records.slice((page - 1) * pageSize, page * pageSize),
  };
}

export const radarrMock: FastifyPluginAsync = async (app) => {
  let state = initialState();
  // Administration (P3b.6) : indexeurs, clients, configurations, système…
  const admin = createArrAdminMock('radarr', {
    tags: () => state.tags,
    hasImportLists: true,
  });
  admin.register(app);

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers['x-api-key'] !== RADARR_API_KEY) {
      await reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  app.post('/__reset', async () => {
    state = initialState();
    admin.reset();
    return { ok: true };
  });

  const find = (id: unknown) => state.movies.find((movie) => movie.id === Number(id));
  const notFound = { message: 'NotFound' };
  const id = () => (state.nextId += 1);

  /** Le film entre dans la file (recherche ou grab) et l'historique note le grab. */
  const enqueue = (movie: MockMovie, title: string) => {
    if (state.queue.some((item) => item.movieId === movie.id)) return;
    state.queue.push({
      id: id(),
      movieId: movie.id,
      title,
      size: 5_000_000_000,
      sizeleft: 4_000_000_000,
      status: 'downloading',
      trackedDownloadStatus: 'ok',
      trackedDownloadState: 'downloading',
      quality: { quality: { id: 7, name: 'Bluray-1080p' } },
      protocol: 'torrent',
      indexer: 'IndexeurTest',
      downloadClient: 'qBittorrent',
      outputPath: `/downloads/${movie.title}`,
      statusMessages: [],
    });
    state.history.unshift({
      id: id(),
      movieId: movie.id,
      eventType: 'grabbed',
      date: new Date().toISOString(),
      sourceTitle: title,
      quality: { quality: { name: 'Bluray-1080p' } },
      data: { indexer: 'IndexeurTest', releaseTitle: title, protocol: 'torrent' },
    });
  };

  // ── Système ───────────────────────────────────────────────────────────────
  app.get('/api/v3/system/status', async () => ({
    appName: 'Radarr',
    version: '5.14.0.9383',
    osName: 'ubuntu',
    osVersion: '24.04',
    runtimeVersion: '8.0.10',
    databaseVersion: '3.45.1',
    startTime: '2026-11-20T08:00:00Z',
    urlBase: '',
    isDocker: true,
  }));
  app.get('/api/v3/health', async () => [
    {
      source: 'IndexerSearchCheck',
      type: 'warning',
      message: 'Un indexeur ne répond pas (simulation)',
    },
  ]);
  app.get('/api/v3/diskspace', async () => [
    {
      path: '/movies',
      label: 'movies',
      freeSpace: 500 * 1_073_741_824,
      totalSpace: 2_000 * 1_073_741_824,
    },
  ]);
  app.get('/api/v3/log', async (request) =>
    paged(
      [
        { time: '2026-11-20T08:00:05Z', level: 'info', message: 'Radarr démarré' },
        { time: '2026-11-20T08:01:00Z', level: 'warn', message: 'Indexeur lent' },
      ],
      request,
    ),
  );
  app.get('/api/v3/language', async () => [
    { id: 1, name: 'English' },
    { id: 2, name: 'French' },
  ]);

  // ── Configuration ─────────────────────────────────────────────────────────
  app.get('/api/v3/qualityprofile', async () => QUALITY_PROFILES);
  app.get('/api/v3/rootfolder', async () => ROOT_FOLDERS);
  app.get('/api/v3/qualitydefinition', async () => QUALITY_DEFINITIONS);
  app.get('/api/v3/tag', async () => state.tags);
  app.post('/api/v3/tag', async (request) => {
    const tag = { id: id(), label: (request.body as { label?: string }).label ?? '' };
    state.tags.push(tag);
    return tag;
  });
  app.get('/api/v3/filesystem', async (request) => {
    const path = (request.query as { path?: string }).path ?? '/';
    return {
      parent: path === '/' ? null : '/',
      directories: path === '/' ? [{ name: 'movies', path: '/movies/' }] : [],
      files: [],
    };
  });

  // ── Films ─────────────────────────────────────────────────────────────────
  app.get('/api/v3/movie', async () => state.movies);
  app.get('/api/v3/movie/:id', async (request, reply) => {
    const movie = find((request.params as { id: string }).id);
    return movie ?? reply.code(404).send(notFound);
  });
  app.put('/api/v3/movie/:id', async (request, reply) => {
    const movie = find((request.params as { id: string }).id);
    if (movie === undefined) return reply.code(404).send(notFound);
    Object.assign(movie, request.body as Partial<MockMovie>, { id: movie.id });
    return movie;
  });
  app.delete('/api/v3/movie/:id', async (request) => {
    const movieId = Number((request.params as { id: string }).id);
    state.movies = state.movies.filter((movie) => movie.id !== movieId);
    return {};
  });
  app.put('/api/v3/movie/editor', async (request) => {
    const { movieIds = [], ...changes } = request.body as { movieIds?: number[] } & Record<
      string,
      unknown
    >;
    for (const movie of state.movies.filter((candidate) => movieIds.includes(candidate.id))) {
      if (typeof changes.monitored === 'boolean') movie.monitored = changes.monitored;
      if (typeof changes.qualityProfileId === 'number')
        movie.qualityProfileId = changes.qualityProfileId;
    }
    return {};
  });
  app.delete('/api/v3/movie/editor', async (request) => {
    const { movieIds = [] } = request.body as { movieIds?: number[] };
    state.movies = state.movies.filter((movie) => !movieIds.includes(movie.id));
    return {};
  });
  // Calendrier, daté par rapport au jour de l'exécution : deux sorties à venir,
  // un film déjà téléchargé et un film dans la file (Cartographes), pour
  // montrer les statuts de téléchargement.
  app.get('/api/v3/calendar', async () => {
    const day = (offset: number) =>
      `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`;
    return state.movies.flatMap((movie): Record<string, unknown>[] => {
      if (movie.id === 1) return [{ ...movie, digitalRelease: day(-3) }];
      if (movie.id === 3) return [{ ...movie, digitalRelease: day(2) }];
      if (movie.id === 10) return [{ ...movie, physicalRelease: day(4) }];
      if (movie.title === 'Cartographes') return [{ ...movie, digitalRelease: day(-1) }];
      return [];
    });
  });
  app.get('/api/v3/movie/lookup', async (request) => {
    const term = ((request.query as { term?: string }).term ?? '').toLowerCase();
    const inLibrary = state.movies.filter((movie) => movie.title.toLowerCase().includes(term));
    const candidates = LOOKUP_CANDIDATES.filter(
      (candidate) =>
        candidate.title.toLowerCase().includes(term) &&
        !state.movies.some((movie) => movie.tmdbId === candidate.tmdbId),
    ).map((candidate) => ({
      ...candidate,
      overview: 'Film à ajouter.',
      images: [],
      status: 'released',
    }));
    return [...candidates, ...inLibrary];
  });
  app.get('/api/v3/movie/lookup/tmdb', async (request) => {
    const tmdbId = Number((request.query as { tmdbId?: string }).tmdbId);
    return LOOKUP_CANDIDATES.find((candidate) => candidate.tmdbId === tmdbId) ?? null;
  });
  app.post('/api/v3/movie', async (request, reply) => {
    const body = request.body as Partial<MockMovie> & { tmdbId: number };
    if (state.movies.some((movie) => movie.tmdbId === body.tmdbId)) {
      return reply.code(400).send([{ errorMessage: 'This movie has already been added' }]);
    }
    const movieId = id();
    const candidate = LOOKUP_CANDIDATES.find((item) => item.tmdbId === body.tmdbId);
    const title = body.title ?? candidate?.title ?? 'Film';
    const year = body.year ?? candidate?.year ?? 2024;
    const template = seedMovies()[0];
    if (template === undefined) return reply.code(500).send({ message: 'no fixture' });
    const movie: MockMovie = {
      ...template,
      id: movieId,
      tmdbId: body.tmdbId,
      imdbId: '',
      title,
      originalTitle: title,
      sortTitle: title.toLowerCase(),
      year,
      monitored: body.monitored ?? true,
      hasFile: false,
      sizeOnDisk: 0,
      qualityProfileId: body.qualityProfileId ?? 1,
      path: `${body.rootFolderPath ?? '/movies'}/${title} (${year})`,
      genres: candidate?.genres ?? [],
    };
    delete movie.movieFile;
    delete movie.collection;
    state.movies.push(movie);
    return movie;
  });

  // ── Fiche ─────────────────────────────────────────────────────────────────
  app.get('/api/v3/credit', async () => CREDITS);
  app.get('/api/v3/extrafile', async (request) => {
    const movie = find((request.query as { movieId?: string }).movieId);
    return movie?.hasFile
      ? [
          {
            id: 1,
            movieId: movie.id,
            relativePath: `${movie.title}.fr.srt`,
            extension: '.srt',
            type: 'subtitle',
          },
        ]
      : [];
  });
  app.get('/api/v3/moviefile', async (request) => {
    const movie = find((request.query as { movieId?: string }).movieId);
    return movie?.movieFile ? [movie.movieFile] : [];
  });
  app.get('/api/v3/moviefile/:id', async (request, reply) => {
    const fileId = Number((request.params as { id: string }).id);
    const file = state.movies.find((movie) => movie.movieFile?.id === fileId)?.movieFile;
    return file ?? reply.code(404).send(notFound);
  });
  app.put('/api/v3/moviefile/:id', async (request, reply) => {
    const fileId = Number((request.params as { id: string }).id);
    const movie = state.movies.find((candidate) => candidate.movieFile?.id === fileId);
    if (movie?.movieFile === undefined) return reply.code(404).send(notFound);
    movie.movieFile = { ...movie.movieFile, ...(request.body as Record<string, unknown>) };
    return movie.movieFile;
  });
  app.delete('/api/v3/moviefile/:id', async (request) => {
    const fileId = Number((request.params as { id: string }).id);
    const movie = state.movies.find((candidate) => candidate.movieFile?.id === fileId);
    if (movie) {
      delete movie.movieFile;
      movie.hasFile = false;
      movie.sizeOnDisk = 0;
    }
    return {};
  });
  app.get('/api/v3/rename', async (request) => {
    const movie = find((request.query as { movieId?: string }).movieId);
    const file = movie?.movieFile;
    if (movie === undefined || file === undefined) return [];
    const expected = `${movie.title} (${movie.year}).mkv`;
    return file.relativePath === expected
      ? []
      : [
          {
            movieId: movie.id,
            movieFileId: file.id,
            existingPath: file.relativePath,
            newPath: expected,
          },
        ];
  });
  app.get('/api/v3/history/movie', async (request) => {
    const movieId = Number((request.query as { movieId?: string }).movieId);
    return state.history
      .filter((event) => event.movieId === movieId)
      .map((event) => withMovie(state, event));
  });
  app.get('/api/v3/blocklist/movie', async (request) => {
    const movieId = Number((request.query as { movieId?: string }).movieId);
    return state.blocklist.filter((item) => item.movieId === movieId);
  });

  // ── Releases ──────────────────────────────────────────────────────────────
  app.get('/api/v3/release', async (request, reply) => {
    const movie = find((request.query as { movieId?: string }).movieId);
    return movie === undefined ? reply.code(404).send(notFound) : releasesFor(movie);
  });
  app.post('/api/v3/release', async (request, reply) => {
    const { guid } = request.body as { guid?: string };
    const movie = find((guid ?? '').split('-')[0]);
    if (movie === undefined) return reply.code(404).send(notFound);
    const release = releasesFor(movie).find((candidate) => candidate.guid === guid);
    enqueue(movie, release?.title ?? movie.title);
    return {};
  });

  // ── Commandes ─────────────────────────────────────────────────────────────
  app.post('/api/v3/command', async (request) => {
    const body = request.body as { name: string; movieIds?: number[]; movieId?: number };
    let message = 'Completed';
    if (body.name === 'MoviesSearch') {
      let grabbed = 0;
      for (const movie of state.movies.filter((candidate) =>
        body.movieIds?.includes(candidate.id),
      )) {
        if (!movie.hasFile && movie.status === 'released') {
          enqueue(movie, `${movie.title}.${movie.year}.1080p.BluRay.x265-HUBARR`);
          grabbed += 1;
        }
      }
      message = `Completed. ${grabbed} reports downloaded.`;
    } else if (body.name === 'MissingMoviesSearch') {
      message = 'Completed. 0 reports downloaded.';
    }
    const command = {
      id: id(),
      name: body.name,
      commandName: body.name,
      status: 'completed',
      message,
      queued: new Date().toISOString(),
      started: new Date().toISOString(),
      ended: new Date().toISOString(),
    };
    state.commands.set(command.id, command);
    return command;
  });
  app.get('/api/v3/command', async () => []);
  app.get('/api/v3/command/:id', async (request, reply) => {
    const command = state.commands.get(Number((request.params as { id: string }).id));
    return command ?? reply.code(404).send(notFound);
  });

  // ── File d'attente ────────────────────────────────────────────────────────
  app.get('/api/v3/queue', async (request) =>
    paged(
      state.queue.map((item) => withMovie(state, item as unknown as Record<string, unknown>)),
      request,
    ),
  );
  app.delete('/api/v3/queue/:id', async (request) => {
    const queueId = Number((request.params as { id: string }).id);
    state.queue = state.queue.filter((item) => item.id !== queueId);
    return {};
  });
  app.post('/api/v3/queue/grab/:id', async () => ({}));
  app.post('/api/v3/queue/grab/bulk', async () => ({}));

  // ── Manquants, cutoff, historique, liste de blocage ──────────────────────
  app.get('/api/v3/wanted/missing', async (request) =>
    paged(
      state.movies.filter((movie) => movie.monitored && !movie.hasFile),
      request,
    ),
  );
  app.get('/api/v3/wanted/cutoff', async (request) =>
    paged(
      state.movies.filter(
        (movie) =>
          movie.hasFile &&
          ['HDTV-720p', 'DVD'].includes(
            String(
              (movie.movieFile?.quality as { quality: { name: string } } | undefined)?.quality.name,
            ),
          ),
      ),
      request,
    ),
  );
  app.get('/api/v3/history', async (request) => {
    const eventType = (request.query as { eventType?: string }).eventType;
    const names: Record<string, string> = {
      '1': 'grabbed',
      '3': 'downloadFolderImported',
      '4': 'downloadFailed',
    };
    const events = state.history.filter(
      (event) => eventType === undefined || event.eventType === names[eventType],
    );
    return paged(
      events.map((event) => withMovie(state, event)),
      request,
    );
  });
  app.get('/api/v3/blocklist', async (request) =>
    paged(
      state.blocklist.map((item) => withMovie(state, item)),
      request,
    ),
  );
  app.delete('/api/v3/blocklist/:id', async (request) => {
    const itemId = Number((request.params as { id: string }).id);
    state.blocklist = state.blocklist.filter((item) => item.id !== itemId);
    return {};
  });
  app.delete('/api/v3/blocklist/bulk', async (request) => {
    const { ids = [] } = request.body as { ids?: number[] };
    state.blocklist = state.blocklist.filter((item) => !ids.includes(Number(item.id)));
    return {};
  });

  // ── Collections ───────────────────────────────────────────────────────────
  app.get('/api/v3/collection', async () => [
    {
      id: 1,
      tmdbId: 7001,
      title: 'Orbite Basse — la collection',
      overview: 'Trois films en orbite.',
      monitored: state.collectionMonitored,
      qualityProfileId: 1,
      rootFolderPath: '/movies',
      images: [],
      movies: [
        ...state.movies
          .filter((movie) => movie.collection !== undefined)
          .map((movie) => ({
            tmdbId: movie.tmdbId,
            title: movie.title,
            year: movie.year,
            images: [],
          })),
        { tmdbId: 9599, title: 'Orbite Basse : Origines', year: 2028, images: [] },
      ],
    },
  ]);
  app.put('/api/v3/collection/:id', async (request) => {
    state.collectionMonitored = Boolean((request.body as { monitored?: boolean }).monitored);
    return {};
  });

  // ── Listes d'import (suivi de personnes) ──────────────────────────────────
  app.get('/api/v3/importlist', async () => state.importLists);
  app.get('/api/v3/importlist/schema', async () => [
    {
      implementation: 'TMDbPersonImport',
      name: '',
      fields: [
        { name: 'personId', value: '' },
        { name: 'personCast', value: false },
        { name: 'personCastDirector', value: false },
        { name: 'personCastProducer', value: false },
        { name: 'personCastWriting', value: false },
        { name: 'personCastSound', value: false },
      ],
    },
  ]);
  app.post('/api/v3/importlist', async (request) => {
    const list = { ...(request.body as Record<string, unknown>), id: id() };
    state.importLists.push(list);
    return list;
  });
  app.delete('/api/v3/importlist/:id', async (request) => {
    const listId = Number((request.params as { id: string }).id);
    state.importLists = state.importLists.filter((list) => list.id !== listId);
    return {};
  });
};
