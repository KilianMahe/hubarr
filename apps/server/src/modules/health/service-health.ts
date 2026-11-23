// SPDX-License-Identifier: AGPL-3.0-or-later
// État de santé des services : port de `HealthService::statusFor`,
// `classifyLatency`, `isHealthy` et `invalidate`.
//
// - non configuré (ou désactivé) → `null`, sans aucune sonde (issue #9) ;
// - disjoncteur ouvert → `degraded` (verdict « injoignable » encore récent,
//   pas de nouvelle sonde) ;
// - sonde en échec → `down` ;
// - sonde réussie → `up` (≤ 750 ms), `slow` (≤ 2 s) ou `very_slow`.
//
// Résultats gardés 10 s par service ou instance, partagés par toutes les
// requêtes (le pool partagé de l'original) ; deux appels simultanés ne lancent
// qu'une sonde. Une sonde qui ne parvient pas à se connecter ouvre le
// disjoncteur, comme le `ping()` des clients d'origine ; une sonde réussie le
// referme.

import type { ServiceId } from '@hubarr/shared';
import type { Db } from '../../db/client';
import { getInstanceBySlug } from '../instances/instances';
import { isServiceConfigured } from '../services/config';
import {
  diagnoseFromResponse,
  probeFor,
  runProbe,
  savedValues,
  type DiagnoseDeps,
} from '../services/diagnose';

export const SERVICE_STATUSES = ['up', 'slow', 'very_slow', 'down', 'degraded'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export interface StatusResult {
  status: ServiceStatus | null;
  latencyMs: number | null;
}

/** Durée de vie d'un état (`CACHE_TTL` = 10 s). */
export const STATUS_TTL_MS = 10_000;

/** Seuils de latence : ≤ 750 ms `up`, ≤ 2 000 ms `slow`, au-delà `very_slow`. */
export function classifyLatency(ms: number): 'up' | 'slow' | 'very_slow' {
  if (ms <= 750) return 'up';
  if (ms <= 2000) return 'slow';
  return 'very_slow';
}

/** Projection booléenne (`isHealthy`) : `null` non configuré. */
export function isHealthyStatus(status: ServiceStatus | null): boolean | null {
  if (status === null) return null;
  return status === 'up' || status === 'slow' || status === 'very_slow';
}

/** Sonde d'un service (remplaçable dans les tests). `null` : pas de sonde possible. */
export type Pinger = (
  service: ServiceId,
  instance?: string,
) => Promise<{ ok: boolean; latencyMs: number } | null>;

export interface ServiceHealthMonitorOptions {
  db: Db;
  deps: DiagnoseDeps;
  now?: () => number;
  ping?: Pinger;
}

export class ServiceHealthMonitor {
  readonly #db: Db;
  readonly #deps: DiagnoseDeps;
  readonly #now: () => number;
  readonly #ping: Pinger;
  readonly #cache = new Map<string, { at: number; result: StatusResult }>();
  readonly #inFlight = new Map<string, Promise<StatusResult>>();
  /** Incrémenté à chaque invalidation : un résultat en vol plus ancien n'est pas gardé. */
  #generation = 0;

  constructor(options: ServiceHealthMonitorOptions) {
    this.#db = options.db;
    this.#deps = options.deps;
    this.#now = options.now ?? Date.now;
    this.#ping = options.ping ?? ((service, instance) => this.#defaultPing(service, instance));
  }

  get breaker() {
    return this.#deps.health;
  }

  isConfigured(service: ServiceId): boolean {
    return isServiceConfigured(this.#db, service);
  }

  async isHealthy(service: ServiceId, instance?: string): Promise<boolean | null> {
    return isHealthyStatus((await this.statusFor(service, instance)).status);
  }

  async statusFor(service: ServiceId, instance?: string): Promise<StatusResult> {
    const key = instance === undefined ? service : `${service}:${instance}`;
    const cached = this.#cache.get(key);
    if (cached !== undefined && this.#now() - cached.at < STATUS_TTL_MS) return cached.result;
    const pending = this.#inFlight.get(key);
    if (pending !== undefined) return pending;

    const generation = this.#generation;
    const promise = this.#compute(service, instance)
      .catch((): StatusResult => ({ status: 'down', latencyMs: null }))
      .then((result) => {
        if (generation === this.#generation) this.#cache.set(key, { at: this.#now(), result });
        return result;
      })
      .finally(() => {
        this.#inFlight.delete(key);
      });
    this.#inFlight.set(key, promise);
    return promise;
  }

  /**
   * Oublie les états en cache (tous : l'original change de « génération ») et
   * referme le disjoncteur du service et de ses instances, ou de tous.
   */
  invalidate(service?: ServiceId): void {
    this.#generation++;
    this.#cache.clear();
    this.#inFlight.clear();
    if (service === undefined) this.#deps.health.clearAll();
    else this.#deps.health.clearService(service);
  }

  async #compute(service: ServiceId, instance: string | undefined): Promise<StatusResult> {
    if (!this.isConfigured(service)) return { status: null, latencyMs: null };
    if (this.#deps.health.isDown(service, instance)) return { status: 'degraded', latencyMs: null };
    const result = await this.#ping(service, instance);
    if (result === null) return { status: null, latencyMs: null };
    if (!result.ok) return { status: 'down', latencyMs: null };
    return { status: classifyLatency(result.latencyMs), latencyMs: result.latencyMs };
  }

  async #defaultPing(
    service: ServiceId,
    instance: string | undefined,
  ): Promise<{ ok: boolean; latencyMs: number } | null> {
    let row;
    if (instance !== undefined && (service === 'radarr' || service === 'sonarr')) {
      row = getInstanceBySlug(this.#db, service, instance);
      if (row === null) return null;
    }
    const spec = probeFor(service, savedValues(this.#db, service, row));
    // Configuré mais sans sonde (Gluetun) : considéré joignable, comme `default => true`.
    if (spec === null) return service === 'gluetun' ? { ok: true, latencyMs: 0 } : null;
    const response = await runProbe(service, spec, this.#deps);
    const ok = diagnoseFromResponse(response, service).ok;
    // Seul un échec de connexion ouvre le disjoncteur (pas une lecture trop lente).
    if (response.errorKind === 'network') {
      this.#deps.health.markDown(service, instance);
    } else if (ok) {
      this.#deps.health.clear(service, instance);
    }
    return { ok, latencyMs: response.latencyMs };
  }
}
