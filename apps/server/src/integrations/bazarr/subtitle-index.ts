// SPDX-License-Identifier: AGPL-3.0-or-later
// Index des sous-titres Bazarr : port de `BazarrSubtitleIndex`
// (`BazarrSubtitleIndex{,Swr,Datasets,Languages,Patch,Single}Test`).
//
// Les lectures des badges et des pages ne fetchent **jamais** Bazarr : elles
// lisent le cache SWR (frais ou périmé servi aussitôt ; miss dur → `pending`
// ou `warming`, et demande de reconstruction à la file, D85). Trois jeux de
// données se reconstruisent (`movies`, `series`, `badges`, voir
// `cache/refreshers/bazarr-index.ts`) ; les autres (langues, cartes, « les
// plus manquants ») sont écrits par le même passage.
//
// Bazarr ne connaît qu'une instance Radarr et une Sonarr : les badges ne
// s'affichent que si exactement une instance du service est active (un id
// seul serait ambigu entre deux instances).
//
// Après une mutation (téléchargement, recherche automatique), l'élément est
// relu seul et corrigé en place ; le correctif est journalisé 2 min pour
// qu'une reconstruction déjà partie ne l'écrase pas avec un état antérieur.

import type {
  BazarrCard,
  BazarrCounts,
  BazarrLangs,
  BazarrMissingItem,
  BazarrMovieSubtitles,
  BazarrStatus,
  BazarrStatusMap,
} from '@hubarr/shared';
import type { CacheLogger, StaleWhileRevalidateCache } from '../../cache/swr-cache';
import type { BazarrClient, BazarrRow } from './client';
import { extractLangs } from './langs';

export const BAZARR_KEYS = {
  movies: 'bazarr_subtitle_index.movies',
  movieLangs: 'bazarr_subtitle_index.movie_langs',
  series: 'bazarr_subtitle_index.series',
  movieCards: 'bazarr_subtitle_index.movie_cards',
  seriesCards: 'bazarr_subtitle_index.series_cards',
  mostMissingMovies: 'bazarr_subtitle_index.most_missing_movies',
  mostMissingSeries: 'bazarr_subtitle_index.most_missing_series',
  badges: 'bazarr_subtitle_index.badges',
} as const;
export type BazarrRefreshKey =
  typeof BAZARR_KEYS.movies | typeof BAZARR_KEYS.series | typeof BAZARR_KEYS.badges;

/** Clés reconstruites par le refresher (les autres sont écrites avec elles). */
export const BAZARR_REFRESH_KEYS: readonly string[] = [
  BAZARR_KEYS.movies,
  BAZARR_KEYS.series,
  BAZARR_KEYS.badges,
];

export const BAZARR_SOFT_TTL_MS = 60_000;
export const BAZARR_HARD_TTL_MS = 600_000;
export const BAZARR_PATCH_TTL_MS = 120_000;
export const MOST_MISSING_CANDIDATES = 32;
const PATCHES_KEY = 'bazarr_subtitle_index.patches';

const HIDDEN: BazarrStatus = { state: 'hidden', count: 0 };
const UNTRACKED: BazarrMovieSubtitles = { present: [], missing: [], tracked: false };

export type StatusMap = Record<string, BazarrStatus>;
export type LangsMap = Record<string, BazarrMovieSubtitles>;

export interface GridDataset {
  cards: Omit<BazarrCard, 'poster'>[];
  languages: string[];
}
export type MissingCandidate = Omit<BazarrMissingItem, 'poster'>;

