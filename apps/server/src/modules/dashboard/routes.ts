// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Tableau de bord (P4.1) : `DashboardController`, ouvert à tout
// utilisateur connecté, limité aux services et aux instances qu'il peut lire
// (un service illisible est traité comme non configuré). Un endpoint JSON par carte (n° 31 à 42), chargé à part
// par le front : l'échec d'une carte n'affecte pas les autres. Chaque carte
// « échoue ouverte » (forme vide plutôt qu'une erreur) ; un service non
// configuré renvoie `available: false`, qui masque la carte.
//
// Les agrégats coûteux (prochaines sorties, historique d'activité) sont gardés
// 45 s en mémoire, partagés entre cartes et onglets ; un résultat vide n'est
// jamais gardé. Les bibliothèques passent par le cache partagé des pages
// Films/Séries (`modules/media/library.ts`).

import {
  HEALTH_FLAT_SERVICES,
  SERVICE_SETTINGS,
  TORRENT_CLIENTS,
  USENET_CLIENTS,
  addDays,
  dashboardActivitySchema,
  dashboardDisksSchema,
  dashboardDownloadsSchema,
  dashboardEmbySchema,
  dashboardHealthSchema,
  dashboardHeroSchema,
  dashboardPageSchema,
  dashboardRecentSchema,
  dashboardRequestsSchema,
  dashboardTransmissionSchema,
  dashboardTrendingSchema,
  dashboardUpcomingSchema,
  dayInZone,
  quickLookDetailSchema,
  resolveActivitySource,
  type CalendarEpisode,
  type DashboardActivity,
  type DashboardDisks,
  type DashboardDownloads,
  type DashboardHealth,
  type DashboardRequests,
  type Movie,
  type QuickLookDetail,
  type Series,
} from '@hubarr/shared';
import { desc } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { watchlistItems } from '../../db/schema';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { EmbyClient } from '../../integrations/activity/emby';
import { TautulliClient } from '../../integrations/activity/tautulli';
import { TracearrClient } from '../../integrations/activity/tracearr';
import { SeerrClient } from '../../integrations/seerr/client';
import { resultsOf, tmdbImage, tmdbSized, type TmdbClient } from '../../integrations/tmdb/client';
import { httpFor } from '../activity/routes';
import { type FromInstance } from '../calendar/events';
import { int, num, obj, str, text } from '../discover/enrich';
import { tmdbClient } from '../discover/tmdb';
import { getInstanceBySlug, type InstanceRow } from '../instances/instances';
import { collectMovies, collectSeries, type Owned } from '../media/library';
import { apiKeyServiceClient, radarrClient, sonarrClient } from '../services/clients';
import { readDashboardLayout, readResolvedPreferences } from '../settings/preferences';
import { torrentClient } from '../torrents/clients';
import type { AccessScope } from '../users/access-scope';
import { usenetClient } from '../usenet/routes';
import { bytesPerDay, diskUsage, periodStart, type CompletedItem } from './stats';
import {
  MAX_RECOMMENDATIONS,
  MAX_REQUESTS,
  MAX_TRANSMISSION,
  MAX_WATCHLIST,
  UPCOMING_DAYS,
  movieReleaseChips,
  pickHeroSpotlight,
  quickLookExtras,
  recentAdditions,
  seriesReleaseChips,
  tmdbMovieReleaseChips,
  upcomingItems,
} from './widgets';

export const WIDGET_CACHE_TTL_MS = 45_000;
/** Statistiques (téléchargements par jour, disques) : relues au plus toutes les 5 min. */
export const STATS_CACHE_TTL_MS = 300_000;
/** Historique Usenet lu par pages, jusqu'au début de la période ou à la limite. */
const USENET_HISTORY_PAGE = 200;
const USENET_HISTORY_MAX = 2_000;

export interface DashboardRoutesOptions {
  now?: () => number;
}

/** Agrégat gardé 45 s ; un résultat vide expire aussitôt (la carte suivante réessaie). */
async function cached<T>(app: FastifyInstance, key: string, fn: () => Promise<T[]>): Promise<T[]> {
  const full = `dash.${key}`;
  const hit = app.cache.store.get(full);
  if (hit !== undefined) return hit as T[];
  const value = await fn();
  if (value.length > 0) app.cache.store.set(full, value, WIDGET_CACHE_TTL_MS);
  return value;
}

