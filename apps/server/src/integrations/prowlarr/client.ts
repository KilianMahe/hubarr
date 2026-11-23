// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Prowlarr (API v1) : port de `Service/Media/ProwlarrClient.php`.
// P3c.1 : indexeurs (liste, statuts, statistiques, catégories, actions
// groupées, test global), santé, applications, profils d'application,
// étiquettes, historique d'un indexeur et commandes.
//
// Les ressources à schéma (indexeurs, puis applications, clients et
// notifications en P3c.3) passent par les méthodes génériques
// d'`ArrResourceClient` (liste, création, modification, suppression, test),
// comme l'administration Radarr/Sonarr ; leurs secrets sont masqués par les
// routes (`arr/secrets.ts`). Les lectures typées viennent de la spec OpenAPI
// épinglée (`tools/openapi/prowlarr.json`, Prowlarr v3.0.2).

import type {
  ProwlarrAppProfile,
  ProwlarrApplicationSummary,
  ProwlarrCategory,
  ProwlarrHealth,
  ProwlarrIndexerBulkRequest,
  ProwlarrIndexerHistory,
  ProwlarrIndexerStats,
  ProwlarrRelease,
  ProwlarrTestAll,
} from '@hubarr/shared';
import { ArrResourceClient, type ArrRecord } from '../arr/admin';
import { ARR_ACTION_TIMEOUT_MS } from '../arr/client';
import { TypedApi } from '../arr/typed-api';
import type { HttpClient } from '../http';
import {
  normalizeApplication,
  normalizeCategory,
  normalizeHealth,
  normalizeHistory,
  normalizeRelease,
  normalizeStats,
  normalizeTestResults,
} from './normalize';
import type {
  ProwlarrCommandResource,
  ProwlarrIndexerBulkResource,
  ProwlarrIndexerResource,
  ProwlarrIndexerStatusResource,
  ProwlarrPaths,
  ProwlarrSystemResource,
  ProwlarrTagResource,
} from './types';

/** Chemin des indexeurs (ressource à schéma). */
export const PROWLARR_INDEXERS = '/api/v1/indexer';

/** Test global : Prowlarr teste chaque indexeur actif en direct (30 s comme l'original). */
export const TEST_ALL_TIMEOUT_MS = 30_000;

/** Recherche : 100 résultats au plus, 90 s (chaque indexeur est interrogé en direct). */
export const SEARCH_LIMIT = 100;
export const SEARCH_TIMEOUT_MS = 90_000;

/** Historique d'un indexeur : 30 derniers évènements (fiche de l'original). */
export const INDEXER_HISTORY_LIMIT = 30;

export class ProwlarrClient extends ArrResourceClient {
  readonly api: TypedApi<ProwlarrPaths>;

  constructor(http: HttpClient) {
    super(http);
    this.api = new TypedApi<ProwlarrPaths>(http);
  }

  // ── Système ────────────────────────────────────────────────────────────────

  async systemStatus(): Promise<ProwlarrSystemResource | null> {
    return this.api.get('/api/v1/system/status');
  }

  async health(): Promise<ProwlarrHealth[]> {
    return ((await this.api.get('/api/v1/health')) ?? []).flatMap(
      (item) => normalizeHealth(item) ?? [],
    );
  }

  // ── Indexeurs ──────────────────────────────────────────────────────────────

  async rawIndexers(): Promise<ProwlarrIndexerResource[]> {
    return (await this.api.get('/api/v1/indexer')) ?? [];
  }

  async indexerStatuses(): Promise<ProwlarrIndexerStatusResource[]> {
    return (await this.api.get('/api/v1/indexerstatus')) ?? [];
  }

  async indexerStats(): Promise<ProwlarrIndexerStats> {
    return normalizeStats(await this.api.get('/api/v1/indexerstats'));
  }

  async defaultCategories(): Promise<ProwlarrCategory[]> {
    return ((await this.api.get('/api/v1/indexer/categories')) ?? []).flatMap(
      (item) => normalizeCategory(item) ?? [],
    );
  }

  /** Modification groupée (`PUT /indexer/bulk`) : seuls les champs présents changent. */
  async bulkUpdateIndexers(request: ProwlarrIndexerBulkRequest): Promise<void> {
    const body: ProwlarrIndexerBulkResource = { ids: [...request.ids] };
    if (request.enable !== undefined) body.enable = request.enable;
    if (request.appProfileId !== undefined) body.appProfileId = request.appProfileId;
    if (request.priority !== undefined) body.priority = request.priority;
    // Étiquettes appliquées seulement si la requête en porte (ajout par défaut).
    if (request.tags !== undefined) {
      body.tags = [...request.tags];
      body.applyTags = request.applyTags ?? 'add';
    }
    await this.api.put('/api/v1/indexer/bulk', { body, timeoutMs: ARR_ACTION_TIMEOUT_MS });
  }

