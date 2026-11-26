// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Découverte (P4.4) : les routes de `TmdbController` sous
// `/api/decouverte` (R1), ouvertes à tout utilisateur connecté (`ROLE_USER`),
// derrière la garde du service TMDB comme toutes les routes `tmdb_*` de
// l'original (watchlist comprise).
//
// Écarts :
// - les pages `/decouverte` et `/decouverte/watchlist` deviennent des vues Vue
//   alimentées par `GET /api/decouverte` (accueil) et
//   `GET /api/decouverte/watchlist` ; `/decouverte/explorer` n'a pas de
//   données propres ;
// - erreurs au format commun (`NOT_FOUND`, `VALIDATION` avec la clé
//   d'origine) au lieu de `{ error: <texte traduit> }` ;
// - la watchlist exige le jeton CSRF (mutations) ;
// - le statut de la watchlist est une liste de clés `<type>_<tmdbId>`.

import {
  collectionSchema,
  collectionSearchSchema,
  discoverFilterQuerySchema,
  discoverHomeSchema,
  discoverSectionSchema,
  folderSuggestionsSchema,
  genresResponseSchema,
  myRecommendationsSchema,
  okResponseSchema,
  personSchema,
  personSearchSchema,
  popularByYearSchema,
  popularYearParamsSchema,
  resolvedMediaSchema,
  smartSearchQuerySchema,
  smartSearchSchema,
  textQuerySchema,
  tmdbDetailSchema,
  tmdbMediaTypeSchema,
  tmdbPageSchema,
  tmdbSuggestionsSchema,
  watchlistNotesRequestSchema,
  watchlistResponseSchema,
  watchlistStatusSchema,
  watchlistToggleRequestSchema,
  watchlistToggleResponseSchema,
  watchedSuggestionsSchema,
  type AddCandidate,
  type LibraryOwner,
  type TmdbCard,
} from '@hubarr/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { watchlistItems } from '../../db/schema';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import {
  resultsOf,
  tmdbImage,
  type TmdbClient,
  type TmdbRaw,
} from '../../integrations/tmdb/client';
import { defaultQualityProfileIdOf } from '../instances/instances';
import { recentWatchedTitles, watchedOf } from '../tracearr-watch/sync';
import type { AccessScope } from '../users/access-scope';
import { findUserById } from '../users/users';
import {
  buildLibraryIndex,
  collectMovies,
  collectSeries,
  seriesLibStatus,
  type LibraryIndex,
} from '../media/library';
import {
  buildDetail,
  enrich,
  int,
  num,
  obj,
  objects,
  str,
  text,
  toCard,
  yearFromDate,
} from './enrich';
import { FolderSuggestions } from './folders';
import { rankRecommendations, type Seed as RecSeed } from './personal';
import { animeDiscoverParams } from '../search/ranker';
import { smartSearch } from './smart-search';
import { suggestionRows } from './suggestions';
import { tmdbClient } from './tmdb';

const config = { service: 'tmdb' as const };
const typeParams = z.object({ type: tmdbMediaTypeSchema, id: z.coerce.number().int().positive() });
const idParams = z.object({ id: z.coerce.number().int().positive() });

const notFound = (key: string) =>
  new ApiError(404, 'NOT_FOUND', { service: 'tmdb', details: { reason: key } });

function pageOf(data: TmdbRaw, page: number) {
  return {
    page: num(data.page) ?? page,
    totalPages: num(data.total_pages) ?? 1,
    totalResults: num(data.total_results) ?? 0,
  };
}

/** Instances proposées à l'ajout : celles où le compte peut écrire. */
function candidates(scope: AccessScope, type: 'radarr' | 'sonarr'): AddCandidate[] {
  return scope.instances(type, 'write').map((row) => ({
    slug: row.slug,
    name: row.name,
    isDefault: row.isDefault,
    defaultQualityProfileId: defaultQualityProfileIdOf(row),
  }));
}

