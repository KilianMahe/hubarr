// SPDX-License-Identifier: AGPL-3.0-or-later
// Disjoncteur par service et par instance : port de `ServiceHealthCache`.
//
// Un échec de **connexion** marque le service « injoignable » pendant 10 s : les
// appels suivants échouent aussitôt (`circuit_open`) au lieu d'attendre à chaque
// fois le délai de connexion. À l'échéance, l'appel suivant retente une fois ;
// un succès efface la marque. Chaque instance Radarr/Sonarr a sa propre entrée,
// indépendante de l'entrée sans instance.
//
// Différence avec l'original : le processus Node est persistant, ce cache en
// mémoire est donc partagé par toutes les requêtes ; le drapeau « par requête »
// (`$serviceUnavailable`, remis à zéro entre deux requêtes du worker) n'a plus
// d'équivalent ni d'utilité.

export class ServiceHealthCache {
  /** Durée de la marque « injoignable » (`TTL_DOWN` = 10 s dans l'original). */
  static readonly TTL_DOWN_MS = 10_000;

  readonly #downUntil = new Map<string, number>();
  readonly #now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
  }

  isDown(service: string, instance?: string): boolean {
    const key = cacheKey(service, instance);
    const until = this.#downUntil.get(key);
    if (until === undefined) return false;
    if (this.#now() >= until) {
      this.#downUntil.delete(key);
      return false;
    }
    return true;
  }

  markDown(service: string, instance?: string): void {
    this.#downUntil.set(cacheKey(service, instance), this.#now() + ServiceHealthCache.TTL_DOWN_MS);
  }

  clear(service: string, instance?: string): void {
    this.#downUntil.delete(cacheKey(service, instance));
  }

  /** Efface l'entrée du service **et** celles de toutes ses instances. */
  clearService(service: string): void {
    const prefix = `${service}.`;
    for (const key of this.#downUntil.keys()) {
      if (key === service || key.startsWith(prefix)) this.#downUntil.delete(key);
    }
  }

  clearAll(): void {
    this.#downUntil.clear();
  }
}

function cacheKey(service: string, instance: string | undefined): string {
  return instance === undefined ? service : `${service}.${instance}`;
}
