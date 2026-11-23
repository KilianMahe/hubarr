// SPDX-License-Identifier: AGPL-3.0-or-later
// Recherche globale de la barre du haut (P4.5) : `MediaController::globalSearch`
// et `globalSearchOnline`, sous `/api/medias/:slug/search` (n° 232, 233).
// Réservée aux admins, comme tout `MediaController`.
//
// - Locale : index des bibliothèques de **toutes** les instances actives
//   (60 s en mémoire, champs normalisés une fois par construction), filtre
//   « contient » sans accents ni casse sur le titre, le titre original et le
//   titre de tri ; ceux qui commencent par la requête d'abord, puis l'ordre
//   alphabétique. 12 résultats, avec le statut des sous-titres (Bazarr).
// - En ligne : recherche Radarr (instance du slug, sinon par défaut) et Sonarr
//   (instance par défaut), 6 de chaque.
//
// Écart : « déjà dans la bibliothèque » d'un résultat en ligne
// compare l'id TMDB (film) ou TheTVDB (série) à toutes les instances, au lieu
// de l'id interne renvoyé par l'instance interrogée.

import {
  globalSearchQuerySchema,
  localSearchResponseSchema,
  onlineSearchResponseSchema,
  type LocalSearchHit,
  type OnlineSearchHit,
} from '@hubarr/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../http/zod';
import { requireRole } from '../../plugins/access';
import { getDefaultInstance, getInstanceBySlug } from '../instances/instances';
import { collectMovies, collectSeries } from '../media/library';
import { radarrClient, sonarrClient } from '../services/clients';
import { stripAccents } from './ranker';

const INDEX_TTL_MS = 60_000;
const INDEX_KEY = 'search.index.v1';
const MAX_LOCAL = 12;
const MAX_ONLINE = 6;

interface IndexRow extends Omit<LocalSearchHit, 'subtitle'> {
  tmdbId: number | null;
  tvdbId: number | null;
  nTitle: string;
  nOriginal: string;
  nSort: string;
}

/** Normalisation de la recherche locale : sans accents, en minuscules. */
export const normalizeTerm = (s: string) => stripAccents(s).toLowerCase();

async function searchIndex(app: FastifyInstance): Promise<IndexRow[]> {
  const cached = app.cache.store.get(INDEX_KEY);
  if (cached !== undefined) return cached as IndexRow[];
  const [movies, series] = await Promise.all([collectMovies(app), collectSeries(app)]);
  const rows: IndexRow[] = [];
  for (const { item, slug, instanceName } of movies) {
    if (item.id === null) continue;
    rows.push({
      type: 'film',
      id: item.id,
      tmdbId: item.tmdbId,
      tvdbId: null,
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
      hasFile: item.hasFile,
      poster: item.poster,
      inLibrary: true,
      instance: { slug, name: instanceName },
      nTitle: normalizeTerm(item.title),
      nOriginal: normalizeTerm(item.originalTitle ?? ''),
      nSort: normalizeTerm(item.sortTitle),
    });
  }
  for (const { item, slug, instanceName } of series) {
    if (item.id === null) continue;
    rows.push({
      type: 'serie',
      id: item.id,
      tmdbId: item.tmdbId,
      tvdbId: item.tvdbId,
      title: item.title,
      originalTitle: null,
      year: item.year,
      // Une série de la bibliothèque compte toujours « avec fichiers » pour la liste.
      hasFile: true,
      poster: item.poster,
      inLibrary: true,
      instance: { slug, name: instanceName },
      nTitle: normalizeTerm(item.title),
      nOriginal: '',
      nSort: normalizeTerm(item.sortTitle),
    });
  }
  // Un index vide (tout en panne) n'est pas gardé : la recherche suivante réessaie.
  if (rows.length > 0) app.cache.store.set(INDEX_KEY, rows, INDEX_TTL_MS);
  return rows;
}

