// SPDX-License-Identifier: AGPL-3.0-or-later
// Normalisation des ressources de la fiche série (P3a.2) : épisodes, fichiers,
// historique, releases, renommage. L'original renvoyait les ressources brutes ;
// Hubarr n'expose que ce que le front affiche, sans URL de
// l'instance.

import type {
  Episode,
  EpisodeFile,
  SeriesBlocklistItem,
  SeriesHistoryItem,
  SeriesRelease,
  SeriesRenameProposal,
} from '@hubarr/shared';
import { normalizeRelease } from '../radarr/normalize-detail';
import { isoDate } from '../radarr/normalize';
import type { components as RadarrComponents } from '../radarr/openapi';
import type {
  SonarrBlocklistResource,
  SonarrEpisodeFileResource,
  SonarrEpisodeResource,
  SonarrHistoryResource,
  SonarrReleaseResource,
  SonarrRenameEpisodeResource,
} from './types';

function text(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value;
}

function named(item: { id?: number; name?: string | null } | null | undefined) {
  if (item?.id === undefined) return null;
  return { id: item.id, name: item.name ?? '?' };
}

/** Date locale « AAAA-MM-JJ » de Sonarr, sinon tirée de l'instant. */
function localDate(airDate: string | null | undefined, airDateUtc: string | null | undefined) {
  if (airDate && /^\d{4}-\d{2}-\d{2}/.test(airDate)) return airDate.slice(0, 10);
  return isoDate(airDateUtc)?.slice(0, 10) ?? null;
}

export function normalizeEpisode(episode: SonarrEpisodeResource): Episode {
  return {
    id: episode.id ?? 0,
    seriesId: episode.seriesId ?? null,
    seasonNumber: episode.seasonNumber ?? 0,
    episodeNumber: episode.episodeNumber ?? 0,
    title: text(episode.title),
    airDate: localDate(episode.airDate, episode.airDateUtc),
    airDateUtc: isoDate(episode.airDateUtc),
    overview: text(episode.overview),
    hasFile: episode.hasFile ?? false,
    monitored: episode.monitored ?? false,
    episodeFileId: episode.episodeFileId ?? 0,
    runtime: episode.runtime ?? null,
  };
}

export function normalizeEpisodeFile(file: SonarrEpisodeFileResource): EpisodeFile {
  const media = file.mediaInfo ?? null;
  return {
    id: file.id ?? 0,
    seriesId: file.seriesId ?? null,
    seasonNumber: file.seasonNumber ?? 0,
    relativePath: text(file.relativePath),
    path: text(file.path),
    size: file.size ?? 0,
    dateAdded: isoDate(file.dateAdded),
    quality: named(file.quality?.quality),
    qualityVersion: file.quality?.revision?.version ?? 1,
    languages: (file.languages ?? []).flatMap((language) => {
      const value = named(language);
      return value === null ? [] : [value];
    }),
    releaseGroup: text(file.releaseGroup),
    releaseType: file.releaseType ?? null,
    indexerFlags: file.indexerFlags ?? 0,
    customFormats: (file.customFormats ?? []).map((format) => format.name ?? '?'),
    customFormatScore: file.customFormatScore ?? 0,
    mediaInfo:
      media === null
        ? null
        : {
            videoCodec: text(media.videoCodec),
            videoBitDepth: media.videoBitDepth ?? null,
            videoDynamicRange: text(media.videoDynamicRange),
            videoFps: media.videoFps ?? null,
            resolution: text(media.resolution),
            runTime: text(media.runTime),
            scanType: text(media.scanType),
            audioCodec: text(media.audioCodec),
            audioChannels: media.audioChannels ?? null,
            audioLanguages: text(media.audioLanguages),
            subtitles: text(media.subtitles),
          },
  };
}

export function normalizeSeriesHistoryItem(item: SonarrHistoryResource): SeriesHistoryItem {
  const data = item.data ?? {};
  const episode = item.episode;
  return {
    id: item.id ?? 0,
    seriesId: item.seriesId ?? null,
    episodeId: item.episodeId ?? null,
    eventType: item.eventType ?? 'unknown',
    date: isoDate(item.date),
    quality: item.quality?.quality?.name ?? null,
    sourceTitle: text(item.sourceTitle),
    episode:
      episode === undefined
        ? null
        : {
            seasonNumber: episode.seasonNumber ?? 0,
            episodeNumber: episode.episodeNumber ?? 0,
            title: text(episode.title),
          },
    series: item.series === undefined ? null : { title: item.series.title ?? '—' },
    indexer: text(data.indexer),
    releaseTitle: text(data.releaseTitle),
    importedPath: text(data.importedPath),
    downloadClient: text(data.downloadClientName ?? data.downloadClient),
    protocol: text(data.protocol),
    reason: text(data.reason ?? data.message),
  };
}

/** Release Sonarr : forme commune (`normalizeRelease`), plus saison et épisodes. */
export function normalizeSeriesRelease(
  release: SonarrReleaseResource,
  scores: ReadonlyMap<number, number>,
): SeriesRelease {
  // Les champs communs ont la même forme dans les deux specs.
  const common = normalizeRelease(
    release as unknown as RadarrComponents['schemas']['ReleaseResource'],
    scores,
  );
  return {
    ...common,
    fullSeason: release.fullSeason ?? false,
    episodeRequested: release.episodeRequested ?? true,
    seasonNumber: release.seasonNumber ?? null,
    episodeNumbers: release.episodeNumbers ?? [],
    mappedSeasonNumber: release.mappedSeasonNumber ?? null,
    mappedEpisodeNumbers: release.mappedEpisodeNumbers ?? [],
    releaseGroup: release.releaseGroup ?? '',
  };
}

export function normalizeRenameProposal(
  proposal: SonarrRenameEpisodeResource,
): SeriesRenameProposal {
  return {
    episodeFileId: proposal.episodeFileId ?? null,
    seasonNumber: proposal.seasonNumber ?? 0,
    episodeNumbers: proposal.episodeNumbers ?? [],
    existingPath: text(proposal.existingPath),
    newPath: text(proposal.newPath),
  };
}

/** Release de la liste de blocage ; titre de la série inclus, sinon tiré de `titles`. */
export function normalizeSeriesBlocklistItem(
  item: SonarrBlocklistResource,
  titles: ReadonlyMap<number, string>,
): SeriesBlocklistItem {
  const seriesId = item.seriesId ?? null;
  return {
    id: item.id ?? 0,
    seriesId,
    seriesTitle:
      text(item.series?.title) ?? (seriesId === null ? null : (titles.get(seriesId) ?? null)),
    sourceTitle: text(item.sourceTitle),
    quality: item.quality?.quality?.name ?? null,
    date: isoDate(item.date),
    protocol: item.protocol ?? null,
    indexer: text(item.indexer),
    message: text(item.message),
    languages: (item.languages ?? []).map((language) => language.name ?? '?'),
  };
}
