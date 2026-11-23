// SPDX-License-Identifier: AGPL-3.0-or-later
// Filtres de la grille Bazarr (`bazarr/_grid.html.twig`) : recherche dans le
// titre, segment (complet, manquant, non suivi), langue manquante, tri
// (titre, ou plus de manquants d'abord), affichage par fenêtres de 60.

import type { BazarrCard } from '@hubarr/shared';

export type GridSegment = 'all' | BazarrCard['substate'];
export type GridSort = 'title-asc' | 'missing-desc';

export interface GridFilters {
  q: string;
  segment: GridSegment;
  lang: string;
  sort: GridSort;
}

export const GRID_WINDOW = 60;

export function filterCards(cards: readonly BazarrCard[], filters: GridFilters): BazarrCard[] {
  const q = filters.q.trim().toLowerCase();
  const out = cards.filter(
    (card) =>
      (filters.segment === 'all' || card.substate === filters.segment) &&
      (filters.lang === '' || card.missingLangs.includes(filters.lang)) &&
      (q === '' || card.title.toLowerCase().includes(q)),
  );
  return out.sort((a, b) =>
    filters.sort === 'missing-desc'
      ? b.count - a.count || a.title.localeCompare(b.title)
      : a.title.localeCompare(b.title),
  );
}

/** Pas de la relance automatique d'une page en préchauffage (ms), puis bouton manuel. */
export const WARMING_SCHEDULE = [3_000, 5_000, 8_000] as const;
