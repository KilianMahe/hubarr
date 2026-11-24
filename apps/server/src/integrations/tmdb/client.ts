// SPDX-License-Identifier: AGPL-3.0-or-later
// Client TMDB (API v3) : port de `TmdbClient`, sur le socle `integrations/http`.
//
// Chaque réponse est mise en cache en mémoire, par langue des métadonnées
// (changer `display_metadata_language` ne ressert jamais des textes de
// l'ancienne langue) : 1 h pour les listes, 6 h pour les fiches, 10 min pour
// les recherches. Un appel en échec n'est **jamais** mis en cache et vaut un
// objet vide, comme l'original : une panne courte de TMDB n'affiche pas
// « aucun résultat » pendant toute la fenêtre. Deux appels simultanés à la
// même clé partagent la même requête.
//
// Les éléments restent bruts (clés `snake_case` de TMDB) : chaque route en
// tire la forme qu'elle sert au navigateur. Les images pointent vers
// `image.tmdb.org`, autorisé par la CSP : ce n'est pas une URL
// d'instance.

import type { MemoryStore } from '../../cache/memory-store';
import { UpstreamError, type HttpClient, type Query, type UpstreamLogger } from '../http';

export type TmdbRaw = Record<string, unknown>;

export const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

const TTL_LIST_MS = 3_600_000;
const TTL_DETAIL_MS = 21_600_000;
const TTL_SEARCH_MS = 600_000;
const TTL_FIND_MS = 30 * 86_400_000;
/** TMDB est sur Internet : délai généreux (15 s dans l'original). */
export const TMDB_TIMEOUT_MS = 15_000;

/** URL d'une image TMDB (`null` sans chemin). */
/**
 * Image TMDB d'une URL complète (Radarr et Sonarr donnent `…/t/p/original/…`)
 * ramenée à la taille affichée (P5d.1, V22) : une affiche originale fait
 * 2000×3000 px, un fond 3840×2160 ; seize affiches et un fond en taille
 * originale saturaient la mémoire graphique du tableau de bord. Les autres
 * URL (TheTVDB, proxy) sont rendues telles quelles.
 */
export function tmdbSized(
  url: string | null,
  size: 'w185' | 'w342' | 'w780' | 'w1280',
): string | null {
  if (url === null) return null;
  return url.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)[a-z0-9]+\//, `$1${size}/`);
}

export function tmdbImage(path: unknown, size = 'w342'): string | null {
  return typeof path === 'string' && path !== '' ? `${TMDB_IMG_BASE}/${size}${path}` : null;
}

const LEAD: Record<string, string[]> = {
  fr: ['FR', 'BE', 'LU', 'CA'],
  en: ['US', 'GB', 'CA', 'AU'],
  es: ['ES', 'MX', 'AR'],
  de: ['DE', 'AT', 'CH'],
  pt: ['PT', 'BR'],
  it: ['IT', 'CH'],
};

/**
 * Priorité des pays pour les dates de sortie, classifications et plateformes
 * (`TmdbClient::regionPriority`) : la région explicite de la langue
 * (`en_GB`, `fr-CA`) d'abord, puis les pays de la langue, une chaîne commune,
 * enfin les pays présents dans la réponse (`append`). Sans doublon.
 */
export function regionPriority(locale: string, append: readonly string[] = []): string[] {
  const region = /^[a-zA-Z]{2,3}[_-]([a-zA-Z]{2})\b/.exec(locale)?.[1]?.toUpperCase() ?? '';
  // Langue inconnue : aucune supposition (« sv » est le suédois, « SV » le Salvador).
  const lead = LEAD[locale.slice(0, 2).toLowerCase()] ?? [];
  const order: string[] = [];
  for (const cc of [region, ...lead, 'FR', 'US', 'GB', 'BE', 'LU', 'CA', ...append]) {
    const code = cc.toUpperCase();
    if (code !== '' && !order.includes(code)) order.push(code);
  }
  return order;
}

/** Requêtes en vol par stockage : deux lectures simultanées partagent l'appel. */
const inflight = new WeakMap<MemoryStore, Map<string, Promise<TmdbRaw>>>();

