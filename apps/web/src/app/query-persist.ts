// SPDX-License-Identifier: AGPL-3.0-or-later
// Cache persistant de TanStack Query (IndexedDB) : au rechargement, les écrans
// affichent aussitôt les données de la dernière visite, puis TanStack Query les
// rafraîchit (elles sont « périmées » : `staleTime` dépassé).
//
// - Liste blanche des requêtes persistées (`isPersistedQueryKey`) : contenu de
//   consultation seulement. Jamais les journaux, paramètres, profils, ni les
//   flux temps réel (activité, files et clients de téléchargement).
// - Clé de cache (`buster`) : version de Hubarr + utilisateur connecté ; durée
//   maximale 24 h. Un autre utilisateur ou une nouvelle image écarte le cache.
// - Purge (mémoire et IndexedDB) dès que la session se ferme (déconnexion,
//   expiration) ou change d'utilisateur.

import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type PersistedClient,
  type Persister,
} from '@tanstack/query-persist-client-core';
import { useIsFetching, type Query, type QueryClient, type QueryKey } from '@tanstack/vue-query';
import { computed, inject, type ComputedRef, type InjectionKey } from 'vue';

type CoreQueryClient = Parameters<typeof persistQueryClientSave>[0]['queryClient'];

/** Durée maximale du cache persistant (et `gcTime` des requêtes persistées). */
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
/** Délai de regroupement des écritures dans IndexedDB. */
const SAVE_THROTTLE_MS = 1000;
/** Au-delà, l'écran s'affiche sans attendre IndexedDB (navigateur lent ou bloqué). */
const RESTORE_TIMEOUT_MS = 1500;

const IDB_NAME = 'hubarr';
const IDB_STORE = 'query-cache';
const IDB_KEY = 'client';

/** Préfixes dont les requêtes vivent 24 h en mémoire, pour rester persistées. */
export const PERSISTED_PREFIXES: readonly QueryKey[] = [
  ['dashboard'],
  ['discover'],
  ['calendar'],
  ['radarr'],
  ['sonarr'],
];

/** Cartes du tableau de bord persistées (les autres sont en temps réel). */
const DASHBOARD_PARTS = new Set(['page', 'hero', 'trending', 'recent', 'upcoming', 'requests']);
/** Sections d'une fiche film/série persistées (pas les fichiers, historiques…). */
const DETAIL_SECTIONS = new Set(['credits', 'episodes']);

/** Vrai si la requête fait partie du cache persistant (liste blanche). */
export function isPersistedQueryKey(key: QueryKey): boolean {
  const [root, second, third, , fifth] = key;
  switch (root) {
    case 'dashboard':
      return typeof second === 'string' && DASHBOARD_PARTS.has(second);
    case 'discover':
    case 'calendar':
      return true;
    case 'radarr':
    case 'sonarr': {
      // [service, slug, 'library', params] ; [service, slug, 'movie'|'series', id(, section)]
      if (third === 'library') return true;
      const detail = root === 'radarr' ? 'movie' : 'series';
      if (third !== detail) return false;
      return key.length === 4 || (typeof fifth === 'string' && DETAIL_SECTIONS.has(fifth));
    }
    default:
      return false;
  }
}

function shouldPersist(query: Query): boolean {
  return query.state.status === 'success' && isPersistedQueryKey(query.queryKey);
}

/** Clé de cache : version de l'image + utilisateur. */
export function cacheBuster(version: string, userId: number): string {
  return `${version}:${userId}`;
}

/** Stockage IndexedDB d'un client persisté ; sans IndexedDB, rien n'est gardé. */
export function createIdbPersister(
  factory: IDBFactory | null = 'indexedDB' in globalThis ? globalThis.indexedDB : null,
): Persister {
  if (factory === null) {
    const noop = () => undefined;
    return { persistClient: noop, restoreClient: noop, removeClient: noop };
  }
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(IDB_STORE);
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        db = null;
        reject(request.error ?? new Error('indexedDB'));
      };
    }));
  async function run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ) {
    const store = (await open()).transaction(IDB_STORE, mode).objectStore(IDB_STORE);
    return new Promise<T>((resolve, reject) => {
      const request = action(store);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('indexedDB'));
      };
    });
  }
  return {
    persistClient: async (client) => {
      await run('readwrite', (store) => store.put(client, IDB_KEY));
    },
    restoreClient: () =>
      run('readonly', (store) => store.get(IDB_KEY) as IDBRequest<PersistedClient | undefined>),
    removeClient: async () => {
      await run('readwrite', (store) => store.delete(IDB_KEY));
    },
  };
}