async function fanOut<T>(
  app: FastifyInstance,
  type: 'radarr' | 'sonarr',
  rows: InstanceRow[],
  load: (row: InstanceRow) => Promise<T[]>,
): Promise<FromInstance<T>[]> {
  const lists = await Promise.all(
    rows.map(async (row) => {
      try {
        return { items: await load(row), slug: row.slug, name: row.name };
      } catch (error) {
        app.log.warn({ err: error, instance: row.slug }, `dashboard : calendrier ${type} en échec`);
        return null;
      }
    }),
  );
  return lists.filter((l): l is FromInstance<T> => l !== null);
}

const typeParams = z.object({
  type: z.enum(['movie', 'tv']),
  id: z.coerce.number().int().positive(),
});
const libraryParams = z.object({
  type: z.enum(['movie', 'series']),
  slug: z.string().min(1).max(100),
  id: z.coerce.number().int().positive(),
});

export const dashboardRoutes: FastifyPluginAsync<DashboardRoutesOptions> = async (
  instance,
  options,
) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const nowDate = () => new Date((options.now ?? Date.now)());
  const timezone = () => readResolvedPreferences(instance.db).display_timezone;
  const today = () => dayInZone(nowDate(), timezone()) ?? nowDate().toISOString().slice(0, 10);
  const libraries = (scope: AccessScope) =>
    scope.configured('radarr') || scope.configured('sonarr');
  /** Client TMDB, si TMDB est configuré et lisible par le compte. */
  const tmdb = (scope: AccessScope): TmdbClient | null => {
    if (!scope.can('tmdb', null)) return null;
    const client = tmdbClient(instance);
    return client.configured ? client : null;
  };

  const upcoming = (scope: AccessScope) =>
    cached(instance, `upcoming${scope.cacheKey}`, async () => {
      const at = nowDate();
      const [movies, episodes] = await Promise.all([
        fanOut<Movie>(instance, 'radarr', scope.instances('radarr'), (row) =>
          radarrClient(instance, row).calendar(UPCOMING_DAYS, 0, at),
        ),
        fanOut<CalendarEpisode>(instance, 'sonarr', scope.instances('sonarr'), (row) =>
          sonarrClient(instance, row).calendar(UPCOMING_DAYS, 0, at),
        ),
      ]);
      return upcomingItems(movies, episodes, today());
    });

  const trending = async (scope: AccessScope) => {
    const client = tmdb(scope);
    if (client === null) return [];
    try {
      return resultsOf(await client.trendingAll('week')).slice(0, MAX_RECOMMENDATIONS);
    } catch {
      return [];
    }
  };

  // n° 31 : données de la page (aucun appel à un service : la page s'affiche aussitôt).
  app.get(
    '/api/tableau-de-bord',
    { config: { access: 'user' }, schema: { response: { 200: dashboardPageSchema } } },
    async (request) => {
      const configured = (id: Parameters<AccessScope['configured']>[0]) =>
        request.access.configured(id);
      // La watchlist (TMDB) suit le droit de lecture sur TMDB.
      const watchlist = !request.access.can('tmdb', null)
        ? []
        : instance.db
            .select()
            .from(watchlistItems)
            .orderBy(desc(watchlistItems.addedAt))
            .limit(MAX_WATCHLIST)
            .all();
      return {
        layout: readDashboardLayout(instance.db),
        configured: {
          radarr: configured('radarr'),
          sonarr: configured('sonarr'),
          seerr: configured('seerr'),
          tmdb: configured('tmdb'),
          tautulli: configured('tautulli'),
          transmission: configured('transmission'),
          tracearr: configured('tracearr'),
          emby: configured('emby'),
          downloads: [...TORRENT_CLIENTS, ...USENET_CLIENTS].some((id) => configured(id)),
        },
        watchlist: watchlist.map((w) => ({
          tmdbId: w.tmdbId,
          mediaType: w.mediaType,
          title: w.title,
          poster: tmdbImage(w.posterPath, 'w342'),
          year: w.year,
          vote: w.vote,
        })),
      };
    },
  );

  // n° 32 : derniers ajouts.
  app.get(
    '/api/tableau-de-bord/widget/recent',
    { config: { access: 'user' }, schema: { response: { 200: dashboardRecentSchema } } },
    async (request) => {
      if (!libraries(request.access)) return { available: false, items: [] };
      const [movies, series] = await Promise.all([
        collectMovies(instance, request.access),
        collectSeries(instance, request.access),
      ]);
      return { available: true, items: recentAdditions(movies, series) };
    },
  );

  // n° 33 : tendances TMDB.
  app.get(
    '/api/tableau-de-bord/widget/recommendations',
    { config: { access: 'user' }, schema: { response: { 200: dashboardTrendingSchema } } },
    async (request) => {
      if (tmdb(request.access) === null) return { available: false, items: [] };
      const items = (await trending(request.access)).flatMap((r) => {
        const type =
          r.media_type === 'tv'
            ? ('tv' as const)
            : r.media_type === 'movie'
              ? ('movie' as const)
              : null;
        if (type === null) return [];
        const date = text(r.release_date) ?? text(r.first_air_date);
        return [
          {
            id: int(r.id),
            type,
            title: str(r.title) ?? str(r.name) ?? '',
            year: date !== null && date.length >= 4 ? Number(date.slice(0, 4)) : null,
            poster: tmdbImage(r.poster_path, 'w342'),
            vote: num(r.vote_average),
          },
        ];
      });
      return { available: true, items };
    },
  );

  // n° 34 : prochaines sorties sur 7 jours.
  app.get(
    '/api/tableau-de-bord/widget/upcoming',
    { config: { access: 'user' }, schema: { response: { 200: dashboardUpcomingSchema } } },
    async (request) => {
      const day = today();
      if (!libraries(request.access))
        return { available: false, today: day, days: UPCOMING_DAYS, items: [] };
      const last = addDays(day, UPCOMING_DAYS - 1);
      const items = (await upcoming(request.access)).filter(
        (it) => it.day >= day && it.day <= last,
      );
      return { available: true, today: day, days: UPCOMING_DAYS, items };
    },
  );

  // n° 35 : demandes Seerr en attente (5 au plus), enrichies du titre et de l'affiche.
  app.get(
    '/api/tableau-de-bord/widget/requests',
    { config: { access: 'user' }, schema: { response: { 200: dashboardRequestsSchema } } },
    async (request) => {
      if (!request.access.configured('seerr')) return { available: false, items: [] };
      const items: DashboardRequests['items'] = [];
      try {
        const seerr = new SeerrClient(apiKeyServiceClient(instance, 'seerr'));
        const data = obj(await seerr.requests(MAX_REQUESTS, 0, 'pending', null));
        const results = Array.isArray(data.results) ? data.results : [];
        const client = tmdb(request.access);
        for (const raw of results.slice(0, MAX_REQUESTS)) {
          const req = obj(raw);
          const media = obj(req.media);
          const tmdbId = int(media.tmdbId);
          if (!tmdbId) continue;
          const type = (str(media.mediaType) ?? str(req.type)) === 'tv' ? 'tv' : 'movie';
          let title: string | null = null;
          let poster: string | null = null;
          if (client !== null) {
            const details = await (type === 'tv' ? client.tv(tmdbId) : client.movie(tmdbId)).catch(
              () => ({}),
            );
            const d = obj(details);
            title = str(d.title) ?? str(d.name);
            poster = tmdbImage(d.poster_path, 'w185');
          } else {
            const details = obj(await seerr.tmdb(req));
            title = str(details.title) ?? str(details.name);
            poster = tmdbImage(details.posterPath, 'w185');
          }
          const by = obj(req.requestedBy);
          items.push({
            id: int(req.id),
            type,
            tmdbId,
            title: title ?? `TMDb #${tmdbId}`,
            poster,
            requestedBy: str(by.displayName) ?? str(by.email) ?? '—',
            requestedAt: str(req.createdAt),
          });
        }
      } catch (error) {
        request.log.warn({ err: error }, 'dashboard : demandes Seerr en échec');
      }
      return { available: true, items };
    },
  );

  // n° 36 : pastilles de santé, une par instance Radarr/Sonarr active puis par service.
  app.get(
    '/api/tableau-de-bord/widget/health',
    { config: { access: 'user' }, schema: { response: { 200: dashboardHealthSchema } } },
    async (request) => {
      const monitor = instance.serviceHealth;
      const chips: DashboardHealth['chips'] = [];
      for (const type of ['radarr', 'sonarr'] as const) {
        const rows = request.access.instances(type);
        const states = await Promise.all(
          rows.map((row) =>
            monitor
              .statusFor(type, row.slug)
              .catch(() => ({ status: 'down' as const, latencyMs: null })),
          ),
        );
        rows.forEach((row, i) => {
          const s = states[i];
          if (s?.status)
            chips.push({ id: type, name: row.name, status: s.status, latencyMs: s.latencyMs });
        });
      }
      const services = HEALTH_FLAT_SERVICES.filter((service) => request.access.can(service, null));
      const flat = await Promise.all(
        services.map((service) =>
          monitor.statusFor(service).catch(() => ({ status: null, latencyMs: null })),
        ),
      );
      services.forEach((service, i) => {
        const s = flat[i];
        if (s?.status) {
          chips.push({
            id: service,
            name: SERVICE_SETTINGS[service].label,
            status: s.status,
            latencyMs: s.latencyMs,
          });
        }
      });
      return { chips };
    },
  );

  // n° 37 : activité en cours (Tautulli, ou Tracearr selon la préférence) et historique récent.
  app.get(
    '/api/tableau-de-bord/widget/plex',
    { config: { access: 'user' }, schema: { response: { 200: dashboardActivitySchema } } },
    async (request): Promise<DashboardActivity> => {
      const source = resolveActivitySource(
        readResolvedPreferences(instance.db).display_activity_source,
        (service) => request.access.configured(service),
      );
      if (source === null) return { available: false, source: null, activity: null, history: [] };
      if (source === 'tracearr') {
        const client = new TracearrClient(httpFor(instance, 'tracearr'), instance.cache.store);
        const [activity, history] = await Promise.all([
          client.activity(true, true),
          cached(instance, 'tracearr_history', async () =>
            (await client.history(null, 8).catch(() => ({ rows: [] }))).rows.map((r) => ({
              title: r.title,
              grandparentTitle: null,
              episodeCode: null,
              year: r.year,
              mediaType: r.mediaType,
              poster: r.poster,
              userDisplayName: r.userDisplayName,
              watchedAt: r.watchedAt,
              ratingKey: null,
              quickLook: r.quickLook,
            })),
          ),
        ]);
        return { available: true, source, activity, history };
      }
      const client = new TautulliClient(httpFor(instance, 'tautulli'));
      const [activity, history] = await Promise.all([
        client.activity(true, true),
        cached(instance, 'plex_history', async () =>
          (await client.history(8, 0, '').catch(() => [])).map((r) => ({
            title: r.title,
            grandparentTitle: r.grandparentTitle,
            episodeCode: r.episodeCode,
            year: r.year,
            mediaType: r.mediaType,
            poster: r.poster,
            userDisplayName: r.userDisplayName,
            watchedAt: r.watchedAt,
            ratingKey: r.ratingKey,
            quickLook: null,
          })),
        ),
      ]);
      return { available: true, source, activity, history };
    },
  );

  // n° 38 : Transmission (vitesses, compteurs, téléchargements actifs).
  app.get(
    '/api/tableau-de-bord/widget/transmission',
    { config: { access: 'user' }, schema: { response: { 200: dashboardTransmissionSchema } } },
    async (request) => {
      if (!request.access.configured('transmission'))
        return { available: false, error: false, stats: null, active: [] };
      try {
        const client = torrentClient(instance, 'transmission');
        const torrents = await client.torrents();
        const active = torrents
          .filter((t) => t.state === 'downloading')
          .sort((a, b) => b.dlSpeed - a.dlSpeed)
          .slice(0, MAX_TRANSMISSION);
        return { available: true, error: false, stats: await client.stats(torrents), active };
      } catch (error) {
        request.log.warn({ err: error }, 'dashboard : Transmission en échec');
        return { available: true, error: true, stats: null, active: [] };
      }
    },
  );

  // n° 39 : lecture en cours sur Emby.
  app.get(
    '/api/tableau-de-bord/widget/emby',
    { config: { access: 'user' }, schema: { response: { 200: dashboardEmbySchema } } },
    async (request) => {
      if (!request.access.configured('emby')) return { available: false, activity: null };
      return {
        available: true,
        activity: await new EmbyClient(httpFor(instance, 'emby')).activity(true, true),
      };
    },
  );

  // n° 40 : bandeau (mise en avant, statistiques des bibliothèques, sorties à 7 jours).
  app.get(
    '/api/tableau-de-bord/widget/hero',
    { config: { access: 'user' }, schema: { response: { 200: dashboardHeroSchema } } },
    async (request) => {
      const scope = request.access;
      const [movies, series, trend, coming] = await Promise.all([
        collectMovies(instance, scope),
        collectSeries(instance, scope),
        trending(scope),
        libraries(scope) ? upcoming(scope) : Promise.resolve([]),
      ]);
      return {
        spotlight: pickHeroSpotlight(movies, trend),
        stats: {
          films: movies.length === 0 ? null : movies.length,
          series: series.length === 0 ? null : series.length,
        },
        upcomingCount: coming.length,
      };
    },
  );

  // Lot 13 : octets téléchargés par jour sur 30 jours, d'après les clients configurés et lisibles.
  app.get(
    '/api/tableau-de-bord/widget/downloads',
    { config: { access: 'user' }, schema: { response: { 200: dashboardDownloadsSchema } } },
    async (request): Promise<DashboardDownloads> => {
      const torrents = TORRENT_CLIENTS.filter((id) => request.access.configured(id));
      const usenet = USENET_CLIENTS.filter((id) => request.access.configured(id));
      if (torrents.length + usenet.length === 0)
        return { available: false, days: [], total: 0, average: 0, clients: [] };
      const cacheKey = `dash.downloads${request.access.cacheKey}`;
      const hit = instance.cache.store.get(cacheKey);
      if (hit !== undefined) return hit as DashboardDownloads;
      const since = periodStart(nowDate().getTime());
      const read = async (
        id: DashboardDownloads['clients'][number]['id'],
        load: () => Promise<CompletedItem[]>,
      ) => {
        try {
          return { id, ok: true, items: await load() };
        } catch (error) {
          request.log.warn({ err: error, service: id }, 'dashboard : téléchargements en échec');
          return { id, ok: false, items: [] as CompletedItem[] };
        }
      };
      const results = await Promise.all([
        ...torrents.map((id) =>
          read(id, async () =>
            (await torrentClient(instance, id).torrents())
              .filter((t) => t.progress >= 100)
              .map((t) => ({ completedAt: t.completedOn, bytes: t.size })),
          ),
        ),
        ...usenet.map((id) =>
          read(id, async () => {
            const client = usenetClient(instance, id);
            const items: CompletedItem[] = [];
            // Historique du plus récent au plus ancien : arrêt au début de la période.
            for (let offset = 0; offset < USENET_HISTORY_MAX; offset += USENET_HISTORY_PAGE) {
              const page = await client.historyPage(offset, USENET_HISTORY_PAGE);
              for (const item of page.items)
                if (item.status === 'completed')
                  items.push({ completedAt: item.completedAt, bytes: item.size });
              const oldest = page.items.at(-1)?.completedAt ?? null;
              if (
                page.items.length < USENET_HISTORY_PAGE ||
                offset + USENET_HISTORY_PAGE >= page.total ||
                (oldest !== null && oldest < since)
              )
                break;
            }
            return items;
          }),
        ),
      ]);
      const days = bytesPerDay(
        results.flatMap((r) => r.items),
        today(),
        timezone(),
      );
      const total = days.reduce((sum, d) => sum + d.bytes, 0);
      const value: DashboardDownloads = {
        available: true,
        days,
        total,
        average: days.length === 0 ? 0 : Math.round(total / days.length),
        clients: results.map(({ id, ok }) => ({ id, ok })),
      };
      if (results.every((r) => r.ok)) instance.cache.store.set(cacheKey, value, STATS_CACHE_TTL_MS);
      return value;
    },
  );

  // Lot 13 : disques des dossiers racines Radarr et Sonarr (instances lisibles).
  app.get(
    '/api/tableau-de-bord/widget/disks',
    { config: { access: 'user' }, schema: { response: { 200: dashboardDisksSchema } } },
    async (request): Promise<DashboardDisks> => {
      if (!libraries(request.access)) return { available: false, disks: [], failed: [] };
      const cacheKey = `dash.disks${request.access.cacheKey}`;
      const hit = instance.cache.store.get(cacheKey);
      if (hit !== undefined) return hit as DashboardDisks;
      const rows = [
        ...request.access.instances('radarr').map((row) => ({
          service: 'radarr' as const,
          row,
          client: radarrClient(instance, row),
        })),
        ...request.access.instances('sonarr').map((row) => ({
          service: 'sonarr' as const,
          row,
          client: sonarrClient(instance, row),
        })),
      ];
      const failed: string[] = [];
      const sources = await Promise.all(
        rows.map(async ({ service, row, client }) => {
          try {
            const [disks, roots] = await Promise.all([client.diskSpace(), client.rootFolders()]);
            return {
              service,
              instance: row.name,
              disks,
              roots: roots.map((r) => r.path ?? '').filter((p) => p !== ''),
            };
          } catch (error) {
            request.log.warn({ err: error, instance: row.slug }, 'dashboard : disques en échec');
            failed.push(row.name);
            return null;
          }
        }),
      );
      const value: DashboardDisks = {
        available: true,
        disks: diskUsage(sources.filter((s) => s !== null)),
        failed,
      };
      if (failed.length === 0) instance.cache.store.set(cacheKey, value, STATS_CACHE_TTL_MS);
      return value;
    },
  );

  const quickLookError = () =>
    new ApiError(404, 'NOT_FOUND', { details: { reason: 'dashboard.quicklook.error' } });

  // n° 41 : aperçu rapide d'un titre TMDB (tendances, watchlist).
  app.get(
    '/api/tableau-de-bord/quicklook/tmdb/:type/:id',
    {
      config: { access: 'user' },
      schema: { params: typeParams, response: { 200: quickLookDetailSchema } },
    },
    async (request): Promise<QuickLookDetail> => {
      const client = tmdb(request.access);
      if (client === null) throw quickLookError();
      const { type, id } = request.params;
      const isTv = type === 'tv';
      const data = await (isTv ? client.tv(id) : client.movie(id)).catch(() => ({}));
      if (!int(obj(data).id)) throw quickLookError();
      const d = obj(data);
      const date = str(isTv ? d.first_air_date : d.release_date) ?? '';
      const ended = isTv && ['Ended', 'Canceled'].includes(str(d.status) ?? '');
      const match = await libraryMatch(instance, type, id, request.access);
      const day = today();
      const networks = Array.isArray(d.networks) ? d.networks : [];
      return {
        title: str(d.title) ?? str(d.name) ?? '—',
        year: date.length >= 4 ? Number(date.slice(0, 4)) : null,
        poster: tmdbImage(d.poster_path, 'w342'),
        backdrop: tmdbImage(d.backdrop_path, 'w1280'),
        overview: str(d.overview),
        genres: (Array.isArray(d.genres) ? d.genres : [])
          .map((g) => str(obj(g).name) ?? '')
          .slice(0, 4),
        rating: num(d.vote_average),
        runtime: isTv ? null : num(d.runtime),
        network: isTv ? str(obj(networks[0]).name) : null,
        seasons: isTv ? num(d.number_of_seasons) : null,
        status: match?.status ?? null,
        action: match
          ? { kind: 'manage', type: isTv ? 'series' : 'movie', slug: match.slug, id: match.id }
          : { kind: 'discover', type, id },
        inLibrary: match !== null,
        radarrId: !isTv && match ? match.id : null,
        sonarrId: isTv && match ? match.id : null,
        airStatus: isTv ? (ended ? 'ended' : 'continuing') : null,
        ...quickLookExtras(d, client.locale),
        tmdbId: id,
        tmdbType: type,
        posterPath: str(d.poster_path),
        releaseDates: isTv
          ? seriesReleaseChips(
              text(d.first_air_date),
              str(obj(d.next_episode_to_air).air_date),
              str(obj(d.last_episode_to_air).air_date),
              ended,
              day,
            )
          : tmdbMovieReleaseChips(
              Array.isArray(obj(d.release_dates).results)
                ? (obj(d.release_dates).results as never[])
                : [],
              client.locale,
              day,
            ),
      };
    },
  );

  // n° 42 : aperçu rapide d'un titre d'une bibliothèque (instance exacte).
  app.get(
    '/api/tableau-de-bord/quicklook/:type/:slug/:id',
    {
      config: { access: 'user' },
      schema: { params: libraryParams, response: { 200: quickLookDetailSchema } },
    },
    async (request): Promise<QuickLookDetail> => {
      const { type, slug, id } = request.params;
      if (!request.access.can(type === 'series' ? 'sonarr' : 'radarr', slug))
        throw quickLookError();
      const row = await findLibraryRow(instance, type, slug, id, request.access);
      if (row === null) throw quickLookError();
      const day = today();
      const base = {
        cast: [],
        providers: [],
        trailerKey: null,
        imdbId: row.item.imdbId,
        tmdbId: row.item.tmdbId,
        tmdbType: type === 'series' ? ('tv' as const) : ('movie' as const),
        posterPath: null,
        inLibrary: true,
        action: { kind: 'manage' as const, type, slug: row.slug, id },
      };
      if (row.kind === 'series') {
        const s = row.item;
        const ended = s.ended || s.status === 'ended';
        return {
          ...base,
          title: s.title || '—',
          year: s.year,
          poster: tmdbSized(s.poster, 'w342'),
          backdrop: tmdbSized(s.fanart, 'w1280'),
          overview: s.overview,
          genres: s.genres.slice(0, 4),
          rating: s.ratings,
          runtime: null,
          network: s.network,
          seasons: null,
          status: s.monitored ? 'monitored' : 'missing',
          radarrId: null,
          sonarrId: id,
          airStatus: ended ? 'ended' : 'continuing',
          releaseDates: seriesReleaseChips(
            s.firstAired,
            s.nextAiring,
            s.previousAiring,
            ended,
            day,
          ),
        };
      }
      const m = row.item;
      return {
        ...base,
        title: m.title || '—',
        year: m.year,
        poster: tmdbSized(m.poster, 'w342'),
        backdrop: tmdbSized(m.fanart, 'w1280'),
        overview: m.overview,
        genres: m.genres.slice(0, 4),
        rating: m.ratings,
        runtime: m.runtime,
        network: null,
        seasons: null,
        status: m.hasFile ? 'downloaded' : m.monitored ? 'monitored' : 'missing',
        radarrId: id,
        sonarrId: null,
        airStatus: null,
        releaseDates: movieReleaseChips(m.inCinemasAt, m.digitalAt, m.physicalAt, day),
      };
    },
  );
};

