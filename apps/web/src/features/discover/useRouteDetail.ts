// SPDX-License-Identifier: AGPL-3.0-or-later
// Fiche ouverte pilotée par l'URL (`?detail=movie/603`, comme l'original) :
// un lien vers une fiche se partage, « retour » la referme.

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { parseDetail, type DetailTarget } from './discover-api';

export function useRouteDetail() {
  const route = useRoute();
  const router = useRouter();
  return computed<DetailTarget | null>({
    get: () => parseDetail(route.query.detail),
    set: (value) => {
      const query = { ...route.query };
      if (value === null) delete query.detail;
      else query.detail = `${value.type}/${value.id}`;
      void (value === null ? router.replace({ query }) : router.push({ query }));
    },
  });
}