interface Patch {
  at: number;
  kind: 'movie' | 'series';
  id: number;
  status: BazarrStatus;
  langs: BazarrMovieSubtitles | null;
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

// ── Calculs purs ─────────────────────────────────────────────────────────────

/** Statut d'un film : non suivi sans profil de langues. */
export function computeMovieStatus(movie: BazarrRow): BazarrStatus {
  if (movie.profileId === null || movie.profileId === undefined) return HIDDEN;
  const missing = count(movie.missing_subtitles);
  return missing > 0 ? { state: 'missing', count: missing } : { state: 'complete', count: 0 };
}

export function extractMovieLangs(movie: BazarrRow): BazarrMovieSubtitles {
  if (movie.profileId === null || movie.profileId === undefined) return UNTRACKED;
  return { ...extractLangs(movie), tracked: true };
}

/** Statut d'une série : non suivie sans profil ou sans fichier d'épisode. */
export function computeSeriesStatus(series: BazarrRow): BazarrStatus {
  if (series.profileId === null || series.profileId === undefined) return HIDDEN;
  if ((num(series.episodeFileCount) ?? 0) === 0) return HIDDEN;
  const missing = num(series.episodeMissingCount) ?? 0;
  return missing > 0 ? { state: 'missing', count: missing } : { state: 'complete', count: 0 };
}

/** Plus manquants d'abord, puis titre (sans casse). */
export function byMissingThenTitle(a: MissingCandidate, b: MissingCandidate): number {
  return (
    b.missingCount - a.missingCount ||
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  );
}

function cardOf(
  row: BazarrRow,
  status: BazarrStatus,
  langs: BazarrLangs,
  ids: { movieId: number | null; seriesId: number | null },
): Omit<BazarrCard, 'poster'> {
  return {
    title: typeof row.title === 'string' ? row.title : '',
    year:
      num(row.year) ??
      (typeof row.year === 'string' ? Number.parseInt(row.year, 10) || null : null),
    substate: status.state === 'hidden' ? 'not-tracked' : status.state,
    count: status.count,
    missingLangs: [...new Set(langs.missing.map((lang) => lang.lang))],
    ...ids,
  };
}

/** Jeux de données des films, tirés d'une seule lecture de `/movies`. */
export function buildMovieDatasets(rows: readonly BazarrRow[]) {
  const status: StatusMap = {};
  const langs: LangsMap = {};
  const cards: Omit<BazarrCard, 'poster'>[] = [];
  const languages = new Set<string>();
  const candidates: MissingCandidate[] = [];
  for (const row of rows) {
    const id = num(row.radarrId);
    if (id === null) continue;
    const st = computeMovieStatus(row);
    const ml = extractMovieLangs(row);
    status[id] = st;
    langs[id] = ml;
    for (const lang of ml.missing) languages.add(lang.lang);
    const card = cardOf(row, st, ml, { movieId: id, seriesId: null });
    cards.push(card);
    if (st.state === 'missing') {
      candidates.push({
        kind: 'movie',
        id,
        title: card.title || '—',
        year: card.year,
        missingCount: st.count,
      });
    }
  }
  return {
    status,
    langs,
    grid: { cards, languages: [...languages].sort() } satisfies GridDataset,
    candidates: candidates.sort(byMissingThenTitle).slice(0, MOST_MISSING_CANDIDATES),
  };
}

/** Jeux de données des séries, tirés d'une seule lecture de `/series`. */
export function buildSeriesDatasets(rows: readonly BazarrRow[]) {
  const status: StatusMap = {};
  const cards: Omit<BazarrCard, 'poster'>[] = [];
  const languages = new Set<string>();
  const candidates: MissingCandidate[] = [];
  for (const row of rows) {
    const id = num(row.sonarrSeriesId);
    if (id === null) continue;
    const st = computeSeriesStatus(row);
    const sl = extractLangs(row);
    status[id] = st;
    for (const lang of sl.missing) languages.add(lang.lang);
    const card = cardOf(row, st, sl, { movieId: null, seriesId: id });
    cards.push(card);
    const missing = num(row.episodeMissingCount) ?? 0;
    if (missing > 0) {
      candidates.push({
        kind: 'series',
        id,
        title: card.title || '—',
        year: card.year,
        missingCount: missing,
      });
    }
  }
  return {
    status,
    grid: { cards, languages: [...languages].sort() } satisfies GridDataset,
    candidates: candidates.sort(byMissingThenTitle).slice(0, MOST_MISSING_CANDIDATES),
  };
}

// ── Index ────────────────────────────────────────────────────────────────────

export interface BazarrIndexDeps {
  swr: StaleWhileRevalidateCache;
  /** Exactement une instance active du service (badges et langues). */
  gate: (service: 'radarr' | 'sonarr') => boolean;
  /** Client Bazarr (lève `not_configured` s'il ne l'est pas). */
  client: () => BazarrClient;
  logger?: CacheLogger;
}

export class BazarrSubtitleIndex {
  readonly #deps: BazarrIndexDeps;

