// SPDX-License-Identifier: AGPL-3.0-or-later
// Import manuel d'un élément de la file depuis le tableau de bord : lignes
// éditables tirées de l'aperçu de Radarr ou de Sonarr (un fichier par ligne),
// fichiers prêts à l'import et requête envoyée au serveur.

import type {
  ArrNamedItem,
  EpisodeManualImportFile,
  EpisodeManualImportRequest,
  MovieManualImportFile,
  MovieManualImportRequest,
} from '@hubarr/shared';

export type ArrService = 'radarr' | 'sonarr';

export interface ImportRow {
  path: string;
  name: string;
  size: number;
  rejections: string[];
  selected: boolean;
  /** Radarr : film choisi. */
  movie: { id: number; title: string; year: number | null } | null;
  /** Sonarr : série, saison et épisodes choisis. */
  series: { id: number; title: string } | null;
  seasonNumber: number | null;
  episodeIds: number[];
  /** Épisodes reconnus par Sonarr, pour l'affichage avant le chargement de la série. */
  episodeLabels: string[];
  qualityId: number | null;
  /** Qualité reconnue, ajoutée aux choix si l'instance ne la liste pas. */
  quality: ArrNamedItem | null;
  languages: ArrNamedItem[];
  releaseGroup: string;
}

export function episodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
}

function baseRow(file: MovieManualImportFile | EpisodeManualImportFile) {
  return {
    path: file.path,
    name: file.name,
    size: file.size,
    rejections: file.rejections,
    qualityId: file.quality?.id ?? null,
    quality: file.quality,
    languages: file.languages.map((language) => ({ ...language })),
    releaseGroup: file.releaseGroup ?? '',
  };
}

/**
 * Lignes de l'aperçu : comme dans Radarr et Sonarr, seuls les fichiers
 * reconnus et sans refus sont cochés d'emblée ; les autres se cochent à la main.
 */
export function movieRows(files: readonly MovieManualImportFile[]): ImportRow[] {
  return files.map((file) => {
    const row: ImportRow = {
      ...baseRow(file),
      selected: false,
      movie: file.movie,
      series: null,
      seasonNumber: null,
      episodeIds: [],
      episodeLabels: [],
    };
    row.selected = file.rejections.length === 0 && rowReady(row, 'radarr');
    return row;
  });
}

export function episodeRows(files: readonly EpisodeManualImportFile[]): ImportRow[] {
  return files.map((file) => {
    const row: ImportRow = {
      ...baseRow(file),
      selected: false,
      movie: null,
      series: file.series,
      seasonNumber: file.seasonNumber ?? file.episodes[0]?.seasonNumber ?? null,
      episodeIds: file.episodes.map((episode) => episode.id),
      episodeLabels: file.episodes.map(
        (episode) =>
          `${episodeCode(episode.seasonNumber, episode.episodeNumber)}${episode.title ? ` — ${episode.title}` : ''}`,
      ),
    };
    row.selected = file.rejections.length === 0 && rowReady(row, 'sonarr');
    return row;
  });
}

/** Correspondance complète : film (Radarr), série et au moins un épisode (Sonarr), qualité. */
export function rowReady(row: ImportRow, service: ArrService): boolean {
  if (row.qualityId === null) return false;
  return service === 'radarr'
    ? row.movie !== null
    : row.series !== null && row.episodeIds.length > 0;
}

/** Lignes cochées et complètes : ce qui part à l'import. */
export function importable(rows: readonly ImportRow[], service: ArrService): ImportRow[] {
  return rows.filter((row) => row.selected && rowReady(row, service));
}

function requestFile(row: ImportRow) {
  const group = row.releaseGroup.trim();
  return {
    path: row.path,
    qualityId: row.qualityId ?? 0,
    languages: row.languages.map(({ id, name }) => ({ id, name })),
    releaseGroup: group === '' ? null : group,
  };
}

export function movieImportRequest(rows: readonly ImportRow[]): MovieManualImportRequest {
  return {
    files: importable(rows, 'radarr').map((row) => ({
      ...requestFile(row),
      movieId: row.movie?.id ?? 0,
    })),
  };
}

export function episodeImportRequest(rows: readonly ImportRow[]): EpisodeManualImportRequest {
  return {
    files: importable(rows, 'sonarr').map((row) => ({
      ...requestFile(row),
      seriesId: row.series?.id ?? 0,
      episodeIds: [...row.episodeIds],
    })),
  };
}
