// SPDX-License-Identifier: AGPL-3.0-or-later
// Reconstruit l'index des sous-titres Bazarr dans la file de rafraîchissement,
// hors de toute requête : port de `BazarrIndexRefresher`
// (`BazarrIndexRefresherTest`).
//
// - `movies` : une lecture de `/movies` (30 s) écrit statuts, langues, cartes,
//   candidats « les plus manquants » et, au passage, les compteurs `/badges` ;
// - `series` : une lecture de `/series` écrit statuts, cartes et candidats ;
// - `badges` : seulement `/badges` (jamais la liste complète).
// Une clé fraîche ne coûte qu'une lecture ; un Bazarr marqué injoignable n'est
// pas sollicité ; un échec ne remplace jamais une bonne valeur ; les
// correctifs journalisés depuis le début du fetch sont réappliqués ; une
// invalidation pendant le fetch l'emporte (jeton).

import { BAZARR_LIBRARY_TIMEOUT_MS, type BazarrClient } from '../../integrations/bazarr/client';
import {
  BAZARR_HARD_TTL_MS,
  BAZARR_KEYS,
  BAZARR_REFRESH_KEYS,
  BAZARR_SOFT_TTL_MS,
  buildMovieDatasets,
  buildSeriesDatasets,
  type BazarrSubtitleIndex,
} from '../../integrations/bazarr/subtitle-index';
import type { ServiceHealthCache } from '../../integrations/http';
import type { CacheRefresher } from '../refresh-queue';
import type { CacheLogger } from '../swr-cache';

export interface BazarrIndexRefresherDeps {
  index: BazarrSubtitleIndex;
  health: ServiceHealthCache;
  /** Client Bazarr ; lève s'il n'est pas configuré (rien n'est alors reconstruit). */
  client: () => BazarrClient;
  logger?: CacheLogger;
}

export class BazarrIndexRefresher implements CacheRefresher {
  readonly name = 'bazarr-index';
  readonly #deps: BazarrIndexRefresherDeps;

  constructor(deps: BazarrIndexRefresherDeps) {
    this.#deps = deps;
  }

  supports(key: string): boolean {
    return BAZARR_REFRESH_KEYS.includes(key);
  }

  async refresh(key: string): Promise<void> {
    const { index, health } = this.#deps;
    if (index.swr.read(key, BAZARR_SOFT_TTL_MS)?.state === 'fresh') return;
    if (health.isDown('bazarr')) return;
    let client: BazarrClient;
    try {
      client = this.#deps.client();
    } catch {
      return;
    }
    if (key === BAZARR_KEYS.badges) await this.#badges(client);
    else if (key === BAZARR_KEYS.series) await this.#series(client);
    else await this.#movies(client);
  }

  async #badges(client: BazarrClient): Promise<void> {
    const swr = this.#deps.index.swr;
    const token = swr.fetchToken();
    try {
      const counts = await client.badgeCounts();
      swr.write(BAZARR_KEYS.badges, counts, BAZARR_HARD_TTL_MS, { token });
    } catch (error) {
      this.#deps.logger?.warn({ err: error }, 'Bazarr badge count refresh failed');
    }
  }

  async #movies(client: BazarrClient): Promise<void> {
    const { index, logger } = this.#deps;
    const swr = index.swr;
    const token = swr.fetchToken();
    const startedAt = swr.store.now();
    let rows;
    try {
      rows = await client.movies([], BAZARR_LIBRARY_TIMEOUT_MS);
    } catch (error) {
      logger?.warn({ err: error }, 'Bazarr movie index refresh failed');
      return;
    }
    const datasets = buildMovieDatasets(rows);
    let counts = null;
    try {
      counts = await client.badgeCounts();
    } catch (error) {
      logger?.warn({ err: error }, 'Bazarr badge count refresh failed');
    }
    const [status, langs] = index.applyPatchesNewerThan(
      'movie',
      startedAt,
      datasets.status,
      datasets.langs,
    );
    const options = { token, fetchedAt: swr.store.now() };
    swr.write(BAZARR_KEYS.movieCards, datasets.grid, BAZARR_HARD_TTL_MS, options);
    swr.write(BAZARR_KEYS.mostMissingMovies, datasets.candidates, BAZARR_HARD_TTL_MS, options);
    if (counts !== null) swr.write(BAZARR_KEYS.badges, counts, BAZARR_HARD_TTL_MS, options);
    swr.write(BAZARR_KEYS.movieLangs, langs, BAZARR_HARD_TTL_MS, options);
    // En dernier : la clé demandée ne paraît fraîche qu'une fois tout écrit.
    swr.write(BAZARR_KEYS.movies, status, BAZARR_HARD_TTL_MS, options);
  }

  async #series(client: BazarrClient): Promise<void> {
    const { index, logger } = this.#deps;
    const swr = index.swr;
    const token = swr.fetchToken();
    const startedAt = swr.store.now();
    let rows;
    try {
      rows = await client.series([], BAZARR_LIBRARY_TIMEOUT_MS);
    } catch (error) {
      logger?.warn({ err: error }, 'Bazarr series index refresh failed');
      return;
    }
    const datasets = buildSeriesDatasets(rows);
    const [status] = index.applyPatchesNewerThan('series', startedAt, datasets.status, {});
    const options = { token, fetchedAt: swr.store.now() };
    swr.write(BAZARR_KEYS.seriesCards, datasets.grid, BAZARR_HARD_TTL_MS, options);
    swr.write(BAZARR_KEYS.mostMissingSeries, datasets.candidates, BAZARR_HARD_TTL_MS, options);
    swr.write(BAZARR_KEYS.series, status, BAZARR_HARD_TTL_MS, options);
  }
}