  async bulkDeleteIndexers(ids: readonly number[]): Promise<void> {
    await this.removeBulk(PROWLARR_INDEXERS, ids);
  }

  /**
   * Test de tous les indexeurs actifs. Prowlarr répond 400 avec les mêmes
   * résultats quand l'un d'eux échoue : les deux réponses sont lues.
   */
  async testAllIndexers(): Promise<ProwlarrTestAll> {
    const response = await this.http.request({
      method: 'POST',
      path: `${PROWLARR_INDEXERS}/testall`,
      timeoutMs: TEST_ALL_TIMEOUT_MS,
      acceptStatus: (status) => status === 400,
    });
    const results = normalizeTestResults(response.data);
    return {
      ok: response.status < 300 && results.every((result) => result.isValid),
      results,
    };
  }

  async indexerHistory(
    indexerId: number,
    limit = INDEXER_HISTORY_LIMIT,
  ): Promise<ProwlarrIndexerHistory[]> {
    const records =
      (await this.api.get('/api/v1/history/indexer', { query: { indexerId, limit } })) ?? [];
    return records
      .flatMap((record) => normalizeHistory(record) ?? [])
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }

  // ── Recherche ──────────────────────────────────────────────────────────────

  /**
   * Recherche sur tous les indexeurs (ou un seul) : 100 résultats au plus,
   * comme l'original ; Prowlarr interroge chaque indexeur en direct.
   */
  async search(query: string, indexerId?: number): Promise<ProwlarrRelease[]> {
    const releases =
      (await this.api.get('/api/v1/search', {
        query: {
          query,
          type: 'search',
          limit: SEARCH_LIMIT,
          ...(indexerId === undefined ? {} : { indexerIds: [indexerId] }),
        },
        timeoutMs: SEARCH_TIMEOUT_MS,
      })) ?? [];
    return releases.flatMap((release) => normalizeRelease(release) ?? []);
  }

  /** Grab d'un résultat, envoyé par Prowlarr au client de téléchargement de l'indexeur. */
  async grab(guid: string, indexerId: number): Promise<void> {
    await this.http.request({
      method: 'POST',
      path: '/api/v1/search',
      json: { guid, indexerId },
      timeoutMs: TEST_ALL_TIMEOUT_MS,
      responseType: 'none',
    });
  }

  // ── Applications, profils, étiquettes ──────────────────────────────────────

  async applications(): Promise<ProwlarrApplicationSummary[]> {
    return ((await this.api.get('/api/v1/applications')) ?? []).flatMap(
      (item) => normalizeApplication(item) ?? [],
    );
  }

  async appProfiles(): Promise<ProwlarrAppProfile[]> {
    return ((await this.api.get('/api/v1/appprofile')) ?? []).flatMap((profile) =>
      typeof profile.id === 'number'
        ? [
            {
              id: profile.id,
              name: profile.name ?? `#${profile.id}`,
              enableRss: profile.enableRss === true,
              enableAutomaticSearch: profile.enableAutomaticSearch === true,
              enableInteractiveSearch: profile.enableInteractiveSearch === true,
              minimumSeeders: profile.minimumSeeders ?? 0,
            },
          ]
        : [],
    );
  }

  async tags(): Promise<{ id: number; label: string }[]> {
    return ((await this.api.get('/api/v1/tag')) ?? []).flatMap(tagOf);
  }

  async createTag(label: string): Promise<{ id: number; label: string } | null> {
    const created = await this.api.post('/api/v1/tag', { body: { label } });
    return created === null ? null : (tagOf(created)[0] ?? null);
  }

  // ── Commandes ──────────────────────────────────────────────────────────────

  /** Lance une commande et renvoie son identifiant (`null` si Prowlarr n'en donne pas). */
  async command(name: string): Promise<number | null> {
    const created = await this.http.post<ArrRecord | null>('/api/v1/command', { name });
    return typeof created?.id === 'number' ? created.id : null;
  }

  async commandStatus(id: number): Promise<ProwlarrCommandResource | null> {
    return this.api.get('/api/v1/command/{id}', { params: { id } });
  }
}

function tagOf(tag: ProwlarrTagResource): { id: number; label: string }[] {
  return typeof tag.id === 'number' ? [{ id: tag.id, label: tag.label ?? `#${tag.id}` }] : [];
}
