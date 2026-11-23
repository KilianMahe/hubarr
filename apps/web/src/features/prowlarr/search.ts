// SPDX-License-Identifier: AGPL-3.0-or-later
// Tri des résultats de la recherche Prowlarr (P3c.2) : sans clé, l'ordre de
// Prowlarr est gardé ; seeds absentes en dernier.

import type { ProwlarrRelease } from '@hubarr/shared';

export interface ReleaseSort {
  key: 'title' | 'indexer' | 'size' | 'seeders' | 'age' | null;
  ascending: boolean;
}

export function sortReleases(
  releases: readonly ProwlarrRelease[],
  sort: ReleaseSort,
): ProwlarrRelease[] {
  const { key } = sort;
  if (key === null) return [...releases];
  const direction = sort.ascending ? 1 : -1;
  return [...releases].sort((a, b) => {
    if (key === 'title' || key === 'indexer') return a[key].localeCompare(b[key]) * direction;
    if (key === 'seeders') {
      if (a.seeders === null || b.seeders === null) {
        return a.seeders === b.seeders ? 0 : a.seeders === null ? 1 : -1;
      }
      return (a.seeders - b.seeders) * direction;
    }
    return (a[key] - b[key]) * direction;
  });
}