type LibraryRow =
  { kind: 'movie'; item: Movie; slug: string } | { kind: 'series'; item: Series; slug: string };

/**
 * Ligne d'une bibliothèque pour l'aperçu : l'agrégat en cache d'abord (aucun
 * appel sur un dashboard chaud, l'instance demandée de préférence), sinon
 * lecture directe de l'instance.
 */
async function findLibraryRow(
  app: FastifyInstance,
  type: 'movie' | 'series',
  slug: string,
  id: number,
  scope: AccessScope,
): Promise<LibraryRow | null> {
  const pick = <T extends { id: number | null }>(rows: Owned<T>[]): Owned<T> | null =>
    rows.find((r) => r.item.id === id && r.slug === slug) ??
    rows.find((r) => r.item.id === id) ??
    null;
  if (type === 'series') {
    const hit = pick(await collectSeries(app, scope));
    if (hit) return { kind: 'series', item: hit.item, slug: hit.slug };
    const row = getInstanceBySlug(app.db, 'sonarr', slug);
    if (!row?.enabled) return null;
    const item = await sonarrClient(app, row)
      .series(id)
      .catch(() => null);
    return item === null ? null : { kind: 'series', item, slug };
  }
  const hit = pick(await collectMovies(app, scope));
  if (hit) return { kind: 'movie', item: hit.item, slug: hit.slug };
  const row = getInstanceBySlug(app.db, 'radarr', slug);
  if (!row?.enabled) return null;
  const item = await radarrClient(app, row)
    .movie(id)
    .catch(() => null);
  return item === null ? null : { kind: 'movie', item, slug };
}

/** Titre TMDB présent dans une bibliothèque (lien « Gérer » et badge d'état), sinon `null`. */
async function libraryMatch(
  app: FastifyInstance,
  type: 'movie' | 'tv',
  tmdbId: number,
  scope: AccessScope,
): Promise<{ slug: string; id: number; status: 'downloaded' | 'monitored' | 'missing' } | null> {
  if (type === 'movie') {
    const hit = (await collectMovies(app, scope)).find(
      (m) => m.item.tmdbId === tmdbId && m.item.id !== null,
    );
    if (hit?.item.id == null) return null;
    const status = hit.item.hasFile ? 'downloaded' : hit.item.monitored ? 'monitored' : 'missing';
    return { slug: hit.slug, id: hit.item.id, status };
  }
  const hit = (await collectSeries(app, scope)).find(
    (s) => s.item.tmdbId === tmdbId && s.item.id !== null,
  );
  if (hit?.item.id == null) return null;
  return { slug: hit.slug, id: hit.item.id, status: hit.item.monitored ? 'monitored' : 'missing' };
}
