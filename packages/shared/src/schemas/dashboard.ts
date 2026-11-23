// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats du tableau de bord (P4.1) : `DashboardController` d'origine, un
// endpoint JSON par carte au lieu des fragments HTML. Chaque
// carte se charge seule ; `available: false` masque la carte (le fragment
// vide de l'original). Les textes (badges, dates relatives) sont composés par
// le front à partir de valeurs brutes.

import { z } from 'zod';
import { activitySchema, quickLookSchema } from './activity';
import { dashboardLayoutSchema } from './preferences';
import { torrentSchema, torrentStatsSchema } from './torrents';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

/**
 * Cible d'un clic : fiche d'une bibliothèque (instance exacte) ou fiche TMDB.
 * Le front en tire le lien et l'aperçu rapide.
 */
export const dashboardRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('library'),
    type: z.enum(['movie', 'series']),
    slug: z.string(),
    id: z.number(),
  }),
  z.object({ kind: z.literal('tmdb'), type: z.enum(['movie', 'tv']), id: z.number() }),
]);
export type DashboardRef = z.infer<typeof dashboardRefSchema>;

/** Données de la page (n° 31) : mise en page, services utilisables, watchlist (base locale). */
export const dashboardPageSchema = z.object({
  layout: dashboardLayoutSchema,
  configured: z.object({
    radarr: z.boolean(),
    sonarr: z.boolean(),
    seerr: z.boolean(),
    tmdb: z.boolean(),
    tautulli: z.boolean(),
    transmission: z.boolean(),
    tracearr: z.boolean(),
    emby: z.boolean(),
  }),
  watchlist: z.array(
    z.object({
      tmdbId: z.number(),
      mediaType: z.enum(['movie', 'tv']),
      title: z.string(),
      poster: nullableString,
      year: nullableNumber,
      vote: nullableNumber,
    }),
  ),
});
export type DashboardPage = z.infer<typeof dashboardPageSchema>;

export const HERO_BADGES = ['in_library', 'monitored', 'trending'] as const;

export const dashboardHeroSchema = z.object({
  spotlight: z
    .object({
      source: z.enum(['library', 'tmdb']),
      /** Image de fond (fanart Radarr ou backdrop TMDB). */
      url: z.string(),
      title: z.string(),
      overview: nullableString,
      year: nullableNumber,
      runtime: nullableNumber,
      quality: nullableString,
      rating: nullableNumber,
      genres: z.array(z.string()),
      badge: z.enum(HERO_BADGES),
      ref: dashboardRefSchema.nullable(),
    })
    .nullable(),
  stats: z.object({ films: nullableNumber, series: nullableNumber }),
  upcomingCount: z.number(),
});
export type DashboardHero = z.infer<typeof dashboardHeroSchema>;

export const RELEASE_KINDS = ['digital', 'cinema', 'bluray'] as const;

export const upcomingItemSchema = z.object({
  type: z.enum(['movie', 'episode']),
  /** Id du film ou de la série dans l'instance. */
  id: nullableNumber,
  title: z.string(),
  year: nullableNumber,
  episodeCode: nullableString,
  episodeTitle: nullableString,
  /** Sortie la plus proche d'un film (badge), `null` pour un épisode. */
  releaseKind: z.enum(RELEASE_KINDS).nullable(),
  network: nullableString,
  poster: nullableString,
  /** Jour de l'événement (« AAAA-MM-JJ »). */
  day: z.string(),
  /** Instant de diffusion d'un épisode (ISO 8601), `null` pour un film. */
  at: nullableString,
  slug: z.string(),
});
export type UpcomingItem = z.infer<typeof upcomingItemSchema>;

export const dashboardUpcomingSchema = z.object({
  available: z.boolean(),
  /** Premier jour de la fenêtre de 7 jours (fuseau d'affichage). */
  today: z.string(),
  days: z.number(),
  items: z.array(upcomingItemSchema),
});
export type DashboardUpcoming = z.infer<typeof dashboardUpcomingSchema>;

export const dashboardRequestsSchema = z.object({
  available: z.boolean(),
  items: z.array(
    z.object({
      id: z.number(),
      type: z.enum(['movie', 'tv']),
      tmdbId: z.number(),
      title: z.string(),
      poster: nullableString,
      requestedBy: z.string(),
      requestedAt: nullableString,
    }),
  ),
});
export type DashboardRequests = z.infer<typeof dashboardRequestsSchema>;

