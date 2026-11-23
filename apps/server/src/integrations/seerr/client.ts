// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Seerr / Jellyseerr (P3f) : port de `JellyseerrClient.php` sur le
// socle `integrations/http` (`/api/v1/…`, en-tête `X-Api-Key`).
//
// Les méthodes lèvent une `UpstreamError` (refus de Seerr → 502 avec son
// message, y compris les erreurs de validation « propriété : message ») au
// lieu du `null` + dernière erreur de l'original. Les lectures annexes d'une
// page (langues, régions, genres…) passent par `optional`, qui rend une
// valeur de repli si la lecture échoue.

import { SEERR_SECRET_MASK, type SeerrRequestStatus } from '@hubarr/shared';
import type { HttpClient } from '../http';

type Row = Record<string, unknown>;

export function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export const asRow = (value: unknown): Row => (isRow(value) ? value : {});
export const asRows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
/** Texte ou nombre non vide, sinon `null`. */
export const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value !== ''
    ? value
    : typeof value === 'number'
      ? String(value)
      : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Statut affiché d'une demande (`enrichRequest`), dans l'ordre de l'original. */
export function requestDisplayStatus(request: Row): SeerrRequestStatus {
  const media = asRow(request.media);
  const mediaStatus = num(media.status, 1);
  const requestStatus = num(request.status, 0);
  if (requestStatus === 3) return 'declined';
  if (mediaStatus === 5) return 'available';
  if (mediaStatus === 4) return 'partially_available';
  if (requestStatus === 2) return 'processing';
  if (mediaStatus === 3) return 'approved';
  if (requestStatus === 1) return 'pending';
  return 'unknown';
}

const SECRET_KEYS = new Set(['apiKey', 'api_key', 'password', 'plexToken', 'jellyfinAuthToken']);

/** Copie d'une ressource où chaque secret connu est remplacé par le masque. */
export function maskSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => maskSecrets(item as unknown)) as T;
  if (!isRow(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEYS.has(key) && typeof item === 'string' && item !== ''
        ? SEERR_SECRET_MASK
        : maskSecrets(item),
    ]),
  ) as T;
}

/** Remet le secret enregistré à la place d'un masque laissé tel quel. */
export function restoreSecret(data: Row, current: Row | undefined, key = 'apiKey'): Row {
  if (data[key] !== SEERR_SECRET_MASK) return data;
  const value = current?.[key];
  const out = Object.fromEntries(Object.entries(data).filter(([name]) => name !== key));
  if (typeof value === 'string') out[key] = value;
  return out;
}

/** Notes de version GitHub découpées en sections (`settingsUpdates`). */
export function parseReleaseNotes(body: string): Partial<Record<string, string[]>> {
  const map: [string, string][] = [
    ['Security', 'security'],
    ['Features', 'features'],
    ['Bug Fixes', 'fixes'],
    ['Refactor', 'refactor'],
    ['Performance', 'performance'],
  ];
  const sections: Partial<Record<string, string[]>> = {};
  for (const [header, key] of map) {
    const match = new RegExp(
      `### [^\\n]*${header}\\s*\\r?\\n([\\s\\S]*?)(?=\\n### |\\n## |$)`,
    ).exec(body);
    if (!match?.[1]) continue;
    const items = [...match[1].matchAll(/^- (.+)$/gm)]
      .map((line) =>
        (line[1] ?? '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/ - \([a-f0-9]+\)$/, '')
          .trim(),
      )
      .filter((item) => item !== '');
    if (items.length > 0) sections[key] = items;
  }
  return sections;
}

export class SeerrClient {
  constructor(readonly http: HttpClient) {}

  get<T = unknown>(path: string, query?: Record<string, string | number>): Promise<T> {
    return this.http.get<T>(`/api/v1${path}`, query);
  }

  async send(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
    const response = await this.http.request({
      method,
      path: `/api/v1${path}`,
      ...(method === 'DELETE' ? {} : { json: body ?? {} }),
    });
    return response.data;
  }

  /** Lecture facultative : valeur de repli si elle échoue. */
  async optional<T>(task: Promise<T>, fallback: T): Promise<T> {
    try {
      return await task;
    } catch {
      return fallback;
    }
  }

  /**
   * Demandes, les plus récentes d'abord (P5c.7, V10) : `sortDirection` est
   * explicite, Seerr l'ignorant s'il ne le connaît pas.
   */
  requests(take: number, skip: number, filter: string | null, sort: string | null) {
    return this.get<Row>('/request', {
      take,
      skip,
      ...(filter ? { filter } : {}),
      ...(sort ? { sort } : {}),
      sortDirection: 'desc',
    });
  }

  /** Fiche TMDB lue par Seerr (affiches TMDB), `null` si elle échoue. */
  async tmdb(request: Row): Promise<Row | null> {
    const media = asRow(request.media);
    const tmdbId = num(media.tmdbId, 0);
    const type = typeof request.type === 'string' ? request.type : media.mediaType;
    if (tmdbId <= 0 || (type !== 'movie' && type !== 'tv')) return null;
    return this.optional(this.get<Row>(`/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}`), null);
  }

  async enrich(request: Row): Promise<Row> {
    const tmdb = await this.tmdb(request);
    return {
      ...maskSecrets(request),
      tmdb:
        tmdb === null
          ? null
          : {
              title: textOf(tmdb.title) ?? textOf(tmdb.name) ?? '?',
              overview: typeof tmdb.overview === 'string' ? tmdb.overview : '',
              posterPath: typeof tmdb.posterPath === 'string' ? tmdb.posterPath : null,
              backdropPath: typeof tmdb.backdropPath === 'string' ? tmdb.backdropPath : null,
              releaseDate:
                typeof tmdb.releaseDate === 'string'
                  ? tmdb.releaseDate
                  : typeof tmdb.firstAirDate === 'string'
                    ? tmdb.firstAirDate
                    : null,
              voteAverage: typeof tmdb.voteAverage === 'number' ? tmdb.voteAverage : null,
              genres: asRows(tmdb.genres).flatMap((g) => textOf(g.name) ?? []),
            },
      displayStatus: requestDisplayStatus(request),
    };
  }
}
