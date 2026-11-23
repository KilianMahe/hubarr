// SPDX-License-Identifier: AGPL-3.0-or-later
// Normalisation des réponses Sonarr pour le front : port de
// `SonarrClient::normalizeSeries`, `imageUrl`, `normalizeQueueRecords` et
// `normalizeCalendarEntries`. Mêmes clés et mêmes valeurs par défaut que
// l'original ; dates en ISO 8601.

import type { CalendarEpisode, SeasonSummary, Series, SeriesQueueItem } from '@hubarr/shared';
import { isoDate } from '../radarr/normalize';
import type {
  SonarrEpisodeResource,
  SonarrQueueResource,
  SonarrSeasonResource,
  SonarrSeriesResource,
} from './types';

const GIB = 1_073_741_824;

/** URL distante de la première image du type demandé (`poster`, `fanart`, `banner`). */
export function seriesImage(
  series: Pick<SonarrSeriesResource, 'images'> | null | undefined,
  coverType: string,
): string | null {
  for (const image of series?.images ?? []) {
    if (image.coverType === coverType) return image.remoteUrl ?? null;
  }
  return null;
}

/** « S01E02 » (zéros à gauche sur deux chiffres, comme l'original). */
export function episodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

/** Pourcentage arrondi comme `round()` de PHP (demi vers le haut), 0 sans dénominateur. */
function percentOf(files: number, total: number): number {
  return total > 0 ? Math.round((files / total) * 100) : 0;
}

function normalizeSeason(season: SonarrSeasonResource): SeasonSummary {
  const stats = season.statistics;
  const episodeCount = stats?.episodeCount ?? 0;
  const episodeFileCount = stats?.episodeFileCount ?? 0;
  return {
    seasonNumber: season.seasonNumber ?? 0,
    monitored: season.monitored ?? false,
    episodeCount,
    episodeFileCount,
    totalEpisodeCount: stats?.totalEpisodeCount ?? 0,
    sizeOnDisk: Math.trunc(stats?.sizeOnDisk ?? 0),
    percent: percentOf(episodeFileCount, episodeCount),
  };
}

export function normalizeSeries(s: SonarrSeriesResource): Series {
  const stats = s.statistics;
  const episodeCount = stats?.episodeCount ?? 0;
  const episodeFileCount = stats?.episodeFileCount ?? 0;
  const sizeBytes = stats?.sizeOnDisk ?? 0;
  return {
    id: s.id ?? null,
    tvdbId: s.tvdbId ?? null,
    tmdbId: s.tmdbId ?? null,
    imdbId: s.imdbId ?? null,
    title: s.title ?? '—',
    sortTitle: (s.sortTitle ?? s.title ?? '').toLowerCase(),
    year: s.year ?? null,
    overview: s.overview ?? null,
    poster: seriesImage(s, 'poster'),
    fanart: seriesImage(s, 'fanart'),
    banner: seriesImage(s, 'banner'),
    status: s.status ?? 'unknown',
    ended: s.ended ?? false,
    monitored: s.monitored ?? false,
    seriesType: s.seriesType ?? 'standard',
    // `seasonCount` n'est pas à la racine de la ressource : l'original
    // comptait donc toujours les saisons (spéciaux compris).
    seasonCount: (s.seasons ?? []).length,
    totalEpisodeCount: stats?.totalEpisodeCount ?? 0,
    episodeCount,
    episodeFileCount,
    percent: percentOf(episodeFileCount, episodeCount),
    sizeOnDisk: Math.trunc(sizeBytes),
    sizeGb: sizeBytes > 0 ? Math.round((sizeBytes / GIB) * 100) / 100 : null,
    runtime: s.runtime ?? null,
    certification: s.certification ?? null,
    network: s.network ?? null,
    airTime: s.airTime ?? null,
    path: s.path ?? null,
    qualityProfileId: s.qualityProfileId ?? null,
    rootFolderPath: s.rootFolderPath ?? null,
    seasonFolder: s.seasonFolder ?? true,
    monitorNewItems: s.monitorNewItems ?? 'all',
    tags: s.tags ?? [],
    genres: s.genres ?? [],
    ratings: s.ratings?.value ?? null,
    seasons: (s.seasons ?? []).map(normalizeSeason),
    addedAt: isoDate(s.added),
    firstAired: isoDate(s.firstAired),
    nextAiring: isoDate(s.nextAiring),
    previousAiring: isoDate(s.previousAiring),
    // Titres alternatifs (résolution torrent → série, P3d.4) : seulement s'il y en a.
    ...alternateTitlesOf(s),
  };
}

