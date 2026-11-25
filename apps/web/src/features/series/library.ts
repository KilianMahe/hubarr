// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique pure de la bibliothèque de séries (P3a.1) : critères ↔ URL, état
// affiché d'une série (pastille et barre de progression de `series.html.twig`),
// étagères, commandes reprises au chargement. La pagination, la
// sélection par plage et la lecture des messages de commande viennent des films.

import { formatGb } from '../../app/format';
import {
  parseSeriesLibraryQuery,
  seriesLibraryQueryParams,
  type SeriesLibraryItem,
  type SeriesLibraryQuery,
} from '@hubarr/shared';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';

// ── Critères ↔ URL ──────────────────────────────────────────────────────────

export function seriesQueryFromRoute(
  query: LocationQuery,
  defaultPerPage: number,
): SeriesLibraryQuery {
  return parseSeriesLibraryQuery(query, defaultPerPage);
}

/** Paramètres d'URL propres : valeurs par défaut retirées, page seulement au-delà de 1. */
export function seriesRouteQueryOf(
  query: SeriesLibraryQuery,
  defaultPerPage: number,
  page = 1,
): LocationQueryRaw {
  const params: LocationQueryRaw = seriesLibraryQueryParams(query, defaultPerPage);
  if (page > 1) params.page = String(page);
  return params;
}

/** Paramètres de l'API (page et lien profond compris). */
export function seriesApiParamsOf(query: SeriesLibraryQuery, open?: number): URLSearchParams {
  const params = new URLSearchParams(seriesLibraryQueryParams(query, -1));
  if (query.page > 1) params.set('page', String(query.page));
  if (open !== undefined && open > 0) params.set('open', String(open));
  return params;
}

// ── État d'une série ────────────────────────────────────────────────────────

/**
 * Pastille de la carte, dans l'ordre de l'original : non suivie sans fichier,
 * à venir, à jour (complète et en cours), complète, épisodes manquants, sinon
 * non suivie.
 */
export type SeriesDisplayState = 'unmonitored' | 'upcoming' | 'upToDate' | 'complete' | 'missing';

type StateFields = Pick<
  SeriesLibraryItem,
  'monitored' | 'episodeFileCount' | 'status' | 'percent' | 'episodeCount'
>;

export function seriesDisplayState(series: StateFields): SeriesDisplayState {
  if (!series.monitored && series.episodeFileCount === 0) return 'unmonitored';
  if (series.status === 'upcoming') return 'upcoming';
  if (series.percent === 100 && series.status === 'continuing') return 'upToDate';
  if (series.percent === 100) return 'complete';
  if (series.percent < 100 && series.episodeCount > 0) return 'missing';
  return 'unmonitored';
}

/** Couleur Vuetify de chaque état (gris, violet, bleu ciel, vert, rouge dans l'original). */
export const SERIES_STATE_COLORS: Record<SeriesDisplayState, string> = {
  unmonitored: 'muted',
  upcoming: 'secondary',
  upToDate: 'info',
  complete: 'success',
  missing: 'error',
};

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Infobulle de la pastille (`media.series.status.*`). */
export function seriesStateTitle(t: Translate, series: StateFields): string {
  const files = series.episodeFileCount;
  const total = series.episodeCount;
  switch (seriesDisplayState(series)) {
    case 'unmonitored':
      return t('media.series.status.not_monitored');
    case 'upcoming':
      return t('media.series.status.upcoming');
    case 'upToDate':
      return t('media.series.status.up_to_date_tpl', { files, total });
    case 'complete':
      return t('media.series.status.complete_tpl', { files, total });
    case 'missing':
      return t('media.series.status.missing_tpl', { count: total - files });
  }
}

/** Infobulle de la barre de progression (version détaillée). */
export function seriesProgressTitle(
  t: Translate,
  series: StateFields & Pick<SeriesLibraryItem, 'totalEpisodeCount'>,
): string {
  const files = series.episodeFileCount;
  const total = series.episodeCount;
  switch (seriesDisplayState(series)) {
    case 'upcoming':
      return t('media.series.status.upcoming_tpl', { total: series.totalEpisodeCount });
    case 'upToDate':
      return t('media.series.status.up_to_date_detail_tpl', { files, total });
    case 'complete':
      return t('media.series.status.complete_detail_tpl', { files, total });
    case 'missing':
      return t('media.series.status.missing_detail_tpl', { count: total - files, files, total });
    case 'unmonitored':
      return `${files}/${total} ${t('media.series.status.episodes_suffix')}`;
  }
}

