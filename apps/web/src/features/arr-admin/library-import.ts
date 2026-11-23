// SPDX-License-Identifier: AGPL-3.0-or-later
// Import de bibliothèque (`radarr/library_import.html.twig`,
// `sonarr/library_import`) : nom de recherche tiré du dossier, lignes du scan,
// recherche et ajout par les routes de la bibliothèque (P2, P3a), options
// communes appliquées à toutes les lignes.

import type { ArrKind, MovieAddRequest, SeriesAddRequest } from '@hubarr/shared';
import { moviesApi } from '../movies/movies-api';
import { seriesApi } from '../series/series-api';

/** Correspondance trouvée pour un dossier. */
export interface ImportMatch {
  /** Identifiant TMDB (film) ou TVDB (série). */
  externalId: number;
  title: string;
  year: number | null;
  /** Déjà dans l'instance. */
  existing: boolean;
}

export type ImportStatus = 'pending' | 'searching' | 'imported' | 'error';

export interface ImportRow {
  name: string;
  path: string;
  checked: boolean;
  match: ImportMatch | null;
  candidates: ImportMatch[];
  status: ImportStatus;
  /** Films : `movieOnly`/`none` ; séries : moniteur de Sonarr. */
  monitor: string;
  /** Films : disponibilité minimum. */
  availability: string;
  /** Séries : type, dossiers de saison. */
  seriesType: string;
  seasonFolder: boolean;
  qualityProfileId: number | null;
}

/**
 * Terme de recherche d'un dossier : pour un film, sans l'année entre
 * parenthèses ni ce qui suit, ni les étiquettes de qualité (comme
 * l'original) ; pour une série, le nom tel quel.
 */
export function searchTerm(kind: ArrKind, name: string): string {
  if (kind === 'sonarr') return name.trim();
  return name
    .replace(/\s*\(\d{4}\).*$/, '')
    .replace(/\s+(WEBDL|WEBRip|Bluray|HDTV|Remux).*$/i, '')
    .trim();
}

export interface ImportDefaults {
  monitor: string;
  availability: string;
  seriesType: string;
  seasonFolder: boolean;
  qualityProfileId: number | null;
}

export function defaultOptions(kind: ArrKind, qualityProfileId: number | null): ImportDefaults {
  return {
    monitor: kind === 'radarr' ? 'movieOnly' : 'all',
    availability: 'released',
    seriesType: 'standard',
    seasonFolder: true,
    qualityProfileId,
  };
}

export function importRows(
  folders: readonly { name: string; path: string }[],
  defaults: ImportDefaults,
): ImportRow[] {
  return folders.map((folder) => ({
    name: folder.name,
    path: folder.path,
    checked: false,
    match: null,
    candidates: [],
    status: 'searching',
    ...defaults,
  }));
}

/** Recherche d'un titre dans l'instance (routes de la bibliothèque). */
export async function lookup(kind: ArrKind, slug: string, term: string): Promise<ImportMatch[]> {
  if (term.trim().length < 2) return [];
  if (kind === 'radarr') {
    const movies = await moviesApi.lookup(slug, term);
    return movies.flatMap((movie) =>
      movie.tmdbId === null || movie.tmdbId <= 0
        ? []
        : [
            {
              externalId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              existing: movie.id !== null,
            },
          ],
    );
  }
  const series = await seriesApi.lookup(slug, term);
  return series.flatMap((entry) =>
    entry.tvdbId === null || entry.tvdbId <= 0
      ? []
      : [
          {
            externalId: entry.tvdbId,
            title: entry.title,
            year: entry.year,
            existing: entry.id !== null,
          },
        ],
  );
}

/** Ajout d'une ligne : chemin du dossier pour un film, dossier racine scanné pour une série. */
export function moviePayload(row: ImportRow, folder: string): MovieAddRequest | null {
  if (row.match === null) return null;
  return {
    tmdbId: row.match.externalId,
    title: row.match.title,
    year: row.match.year ?? 0,
    qualityProfileId: row.qualityProfileId ?? 0,
    rootFolderPath: folder,
    path: row.path,
    monitored: row.monitor !== 'none',
    minimumAvailability: row.availability as MovieAddRequest['minimumAvailability'],
    searchForMovie: false,
  };
}

export function seriesPayload(row: ImportRow, folder: string): SeriesAddRequest | null {
  if (row.match === null) return null;
  return {
    tvdbId: row.match.externalId,
    rootFolderPath: folder,
    qualityProfileId: row.qualityProfileId ?? 0,
    seriesType: row.seriesType as SeriesAddRequest['seriesType'],
    monitor: row.monitor as SeriesAddRequest['monitor'],
    monitored: true,
    seasonFolder: row.seasonFolder,
    searchForMissing: false,
  };
}

/** Ajoute une ligne à l'instance ; renvoie le nouvel état de la ligne. */
export async function importRow(
  kind: ArrKind,
  slug: string,
  row: ImportRow,
  folder: string,
): Promise<ImportStatus> {
  try {
    if (kind === 'radarr') {
      const body = moviePayload(row, folder);
      if (body === null) return 'error';
      await moviesApi.add(slug, body);
    } else {
      const body = seriesPayload(row, folder);
      if (body === null) return 'error';
      await seriesApi.add(slug, body);
    }
    return 'imported';
  } catch {
    return 'error';
  }
}
