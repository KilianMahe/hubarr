// SPDX-License-Identifier: AGPL-3.0-or-later
// Normalisation des réponses Radarr pour le front : port de
// `RadarrClient::normalizeMovie`, `imageUrl` et `normalizeQueueRecords`.
// Mêmes clés et mêmes valeurs par défaut que l'original ; dates en ISO 8601
//.

import type { Movie, MovieQueueItem } from '@hubarr/shared';
import type { RadarrMovieResource, RadarrQueueResource } from './types';

const GIB = 1_073_741_824;

/** URL distante de la première image du type demandé (`poster`, `fanart`…). */
export function imageUrl(movie: RadarrMovieResource, coverType: string): string | null {
  for (const image of movie.images ?? []) {
    if (image.coverType === coverType) return image.remoteUrl ?? null;
  }
  return null;
}

/** Date ISO 8601 normalisée, `null` si absente ou illisible. */
export function isoDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function languageNames(
  languages: readonly { name?: string | null }[] | null | undefined,
): string[] {
  return (languages ?? []).map((language) => language.name ?? '—');
}

export function normalizeMovie(m: RadarrMovieResource): Movie {
  const sizeBytes = m.sizeOnDisk ?? 0;
  const mf = m.movieFile ?? null;
  const mi = mf?.mediaInfo ?? null;
  const fileLanguages = mf?.languages ?? [];

  return {
    id: m.id ?? null,
    tmdbId: m.tmdbId ?? null,
    imdbId: m.imdbId ?? null,
    title: m.title ?? '—',
    originalTitle: m.originalTitle ?? null,
    sortTitle: (m.sortTitle ?? m.title ?? '').toLowerCase(),
    year: m.year ?? null,
    overview: m.overview ?? null,
    poster: imageUrl(m, 'poster'),
    fanart: imageUrl(m, 'fanart'),
    certification: m.certification ?? null,
    studio: m.studio ?? null,
    path: m.path ?? null,
    status: m.status ?? 'unknown',
    hasFile: m.hasFile ?? false,
    monitored: m.monitored ?? false,
    quality: mf?.quality?.quality?.name ?? null,
    qualityProfileId: m.qualityProfileId ?? null,
    minimumAvailability: m.minimumAvailability ?? 'released',
    alternateTitles: (m.alternateTitles ?? []).map((title) => ({
      title: title.title ?? '',
      sourceType: title.sourceType ?? '',
      // Champ disparu des versions récentes de Radarr ; gardé pour l'original.
      sourceId: (title as { sourceId?: number | null }).sourceId ?? null,
    })),
    rootFolderPath: m.rootFolderPath ?? null,
    tags: m.tags ?? [],
    added: m.added ?? null,
    language: fileLanguages[0]?.name ?? null,
    languages: languageNames(fileLanguages),
    collection:
      m.collection === undefined
        ? null
        : { id: m.collection.tmdbId ?? null, title: m.collection.title ?? null },
    sizeOnDisk: Math.trunc(sizeBytes),
    sizeGb: sizeBytes > 0 ? Math.round((sizeBytes / GIB) * 100) / 100 : null,
    addedAt: isoDate(m.added),
    inCinemasAt: isoDate(m.inCinemas),
    digitalAt: isoDate(m.digitalRelease),
    physicalAt: isoDate(m.physicalRelease),
    genres: m.genres ?? [],
    runtime: m.runtime ?? null,
    ratings: m.ratings?.tmdb?.value ?? null,
    ratingsImdb: m.ratings?.imdb?.value ?? null,
    ratingsImdbVotes: m.ratings?.imdb?.votes ?? null,
    ratingsTmdb: m.ratings?.tmdb?.value ?? null,
    ratingsTmdbVotes: m.ratings?.tmdb?.votes ?? null,
    movieFile:
      mf === null
        ? null
        : {
            size: mf.size ?? null,
            relativePath: mf.relativePath ?? null,
            quality: mf.quality?.quality?.name ?? null,
            releaseGroup: mf.releaseGroup ?? null,
            customFormats: (mf.customFormats ?? []).map((format) => format.name ?? '?'),
            customFormatScore: mf.customFormatScore ?? 0,
            languages: languageNames(fileLanguages),
            mediaInfo:
              mi === null
                ? null
                : {
                    videoCodec: mi.videoCodec ?? null,
                    videoBitrate: mi.videoBitrate ?? null,
                    videoBitDepth: mi.videoBitDepth ?? null,
                    videoFps: mi.videoFps ?? null,
                    videoDynamicRange: mi.videoDynamicRange ?? null,
                    resolution: mi.resolution ?? null,
                    runTime: mi.runTime ?? null,
                    audioCodec: mi.audioCodec ?? null,
                    audioBitrate: mi.audioBitrate ?? null,
                    audioChannels: mi.audioChannels ?? null,
                    subtitles: mi.subtitles ?? null,
                  },
          },
  };
}

export function normalizeQueueRecord(r: RadarrQueueResource): MovieQueueItem {
  return {
    id: r.id ?? null,
    movieId: r.movieId ?? null,
    title: r.movie?.title ?? r.title ?? '—',
    year: r.movie?.year ?? null,
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