/** Instances Radarr qui possèdent le film (toutes, pas seulement la première). */
async function movieOwners(
  app: FastifyInstance,
  tmdbId: number,
  scope: AccessScope,
): Promise<LibraryOwner[]> {
  const owners: LibraryOwner[] = [];
  const seen = new Set<string>();
  for (const { item, slug, instanceName } of await collectMovies(app, scope)) {
    if (item.tmdbId !== tmdbId || item.id === null || seen.has(slug)) continue;
    seen.add(slug);
    owners.push({
      slug,
      name: instanceName,
      id: item.id,
      status: item.hasFile ? 'downloaded' : item.monitored ? 'missing' : 'unmonitored',
    });
  }
  return owners;
}

/** Instances Sonarr qui possèdent la série (par id TheTVDB, ou TMDB à défaut). */
async function seriesOwners(
  app: FastifyInstance,
  tvdbId: number,
  tmdbId: number,
  scope: AccessScope,
): Promise<LibraryOwner[]> {
  const owners: LibraryOwner[] = [];
  const seen = new Set<string>();
  for (const { item, slug, instanceName } of await collectSeries(app, scope)) {
    const match = (tvdbId > 0 && item.tvdbId === tvdbId) || (tmdbId > 0 && item.tmdbId === tmdbId);
    if (!match || item.id === null || seen.has(slug)) continue;
    seen.add(slug);
    const status = seriesLibStatus(item);
    owners.push({
      slug,
      name: instanceName,
      id: item.id,
      status: status === 'announced' ? 'missing' : status,
    });
  }
  return owners;
}

interface Seed {
  type: 'movie' | 'tv';
  id: number;
}

/** Recommandations personnelles (`myRecommendations`). */
async function myRecommendations(
  app: FastifyInstance,
  tmdb: TmdbClient,
  index: LibraryIndex,
  scope: AccessScope,
) {
  const latest = <T extends { tmdbId: number | null; added: string }>(rows: T[]) => {
    const seen = new Set<number>();
    return rows
      .filter((r) => {
        if (!r.tmdbId || seen.has(r.tmdbId)) return false;
        seen.add(r.tmdbId);
        return true;
      })
      .sort((a, b) => b.added.localeCompare(a.added))
      .slice(0, 8);
  };
  const [movies, series] = await Promise.all([
    collectMovies(app, scope),
    collectSeries(app, scope),
  ]);
  const seeds: Seed[] = [
    ...latest(movies.map(({ item }) => ({ tmdbId: item.tmdbId, added: item.addedAt ?? '' }))).map(
      (r) => ({ type: 'movie' as const, id: r.tmdbId ?? 0 }),
    ),
    ...latest(series.map(({ item }) => ({ tmdbId: item.tmdbId, added: item.addedAt ?? '' }))).map(
      (r) => ({ type: 'tv' as const, id: r.tmdbId ?? 0 }),
    ),
  ];
  if (seeds.length === 0) return { results: [], movies: [], tv: [], seeds: 0 };

  interface Agg {
    item: TmdbRaw;
    type: 'movie' | 'tv';
    score: number;
    hits: number;
  }
  const aggregated = new Map<string, Agg>();
  const lists = await Promise.all(
    seeds.map((seed) =>
      seed.type === 'movie' ? tmdb.movieRecommendations(seed.id) : tmdb.tvRecommendations(seed.id),
    ),
  );
  seeds.forEach((seed, i) => {
    for (const r of resultsOf(lists[i]).slice(0, 15)) {
      const id = int(r.id);
      if (!id) continue;
      if (seed.type === 'movie' && index.movie.has(id)) continue;
      if (seed.type === 'tv' && index.tv.has(`tmdb_${id}`)) continue;
      const key = `${seed.type}_${id}`;
      const agg = aggregated.get(key) ?? { item: r, type: seed.type, score: 0, hits: 0 };
      agg.score += (num(r.vote_average) ?? 0) + (num(r.popularity) ?? 0) / 50;
      agg.hits += 1;
      aggregated.set(key, agg);
    }
  });
  const sorted = [...aggregated.values()].sort((a, b) => b.hits - a.hits || b.score - a.score);
  const card = (x: Agg) => toCard(x.item, index, x.type);
  const cards = (list: Agg[]) => list.map(card).filter((c): c is TmdbCard => c !== null);
  const moviesList = cards(sorted.filter((x) => x.type === 'movie').slice(0, 40));
  const tvList = cards(sorted.filter((x) => x.type === 'tv').slice(0, 40));

  // Moins de 20 titres : complément par les populaires absents de la bibliothèque.
  const topUp = async (list: TmdbCard[], type: 'movie' | 'tv') => {
    if (list.length >= 20) return;
    const ids = new Set(list.map((c) => c.id));
    const popular = resultsOf(
      type === 'movie' ? await tmdb.popularMovies() : await tmdb.popularTv(),
    );
    for (const p of popular) {
      if (list.length >= 40) break;
      const id = int(p.id);
      if (!id || ids.has(id)) continue;
      if (type === 'movie' ? index.movie.has(id) : index.tv.has(`tmdb_${id}`)) continue;
      const c = toCard(p, index, type);
      if (c !== null) list.push(c);
      ids.add(id);
    }
  };
  await topUp(moviesList, 'movie');
  await topUp(tvList, 'tv');
  return {
    results: cards(sorted.slice(0, 40)),
    movies: moviesList,
    tv: tvList,
    seeds: seeds.length,
  };
}