export interface TmdbClientOptions {
  /** `null` : TMDB non configuré, chaque appel lève `not_configured`. */
  http: HttpClient | null;
  store: MemoryStore;
  /** Langue des métadonnées (`display_metadata_language`, « fr-FR »). */
  locale: string;
  logger?: UpstreamLogger;
}

export class TmdbClient {
  readonly locale: string;
  readonly #http: HttpClient | null;
  readonly #store: MemoryStore;
  readonly #logger: UpstreamLogger | undefined;

  constructor(options: TmdbClientOptions) {
    this.#http = options.http;
    this.#store = options.store;
    this.locale = options.locale;
    this.#logger = options.logger;
  }

  get configured(): boolean {
    return this.#http !== null;
  }

  trendingAll(window = 'week') {
    return this.#cached(`trending_all_${window}`, `/trending/all/${window}`, {}, TTL_LIST_MS);
  }
  trendingMovies(window = 'week') {
    return this.#cached(`trending_movie_${window}`, `/trending/movie/${window}`, {}, TTL_LIST_MS);
  }
  trendingTv(window = 'week') {
    return this.#cached(`trending_tv_${window}`, `/trending/tv/${window}`, {}, TTL_LIST_MS);
  }
  popularMovies(page = 1) {
    return this.#list(`popular_movie_${page}`, '/movie/popular', page);
  }
  popularTv(page = 1) {
    return this.#list(`popular_tv_${page}`, '/tv/popular', page);
  }
  topRatedMovies(page = 1) {
    return this.#list(`top_movie_${page}`, '/movie/top_rated', page);
  }
  topRatedTv(page = 1) {
    return this.#list(`top_tv_${page}`, '/tv/top_rated', page);
  }
  popularPeople(page = 1) {
    return this.#list(`popular_person_${page}`, '/person/popular', page);
  }
  upcomingMovies(page = 1) {
    return this.#list(`upcoming_movie_${page}`, '/movie/upcoming', page);
  }
  onTheAirTv(page = 1) {
    return this.#list(`on_air_tv_${page}`, '/tv/on_the_air', page);
  }
  nowPlayingMovies(page = 1) {
    return this.#list(`now_movie_${page}`, '/movie/now_playing', page);
  }
  airingTodayTv(page = 1) {
    return this.#list(`airing_tv_${page}`, '/tv/airing_today', page);
  }

