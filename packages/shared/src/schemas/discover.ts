// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de la découverte TMDB (P4.4) : `TmdbController` d'origine, sous
// `/api/decouverte` (R1). Les clés passent en `camelCase` ; les images sont
// des URL `image.tmdb.org` (autorisées par la CSP), jamais une URL
// d'instance.

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const TMDB_MEDIA_TYPES = ['movie', 'tv'] as const;
export const tmdbMediaTypeSchema = z.enum(TMDB_MEDIA_TYPES);
export type TmdbMediaType = z.infer<typeof tmdbMediaTypeSchema>;

/** État d'un titre dans une bibliothèque Radarr/Sonarr (`buildLibraryIndex`). */
export const LIB_STATUS_VALUES = [
  'downloaded',
  'missing',
  'announced',
  'inCinemas',
  'unmonitored',
  'partial',
] as const;
export const libStatusSchema = z.enum(LIB_STATUS_VALUES);
export type LibStatusValue = z.infer<typeof libStatusSchema>;

/** Sections de la page Découverte (`/decouverte/section/{type}`). */
export const DISCOVER_SECTIONS = [
  'trending',
  'trending-movies',
  'trending-tv',
  'popular-movies',
  'popular-tv',
  'upcoming',
  'on-air',
  'top-movies',
  'top-tv',
  'now-playing',
  'airing-today',
] as const;
export const discoverSectionSchema = z.enum(DISCOVER_SECTIONS);
export type DiscoverSection = z.infer<typeof discoverSectionSchema>;

/** Carte TMDB enrichie (`enrich`). */
export const tmdbCardSchema = z.object({
  id: z.number(),
  type: tmdbMediaTypeSchema,
  title: z.string(),
  year: nullableNumber,
  release: nullableString,
  overview: nullableString,
  poster: nullableString,
  posterHi: nullableString,
  backdrop: nullableString,
  vote: nullableNumber,
  voteCount: z.number(),
  popularity: nullableNumber,
  inLibrary: z.boolean(),
  libStatus: libStatusSchema.nullable(),
  libId: nullableNumber,
  /** Instance Radarr/Sonarr qui possède le titre (lien vers sa fiche). */
  libSlug: nullableString,
});
export type TmdbCard = z.infer<typeof tmdbCardSchema>;

export const tmdbPageSchema = z.object({
  results: z.array(tmdbCardSchema),
  page: z.number(),
  totalPages: z.number(),
  totalResults: z.number(),
});
export type TmdbPage = z.infer<typeof tmdbPageSchema>;

export const discoverHomeSchema = z.object({
  error: z.boolean(),
  heroMovie: tmdbCardSchema.nullable(),
  heroTv: tmdbCardSchema.nullable(),
  trending: z.array(tmdbCardSchema),
  popMovies: z.array(tmdbCardSchema),
  popTv: z.array(tmdbCardSchema),
  upcoming: z.array(tmdbCardSchema),
  onAir: z.array(tmdbCardSchema),
  topMovies: z.array(tmdbCardSchema),
  topTv: z.array(tmdbCardSchema),
});
export type DiscoverHome = z.infer<typeof discoverHomeSchema>;

export const myRecommendationsSchema = z.object({
  results: z.array(tmdbCardSchema),
  movies: z.array(tmdbCardSchema),
  tv: z.array(tmdbCardSchema),
  seeds: z.number(),
});
export type MyRecommendations = z.infer<typeof myRecommendationsSchema>;

/**
 * Suggestions par dossier racine (`GET /api/decouverte/dossiers`, lot 8) :
 * une rangée par dossier racine Radarr/Sonarr, recommandations TMDB agrégées
 * à partir des titres du dossier, sans les titres déjà en bibliothèque.
 */
export const folderSuggestionsSchema = z.object({
  folders: z.array(
    z.object({
      /** Identifiant stable de la rangée (`<service>:<slug>:<chemin>`). */
      key: z.string(),
      service: z.enum(['radarr', 'sonarr']),
      /** Nom de l'instance qui porte le dossier. */
      instance: z.string(),
      /** Dernier segment du chemin (« Films enfants »). */
      label: z.string(),
      path: z.string(),
      results: z.array(tmdbCardSchema),
    }),
  ),
});
export type FolderSuggestions = z.infer<typeof folderSuggestionsSchema>;

