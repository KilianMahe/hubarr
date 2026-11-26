// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Bazarr (P3c.4) : les 14 routes de `BazarrController` et les badges
// de sous-titres des bibliothèques. Droit sur Bazarr (lecture,
// écriture) contrôlé par la garde de service `bazarr`.
//
// Écarts : pages en API JSON (plus de cadre Turbo) ; les
// pages qui lisent l'index ne fetchent jamais Bazarr hors du ping (état
// `warming` sinon) ; erreurs communes (503 injoignable, 502 refus) pour la
// recherche et le téléchargement ; badges servis par
// `GET /api/bazarr/status/{movies,series}` au lieu d'un rendu serveur par
// carte ; corps JSON validés (au lieu d'un formulaire) ; affiches TMDB tirées
// de la bibliothèque en cache, jamais d'URL d'instance.

import {
  bazarrDownloadEpisodeRequestSchema,
  bazarrDownloadMovieRequestSchema,
  bazarrGridSchema,
  bazarrHistorySchema,
  bazarrMovieSubtitlesSchema,
  bazarrOverviewSchema,
  bazarrRefreshSchema,
  bazarrSearchResponseSchema,
  bazarrSeriesDetailSchema,
  bazarrSeriesSubtitlesSchema,
  bazarrStatusMapSchema,
  arrOkSchema,
  type BazarrHistoryItem,
  type BazarrRefresh,
  type BazarrSubtitleResult,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BazarrIndexRefresher } from '../../cache/refreshers/bazarr-index';
import type { ZodTypeProvider } from '../../http/zod';
import { BazarrClient, downloadForm, type BazarrRow } from '../../integrations/bazarr/client';
import { extractLangs } from '../../integrations/bazarr/langs';
import { BAZARR_KEYS, byMissingThenTitle } from '../../integrations/bazarr/subtitle-index';
import { LIBRARY_TIMEOUT_MS } from '../../integrations/radarr/client';
import { LIBRARY_TIMEOUT_MS as SERIES_LIBRARY_TIMEOUT_MS } from '../../integrations/sonarr/client';
import { guardServiceModule } from '../../plugins/access';
import { listEnabledInstances } from '../instances/instances';
import { apiKeyServiceClient, radarrClient, sonarrClient } from '../services/clients';

const BASE = '/api/bazarr';
const config = { service: 'bazarr' as const };
/** Rangée « les plus manquants » de la page d'accueil. */
export const MOST_MISSING_LIMIT = 16;
/** Marqueur de la reconstruction en ligne : couvre son pire cas (2 × 30 s + 2 × 8 s + marge). */
export const INLINE_REFRESH_MARKER = 'bazarr_subtitle_index.inline_refresh';
export const INLINE_REFRESH_TTL_MS = 86_000;

const positiveId = z.coerce.number().int().positive();
const radarrIdParams = z.object({ radarrId: positiveId });
const seriesIdParams = z.object({ seriesId: positiveId });
const episodeIdParams = z.object({ episodeId: positiveId });
const sonarrSeriesIdParams = z.object({ sonarrSeriesId: positiveId });

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const truthy = (value: unknown): boolean =>
  value === true || value === 'True' || value === 'true' || value === '1' || value === 1;
const languageOf = (value: unknown): string | null =>
  typeof value === 'object' && value !== null
    ? (text((value as BazarrRow).name) ??
      text((value as BazarrRow).code2) ??
      text((value as BazarrRow).code3))
    : text(value);

/** Résultat d'une recherche de fournisseur (`renderRows` de la modale d'origine). */
export function subtitleResultOf(row: BazarrRow): BazarrSubtitleResult | null {
  const subtitle = text(row.subtitle);
  if (subtitle === null) return null;
  const release = Array.isArray(row.release_info)
    ? row.release_info.filter((item): item is string => typeof item === 'string').join(', ')
    : (text(row.release_info) ?? '');
  const score =
    num(row.score) ?? (typeof row.score === 'string' ? Number.parseFloat(row.score) : NaN);
  return {
    provider: text(row.provider) ?? '',
    language: languageOf(row.language) ?? '',
    hi: truthy(row.hearing_impaired),
    forced: truthy(row.forced),
    originalFormat: truthy(row.original_format),
    score: Number.isFinite(score) ? score : null,
    release,
    uploader: text(row.uploader),
    subtitle,
  };
}