  movie(id: number) {
    return this.#cached(
      `movie_${id}`,
      `/movie/${id}`,
      {
        append_to_response:
          'videos,credits,images,external_ids,watch/providers,keywords,release_dates,alternative_titles,reviews',
        include_image_language: 'fr,en,null',
        include_video_language: 'fr,en',
      },
      TTL_DETAIL_MS,
    );
  }

  tv(id: number) {
    return this.#cached(
      `tv_${id}`,
      `/tv/${id}`,
      {
        append_to_response:
          'videos,credits,images,external_ids,watch/providers,keywords,content_ratings,alternative_titles,reviews,aggregate_credits',
        include_image_language: 'fr,en,null',
        include_video_language: 'fr,en',
      },
      TTL_DETAIL_MS,
    );
  }

  movieRecommendations(id: number, page = 1) {
    return this.#list(`movie_rec_${id}_${page}`, `/movie/${id}/recommendations`, page);
  }
  tvRecommendations(id: number, page = 1) {
    return this.#list(`tv_rec_${id}_${page}`, `/tv/${id}/recommendations`, page);
  }
  movieSimilar(id: number, page = 1) {
    return this.#list(`movie_sim_${id}_${page}`, `/movie/${id}/similar`, page);
  }
  tvSimilar(id: number, page = 1) {
    return this.#list(`tv_sim_${id}_${page}`, `/tv/${id}/similar`, page);
  }

  searchMulti(query: string, page = 1) {
    return this.#cached(`search_${query}_${page}`, '/search/multi', { query, page }, TTL_SEARCH_MS);
  }

  discoverMovies(params: Query = {}) {
    return this.#cached(
      `discover_movie_${stableKey(params)}`,
      '/discover/movie',
      params,
      TTL_LIST_MS,
    );
  }

  discoverTv(params: Query = {}) {
    return this.#cached(`discover_tv_${stableKey(params)}`, '/discover/tv', params, TTL_LIST_MS);
  }

  /** Id TMDB d'une série d'après son id TheTVDB (`/find`), `null` si inconnu. */
  async findTmdbIdByTvdbId(tvdbId: number): Promise<number | null> {
    const data = await this.#cached(
      `find_tvdb_${tvdbId}`,
      `/find/${tvdbId}`,
      { external_source: 'tvdb_id' },
      TTL_FIND_MS,
    );
    const first = Array.isArray(data.tv_results)
      ? (data.tv_results[0] as TmdbRaw | undefined)
      : undefined;
    return typeof first?.id === 'number' ? first.id : null;
  }

  collection(id: number) {
    return this.#cached(`collection_${id}`, `/collection/${id}`, {}, TTL_DETAIL_MS);
  }
  person(id: number) {
    return this.#cached(`person_${id}`, `/person/${id}`, {}, TTL_DETAIL_MS);
  }
  personCombinedCredits(id: number) {
    return this.#cached(`person_credits_${id}`, `/person/${id}/combined_credits`, {}, TTL_LIST_MS);
  }
  searchCollection(query: string) {
    return this.#cached(
      `search_collection_${query}`,
      '/search/collection',
      { query },
      TTL_SEARCH_MS,
    );
  }
  searchPerson(query: string) {
    return this.#cached(`search_person_${query}`, '/search/person', { query }, TTL_SEARCH_MS);
  }
  genresMovies() {
    return this.#cached('genres_movie', '/genre/movie/list', {}, TTL_DETAIL_MS * 4);
  }
  genresTv() {
    return this.#cached('genres_tv', '/genre/tv/list', {}, TTL_DETAIL_MS * 4);
  }

  #list(key: string, path: string, page: number) {
    return this.#cached(key, path, { page }, TTL_LIST_MS);
  }

  async #cached(key: string, path: string, params: Query, ttlMs: number): Promise<TmdbRaw> {
    const http = this.#http;
    if (http === null) throw new UpstreamError('not_configured', { service: 'tmdb' });
    const full = `tmdb.${this.locale}.${key}`;
    const hit = this.#store.get(full);
    if (hit !== undefined) return hit as TmdbRaw;

    let pending = inflight.get(this.#store);
    if (pending === undefined) {
      pending = new Map();
      inflight.set(this.#store, pending);
    }
    const running = pending.get(full);
    if (running !== undefined) return running;

    const map = pending;
    const promise = this.#request(http, path, params)
      .then((data) => {
        if (data !== null) this.#store.set(full, data, ttlMs);
        return data ?? {};
      })
      .finally(() => map.delete(full));
    map.set(full, promise);
    return promise;
  }

  async #request(http: HttpClient, path: string, params: Query): Promise<TmdbRaw | null> {
    try {
      const data = await http.get(
        `/3${path}`,
        { language: this.locale, include_adult: 'false', ...params },
        { timeoutMs: TMDB_TIMEOUT_MS },
      );
      return data !== null && typeof data === 'object' && !Array.isArray(data)
        ? (data as TmdbRaw)
        : null;
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      // Le client HTTP a déjà journalisé le détail de l'échec.
      this.#logger?.debug?.({ service: 'tmdb', path, kind: error.kind }, 'TMDB : appel en échec');
      return null;
    }
  }
}

/** Clé de cache stable d'un jeu de paramètres (ordre des clés indifférent). */
function stableKey(params: Query): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
}

/** Résultats (`results`) d'une liste TMDB, toujours un tableau d'objets. */
export function resultsOf(data: TmdbRaw | null | undefined): TmdbRaw[] {
  const results = data?.results;
  return Array.isArray(results)
    ? results.filter((r): r is TmdbRaw => r !== null && typeof r === 'object')
    : [];
}
