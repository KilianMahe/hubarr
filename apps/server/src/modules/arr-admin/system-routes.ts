// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, système (P3b.5) : sauvegardes, mises à jour, tâches,
// commandes (état, annulation), journaux, statistiques, parseur, import de
// bibliothèque, suggestions (Radarr), renommage (Radarr), calendrier
// (Sonarr). Port de `RadarrController`/`SonarrController::backup*`,
// `updates`, `installUpdate`, `tasks`, `taskRun`, `commands`, `command*`,
// `logs`, `stats`, `parse`, `libraryImport*`, `suggestions`, `rename*`,
// `calendar`.
//
// Écarts : formes réduites (aucune URL d'instance : liens de
// téléchargement des journaux et des sauvegardes écartés) ; filtre de niveau
// des journaux passé à l'instance ; statistiques tirées de la bibliothèque en
// cache ; parseur normalisé pour les deux services (Sonarr lisait les champs
// d'un film) ; calendrier Sonarr de 30 jours avec sa propre page (l'original
// l'affichait avec le gabarit des commandes).

import {
  LOGS_PAGE_SIZE,
  arrCommandStartedSchema,
  arrCommandStatusSchema,
  arrCommandSummarySchema,
  arrOkSchema,
  backupSchema,
  calendarEpisodeSchema,
  libraryImportPageSchema,
  libraryImportScanRequestSchema,
  libraryImportScanSchema,
  libraryStatsSchema,
  logsPageSchema,
  parsePageSchema,
  renamePageSchema,
  renameProposalSchema,
  suggestionsPageSchema,
  systemTaskSchema,
  taskRunRequestSchema,
  updatesPageSchema,
  type ArrCommandSummary,
  type LibraryStats,
  type ParseResult,
  type Suggestion,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../http/zod';
import {
  SIMPLE_RESOURCES,
  type ArrAdminClient,
  type ArrRecord,
} from '../../integrations/arr/admin';
import { isUpstreamError } from '../../integrations/http';
import {
  backupOf,
  date,
  logOf,
  num,
  record,
  strings,
  taskOf,
  text,
  updateOf,
} from '../../integrations/arr/system-normalize';
import { LIBRARY_TIMEOUT_MS } from '../../integrations/radarr/client';
import { radarrClient, sonarrClient } from '../services/clients';
import {
  itemParams,
  namedRefs,
  positiveInt,
  rawQuery,
  scalar,
  slugParams,
  type AdminContext,
} from './common';

const commandParams = slugParams.extend({ cmdId: z.coerce.number().int().nonnegative() });
const movieParams = slugParams.extend({ movieId: z.coerce.number().int().positive() });

function commandOf(item: ArrRecord): ArrCommandSummary[] {
  if (typeof item.id !== 'number') return [];
  return [
    {
      id: item.id,
      name: text(item.commandName) ?? text(item.name) ?? '',
      status: text(item.status) ?? 'unknown',
      message: text(item.message),
      queued: date(item.queued),
      started: date(item.started),
      ended: date(item.ended),
      duration: text(item.duration),
    },
  ];
}

/** Affiche TMDB d'un élément (`remotePoster` ou image `poster`), jamais une URL d'instance. */
function tmdbPoster(item: ArrRecord): string | null {
  const candidates = [
    text(item.remotePoster),
    ...(Array.isArray(item.images) ? (item.images as unknown[]) : [])
      .map(record)
      .filter((image) => image.coverType === 'poster')
      .map((image) => text(image.remoteUrl)),
  ];
  return candidates.find((url) => url?.startsWith('https://image.tmdb.org/')) ?? null;
}

function suggestionOf(item: ArrRecord): Suggestion[] {
  if (typeof item.tmdbId !== 'number' || item.tmdbId <= 0) return [];
  const ratings = record(item.ratings);
  const value = (source: unknown) => num(record(source).value);
  return [
    {
      tmdbId: item.tmdbId,
      title: text(item.title) ?? `#${item.tmdbId}`,
      year: num(item.year),
      overview: text(item.overview),
      poster: tmdbPoster(item),
      runtime: num(item.runtime),
      studio: text(item.studio),
      genres: strings(item.genres),
      ratings: { imdb: value(ratings.imdb), tmdb: value(ratings.tmdb) },
      inLibrary: (typeof item.id === 'number' && item.id > 0) || item.isExisting === true,
      recommended: item.isRecommendation === true,
      trending: item.isTrending === true,
      popular: item.isPopular === true,
    },
  ];
}

/** Résultat du parseur, normalisé pour les deux services. */
function parseResultOf(data: ArrRecord): ParseResult {
  const movieInfo = record(data.parsedMovieInfo);
  const episodeInfo = record(data.parsedEpisodeInfo);
  const info = Object.keys(movieInfo).length > 0 ? movieInfo : episodeInfo;
  const quality = record(record(info.quality).quality);
  const languages = (Array.isArray(info.languages) ? (info.languages as unknown[]) : [])
    .map((language) => (typeof language === 'string' ? language : text(record(language).name)))
    .filter((language): language is string => language !== null);
  const season = num(episodeInfo.seasonNumber);
  const episodes = Array.isArray(episodeInfo.episodeNumbers)
    ? (episodeInfo.episodeNumbers as unknown[]).filter(
        (value): value is number => typeof value === 'number',
      )
    : [];
  const pad = (value: number) => String(value).padStart(2, '0');
  const match = record(data.movie ?? data.series);
  return {
    title: text(data.title),
    parsedTitle: text(info.movieTitle) ?? text(info.seriesTitle) ?? text(info.primaryMovieTitle),
    year: num(info.year) ?? num(record(info.seriesTitleInfo).year),
    quality: text(quality.name),
    edition: text(info.edition),
    releaseGroup: text(info.releaseGroup),
    languages,
    episode:
      season === null || episodes.length === 0
        ? null
        : `S${pad(season)}${episodes.map((episode) => `E${pad(episode)}`).join('')}`,
    match:
      typeof match.id === 'number'
        ? { id: match.id, title: text(match.title) ?? `#${match.id}`, year: num(match.year) }
        : null,
  };
}

/** Effectifs triés par nombre décroissant (`arsort`). */
function counts(map: Map<string, number>): { name: string; count: number }[] {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function disks(client: ArrAdminClient) {
  return (await client.list('/api/v3/diskspace').catch(() => [])).map((disk) => ({
    path: text(disk.path),
    label: text(disk.label),
    freeSpace: num(disk.freeSpace) ?? 0,
    totalSpace: num(disk.totalSpace) ?? 0,
  }));
}

export function registerSystemRoutes(instance: FastifyInstance, ctx: AdminContext): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { base, config, kind } = ctx;

  // ── Sauvegardes ────────────────────────────────────────────────────────────

  // n° 336 / 439.
  app.get(
    `${base}/sauvegardes`,
    { config, schema: { params: slugParams, response: { 200: z.array(backupSchema) } } },
    async (request) => {
      const backups = (await ctx.clientOf(request).list(SIMPLE_RESOURCES.backups)).flatMap(
        backupOf,
      );
      return backups.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
    },
  );

  // n° 337 / 440 : commande `Backup`, suivie par le front.
  app.post(
    `${base}/sauvegardes/creer`,
    { config, schema: { params: slugParams, response: { 200: arrCommandStartedSchema } } },
    async (request) => ({
      ok: true as const,
      cmdId: await ctx.clientOf(request).command('Backup'),
    }),
  );

  // n° 338 / 441.
  app.post(
    `${base}/sauvegardes/:id/supprimer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).remove(SIMPLE_RESOURCES.backups, request.params.id);
      return { ok: true as const };
    },
  );

  // n° 339 / 442 : l'instance redémarre après la restauration.
  app.post(
    `${base}/sauvegardes/:id/restaurer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).http.request({
        method: 'POST',
        path: `/api/v3/system/backup/restore/${request.params.id}`,
        json: {},
        timeoutMs: 30_000,
        responseType: 'none',
      });
      return { ok: true as const };
    },
  );

  // ── Mises à jour ───────────────────────────────────────────────────────────

  // n° 334 / 437 : versions et version installée (conteneur : mise à jour par l'image).
  app.get(
    `${base}/mises-a-jour`,
    { config, schema: { params: slugParams, response: { 200: updatesPageSchema } } },
    async (request) => {
      const client = ctx.clientOf(request);
      const [updates, status] = await Promise.all([
        client.list('/api/v3/update'),
        client.one('/api/v3/system/status').catch(() => null),
      ]);
      return {
        version: text(status?.version),
        docker: status?.isDocker === true || status?.packageUpdateMechanism === 'docker',
        updates: updates.flatMap(updateOf),
      };
    },
  );

  // n° 335 / 438 : commande `ApplicationUpdate`.
  app.post(
    `${base}/mises-a-jour/installer`,
    { config, schema: { params: slugParams, response: { 200: arrCommandStartedSchema } } },
    async (request) => ({
      ok: true as const,
      cmdId: await ctx.clientOf(request).command('ApplicationUpdate'),
    }),
  );

  // ── Tâches ─────────────────────────────────────────────────────────────────

  // n° 404 / 503.
  app.get(
    `${base}/taches`,
    { config, schema: { params: slugParams, response: { 200: z.array(systemTaskSchema) } } },
    async (request) => (await ctx.clientOf(request).list('/api/v3/system/task')).flatMap(taskOf),
  );

  // n° 405 / 504 : nom de commande obligatoire (lettres et chiffres).
  app.post(
    `${base}/taches/executer`,
    {
      config,
      schema: {
        params: slugParams,
        body: taskRunRequestSchema,
        response: { 200: arrCommandStartedSchema },
      },
    },
    async (request) => ({
      ok: true as const,
      cmdId: await ctx.clientOf(request).command(request.body.commandName),
    }),
  );

  // ── Commandes ──────────────────────────────────────────────────────────────

  // n° 401 / 500 : plus récentes en tête.
  app.get(
    `${base}/commandes`,
    { config, schema: { params: slugParams, response: { 200: z.array(arrCommandSummarySchema) } } },
    async (request) => {
      const commands = (await ctx.clientOf(request).list('/api/v3/command')).flatMap(commandOf);
      return commands.sort((a, b) => b.id - a.id);
    },
  );

  // n° 402 / 501 : état d'une commande ; purgée (404) → `unknown`.
  app.get(
    `${base}/command/:cmdId/status`,
    { config, schema: { params: commandParams, response: { 200: arrCommandStatusSchema } } },
    async (request) => {
      const { cmdId } = request.params;
      try {
        const command = (await ctx.clientOf(request).one(`/api/v3/command/${cmdId}`)) ?? {};
        return {
          id: num(command.id) ?? cmdId,
          name: text(command.name) ?? text(command.commandName) ?? '',
          status: text(command.status) ?? 'unknown',
          message: text(command.message),
          queued: text(command.queued),
          started: text(command.started),
          ended: text(command.ended),
        };
      } catch (error) {
        if (isUpstreamError(error) && error.kind === 'http' && error.info.status === 404) {
          return {
            id: cmdId,
            name: '',
            status: 'unknown',
            message: null,
            queued: null,
            started: null,
            ended: null,
          };
        }
        throw error;
      }
    },
  );

  // n° 403 / 502.
  app.post(
    `${base}/command/:cmdId/annuler`,
    { config, schema: { params: commandParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).http.delete(`/api/v3/command/${request.params.cmdId}`);
      return { ok: true as const };
    },
  );

  // ── Journaux ───────────────────────────────────────────────────────────────

  // n° 406 / 505 : fichiers et 100 lignes par page, niveau filtré par l'instance.
  app.get(
    `${base}/logs`,
    {
      config,
      schema: { params: slugParams, querystring: rawQuery, response: { 200: logsPageSchema } },
    },
    async (request) => {
      const client = ctx.clientOf(request);
      const page = positiveInt(request.query.page, 1);
      const level = scalar(request.query.level);
      const [files, logs] = await Promise.all([
        client.list('/api/v3/log/file').catch(() => []),
        client.one('/api/v3/log', {
          page,
          pageSize: LOGS_PAGE_SIZE,
          sortKey: 'time',
          sortDirection: 'descending',
          ...(['info', 'debug', 'warn', 'error'].includes(level) ? { level } : {}),
        }),
      ]);
      const records = Array.isArray(logs?.records) ? (logs.records as unknown[]).map(record) : [];
      return {
        files: files.flatMap((file) => {
          const filename = text(file.filename);
          return filename === null ? [] : [{ filename, lastWriteTime: date(file.lastWriteTime) }];
        }),
        records: records.map(logOf),
        totalRecords: num(logs?.totalRecords) ?? records.length,
        page,
        pageSize: LOGS_PAGE_SIZE,
      };
    },
  );

  // ── Statistiques ───────────────────────────────────────────────────────────

  // n° 407 / 506 : tirées de la bibliothèque en cache (les mêmes chiffres que la page).
  app.get(
    `${base}/stats`,
    { config, schema: { params: slugParams, response: { 200: libraryStatsSchema } } },
    async (request): Promise<LibraryStats> => {
      const client = ctx.clientOf(request);
      const row = ctx.instanceOf(request);
      const genres = new Map<string, number>();
      if (kind === 'radarr') {
        const [movies, diskList, missing] = await Promise.all([
          instance.cache.library.movies(row.slug, () =>
            radarrClient(instance, row).movies(LIBRARY_TIMEOUT_MS),
          ),
          disks(client),
          client.one('/api/v3/wanted/missing', { page: 1, pageSize: 1 }).catch(() => null),
        ]);
        const qualities = new Map<string, { count: number; size: number }>();
        const decades = new Map<string, number>();
        let hasFile = 0;
        let monitored = 0;
        let size = 0;
        for (const movie of movies) {
          if (movie.hasFile) hasFile += 1;
          if (movie.monitored) monitored += 1;
          size += movie.sizeOnDisk;
          if (movie.quality) {
            const entry = qualities.get(movie.quality) ?? { count: 0, size: 0 };
            qualities.set(movie.quality, {
              count: entry.count + 1,
              size: entry.size + movie.sizeOnDisk,
            });
          }
          for (const genre of movie.genres) bump(genres, genre);
          if (movie.year !== null && movie.year > 0)
            bump(decades, `${Math.floor(movie.year / 10) * 10}s`);
        }
        return {
          total: movies.length,
          monitored,
          sizeOnDisk: size,
          disks: diskList,
          genres: counts(genres),
          hasFile,
          missing: num(missing?.totalRecords) ?? movies.length - hasFile,
          qualities: [...qualities.entries()]
            .map(([name, entry]) => ({ name, ...entry }))
            .sort((a, b) => b.count - a.count),
          decades: counts(decades).sort((a, b) => a.name.localeCompare(b.name)),
          continuing: null,
          ended: null,
          networks: [],
        };
      }
      const [series, diskList] = await Promise.all([
        instance.cache.library.series(row.slug, () =>
          sonarrClient(instance, row).seriesList(LIBRARY_TIMEOUT_MS),
        ),
        disks(client),
      ]);
      const networks = new Map<string, number>();
      let continuing = 0;
      let ended = 0;
      let monitored = 0;
      let size = 0;
      for (const entry of series) {
        if (entry.status === 'continuing') continuing += 1;
        if (entry.status === 'ended') ended += 1;
        if (entry.monitored) monitored += 1;
        size += entry.sizeOnDisk;
        for (const genre of entry.genres) bump(genres, genre);
        if (entry.network) bump(networks, entry.network);
      }
      return {
        total: series.length,
        monitored,
        sizeOnDisk: size,
        disks: diskList,
        genres: counts(genres),
        hasFile: null,
        missing: null,
        qualities: [],
        decades: [],
        continuing,
        ended,
        networks: counts(networks),
      };
    },
  );

  // ── Parseur ────────────────────────────────────────────────────────────────

  // n° 408 / 507 : `?title=` ; sans titre, aucun résultat.
  app.get(
    `${base}/parser`,
    {
      config,
      schema: { params: slugParams, querystring: rawQuery, response: { 200: parsePageSchema } },
    },
    async (request) => {
      const title = scalar(request.query.title).trim();
      if (title === '') return { result: null };
      const data = await ctx.clientOf(request).one('/api/v3/parse', { title });
      return { result: data === null ? null : parseResultOf(data) };
    },
  );

  // ── Import de bibliothèque ─────────────────────────────────────────────────

  // n° 352 / 454 : dossiers racine et profils.
  app.get(
    `${base}/import-bibliotheque`,
    { config, schema: { params: slugParams, response: { 200: libraryImportPageSchema } } },
    async (request) => {
      const client = ctx.clientOf(request);
      const [folders, profiles] = await Promise.all([
        client.list(SIMPLE_RESOURCES.rootFolders),
        client.list(SIMPLE_RESOURCES.qualityProfiles),
      ]);
      return {
        rootFolders: folders.flatMap((folder) =>
          typeof folder.id === 'number' && typeof folder.path === 'string'
            ? [{ id: folder.id, path: folder.path }]
            : [],
        ),
        qualityProfiles: namedRefs(profiles),
      };
    },
  );

  // n° 353 / 455 : sous-dossiers qui ne sont pas déjà dans la bibliothèque.
  app.post(
    `${base}/import-bibliotheque/scan`,
    {
      config,
      schema: {
        params: slugParams,
        body: libraryImportScanRequestSchema,
        response: { 200: libraryImportScanSchema },
      },
    },
    async (request) => {
      const client = ctx.clientOf(request);
      const row = ctx.instanceOf(request);
      const folder = `${request.body.folder.replace(/\/+$/, '')}/`;
      const [listing, items] = await Promise.all([
        client.one('/api/v3/filesystem', { path: folder, includeFiles: false }),
        kind === 'radarr'
          ? instance.cache.library.movies(row.slug, () =>
              radarrClient(instance, row).movies(LIBRARY_TIMEOUT_MS),
            )
          : instance.cache.library.series(row.slug, () =>
              sonarrClient(instance, row).seriesList(LIBRARY_TIMEOUT_MS),
            ),
      ]);
      const existing = new Set(
        items.map((item) => (item.path ?? '').replace(/\/+$/, '')).filter((path) => path !== ''),
      );
      const directories = Array.isArray(listing?.directories)
        ? (listing.directories as unknown[]).map(record)
        : [];
      return {
        folders: directories.flatMap((directory) => {
          const path = (text(directory.path) ?? '').replace(/\/+$/, '');
          if (path === '' || existing.has(path)) return [];
          return [{ name: text(directory.name) ?? path, path, size: num(directory.size) }];
        }),
      };
    },
  );

  // ── Suggestions (Radarr) ───────────────────────────────────────────────────

  if (ctx.has('suggestions')) {
    // n° 351 : films des listes d'import et recommandations.
    app.get(
      `${base}/suggestions`,
      { config, schema: { params: slugParams, response: { 200: suggestionsPageSchema } } },
      async (request) => {
        const client = ctx.clientOf(request);
        const [movies, profiles, folders] = await Promise.all([
          client.list('/api/v3/importlist/movie', { includeRecommendations: true }),
          client.list(SIMPLE_RESOURCES.qualityProfiles),
          client.list(SIMPLE_RESOURCES.rootFolders),
        ]);
        return {
          movies: movies.flatMap(suggestionOf),
          qualityProfiles: namedRefs(profiles),
          rootFolders: folders.flatMap((folder) =>
            typeof folder.id === 'number' && typeof folder.path === 'string'
              ? [{ id: folder.id, path: folder.path }]
              : [],
          ),
        };
      },
    );
  }

  // ── Renommage (Radarr) ─────────────────────────────────────────────────────

  if (ctx.has('rename')) {
    // n° 354 : films de la bibliothèque (titre, année), triés par titre.
    app.get(
      `${base}/renommer`,
      { config, schema: { params: slugParams, response: { 200: renamePageSchema } } },
      async (request) => {
        const row = ctx.instanceOf(request);
        const movies = await instance.cache.library.movies(row.slug, () =>
          radarrClient(instance, row).movies(LIBRARY_TIMEOUT_MS),
        );
        return {
          movies: movies
            .flatMap((movie) =>
              movie.id === null ? [] : [{ id: movie.id, title: movie.title, year: movie.year }],
            )
            .sort((a, b) => a.title.localeCompare(b.title)),
        };
      },
    );

    // n° 355 : propositions (`/rename?movieId=`).
    app.get(
      `${base}/renommer/:movieId/propositions`,
      { config, schema: { params: movieParams, response: { 200: z.array(renameProposalSchema) } } },
      async (request) =>
        (
          await ctx.clientOf(request).list('/api/v3/rename', { movieId: request.params.movieId })
        ).flatMap((proposal) => {
          const existingPath = text(proposal.existingPath);
          const newPath = text(proposal.newPath);
          return existingPath === null || newPath === null
            ? []
            : [{ movieFileId: num(proposal.movieFileId), existingPath, newPath }];
        }),
    );

    // n° 356 : commande `RenameMovie`.
    app.post(
      `${base}/renommer/:movieId/executer`,
      { config, schema: { params: movieParams, response: { 200: arrCommandStartedSchema } } },
      async (request) => ({
        ok: true as const,
        cmdId: await ctx
          .clientOf(request)
          .command('RenameMovie', { movieIds: [request.params.movieId] }),
      }),
    );
  }

  // ── Calendrier (Sonarr) ────────────────────────────────────────────────────

  if (ctx.has('calendar')) {
    // n° 530 : épisodes des 30 prochains jours.
    app.get(
      `${base}/calendrier`,
      { config, schema: { params: slugParams, response: { 200: z.array(calendarEpisodeSchema) } } },
      async (request) => sonarrClient(instance, ctx.instanceOf(request)).calendar(30),
    );
  }
}
