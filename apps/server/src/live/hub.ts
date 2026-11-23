// SPDX-License-Identifier: AGPL-3.0-or-later
// Temps réel (P5.1) : lectures upstream partagées et pollers par
// sujet, communs à tous les onglets et à tous les utilisateurs.
//
// - `shared(key, ttl, load)` : une lecture upstream (liste des torrents, file
//   d'attente, activité) est servie depuis la dernière réponse tant qu'elle a
//   moins de `ttl` ms, et deux lectures simultanées partagent le même appel.
//   Cinq onglets qui relisent la page qBittorrent toutes les 3 s ne
//   déclenchent donc qu'un appel au client par fenêtre.
// - `subscribe(topic, listener)` : un poller par sujet ne tourne que tant
//   qu'au moins un abonné (flux SSE) existe ; il relit le sujet à son
//   intervalle (sans chevauchement), diffuse le résultat à tous les abonnés
//   et alimente la lecture partagée du même nom. Un échec double l'intervalle
//   jusqu'à 2 min (le client n'est pas sollicité en boucle) ; un succès le
//   rétablit.
// - Compteurs (lectures servies du cache, appels upstream, relectures des
//   pollers, abonnés) exposés par `stats()` et journalisés en mode debug
//   (P5.3).

export interface TopicSpec {
  /** Nom du sujet (`downloads.qbittorrent`, `queue.radarr.films`…). */
  name: string;
  intervalMs: number;
  /** Charge la donnée diffusée (passe par `shared` pour profiter du cache). */
  load: () => Promise<unknown>;
}

export type TopicListener = (data: unknown) => void;

interface Topic {
  spec: TopicSpec;
  listeners: Set<TopicListener>;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  failures: number;
  last: { at: number; data: unknown } | null;
  polls: number;
}

interface Entry {
  at: number;
  value: unknown;
}

export interface LiveStats {
  sharedHits: number;
  sharedLoads: number;
  topics: { name: string; subscribers: number; polls: number; failures: number }[];
}

export const MAX_BACKOFF_MS = 120_000;

export interface LiveHubOptions {
  now?: () => number;
  /** Planification (remplaçable dans les tests). */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  logger?: { warn(obj: object, msg: string): void; debug(obj: object, msg: string): void };
}

export class LiveHub {
  readonly #now: () => number;
  readonly #setTimer: NonNullable<LiveHubOptions['setTimer']>;
  readonly #clearTimer: NonNullable<LiveHubOptions['clearTimer']>;
  readonly #logger: LiveHubOptions['logger'];
  readonly #entries = new Map<string, Entry>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #topics = new Map<string, Topic>();
  #sharedHits = 0;
  #sharedLoads = 0;
  #closed = false;

  constructor(options: LiveHubOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.#clearTimer =
      options.clearTimer ??
      ((timer) => {
        clearTimeout(timer);
      });
    this.#logger = options.logger;
  }

  /** Lecture partagée : la dernière réponse de moins de `ttlMs`, sinon un appel (en vol unique). */
  async shared<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const entry = this.#entries.get(key);
    if (entry !== undefined && this.#now() - entry.at < ttlMs) {
      this.#sharedHits += 1;
      return entry.value as T;
    }
    const running = this.#inflight.get(key);
    if (running !== undefined) {
      this.#sharedHits += 1;
      return running as Promise<T>;
    }
    this.#sharedLoads += 1;
    const promise = load()
      .then((value) => {
        this.#entries.set(key, { at: this.#now(), value });
        return value;
      })
      .finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, promise);
    return promise;
  }

  /** Après une mutation : la lecture suivante refait l'appel. */
  invalidate(key: string): void {
    this.#entries.delete(key);
    this.#inflight.delete(key);
  }

  /** Après une modification des paramètres ou des instances : tout est relu. */
  invalidateAll(): void {
    this.#entries.clear();
    this.#inflight.clear();
  }

  /** Abonne un écouteur ; le poller du sujet démarre au premier, s'arrête au dernier. */
  subscribe(spec: TopicSpec, listener: TopicListener): () => void {
    let topic = this.#topics.get(spec.name);
    if (topic === undefined) {
      topic = {
        spec,
        listeners: new Set(),
        timer: null,
        running: false,
        failures: 0,
        last: null,
        polls: 0,
      };
      this.#topics.set(spec.name, topic);
    }
    topic.listeners.add(listener);
    // Un nouvel abonné reçoit aussitôt la dernière valeur encore récente.
    if (topic.last !== null && this.#now() - topic.last.at < topic.spec.intervalMs * 2) {
      listener(topic.last.data);
    }
    if (topic.listeners.size === 1 && !topic.running && topic.timer === null)
      void this.#poll(topic);
    const current = topic;
    return () => {
      current.listeners.delete(listener);
      if (current.listeners.size === 0) this.#stop(current);
    };
  }

  subscribers(name: string): number {
    return this.#topics.get(name)?.listeners.size ?? 0;
  }

  stats(): LiveStats {
    return {
      sharedHits: this.#sharedHits,
      sharedLoads: this.#sharedLoads,
      topics: [...this.#topics.values()].map((t) => ({
        name: t.spec.name,
        subscribers: t.listeners.size,
        polls: t.polls,
        failures: t.failures,
      })),
    };
  }

  close(): void {
    this.#closed = true;
    for (const topic of this.#topics.values()) {
      topic.listeners.clear();
      this.#stop(topic);
    }
    this.#topics.clear();
  }

  /** Sujet encore à relire (méthode : l'état change pendant un `await`). */
  #active(topic: Topic): boolean {
    return !this.#closed && topic.listeners.size > 0;
  }

  #stop(topic: Topic): void {
    if (topic.timer !== null) this.#clearTimer(topic.timer);
    topic.timer = null;
  }

  async #poll(topic: Topic): Promise<void> {
    topic.timer = null;
    if (this.#closed || topic.listeners.size === 0) return;
    topic.running = true;
    try {
      const data = await topic.spec.load();
      topic.polls += 1;
      topic.failures = 0;
      topic.last = { at: this.#now(), data };
      for (const listener of [...topic.listeners]) {
        try {
          listener(data);
        } catch (error) {
          this.#logger?.warn(
            { err: error, topic: topic.spec.name },
            'temps réel : abonné en échec',
          );
        }
      }
    } catch (error) {
      topic.failures += 1;
      this.#logger?.debug(
        { err: error, topic: topic.spec.name },
        'temps réel : relecture en échec',
      );
    } finally {
      topic.running = false;
    }
    if (!this.#active(topic)) return;
    const delay =
      topic.failures === 0
        ? topic.spec.intervalMs
        : Math.min(topic.spec.intervalMs * 2 ** topic.failures, MAX_BACKOFF_MS);
    topic.timer = this.#setTimer(() => void this.#poll(topic), delay);
  }
}
