// SPDX-License-Identifier: AGPL-3.0-or-later
// Critères des listes *arr portés par l'URL (P5c.5, V5, V6) :
// historique et liste de blocage (tri par colonne, recherche par titre),
// cutoff (recherche, profil). Un tri ou un filtre ajoute une entrée à
// l'historique du navigateur ; la recherche, différée de 300 ms, la remplace
// (comme les bibliothèques, D87). Les autres paramètres (`eventType`) sont gardés.

import {
  arrListParams,
  arrListQueryFrom,
  cutoffParams,
  cutoffQueryFrom,
  defaultDirection,
  type ArrListKind,
  type ArrListQuery,
  type ArrListSort,
  type CutoffQuery,
} from '@hubarr/shared';
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';

const SEARCH_DEBOUNCE_MS = 300;

/** Recherche différée liée au critère `q` de l'URL. */
function useDebouncedSearch(
  current: () => string,
  apply: (value: string) => void,
): Ref<string | null> {
  const search = ref<string | null>(current());
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Champ effacé (croix de `clearable`) : `null`.
  const text = (value: string | null) => (value ?? '').trim();
  watch(search, (value) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (text(value) !== current()) apply(text(value));
    }, SEARCH_DEBOUNCE_MS);
  });
  // Navigation (retour arrière, lien) : le champ suit l'URL.
  watch(current, (value) => {
    if (value !== text(search.value)) search.value = value;
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
  });
  return search;
}

function withoutKeys(query: LocationQuery, keys: readonly string[]): LocationQuery {
  return Object.fromEntries(Object.entries(query).filter(([key]) => !keys.includes(key)));
}

const LIST_KEYS = ['page', 'sort', 'dir', 'q'] as const;

export function useArrList(kind: ArrListKind) {
  const route = useRoute();
  const router = useRouter();
  const slug = computed(() => String(route.params.slug ?? ''));
  const query = computed(() => arrListQueryFrom(kind, route.query));
  /** Paramètres de l'API : critères de la liste et filtres propres à la page. */
  const params = computed(() => ({
    ...(Object.fromEntries(
      Object.entries(withoutKeys(route.query, LIST_KEYS)).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value]] : [],
      ),
    ) as Record<string, string>),
    ...arrListParams(query.value),
  }));

  function go(next: Partial<ArrListQuery>, replace = false): void {
    const target = {
      query: {
        ...withoutKeys(route.query, LIST_KEYS),
        ...arrListParams({ ...query.value, ...next }),
      },
    };
    void (replace ? router.replace(target) : router.push(target));
  }

  /** Même colonne : sens inversé ; autre colonne : son sens par défaut. Retour en page 1. */
  function sortBy(sort: ArrListSort): void {
    const dir =
      query.value.sort === sort
        ? query.value.dir === 'asc'
          ? 'desc'
          : 'asc'
        : defaultDirection(sort);
    go({ sort, dir, page: 1 });
  }
  const setPage = (page: number) => {
    go({ page });
  };
  const search = useDebouncedSearch(
    () => query.value.q,
    (q) => {
      go({ q, page: 1 }, true);
    },
  );
  return { route, router, slug, query, params, sortBy, setPage, search };
}

const CUTOFF_KEYS = ['page', 'q', 'profile'] as const;

export function useCutoffList() {
  const route = useRoute();
  const router = useRouter();
  const slug = computed(() => String(route.params.slug ?? ''));
  const query = computed(() => cutoffQueryFrom(route.query));
  const params = computed(() => cutoffParams(query.value));

  function go(next: Partial<CutoffQuery>, replace = false): void {
    const target = {
      query: {
        ...withoutKeys(route.query, CUTOFF_KEYS),
        ...cutoffParams({ ...query.value, ...next }),
      },
    };
    void (replace ? router.replace(target) : router.push(target));
  }
  const setPage = (page: number) => {
    go({ page });
  };
  const setProfile = (profile: number | null) => {
    go({ profile: profile ?? 0, page: 1 });
  };
  const search = useDebouncedSearch(
    () => query.value.q,
    (q) => {
      go({ q, page: 1 }, true);
    },
  );
  return { slug, query, params, setPage, setProfile, search };
}