/** Entrée de l'historique ; date tirée de `raw_timestamp` (secondes) si présent. */
export function historyItemOf(row: BazarrRow, kind: 'movie' | 'episode'): BazarrHistoryItem {
  const title =
    kind === 'movie'
      ? (text(row.title) ?? '—')
      : `${text(row.seriesTitle) ?? '—'} — ${text(row.episodeTitle) ?? '—'}${
          text(row.episode_number) ? ` (${String(row.episode_number)})` : ''
        }`;
  const raw = num(row.raw_timestamp);
  const action = num(row.action) !== null ? String(row.action) : text(row.action);
  return {
    title,
    action,
    provider: text(row.provider),
    language: languageOf(row.language),
    date:
      raw !== null
        ? new Date(raw * 1000).toISOString()
        : (text(row.parsed_timestamp) ?? text(row.timestamp)),
  };
}

export const bazarrRoutes: FastifyPluginAsync = async (instance) => {
  guardServiceModule(instance);
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const clientOf = () => new BazarrClient(apiKeyServiceClient(instance, 'bazarr'));
  const index = () => instance.cache.bazarr;

  /** Affiches TMDB de la bibliothèque de l'instance unique (sinon aucune). */
  async function posters(kind: 'movie' | 'series'): Promise<Map<number, string>> {
    const service = kind === 'movie' ? 'radarr' : 'sonarr';
    const rows = listEnabledInstances(instance.db, service);
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) return new Map();
    try {
      const items: { id?: number | null; poster?: string | null }[] =
        kind === 'movie'
          ? await instance.cache.library.movies(row.slug, () =>
              radarrClient(instance, row).movies(LIBRARY_TIMEOUT_MS),
            )
          : await instance.cache.library.series(row.slug, () =>
              sonarrClient(instance, row).seriesList(SERIES_LIBRARY_TIMEOUT_MS),
            );
      return new Map(
        items.flatMap((item) =>
          typeof item.id === 'number' && typeof item.poster === 'string' && item.poster !== ''
            ? [[item.id, item.poster] as const]
            : [],
        ),
      );
    } catch {
      return new Map();
    }
  }

  // n° 15 : compteurs et « les plus manquants » (ping d'abord : injoignable → 503).
  app.get(BASE, { config, schema: { response: { 200: bazarrOverviewSchema } } }, async () => {
    await clientOf().systemStatus();
    const badges = index().badgeCounts();
    const missing = index().mostMissing();
    const items = missing.items.sort(byMissingThenTitle).slice(0, MOST_MISSING_LIMIT);
    const [moviePosters, seriesPosters] = await Promise.all([posters('movie'), posters('series')]);
    return {
      state:
        badges.state === 'warming' || missing.state === 'warming'
          ? ('warming' as const)
          : ('ready' as const),
      counts: badges.counts,
      mostMissing: items.map((item) => ({
        ...item,
        poster: (item.kind === 'movie' ? moviePosters : seriesPosters).get(item.id) ?? null,
      })),
    };
  });

  // n° 16, 17 : grilles des films et des séries.
  for (const kind of ['movie', 'series'] as const) {
    app.get(
      `${BASE}/${kind === 'movie' ? 'movies' : 'series'}`,
      { config, schema: { response: { 200: bazarrGridSchema } } },
      async () => {
        await clientOf().systemStatus();
        const { state, grid } = kind === 'movie' ? index().movieCards() : index().seriesCards();
        const map = await posters(kind);
        return {
          state,
          languages: grid.languages,
          cards: grid.cards.map((card) => {
            const id = kind === 'movie' ? card.movieId : card.seriesId;
            return { ...card, poster: id === null ? null : (map.get(id) ?? null) };
          }),
        };
      },
    );
  }

  // n° 18 : une liste en échec vaut `null` ; les deux en échec → erreur commune.
  app.get(
    `${BASE}/history`,
    { config, schema: { response: { 200: bazarrHistorySchema } } },
    async () => {
      const client = clientOf();
      await client.systemStatus();
      const [movies, episodes] = await Promise.allSettled([
        client.historyMovies(),
        client.historyEpisodes(),
      ]);
      if (movies.status === 'rejected' && episodes.status === 'rejected') throw movies.reason;
      return {
        movies:
          movies.status === 'fulfilled'
            ? movies.value.map((row) => historyItemOf(row, 'movie'))
            : null,
        episodes:
          episodes.status === 'fulfilled'
            ? episodes.value.map((row) => historyItemOf(row, 'episode'))
            : null,
      };
    },
  );

  // n° 19 : épisodes d'une série ; titre et suivi lus pour cette série seule.
  app.get(
    `${BASE}/series/:seriesId`,
    {
      config,
      schema: { params: seriesIdParams, response: { 200: bazarrSeriesDetailSchema } },
    },
    async (request) => {
      const seriesId = request.params.seriesId;
      const client = clientOf();
      const episodes = await client.episodes(seriesId);
      const series = await client
        .series([seriesId])
        .then((rows) => rows.find((row) => num(row.sonarrSeriesId) === seriesId) ?? null)
        .catch(() => null);
      return {
        seriesId,
        title: series === null ? null : text(series.title),
        tracked:
          series === null ? null : series.profileId !== null && series.profileId !== undefined,
        episodes: episodes.map((row) => ({
          episodeId: num(row.sonarrEpisodeId),
          season: num(row.season),
          episode: num(row.episode),
          title: text(row.title),
          audioLanguages: Array.isArray(row.audio_language)
            ? row.audio_language.flatMap((lang) => languageOf(lang) ?? [])
            : [],
          missing: Array.isArray(row.missing_subtitles) ? row.missing_subtitles.length : 0,
          present: Array.isArray(row.subtitles) ? row.subtitles.length : 0,
        })),
      };
    },
  );

  // n° 20, 21 : recherche manuelle chez les fournisseurs.
  app.get(
    `${BASE}/search/movie/:radarrId`,
    {
      config,
      schema: { params: radarrIdParams, response: { 200: bazarrSearchResponseSchema } },
    },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      const rows = await clientOf().searchMovie(request.params.radarrId);
      return { results: rows.flatMap((row) => subtitleResultOf(row) ?? []) };
    },
  );
  app.get(
    `${BASE}/search/episode/:episodeId`,
    {
      config,
      schema: { params: episodeIdParams, response: { 200: bazarrSearchResponseSchema } },
    },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      const rows = await clientOf().searchEpisode(request.params.episodeId);
      return { results: rows.flatMap((row) => subtitleResultOf(row) ?? []) };
    },
  );

  // n° 22 : langues d'un film (fiche) ; tout échec → non suivi, jamais d'erreur.
  app.get(
    `${BASE}/subtitles/movie/:radarrId`,
    {
      config,
      schema: { params: radarrIdParams, response: { 200: bazarrMovieSubtitlesSchema } },
    },
    async (request) => index().movieLanguagesSingle(request.params.radarrId),
  );

  // n° 23 : langues par épisode ; deux instances Sonarr → non suivi.
  app.get(
    `${BASE}/subtitles/series/:sonarrSeriesId`,
    {
      config,
      schema: { params: sonarrSeriesIdParams, response: { 200: bazarrSeriesSubtitlesSchema } },
    },
    async (request) => {
      if (listEnabledInstances(instance.db, 'sonarr').length !== 1)
        return { tracked: false, episodes: {} };
      const rows = await clientOf()
        .episodes(request.params.sonarrSeriesId)
        .catch(() => []);
      const episodes: Record<string, ReturnType<typeof extractLangs>> = {};
      for (const row of rows) {
        const id = num(row.sonarrEpisodeId);
        if (id !== null) episodes[id] = extractLangs(row);
      }
      return { tracked: true, episodes };
    },
  );

  // n° 24 : téléchargement ; le film est relu et corrigé en place.
  app.post(
    `${BASE}/download/movie`,
    { config, schema: { body: bazarrDownloadMovieRequestSchema, response: { 200: arrOkSchema } } },
    async (request) => {
      const { radarrId, ...options } = request.body;
      await clientOf().downloadMovie(downloadForm({ radarrid: radarrId }, options));
      await index().refreshItem('movie', radarrId);
      index().requestRefresh(BAZARR_KEYS.badges);
      return { ok: true as const };
    },
  );

  // n° 25 : Bazarr exige la série avec l'épisode ; la série est corrigée en place.
  app.post(
    `${BASE}/download/episode`,
    {
      config,
      schema: { body: bazarrDownloadEpisodeRequestSchema, response: { 200: arrOkSchema } },
    },
    async (request) => {
      const { seriesId, episodeId, ...options } = request.body;
      await clientOf().downloadEpisode(
        downloadForm({ seriesid: seriesId, episodeid: episodeId }, options),
      );
      await index().refreshItem('series', seriesId);
      index().requestRefresh(BAZARR_KEYS.badges);
      return { ok: true as const };
    },
  );

  // n° 26, 27 : recherche automatique des manquants (asynchrone chez Bazarr).
  app.post(
    `${BASE}/auto/movie/:radarrId`,
    { config, schema: { params: radarrIdParams, response: { 200: arrOkSchema } } },
    async (request) => {
      const id = request.params.radarrId;
      await clientOf().searchMissingMovie(id);
      await index().refreshItem('movie', id);
      return { ok: true as const };
    },
  );
  app.post(
    `${BASE}/auto/series/:seriesId`,
    { config, schema: { params: seriesIdParams, response: { 200: arrOkSchema } } },
    async (request) => {
      const id = request.params.seriesId;
      await clientOf().searchMissingSeries(id);
      await index().refreshItem('series', id);
      return { ok: true as const };
    },
  );

  // n° 28 : reconstruction en ligne (bouton « Réessayer » du préchauffage), bilan fidèle.
  // Index de Hubarr seulement, Bazarr n'est pas modifié : ouverte au droit de lecture.
  app.post(
    `${BASE}/refresh`,
    {
      config: { ...config, permission: 'read' },
      schema: { response: { 200: bazarrRefreshSchema } },
    },
    async () => {
      const states = (): Pick<BazarrRefresh, 'movies' | 'series' | 'badges'> => ({
        movies: index().datasetState(BAZARR_KEYS.movies),
        series: index().datasetState(BAZARR_KEYS.series),
        badges: index().datasetState(BAZARR_KEYS.badges),
      });
      if (instance.upstream.health.isDown('bazarr')) {
        return { ok: false, ...states(), reason: 'breaker_open' as const };
      }
      const store = instance.cache.store;
      if (store.has(INLINE_REFRESH_MARKER)) {
        return { ok: false, ...states(), reason: 'already_running' as const };
      }
      store.set(INLINE_REFRESH_MARKER, true, INLINE_REFRESH_TTL_MS);
      const refresher = new BazarrIndexRefresher({
        index: index(),
        health: instance.upstream.health,
        client: clientOf,
        logger: instance.log,
      });
      await refresher.refresh(BAZARR_KEYS.movies);
      await refresher.refresh(BAZARR_KEYS.badges);
      await refresher.refresh(BAZARR_KEYS.series);
      const result = states();
      const ok =
        result.movies === 'fresh' && result.series === 'fresh' && result.badges === 'fresh';
      return { ok, ...result, reason: ok ? null : ('fetch_failed' as const) };
    },
  );

  // Badges des bibliothèques (Hubarr) : lecture de l'index, sans appel à Bazarr.
  app.get(
    `${BASE}/status/movies`,
    { config, schema: { response: { 200: bazarrStatusMapSchema } } },
    async () => index().movieStatusMap(),
  );
  app.get(
    `${BASE}/status/series`,
    { config, schema: { response: { 200: bazarrStatusMapSchema } } },
    async () => index().seriesStatusMap(),
  );
};