/**
 * « D'après ce que vous avez regardé » (`GET /api/decouverte/regardes`,
 * lot 8) : recommandations TMDB à partir des lectures récentes Tracearr de
 * l'utilisateur connecté, sans les titres déjà vus.
 */
export const watchedSuggestionsSchema = z.object({
  /** Un compte Tracearr est associé à l'utilisateur connecté. */
  linked: z.boolean(),
  /** Titres regardés qui ont servi de point de départ. */
  seeds: z.number().int().nonnegative(),
  results: z.array(tmdbCardSchema),
});
export type WatchedSuggestions = z.infer<typeof watchedSuggestionsSchema>;

/** Bornes du sélecteur « Populaires en [année] ». */
export const POPULAR_YEAR_MIN = 1920;
export const popularYearParamsSchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(POPULAR_YEAR_MIN)
    .refine((year) => year <= new Date().getUTCFullYear() + 1),
});

/** « Populaires en [année] » (`GET /api/decouverte/annee/:year`, lot 8). */
export const popularByYearSchema = z.object({
  year: z.number().int(),
  movies: z.array(tmdbCardSchema),
  tv: z.array(tmdbCardSchema),
});
export type PopularByYear = z.infer<typeof popularByYearSchema>;

/**
 * Animés : TMDB n'a pas de type dédié. Hubarr retient le genre Animation (16)
 * avec le japonais comme langue originale.
 */
export const ANIME_GENRE_ID = 16;
export const ANIME_ORIGINAL_LANGUAGE = 'ja';
const flagSchema = z.enum(['1', '0', 'true', 'false', 'on']).optional().catch(undefined);

export const discoverFilterQuerySchema = z.object({
  type: z.enum(TMDB_MEDIA_TYPES).catch('movie'),
  genres: z.string().max(200).optional(),
  year_min: z.coerce.number().int().min(1870).max(2100).optional().catch(undefined),
  year_max: z.coerce.number().int().min(1870).max(2100).optional().catch(undefined),
  vote_min: z.coerce.number().min(0).max(10).optional().catch(undefined),
  vote_count_min: z.coerce.number().int().min(0).optional().catch(undefined),
  sort: z
    .string()
    .regex(/^[a-z_.]+$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1),
  /** Animés seulement (genre Animation, langue originale japonaise). */
  anime: flagSchema,
});
export type DiscoverFilterQuery = z.input<typeof discoverFilterQuerySchema>;

export const genreSchema = z.object({ id: z.number(), name: z.string() });
export const genresResponseSchema = z.object({ genres: z.array(genreSchema) });
export type Genre = z.infer<typeof genreSchema>;

export const libraryOwnerSchema = z.object({
  slug: z.string(),
  name: z.string(),
  id: z.number(),
  status: libStatusSchema,
});
export type LibraryOwner = z.infer<typeof libraryOwnerSchema>;

export const addCandidateSchema = z.object({
  slug: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  defaultQualityProfileId: nullableNumber,
});
export type AddCandidate = z.infer<typeof addCandidateSchema>;

/** Résolution d'un titre TMDB pour l'ajout rapide (`/decouverte/resolve`). */
export const resolvedMediaSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('film'),
    id: z.number(),
    tmdbId: z.number(),
    title: z.string(),
    year: z.number(),
    poster: nullableString,
    inLibrary: z.boolean(),
    instances: z.array(libraryOwnerSchema),
    candidates: z.array(addCandidateSchema),
  }),
  z.object({
    type: z.literal('serie'),
    /** Id TheTVDB (celui qu'attend Sonarr). */
    id: z.number(),
    tvdbId: z.number(),
    tmdbId: z.number(),
    title: z.string(),
    year: z.number(),
    poster: nullableString,
    inLibrary: z.boolean(),
    instances: z.array(libraryOwnerSchema),
    candidates: z.array(addCandidateSchema),
    seriesType: z.enum(['anime', 'standard']),
  }),
]);
export type ResolvedMedia = z.infer<typeof resolvedMediaSchema>;