export const dashboardHealthSchema = z.object({
  chips: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(['up', 'slow', 'very_slow', 'down', 'degraded']),
      latencyMs: nullableNumber,
    }),
  ),
});
export type DashboardHealth = z.infer<typeof dashboardHealthSchema>;

export const activityHistoryItemSchema = z.object({
  title: nullableString,
  grandparentTitle: nullableString,
  episodeCode: nullableString,
  year: nullableString,
  mediaType: nullableString,
  poster: nullableString,
  userDisplayName: nullableString,
  /** Secondes Unix. */
  watchedAt: z.number(),
  ratingKey: nullableString,
  quickLook: quickLookSchema.nullable(),
});

export const dashboardActivitySchema = z.object({
  available: z.boolean(),
  source: z.enum(['tautulli', 'tracearr']).nullable(),
  activity: activitySchema.nullable(),
  history: z.array(activityHistoryItemSchema),
});
export type DashboardActivity = z.infer<typeof dashboardActivitySchema>;

export const dashboardEmbySchema = z.object({
  available: z.boolean(),
  activity: activitySchema.nullable(),
});
export type DashboardEmby = z.infer<typeof dashboardEmbySchema>;

export const dashboardTransmissionSchema = z.object({
  available: z.boolean(),
  error: z.boolean(),
  stats: torrentStatsSchema.nullable(),
  active: z.array(torrentSchema),
});
export type DashboardTransmission = z.infer<typeof dashboardTransmissionSchema>;

export const dashboardRecentSchema = z.object({
  available: z.boolean(),
  items: z.array(
    z.object({
      type: z.enum(['movie', 'series']),
      id: z.number(),
      title: z.string(),
      addedAt: nullableString,
      poster: nullableString,
      downloaded: z.boolean(),
      network: nullableString,
      slug: z.string(),
    }),
  ),
});
export type DashboardRecent = z.infer<typeof dashboardRecentSchema>;

export const dashboardTrendingSchema = z.object({
  available: z.boolean(),
  items: z.array(
    z.object({
      id: z.number(),
      type: z.enum(['movie', 'tv']),
      title: z.string(),
      year: nullableNumber,
      poster: nullableString,
      vote: nullableNumber,
    }),
  ),
});
export type DashboardTrending = z.infer<typeof dashboardTrendingSchema>;

export const releaseChipSchema = z.object({
  kind: z.enum(['cinema', 'digital', 'physical', 'first_aired', 'next_episode', 'ended']),
  date: z.string(),
  upcoming: z.boolean(),
});

/** Aperçu rapide (n° 41, 42) : fiche en lecture seule d'un titre TMDB ou d'une bibliothèque. */
export const quickLookDetailSchema = z.object({
  title: z.string(),
  year: nullableNumber,
  poster: nullableString,
  backdrop: nullableString,
  overview: nullableString,
  genres: z.array(z.string()),
  rating: nullableNumber,
  runtime: nullableNumber,
  network: nullableString,
  seasons: nullableNumber,
  status: z.enum(['downloaded', 'monitored', 'missing']).nullable(),
  /** Gérer (fiche de l'instance) si le titre est dans une bibliothèque, sinon Découvrir/Ajouter. */
  action: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('manage'),
      type: z.enum(['movie', 'series']),
      slug: z.string(),
      id: z.number(),
    }),
    z.object({ kind: z.literal('discover'), type: z.enum(['movie', 'tv']), id: z.number() }),
  ]),
  inLibrary: z.boolean(),
  radarrId: nullableNumber,
  sonarrId: nullableNumber,
  airStatus: z.enum(['ended', 'continuing']).nullable(),
  cast: z.array(z.object({ name: z.string(), profile: nullableString })),
  providers: z.array(z.object({ name: z.string(), logo: nullableString })),
  trailerKey: nullableString,
  imdbId: nullableString,
  tmdbId: nullableNumber,
  tmdbType: z.enum(['movie', 'tv']).nullable(),
  posterPath: nullableString,
  releaseDates: z.array(releaseChipSchema),
});
export type QuickLookDetail = z.infer<typeof quickLookDetailSchema>;
