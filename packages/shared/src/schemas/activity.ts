// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'activité des serveurs média (P3e) : Tautulli (Plex), Tracearr
// et Emby partagent une forme de session et d'activité (`normalizeSession`
// des trois clients de l'original), en `camelCase`. Les affiches sont des
// chemins du **proxy** de Hubarr (`/api/<service>/image?…`), jamais une URL
// de l'instance.

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const ACTIVITY_SERVICES = ['tautulli', 'tracearr', 'emby'] as const;
export type ActivityServiceId = (typeof ACTIVITY_SERVICES)[number];

/** Sources du widget d'activité, dans l'ordre historique (`ActivitySource::SERVICES`). */
export const ACTIVITY_SOURCES = ['tautulli', 'tracearr'] as const;
export type ActivitySourceId = (typeof ACTIVITY_SOURCES)[number];

/**
 * Source de l'activité en direct (`ActivitySource::resolve`) : la préférence
 * ne fait que réordonner les candidats ; un service inutilisable cède la
 * place à l'autre, `auto` garde l'ordre historique (Tautulli d'abord).
 */
export function resolveActivitySource(
  preferred: string | null | undefined,
  isUsable: (service: ActivitySourceId) => boolean,
): ActivitySourceId | null {
  const order: ActivitySourceId[] = [...ACTIVITY_SOURCES];
  const first = ACTIVITY_SOURCES.find((service) => service === preferred);
  if (first !== undefined) order.sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
  return order.find((service) => isUsable(service)) ?? null;
}

/** Fiche TMDB d'un élément en cours (aperçu rapide). */
export const quickLookSchema = z.object({
  type: z.enum(['movie', 'tv']).nullable(),
  id: nullableNumber,
});
export type QuickLook = z.infer<typeof quickLookSchema>;

export const activitySessionSchema = z.object({
  sessionKey: nullableString,
  /** Identifiant de l'élément (Plex `rating_key`, Emby `Id`) ; `null` pour Tracearr. */
  ratingKey: nullableString,
  /** Fiche TMDB déjà connue (Tracearr), sinon `null`. */
  quickLook: quickLookSchema.nullable(),
  state: nullableString,
  title: nullableString,
  grandparentTitle: nullableString,
  episodeCode: nullableString,
  year: nullableString,
  mediaType: nullableString,
  /** Chemin du proxy d'images de Hubarr. */
  poster: nullableString,
  serverName: nullableString,
  userDisplayName: nullableString,
  product: nullableString,
  player: nullableString,
  device: nullableString,
  platform: nullableString,
  quality: nullableString,
  videoDecision: nullableString,
  audioDecision: nullableString,
  subtitleDecision: nullableString,
  dynamicRange: nullableString,
  videoCodec: nullableString,
  streamVideoCodec: nullableString,
  audioCodec: nullableString,
  streamAudioCodec: nullableString,
  /** `direct play`, `copy` ou `transcode`. */
  transcodeDecision: nullableString,
  /** `lan` ou `wan`. */
  location: nullableString,
  bandwidthKbps: z.number(),
  progressPercent: z.number(),
});
export type ActivitySession = z.infer<typeof activitySessionSchema>;

/** Erreurs de l'activité, rendues en 200 comme l'original (le widget les affiche). */
export const ACTIVITY_ERRORS = ['unconfigured', 'unreachable', 'auth'] as const;

export const activitySchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  connected: z.boolean(),
  error: z.enum(ACTIVITY_ERRORS).nullable(),
  streamCount: z.number(),
  directPlayCount: z.number(),
  directStreamCount: z.number(),
  transcodeCount: z.number(),
  /** Bande passante en kbit/s (Tautulli, Emby) ; `null` pour Tracearr. */
  bandwidth: z
    .object({ totalKbps: z.number(), lanKbps: z.number(), wanKbps: z.number() })
    .nullable(),
  /** Débit total affiché par Tracearr (« 24.5 Mbps »), sinon `null`. */
  totalBitrate: nullableString,
  sessions: z.array(activitySessionSchema),
});
export type Activity = z.infer<typeof activitySchema>;

/** Série d'un graphique (`normalizePlaysByDate`). */
export const chartSchema = z.object({
  categories: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
});
export type Chart = z.infer<typeof chartSchema>;

export const TAUTULLI_RANGES = [7, 30, 90] as const;
export const tautulliChartQuerySchema = z.object({
  range: z.coerce.number().int().catch(30),
  metric: z.string().catch('plays'),
  user: z.string().catch(''),
  mode: z.string().catch('media'),
});

const statItem = z.object({
  ratingKey: nullableString,
  title: nullableString,
  year: nullableString,
  poster: nullableString,
  plays: z.number(),
  duration: z.number(),
  usersWatched: z.number(),
});
export const tautulliStatsSchema = z.object({
  topMovies: z.array(statItem),
  topShows: z.array(statItem),
  popularMovies: z.array(statItem),
  popularShows: z.array(statItem),
  topUsers: z.array(
    z.object({ userDisplayName: nullableString, plays: z.number(), duration: z.number() }),
  ),
  topPlatforms: z.array(
    z.object({ platform: nullableString, plays: z.number(), duration: z.number() }),
  ),
  mostConcurrent: z.array(z.object({ title: nullableString, count: z.number() })),
});
export type TautulliStats = z.infer<typeof tautulliStatsSchema>;