const logoSchema = z.object({ name: z.string(), logo: nullableString });
const episodeRefSchema = z.object({
  season: z.number(),
  episode: z.number(),
  name: z.string(),
  airDate: nullableString,
});

export const tmdbProvidersSchema = z.object({
  country: z.string(),
  link: nullableString,
  flatrate: z.array(logoSchema),
  rent: z.array(logoSchema),
  buy: z.array(logoSchema),
});
export type TmdbProviders = z.infer<typeof tmdbProvidersSchema>;

/** Fiche détaillée (`/decouverte/detail/{type}/{id}`). */
export const tmdbDetailSchema = z.object({
  id: z.number(),
  type: tmdbMediaTypeSchema,
  title: z.string(),
  original: z.string(),
  tagline: nullableString,
  year: nullableNumber,
  release: nullableString,
  status: nullableString,
  runtime: nullableNumber,
  genres: z.array(z.string()),
  overview: nullableString,
  vote: nullableNumber,
  voteCount: z.number(),
  popularity: nullableNumber,
  poster: nullableString,
  posterPath: nullableString,
  backdrop: nullableString,
  homepage: nullableString,
  imdbId: nullableString,
  tvdbId: nullableNumber,
  networks: z.array(logoSchema),
  seasons: nullableNumber,
  episodes: nullableNumber,
  episodeRuntime: nullableNumber,
  inProduction: z.boolean().nullable(),
  lastAirDate: nullableString,
  nextEpisode: episodeRefSchema.nullable(),
  lastEpisode: episodeRefSchema.nullable(),
  creators: z.array(z.string()),
  originalLanguage: nullableString,
  spokenLanguages: z.array(z.string()),
  countries: z.array(z.string()),
  companies: z.array(logoSchema),
  collection: z
    .object({ id: z.number(), name: z.string(), poster: nullableString, backdrop: nullableString })
    .nullable(),
  budget: nullableNumber,
  revenue: nullableNumber,
  keywords: z.array(z.string()),
  certification: nullableString,
  providers: tmdbProvidersSchema.nullable(),
  cast: z.array(z.object({ name: z.string(), character: z.string(), profile: nullableString })),
  crew: z.object({
    directors: z.array(z.string()),
    writers: z.array(z.string()),
    composers: z.array(z.string()),
    cinematographers: z.array(z.string()),
  }),
  trailer: z.object({ key: z.string(), name: z.string() }).nullable(),
  videoGallery: z.array(z.object({ key: z.string(), name: z.string(), type: z.string() })),
  seasonsList: z.array(
    z.object({
      number: z.number(),
      name: z.string(),
      episodeCount: z.number(),
      airDate: nullableString,
      overview: nullableString,
      poster: nullableString,
      vote: nullableNumber,
    }),
  ),
  altTitles: z.array(z.object({ country: z.string(), title: z.string() })),
  reviews: z.array(
    z.object({
      author: z.string(),
      rating: nullableNumber,
      content: z.string(),
      date: nullableString,
      url: nullableString,
    }),
  ),
  backdrops: z.array(z.object({ thumb: nullableString, full: nullableString })),
  similar: z.array(tmdbCardSchema),
  inLibrary: z.boolean(),
  libStatus: libStatusSchema.nullable(),
  libId: nullableNumber,
  libSlug: nullableString,
});
export type TmdbDetail = z.infer<typeof tmdbDetailSchema>;

/**
 * Suggestions d'un titre pour sa fiche Hubarr : recommandations et titres
 * similaires TMDB, marqués s'ils sont en bibliothèque, sans le titre lui-même
 * ni doublon entre les deux rangées.
 */
export const tmdbSuggestionsSchema = z.object({
  recommendations: z.array(tmdbCardSchema),
  similar: z.array(tmdbCardSchema),
});
export type TmdbSuggestions = z.infer<typeof tmdbSuggestionsSchema>;