/** Filtre et classement (`matchAndRank`). */
export function matchAndRank<
  T extends { nTitle: string; nOriginal: string; nSort: string; title: string },
>(rows: readonly T[], term: string): T[] {
  const needle = normalizeTerm(term);
  return rows
    .filter(
      (r) => r.nTitle.includes(needle) || r.nOriginal.includes(needle) || r.nSort.includes(needle),
    )
    .sort((a, b) => {
      const aStarts = a.nTitle.startsWith(needle);
      const bStarts = b.nTitle.startsWith(needle);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });
}

export const searchRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', requireRole('admin'));
  const params = z.object({ slug: z.string().min(1).max(100) });

  app.get(
    '/api/medias/:slug/search',
    {
      schema: {
        params,
        querystring: globalSearchQuerySchema,
        response: { 200: localSearchResponseSchema },
      },
    },
    async (request) => {
      const term = request.query.q.trim();
      if (term.length < 2) return [];
      const ranked = matchAndRank(await searchIndex(instance), term).slice(0, MAX_LOCAL);
      const movies = instance.cache.bazarr.movieStatusMap();
      const series = instance.cache.bazarr.seriesStatusMap();
      return ranked.map((row): LocalSearchHit => {
        const { tmdbId: _t, tvdbId: _v, nTitle: _a, nOriginal: _b, nSort: _c, ...hit } = row;
        const map = row.type === 'film' ? movies : series;
        const status = map.state === 'ready' ? map.items[String(row.id)] : undefined;
        return status === undefined || status.state === 'hidden'
          ? hit
          : { ...hit, subtitle: status };
      });
    },
  );

  app.get(
    '/api/medias/:slug/search/online',
    {
      schema: {
        params,
        querystring: globalSearchQuerySchema,
        response: { 200: onlineSearchResponseSchema },
      },
    },
    async (request) => {
      const term = request.query.q.trim();
      if (term.length < 2) return [];
      const index = await searchIndex(instance);
      const movieIds = new Set(index.filter((r) => r.type === 'film').map((r) => r.tmdbId));
      const seriesIds = new Set(index.filter((r) => r.type === 'serie').map((r) => r.tvdbId));
      const radarr =
        getInstanceBySlug(instance.db, 'radarr', request.params.slug) ??
        getDefaultInstance(instance.db, 'radarr');
      const sonarr = getDefaultInstance(instance.db, 'sonarr');

      const [movies, series] = await Promise.all([
        radarr?.enabled
          ? radarrClient(instance, radarr)
              .lookupMovies(term)
              .catch((error: unknown) => {
                request.log.warn({ err: error }, 'recherche en ligne Radarr en échec');
                return [];
              })
          : [],
        sonarr?.enabled
          ? sonarrClient(instance, sonarr)
              .lookup(term)
              .catch((error: unknown) => {
                request.log.warn({ err: error }, 'recherche en ligne Sonarr en échec');
                return [];
              })
          : [],
      ]);
      const results: OnlineSearchHit[] = [];
      for (const m of movies.slice(0, MAX_ONLINE)) {
        const id = m.tmdbId ?? m.id ?? 0;
        results.push({
          type: 'film',
          id,
          tmdbId: m.tmdbId,
          tvdbId: null,
          title: m.title || '—',
          year: m.year,
          poster: m.poster,
          hasFile: m.hasFile,
          inLibrary: m.tmdbId !== null && movieIds.has(m.tmdbId),
        });
      }
      for (const s of series.slice(0, MAX_ONLINE)) {
        results.push({
          type: 'serie',
          id: s.tvdbId ?? s.id ?? 0,
          tmdbId: s.tmdbId,
          tvdbId: s.tvdbId,
          title: s.title || '—',
          year: s.year,
          poster: s.poster,
          hasFile: false,
          inLibrary: s.tvdbId !== null && seriesIds.has(s.tvdbId),
        });
      }
      return results;
    },
  );
};
