// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Bazarr (`/api/…`, en-tête `X-API-KEY`) : port de
// `Service/Media/BazarrClient.php` (`BazarrClientTest`).
//
// Écarts : une erreur lève une `UpstreamError` (D63) au lieu
// de rendre `[]`/`null` avec une « dernière erreur » à relire ; délais
// repris (8 s par défaut, 30 s pour les listes complètes, 45 s pour les
// fournisseurs) ; filtres d'ids en paramètres répétés `radarrid[]=`.

import type { HttpClient, Query } from '../http';

export const BAZARR_DEFAULT_TIMEOUT_MS = 8_000;
/** Listes complètes (films, séries), hors requête. */
export const BAZARR_LIBRARY_TIMEOUT_MS = 30_000;
/** Recherche et téléchargement chez les fournisseurs de sous-titres. */
export const BAZARR_PROVIDER_TIMEOUT_MS = 45_000;

export type BazarrRow = Record<string, unknown>;

function isRecord(value: unknown): value is BazarrRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liste sous `data` (ou nue, selon la version de Bazarr). */
export function dataRows(value: unknown): BazarrRow[] {
  const data = isRecord(value) ? value.data : value;
  return Array.isArray(data) ? data.filter(isRecord) : [];
}

/** Corps d'un téléchargement : ids en texte, drapeaux en `True`/`False` (`downloadBody`). */
export function downloadForm(
  ids: Record<string, number>,
  options: {
    hi: boolean;
    forced: boolean;
    originalFormat: boolean;
    provider: string;
    subtitle: string;
  },
): Record<string, string> {
  const flag = (value: boolean) => (value ? 'True' : 'False');
  return {
    ...Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, String(value)])),
    hi: flag(options.hi),
    forced: flag(options.forced),
    original_format: flag(options.originalFormat),
    provider: options.provider,
    subtitle: options.subtitle,
  };
}

export class BazarrClient {
  constructor(readonly http: HttpClient) {}

  #get(path: string, query?: Query, timeoutMs = BAZARR_DEFAULT_TIMEOUT_MS): Promise<unknown> {
    return this.http.get(`/api${path}`, query, { timeoutMs });
  }

  async systemStatus(): Promise<unknown> {
    return this.#get('/system/status');
  }

  async badgeCounts(): Promise<{ movies: number; episodes: number; providers: number }> {
    const raw = await this.#get('/badges');
    const value = (key: string) => (isRecord(raw) && typeof raw[key] === 'number' ? raw[key] : 0);
    return { movies: value('movies'), episodes: value('episodes'), providers: value('providers') };
  }

  /** Films (tous, ou ceux des ids donnés). */
  async movies(radarrIds: readonly number[] = [], timeoutMs?: number): Promise<BazarrRow[]> {
    return dataRows(
      await this.#get(
        '/movies',
        { start: 0, length: -1, ...(radarrIds.length > 0 ? { 'radarrid[]': [...radarrIds] } : {}) },
        timeoutMs,
      ),
    );
  }

  /** Séries (toutes, ou celles des ids donnés). */
  async series(seriesIds: readonly number[] = [], timeoutMs?: number): Promise<BazarrRow[]> {
    return dataRows(
      await this.#get(
        '/series',
        { start: 0, length: -1, ...(seriesIds.length > 0 ? { 'seriesid[]': [...seriesIds] } : {}) },
        timeoutMs,
      ),
    );
  }

  async historyMovies(): Promise<BazarrRow[]> {
    return dataRows(await this.#get('/movies/history'));
  }

  async historyEpisodes(): Promise<BazarrRow[]> {
    return dataRows(await this.#get('/episodes/history'));
  }

  async episodes(seriesId: number): Promise<BazarrRow[]> {
    return dataRows(await this.#get('/episodes', { 'seriesid[]': seriesId }));
  }

  async searchMovie(radarrId: number): Promise<BazarrRow[]> {
    return dataRows(
      await this.#get('/providers/movies', { radarrid: radarrId }, BAZARR_PROVIDER_TIMEOUT_MS),
    );
  }

  async searchEpisode(episodeId: number): Promise<BazarrRow[]> {
    return dataRows(
      await this.#get('/providers/episodes', { episodeid: episodeId }, BAZARR_PROVIDER_TIMEOUT_MS),
    );
  }

  async #send(
    method: 'POST' | 'PATCH',
    path: string,
    form: Record<string, string>,
    timeoutMs: number,
  ) {
    await this.http.request({ method, path: `/api${path}`, form, timeoutMs, responseType: 'none' });
  }

  async downloadMovie(form: Record<string, string>): Promise<void> {
    await this.#send('POST', '/providers/movies', form, BAZARR_PROVIDER_TIMEOUT_MS);
  }

  async downloadEpisode(form: Record<string, string>): Promise<void> {
    await this.#send('POST', '/providers/episodes', form, BAZARR_PROVIDER_TIMEOUT_MS);
  }

  async searchMissingMovie(radarrId: number): Promise<void> {
    await this.#send(
      'PATCH',
      '/movies',
      { radarrid: String(radarrId), action: 'search-missing' },
      BAZARR_DEFAULT_TIMEOUT_MS,
    );
  }

  async searchMissingSeries(seriesId: number): Promise<void> {
    await this.#send(
      'PATCH',
      '/series',
      { seriesid: String(seriesId), action: 'search-missing' },
      BAZARR_DEFAULT_TIMEOUT_MS,
    );
  }
}