export interface QueryPersistence {
  /** Restaure le cache de l'utilisateur, puis enregistre les changements. */
  start(userId: number): Promise<void>;
  /** Arrête l'enregistrement et vide le cache (mémoire et stockage). */
  purge(): Promise<void>;
  /** Moment de la dernière restauration (0 si rien n'a été restauré). */
  restoredAt(): number;
}

export function createQueryPersistence(
  queryClient: QueryClient,
  options: { persister: Persister; version: string; throttleMs?: number; timeoutMs?: number },
): QueryPersistence {
  const { persister, version } = options;
  // Le `QueryClient` de vue-query étend celui du cœur, mais ses signatures
  // acceptent des refs : TypeScript ne les voit plus compatibles. Même objet.
  const coreClient = queryClient as unknown as CoreQueryClient;
  const throttleMs = options.throttleMs ?? SAVE_THROTTLE_MS;
  const timeoutMs = options.timeoutMs ?? RESTORE_TIMEOUT_MS;
  let stopSubscription: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let restoredAt = 0;
  // Incrémenté à chaque purge : une restauration ou une écriture en retard est ignorée.
  let generation = 0;

  for (const prefix of PERSISTED_PREFIXES) {
    queryClient.setQueryDefaults(prefix, { gcTime: QUERY_CACHE_MAX_AGE });
  }

  function stop(): void {
    stopSubscription?.();
    stopSubscription = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function start(userId: number): Promise<void> {
    stop();
    const current = ++generation;
    const buster = cacheBuster(version, userId);
    const restore = persistQueryClientRestore({
      queryClient: coreClient,
      persister,
      buster,
      maxAge: QUERY_CACHE_MAX_AGE,
    }).catch(() => undefined);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([restore, timeout]);
    if (current !== generation) return;
    restoredAt = Date.now();
    // Données restaurées : toujours revalidées à leur prochain affichage, même
    // si elles ont moins de `staleTime` (rechargement juste après une visite).
    void queryClient.invalidateQueries({
      predicate: (query) => query.state.dataUpdatedAt < restoredAt,
      refetchType: 'none',
    });

    const save = () => {
      timer = null;
      if (current !== generation) return;
      void persistQueryClientSave({
        queryClient: coreClient,
        persister,
        buster,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
      }).catch(() => undefined);
    };
    // Seuls les changements des requêtes persistées déclenchent une écriture
    // (les flux temps réel, rafraîchis toutes les secondes, n'en causent pas).
    stopSubscription = queryClient.getQueryCache().subscribe((event) => {
      if (!isPersistedQueryKey(event.query.queryKey as QueryKey)) return;
      if (event.type !== 'added' && event.type !== 'removed' && event.type !== 'updated') return;
      timer ??= setTimeout(save, throttleMs);
    });
  }

  async function purge(): Promise<void> {
    generation++;
    stop();
    restoredAt = 0;
    queryClient.clear();
    await Promise.resolve(persister.removeClient()).catch(() => undefined);
  }

  return { start, purge, restoredAt: () => restoredAt };
}

/** Injection de la persistance (absente dans les tests qui ne la fournissent pas). */
export const QUERY_PERSISTENCE: InjectionKey<QueryPersistence> = Symbol('query-persistence');

/**
 * Vrai pendant que des données restaurées du cache persistant sont
 * rafraîchies : indicateur discret « mise à jour… ».
 */
export function useRestoredRefreshing(): ComputedRef<boolean> {
  const persistence = inject(QUERY_PERSISTENCE, null);
  const count = useIsFetching({
    predicate: (query) => {
      const at = persistence?.restoredAt() ?? 0;
      const updated = query.state.dataUpdatedAt;
      return at > 0 && updated > 0 && updated < at && isPersistedQueryKey(query.queryKey);
    },
  });
  return computed(() => count.value > 0);
}