/** Barre de progression affichée : épisodes diffusés, ou série à venir (pleine). */
export function progressWidth(series: Pick<SeriesLibraryItem, 'status' | 'percent'>): number {
  return series.status === 'upcoming' ? 100 : series.percent;
}

export function hasProgressBar(
  series: Pick<SeriesLibraryItem, 'status' | 'episodeCount'>,
): boolean {
  return series.episodeCount > 0 || series.status === 'upcoming';
}

/** Statut de diffusion (puce du tableau) : en cours, terminée, à venir, sinon brut. */
export function airingStatusKey(status: string): string | null {
  if (status === 'continuing') return 'media.series.status.continuing';
  if (status === 'ended') return 'media.series.status.ended';
  if (status === 'upcoming') return 'media.series.status.upcoming';
  return null;
}

export const AIRING_STATUS_COLORS: Record<string, string> = {
  continuing: 'success',
  ended: 'muted',
  upcoming: 'secondary',
};

// ── Étagères ────────────────────────────────────────────────────────────────

export type SeriesShelfKey = 'continuing' | 'anime' | 'ended' | 'upcoming' | 'unmonitored';
export const SERIES_SHELF_KEYS: readonly SeriesShelfKey[] = [
  'continuing',
  'anime',
  'ended',
  'upcoming',
  'unmonitored',
];

/** Libellé de chaque étagère (`buildShelfView` d'origine). */
export const SERIES_SHELF_LABELS: Record<SeriesShelfKey, string> = {
  continuing: 'media.series.status.continuing',
  anime: 'media.series.status.anime',
  ended: 'media.series.status.ended',
  upcoming: 'media.series.status.upcoming',
  unmonitored: 'media.series.status.unfollowed',
};

/**
 * Séries de la page groupées par étagère : un animé figure aussi dans son
 * étagère de statut (s'il est suivi), comme l'original ; les étagères vides
 * disparaissent.
 */
export function seriesShelvesOf<
  S extends Pick<SeriesLibraryItem, 'seriesType' | 'monitored' | 'status'>,
>(items: readonly S[]): { key: SeriesShelfKey; items: S[] }[] {
  const groups: Record<SeriesShelfKey, S[]> = {
    continuing: [],
    anime: [],
    ended: [],
    upcoming: [],
    unmonitored: [],
  };
  for (const item of items) {
    if (item.seriesType === 'anime') groups.anime.push(item);
    if (!item.monitored) {
      groups.unmonitored.push(item);
      continue;
    }
    if (item.status === 'continuing') groups.continuing.push(item);
    else if (item.status === 'ended') groups.ended.push(item);
    else if (item.status === 'upcoming') groups.upcoming.push(item);
  }
  return SERIES_SHELF_KEYS.filter((key) => groups[key].length > 0).map((key) => ({
    key,
    items: groups[key],
  }));
}

// ── Commandes ───────────────────────────────────────────────────────────────

/** Commandes dont le suivi reprend au chargement de la page (`POLL_COMMANDS`). */
export const SERIES_TRACKED_COMMANDS: Record<string, string> = {
  SeriesSearch: 'media.series.detail.search_series',
  SeasonSearch: 'media.series.detail.search_cmd_season',
  EpisodeSearch: 'media.series.detail.search_cmd_episode',
  RenameFiles: 'media.series.detail.search_cmd_rename',
  MissingEpisodeSearch: 'media.series.detail.search_missing_short',
};

/** « S01E02 » (deux chiffres au moins). */
export function episodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

/** Taille lisible comme l'original : Go (To au-delà de 1 024 Go, V29), sinon Mo. */
export function seriesSize(t: Translate, bytes: number): string {
  if (bytes <= 0) return '0';
  const gb = bytes / 1_073_741_824;
  if (gb >= 1) return formatGb(gb);
  return `${(bytes / 1_048_576).toFixed(0)} ${t('media.series.stats.mo_suffix')}`;
}
