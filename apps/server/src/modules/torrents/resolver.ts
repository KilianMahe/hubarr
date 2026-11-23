// SPDX-License-Identifier: AGPL-3.0-or-later
// Résolution d'un torrent vers sa fiche Radarr ou Sonarr (P3d.4) : port de
// `TorrentResolverService`.
//
// Le nom de la release est réduit à « titre + année », puis comparé à tous les
// titres connus de chaque film (titre, titre original, titres alternatifs) ou
// série, sur **toutes** les instances actives : égalité = 100, inclusion
// (4 caractères au moins des deux côtés) = 70, + 20 si l'année concorde ; seuil
// à 70. Une instance injoignable est ignorée ; aucune joignable → échec.
//
// Écart : les bibliothèques sont lues dans le **cache** des
// bibliothèques (comme la page affichée), au lieu d'un `getRawMovies()`
// complet à chaque clic ; motif de l'échec en code (`reason`).

import type { Movie, Series, TorrentResolve } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { LIBRARY_TIMEOUT_MS } from '../../integrations/radarr/client';
import { LIBRARY_TIMEOUT_MS as SERIES_LIBRARY_TIMEOUT_MS } from '../../integrations/sonarr/client';
import { listEnabledInstances, type InstanceRow } from '../instances/instances';
import { radarrClient, sonarrClient } from '../services/clients';

export const MIN_SCORE = 70;
const MIN_CONTAINS_LEN = 4;

const MARKERS =
  '2160p|1080p|720p|480p|BluRay|WEBRip|WEB-DL|HDRip|DVDRip|BDRip|REMUX|DV|HDR|x264|x265|H\\.?264|H\\.?265|HEVC|S\\d{2}E?\\d*|COMPLETE';
const YEAR_RE = new RegExp(`\\b(19\\d{2}|20\\d{2})\\b(?=[^0-9]*(?:\\b(?:${MARKERS})\\b|$))`, 'i');
const QUALITY_RE =
  /\b(?:2160p|1080p|720p|480p|BluRay|WEBRip|WEB-DL|HDRip|DVDRip|BDRip|S\d{2}E\d{2})\b/i;

/** Titre et année d'un nom de release (`parseReleaseName`). */
export function parseReleaseName(raw: string): { title: string; year: number | null } {
  let clean = raw.replace(/[._]+/g, ' ');
  let year: number | null = null;
  const match = YEAR_RE.exec(clean);
  if (match?.[1] !== undefined) {
    year = Number(match[1]);
    clean = clean.slice(0, match.index).trim();
  } else {
    const cut = QUALITY_RE.exec(clean);
    if (cut) clean = clean.slice(0, cut.index);
  }
  return { title: clean.replace(/\s+/g, ' ').trim(), year };
}

const FOLDS: Record<string, string> = {
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ß: 'ss',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  đ: 'd',
};

/** Repli ASCII en minuscules, ponctuation → espaces (`normalizeTitle`). */
export function normalizeTitle(value: string): string {
  const folded = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[æœøßðþłđ]/g, (char) => FOLDS[char] ?? char);
  return folded.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Score d'un titre de la bibliothèque (`scoreMatch`). */
export function scoreMatch(
  libTitle: string,
  needle: string,
  libYear: number | null,
  parsedYear: number | null,
): number {
  const title = normalizeTitle(libTitle);
  if (title === '') return 0;
  let score = 0;
  if (title === needle) score = 100;
  else if (
    needle.length >= MIN_CONTAINS_LEN &&
    title.length >= MIN_CONTAINS_LEN &&
    (title.includes(needle) || needle.includes(title))
  )
    score = 70;
  if (score > 0 && parsedYear !== null && libYear === parsedYear) score += 20;
  return score;
}

export interface ResolveCandidate {
  id: number;
  title: string;
  year: number | null;
  titles: string[];
}

export function movieCandidate(movie: Movie): ResolveCandidate | null {
  if (movie.id === null) return null;
  const titles = [
    movie.title,
    movie.originalTitle ?? '',
    ...movie.alternateTitles.map((alt) => alt.title),
  ].filter((title) => title !== '');
  return { id: movie.id, title: movie.title, year: movie.year, titles: [...new Set(titles)] };
}

export function seriesCandidate(series: Series): ResolveCandidate | null {
  if (series.id === null) return null;
  const titles = [series.title, ...(series.alternateTitles ?? [])].filter((title) => title !== '');
  return { id: series.id, title: series.title, year: series.year, titles: [...new Set(titles)] };
}

export interface Library {
  slug: string;
  /** `null` : instance injoignable (ignorée). */
  items: ResolveCandidate[] | null;
}

/** Meilleure correspondance de toutes les bibliothèques (logique pure, testée). */
export function resolveIn(
  pipeline: 'radarr' | 'sonarr',
  torrentName: string,
  libraries: Library[],
): TorrentResolve {
  const parsed = parseReleaseName(torrentName);
  const needle = normalizeTitle(parsed.title);
  if (needle === '') return { found: false, reason: 'unparsable', parsed };
  if (libraries.length === 0) return { found: false, reason: 'no_instance', parsed };
  let best: { item: ResolveCandidate; slug: string } | null = null;
  let bestScore = 0;
  let reached = false;
  for (const library of libraries) {
    if (library.items === null) continue;
    reached = true;
    for (const item of library.items) {
      for (const candidate of item.titles) {
        const score = scoreMatch(candidate, needle, item.year, parsed.year);
        if (score > bestScore) {
          bestScore = score;
          best = { item, slug: library.slug };
        }
      }
    }
  }
  if (!reached) return { found: false, reason: 'unavailable', parsed };
  if (best !== null && bestScore >= MIN_SCORE) {
    const page = pipeline === 'radarr' ? 'films' : 'series';
    return {
      found: true,
      id: best.item.id,
      title: best.item.title,
      url: `/medias/${best.slug}/${page}/${best.item.id}`,
    };
  }
  return { found: false, reason: 'no_match', parsed };
}

async function libraryOf(
  app: FastifyInstance,
  pipeline: 'radarr' | 'sonarr',
  row: InstanceRow,
): Promise<Library> {
  try {
    const items =
      pipeline === 'radarr'
        ? (
            await app.cache.library.movies(row.slug, () =>
              radarrClient(app, row).movies(LIBRARY_TIMEOUT_MS),
            )
          ).flatMap((movie) => movieCandidate(movie) ?? [])
        : (
            await app.cache.library.series(row.slug, () =>
              sonarrClient(app, row).seriesList(SERIES_LIBRARY_TIMEOUT_MS),
            )
          ).flatMap((series) => seriesCandidate(series) ?? []);
    return { slug: row.slug, items };
  } catch {
    return { slug: row.slug, items: null };
  }
}

export async function resolveTorrent(
  app: FastifyInstance,
  pipeline: 'radarr' | 'sonarr',
  torrentName: string,
): Promise<TorrentResolve> {
  const rows = listEnabledInstances(app.db, pipeline);
  const libraries = await Promise.all(rows.map((row) => libraryOf(app, pipeline, row)));
  return resolveIn(pipeline, torrentName, libraries);
}