  constructor(deps: BazarrIndexDeps) {
    this.#deps = deps;
  }

  get swr(): StaleWhileRevalidateCache {
    return this.#deps.swr;
  }

  /** Après une mutation : servir la valeur comme périmée et demander la reconstruction. */
  requestRefresh(key: BazarrRefreshKey): void {
    this.swr.markStale(key, BAZARR_SOFT_TTL_MS, BAZARR_HARD_TTL_MS);
    this.swr.requestRefresh(key);
  }

  /** Fraîcheur d'un jeu de données, sans rien demander. */
  datasetState(key: string): 'fresh' | 'stale' | 'pending' {
    return this.swr.read(key, BAZARR_SOFT_TTL_MS)?.state ?? 'pending';
  }

  /** Lecture d'un jeu de données : miss dur → `null` et reconstruction demandée. */
  #read(key: string, refreshKey: string): object | null {
    const hit = this.swr.read<unknown>(key, BAZARR_SOFT_TTL_MS);
    const value = hit?.value;
    if (hit === null || typeof value !== 'object' || value === null) {
      this.swr.requestRefresh(refreshKey);
      return null;
    }
    if (hit.state === 'stale') this.swr.requestRefresh(refreshKey);
    return value;
  }

  /** Badges des films : `hidden` hors instance unique, `pending` avant chargement. */
  movieStatusMap(): BazarrStatusMap {
    if (!this.#deps.gate('radarr')) return { state: 'hidden', items: {} };
    const map = this.#read(BAZARR_KEYS.movies, BAZARR_KEYS.movies) as StatusMap | null;
    return map === null ? { state: 'pending', items: {} } : { state: 'ready', items: map };
  }

  seriesStatusMap(): BazarrStatusMap {
    if (!this.#deps.gate('sonarr')) return { state: 'hidden', items: {} };
    const map = this.#read(BAZARR_KEYS.series, BAZARR_KEYS.series) as StatusMap | null;
    return map === null ? { state: 'pending', items: {} } : { state: 'ready', items: map };
  }

  movieCards(): { state: 'ready' | 'warming'; grid: GridDataset } {
    const grid = this.#read(BAZARR_KEYS.movieCards, BAZARR_KEYS.movies) as GridDataset | null;
    return grid === null
      ? { state: 'warming', grid: { cards: [], languages: [] } }
      : { state: 'ready', grid };
  }

  seriesCards(): { state: 'ready' | 'warming'; grid: GridDataset } {
    const grid = this.#read(BAZARR_KEYS.seriesCards, BAZARR_KEYS.series) as GridDataset | null;
    return grid === null
      ? { state: 'warming', grid: { cards: [], languages: [] } }
      : { state: 'ready', grid };
  }

  /** Candidats des deux types ; `warming` si l'un manque. */
  mostMissing(): { state: 'ready' | 'warming'; items: MissingCandidate[] } {
    const movies = this.#read(BAZARR_KEYS.mostMissingMovies, BAZARR_KEYS.movies) as
      MissingCandidate[] | null;
    const series = this.#read(BAZARR_KEYS.mostMissingSeries, BAZARR_KEYS.series) as
      MissingCandidate[] | null;
    if (movies === null || series === null) return { state: 'warming', items: [] };
    return { state: 'ready', items: [...movies, ...series] };
  }

  badgeCounts(): { state: 'ready' | 'warming'; counts: BazarrCounts } {
    const counts = this.#read(BAZARR_KEYS.badges, BAZARR_KEYS.badges) as BazarrCounts | null;
    return counts === null
      ? { state: 'warming', counts: { movies: 0, episodes: 0, providers: 0 } }
      : { state: 'ready', counts };
  }

  /**
   * Langues d'un film (fiche) : la carte en cache d'abord ; sur un miss dur,
   * une seule lecture de ce film. Tout échec rend « non suivi ».
   */
  async movieLanguagesSingle(radarrId: number): Promise<BazarrMovieSubtitles> {
    if (!this.#deps.gate('radarr')) return UNTRACKED;
    const status = this.#read(BAZARR_KEYS.movies, BAZARR_KEYS.movies) as StatusMap | null;
    const langs =
      this.swr.read<LangsMap>(BAZARR_KEYS.movieLangs, BAZARR_SOFT_TTL_MS)?.value ?? null;
    if (status !== null && langs !== null) return langs[radarrId] ?? UNTRACKED;
    try {
      const rows = await this.#deps.client().movies([radarrId]);
      const row = rows.find((candidate) => num(candidate.radarrId) === radarrId);
      return row === undefined ? UNTRACKED : extractMovieLangs(row);
    } catch {
      return UNTRACKED;
    }
  }

  /**
   * Après une mutation : relit l'élément seul, corrige les cartes en place
   * (sans rajeunir leur date) et journalise le correctif, puis demande la
   * reconstruction. Un échec laisse les cartes intactes.
   */
  async refreshItem(kind: 'movie' | 'series', id: number): Promise<void> {
    const key = kind === 'movie' ? BAZARR_KEYS.movies : BAZARR_KEYS.series;
    try {
      const client = this.#deps.client();
      const rows = kind === 'movie' ? await client.movies([id]) : await client.series([id]);
      const field = kind === 'movie' ? 'radarrId' : 'sonarrSeriesId';
      const row = rows.find((candidate) => num(candidate[field]) === id);
      if (row !== undefined) {
        const status = kind === 'movie' ? computeMovieStatus(row) : computeSeriesStatus(row);
        const langs = kind === 'movie' ? extractMovieLangs(row) : null;
        this.#journal({ at: this.swr.store.now(), kind, id, status, langs });
        this.#patchMap(key, id, status);
        if (langs !== null) this.#patchMap(BAZARR_KEYS.movieLangs, id, langs);
      } else {
        this.#deps.logger?.warn({ kind, id }, 'Bazarr per-id refresh: id not found in response');
      }
    } catch (error) {
      this.#deps.logger?.warn({ kind, id, err: error }, 'Bazarr per-id refresh failed');
    }
    this.requestRefresh(key);
  }

  #patchMap(key: string, id: number, value: unknown): void {
    const raw = this.swr.store.get(key) as { fetchedAt?: unknown; value?: unknown } | undefined;
    if (raw === undefined || typeof raw.fetchedAt !== 'number') return;
    if (raw.value === null || typeof raw.value !== 'object') return;
    this.swr.write(key, { ...raw.value, [id]: value }, BAZARR_HARD_TTL_MS, {
      fetchedAt: raw.fetchedAt,
    });
  }

  #patches(): Record<string, Patch> {
    const raw = this.swr.store.get(PATCHES_KEY);
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, Patch>) : {};
  }

  #journal(patch: Patch): void {
    const now = this.swr.store.now();
    const journal = Object.fromEntries(
      Object.entries(this.#patches()).filter(([, entry]) => now - entry.at < BAZARR_PATCH_TTL_MS),
    );
    journal[`${patch.kind}:${patch.id}`] = patch;
    this.swr.store.set(PATCHES_KEY, journal, BAZARR_PATCH_TTL_MS);
  }

  /** Réapplique sur une reconstruction les correctifs journalisés depuis son début. */
  applyPatchesNewerThan(
    kind: 'movie' | 'series',
    fetchStartedAt: number,
    status: StatusMap,
    langs: LangsMap,
  ): [StatusMap, LangsMap] {
    const nextStatus = { ...status };
    const nextLangs = { ...langs };
    for (const patch of Object.values(this.#patches())) {
      if (patch.kind !== kind || patch.at < fetchStartedAt) continue;
      nextStatus[patch.id] = patch.status;
      if (kind === 'movie' && patch.langs !== null) nextLangs[patch.id] = patch.langs;
    }
    return [nextStatus, nextLangs];
  }
}
