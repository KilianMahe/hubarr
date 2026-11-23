// SPDX-License-Identifier: AGPL-3.0-or-later
// Cache « stale-while-revalidate » partagé par tous les jeux de données mis en
// cache : port de `StaleWhileRevalidateCache` (PLAN §2.7).
//
// Les valeurs sont rangées en enveloppes `{ fetchedAt, value }` dont la durée
// de vie est la fenêtre **dure** : un « miss dur » est une entrée absente.
// Deux chemins de lecture, comme dans l'original :
//   - `read()` ne déclenche jamais de fetch : pour ce qu'une page peut afficher
//     sans (badge, compteur, panneau annexe) ;
//   - `getOrCompute()` fetch en ligne sur un miss dur, en vol unique par clé :
//     pour ce sans quoi la page ne s'affiche pas (les bibliothèques).
//
// Les rafraîchissements ne tournent jamais dans la requête : `requestRefresh()`
// pose un marqueur de coalescence de 30 s et confie la clé à la file de
// rafraîchissement (`refresh-queue.ts`), qui remplace Messenger.
//
// Écarts avec l'original (MEMOIRE D85) :
//   - horodatages en millisecondes ;
//   - l'ordre « invalidation / début d'un fetch » se compare avec un compteur
//     monotone (`fetchToken()`), pas avec `microtime` : une horloge en
//     millisecondes ne départage pas deux événements de la même milliseconde ;
//   - vol unique par promesse partagée : les requêtes concurrentes reçoivent le
//     même résultat (ou la même erreur) au lieu de relancer le fetch l'une
//     après l'autre derrière un verrou. `delete()` détache le vol en cours :
//     la lecture suivante refait un fetch, comme un waiter du `LockRegistry`
//     qui retrouvait une entrée non mise en cache.

import type { MemoryStore } from './memory-store';

export interface CacheLogger {
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export type SwrState = 'fresh' | 'stale';

export interface SwrHit<T> {
  value: T;
  state: SwrState;
}

export interface SwrWriteOptions {
  /** Date du fetch (ms) ; par défaut maintenant. Une date passée raccourcit la vie de l'entrée. */
  fetchedAt?: number;
  /**
   * Jeton pris par `fetchToken()` juste avant le fetch qui a produit la valeur :
   * si `delete()` a invalidé la clé depuis, l'écriture est abandonnée (sinon
   * des données antérieures à une mutation reviendraient comme fraîches).
   */
  token?: number;
}

export interface SwrCacheOptions {
  store: MemoryStore;
  /** Confie une clé à la file de rafraîchissement. Peut lever : l'erreur est journalisée. */
  dispatch: (key: string) => void;
  logger?: CacheLogger;
  /** Résultat « vide » = fetch raté, jamais mis en cache. Par défaut : tableau vide, `null`. */
  isEmpty?: (value: unknown) => boolean;
}

interface Envelope {
  fetchedAt: number;
  value: unknown;
}

function defaultIsEmpty(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

function isEnvelope(raw: unknown): raw is Envelope {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'value' in raw &&
    'fetchedAt' in raw &&
    typeof raw.fetchedAt === 'number'
  );
}

export class StaleWhileRevalidateCache {
  /** Durée pendant laquelle un marqueur de coalescence supprime les nouvelles demandes. */
  static readonly MARKER_TTL_MS = 30_000;
  /** Durée pendant laquelle une demande de rafraîchissement sans réponse est mémorisée. */
  static readonly REQUEST_TTL_MS = 900_000;
  /** Durée pendant laquelle `delete()` mémorise l'invalidation (doit dépasser le fetch le plus long). */
  static readonly INVALIDATION_TTL_MS = 900_000;

  readonly store: MemoryStore;
  readonly #dispatch: (key: string) => void;
  readonly #logger: CacheLogger | undefined;
  readonly #isEmpty: (value: unknown) => boolean;
  readonly #inflight = new Map<string, Promise<Envelope>>();
  #sequence = 0;
  /** Compteurs (P5.3), journalisés en mode debug. */
  readonly #metrics = { fresh: 0, stale: 0, misses: 0, computes: 0, refreshRequests: 0, writes: 0 };