/** Titres regardés qui servent de point de départ, cartes affichées. */
const WATCHED_SEEDS = 12;
const WATCHED_SHOWN = 20;

/**
 * « D'après ce que vous avez regardé » (lot 8) : recommandations des derniers
 * titres regardés (lectures Tracearr synchronisées), sans les titres déjà
 * vus. Les titres en bibliothèque restent proposés, marqués : on peut avoir
 * un film sans l'avoir regardé.
 */
async function watchedSuggestions(
  app: FastifyInstance,
  tmdb: TmdbClient,
  index: LibraryIndex,
  tracearrUserId: string,
) {
  const seeds: RecSeed[] = [];
  for (const title of recentWatchedTitles(app.db, tracearrUserId, WATCHED_SEEDS)) {
    let id = title.tmdbId ?? 0;
    if (!id && title.mediaType === 'tv' && title.tvdbId !== null) {
      id = (await tmdb.findTmdbIdByTvdbId(title.tvdbId)) ?? 0;
    }
    if (id > 0) seeds.push({ type: title.mediaType, id });
  }
  if (seeds.length === 0) return { linked: true, seeds: 0, results: [] };
  const watched = watchedOf(app.db, tracearrUserId);
  const seenMovies = new Set(watched.movies);
  const seenShows = new Set(watched.shows.flatMap((show) => show.tmdbId ?? []));
  const lists = await Promise.all(
    seeds.map((seed) =>
      seed.type === 'movie' ? tmdb.movieRecommendations(seed.id) : tmdb.tvRecommendations(seed.id),
    ),
  );
  const ranked = rankRecommendations(seeds, lists.map(resultsOf), (type, id) =>
    type === 'movie' ? seenMovies.has(id) : seenShows.has(id),
  );
  return {
    linked: true,
    seeds: seeds.length,
    results: ranked
      .slice(0, WATCHED_SHOWN)
      .map((rec) => toCard(rec.item, index, rec.type))
      .filter((card): card is TmdbCard => card !== null),
  };
}

