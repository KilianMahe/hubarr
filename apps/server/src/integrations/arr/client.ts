// SPDX-License-Identifier: AGPL-3.0-or-later
// Base commune des clients Radarr et Sonarr (API v3) : commandes,
// étiquettes, profils de qualité, dossiers racine, système, file d'attente,
// liste de blocage, historique, langues et lecture groupée (`multiGet`).
// Les clients `RadarrClient` et `SonarrClient` l'étendent avec leur bibliothèque.
//
// Les ressources communes sont typées d'après la spécification de Radarr :
// vérifié en P3a contre la spec de Sonarr v4.0.20, les opérations de
// `ArrCommonPaths` y ont les mêmes paramètres et les mêmes corps.
// Seuls quelques champs de réponse diffèrent (`TagDetailsResource` : `seriesIds`
// au lieu de `movieIds`) : `SonarrClient` lit ceux-là avec ses propres types.
//
// Différence avec l'original : une erreur lève une `UpstreamError` (D63) au
// lieu de renvoyer `null`, `false` ou `{ ok: false }`.

import type { RadarrPaths } from '../radarr/types';
import type { components } from '../radarr/openapi';
import type { HttpClient } from '../http';
import { UpstreamError, isUpstreamError } from '../http';
import {
  TypedApi,
  expandPath,
  type MultiGetSpec,
  type Operation,
  type ResponseOf,
} from './typed-api';

type Schemas = components['schemas'];

/** Chemins identiques dans Radarr et Sonarr. */
export type ArrCommonPaths = Pick<
  RadarrPaths,
  | '/api/v3/command'
  | '/api/v3/command/{id}'
  | '/api/v3/tag'
  | '/api/v3/tag/{id}'
  | '/api/v3/tag/detail'
  | '/api/v3/qualityprofile'
  | '/api/v3/rootfolder'
  | '/api/v3/system/status'
  | '/api/v3/health'
  | '/api/v3/diskspace'
  | '/api/v3/language'
  | '/api/v3/queue/{id}'
  | '/api/v3/queue/status'
  | '/api/v3/queue/bulk'
  | '/api/v3/queue/grab/{id}'
  | '/api/v3/queue/grab/bulk'
  | '/api/v3/blocklist/{id}'
  | '/api/v3/blocklist/bulk'
  | '/api/v3/history/failed/{id}'
>;

export type ArrCommand = Schemas['CommandResource'];

/** Délai des actions qui attendent la réponse détaillée de l'instance (`requestWithError`). */
export const ARR_ACTION_TIMEOUT_MS = 15_000;

export interface QueueRemovalOptions {
  /** Retirer aussi le téléchargement du client. */
  removeFromClient?: boolean;
  /** Ajouter la release à la liste de blocage. */
  blocklist?: boolean;
  /** Ne pas relancer de recherche (`skipReimport` dans l'original, nom faux : D84). */
  skipRedownload?: boolean;
}

export type MultiGetResult<P, R extends Record<string, MultiGetSpec<P>>> = {
  [N in keyof R]: ResponseOf<Operation<P, R[N]['path'], 'get'>> | null;
};

export class ArrClient<P> {
  /** Appels typés d'après la spec du service. */
  readonly api: TypedApi<P>;
  protected readonly common: TypedApi<ArrCommonPaths>;

  constructor(readonly http: HttpClient) {
    this.api = new TypedApi<P>(http);
    this.common = new TypedApi<ArrCommonPaths>(http);
  }

  get instance(): string | undefined {
    return this.http.instance;
  }

  /** Ressource attendue : un corps vide est une réponse invalide. */
  protected required<T>(value: T | null, path: string): T {
    if (value === null) {
      throw new UpstreamError('invalid_response', {
        service: this.http.service,
        instance: this.http.instance,
        path,
        message: 'empty body',
      });
    }
    return value;
  }

  // ── Commandes ──────────────────────────────────────────────────────────────

