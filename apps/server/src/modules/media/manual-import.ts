// SPDX-License-Identifier: AGPL-3.0-or-later
// Import manuel d'un téléchargement de la file (Radarr, Sonarr) : réduction de
// l'aperçu de l'instance, puis fichiers de la commande `ManualImport`. Chaque
// fichier demandé doit figurer dans l'aperçu du téléchargement (aucun chemin
// arbitraire) ; l'aperçu fournit ce que le navigateur ne choisit pas (drapeaux
// d'indexeur, formats personnalisés, type de release, révision de la qualité).

import type {
  EpisodeManualImportFile,
  MovieManualImportFile,
  MovieManualImportRequest,
  EpisodeManualImportRequest,
} from '@hubarr/shared';
import { ApiError } from '../../http/errors';

interface QualityModel {
  quality?: { id?: number; name?: string | null };
  revision?: unknown;
}

/** Champs communs aux ressources `ManualImportResource` de Radarr et de Sonarr. */
export interface PreviewResource {
  path?: string | null;
  relativePath?: string | null;
  name?: string | null;
  size?: number;
  quality?: QualityModel;
  languages?: { id?: number; name?: string | null }[] | null;
  releaseGroup?: string | null;
  rejections?: { reason?: string | null }[] | null;
  downloadId?: string | null;
  folderName?: string | null;
  indexerFlags?: number;
  customFormats?: unknown[] | null;
  customFormatScore?: number;
}

export interface MoviePreviewResource extends PreviewResource {
  movie?: { id?: number; title?: string | null; year?: number };
}

export interface EpisodePreviewResource extends PreviewResource {
  series?: { id?: number; title?: string | null };
  seasonNumber?: number | null;
  releaseType?: unknown;
  episodes?:
    { id?: number; seasonNumber?: number; episodeNumber?: number; title?: string | null }[] | null;
}

export interface QualityDefinitionResource {
  quality?: { id?: number; name?: string | null };
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function previewBase(resource: PreviewResource) {
  const path = resource.path ?? '';
  const quality = resource.quality?.quality;
  return {
    path,
    name: resource.relativePath ?? resource.name ?? baseName(path),
    size: resource.size ?? 0,
    quality:
      quality?.id === undefined
        ? null
        : { id: quality.id, name: quality.name ?? String(quality.id) },
    languages: (resource.languages ?? []).flatMap((language) =>
      language.id === undefined ? [] : [{ id: language.id, name: language.name ?? '' }],
    ),
    releaseGroup: resource.releaseGroup ?? null,
    rejections: (resource.rejections ?? []).flatMap((rejection) =>
      rejection.reason ? [rejection.reason] : [],
    ),
  };
}

export function normalizeMoviePreview(resource: MoviePreviewResource): MovieManualImportFile {
  const movie = resource.movie;
  return {
    ...previewBase(resource),
    movie:
      movie?.id === undefined || movie.id === 0
        ? null
        : {
            id: movie.id,
            title: movie.title ?? '',
            year: movie.year === undefined || movie.year === 0 ? null : movie.year,
          },
  };
}

export function normalizeEpisodePreview(resource: EpisodePreviewResource): EpisodeManualImportFile {
  const series = resource.series;
  return {
    ...previewBase(resource),
    series:
      series?.id === undefined || series.id === 0
        ? null
        : { id: series.id, title: series.title ?? '' },
    seasonNumber: resource.seasonNumber ?? null,
    episodes: (resource.episodes ?? []).flatMap((episode) =>
      episode.id === undefined
        ? []
        : [
            {
              id: episode.id,
              seasonNumber: episode.seasonNumber ?? 0,
              episodeNumber: episode.episodeNumber ?? 0,
              title: episode.title ?? null,
            },
          ],
    ),
  };
}

/** Aperçu du fichier demandé, sinon refus : le chemin n'appartient pas au téléchargement. */
function previewOf<T extends PreviewResource>(previews: readonly T[], path: string): T {
  const found = previews.find((preview) => preview.path === path);
  if (found === undefined) {
    throw new ApiError(400, 'VALIDATION', {
      message: 'media.api.manual_import_unknown_file',
    });
  }
  return found;
}

/**
 * Qualité de l'import : celle de l'aperçu si l'id ne change pas (révision
 * comprise), sinon celle de la définition choisie avec la révision de l'aperçu.
 */
function qualityFor(
  preview: PreviewResource,
  qualityId: number,
  definitions: readonly QualityDefinitionResource[],
): QualityModel {
  if (preview.quality?.quality?.id === qualityId) return preview.quality;
  const quality = definitions.find((definition) => definition.quality?.id === qualityId)
    ?.quality ?? { id: qualityId };
  return {
    quality,
    revision: preview.quality?.revision ?? { version: 1, real: 0, isRepack: false },
  };
}

function importBase(
  preview: PreviewResource,
  file: {
    path: string;
    qualityId: number;
    languages: { id: number; name: string }[];
    releaseGroup: string | null;
  },
  definitions: readonly QualityDefinitionResource[],
  downloadId: string | null,
) {
  return {
    path: file.path,
    folderName: preview.folderName ?? null,
    quality: qualityFor(preview, file.qualityId, definitions),
    languages: file.languages,
    releaseGroup: file.releaseGroup ?? '',
    indexerFlags: preview.indexerFlags ?? 0,
    downloadId: preview.downloadId ?? downloadId,
    customFormats: preview.customFormats ?? [],
    customFormatScore: preview.customFormatScore ?? 0,
  };
}

export function movieImportFiles(
  previews: readonly MoviePreviewResource[],
  request: MovieManualImportRequest,
  definitions: readonly QualityDefinitionResource[],
  downloadId: string | null,
): Record<string, unknown>[] {
  return request.files.map((file) => {
    const preview = previewOf(previews, file.path);
    return {
      ...importBase(preview, file, definitions, downloadId),
      movieId: file.movieId,
    };
  });
}

export function episodeImportFiles(
  previews: readonly EpisodePreviewResource[],
  request: EpisodeManualImportRequest,
  definitions: readonly QualityDefinitionResource[],
  downloadId: string | null,
): Record<string, unknown>[] {
  return request.files.map((file) => {
    const preview = previewOf(previews, file.path);
    return {
      ...importBase(preview, file, definitions, downloadId),
      seriesId: file.seriesId,
      episodeIds: file.episodeIds,
      // Type de release cohérent avec les épisodes choisis (un pack de saison le reste).
      releaseType:
        file.episodeIds.length === 1
          ? 'singleEpisode'
          : preview.releaseType === 'seasonPack'
            ? 'seasonPack'
            : 'multiEpisode',
    };
  });
}
