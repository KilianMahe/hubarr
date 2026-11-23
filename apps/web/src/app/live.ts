// SPDX-License-Identifier: AGPL-3.0-or-later
// Client du flux temps réel `GET /api/events` (P5.2) : une seule
// connexion `EventSource` par onglet, multiplexée sur les sujets demandés par
// les écrans affichés (rouverte, après un court délai, quand la liste change).
//
// Un écran déclare son sujet avec `useLiveQuery` : tant que le flux est
// ouvert et que le serveur a accepté le sujet, la requête TanStack ne fait plus
// de polling et reçoit les mises à jour poussées (valeur posée dans le cache,
// ou invalidation qui relit l'API, servie par la lecture partagée du serveur).
// Si le flux tombe (erreur, serveur arrêté, proxy qui coupe), les requêtes
// repassent aussitôt en polling et sont relues sur-le-champ : le repli prend
// moins de 5 s (critère de P5). La reconnexion est retentée en arrière-plan
// (3 s, puis doublée jusqu'à 60 s). Sans `EventSource` (tests, vieux
// navigateurs), tout reste en polling.

import { useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { appUrl } from './base-path';
import {
  computed,
  onBeforeUnmount,
  reactive,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue';

type Handler = (data: unknown) => void;

export const RECONNECT_MIN_MS = 3_000;
export const RECONNECT_MAX_MS = 60_000;
const DEBOUNCE_MS = 150;

interface LiveState {
  connected: boolean;
  accepted: string[];
}

export class LiveClient {
  readonly state = reactive<LiveState>({ connected: false, accepted: [] });
  readonly #handlers = new Map<string, Set<Handler>>();
  readonly #lost = new Set<() => void>();
  #source: EventSource | null = null;
  #topicsKey = '';
  #debounce: ReturnType<typeof setTimeout> | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #delay = RECONNECT_MIN_MS;

  constructor(
    private readonly factory: ((url: string) => EventSource) | null = typeof EventSource ===
    'undefined'
      ? null
      : (url) => new EventSource(appUrl(url)),
  ) {}

  /** Abonne un écran à un sujet ; renvoie la fonction de désabonnement. */
  subscribe(topic: string, handler: Handler): () => void {
    let handlers = this.#handlers.get(topic);
    if (handlers === undefined) {
      handlers = new Set();
      this.#handlers.set(topic, handlers);
    }
    handlers.add(handler);
    this.#schedule();
    return () => {
      const current = this.#handlers.get(topic);
      current?.delete(handler);
      if (current?.size === 0) this.#handlers.delete(topic);
      this.#schedule();
    };
  }

  /** Appelé quand le flux tombe (les requêtes repassent en polling). */
  onLost(callback: () => void): () => void {
    this.#lost.add(callback);
    return () => this.#lost.delete(callback);
  }

  /** Sujet servi par le flux (ouvert et accepté par le serveur). */
  isLive(topic: string): boolean {
    return this.state.connected && this.state.accepted.includes(topic);
  }

  close(): void {
    clearTimeout(this.#debounce);
    clearTimeout(this.#retry);
    this.#source?.close();
    this.#source = null;
    this.#topicsKey = '';
    this.state.connected = false;
    this.state.accepted = [];
  }

  #schedule(): void {
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => {
      this.#sync();
    }, DEBOUNCE_MS);
  }

  #sync(): void {
    const topics = [...this.#handlers.keys()].sort();
    const key = topics.join(',');
    if (key === this.#topicsKey && this.#source !== null) return;
    this.#source?.close();
    this.#source = null;
    this.#topicsKey = key;
    clearTimeout(this.#retry);
    if (topics.length === 0 || this.factory === null) {
      this.#setConnected(false, []);
      return;
    }
    const source = this.factory(`/api/events?topics=${encodeURIComponent(key)}`);
    this.#source = source;
    source.addEventListener('ready', (event) => {
      const ready = parse((event as MessageEvent<string>).data) as { accepted?: string[] } | null;
      this.#delay = RECONNECT_MIN_MS;
      this.#setConnected(true, ready?.accepted ?? []);
    });
    source.onmessage = (event: MessageEvent<string>) => {
      const message = parse(event.data) as { topic?: string; data?: unknown } | null;
      if (typeof message?.topic !== 'string') return;
      for (const handler of [...(this.#handlers.get(message.topic) ?? [])]) handler(message.data);
    };
    source.onerror = () => {
      if (this.#source !== source) return;
      source.close();
      this.#source = null;
      this.#setConnected(false, []);
      this.#retry = setTimeout(() => {
        this.#topicsKey = '';
        this.#sync();
      }, this.#delay);
      this.#delay = Math.min(this.#delay * 2, RECONNECT_MAX_MS);
    };
  }

  #setConnected(connected: boolean, accepted: string[]): void {
    const wasConnected = this.state.connected;
    this.state.connected = connected;
    this.state.accepted = accepted;
    if (wasConnected && !connected) for (const callback of [...this.#lost]) callback();
  }
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Client partagé par l'onglet. */
export const live = new LiveClient();

export interface LiveQueryOptions {
  /** Sujet (`null` : aucun, la requête reste en polling). */
  topic: MaybeRefOrGetter<string | null>;
  /** Requête mise à jour par le sujet. */
  queryKey: MaybeRefOrGetter<QueryKey>;
  /** `set` : la donnée poussée devient la valeur ; `invalidate` : relecture de l'API. */
  mode?: 'set' | 'invalidate';
  /** Intervalle de polling hors flux. */
  fallbackMs: number;
  /** Transformation de la donnée poussée avant de la poser (`set`). */
  map?: (data: unknown) => unknown;
  /** Traitement supplémentaire de chaque donnée poussée. */
  onData?: (data: unknown) => void;
}

/**
 * Abonne la requête au sujet et renvoie son intervalle de polling : `false`
 * tant que le flux sert le sujet, `fallbackMs` sinon.
 */
export function useLiveQuery(
  options: LiveQueryOptions,
  client: LiveClient = live,
): ComputedRef<number | false> {
  const queryClient = useQueryClient();
  let stop: (() => void) | null = null;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: toValue(options.queryKey) });
  watch(
    () => toValue(options.topic),
    (topic) => {
      stop?.();
      stop = null;
      if (topic === null) return;
      stop = client.subscribe(topic, (data) => {
        options.onData?.(data);
        if ((options.mode ?? 'invalidate') === 'set') {
          queryClient.setQueryData(
            toValue(options.queryKey),
            options.map ? options.map(data) : data,
          );
        } else refresh();
      });
    },
    { immediate: true },
  );
  // Repli : relecture immédiate, sans attendre le premier tick du polling.
  const stopLost = client.onLost(refresh);
  onBeforeUnmount(() => {
    stop?.();
    stopLost();
  });
  return computed(() => {
    const topic = toValue(options.topic);
    return topic !== null && client.isLive(topic) ? false : options.fallbackMs;
  });
}

/**
 * Abonne un ensemble variable de sujets (une carte par client sur la page
 * Téléchargements) ; `onData` reçoit le sujet et la donnée, `onLost` est
 * appelé quand le flux tombe.
 */
export function useLiveTopics(
  topics: MaybeRefOrGetter<string[]>,
  onData: (topic: string, data: unknown) => void,
  onLost: () => void,
  client: LiveClient = live,
): void {
  const stops = new Map<string, () => void>();
  watch(
    () => toValue(topics),
    (next) => {
      for (const [topic, stop] of stops) {
        if (!next.includes(topic)) {
          stop();
          stops.delete(topic);
        }
      }
      for (const topic of next) {
        if (!stops.has(topic))
          stops.set(
            topic,
            client.subscribe(topic, (data) => {
              onData(topic, data);
            }),
          );
      }
    },
    { immediate: true },
  );
  const stopLost = client.onLost(onLost);
  onBeforeUnmount(() => {
    for (const stop of stops.values()) stop();
    stops.clear();
    stopLost();
  });
}