  /**
   * Lance une commande (`RefreshMovie`, `RssSync`…). Les champs propres à la
   * commande (`movieIds`, `seriesId`…) vont à côté du nom, comme dans l'API.
   */
  async sendCommand(name: string, extra: Record<string, unknown> = {}): Promise<ArrCommand> {
    const command = await this.http.post<ArrCommand | null>('/api/v3/command', { ...extra, name });
    return this.required(command, '/api/v3/command');
  }

  /** Lance une commande et renvoie son identifiant (`null` si l'instance n'en donne pas). */
  async commandId(name: string, extra: Record<string, unknown> = {}): Promise<number | null> {
    return (await this.sendCommand(name, extra)).id ?? null;
  }

  async commandStatus(id: number): Promise<ArrCommand> {
    const path = '/api/v3/command/{id}';
    return this.required(await this.common.get(path, { params: { id } }), path);
  }

  async commands(): Promise<ArrCommand[]> {
    return (await this.common.get('/api/v3/command')) ?? [];
  }

  async cancelCommand(id: number): Promise<void> {
    await this.common.delete('/api/v3/command/{id}', { params: { id } });
  }

  // ── Étiquettes ─────────────────────────────────────────────────────────────

  async tags(): Promise<Schemas['TagResource'][]> {
    return (await this.common.get('/api/v3/tag')) ?? [];
  }

  async tagDetails(): Promise<Schemas['TagDetailsResource'][]> {
    return (await this.common.get('/api/v3/tag/detail')) ?? [];
  }

  async createTag(label: string): Promise<Schemas['TagResource']> {
    const path = '/api/v3/tag';
    return this.required(await this.common.post(path, { body: { label } }), path);
  }

  async updateTag(id: number, label: string): Promise<Schemas['TagResource']> {
    const path = '/api/v3/tag/{id}';
    return this.required(
      await this.common.put(path, { params: { id: String(id) }, body: { id, label } }),
      path,
    );
  }

  async deleteTag(id: number): Promise<void> {
    await this.common.delete('/api/v3/tag/{id}', { params: { id } });
  }

  // ── Profils, dossiers, langues ─────────────────────────────────────────────

  async qualityProfiles(): Promise<Schemas['QualityProfileResource'][]> {
    return (await this.common.get('/api/v3/qualityprofile')) ?? [];
  }

  async rootFolders(): Promise<Schemas['RootFolderResource'][]> {
    return (await this.common.get('/api/v3/rootfolder')) ?? [];
  }

  async languages(): Promise<Schemas['LanguageResource'][]> {
    return (await this.common.get('/api/v3/language')) ?? [];
  }

  // ── Système ────────────────────────────────────────────────────────────────

  async systemStatus(): Promise<Schemas['SystemResource']> {
    const path = '/api/v3/system/status';
    return this.required(await this.common.get(path), path);
  }

  async systemHealth(): Promise<Schemas['HealthResource'][]> {
    return (await this.common.get('/api/v3/health')) ?? [];
  }

  async diskSpace(): Promise<Schemas['DiskSpaceResource'][]> {
    return (await this.common.get('/api/v3/diskspace')) ?? [];
  }

  // ── File d'attente ─────────────────────────────────────────────────────────

  async queueStatus(): Promise<Schemas['QueueStatusResource']> {
    const path = '/api/v3/queue/status';
    return this.required(await this.common.get(path), path);
  }

  async deleteQueueItem(id: number, options: QueueRemovalOptions = {}): Promise<void> {
    await this.common.delete('/api/v3/queue/{id}', {
      params: { id },
      query: {
        removeFromClient: options.removeFromClient ?? false,
        blocklist: options.blocklist ?? false,
        skipRedownload: options.skipRedownload ?? false,
      },
    });
  }

