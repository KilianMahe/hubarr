// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux Sonarr (API v3) monté sous `/sonarr` : de quoi parcourir toutes les
// pages de P3a (bibliothèque, ajout, fiche, saisons et épisodes, fichiers,
// releases, renommage, file, manquants, cutoff, historique, liste de blocage,
// système). État en mémoire, réinitialisé par `POST /__reset`. Clé d'API
// exigée (`X-Api-Key`).
//
// Comportements simulés : une recherche d'épisodes, de saison ou de série et
// un grab placent les épisodes manquants dans la file et l'historique ; les
// commandes se terminent aussitôt ; un élément de la file est bloqué à l'import.

import { createArrAdminMock } from '../arr-admin/routes';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  LOOKUP_CANDIDATES,
  QUALITY_DEFINITIONS,
  QUALITY_PROFILES,
  ROOT_FOLDERS,
  releasesFor,
  seedLibrary,
  type MockEpisode,
  type MockEpisodeFile,
  type MockSeries,
} from './fixtures';

export const SONARR_API_KEY = 'e2e-sonarr-key';

interface QueueRecord {
  id: number;
  seriesId: number;
  episodeId: number;
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
  downloadId: string;
  outputPath: string;
  statusMessages: { title: string; messages: string[] }[];
}

interface State {
  series: MockSeries[];
  episodes: MockEpisode[];
  files: MockEpisodeFile[];
  queue: QueueRecord[];
  history: Record<string, unknown>[];
  blocklist: Record<string, unknown>[];
  commands: Map<number, Record<string, unknown>>;
  tags: { id: number; label: string }[];
  nextId: number;
}

function initialState(): State {
  const { series, episodes, files } = seedLibrary();
  const blocked = episodes.find((episode) => episode.seriesId === 1 && !episode.hasFile);
  return {
    series,
    episodes,
    files,
    queue:
      blocked === undefined
        ? []
        : [
            {
              id: 1,
              seriesId: 1,
              episodeId: blocked.id,
              title: 'Les.Veilleurs.S02E05.1080p.WEB-DL',
              size: 2_000_000_000,
              sizeleft: 0,
              status: 'completed',
              trackedDownloadStatus: 'warning',
              trackedDownloadState: 'importBlocked',
              quality: { quality: { id: 3, name: 'WEBDL-1080p' } },
              protocol: 'torrent',
              indexer: 'IndexeurTest',
              downloadClient: 'qBittorrent',
              downloadId: 'HASHVEILLEURS',
              outputPath: '/downloads/Les.Veilleurs.S02E05',
              statusMessages: [
                { title: 'Les.Veilleurs.S02E05.mkv', messages: ['Unable to parse episode'] },
              ],
            },
          ],
    history: files.slice(0, 6).map((file, index) => ({
      id: index + 1,
      seriesId: file.seriesId,
      episodeId: episodes.find((episode) => episode.episodeFileId === file.id)?.id ?? 0,
      eventType: 'downloadFolderImported',
      date: file.dateAdded,
      sourceTitle: file.relativePath,
      quality: file.quality,
      data: { importedPath: file.path },
    })),
    blocklist: [
      {
        id: 1,
        seriesId: 2,
        episodeIds: [],
        sourceTitle: 'Brume.S01.720p.HDTV-BAD',
        quality: { quality: { id: 4, name: 'HDTV-720p' } },
        date: new Date(Date.now() - 86_400_000).toISOString(),
        protocol: 'torrent',
        indexer: 'IndexeurTest',
        message: 'Manually marked as failed',
        languages: [{ id: 1, name: 'English' }],
      },
    ],
    commands: new Map(),
    tags: [{ id: 1, label: 'famille' }],
    nextId: 10_000,
  };
}

function paged<T>(records: T[], request: FastifyRequest) {
  const query = request.query as { page?: string; pageSize?: string };
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 50));
  return {
    page,
    pageSize,
    totalRecords: records.length,
    records: records.slice((page - 1) * pageSize, page * pageSize),
  };
}