export const discoverRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tmdb = () => tmdbClient(instance);
  const libraryIndex = (client: TmdbClient, scope: AccessScope) =>
    buildLibraryIndex(instance, client, scope);

  // n° 550 : accueil de la découverte (données de la page d'origine).
  app.get(
    '/api/decouverte',
    { config, schema: { response: { 200: discoverHomeSchema } } },
    async (request) => {
      const client = tmdb();
      const empty = {
        error: true,
        heroMovie: null,
        heroTv: null,
        trending: [],
        popMovies: [],
        popTv: [],
        upcoming: [],
        onAir: [],
        topMovies: [],
        topTv: [],
      };
      try {
        const [index, trendingRaw] = await Promise.all([
          libraryIndex(client, request.access),
          client.trendingAll(),
        ]);
        if (!Array.isArray(trendingRaw.results)) return empty;
        const [tm, tt, pm, pt, up, oa, topM, topT] = await Promise.all([
          client.trendingMovies(),
          client.trendingTv(),
          client.popularMovies(),
          client.popularTv(),
          client.upcomingMovies(),
          client.onTheAirTv(),
          client.topRatedMovies(),
          client.topRatedTv(),
        ]);
        const trendingMovies = enrich(resultsOf(tm), index, 'movie');
        const trendingTv = enrich(resultsOf(tt), index, 'tv');
        return {
          error: false,
          heroMovie: trendingMovies[0] ?? null,
          heroTv: trendingTv[0] ?? null,
          trending: enrich(resultsOf(trendingRaw), index),
          popMovies: enrich(resultsOf(pm), index, 'movie'),
          popTv: enrich(resultsOf(pt), index, 'tv'),
          upcoming: enrich(resultsOf(up), index, 'movie'),
          onAir: enrich(resultsOf(oa), index, 'tv'),
          topMovies: enrich(resultsOf(topM), index, 'movie'),
          topTv: enrich(resultsOf(topT), index, 'tv'),
        };
      } catch (error) {
        request.log.warn({ err: error }, 'découverte : accueil en échec');
        return empty;
      }
    },
  );

  // n° 551 : une section, paginée.
  app.get(
    '/api/decouverte/section/:type',
    {
      config,
      schema: {
        params: z.object({ type: discoverSectionSchema }),
        querystring: z.object({ page: z.coerce.number().int().min(1).max(500).catch(1) }),
        response: { 200: tmdbPageSchema },
      },
    },
    async (request) => {
      const client = tmdb();
      const { page } = request.query;
      const loaders: Record<string, [() => Promise<TmdbRaw>, 'movie' | 'tv' | null]> = {
        trending: [() => client.trendingAll(), null],
        'trending-movies': [() => client.trendingMovies(), 'movie'],
        'trending-tv': [() => client.trendingTv(), 'tv'],
        'popular-movies': [() => client.popularMovies(page), 'movie'],
        'popular-tv': [() => client.popularTv(page), 'tv'],
        upcoming: [() => client.upcomingMovies(page), 'movie'],
        'on-air': [() => client.onTheAirTv(page), 'tv'],
        'top-movies': [() => client.topRatedMovies(page), 'movie'],
        'top-tv': [() => client.topRatedTv(page), 'tv'],
        'now-playing': [() => client.nowPlayingMovies(page), 'movie'],
        'airing-today': [() => client.airingTodayTv(page), 'tv'],
      };
      const [load, type] = loaders[request.params.type] ?? [() => client.trendingAll(), null];
      const [index, data] = await Promise.all([libraryIndex(client, request.access), load()]);
      return { results: enrich(resultsOf(data), index, type), ...pageOf(data, page) };
    },
  );

  // n° 552 : recommandations personnelles d'après les derniers ajouts.
  app.get(
    '/api/decouverte/mes-recommandations',
    { config, schema: { response: { 200: myRecommendationsSchema } } },
    async (request) => {
      const client = tmdb();
      return myRecommendations(
        instance,
        client,
        await libraryIndex(client, request.access),
        request.access,
      );
    },
  );

  // Lot 8 : une rangée par dossier racine Radarr/Sonarr (calcul en cache).
  app.get(
    '/api/decouverte/dossiers',
    { config, schema: { response: { 200: folderSuggestionsSchema } } },
    async (request) => {
      const client = tmdb();
      const [folders, index] = await Promise.all([
        instance.cache.folders.read(),
        libraryIndex(client, request.access),
      ]);
      // Dossiers des seules instances lisibles (clé `service:slug:chemin`).
      const visible = folders.filter((folder) => {
        const slug = folder.key.slice(folder.service.length + 1).split(':')[0] ?? '';
        return request.access.can(folder.service, slug);
      });
      return { folders: FolderSuggestions.present(visible, index) };
    },
  );

  // Lot 8 : d'après les lectures récentes (Tracearr) de l'utilisateur connecté.
  app.get(
    '/api/decouverte/regardes',
    { config, schema: { response: { 200: watchedSuggestionsSchema } } },
    async (request) => {
      const user = request.user === null ? undefined : findUserById(app.db, request.user.id);
      const tracearrUserId = user?.tracearrUserId ?? null;
      if (tracearrUserId === null) return { linked: false, seeds: 0, results: [] };
      const client = tmdb();
      return watchedSuggestions(
        instance,
        client,
        await libraryIndex(client, request.access),
        tracearrUserId,
      );
    },
  );

  // Lot 8 : les plus populaires d'une année, films et séries.
  app.get(
    '/api/decouverte/annee/:year',
    {
      config,
      schema: { params: popularYearParamsSchema, response: { 200: popularByYearSchema } },
    },
    async (request) => {
      const client = tmdb();
      const { year } = request.params;
      const [index, moviesRaw, tvRaw] = await Promise.all([
        libraryIndex(client, request.access),
        client.discoverMovies({ primary_release_year: year, sort_by: 'popularity.desc' }),
        client.discoverTv({ first_air_date_year: year, sort_by: 'popularity.desc' }),
      ]);
      return {
        year,
        movies: enrich(resultsOf(moviesRaw), index, 'movie'),
        tv: enrich(resultsOf(tvRaw), index, 'tv'),
      };
    },
  );

  // n° 553 : exploration filtrée (`/discover`).
  app.get(
    '/api/decouverte/filter',
    {
      config,
      schema: { querystring: discoverFilterQuerySchema, response: { 200: tmdbPageSchema } },
    },
    async (request) => {
      const client = tmdb();
      const q = request.query;
      const movie = q.type === 'movie';
      const params: Record<string, string | number> = { page: q.page };
      if (q.genres) params.with_genres = q.genres;
      if (q.anime === '1' || q.anime === 'true' || q.anime === 'on') {
        Object.assign(params, animeDiscoverParams(q.genres));
      }
      if (q.year_min)
        params[movie ? 'primary_release_date.gte' : 'first_air_date.gte'] = `${q.year_min}-01-01`;
      if (q.year_max)
        params[movie ? 'primary_release_date.lte' : 'first_air_date.lte'] = `${q.year_max}-12-31`;
      if (q.vote_min) params['vote_average.gte'] = q.vote_min;
      if (q.vote_count_min) params['vote_count.gte'] = q.vote_count_min;
      if (q.sort) params.sort_by = q.sort;
      const [index, data] = await Promise.all([
        libraryIndex(client, request.access),
        movie ? client.discoverMovies(params) : client.discoverTv(params),
      ]);
      return { results: enrich(resultsOf(data), index, q.type), ...pageOf(data, 1) };
    },
  );

  // n° 554 : genres.
  app.get(
    '/api/decouverte/genres/:type',
    {
      config,
      schema: {
        params: z.object({ type: tmdbMediaTypeSchema }),
        response: { 200: genresResponseSchema },
      },
    },
    async (request) => {
      const client = tmdb();
      const data =
        request.params.type === 'movie' ? await client.genresMovies() : await client.genresTv();
      return {
        genres: objects(data.genres).map((g) => ({ id: int(g.id), name: str(g.name) ?? '' })),
      };
    },
  );

  // n° 555 : résolution pour l'ajout rapide (propriétaires et instances candidates).
  app.get(
    '/api/decouverte/resolve/:type/:id',
    { config, schema: { params: typeParams, response: { 200: resolvedMediaSchema } } },
    async (request) => {
      const client = tmdb();
      const { type, id } = request.params;
      const detail = type === 'movie' ? await client.movie(id) : await client.tv(id);
      if (!int(detail.id)) throw notFound('decouverte.error.not_found_tmdb');
      const poster = tmdbImage(detail.poster_path, 'w342');
      if (type === 'movie') {
        const tmdbId = int(detail.id);
        const owners = await movieOwners(instance, tmdbId, request.access);
        return {
          type: 'film' as const,
          id: tmdbId,
          tmdbId,
          title: str(detail.title) ?? '',
          year: yearFromDate(str(detail.release_date)) ?? 0,
          poster,
          inLibrary: owners.length > 0,
          instances: owners,
          candidates: candidates(request.access, 'radarr'),
        };
      }
      const tvdbId = int(obj(detail.external_ids).tvdb_id);
      if (!tvdbId) {
        throw new ApiError(422, 'VALIDATION', {
          service: 'tmdb',
          details: [{ path: 'tvdbId', message: 'decouverte.error.not_found_thetvdb' }],
        });
      }
      // Anime : genre Animation (16) d'origine japonaise.
      const genres = objects(detail.genres).map((g) => int(g.id));
      const origin = Array.isArray(detail.origin_country) ? detail.origin_country : [];
      const isAnime = genres.includes(16) && origin.includes('JP');
      const owners = await seriesOwners(instance, tvdbId, int(detail.id), request.access);
      return {
        type: 'serie' as const,
        id: tvdbId,
        tvdbId,
        tmdbId: int(detail.id),
        title: str(detail.name) ?? '',
        year: yearFromDate(str(detail.first_air_date)) ?? 0,
        poster,
        inLibrary: owners.length > 0,
        instances: owners,
        candidates: candidates(request.access, 'sonarr'),
        seriesType: isAnime ? ('anime' as const) : ('standard' as const),
      };
    },
  );

  // n° 556 : fiche détaillée.
  app.get(
    '/api/decouverte/detail/:type/:id',
    { config, schema: { params: typeParams, response: { 200: tmdbDetailSchema } } },
    async (request) => {
      const client = tmdb();
      const { type, id } = request.params;
      const [d, index, similarRaw] = await Promise.all([
        type === 'movie' ? client.movie(id) : client.tv(id),
        libraryIndex(client, request.access),
        type === 'movie' ? client.movieSimilar(id) : client.tvSimilar(id),
      ]);
      if (!int(d.id)) throw notFound('decouverte.error.not_found');
      return {
        ...buildDetail(d, type, index, client.locale),
        similar: enrich(resultsOf(similarRaw).slice(0, 16), index, type),
      };
    },
  );

  // Suggestions de la fiche Hubarr d'un film ou d'une série (id TMDB).
  app.get(
    '/api/decouverte/suggestions/:type/:id',
    { config, schema: { params: typeParams, response: { 200: tmdbSuggestionsSchema } } },
    async (request) => {
      const client = tmdb();
      const { type, id } = request.params;
      const [index, recRaw, simRaw] = await Promise.all([
        libraryIndex(client, request.access),
        type === 'movie' ? client.movieRecommendations(id) : client.tvRecommendations(id),
        type === 'movie' ? client.movieSimilar(id) : client.tvSimilar(id),
      ]);
      return suggestionRows(
        enrich(resultsOf(recRaw), index, type),
        enrich(resultsOf(simRaw), index, type),
        id,
      );
    },
  );

  // n° 557 : recherche simple (`/search/multi`, films et séries).
  app.get(
    '/api/decouverte/search',
    { config, schema: { querystring: textQuerySchema, response: { 200: tmdbPageSchema } } },
    async (request) => {
      const q = request.query.q.trim();
      if (q.length < 2) return { results: [], page: 1, totalPages: 1, totalResults: 0 };
      const client = tmdb();
      const [index, data] = await Promise.all([
        libraryIndex(client, request.access),
        client.searchMulti(q, request.query.page),
      ]);
      const results = resultsOf(data).filter(
        (r) => r.media_type === 'movie' || r.media_type === 'tv',
      );
      return { results: enrich(results, index), ...pageOf(data, 1) };
    },
  );

  // n° 558 : recherche de la page (classement, correction, personnes, exploration).
  app.get(
    '/api/decouverte/recherche',
    {
      config,
      schema: { querystring: smartSearchQuerySchema, response: { 200: smartSearchSchema } },
    },
    async (request) => {
      const client = tmdb();
      try {
        return await smartSearch(
          client,
          await libraryIndex(client, request.access),
          request.query,
          {
            vocabulary: () => instance.cache.vocabulary.read(),
          },
        );
      } catch (error) {
        request.log.warn({ err: error }, 'découverte : recherche en échec');
        throw new ApiError(502, 'UPSTREAM_ERROR', { service: 'tmdb' });
      }
    },
  );

  // n° 560 : recherche de collections.
  app.get(
    '/api/decouverte/collection/search',
    { config, schema: { querystring: textQuerySchema, response: { 200: collectionSearchSchema } } },
    async (request) => {
      const q = request.query.q.trim();
      if (q.length < 2) return { results: [] };
      const data = await tmdb().searchCollection(q);
      return {
        results: resultsOf(data)
          .slice(0, 10)
          .map((c) => ({
            id: int(c.id),
            name: str(c.name) ?? '',
            poster: tmdbImage(c.poster_path, 'w92'),
          })),
      };
    },
  );

  // n° 561 : une collection.
  app.get(
    '/api/decouverte/collection/:id',
    { config, schema: { params: idParams, response: { 200: collectionSchema } } },
    async (request) => {
      const client = tmdb();
      const data = await client.collection(request.params.id);
      const parts = objects(data.parts);
      if (parts.length === 0) throw notFound('decouverte.error.collection_not_found');
      const index = await libraryIndex(client, request.access);
      return {
        name: str(data.name) ?? '',
        poster: tmdbImage(data.poster_path, 'w342'),
        results: enrich(parts, index, 'movie'),
      };
    },
  );

  // n° 562 : recherche de personnes.
  app.get(
    '/api/decouverte/person/search',
    { config, schema: { querystring: textQuerySchema, response: { 200: personSearchSchema } } },
    async (request) => {
      const q = request.query.q.trim();
      if (q.length < 2) return { results: [] };
      const data = await tmdb().searchPerson(q);
      return {
        results: resultsOf(data)
          .slice(0, 8)
          .map((p) => ({
            id: int(p.id),
            name: str(p.name) ?? '',
            profile: tmdbImage(p.profile_path, 'w185'),
            known: str(p.known_for_department) ?? '',
          })),
      };
    },
  );

  // n° 563 : une personne et sa filmographie (distribution et équipe, dédoublonnées).
  app.get(
    '/api/decouverte/person/:id',
    { config, schema: { params: idParams, response: { 200: personSchema } } },
    async (request) => {
      const client = tmdb();
      const [person, credits] = await Promise.all([
        client.person(request.params.id),
        client.personCombinedCredits(request.params.id),
      ]);
      if (Object.keys(person).length === 0 || Object.keys(credits).length === 0) {
        throw notFound('decouverte.error.person_not_found');
      }
      const seen = new Set<string>();
      const items = [...objects(credits.cast), ...objects(credits.crew)].filter((c) => {
        if (c.media_type !== 'movie' && c.media_type !== 'tv') return false;
        const key = `${str(c.media_type) ?? ''}_${int(c.id)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      items.sort((a, b) => (num(b.popularity) ?? 0) - (num(a.popularity) ?? 0));
      return {
        name: str(person.name) ?? '',
        profile: tmdbImage(person.profile_path, 'w342'),
        bio: text(person.biography),
        results: enrich(items.slice(0, 40), await libraryIndex(client, request.access)),
      };
    },
  );

  // ── Watchlist (n° 564-568) ───────────────────────────────────────────────
  app.get(
    '/api/decouverte/watchlist',
    { config, schema: { response: { 200: watchlistResponseSchema } } },
    async (request) => {
      const rows = instance.db
        .select()
        .from(watchlistItems)
        .orderBy(desc(watchlistItems.addedAt))
        .all();
      const index = await libraryIndex(tmdb(), request.access);
      return {
        items: rows.map((w) => ({
          id: w.id,
          tmdbId: w.tmdbId,
          type: w.mediaType,
          title: w.title,
          poster: tmdbImage(w.posterPath, 'w342'),
          posterPath: w.posterPath,
          vote: w.vote,
          year: w.year,
          addedAt: w.addedAt.toISOString(),
          notes: w.notes,
          inLibrary:
            w.mediaType === 'movie' ? index.movie.has(w.tmdbId) : index.tv.has(`tmdb_${w.tmdbId}`),
        })),
      };
    },
  );

  app.post(
    '/api/decouverte/watchlist/toggle',
    {
      config,
      schema: {
        body: watchlistToggleRequestSchema,
        response: { 200: watchlistToggleResponseSchema },
      },
    },
    async (request) => {
      const { tmdbId, type, title, posterPath, vote, year } = request.body;
      const where = and(eq(watchlistItems.tmdbId, tmdbId), eq(watchlistItems.mediaType, type));
      const existing = instance.db.select().from(watchlistItems).where(where).get();
      if (existing !== undefined) {
        instance.db.delete(watchlistItems).where(eq(watchlistItems.id, existing.id)).run();
        return { action: 'removed' as const, tmdbId, type };
      }
      const row = instance.db
        .insert(watchlistItems)
        .values({
          tmdbId,
          mediaType: type,
          title: title === undefined || title === '' ? 'Sans titre' : title,
          posterPath: posterPath ?? null,
          vote: vote ?? null,
          year: year ?? null,
        })
        .returning({ id: watchlistItems.id })
        .get();
      return { action: 'added' as const, tmdbId, type, id: row.id };
    },
  );

  app.post(
    '/api/decouverte/watchlist/notes/:id',
    {
      config,
      schema: {
        params: idParams,
        body: watchlistNotesRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const result = instance.db
        .update(watchlistItems)
        .set({ notes: request.body.notes === '' ? null : request.body.notes })
        .where(eq(watchlistItems.id, request.params.id))
        .run();
      if (result.changes === 0) throw notFound('decouverte.error.not_found');
      return { ok: true as const };
    },
  );

  app.post(
    '/api/decouverte/watchlist/remove/:id',
    { config, schema: { params: idParams, response: { 200: okResponseSchema } } },
    async (request) => {
      const result = instance.db
        .delete(watchlistItems)
        .where(eq(watchlistItems.id, request.params.id))
        .run();
      if (result.changes === 0) throw notFound('decouverte.error.not_found');
      return { ok: true as const };
    },
  );

  app.get(
    '/api/decouverte/watchlist/status',
    { config, schema: { response: { 200: watchlistStatusSchema } } },
    async () => ({
      keys: instance.db
        .select({ tmdbId: watchlistItems.tmdbId, mediaType: watchlistItems.mediaType })
        .from(watchlistItems)
        .all()
        .map((w) => `${w.mediaType}_${w.tmdbId}`),
    }),
  );
};