export const textQuerySchema = z.object({
  q: z.string().max(200).catch(''),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export const collectionHitSchema = z.object({
  id: z.number(),
  name: z.string(),
  poster: nullableString,
});
export const collectionSearchSchema = z.object({ results: z.array(collectionHitSchema) });
export const collectionSchema = z.object({
  name: z.string(),
  poster: nullableString,
  results: z.array(tmdbCardSchema),
});
export type TmdbCollection = z.infer<typeof collectionSchema>;

export const personHitSchema = z.object({
  id: z.number(),
  name: z.string(),
  profile: nullableString,
  known: z.string(),
});
export type PersonHit = z.infer<typeof personHitSchema>;
export const personSearchSchema = z.object({ results: z.array(personHitSchema) });
export const personSchema = z.object({
  name: z.string(),
  profile: nullableString,
  bio: nullableString,
  results: z.array(tmdbCardSchema),
});
export type TmdbPerson = z.infer<typeof personSchema>;

/** Personne de la recherche (`searchPayload`). */
export const searchPersonSchema = z.object({
  id: z.number(),
  popularity: z.number(),
  name: z.string(),
  profile: nullableString,
  known: z.string(),
  titles: z.array(z.string()),
});
export type SearchPerson = z.infer<typeof searchPersonSchema>;

export const searchBestSchema = tmdbCardSchema.extend({
  genres: z.array(z.string()),
  originalTitle: nullableString,
});

export const SMART_SEARCH_SORTS = ['relevance', 'popularity', 'vote', 'newest'] as const;

export const smartSearchQuerySchema = z.object({
  q: z.string().catch(''),
  type: z.enum(['all', 'movie', 'tv']).catch('all'),
  sort: z.enum(SMART_SEARCH_SORTS).catch('relevance'),
  genre: z.coerce.number().int().catch(0),
  year_min: z.coerce.number().int().optional().catch(undefined),
  year_max: z.coerce.number().int().optional().catch(undefined),
  vote_min: z.coerce.number().catch(0),
  hide_owned: z.enum(['1', '0', 'true', 'false', 'on']).optional().catch(undefined),
  exact: z.enum(['1', '0', 'true', 'false', 'on']).optional().catch(undefined),
  /** Animés seulement, films et séries. */
  anime: flagSchema,
  page: z.coerce.number().int().catch(1),
});
export type SmartSearchQuery = z.input<typeof smartSearchQuerySchema>;

/** Recherche de la page Découverte (`/decouverte/recherche`). */
export const smartSearchSchema = z.object({
  mode: z.enum(['search', 'discover']),
  best: searchBestSchema.nullable(),
  bestPerson: searchPersonSchema.nullable(),
  results: z.array(tmdbCardSchema),
  people: z.array(searchPersonSchema),
  total: z.number().optional(),
  suggestion: nullableString.optional(),
  correctedFrom: nullableString.optional(),
  correctedTo: nullableString.optional(),
  page: z.number().optional(),
  totalPages: z.number().optional(),
});
export type SmartSearch = z.infer<typeof smartSearchSchema>;

export const watchlistItemSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  type: tmdbMediaTypeSchema,
  title: z.string(),
  poster: nullableString,
  posterPath: nullableString,
  vote: nullableNumber,
  year: nullableNumber,
  /** Date d'ajout (ISO 8601). */
  addedAt: z.string(),
  notes: nullableString,
  inLibrary: z.boolean(),
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export const watchlistResponseSchema = z.object({ items: z.array(watchlistItemSchema) });

export const watchlistToggleRequestSchema = z.object({
  tmdbId: z.number().int().positive({ message: 'decouverte.error.invalid_params' }),
  type: tmdbMediaTypeSchema,
  title: z.string().trim().max(500).optional(),
  posterPath: z.string().max(500).nullable().optional(),
  vote: z.number().nullable().optional(),
  year: z.number().int().nullable().optional(),
});
export type WatchlistToggleRequest = z.input<typeof watchlistToggleRequestSchema>;
export const watchlistToggleResponseSchema = z.object({
  action: z.enum(['added', 'removed']),
  tmdbId: z.number(),
  type: tmdbMediaTypeSchema,
  id: z.number().optional(),
});
export const watchlistNotesRequestSchema = z.object({
  notes: z.string().max(5_000).nullable(),
});
/** Titres de la watchlist, en clés `<type>_<tmdbId>`. */
export const watchlistStatusSchema = z.object({ keys: z.array(z.string()) });