export const sonarrMock: FastifyPluginAsync = async (app) => {
  let state = initialState();
  // Administration (P3b.6) : indexeurs, clients, configurations, système…
  const admin = createArrAdminMock('sonarr', {
    tags: () => state.tags,
    hasImportLists: false,
  });
  admin.register(app);

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers['x-api-key'] !== SONARR_API_KEY) {
      await reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  app.post('/__reset', async () => {
    state = initialState();
    admin.reset();
    return { ok: true };
  });

  const notFound = { message: 'NotFound' };
  const nextId = () => (state.nextId += 1);
  const findSeries = (id: unknown) => state.series.find((entry) => entry.id === Number(id));
  const now = () => Date.now();
  const aired = (episode: MockEpisode) => Date.parse(episode.airDateUtc) <= now();

  /** Série avec ses statistiques calculées depuis les épisodes et les fichiers. */
  const withStats = (series: MockSeries) => {
    const episodes = state.episodes.filter((episode) => episode.seriesId === series.id);
    const counted = episodes.filter((episode) => episode.monitored && aired(episode));
    const size = state.files
      .filter((file) => file.seriesId === series.id)
      .reduce((sum, file) => sum + file.size, 0);
    const files = episodes.filter((episode) => episode.hasFile).length;
    return {
      ...series,
      seasons: series.seasons.map((season) => {
        const inSeason = episodes.filter((episode) => episode.seasonNumber === season.seasonNumber);
        return {
          ...season,
          statistics: {
            episodeCount: inSeason.filter((episode) => episode.monitored && aired(episode)).length,
            episodeFileCount: inSeason.filter((episode) => episode.hasFile).length,
            totalEpisodeCount: inSeason.length,
            sizeOnDisk: 0,
          },
        };
      }),
      statistics: {
        seasonCount: series.seasons.length,
        episodeCount: Math.max(counted.length, files),
        episodeFileCount: files,
        totalEpisodeCount: episodes.length,
        sizeOnDisk: size,
      },
    };
  };
  const episodeRef = (episodeId: number) => {
    const episode = state.episodes.find((candidate) => candidate.id === episodeId);
    return episode === undefined
      ? undefined
      : {
          id: episode.id,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
        };
  };

  /** Épisodes manquants mis en file (recherche ou grab) ; renvoie leur nombre. */
  const enqueue = (episodes: MockEpisode[], title?: string): number => {
    let count = 0;
    for (const episode of episodes) {
      if (episode.hasFile || !aired(episode)) continue;
      if (state.queue.some((item) => item.episodeId === episode.id)) continue;
      const series = findSeries(episode.seriesId);
      const release =
        title ??
        `${(series?.title ?? 'Serie').replace(/ /g, '.')}.S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}.1080p.WEB-DL-HUBARR`;
      state.queue.push({
        id: nextId(),
        seriesId: episode.seriesId,
        episodeId: episode.id,
        title: release,
        size: 2_000_000_000,
        sizeleft: 1_500_000_000,
        status: 'downloading',
        trackedDownloadStatus: 'ok',
        trackedDownloadState: 'downloading',
        quality: { quality: { id: 3, name: 'WEBDL-1080p' } },
        protocol: 'torrent',
        indexer: 'IndexeurTest',
        downloadClient: 'qBittorrent',
        downloadId: `HASH${episode.id}`,
        outputPath: `/downloads/${release}`,
        statusMessages: [],
      });
      state.history.unshift({
        id: nextId(),
        seriesId: episode.seriesId,
        episodeId: episode.id,
        eventType: 'grabbed',
        date: new Date().toISOString(),
        sourceTitle: release,
        quality: { quality: { id: 3, name: 'WEBDL-1080p' } },
        data: { indexer: 'IndexeurTest', releaseTitle: release, protocol: 'torrent' },
      });
      count += 1;
    }
    return count;
  };

  // ── Système ───────────────────────────────────────────────────────────────
  app.get('/api/v3/system/status', async () => ({
    appName: 'Sonarr',
    version: '4.0.20.3014',
    osName: 'ubuntu',
    osVersion: '24.04',
    runtimeVersion: '8.0.10',
    databaseVersion: '3.46.1',
    isDocker: true,
    startTime: new Date(Date.now() - 3_600_000).toISOString(),
    urlBase: '',
  }));
  app.get('/api/v3/health', async () => []);
  app.get('/api/v3/diskspace', async () => [
    { path: '/tv', label: 'tv', freeSpace: 900_000_000_000, totalSpace: 2_000_000_000_000 },
  ]);
  app.get('/api/v3/log', async (request) =>
    paged(
      [
        {
          id: 1,
          time: new Date().toISOString(),
          level: 'info',
          logger: 'Sonarr',
          message: 'Démarré',
        },
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
    const tag = { id: nextId(), label: (request.body as { label: string }).label };
    state.tags.push(tag);
    return tag;
  });
  app.get('/api/v3/filesystem', async (request) => {
    const path = (request.query as { path?: string }).path ?? '/';
    return {
      parent: path === '/' ? null : '/',
      directories: path === '/' ? [{ name: 'tv', path: '/tv/' }] : [],
      files: [],
    };
  });

  // ── Séries ────────────────────────────────────────────────────────────────
  app.get('/api/v3/series', async () => state.series.map(withStats));
  app.get('/api/v3/series/lookup', async (request) => {
    const term = ((request.query as { term?: string }).term ?? '').toLowerCase();
    const inLibrary = state.series.map((entry) => ({ ...withStats(entry) }));
    const candidates = LOOKUP_CANDIDATES.map((candidate) => ({
      ...candidate,
      sortTitle: candidate.title.toLowerCase(),
      images: [],
      seasons: [{ seasonNumber: 1, monitored: true }],
      qualityProfileId: 0,
    }));
    const tvdb = /^tvdb:(\d+)$/.exec(term)?.[1];
    if (tvdb !== undefined) {
      return [...inLibrary, ...candidates].filter((entry) => entry.tvdbId === Number(tvdb));
    }
    return [...inLibrary, ...candidates].filter((entry) =>
      entry.title.toLowerCase().includes(term),
    );
  });
  app.get('/api/v3/series/:id', async (request, reply) => {
    const series = findSeries((request.params as { id: string }).id);
    return series === undefined ? reply.code(404).send(notFound) : withStats(series);
  });
  app.put('/api/v3/series/:id', async (request, reply) => {
    const series = findSeries((request.params as { id: string }).id);
    if (series === undefined) return reply.code(404).send(notFound);
    const body = request.body as Partial<MockSeries>;
    Object.assign(series, {
      monitored: body.monitored ?? series.monitored,
      monitorNewItems: body.monitorNewItems ?? series.monitorNewItems,
      seasonFolder: body.seasonFolder ?? series.seasonFolder,
      seriesType: body.seriesType ?? series.seriesType,
      qualityProfileId: body.qualityProfileId ?? series.qualityProfileId,
      path: body.path ?? series.path,
      tags: body.tags ?? series.tags,
      seasons: (body.seasons ?? series.seasons).map((season) => ({
        seasonNumber: season.seasonNumber,
        monitored: season.monitored,
      })),
    });
    return withStats(series);
  });
  app.delete('/api/v3/series/:id', async (request) => {
    const id = Number((request.params as { id: string }).id);
    state.series = state.series.filter((entry) => entry.id !== id);
    return {};
  });
  app.put('/api/v3/series/editor', async (request) => {
    const body = request.body as {
      seriesIds: number[];
      monitored?: boolean;
      seriesType?: MockSeries['seriesType'];
    };
    for (const series of state.series.filter((entry) => body.seriesIds.includes(entry.id))) {
      if (body.monitored !== undefined) series.monitored = body.monitored;
      if (body.seriesType !== undefined) series.seriesType = body.seriesType;
    }
    return {};
  });
  app.delete('/api/v3/series/editor', async (request) => {
    const ids = (request.body as { seriesIds: number[] }).seriesIds;
    state.series = state.series.filter((entry) => !ids.includes(entry.id));
    return {};
  });
  app.post('/api/v3/series', async (request, reply) => {
    const body = request.body as Partial<MockSeries> & { tvdbId: number };
    if (state.series.some((entry) => entry.tvdbId === body.tvdbId)) {
      return reply.code(400).send([{ errorMessage: 'This series has already been added' }]);
    }
    const series: MockSeries = {
      id: nextId(),
      tvdbId: body.tvdbId,
      title: body.title ?? 'Nouvelle série',
      sortTitle: (body.title ?? '').toLowerCase(),
      year: body.year ?? 2024,
      overview: '',
      status: body.status ?? 'continuing',
      ended: false,
      monitored: body.monitored ?? true,
      monitorNewItems: 'all',
      seriesType: body.seriesType ?? 'standard',
      seasonFolder: body.seasonFolder ?? true,
      network: body.network ?? '',
      genres: body.genres ?? [],
      runtime: 45,
      certification: '',
      qualityProfileId: body.qualityProfileId ?? 1,
      path: `${body.rootFolderPath ?? '/tv'}/${body.title ?? 'serie'}`,
      rootFolderPath: body.rootFolderPath ?? '/tv',
      tags: body.tags ?? [],
      added: new Date().toISOString(),
      ratings: { votes: 0, value: 0 },
      images: [],
      seasons: [{ seasonNumber: 1, monitored: true }],
    };
    state.series.push(series);
    return reply.code(201).send(withStats(series));
  });
  app.post('/api/v3/series/import', async () => []);

  // ── Épisodes et fichiers ──────────────────────────────────────────────────
  app.get('/api/v3/episode', async (request) => {
    const seriesId = Number((request.query as { seriesId?: string }).seriesId);
    return state.episodes.filter((episode) => episode.seriesId === seriesId);
  });
  app.get('/api/v3/episode/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const episode = state.episodes.find((candidate) => candidate.id === id);
    return episode ?? reply.code(404).send(notFound);
  });
  app.put('/api/v3/episode/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const episode = state.episodes.find((candidate) => candidate.id === id);
    if (episode === undefined) return reply.code(404).send(notFound);
    episode.monitored = (request.body as { monitored?: boolean }).monitored ?? episode.monitored;
    return episode;
  });
  app.get('/api/v3/episodefile', async (request) => {
    const seriesId = Number((request.query as { seriesId?: string }).seriesId);
    return state.files.filter((file) => file.seriesId === seriesId);
  });
  app.get('/api/v3/episodefile/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    return state.files.find((file) => file.id === id) ?? reply.code(404).send(notFound);
  });
  app.put('/api/v3/episodefile/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const index = state.files.findIndex((file) => file.id === id);
    if (index < 0) return reply.code(404).send(notFound);
    state.files[index] = { ...state.files[index], ...(request.body as MockEpisodeFile) };
    return state.files[index];
  });
  app.put('/api/v3/episodefile/bulk', async (request) => {
    for (const update of request.body as MockEpisodeFile[]) {
      const index = state.files.findIndex((file) => file.id === update.id);
      if (index >= 0) state.files[index] = { ...state.files[index], ...update };
    }
    return request.body;
  });
  app.delete('/api/v3/episodefile/:id', async (request) => {
    const id = Number((request.params as { id: string }).id);
    state.files = state.files.filter((file) => file.id !== id);
    for (const episode of state.episodes.filter((candidate) => candidate.episodeFileId === id)) {
      episode.hasFile = false;
      episode.episodeFileId = 0;
    }
    return {};
  });
  app.get('/api/v3/rename', async (request) => {
    const seriesId = Number((request.query as { seriesId?: string }).seriesId);
    // Un seul fichier à renommer : le premier de la série.
    const file = state.files.find((candidate) => candidate.seriesId === seriesId);
    const episode = state.episodes.find((candidate) => candidate.episodeFileId === file?.id);
    if (file === undefined || episode === undefined) return [];
    return [
      {
        seriesId,
        episodeFileId: file.id,
        seasonNumber: episode.seasonNumber,
        episodeNumbers: [episode.episodeNumber],
        existingPath: file.relativePath.replace(' - ', '.'),
        newPath: file.relativePath,
      },
    ];
  });

  // ── Calendrier, manquants, cutoff ─────────────────────────────────────────
  app.get('/api/v3/calendar', async () => {
    const end = now() + 14 * 86_400_000;
    return state.episodes
      .filter((episode) => {
        const time = Date.parse(episode.airDateUtc);
        return time >= now() - 86_400_000 && time <= end;
      })
      .map((episode) => {
        const series = findSeries(episode.seriesId);
        return { ...episode, series: series === undefined ? undefined : withStats(series) };
      });
  });
  const withSeries = (episode: MockEpisode) => {
    const series = findSeries(episode.seriesId);
    return { ...episode, series: series === undefined ? undefined : { title: series.title } };
  };
  app.get('/api/v3/wanted/missing', async (request) =>
    paged(
      state.episodes
        .filter((episode) => episode.monitored && !episode.hasFile && aired(episode))
        .filter((episode) => findSeries(episode.seriesId)?.monitored)
        .sort((a, b) => b.airDateUtc.localeCompare(a.airDateUtc))
        .map(withSeries),
      request,
    ),
  );
  app.get('/api/v3/wanted/cutoff', async (request) =>
    paged(
      state.episodes
        .filter((episode) => episode.seriesId === 3 && episode.hasFile)
        .map((episode) => ({
          ...withSeries(episode),
          episodeFile: {
            quality: { quality: { id: 4, name: 'HDTV-720p' } },
          },
        })),
      request,
    ),
  );

  // ── Historique, liste de blocage ──────────────────────────────────────────
  app.get('/api/v3/history', async (request) => {
    const query = request.query as { seriesIds?: string };
    const seriesId = query.seriesIds === undefined ? null : Number(query.seriesIds);
    const records = state.history
      .filter((item) => seriesId === null || item.seriesId === seriesId)
      .map((item) => {
        const series = findSeries(item.seriesId);
        return {
          ...item,
          series: series === undefined ? undefined : { title: series.title },
          episode: episodeRef(Number(item.episodeId)),
        };
      });
    return paged(records, request);
  });
  app.get('/api/v3/blocklist', async (request) => paged(state.blocklist, request));
  app.delete('/api/v3/blocklist/:id', async (request) => {
    const id = Number((request.params as { id: string }).id);
    state.blocklist = state.blocklist.filter((item) => item.id !== id);
    return {};
  });
  app.delete('/api/v3/blocklist/bulk', async (request) => {
    const ids = (request.body as { ids: number[] }).ids;
    state.blocklist = state.blocklist.filter((item) => !ids.includes(Number(item.id)));
    return {};
  });

  // ── Releases ──────────────────────────────────────────────────────────────
  app.get('/api/v3/release', async (request) => {
    const query = request.query as { episodeId?: string; seriesId?: string; seasonNumber?: string };
    if (query.episodeId !== undefined) {
      const episode = state.episodes.find((candidate) => candidate.id === Number(query.episodeId));
      if (episode === undefined) return [];
      return releasesFor(episode.seasonNumber, [episode.episodeNumber], false).map((release) => ({
        ...release,
        guid: `${release.guid}-${episode.id}`,
        episodeId: episode.id,
      }));
    }
    const season = Number(query.seasonNumber ?? 1);
    return releasesFor(season, [], true).map((release) => ({
      ...release,
      guid: `${release.guid}-s${query.seriesId ?? 0}`,
      seriesId: Number(query.seriesId ?? 0),
    }));
  });
  app.post('/api/v3/release', async (request) => {
    const { guid } = request.body as { guid: string };
    const episodeId = Number(/-(\d+)$/.exec(guid)?.[1] ?? 0);
    const seriesId = Number(/-s(\d+)$/.exec(guid)?.[1] ?? 0);
    const targets = state.episodes.filter((episode) =>
      seriesId > 0 ? episode.seriesId === seriesId : episode.id === episodeId,
    );
    enqueue(targets, guid);
    return {};
  });

  // ── Commandes ─────────────────────────────────────────────────────────────
  app.post('/api/v3/command', async (request) => {
    const body = request.body as {
      name: string;
      seriesId?: number;
      seasonNumber?: number;
      episodeIds?: number[];
    };
    let message = 'Completed';
    let targets: MockEpisode[] = [];
    if (body.name === 'EpisodeSearch') {
      targets = state.episodes.filter((episode) => body.episodeIds?.includes(episode.id));
    } else if (body.name === 'SeasonSearch') {
      targets = state.episodes.filter(
        (episode) =>
          episode.seriesId === body.seriesId && episode.seasonNumber === body.seasonNumber,
      );
    } else if (body.name === 'SeriesSearch') {
      targets = state.episodes.filter((episode) => episode.seriesId === body.seriesId);
    }
    if (['EpisodeSearch', 'SeasonSearch', 'SeriesSearch'].includes(body.name)) {
      message = `Completed. ${enqueue(targets.filter((episode) => episode.monitored))} reports downloaded.`;
    } else if (body.name === 'MissingEpisodeSearch') {
      message = 'Completed. 0 reports downloaded.';
    } else if (body.name === 'ManualImport') {
      state.queue = state.queue.filter((item) => item.trackedDownloadState !== 'importBlocked');
    }
    const command = {
      id: nextId(),
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

  // ── File d'attente, import manuel ─────────────────────────────────────────
  app.get('/api/v3/queue', async (request) =>
    paged(
      state.queue.map((item) => {
        const series = findSeries(item.seriesId);
        return {
          ...item,
          series: series === undefined ? undefined : { title: series.title },
          episode: episodeRef(item.episodeId),
        };
      }),
      request,
    ),
  );
  app.delete('/api/v3/queue/:id', async (request) => {
    const id = Number((request.params as { id: string }).id);
    state.queue = state.queue.filter((item) => item.id !== id);
    return {};
  });
  app.post('/api/v3/queue/grab/:id', async () => ({}));
  app.post('/api/v3/queue/grab/bulk', async () => ({}));
  app.get('/api/v3/manualimport', async (request) => {
    const downloadId = (request.query as { downloadId?: string }).downloadId;
    const item = state.queue.find((candidate) => candidate.downloadId === downloadId);
    if (item === undefined) return [];
    return [
      {
        path: `${item.outputPath}/episode.mkv`,
        folderName: item.outputPath,
        series: { id: item.seriesId },
        episodes: [{ id: item.episodeId }],
        quality: item.quality,
        languages: [{ id: 2, name: 'French' }],
        releaseGroup: 'HUBARR',
        downloadId: item.downloadId,
        rejections: [],
      },
    ];
  });
};
