// SPDX-License-Identifier: AGPL-3.0-or-later
// Page et filtre d'une liste paginée portés par l'URL (`?page=`, `?eventType=`),
// comme les liens de pagination de l'original.

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useRoutePage() {
  const route = useRoute();
  const router = useRouter();
  const slug = computed(() => String(route.params.slug ?? ''));
  const page = computed(() => {
    const value = Number.parseInt(String(route.query.page ?? ''), 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  function setPage(next: number): void {
    const query = { ...route.query };
    if (next <= 1) delete query.page;
    else query.page = String(next);
    void router.push({ query });
  }
  return { route, router, slug, page, setPage };
}