  /** Suppression groupée : les options passent dans la requête, les ids dans le corps. */
  async bulkDeleteQueue(ids: readonly number[], options: QueueRemovalOptions = {}): Promise<void> {
    await this.common.delete('/api/v3/queue/bulk', {
      query: {
        removeFromClient: options.removeFromClient ?? false,
        blocklist: options.blocklist ?? false,
        ...(options.skipRedownload === undefined ? {} : { skipRedownload: options.skipRedownload }),
      },
      body: { ids: [...ids] },
    });
  }

  async grabQueueItem(id: number): Promise<unknown> {
    return this.common.post('/api/v3/queue/grab/{id}', {
      params: { id },
      timeoutMs: ARR_ACTION_TIMEOUT_MS,
    });
  }

  async bulkGrabQueue(ids: readonly number[]): Promise<unknown> {
    return this.common.post('/api/v3/queue/grab/bulk', {
      body: { ids: [...ids] },
      timeoutMs: ARR_ACTION_TIMEOUT_MS,
    });
  }

  // ── Liste de blocage, historique ───────────────────────────────────────────

  async deleteBlocklistItem(id: number): Promise<void> {
    await this.common.delete('/api/v3/blocklist/{id}', { params: { id } });
  }

  async bulkDeleteBlocklist(ids: readonly number[]): Promise<void> {
    await this.common.delete('/api/v3/blocklist/bulk', { body: { ids: [...ids] } });
  }

  async markHistoryFailed(id: number): Promise<void> {
    await this.common.post('/api/v3/history/failed/{id}', { params: { id } });
  }

  // ── Lecture groupée ────────────────────────────────────────────────────────

  /**
   * Plusieurs GET en parallèle (port de `multiGet`, `curl_multi`). Chaque
   * requête en échec vaut `null`, sans exception. Le disjoncteur s'applique au
   * lot entier :
   * - ouvert au départ → tout vaut `null`, sans appel réseau ;
   * - une réponse au moins (même un JSON illisible) → refermé ;
   * - aucune réponse et au moins un échec de **connexion** → ouvert. Une
   *   lecture trop lente ou des statuts d'erreur ne l'ouvrent pas : un appel
   *   annexe lent (file, santé) ne doit pas vider toute la bibliothèque.
   */
  async multiGet<const R extends Record<string, MultiGetSpec<P>>>(
    requests: R,
  ): Promise<MultiGetResult<P, R>> {
    const entries = Object.entries<MultiGetSpec<P>>(requests);
    const nulls = Object.fromEntries(entries.map(([name]) => [name, null]));
    const health = this.http.health;
    if (entries.length === 0 || health.isDown(this.http.service, this.http.instance)) {
      return nulls as MultiGetResult<P, R>;
    }

    const outcomes = await Promise.all(
      entries.map(async ([name, spec]): Promise<MultiGetOutcome> => {
        try {
          const response = await this.http.request({
            method: 'GET',
            path: expandPath(spec.path, spec.params),
            ...(spec.query === undefined ? {} : { query: spec.query }),
            trackHealth: false,
          });
          return { name, data: response.data, answered: true, connectFailure: false };
        } catch (error) {
          if (!isUpstreamError(error)) throw error;
          return {
            name,
            data: null,
            answered: error.kind === 'invalid_response',
            connectFailure: error.kind === 'network',
          };
        }
      }),
    );

    if (outcomes.some((outcome) => outcome.answered)) {
      health.clear(this.http.service, this.http.instance);
    } else if (outcomes.some((outcome) => outcome.connectFailure)) {
      health.markDown(this.http.service, this.http.instance);
    }
    return Object.fromEntries(
      outcomes.map((outcome) => [outcome.name, outcome.data]),
    ) as MultiGetResult<P, R>;
  }
}

interface MultiGetOutcome {
  name: string;
  data: unknown;
  /** L'instance a répondu (2xx, ou corps illisible). */
  answered: boolean;
  /** Échec de connexion (le disjoncteur s'ouvre si rien n'a répondu). */
  connectFailure: boolean;
}