function alternateTitlesOf(s: SonarrSeriesResource): { alternateTitles?: string[] } {
  const titles = (s.alternateTitles ?? [])
    .map((alt) => alt.title ?? '')
    .filter((title) => title !== '' && title !== s.title);
  return titles.length > 0 ? { alternateTitles: [...new Set(titles)] } : {};
}

export function normalizeSeriesQueueRecord(r: SonarrQueueResource): SeriesQueueItem {
  const episode = r.episode;
  return {
    id: r.id ?? null,
    seriesId: r.seriesId ?? null,
    episodeId: r.episodeId ?? null,
    seriesTitle: r.series?.title ?? '—',
    episode:
      episode === undefined
        ? (r.title ?? '—')
        : `${episodeCode(episode.seasonNumber ?? 0, episode.episodeNumber ?? 0)} — ${episode.title ?? ''}`,
    size: r.size ?? 0,
    // `sizeleft` est marqué obsolète par la spec mais reste le seul champ servi.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    sizeleft: r.sizeleft ?? 0,
    status: r.status ?? 'unknown',
    trackedStatus: r.trackedDownloadStatus ?? 'ok',
    trackedState: r.trackedDownloadState ?? '',
    quality: r.quality?.quality?.name ?? '—',
    protocol: r.protocol ?? '—',
    eta: r.estimatedCompletionTime ?? null,
    indexer: r.indexer ?? null,
    downloadId: r.downloadId ?? null,
    outputPath: r.outputPath ?? null,
    downloadClient: r.downloadClient ?? null,
    statusMessages: (r.statusMessages ?? []).map((message) => ({
      title: message.title ?? '',
      messages: message.messages ?? [],
    })),
  };
}

/** Date locale « AAAA-MM-JJ » telle que Sonarr la donne (`airDate`), sinon tirée de l'instant. */
function localAirDate(entry: SonarrEpisodeResource): string | null {
  if (
    entry.airDate !== undefined &&
    entry.airDate !== null &&
    /^\d{4}-\d{2}-\d{2}/.test(entry.airDate)
  ) {
    return entry.airDate.slice(0, 10);
  }
  return isoDate(entry.airDateUtc)?.slice(0, 10) ?? null;
}

export function normalizeCalendarEntry(e: SonarrEpisodeResource): CalendarEpisode {
  const series = e.series;
  return {
    id: e.id ?? null,
    seriesId: e.seriesId ?? null,
    tvdbId: series?.tvdbId ?? null,
    tmdbId: series?.tmdbId ?? null,
    seriesTitle: series?.title ?? '—',
    poster: seriesImage(series, 'poster'),
    fanart: seriesImage(series, 'fanart'),
    season: e.seasonNumber ?? 0,
    episode: e.episodeNumber ?? 0,
    title: e.title ?? '—',
    overview: e.overview ?? series?.overview ?? null,
    airDate: localAirDate(e),
    airDateUtc: isoDate(e.airDateUtc),
    hasFile: e.hasFile ?? false,
    monitored: e.monitored ?? false,
    runtime: e.runtime ?? series?.runtime ?? null,
    network: series?.network ?? null,
    genres: series?.genres ?? [],
  };
}