  constructor(options: SwrCacheOptions) {
    this.store = options.store;
    this.#dispatch = options.dispatch;
    this.#logger = options.logger;
    this.#isEmpty = options.isEmpty ?? defaultIsEmpty;
  }

  /**
   * `null` = miss dur. Le type `T` n'est pas vérifié à l'exécution : la clé
   * appartient à un seul module, qui y range toujours le même type.
   */
  read<T>(key: string, softTtlMs: number): SwrHit<T> | null {
    const raw = this.store.get(key);
    if (raw === undefined) {
      this.#metrics.misses += 1;
      return null;
    }
    if (!isEnvelope(raw)) {
      // Entrée corrompue : la supprimer pour que `getOrCompute()` ne la rende pas.
      this.store.delete(key);
      return null;
    }
    const state = this.#stateOf(raw, softTtlMs);
    this.#metrics[state] += 1;
    return { value: raw.value as T, state };
  }

  /** Compteurs depuis le démarrage : lectures fraîches, périmées, absentes, fetchs, demandes, écritures. */
  metrics(): Readonly<{
    fresh: number;
    stale: number;
    misses: number;
    computes: number;
    refreshRequests: number;
    writes: number;
  }> {
    return { ...this.#metrics };
  }

  /** Lève l'erreur du fetch, sans rien mettre en cache. */
  async getOrCompute<T>(
    key: string,
    softTtlMs: number,
    hardTtlMs: number,
    fetch: () => Promise<T>,
  ): Promise<SwrHit<T>> {
    const hit = this.read<T>(key, softTtlMs);
    if (hit !== null) return hit;

    let flight = this.#inflight.get(key);
    if (flight === undefined) {
      this.#metrics.computes += 1;
      const started = this.#compute(key, hardTtlMs, fetch);
      flight = started;
      this.#inflight.set(key, started);
      const release = () => {
        if (this.#inflight.get(key) === started) this.#inflight.delete(key);
      };
      started.then(release, release);
    }
    const envelope = await flight;
    // L'état se déduit de `fetchedAt`, jamais « frais » d'office : un fetch lent
    // peut rendre une valeur déjà au-delà de la fenêtre souple.
    return { value: envelope.value as T, state: this.#stateOf(envelope, softTtlMs) };
  }

  write(key: string, value: unknown, hardTtlMs: number, options: SwrWriteOptions = {}): void {
    if (hardTtlMs <= 0) {
      throw new RangeError(
        `StaleWhileRevalidateCache.write() : hardTtlMs doit être > 0 (${hardTtlMs})`,
      );
    }
    if (options.token !== undefined && this.#invalidatedSince(key, options.token)) {
      // La demande à laquelle répondait cette écriture est remplacée par
      // l'invalidation (la lecture suivante refait un fetch).
      this.store.delete(`${key}.requested_at`);
      return;
    }
    const now = this.store.now();
    const fetchedAt = options.fetchedAt ?? now;
    const remaining = hardTtlMs - (now - fetchedAt);
    // Une date si ancienne que la fenêtre dure est écoulée ne crée pas d'entrée,
    // et la demande en attente devient sans objet.
    if (remaining > 0) {
      this.store.set(key, { fetchedAt, value }, remaining);
      this.#metrics.writes += 1;
    }
    // La demande a reçu sa réponse. Le marqueur `.refreshing` n'est pas touché :
    // il expire seul.
    this.store.delete(`${key}.requested_at`);
  }

  /** Invalidation dure : la lecture suivante bloque et refait un fetch. */
  delete(key: string): void {
    this.store.delete(key, `${key}.refreshing`, `${key}.requested_at`);
    this.#sequence += 1;
    this.store.set(
      `${key}.invalidated_at`,
      this.#sequence,
      StaleWhileRevalidateCache.INVALIDATION_TTL_MS,
    );
    this.#inflight.delete(key);
  }

  /**
   * Après une mutation : continuer à servir la valeur, mais comme périmée, et
   * retirer le marqueur de coalescence, pour que le `requestRefresh()` qui suit
   * parte vraiment et que le refresher (qui ignore les clés fraîches) reconstruise.
   * Recule `fetchedAt` d'exactement la fenêtre souple, pour rester dans la
   * fenêtre dure. Une clé absente est laissée telle quelle. Ne lève jamais.
   */
  markStale(key: string, softTtlMs: number, hardTtlMs: number): void {
    try {
      const hit = this.read(key, softTtlMs);
      if (hit !== null) {
        this.write(key, hit.value, hardTtlMs, { fetchedAt: this.store.now() - softTtlMs });
      }
      this.store.delete(`${key}.refreshing`);
    } catch (error) {
      this.#logger?.warn({ key, err: error }, 'SWR markStale failed');
    }
  }

  /** Jeton à prendre juste avant un fetch, puis à passer à `write()` (`token`). */
  fetchToken(): number {
    return this.#sequence;
  }

  /**
   * Demande un rafraîchissement en arrière-plan, au plus une fois par fenêtre de
   * coalescence. Ne lève jamais : appelée sur le chemin de la requête, qui doit
   * servir la valeur en cache même si la file est hors service.
   */
  requestRefresh(key: string): void {
    try {
      if (this.store.has(`${key}.refreshing`)) return;
      this.#metrics.refreshRequests += 1;
      this.store.set(`${key}.refreshing`, true, StaleWhileRevalidateCache.MARKER_TTL_MS);
      if (!this.store.has(`${key}.requested_at`)) {
        this.store.set(
          `${key}.requested_at`,
          this.store.now(),
          StaleWhileRevalidateCache.REQUEST_TTL_MS,
        );
      }
      this.#dispatch(key);
    } catch (error) {
      // Sans le marqueur, la demande suivante réessaie au lieu d'attendre 30 s.
      this.store.delete(`${key}.refreshing`);
      this.#logger?.error(
        {
          key,
          exception: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
        'SWR refresh dispatch failed',
      );
    }
  }

  /**
   * Vrai quand un rafraîchissement a été demandé il y a au moins `ms` et n'a
   * jamais reçu de réponse (ni `write()`, ni fetch en ligne non vide).
   */
  refreshIsOverdue(key: string, ms: number): boolean {
    const stamp = this.store.get(`${key}.requested_at`);
    if (typeof stamp !== 'number') return false;
    return this.store.now() - stamp >= ms;
  }

  async #compute(key: string, hardTtlMs: number, fetch: () => Promise<unknown>): Promise<Envelope> {
    const token = this.fetchToken();
    const value = await fetch();
    const envelope = { fetchedAt: this.store.now(), value };
    if (this.#isEmpty(value)) {
      // Un fetch vide ou raté n'est jamais mis en cache : la lecture suivante
      // réessaie (le disjoncteur borne alors le nombre d'appels).
      return envelope;
    }
    // Une invalidation pendant le fetch : répondre quand même à l'appelant,
    // mais ne pas mettre en cache une liste peut-être antérieure à la mutation.
    if (!this.#invalidatedSince(key, token)) this.store.set(key, envelope, hardTtlMs);
    // La demande a reçu une réponse en ligne avec de vraies données.
    this.store.delete(`${key}.requested_at`);
    return envelope;
  }

  #invalidatedSince(key: string, token: number): boolean {
    const stamp = this.store.get(`${key}.invalidated_at`);
    return typeof stamp === 'number' && stamp > token;
  }

  #stateOf(envelope: Envelope, softTtlMs: number): SwrState {
    return this.store.now() - envelope.fetchedAt < softTtlMs ? 'fresh' : 'stale';
  }
}
