// SPDX-License-Identifier: AGPL-3.0-or-later
// Stockage clé → valeur en mémoire, avec durée de vie par entrée et taille
// bornée (éviction de l'entrée la moins récemment lue). Remplace le pool
// `cache.app` (système de fichiers) de l'original : comme lui, rien n'est
// persistant au redémarrage (PLAN §2.7, MEMOIRE D85).
//
// Les marqueurs du cache SWR (`<clé>.refreshing`, `<clé>.requested_at`,
// `<clé>.invalidated_at`) vivent dans le même stockage, sous les mêmes noms que
// dans l'original : les tests portés les inspectent tels quels.

interface Entry {
  value: unknown;
  /** Échéance en ms (horloge du stockage). */
  expiresAt: number;
}

export interface MemoryStoreOptions {
  /** Nombre maximal d'entrées (marqueurs compris). */
  maxEntries?: number;
  now?: () => number;
}

export class MemoryStore {
  static readonly DEFAULT_MAX_ENTRIES = 2_000;

  readonly #entries = new Map<string, Entry>();
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: MemoryStoreOptions = {}) {
    this.#maxEntries = options.maxEntries ?? MemoryStore.DEFAULT_MAX_ENTRIES;
    this.#now = options.now ?? Date.now;
  }

  now(): number {
    return this.#now();
  }

  has(key: string): boolean {
    return this.#live(key) !== undefined;
  }

  get(key: string): unknown {
    const entry = this.#live(key);
    if (entry === undefined) return undefined;
    // Lecture = entrée la plus récente (ordre d'insertion de la `Map`).
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  /** `ttlMs` ≤ 0 : l'entrée n'est pas créée (et une ancienne est supprimée). */
  set(key: string, value: unknown, ttlMs: number): void {
    this.#entries.delete(key);
    if (ttlMs <= 0) return;
    this.#entries.set(key, { value, expiresAt: this.#now() + ttlMs });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) break;
      this.#entries.delete(oldest.value);
    }
  }

  delete(...keys: string[]): void {
    for (const key of keys) this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }

  #live(key: string): Entry | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (this.#now() >= entry.expiresAt) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