export const tautulliHistoryItemSchema = z.object({
  ratingKey: nullableString,
  mediaType: nullableString,
  title: nullableString,
  grandparentTitle: nullableString,
  year: nullableString,
  episodeCode: nullableString,
  poster: nullableString,
  userDisplayName: nullableString,
  /** Secondes Unix. */
  watchedAt: z.number(),
  percentComplete: z.number(),
});
export const tautulliHistorySchema = z.array(tautulliHistoryItemSchema);
export type TautulliHistoryItem = z.infer<typeof tautulliHistoryItemSchema>;

export const tautulliLibrarySchema = z.object({
  name: nullableString,
  type: nullableString,
  count: z.number(),
  childCount: nullableNumber,
});
export const tautulliLibrariesSchema = z.array(tautulliLibrarySchema);

export const tautulliUserSchema = z.object({
  friendlyName: nullableString,
  lastSeen: z.number(),
  lastPlayed: nullableString,
  plays: z.number(),
  durationSeconds: z.number(),
});
export const tautulliUsersSchema = z.array(tautulliUserSchema);
export const tautulliUserNamesSchema = z.array(z.object({ name: z.string(), id: z.string() }));

export const tautulliMetadataSchema = z.object({
  error: z.enum(['unconfigured', 'unreachable', 'auth', 'not_found']).nullable(),
  metadata: z
    .object({
      mediaType: nullableString,
      title: nullableString,
      grandparentTitle: nullableString,
      year: nullableString,
      season: nullableNumber,
      episode: nullableNumber,
      summary: nullableString,
      tagline: nullableString,
      contentRating: nullableString,
      durationMs: z.number(),
      genres: z.array(z.string()),
      ratings: z.object({ critic: nullableNumber, audience: nullableNumber }),
      directors: z.array(z.string()),
      writers: z.array(z.string()),
      cast: z.array(z.string()),
      studio: nullableString,
      releaseDate: nullableString,
      media: z.object({
        resolution: nullableString,
        videoCodec: nullableString,
        audioCodec: nullableString,
        container: nullableString,
        bitrateKbps: z.number(),
      }),
    })
    .nullable(),
});
export type TautulliMetadata = z.infer<typeof tautulliMetadataSchema>;

export const TRACEARR_PERIODS = ['week', 'month', 'year'] as const;

export const tracearrStatsSchema = z.object({
  activeStreams: z.number(),
  totalUsers: z.number(),
  plays30d: z.number(),
  violations7d: z.number(),
  todayPlays: z.number(),
  watchTimeHours: z.number(),
  activeUsersToday: z.number(),
  alertsLast24h: z.number(),
});
export type TracearrStats = z.infer<typeof tracearrStatsSchema>;

export const tracearrChartsSchema = z.object({
  plays: chartSchema,
  concurrent: chartSchema,
  hour: chartSchema,
  dow: chartSchema,
  platforms: chartSchema,
  quality: z.object({
    directPlay: z.number(),
    directStream: z.number(),
    transcode: z.number(),
    total: z.number(),
    directPlayPercent: z.number(),
    directStreamPercent: z.number(),
    transcodePercent: z.number(),
  }),
});
export type TracearrCharts = z.infer<typeof tracearrChartsSchema>;

export const tracearrHistoryItemSchema = z.object({
  quickLook: quickLookSchema.nullable(),
  title: nullableString,
  year: nullableString,
  mediaType: nullableString,
  poster: nullableString,
  serverName: nullableString,
  /**
   * Jeton opaque de l'utilisateur (fiche utilisateur, P5d.2) : l'identifiant
   * Tracearr lui-même ne sort jamais du serveur (D148).
   */
  userKey: nullableString,
  userDisplayName: nullableString,
  /** Série d'un épisode (regroupement des titres les plus vus). */
  showTitle: nullableString,
  platform: nullableString,
  watchedAt: z.number(),
  durationMs: z.number(),
  watched: z.boolean(),
  percentComplete: z.number(),
});
export const tracearrHistorySchema = z.object({
  rows: z.array(tracearrHistoryItemSchema),
  nextCursor: nullableString,
});
export type TracearrHistory = z.infer<typeof tracearrHistorySchema>;

export const tracearrUserSchema = z.object({
  /** Jeton opaque (voir `userKey`), sert d'adresse à la fiche utilisateur. */
  key: nullableString,
  displayName: nullableString,
  serverName: nullableString,
  lastSeen: z.number(),
  plays: z.number(),
  trustScore: nullableNumber,
});
export const tracearrUsersSchema = z.array(tracearrUserSchema);
export type TracearrUser = z.infer<typeof tracearrUserSchema>;

/** Nombre de lectures par libellé (plateformes, titres les plus vus). */
const tracearrCountSchema = z.object({ name: z.string(), plays: z.number() });

/**
 * Fiche d'un utilisateur Tracearr (P5d.2, V23) : ses dernières lectures et des
 * statistiques calculées sur celles-ci (fenêtre bornée, voir `scannedRows`).
 */
export const tracearrUserDetailSchema = z.object({
  user: tracearrUserSchema,
  stats: z.object({
    plays: z.number(),
    watchTimeMs: z.number(),
    movies: z.number(),
    episodes: z.number(),
    lastSeen: z.number(),
    platforms: z.array(tracearrCountSchema),
    topTitles: z.array(tracearrCountSchema),
  }),
  history: z.array(tracearrHistoryItemSchema),
  /** Lignes d'historique parcourues (toutes utilisateurs confondus). */
  scannedRows: z.number(),
  /** Vrai si l'historique est plus long que la fenêtre parcourue. */
  truncated: z.boolean(),
});
export type TracearrUserDetail = z.infer<typeof tracearrUserDetailSchema>;
